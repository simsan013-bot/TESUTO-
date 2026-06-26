// 自動化キューシート（apps/producer/QueueSheet.gs）・NGログシート
// （apps/producer/NgLog.gs）に相当するSQLiteストレージ。
// 1ファイルDB（data/queue.db）に works / process_states / ng_log の3テーブルを持つ。

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { PIPELINE_EXECUTION_ORDER } = require('../pipeline');

const QUEUE_STATUS = {
  WAITING: '待機',
  RUNNING: '実行中',
  CHECKING: 'チェック中',
  NG_RETRY: 'NG_リトライ中',
  GATE_WAIT: 'Sim確認待ち',
  DONE: '完了',
  ERROR: 'エラー',
};

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'queue.db');

function nowTimestamp() {
  return new Date().toISOString();
}

function openDb(dbPath) {
  const filePath = dbPath || DB_PATH;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS works (
      work_id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      ref_scenario TEXT DEFAULT '',
      channel_id TEXT,
      folder_path TEXT,
      overall_status TEXT NOT NULL,
      current_process TEXT DEFAULT '',
      current_gate TEXT DEFAULT 'なし',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS process_states (
      work_id INTEGER NOT NULL,
      process_name TEXT NOT NULL,
      status TEXT NOT NULL,
      output_id TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (work_id, process_name),
      FOREIGN KEY (work_id) REFERENCES works(work_id)
    );

    CREATE TABLE IF NOT EXISTS ng_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id INTEGER NOT NULL,
      channel_id TEXT,
      checker_name TEXT,
      attempt_number INTEGER,
      reason TEXT,
      fix_instruction TEXT,
      result TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function addWork(db, { title, channelId, folderPath, refScenario }) {
  const now = nowTimestamp();
  const insertWork = db.prepare(`
    INSERT INTO works (title, ref_scenario, channel_id, folder_path, overall_status, current_process, current_gate, created_at, updated_at)
    VALUES (@title, @refScenario, @channelId, @folderPath, @status, '', 'なし', @now, @now)
  `);
  const result = insertWork.run({
    title,
    refScenario: refScenario || '',
    channelId,
    folderPath,
    status: QUEUE_STATUS.WAITING,
    now,
  });
  const workId = result.lastInsertRowid;

  const insertProcess = db.prepare(`
    INSERT INTO process_states (work_id, process_name, status, retry_count, updated_at)
    VALUES (?, ?, ?, 0, ?)
  `);
  for (const processName of PIPELINE_EXECUTION_ORDER) {
    insertProcess.run(workId, processName, QUEUE_STATUS.WAITING, now);
  }

  return workId;
}

function getWork(db, workId) {
  const work = db.prepare('SELECT * FROM works WHERE work_id = ?').get(workId);
  if (!work) {
    throw new Error(`作品No ${workId} がworksテーブルに見つかりません。`);
  }
  const processes = db
    .prepare('SELECT * FROM process_states WHERE work_id = ?')
    .all(workId);
  const processStates = {};
  for (const p of processes) {
    processStates[p.process_name] = p;
  }
  return { ...work, processStates };
}

function updateOverallStatus(db, workId, status, currentProcess, gate) {
  const now = nowTimestamp();
  const sets = ['overall_status = @status', 'updated_at = @now'];
  if (currentProcess !== undefined && currentProcess !== null) {
    sets.push('current_process = @currentProcess');
  }
  if (gate !== undefined && gate !== null) {
    sets.push('current_gate = @gate');
  }
  db.prepare(`UPDATE works SET ${sets.join(', ')} WHERE work_id = @workId`).run({
    status,
    currentProcess,
    gate,
    now,
    workId,
  });
}

function updateProcessState(db, workId, processName, status, outputId) {
  if (PIPELINE_EXECUTION_ORDER.indexOf(processName) === -1) {
    throw new Error(`工程名 "${processName}" は未定義です。`);
  }
  const now = nowTimestamp();
  db.prepare(`
    UPDATE process_states
    SET status = @status,
        output_id = COALESCE(@outputId, output_id),
        updated_at = @now
    WHERE work_id = @workId AND process_name = @processName
  `).run({ status, outputId: outputId ?? null, now, workId, processName });
}

function getRetryCount(db, workId, processName) {
  const row = db
    .prepare('SELECT retry_count FROM process_states WHERE work_id = ? AND process_name = ?')
    .get(workId, processName);
  return row ? row.retry_count : 0;
}

function incrementRetryCount(db, workId, processName) {
  db.prepare(`
    UPDATE process_states SET retry_count = retry_count + 1
    WHERE work_id = ? AND process_name = ?
  `).run(workId, processName);
  return getRetryCount(db, workId, processName);
}

function resetRetryCount(db, workId, processName) {
  db.prepare(`
    UPDATE process_states SET retry_count = 0
    WHERE work_id = ? AND process_name = ?
  `).run(workId, processName);
}

function escalateToSimGate(db, workId, gateName) {
  updateOverallStatus(db, workId, QUEUE_STATUS.GATE_WAIT, null, gateName);
}

function listActionableWorkIds(db) {
  const rows = db
    .prepare(`
      SELECT work_id FROM works
      WHERE overall_status NOT IN (?, ?, ?)
    `)
    .all(QUEUE_STATUS.GATE_WAIT, QUEUE_STATUS.DONE, QUEUE_STATUS.ERROR);
  return rows.map((r) => r.work_id);
}

function appendNgLogEntry(db, workId, channelId, checkerName, attemptNumber, reason, fixInstruction, result) {
  db.prepare(`
    INSERT INTO ng_log (work_id, channel_id, checker_name, attempt_number, reason, fix_instruction, result, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(workId, channelId, checkerName, attemptNumber, reason, fixInstruction, result, nowTimestamp());
}

function getRecentNgLogForWorkId(db, workId, limit) {
  return db
    .prepare('SELECT * FROM ng_log WHERE work_id = ? ORDER BY id DESC LIMIT ?')
    .all(workId, limit || 10);
}

function listGateWaitingItems(db) {
  return db
    .prepare('SELECT * FROM works WHERE overall_status = ?')
    .all(QUEUE_STATUS.GATE_WAIT);
}

function clearGate(db, workId) {
  updateOverallStatus(db, workId, QUEUE_STATUS.WAITING, null, 'なし');
}

module.exports = {
  QUEUE_STATUS,
  DB_PATH,
  openDb,
  addWork,
  getWork,
  updateOverallStatus,
  updateProcessState,
  getRetryCount,
  incrementRetryCount,
  resetRetryCount,
  escalateToSimGate,
  listActionableWorkIds,
  appendNgLogEntry,
  getRecentNgLogForWorkId,
  listGateWaitingItems,
  clearGate,
};
