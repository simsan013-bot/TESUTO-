// ============================================================
// メニュー登録
// ============================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu('🎨 画像生成')
    .addItem('▶ 画像を生成する', 'generateImages')
    .addItem('🔤 英語プロンプトだけ変換する', 'translatePromptsOnly')
    .addSeparator()
    .addItem('📝 共通プロンプトを編集する', 'openCommonPromptSheet')
    .addItem('🖼️ 参照画像を管理する', 'openRefImageSheet')
    .addSeparator()
    .addItem('📁 保存先フォルダを変更する', 'changeSaveFolder')
    .addSeparator()
    .addItem('☑️ アニメ選択列を初期化', 'initAnimCheckboxes')
    .addItem('🎬 選択画像をアニメーション化', 'animateSelectedImages')
    .addSeparator()
    .addItem('🔧 シート初期設定（ヘッダー再作成）', 'initializeSheets')
    .addItem('▶ 自動生成スタート（J列キュー）', 'startAutoGenerate')
    .addItem('■ 自動生成を停止する', 'stopAutoGenerate');

  // オーナーのみ「設定を確認する」を表示
  try {
    var email = Session.getEffectiveUser().getEmail();
    var owner = SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
    if (email === owner) {
      menu.addSeparator().addItem('⚙️ 設定を確認する（オーナー用）', 'checkSettings');
    }
  } catch (e) { /* 権限エラーは無視 */ }

  menu.addToUi();
}

function openCommonPromptSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateCommonPromptSheet(ss);
  ss.setActiveSheet(sheet);
  SpreadsheetApp.getUi().alert(
    '共通プロンプトシートを開きました',
    '【A列（2行目以降）】全画像に共通して付加するスタイル・雰囲気を入力\n'
    + '　例①：かわいいゆるいイラスト風、パステルカラー\n'
    + '　例②：[[植物キャラ]] を必ずキャラクターとして使用する\n\n'
    + '【[[ラベル名]] の使い方】\n'
    + '　A列に [[ラベル名]] を書くと、参照画像シートの画像が全行に自動添付されます\n\n'
    + '💡 B列英語プロンプト上書き行には共通プロンプトは付加されません。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function openRefImageSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateRefImageSheet(ss);
  ss.setActiveSheet(sheet);
  SpreadsheetApp.getUi().alert(
    '参照画像シートを開きました',
    '【シートの使い方】\n'
    + 'A列：ラベル名（例：植物キャラ、バナナキャラ）\n'
    + 'B列：Google Drive の共有URL\n'
    + 'C列：用途メモ（任意）\n\n'
    + '【プロンプトでの指定方法】\n'
    + 'プロンプトの中で [[ラベル名]] と書くと、\n'
    + 'そのラベルの画像を自動的にAPIに送って生成します。\n\n'
    + '【例：参照モード（キャラを参考に新しい画像を作る）】\n'
    + '[[植物キャラ]] を参考に、驚いている表情のイラストを描いて\n\n'
    + '【例：修正モード（既存の画像を変える）】\n'
    + '[[完成画像]] の背景を夜空に変えて、星を追加して\n\n'
    + '【例：複数画像を同時に参照する】\n'
    + '[[植物キャラ]] と [[バナナキャラ]] が会話しているイラストを描いて\n'
    + '→ 2枚の画像が順番にAPIに送られ、補足説明が自動付加されます\n\n'
    + '💡 参照画像はDriveで「リンクを知っている人が閲覧可」に設定してください。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ============================================================
// 設定確認
// ============================================================
function checkSettings() {
  // オーナー以外はアクセス不可
  try {
    var email = Session.getEffectiveUser().getEmail();
    var owner = SpreadsheetApp.getActiveSpreadsheet().getOwner().getEmail();
    if (email !== owner) {
      SpreadsheetApp.getUi().alert('この機能はオーナーのみ使用できます。');
      return;
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('権限の確認に失敗しました。');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  var folderId = props.getProperty('DRIVE_FOLDER_ID');
  var common = getCommonPrompt(ss);
  var refSheet = ss.getSheetByName(SHEET.REF);
  var refCount = refSheet ? Math.max(0, refSheet.getLastRow() - 1) : 0;

  SpreadsheetApp.getUi().alert(
    '現在の設定（オーナー用）',
    '【スクリプトプロパティ】\n'
    + 'GEMINI_API_KEY  : ' + (apiKey ? '✅ 設定済み（末尾: …' + apiKey.slice(-4) + '）' : '❌ 未設定') + '\n'
    + 'DRIVE_FOLDER_ID : ' + (folderId ? '✅ 設定済み' : '❌ 未設定') + '\n\n'
    + '【共通プロンプト】\n'
    + (common ? '✅ 設定あり：\n' + common.substring(0, 80) + (common.length > 80 ? '…' : '') : '—（未設定）')
    + '\n\n【参照画像登録件数】' + refCount + ' 件\n\n'
    + '【生成設定】\n'
    + '画像モデル：' + CONFIG.MODEL + '　サイズ：' + CONFIG.IMAGE_SIZE + '\n'
    + '動画モデル：' + ANIM_CONFIG.MODEL + '　' + ANIM_CONFIG.VIDEO_SECONDS + '秒 / ' + ANIM_CONFIG.ASPECT_RATIO,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ============================================================
// 保存先フォルダを変更する（編集者も使用可）
// ============================================================
function changeSaveFolder() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var currentId = props.getProperty('DRIVE_FOLDER_ID');
  var currentInfo = '未設定';
  if (currentId) {
    try {
      var name = DriveApp.getFolderById(currentId).getName();
      currentInfo = '「' + name + '」（設定済み）';
    } catch (e) {
      currentInfo = '設定済み（フォルダ名取得失敗）';
    }
  }

  var step1 = ui.alert(
    '📁 保存先フォルダを変更',
    '現在の保存先：' + currentInfo + '\n\n'
    + '【変更手順】\n'
    + '① Google Drive で保存先にしたいフォルダを開く\n'
    + '② URLから フォルダID をコピーする\n\n'
    + '例）https://drive.google.com/drive/folders/【ここがID】\n\n'
    + '「はい」を押すとID入力画面に進みます。',
    ui.ButtonSet.YES_NO
  );
  if (step1 !== ui.Button.YES) return;

  var result = ui.prompt(
    '📁 フォルダIDを入力',
    'Google Drive のフォルダIDを貼り付けてください：',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;

  var newId = result.getResponseText().trim();
  if (!newId) { ui.alert('IDが入力されていません。'); return; }

  var folderName;
  try {
    folderName = DriveApp.getFolderById(newId).getName();
  } catch (e) {
    ui.alert('❌ エラー',
      'フォルダが見つかりませんでした。\n\n'
      + '・IDが正しいか確認してください\n'
      + '・フォルダの閲覧権限があるか確認してください',
      ui.ButtonSet.OK);
    return;
  }

  props.setProperty('DRIVE_FOLDER_ID', newId);
  ui.alert('✅ 変更完了',
    '保存先を「' + folderName + '」に変更しました。\n\n'
    + '以降の生成ファイルはこのフォルダに保存されます。',
    ui.ButtonSet.OK);
}
