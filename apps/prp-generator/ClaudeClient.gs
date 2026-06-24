function callClaudeApi_(systemPrompt, userMessage) {
  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': getAnthropicApiKey_(),
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(CLAUDE_API_URL, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    var err = new Error('Claude API Error ' + code + ': ' + body);
    err.httpStatus = code;
    throw err;
  }

  var json = JSON.parse(body);
  return json.content[0].text;
}

// レート制限(429)のみリトライ。元ツールのSCENE生成と同じ待機時間(30 + 15*試行回数 秒)
function callClaudeApiWithRetry_(systemPrompt, userMessage, maxRetry) {
  var attempt = 0;
  while (true) {
    try {
      return callClaudeApi_(systemPrompt, userMessage);
    } catch (e) {
      attempt++;
      var isRateLimit = e.httpStatus === 429;
      if (!isRateLimit || attempt >= maxRetry) {
        throw e;
      }
      Utilities.sleep((30 + (attempt - 1) * 15) * 1000);
    }
  }
}
