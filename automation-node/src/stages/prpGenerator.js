// apps/prp-generator/Code.gs (doPost) / CharacterGenerator.gs / SceneGenerator.gs を移植したもの。
// プロンプト文面（CHAR_SYS_PROMPT/buildSceneSystemPrompt_）・SCENE_BATCH_SIZE(10)・
// リトライ仕様（429時のみ、30+15*(attempt-1)秒待機、最大3回試行）はGAS版と同一。
// GAS版はWebアプリのmode分岐(doPost)で'character'/'scene'を呼び分けていたが、
// Node版はproducer側が直接 generateCharacterPrompts/generateSceneBatch を呼ぶため
// HTTP層・secret層は不要（バックエンドの段取りの最適化）。

const { callClaude } = require('../clients/anthropic');
const { CHAR_SYS_PROMPT, buildSceneSystemPrompt_: buildSceneSystemPrompt, pad3_: pad3 } = require('../prompts/prpGenerator');

const SCENE_BATCH_SIZE = 10;
const SCENE_MAX_RETRY = 3;

// callClaudeApiWithRetry_と同じ意味（試行回数=SCENE_MAX_RETRY、429時のみ30+15*(attempt-1)秒待機）
function callClaudeWithSceneRetry(systemPrompt, userMessage) {
  return callClaude(systemPrompt, userMessage, {
    maxTokens: 4000,
    retry: {
      maxRetry: SCENE_MAX_RETRY - 1,
      retryWaitSec: (attempt) => 30 + (attempt - 1) * 15,
    },
  });
}

// parseCharacterBlocks_と同一ロジック。GAS版は「=== CHAR:」にマッチしない
// ブロック（モデルが本文の前に付ける見出し等）にも'キャラクター N'という
// ダミー名でフォールバックしていたが、これはモデルの出力揺れにより本文以外の
// テキストが偽キャラクターとして混入するバグだったため、マッチしないブロックは
// 読み飛ばすように修正（実在するキャラクターブロックの抽出結果は変わらない）。
function parseCharacterBlocks(text) {
  const blocks = text.split(/(?==== CHAR:)/);
  const result = [];
  for (const blk of blocks) {
    if (!blk.trim()) continue;
    const m = blk.match(/=== CHAR:([^\n]+)===/);
    if (!m) continue;
    const content = blk.replace(/---END---/g, '').trim();
    result.push({ name: m[1].trim(), content });
  }
  return result;
}

// characterBlocksToRows_と同一ロジック
function characterBlocksToRows(blocks) {
  return blocks.map((b) => b.content
    .replace(/===\s*CHAR:[^\n]*===\s*/g, '')
    .replace(/---END---/g, '')
    .trim()
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim());
}

async function generateCharacterPrompts(personDesignText) {
  const rawText = await callClaude(CHAR_SYS_PROMPT, personDesignText, { maxTokens: 4000 });
  return parseCharacterBlocks(rawText);
}

async function generateSceneBatch(script, totalScenes, batchIndex) {
  const s = batchIndex * SCENE_BATCH_SIZE + 1;
  const e = Math.min((batchIndex + 1) * SCENE_BATCH_SIZE, totalScenes);
  const systemPrompt = buildSceneSystemPrompt(totalScenes, s, e, script);
  const userMessage = 'scene' + pad3(s) + '〜scene' + pad3(e) + 'を生成してください。';
  const text = await callClaudeWithSceneRetry(systemPrompt, userMessage);
  return { batchIndex, startScene: s, endScene: e, text };
}

// sceneBatchTextToRows_と同一ロジック
function sceneBatchTextToRows(batchText) {
  const blocks = batchText.split(/\n(?=scene\d{3}「)/);
  const rows = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const cleanedLines = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (line && line !== 'Prompt:') cleanedLines.push(line);
    }
    if (cleanedLines.length === 0) continue;
    const label = cleanedLines[0];
    const body = cleanedLines.slice(1).join('、');
    rows.push(label + '／' + body);
  }
  return rows;
}

// generateAllSceneBatches_のNode版（producer側でバッチを1つずつ呼ぶ必要がなくなったため
// まとめて呼べる。GAS版の6分実行制限による分割呼び出しはNodeには不要）。
async function generateAllSceneBatches(script, totalScenes) {
  const batchCount = Math.ceil(totalScenes / SCENE_BATCH_SIZE);
  const batches = [];
  for (let i = 0; i < batchCount; i++) {
    batches.push(await generateSceneBatch(script, totalScenes, i));
  }
  return batches;
}

module.exports = {
  generateCharacterPrompts,
  characterBlocksToRows,
  generateSceneBatch,
  generateAllSceneBatches,
  sceneBatchTextToRows,
  SCENE_BATCH_SIZE,
};
