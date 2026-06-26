// apps/cat-commentary-app/Code.gs (doPost/callClaude) を移植したもの。
// プロンプト・max_tokens(1000)・リトライなしはGAS版と同一。
// saveHistory（スプシ履歴保存、SHEET_ID未設定ならスキップ）はGAS版でも
// 任意機能のため、Node版では呼び出し側がDB保存するかどうかを自由に選べる
// ようポートしていない（このAppの本質はcallClaudeの戻り値のみ）。

const { callClaude } = require('../clients/anthropic');
const { SYSTEM_PROMPT } = require('../prompts/catCommentaryApp');

async function runCatCommentary(scenario) {
  scenario = (scenario || '').toString().trim();
  if (!scenario) throw new Error('シナリオが空やで');
  return callClaude(SYSTEM_PROMPT, scenario, { maxTokens: 1000 });
}

module.exports = { runCatCommentary };
