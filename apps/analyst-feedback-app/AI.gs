// ---- Claude API呼び出し（429時はapps/compression-tool/AI.gsのcallClaudeForPipeline_と同じ待機リトライ） ----
function callClaudeForAnalyst_(systemPrompt, userMessage) {
  var key = getOptionalProp_(CONFIG_KEYS.CLAUDE_KEY);
  if (!key) throw new Error('CLAUDE_KEYがスクリプトプロパティに設定されていません');

  var maxRetry = 3;
  var retryWaitSec = 70;

  for (var attempt = 0; attempt <= maxRetry; attempt++) {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      }),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code === 429) {
      if (attempt >= maxRetry) throw new Error('レート制限が続いています。しばらく時間をおいてから再試行してください。');
      Utilities.sleep(retryWaitSec * 1000);
      continue;
    }

    var json = JSON.parse(res.getContentText());
    if (code !== 200) throw new Error(json.error ? json.error.message : 'API Error ' + code);
    return json.content[0].text.trim();
  }
}
