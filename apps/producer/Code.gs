// プロデューサー（全体統括AI）
// 自動化キューシートの状態を見て次工程の呼び出し・ゲートへの引き上げ・
// チェッカーNG時のリトライ制御を行う。
//
// 時間主導トリガーで runProducerTick() を実行する想定。
// チェッカー①〜⑦／ディレクターは未実装のため、それらの工程は「実行中」のまま
// 保留され、後続STEPで recordCheckResult() 等から状態を進められるようになるまで
// 自動では先に進まない（アナリストFBはapps/analyst-feedback-appとして実装済み）。

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
    // ディレクター/チェッカー等、STEP4以降で実装予定の工程
    console.log('工程 "' + processName + '" の実行ロジックは未実装のため待機します。');
    return;
  }

  var row = getQueueRow(workId);
  var payload = buildStagePayload_(workId, row, processName);
  var result = executor(payload);
  var outputId = saveStageResult_(workId, row, processName, result);
  updateProcessState(workId, processName, QUEUE_STATUS.CHECKING, outputId);
}

// 工程ごとに必要な入力を組み立てる。
// 「シナリオ」「アナリストFB」「圧縮」はDoc経由でtitle/design/stepsを受け渡す
// （apps/producer/StageOutput.gs参照）。それ以外はまだ未接続のため、
// 従来通りキュー行の値のみを渡す暫定payload。
function buildStagePayload_(workId, row, processName) {
  if (processName === 'シナリオ') {
    return { title: row['タイトル'], refScenario: row['参考シナリオ'] };
  }
  if (processName === 'アナリストFB') {
    var scenarioOutput = parseStepsDocText_(loadDocText_(row['シナリオ_出力ID']));
    return { title: scenarioOutput.title, design: scenarioOutput.design, steps: scenarioOutput.steps };
  }
  if (processName === '圧縮') {
    var feedbackOutput = parseStepsDocText_(loadDocText_(row['アナリストFB_出力ID']));
    return { script: feedbackOutput.steps.join('\n\n'), design: feedbackOutput.design, chars: '' };
  }
  return {
    workId: workId,
    title: row['タイトル'],
    refScenario: row['参考シナリオ'],
    channelId: row['チャンネルID'],
    folderId: row['フォルダID']
  };
}

// 実行結果を次工程が読めるよう保存し、出力IDを返す。
// 「シナリオ」「アナリストFB」はtitle/design/stepsをDocに保存する
// （アナリストFBの修正後Docは「修正版」として保存する、という要件のためファイル名で区別）。
function saveStageResult_(workId, row, processName, result) {
  if (!result || result.ok === false) {
    throw new Error(processName + ' 実行エラー: ' + (result && result.error));
  }
  if (processName === 'シナリオ' || processName === 'アナリストFB') {
    var docText = buildStepsDocText_(result.title, result.design, result.steps);
    var fileName = 'No' + workId + '_' + processName + (processName === 'アナリストFB' ? '_修正版' : '');
    return saveTextAsDoc_(row['フォルダID'], fileName, docText);
  }
  return result.outputId;
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
