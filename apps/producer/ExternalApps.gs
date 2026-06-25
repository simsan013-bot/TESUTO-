// 既存App群（シナリオApp / 圧縮ツール / キャラ別台本 / Fish Audio / PRP生成 / 画像生成App）を
// HTTP POSTで呼び出すラッパー。プロンプト・ロジックは各App側のまま変更しない。
// URL・APIキーはハードコードせず Script Properties から取得する（setScriptProperties()で設定）。

function httpPostJson_(url, apiKey, payload) {
  var headers = {};
  if (apiKey) {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('App呼び出し失敗 (' + url + '): HTTP ' + code + ' ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function callScenarioApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.SCENARIO_APP_URL),
    getOptionalProp_(CONFIG_KEYS.SCENARIO_APP_KEY),
    {
      mode: 'run',
      refScenario: payload.refScenario,
      title: payload.title
    }
  );
}

function callCompressionTool_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.COMPRESSION_APP_URL),
    getOptionalProp_(CONFIG_KEYS.COMPRESSION_APP_KEY),
    {
      mode: 'run',
      script: payload.script,
      chars: payload.chars,
      design: payload.design
    }
  );
}

function callCharacterScriptApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.CHARACTER_SCRIPT_APP_URL),
    getOptionalProp_(CONFIG_KEYS.CHARACTER_SCRIPT_APP_KEY),
    {
      mode: payload.mode || 'run',
      spreadsheetId: payload.spreadsheetId
    }
  );
}

function callFishAudioTts_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.FISH_AUDIO_URL),
    getOptionalProp_(CONFIG_KEYS.FISH_AUDIO_KEY),
    payload
  );
}

function callPrpGenerator_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.PRP_APP_URL),
    getOptionalProp_(CONFIG_KEYS.PRP_APP_KEY),
    payload
  );
}

function callImageGenApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.IMAGE_APP_URL),
    getOptionalProp_(CONFIG_KEYS.IMAGE_APP_KEY),
    payload
  );
}

// PRP生成 → 画像生成App の2段呼び出しをまとめた「画像」工程の実行関数
function runImageStage_(payload) {
  var prpResult = callPrpGenerator_(payload);
  return callImageGenApp_(prpResult);
}
