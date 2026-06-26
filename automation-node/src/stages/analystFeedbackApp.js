// apps/analyst-feedback-app/Code.gs (runAnalystFeedback_) を移植したもの。
// プロンプト構築・部分修正の判定ロジックはGAS版と同一。
// callClaudeForAnalyst_（max_tokens:16000, 429時70秒待機×最大3回）は
// src/clients/anthropic.jsのcallClaudeにoptionsで指定して再現する。
// アナリストの人物設定はGAS版のScript Properties上書きと同様、
// 環境変数 ANALYST_PERSONAS（JSON文字列）で上書き可能、未設定時はDEFAULT_ANALYST_PERSONASを使う。

const { callClaude } = require('../clients/anthropic');
const {
  STEP_NAMES_AND_MIN_CHARS,
  buildPersonaSystemPrompt,
  buildPersonaUserPrompt,
  buildIntegrateSystemPrompt,
  buildIntegrateUserPrompt,
  buildRevisionSystemPrompt,
  buildRevisionUserPrompt,
  countEffective_: countEffective,
  DEFAULT_ANALYST_PERSONAS,
} = require('../prompts/analystFeedbackApp');

const CLAUDE_OPTIONS = { maxTokens: 16000, retry: { maxRetry: 3, retryWaitSec: 70 } };

function getAnalystPersonas() {
  const raw = process.env.ANALYST_PERSONAS;
  if (!raw) return DEFAULT_ANALYST_PERSONAS;
  return JSON.parse(raw);
}

function callClaudeForAnalyst(systemPrompt, userMessage) {
  return callClaude(systemPrompt, userMessage, CLAUDE_OPTIONS);
}

// runAnalystFeedback_(body) のNode版。title/design/stepsを受け取り
// { title, design, feedbacks, integratedPlan, originalSteps, steps, script } を返す。
async function runAnalystFeedback(title, design, steps) {
  title = (title || '').toString().trim();
  design = (design || '').toString().trim();
  if (!title) throw new Error('title が空です。');
  if (!design) throw new Error('design が空です。');
  if (!steps || !steps.length) throw new Error('steps が空です。');

  const personas = getAnalystPersonas();
  const feedbacks = [];
  for (const persona of personas) {
    const feedback = await callClaudeForAnalyst(buildPersonaSystemPrompt(persona), buildPersonaUserPrompt(title, design, steps));
    feedbacks.push({ name: persona.name, focus: persona.focus, feedback });
  }

  const integratedPlan = await callClaudeForAnalyst(buildIntegrateSystemPrompt(), buildIntegrateUserPrompt(title, feedbacks));

  const revisedSteps = [];
  for (let s = 0; s < steps.length; s++) {
    const stepDef = STEP_NAMES_AND_MIN_CHARS[s];
    const prevText = revisedSteps.join('\n\n');

    let revisedText = await callClaudeForAnalyst(
      buildRevisionSystemPrompt(s, stepDef.minChars, integratedPlan),
      buildRevisionUserPrompt(title, design, prevText, steps[s], stepDef.name, stepDef.minChars)
    );

    if (countEffective(revisedText) < stepDef.minChars) {
      revisedText = await callClaudeForAnalyst(
        buildRevisionSystemPrompt(s, stepDef.minChars, integratedPlan),
        buildRevisionUserPrompt(title, design, prevText, revisedText, stepDef.name, stepDef.minChars)
      );
    }

    revisedSteps.push(revisedText);
  }

  return {
    title,
    design,
    feedbacks,
    integratedPlan,
    originalSteps: steps,
    steps: revisedSteps,
    script: revisedSteps.join('\n\n'),
  };
}

module.exports = { runAnalystFeedback, getAnalystPersonas };
