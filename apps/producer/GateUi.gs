// Sim確認ゲート（A/B/C/最終確認）の確認用画面。
// producerのWebApp URLに ?view=gate を付けて開くと表示される（doGet参照）。

function listGateWaitingItems() {
  var sheet = getQueueSheet_();
  var map = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[map['全体ステータス'] - 1] === QUEUE_STATUS.GATE_WAIT) {
      result.push({
        workId: row[map['作品No'] - 1],
        title: row[map['タイトル'] - 1],
        channelId: row[map['チャンネルID'] - 1],
        currentProcess: row[map['現在の工程'] - 1],
        gate: row[map['現在のゲート'] - 1]
      });
    }
  }
  return result;
}

// 指定の作品Noに紐づくNGログを最新から指定件数だけ返す（ゲートUIでの確認用）。
function getRecentNgLogForWorkId(workId, limit) {
  var sheet = getNgLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, NG_LOG_HEADERS.length).getValues();
  var matched = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(workId)) {
      matched.push({
        checkerName: data[i][2],
        attempt: data[i][3],
        reason: data[i][4],
        fixInstruction: data[i][5],
        result: data[i][6],
        timestamp: data[i][7]
      });
    }
  }
  matched.reverse();
  return matched.slice(0, limit || 10);
}

function renderGateUi_() {
  return HtmlService.createHtmlOutputFromFile('gate')
    .setTitle('Sim確認ゲート')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
