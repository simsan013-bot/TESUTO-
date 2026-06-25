// Script Properties に保存する設定値のキー定義。
// APIキー・WebApp URLはハードコードせず、すべてここ経由で取得する。

var CONFIG_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  // producer自身のdoPost（外部から「今すぐ1回実行して」と呼ぶ入口）を
  // 守るための合言葉。この値を知らない相手からの呼び出しは拒否する。
  PRODUCER_SELF_KEY: 'PRODUCER_SELF_KEY',
  SCENARIO_APP_URL: 'SCENARIO_APP_URL',
  SCENARIO_APP_KEY: 'SCENARIO_APP_KEY',
  COMPRESSION_APP_URL: 'COMPRESSION_APP_URL',
  COMPRESSION_APP_KEY: 'COMPRESSION_APP_KEY',
  CHARACTER_SCRIPT_APP_URL: 'CHARACTER_SCRIPT_APP_URL',
  CHARACTER_SCRIPT_APP_KEY: 'CHARACTER_SCRIPT_APP_KEY',
  FISH_AUDIO_URL: 'FISH_AUDIO_URL',
  FISH_AUDIO_KEY: 'FISH_AUDIO_KEY',
  PRP_APP_URL: 'PRP_APP_URL',
  PRP_APP_KEY: 'PRP_APP_KEY',
  IMAGE_APP_URL: 'IMAGE_APP_URL',
  IMAGE_APP_KEY: 'IMAGE_APP_KEY'
};

function getRequiredProp_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error('Script Properties に ' + key + ' が設定されていません。');
  }
  return value;
}

function getOptionalProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getSpreadsheetId_() {
  return getRequiredProp_(CONFIG_KEYS.SPREADSHEET_ID);
}

// Sim確認後にURL/APIキー一式をまとめて設定するためのヘルパー。
// 例: setScriptProperties({SCENARIO_APP_URL: '...', SCENARIO_APP_KEY: '...'})
function setScriptProperties(propsObject) {
  PropertiesService.getScriptProperties().setProperties(propsObject, false);
}
