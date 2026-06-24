// ============================================================
// Web API エントリーポイント（新規追加）
//
// このAppは元はコンテナバインド（特定スプレッドシートに紐付く）の
// メニュー操作専用ツールだった。producerからHTTP POSTで呼べるように
// するため、同じスクリプトにdoPost/doGetを追加した。
// メニュー実行時と同じ「アクティブなスプレッドシート」
// （= このスクリプトが紐付くスプレッドシート）を参照するため、
// 生成ロジック・プロンプト・モデルIDは一切変更していない。
//
// 【doPostの入力】
//   {
//     mode: 'generate',
//     rows: ['プロンプト1', 'プロンプト2', ...],  // PRP生成Appのrows出力をそのまま渡せる
//     folderId: 'Drive保存先フォルダID（省略時はDRIVE_FOLDER_IDスクリプトプロパティ）'
//   }
//
// 【doPostの出力】
//   {
//     ok: true,
//     results: [
//       { promptJa, ok, imageUrl, driveUrl, missing, refLabels },
//       ...
//     ]
//   }
// ============================================================
function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var mode = body.mode;

  if (mode === 'generate') {
    return jsonResponse_(generateImagesForApi_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "generate" を指定してください。' });
}

function doGet(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
// rows配列（プロンプト文字列の配列）を1件ずつ画像生成する。
// メニュー実行（generateImages/runNextRow）が使う共通本体（generateOneImage_）を
// そのまま呼ぶため、生成ロジックはメニュー実行と完全に同一。
// シート上の行とは結び付かない呼び出しのため sheet/row は渡さない
// （ステータス列への書き込みはスキップされ、生成履歴シートへの記録のみ行われる）。
// ============================================================
function generateImagesForApi_(body) {
  var rows = body.rows;
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'rows が空です。' };
  }

  var apiKey = getApiKey_();
  var folderId = body.folderId || getDriveFolderId_();
  var folder = DriveApp.getFolderById(folderId);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = getOrCreateHistorySheet(ss);
  var commonPrompt = getCommonPrompt(ss);
  var hasCommon = commonPrompt.length > 0;

  var results = [];
  for (var i = 0; i < rows.length; i++) {
    var promptJa = rows[i].toString().trim();
    if (!promptJa) continue;

    var progress = (i + 1) + ' / ' + rows.length;
    var result = generateOneImage_(ss, null, historySheet, folder, apiKey, null, promptJa, null, commonPrompt, hasCommon, progress);
    results.push({
      promptJa: promptJa,
      ok: result.ok,
      imageUrl: result.imageUrl || null,
      driveUrl: result.driveUrl || null,
      error: result.error || null,
      missing: result.missing,
      refLabels: result.refLabels
    });

    if (i < rows.length - 1) Utilities.sleep(CONFIG.SLEEP_MS);
  }

  return { ok: true, results: results };
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
