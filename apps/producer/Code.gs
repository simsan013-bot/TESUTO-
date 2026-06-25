// プロデューサー（全体統括AI）
// 自動化キューシートの状態を見て次工程の呼び出し・ゲートへの引き上げ・
// チェッカーNG時のリトライ制御を行う。
//
// 時間主導トリガーで runProducerTick() を実行する想定。
// チェッカー①〜⑦／ディレクター／アナリスト（STEP4・5）は未実装のため、
// それらの工程は「実行中」のまま保留され、後続STEPで recordCheckResult() 等から
// 状態を進められるようになるまで自動では先に進まない。

function runProducerTick() {
  var workIds = listActionableWorkIds();
  for (var i = 0; i < workIds.length; i++) {
    try {
      advanceWorkItem_(workIds[i]);
    } catch (err) {
      updateOverallStatus(workIds[i], QUEUE_STATUS.ERROR, null, null);
      console.error('作品No ' + workIds[i] + ' の処理中にエラー: ' + err);
    }
  }
}

function advanceWorkItem_(workId) {
  var row = getQueueRow(workId);

  if (row['全体ステータス'] === QUEUE_STATUS.GATE_WAIT) {
    return;
  }

  var processName = row['現在の工程'] || getNextProcessName_(null);
  var stateValue = row[processName + '_状態'];

  if (!stateValue || stateValue === QUEUE_STATUS.WAITING) {
    startProcess_(workId, processName);
    return;
  }

  if (stateValue === QUEUE_STATUS.RUNNING || stateValue === QUEUE_STATUS.CHECKING) {
    // 外部Appの非同期完了待ち、またはチェッカー（STEP4で実装）の判定待ち。
    return;
  }

  if (stateValue === QUEUE_STATUS.NG_RETRY) {
    startProcess_(workId, processName);
    return;
  }

  if (stateValue === QUEUE_STATUS.DONE) {
    moveToNextProcess_(workId, processName);
    return;
  }
}

function startProcess_(workId, processName) {
  var executor = PIPELINE_EXECUTORS[processName];
  updateOverallStatus(workId, QUEUE_STATUS.RUNNING, processName, 'なし');
  updateProcessState(workId, processName, QUEUE_STATUS.RUNNING, null);

  if (!executor) {
    // ディレクター/アナリスト/チェッカー等、STEP4・5で実装予定の工程
    console.log('工程 "' + processName + '" の実行ロジックは未実装のため待機します。');
    return;
  }

  var row = getQueueRow(workId);
  var payload = {
    workId: workId,
    title: row['タイトル'],
    refScenario: row['参考シナリオ'],
    channelId: row['チャンネルID'],
    folderId: row['フォルダID']
  };

  var result = executor(payload);
  updateProcessState(workId, processName, QUEUE_STATUS.CHECKING, result && result.outputId);
}

function moveToNextProcess_(workId, processName) {
  var gate = PIPELINE_GATE_AFTER[processName];
  if (gate) {
    escalateToSimGate(workId, gate);
    return;
  }
  advanceToNextProcessAfterGate_(workId, processName);
}

function advanceToNextProcessAfterGate_(workId, processName) {
  var next = getNextProcessName_(processName);
  if (!next) {
    updateOverallStatus(workId, QUEUE_STATUS.DONE, processName, 'なし');
    return;
  }
  updateOverallStatus(workId, QUEUE_STATUS.WAITING, next, 'なし');
}

// Sim確認ゲートをクリアして次工程へ進める（STEP7のゲートUIから呼ばれる想定。
// 現時点では手動実行 or シンプルなdoPostリクエストから呼ぶ）
function clearGate(workId) {
  var row = getQueueRow(workId);
  advanceToNextProcessAfterGate_(workId, row['現在の工程']);
}

// チェッカー（STEP4で実装）が判定結果を確定させた際に呼び出す共通エントリーポイント。
// OK→工程完了、NG→リトライ（最大2回）→3回目もNGならSim確認ゲートへエスカレーション。
function recordCheckResult(workId, processName, checkerName, isOk, reason, fixInstruction) {
  if (isOk) {
    updateProcessState(workId, processName, QUEUE_STATUS.DONE, null);
    resetRetryCount(workId, processName);
    return 'ADVANCE';
  }

  var attempt = incrementRetryCount(workId, processName);
  var row = getQueueRow(workId);
  appendNgLogEntry(workId, row['チャンネルID'], checkerName, attempt, reason, fixInstruction, 'NG');

  if (attempt >= 3) {
    var gate = PIPELINE_GATE_AFTER[processName] || 'なし';
    escalateToSimGate(workId, gate);
    return 'ESCALATED';
  }

  updateProcessState(workId, processName, QUEUE_STATUS.NG_RETRY, null);
  return 'RETRY';
}

function doGet(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

// 外部から「今すぐ1回 runProducerTick() を実行して」と呼べる入口。
// 通常は installProducerTrigger() の時間主導トリガーが定期実行するため、
// この入口は緊急時の手動実行用。
function doPost(e) {
  runProducerTick();
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
