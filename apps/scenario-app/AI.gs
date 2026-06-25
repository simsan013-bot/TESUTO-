// ---- AI call ----
function callAI(provider, systemPrompt, userMessage) {
  if (provider === 'claude') return callClaude(systemPrompt, userMessage);
  return callOpenAI(systemPrompt, userMessage);
}

function callClaude(systemPrompt, userMessage) {
  var key = getProperty('CLAUDE_KEY');
  if (!key) throw new Error('CLAUDE_KEY is not set in Script Properties.');
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('Claude Error: ' + (json.error ? json.error.message : res.getResponseCode()));
  return json.content[0].text;
}

function callOpenAI(systemPrompt, userMessage) {
  var key = getProperty('OPENAI_KEY');
  if (!key) throw new Error('OPENAI_KEY is not set in Script Properties.');
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 8000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('OpenAI Error: ' + (json.error ? json.error.message : res.getResponseCode()));
  return json.choices[0].message.content;
}
