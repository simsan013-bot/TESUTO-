// NGログシート: チェッカーNG発生時の判定理由・修正指示・結果を記録する。
// 自動化キューシートとは別タブで管理し、チャンネルIDで絞り込めるようA列の隣に置く。
// STEP4（チェッカー①〜⑦）の実装時に appendNgLogEntry() を呼び出す想定。

var NG_LOG_SHEET_NAME = 'NGログ';

var NG_LOG_HEADERS = ['作品No', 'チャンネルID', 'チェッカー名', '試行回数', 'NG判定理由', '修正指示', '再生成後の結果', 'タイムスタンプ'];

function setupNgLogSheet() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(NG_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NG_LOG_SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, NG_LOG_HEADERS.length).setValues([NG_LOG_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getNgLogSheet_() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(NG_LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('NGログシートが見つかりません。setupNgLogSheet() を先に実行してください。');
  }
  return sheet;
}

function appendNgLogEntry(workId, channelId, checkerName, attemptNumber, reason, fixInstruction, result) {
  var sheet = getNgLogSheet_();
  sheet.appendRow([
    workId,
    channelId,
    checkerName,
    attemptNumber,
    safeCellValue_(reason),
    safeCellValue_(fixInstruction),
    result,
    nowTimestamp_()
  ]);
}
