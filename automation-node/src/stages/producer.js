// apps/producer/Checkers.gs (CHECKER_DEFINITIONSのextractContent_/isReady_)・
// AI.gs (callClaudeForCheck_) を移植したもの。判定プロンプト自体はsrc/prompts/producer.js
// を一字一句そのまま使う。
// extractContent_/isReady_が読む結果オブジェクトの形は、GAS版では外部App（HTTP）の
// 戻り値だったのに対しNode版は同一プロセス内のstage実行関数の戻り値であり、
// フィールド名が一致しない箇所がある（例：音声工程はGAS版が複数回呼び出しの
// 完了待ちとしてisReady_でallDoneを見ていたが、Node版のrunFishAudioStageは
// 同期的に全件処理してから返るため常にtrueでよい）。チェックする内容そのもの
// （最終成果物の品質判定対象）はGAS版と同じ情報になるようextractContent_を揃えている。

const { callClaude } = require('../clients/anthropic');
const {
  CHECKER_FOCUS,
  buildCheckerSystemPrompt,
  buildCheckerUserPrompt,
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  parseCheckerVerdict,
} = require('../prompts/producer');

const CLAUDE_CHECK_OPTIONS = { maxTokens: 2000, retry: { maxRetry: 3, retryWaitSec: 70 } };

// callClaudeForCheck_と同一ロジック
function callClaudeForCheck(systemPrompt, userMessage) {
  return callClaude(systemPrompt, userMessage, CLAUDE_CHECK_OPTIONS);
}

const CHECKER_DEFINITIONS = {
  圧縮: {
    ...CHECKER_FOCUS.圧縮,
    extractContent: (result) => 'STORY_BIBLE:\n' + result.storyBible + '\n\n台本本文:\n' + result.script
      + '\n\n純セリフ文字数合計: ' + result.totalChars + '字',
    isReady: () => true,
  },
  キャラ別台本: {
    ...CHECKER_FOCUS.キャラ別台本,
    extractContent: (result) => '実行ログ:\n' + (result.logs || []).join('\n'),
    isReady: () => true,
  },
  音声: {
    ...CHECKER_FOCUS.音声,
    extractContent: (result) => '実行ログ:\n' + (result.logs || []).join('\n') + '\n保存ファイル数: ' + (result.savedFiles || []).length,
    isReady: () => true,
  },
  猫感想: {
    ...CHECKER_FOCUS.猫感想,
    extractContent: (result) => result.output || '',
    isReady: () => true,
  },
  画像: {
    ...CHECKER_FOCUS.画像,
    extractContent: (result) => {
      const items = result.results || [];
      return items
        .map((r) => (r.ok ? 'OK' : 'NG') + ': ' + r.promptJa + (r.error ? '（' + r.error + '）' : ''))
        .join('\n');
    },
    isReady: () => true,
  },
  編集: {
    ...CHECKER_FOCUS.編集,
    extractContent: (result) => JSON.stringify(result),
    isReady: () => true,
  },
  サムネ: {
    ...CHECKER_FOCUS.サムネ,
    extractContent: (result) => JSON.stringify(result),
    isReady: () => true,
  },
};

// runCheckerJudgment_と同一ロジック
async function runCheckerJudgment(processName, content) {
  const def = CHECKER_DEFINITIONS[processName];
  const text = await callClaudeForCheck(buildCheckerSystemPrompt(def.focus), buildCheckerUserPrompt(content));
  return parseCheckerVerdict(text);
}

// runDirectorJudgment_と同一ロジック
async function runDirectorJudgment(result) {
  const text = await callClaudeForCheck(buildDirectorSystemPrompt(), buildDirectorUserPrompt(result));
  return parseCheckerVerdict(text);
}

module.exports = { CHECKER_DEFINITIONS, runCheckerJudgment, runDirectorJudgment };
