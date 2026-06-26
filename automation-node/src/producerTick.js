// apps/producer/Code.gsのrunProducerTick/advanceWorkItem_/startProcess_/
// runCheckOrDirector_/moveToNextProcess_/recordCheckResult を移植したもの。
// GAS版のbuildStagePayload_/saveStageResult_に相当する「前工程の出力を読む／
// 自分の出力を保存する」処理はsrc/stages/index.jsの各実行関数側に統合したため、
// ここはdbの状態遷移とチェッカー／ディレクター判定の呼び出し制御のみを担う
// （状態遷移のロジック自体はGAS版と同一）。

const { PIPELINE_GATE_AFTER, getNextProcessName } = require('./pipeline');
const {
  QUEUE_STATUS,
  getWork,
  updateOverallStatus,
  updateProcessState,
  incrementRetryCount,
  resetRetryCount,
  escalateToSimGate,
  advanceToNextProcess,
  listActionableWorkIds,
  appendNgLogEntry,
} = require('./storage/db');
const { PIPELINE_EXECUTORS } = require('./stages/index');
const { CHECKER_DEFINITIONS, runCheckerJudgment, runDirectorJudgment } = require('./stages/producer');

// runProducerTick()と同一ロジック
async function runProducerTick(db) {
  const workIds = listActionableWorkIds(db);
  for (const workId of workIds) {
    try {
      await advanceWorkItem(db, workId);
    } catch (err) {
      updateOverallStatus(db, workId, QUEUE_STATUS.ERROR, null, null);
      console.error(`作品No ${workId} の処理中にエラー: ${err.message}`);
    }
  }
}

// advanceWorkItem_と同一ロジック
async function advanceWorkItem(db, workId) {
  const work = getWork(db, workId);

  if (work.overall_status === QUEUE_STATUS.GATE_WAIT) return;

  const processName = work.current_process || getNextProcessName(null);
  const stateValue = work.processStates[processName] && work.processStates[processName].status;

  if (!stateValue || stateValue === QUEUE_STATUS.WAITING) {
    await startProcess(db, workId, processName);
    return;
  }

  if (stateValue === QUEUE_STATUS.RUNNING || stateValue === QUEUE_STATUS.CHECKING) {
    return;
  }

  if (stateValue === QUEUE_STATUS.NG_RETRY) {
    await startProcess(db, workId, processName);
    return;
  }

  if (stateValue === QUEUE_STATUS.DONE) {
    moveToNextProcess(db, workId, processName);
  }
}

// startProcess_と同一ロジック（payload組み立て・出力保存はexecutor側に統合済み）
async function startProcess(db, workId, processName) {
  const executor = PIPELINE_EXECUTORS[processName];
  updateOverallStatus(db, workId, QUEUE_STATUS.RUNNING, processName, 'なし');
  updateProcessState(db, workId, processName, QUEUE_STATUS.RUNNING, null);

  if (!executor) {
    console.log(`工程 "${processName}" の実行ロジックは未実装のため待機します。`);
    return;
  }

  const work = getWork(db, workId);
  const result = await executor({ db, work });
  if (!result || result.ok === false) {
    throw new Error(`${processName} 実行エラー: ${result && result.error}`);
  }

  updateProcessState(db, workId, processName, QUEUE_STATUS.CHECKING, result.outputId);
  await runCheckOrDirector(db, workId, processName, result);
}

// runCheckOrDirector_と同一ロジック
async function runCheckOrDirector(db, workId, processName, result) {
  if (processName === 'アナリストFB') {
    const directorVerdict = await runDirectorJudgment(result);
    recordCheckResult(db, workId, processName, 'ディレクター', directorVerdict.ok, directorVerdict.reason, directorVerdict.fixInstruction);
    return;
  }

  const def = CHECKER_DEFINITIONS[processName];
  if (!def) {
    recordCheckResult(db, workId, processName, '（チェックなし）', true, '', '');
    return;
  }
  if (!def.isReady(result)) return;

  const content = def.extractContent(result);
  const verdict = await runCheckerJudgment(processName, content);
  recordCheckResult(db, workId, processName, def.checkerName, verdict.ok, verdict.reason, verdict.fixInstruction);
}

// moveToNextProcess_と同一ロジック
function moveToNextProcess(db, workId, processName) {
  const gate = PIPELINE_GATE_AFTER[processName];
  if (gate) {
    escalateToSimGate(db, workId, gate);
    return;
  }
  advanceToNextProcess(db, workId, processName);
}

// recordCheckResult()と同一ロジック
function recordCheckResult(db, workId, processName, checkerName, isOk, reason, fixInstruction) {
  if (isOk) {
    updateProcessState(db, workId, processName, QUEUE_STATUS.DONE, null);
    resetRetryCount(db, workId, processName);
    return 'ADVANCE';
  }

  const attempt = incrementRetryCount(db, workId, processName);
  const work = getWork(db, workId);
  appendNgLogEntry(db, workId, work.channel_id, checkerName, attempt, reason, fixInstruction, 'NG');

  if (attempt >= 3) {
    const gate = PIPELINE_GATE_AFTER[processName] || 'なし';
    escalateToSimGate(db, workId, gate);
    return 'ESCALATED';
  }

  updateProcessState(db, workId, processName, QUEUE_STATUS.NG_RETRY, null);
  return 'RETRY';
}

module.exports = { runProducerTick, advanceWorkItem };
