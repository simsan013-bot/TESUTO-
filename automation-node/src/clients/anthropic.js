// apps/scenario-app/AI.gs (callClaude) / apps/analyst-feedback-app/AI.gs
// (callClaudeForAnalyst_) / apps/compression-tool/AI.gs (callClaude /
// callClaudeForPipeline_) / apps/cat-commentary-app/Code.gs (callClaude) の
// Claude呼び出しを1つの関数にまとめたもの。エンドポイント・モデルID・
// リトライ仕様（429時70秒待機×最大3回）はGAS版と同一。
// APIキーは環境変数 ANTHROPIC_API_KEY から読む（GAS版のCLAUDE_KEY/
// CLAUDE_API_KEYに相当）。

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt, userMessage, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  const maxTokens = options.maxTokens || 8000;
  const retry = options.retry || null; // { maxRetry, retryWaitSec }

  const maxAttempts = retry ? retry.maxRetry + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (res.status === 429 && retry) {
      if (attempt >= retry.maxRetry) {
        throw new Error('レート制限が続いています。しばらく時間をおいてから再試行してください。');
      }
      await new Promise((r) => setTimeout(r, retry.retryWaitSec * 1000));
      continue;
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ? json.error.message : `API Error ${res.status}`);
    }
    return json.content[0].text.trim();
  }
  throw new Error('callClaude: 想定外の終了');
}

module.exports = { callClaude, CLAUDE_MODEL };
