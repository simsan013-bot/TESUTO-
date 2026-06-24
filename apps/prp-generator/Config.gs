var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MAX_TOKENS = 4000;

function getAnthropicApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) {
    throw new Error('Script Properties に ANTHROPIC_API_KEY が設定されていません。');
  }
  return key;
}
