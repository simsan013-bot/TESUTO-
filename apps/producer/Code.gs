// プロデューサー（全体統括AI）
// 自動化キューシートの状態を見て次工程の呼び出し・ゲートへの引き上げ・
// チェッカーNG時のリトライ制御を行う。
//
// 時間主導トリガーで runProducerTick() を実行する想定。
// チェッカー①〜⑦／ディレクターの判定はCheckers.gs/Director.gsに実装済みで、
// startProcess_() の中でexecutor実行直後に同期的に呼ばれる（runCheckOrDirector_）。
// ただし対象工程のexecutor自体がまだ正しいpayloadを組み立てられない工程
// （キャラ別台本以降の一部）はexecutorが実行できないため、判定にも到達しない
// （詳細はREADMEの既知の未解決事項を参照）。

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
    // 外部Appの非同期完了待ち、または音声工程のようにisReady_()がfalseで
    // 判定を保留しているチェッカー待ち（CHECKINGのまま留まる）。
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
    // payload組み立てが未対応の工程（README参照）。実行できないため待機。
    console.log('工程 "' + processName + '" の実行ロジックは未実装のため待機します。');
    return;
  }

  var row = getQueueRow(workId);
  var payload = buildStagePayload_(workId, row, processName);
  var result = executor(payload);
  var outputId = saveStageResult_(workId, row, processName, result);
  updateProcessState(workId, processName, QUEUE_STATUS.CHECKING, outputId);
  runCheckOrDirector_(workId, processName, row, result);
}

// チェッカー①〜⑦／ディレクターの判定を実行し、recordCheckResult()で
// OK→完了／NG→リトライ／3回目Sim確認ゲートへの分岐を行う。
// 判定対象が無い工程（シナリオ等）はチェックなしでそのまま完了させる。
function runCheckOrDirector_(workId, processName, row, result) {
  if (processName === 'アナリストFB') {
    var directorVerdict = runDirectorJudgment_(result);
    recordCheckResult(workId, processName, 'ディレクター', directorVerdict.ok, directorVerdict.reason, directorVerdict.fixInstruction);
    return;
  }

  var def = CHECKER_DEFINITIONS[processName];
  if (!def) {
    recordCheckResult(workId, processName, '（チェックなし）', true, '', '');
    return;
  }
  if (!def.isReady_(result)) {
    // 例：音声工程はDoc単位の複数回呼び出しが必要なため、全件完了まで判定を保留する。
    return;
  }

  var content = def.extractContent_(result);
  var verdict = runCheckerJudgment_(processName, content);
  recordCheckResult(workId, processName, def.checkerName, verdict.ok, verdict.reason, verdict.fixInstruction);
}

// 工程ごとに必要な入力を組み立てる。
// 「シナリオ」「アナリストFB」はDoc経由でtitle/design/stepsを受け渡す
// （apps/producer/StageOutput.gs参照）。「圧縮」はそのDocを読んでscript/designを
// 組み立て、出力先folderId/fileNameも渡す（実体スプシはrunCompressionStage_が
// 作成し、そのIDを次の「キャラ別台本」がspreadsheetIdとして受け取る）。
// それ以外はまだ未接続のため、従来通りキュー行の値のみを渡す暫定payload。
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
    return {
      script: feedbackOutput.steps.join('\n\n'),
      design: feedbackOutput.design,
      chars: '',
      folderId: row['フォルダID'],
      fileName: 'No' + workId + '_台本'
    };
  }
  if (processName === 'キャラ別台本') {
    // 圧縮工程が出力したスプシ（タブ1=台本／タブ2=作品No音声モデル、
    // voice_idはexportForProducer_内で選定済み）をそのまま渡す。
    // mode:'extract'を呼ぶとタブ2のvoice_idが消えるため、'run'のみで良い
    // （apps/character-script-app/WebApi.gs参照）。
    return { mode: 'run', spreadsheetId: row['圧縮_出力ID'] };
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
  if (processName === '圧縮') {
    return result.spreadsheetId;
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

// Sim確認ゲートをクリアして次工程へ進める（GateUi.gs/gate.htmlのゲートUIから呼ばれる）
function clearGate(workId) {
  var row = getQueueRow(workId);
  advanceToNextProcessAfterGate_(workId, row['現在の工程']);
}

// チェッカー／ディレクターが判定結果を確定させた際に呼び出す共通エントリーポイント。
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
  if (e && e.parameter && e.parameter.view === 'gate') {
    return renderGateUi_();
  }
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

// 外部から「今すぐ1回 runProducerTick() を実行して」と呼べる入口。
// 通常は installProducerTrigger() の時間主導トリガーが定期実行するため、
// この入口は緊急時の手動実行用。
function doPost(e) {
  runProducerTick();
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
