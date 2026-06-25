// 自動化キューシート: エージェント間の唯一の受け渡し場所。
// 列構成は仕様書3章に準拠。列の位置はヘッダー名で解決するため、
// 列の追加・並び替えがあってもコード側の修正は最小限で済む。

var QUEUE_SHEET_NAME = '自動化キューシート';

var QUEUE_BASE_HEADERS = ['作品No', 'タイトル', '参考シナリオ', 'チャンネルID', 'フォルダID', '全体ステータス', '現在の工程', '現在のゲート'];

var QUEUE_PROCESS_NAMES = ['シナリオ', '圧縮', 'アナリストFB', 'キャラ別台本', '音声', '猫感想', '画像', '編集', 'サムネ', '投稿'];

var QUEUE_PROCESS_SUFFIXES = ['_状態', '_出力ID', '_更新時刻', '_リトライ回数'];

var QUEUE_STATUS = {
  WAITING: '待機',
  RUNNING: '実行中',
  CHECKING: 'チェック中',
  NG_RETRY: 'NG_リトライ中',
  GATE_WAIT: 'Sim確認待ち',
  DONE: '完了',
  ERROR: 'エラー'
};

function buildQueueHeaders_() {
  var headers = QUEUE_BASE_HEADERS.slice();
  for (var i = 0; i < QUEUE_PROCESS_NAMES.length; i++) {
    for (var j = 0; j < QUEUE_PROCESS_SUFFIXES.length; j++) {
      headers.push(QUEUE_PROCESS_NAMES[i] + QUEUE_PROCESS_SUFFIXES[j]);
    }
  }
  return headers;
}

function setupQueueSheet() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(QUEUE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(QUEUE_SHEET_NAME);
  }
  var headers = buildQueueHeaders_();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getQueueSheet_() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(QUEUE_SHEET_NAME);
  if (!sheet) {
    throw new Error('自動化キューシートが見つかりません。setupQueueSheet() を先に実行してください。');
  }
  return sheet;
}

function getHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    map[headerRow[i]] = i + 1;
  }
  return map;
}

function findRowIndexByWorkId_(sheet, workId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(workId)) {
      return i + 2;
    }
  }
  return -1;
}

function addQueueRow(title, channelId, folderId, refScenario) {
  var sheet = getQueueSheet_();
  var map = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  var nextWorkId = 1;
  if (lastRow >= 2) {
    var lastId = sheet.getRange(lastRow, map['作品No']).getValue();
    nextWorkId = Number(lastId) + 1;
  }

  var rowValues = new Array(sheet.getLastColumn()).fill('');
  rowValues[map['作品No'] - 1] = nextWorkId;
  rowValues[map['タイトル'] - 1] = safeCellValue_(title);
  rowValues[map['参考シナリオ'] - 1] = safeCellValue_(refScenario || '');
  rowValues[map['チャンネルID'] - 1] = channelId;
  rowValues[map['フォルダID'] - 1] = folderId;
  rowValues[map['全体ステータス'] - 1] = QUEUE_STATUS.WAITING;
  rowValues[map['現在の工程'] - 1] = '';
  rowValues[map['現在のゲート'] - 1] = 'なし';
  for (var i = 0; i < QUEUE_PROCESS_NAMES.length; i++) {
    rowValues[map[QUEUE_PROCESS_NAMES[i] + '_状態'] - 1] = QUEUE_STATUS.WAITING;
    rowValues[map[QUEUE_PROCESS_NAMES[i] + '_リトライ回数'] - 1] = 0;
  }

  sheet.appendRow(rowValues);
  return nextWorkId;
}

function getQueueRow(workId) {
  var sheet = getQueueSheet_();
  var map = getHeaderMap_(sheet);
  var rowIndex = findRowIndexByWorkId_(sheet, workId);
  if (rowIndex === -1) {
    throw new Error('作品No ' + workId + ' が自動化キューシートに見つかりません。');
  }
  var values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = {};
  for (var header in map) {
    row[header] = values[map[header] - 1];
  }
  row._rowIndex = rowIndex;
  return row;
}

function setQueueCell_(workId, headerName, value) {
  var sheet = getQueueSheet_();
  var map = getHeaderMap_(sheet);
  var rowIndex = findRowIndexByWorkId_(sheet, workId);
  if (rowIndex === -1) {
    throw new Error('作品No ' + workId + ' が自動化キューシートに見つかりません。');
  }
  if (!map[headerName]) {
    throw new Error('列 "' + headerName + '" は自動化キューシートに存在しません。');
  }
  sheet.getRange(rowIndex, map[headerName]).setValue(safeCellValue_(value));
}

function updateOverallStatus(workId, status, currentProcess, gate) {
  setQueueCell_(workId, '全体ステータス', status);
  if (currentProcess !== undefined && currentProcess !== null) {
    setQueueCell_(workId, '現在の工程', currentProcess);
  }
  if (gate !== undefined && gate !== null) {
    setQueueCell_(workId, '現在のゲート', gate);
  }
}

function updateProcessState(workId, processName, status, outputId) {
  if (QUEUE_PROCESS_NAMES.indexOf(processName) === -1) {
    throw new Error('工程名 "' + processName + '" は未定義です。');
  }
  setQueueCell_(workId, processName + '_状態', status);
  if (outputId !== undefined && outputId !== null) {
    setQueueCell_(workId, processName + '_出力ID', outputId);
  }
  setQueueCell_(workId, processName + '_更新時刻', nowTimestamp_());
}

function getRetryCount(workId, processName) {
  var row = getQueueRow(workId);
  return Number(row[processName + '_リトライ回数']) || 0;
}

function incrementRetryCount(workId, processName) {
  var count = getRetryCount(workId, processName) + 1;
  setQueueCell_(workId, processName + '_リトライ回数', count);
  return count;
}

function resetRetryCount(workId, processName) {
  setQueueCell_(workId, processName + '_リトライ回数', 0);
}

function escalateToSimGate(workId, gateName) {
  updateOverallStatus(workId, QUEUE_STATUS.GATE_WAIT, null, gateName);
}

// プロデューサーの巡回対象（ゲート待ち・完了・エラー以外）を返す
function listActionableWorkIds() {
  var sheet = getQueueSheet_();
  var map = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var statusCol = map['全体ステータス'] - 1;
  var idCol = map['作品No'] - 1;
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var status = data[i][statusCol];
    if (status !== QUEUE_STATUS.GATE_WAIT && status !== QUEUE_STATUS.DONE && status !== QUEUE_STATUS.ERROR) {
      result.push(data[i][idCol]);
    }
  }
  return result;
}
