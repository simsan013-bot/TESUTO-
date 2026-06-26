// 既存App群（シナリオApp / アナリストFB / 圧縮ツール / キャラ別台本 / Fish Audio /
// PRP生成 / 画像生成App）をHTTP POSTで呼び出すラッパー。プロンプト・ロジックは
// 各App側のまま変更しない。
// URL・APIキーはハードコードせず Script Properties から取得する（setScriptProperties()で設定）。
//
// 合言葉（APIキー）はリクエストヘッダーではなくJSONボディに埋め込んで送る。
// GASのdoPost(e)はWebアプリ宛リクエストの独自ヘッダー（Authorization等）を
// 読み取れないため、各AppのdoPost側でbody.secretとして確認する設計にしている。

function httpPostJson_(url, apiKey, payload) {
  var body = payload || {};
  if (apiKey) {
    body.secret = apiKey;
  }
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
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

function callAnalystFeedbackApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.ANALYST_FEEDBACK_APP_URL),
    getOptionalProp_(CONFIG_KEYS.ANALYST_FEEDBACK_APP_KEY),
    {
      mode: 'run',
      title: payload.title,
      design: payload.design,
      steps: payload.steps
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

function callCompressionExport_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.COMPRESSION_APP_URL),
    getOptionalProp_(CONFIG_KEYS.COMPRESSION_APP_KEY),
    {
      mode: 'export',
      script: payload.script,
      folderId: payload.folderId,
      fileName: payload.fileName
    }
  );
}

// 「圧縮」工程の実行関数。テキスト生成（mode:'run'）に続けて、
// キャラ別台本工程が必要とするタブ1/タブ2形式のスプシをfolderId直接
// 指定で出力する（mode:'export'）。runImageStage_と同じ「1工程内で
// 2段呼び出しをまとめる」パターン。
function runCompressionStage_(payload) {
  var genResult = callCompressionTool_(payload);
  if (!genResult || genResult.ok === false) {
    return genResult;
  }
  var exportResult = callCompressionExport_({
    script: genResult.script,
    folderId: payload.folderId,
    fileName: payload.fileName
  });
  if (!exportResult || exportResult.ok === false) {
    return { ok: false, error: '圧縮スプシ出力エラー: ' + (exportResult && exportResult.error) };
  }
  genResult.spreadsheetId = exportResult.spreadsheetId;
  return genResult;
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
    {
      mode: 'run',
      sheetId: payload.sheetId,
      sheetName: payload.sheetName,
      docIds: payload.docIds,
      outputFolder: payload.outputFolder,
      generateSrt: payload.generateSrt,
      currentIdx: payload.currentIdx || 0
    }
  );
}

// 「キャラ別台本」工程（character-script-app）が同じスプシ（圧縮_出力ID）に
// 書き出す「生成Doc一覧」タブ（ファイル名|キャラクター|Doc ID|Doc URL|...）
// からDoc ID列を読み取り、音声工程のdocIdsとして使う。
function readGeneratedDocIds_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('生成Doc一覧');
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var docIds = [];
  for (var i = 1; i < rows.length; i++) {
    var docId = String(rows[i][2] || '').trim();
    if (docId) docIds.push(docId);
  }
  return docIds;
}

// fish-audio-ttsは1回のdoPostでDoc1件しか処理しない設計（GASの6分実行上限対策、
// apps/fish-audio-tts/README.md参照）。「圧縮」工程のrunCompressionStage_と同じ
// 「1工程内で連結」パターンで、allDone:trueになるまでcallFishAudioTts_を
// ループ呼び出しし、ログ・保存ファイルを集約した1つの結果として返す。
// 進行が無いまま（nextIdxが進まない）応答が返った場合は、リトライしても
// 解決しない設定エラー（APIキー未設定・シート不正等）と判断して打ち切る。
function runFishAudioStage_(payload) {
  var logs = [];
  var savedFiles = [];
  var currentIdx = 0;
  var maxIterations = (payload.docIds || []).length + 5;

  for (var i = 0; i < maxIterations; i++) {
    var result = callFishAudioTts_({
      sheetId: payload.sheetId,
      sheetName: payload.sheetName,
      docIds: payload.docIds,
      outputFolder: payload.outputFolder,
      generateSrt: payload.generateSrt,
      currentIdx: currentIdx
    });
    logs = logs.concat(result.logs || []);
    savedFiles = savedFiles.concat(result.savedFiles || []);

    if (result.allDone) {
      return { ok: true, allDone: true, logs: logs, savedFiles: savedFiles };
    }
    if (result.nextIdx === undefined || result.nextIdx <= currentIdx) {
      return { ok: false, error: result.error || '音声生成が進行しませんでした（currentIdx=' + currentIdx + '）', logs: logs, savedFiles: savedFiles };
    }
    currentIdx = result.nextIdx;
  }
  return { ok: false, error: '音声生成がmaxIterations(' + maxIterations + ')を超えました', logs: logs, savedFiles: savedFiles };
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

function callCatCommentaryApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.CAT_COMMENTARY_APP_URL),
    getOptionalProp_(CONFIG_KEYS.CAT_COMMENTARY_APP_KEY),
    { scenario: payload.scenario }
  );
}
