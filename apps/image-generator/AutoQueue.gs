// ============================================================
// 自動生成キュー機能
// J列にプロンプトを一括貼り付け → 1行ずつ自動生成
// ============================================================

// ============================================================
// ▶ 自動生成スタート
// ============================================================
function startAutoGenerate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);
  var ui = SpreadsheetApp.getUi();

  var lastRow = sheet.getLastRow();
  var firstRow = -1;
  for (var r = 2; r <= lastRow; r++) {
    var val = sheet.getRange(r, QUEUE_COL).getValue().toString().trim();
    if (val) { firstRow = r; break; }
  }
  if (firstRow === -1) {
    ui.alert('❌ J列にプロンプトがありません。\n先にJ列へプロンプトを貼り付けてください。');
    return;
  }

  var count = 0;
  for (var r2 = 2; r2 <= lastRow; r2++) {
    if (sheet.getRange(r2, QUEUE_COL).getValue().toString().trim()) count++;
  }

  var confirm = ui.alert(
    '▶ 自動生成スタート',
    'J列に ' + count + ' 件のプロンプトが見つかりました。\n\n'
    + '・1行ずつ順番に画像を生成します\n'
    + '・1分間隔で自動実行されます\n'
    + '・途中で止める場合は「■ 停止」を押してください\n\n'
    + '開始しますか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  deleteAllTriggers_();

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_CURRENT_IDX, String(firstRow));
  props.setProperty(PROP_RUNNING, 'true');

  for (var r3 = 2; r3 <= lastRow; r3++) {
    var val3 = sheet.getRange(r3, QUEUE_COL).getValue().toString().trim();
    if (val3 && sheet.getRange(r3, COL.DATE).getValue() === '') {
      sheet.getRange(r3, COL.STATUS).setValue('⏳ キュー待機中');
    }
  }
  SpreadsheetApp.flush();

  ui.alert('✅ 自動生成を開始しました。\nバックグラウンドで順番に処理されます。');

  runNextRow();
}

// ============================================================
// 1行ずつ処理（トリガーから呼ばれる）
// ============================================================
function runNextRow() {
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty(PROP_RUNNING) !== 'true') {
    deleteAllTriggers_();
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);

  var currentIndex = parseInt(props.getProperty(PROP_CURRENT_IDX) || '2', 10);
  var lastRow = sheet.getLastRow();

  var targetRow = -1;
  for (var r = currentIndex; r <= lastRow; r++) {
    var jVal = sheet.getRange(r, QUEUE_COL).getValue().toString().trim();
    var eVal = sheet.getRange(r, COL.DATE).getValue();
    if (jVal && eVal === '') { targetRow = r; break; }
  }

  if (targetRow === -1) {
    finishAutoGenerate_(sheet);
    return;
  }

  var prompt = sheet.getRange(targetRow, QUEUE_COL).getValue().toString().trim();
  sheet.getRange(targetRow, COL.PROMPT_JA).setValue(prompt);
  sheet.getRange(targetRow, COL.STATUS).setValue('🔄 処理中...');
  SpreadsheetApp.flush();

  props.setProperty(PROP_CURRENT_IDX, String(targetRow + 1));

  var apiKey = props.getProperty('GEMINI_API_KEY');
  var folderId = props.getProperty('DRIVE_FOLDER_ID');

  if (!apiKey || !folderId) {
    sheet.getRange(targetRow, COL.STATUS).setValue('❌ APIキーまたはフォルダIDが未設定');
    finishAutoGenerate_(sheet);
    return;
  }

  var folder = DriveApp.getFolderById(folderId);
  var historySheet = getOrCreateHistorySheet(ss);
  var commonPrompt = getCommonPrompt(ss);
  var hasCommon = commonPrompt.length > 0;

  generateOneImage_(ss, sheet, historySheet, folder, apiKey, targetRow, prompt, null, commonPrompt, hasCommon, '自動生成');

  SpreadsheetApp.flush();

  var hasNext = false;
  var nextIndex = parseInt(props.getProperty(PROP_CURRENT_IDX), 10);
  for (var r2 = nextIndex; r2 <= lastRow; r2++) {
    var jVal2 = sheet.getRange(r2, QUEUE_COL).getValue().toString().trim();
    var eVal2 = sheet.getRange(r2, COL.DATE).getValue();
    if (jVal2 && eVal2 === '') { hasNext = true; break; }
  }

  if (!hasNext) {
    finishAutoGenerate_(sheet);
  } else {
    deleteAllTriggers_();
    ScriptApp.newTrigger(TRIGGER_FUNC_NAME)
      .timeBased()
      .after(60 * 1000)
      .create();
  }
}

// ============================================================
// ■ 停止
// ============================================================
function stopAutoGenerate() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '■ 自動生成を停止',
    '自動生成を停止しますか？\n\n※ 現在処理中の1枚は完了します。',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  deleteAllTriggers_();

  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_CURRENT_IDX);
  props.setProperty(PROP_RUNNING, 'false');

  var sheet = getOrCreateMainSheet(SpreadsheetApp.getActiveSpreadsheet());
  var lastRow = sheet.getLastRow();
  for (var r = 2; r <= lastRow; r++) {
    var status = sheet.getRange(r, COL.STATUS).getValue().toString();
    if (status === '⏳ キュー待機中') {
      sheet.getRange(r, COL.STATUS).setValue('⏸️ 停止（未処理）');
    }
  }
  SpreadsheetApp.flush();

  ui.alert('⏹️ 自動生成を停止しました。');
}

// ============================================================
// 完了処理
// ============================================================
function finishAutoGenerate_(sheet) {
  deleteAllTriggers_();

  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_CURRENT_IDX);
  props.setProperty(PROP_RUNNING, 'false');

  console.log('✅ 自動生成キュー 全件完了');
}

// ============================================================
// 全トリガー削除（runNextRow のみ対象）
// ============================================================
function deleteAllTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === TRIGGER_FUNC_NAME) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
