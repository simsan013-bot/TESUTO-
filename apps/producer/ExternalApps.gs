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

// 「画像」工程の実行関数。これまで手作業だった以下の流れを1工程内で連結する
// （README「シナリオ→アナリストFB→圧縮 間のデータ受け渡し」と同じ、複数App・
// 複数回呼び出しを1工程にまとめるパターン）：
//   1. design（アナリストFB修正後の【登場人物設計】）からPRP生成Appの
//      character モードでキャラクター別プロンプトを生成
//   2. 各キャラの正面プロンプトだけを画像生成Appに渡して参照画像を1枚生成
//   3. 生成した画像URLを画像生成Appの参照画像シートにワーク単位のラベル
//      （No{workId}_キャラ名）で登録（registerRef、apps/image-generator/WebApi.gs参照）
//   4. script（圧縮工程が出力したスプシのタブ1台本を読み戻したもの）から
//      PRP生成Appの scene モードでシーンプロンプトをバッチ生成
//   5. シーンプロンプト内の[[キャラ名]]参照をワーク単位のラベルに置換
//      （PRP生成App側のプロンプトはこの工程専用に元々[[名前]]形式で出力する
//      設計のため、producer側はラベル文字列の置換のみで済む。プロンプト自体は無改修）
//   6. 画像生成Appへチャンク単位で渡してシーン画像を生成
function runImageStage_(payload) {
  var charResult = callPrpGenerator_({ mode: 'character', input: payload.design });
  if (!charResult || charResult.ok === false) {
    return { ok: false, error: 'キャラクタープロンプト生成エラー: ' + (charResult && charResult.error) };
  }

  var substitutions = generateCharacterReferenceImages_(payload.workId, charResult.characters || [], payload.folderId);

  var totalScenes = estimateTotalScenes_(payload.script);
  var sceneRows = generateAllScenePromptsInBatches_(payload.script, totalScenes);
  var labeledRows = applyRefLabelSubstitution_(sceneRows, substitutions);
  var results = runImageGenInChunks_(labeledRows, payload.folderId);

  return {
    ok: true,
    results: results,
    totalScenes: totalScenes,
    characterCount: (charResult.characters || []).length
  };
}

// キャラクター名から括弧書きのふりがな・年齢等を除いた素の名前を取り出す
// （CHAR_SYS_PROMPTの出力名は「名前（ふりがな）・年齢」形式のため）。
function deriveCharacterBareName_(name) {
  return (name || '').split('（')[0].split('・')[0].trim();
}

// CHAR_SYS_PROMPTが出力するキャラクター1人分のブロック本文から、
// 参照画像生成に使う「正面」プロンプトを取り出す
// （キャラクター固定設定＋服装固定＋視点1：正面のPromptを結合）。
function extractCharacterFrontPrompt_(content) {
  var fixedMatch = content.match(/キャラクター固定設定\s*\n([\s\S]*?)\n\s*服装固定/);
  var costumeMatch = content.match(/服装固定\s*\n([\s\S]*?)\n\s*\[視点1/);
  var frontMatch = content.match(/\[視点1[^\]]*\]\s*\n?Prompt:\s*\n?([\s\S]*?)(?=\n\[視点2|\n---END---|$)/);
  var parts = [];
  if (fixedMatch) parts.push(fixedMatch[1].trim());
  if (costumeMatch) parts.push(costumeMatch[1].trim());
  if (frontMatch) parts.push(frontMatch[1].trim());
  if (parts.length === 0) return content.trim();
  return parts.join('\n');
}

// 各キャラクターの正面プロンプトから参照画像を1枚ずつ生成し、画像生成Appの
// 参照画像シートにワーク単位のラベル（No{workId}_名前）で登録する。
// 戻り値は「素の名前→登録ラベル」のマップ（シーンプロンプト中の[[名前]]を
// 置換するためapplyRefLabelSubstitution_に渡す）。
function generateCharacterReferenceImages_(workId, characters, folderId) {
  var substitutions = {};
  for (var i = 0; i < characters.length; i++) {
    var bareName = deriveCharacterBareName_(characters[i].name);
    if (!bareName) continue;

    var label = 'No' + workId + '_' + bareName;
    var prompt = extractCharacterFrontPrompt_(characters[i].content);

    var genResult = callImageGenApp_({ mode: 'generate', rows: [prompt], folderId: folderId });
    var item = genResult && genResult.results && genResult.results[0];
    if (!genResult || genResult.ok === false || !item || !item.ok) {
      throw new Error('キャラクター参照画像生成エラー（' + bareName + '）: ' + (item && item.error));
    }

    callImageGenApp_({
      mode: 'registerRef',
      refs: [{ label: label, url: item.imageUrl, memo: 'No' + workId + ' 自動登録（' + bareName + '）' }]
    });
    substitutions[bareName] = label;
  }
  return substitutions;
}

// 台本の文字数から生成すべきシーン総数を概算する（PRP生成App側にtotalScenesを
// 自己決定する仕組みが無く、producer側で決めて渡す設計のため）。
function estimateTotalScenes_(script) {
  var effectiveLen = (script || '').replace(/[「」、。！？…・　\s『』（）【】―～]/g, '').length;
  var scenes = Math.round(effectiveLen / 200);
  return Math.max(10, Math.min(150, scenes));
}

// PRP生成Appのsceneモードは1回の呼び出しで内部SCENE_BATCH_SIZE（10シーン）分しか
// 生成しない設計（apps/prp-generator/SceneGenerator.gs参照、外部APIには非公開の定数）。
// 「圧縮」「音声」工程と同じ「1工程内でループ呼び出し」パターンで、batchIndexを
// 進めながらallのシーンが揃うまで繰り返す。
function generateAllScenePromptsInBatches_(script, totalScenes) {
  var allRows = [];
  var batchIndex = 0;
  var maxIterations = totalScenes + 5;

  for (var i = 0; i < maxIterations; i++) {
    var result = callPrpGenerator_({ mode: 'scene', script: script, totalScenes: totalScenes, batchIndex: batchIndex });
    if (!result || result.ok === false) {
      throw new Error('シーンプロンプト生成エラー（batchIndex=' + batchIndex + '）: ' + (result && result.error));
    }
    if (!result.batch || result.batch.startScene > totalScenes) break;
    allRows = allRows.concat(result.rows || []);
    if (result.batch.endScene >= totalScenes) break;
    batchIndex++;
  }
  return allRows;
}

function escapeRegexForLabel_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// シーンプロンプト中の[[素の名前]]参照を、画像生成Appに登録したワーク単位の
// ラベル（[[No{workId}_名前]]）に置換する。PRP生成App側のプロンプトは元々
// [[名前]]形式で出力する設計（buildSceneSystemPrompt_、無改修）になっているため、
// producer側は文字列置換のみで済む。
function applyRefLabelSubstitution_(rows, substitutions) {
  return rows.map(function (row) {
    var text = row;
    for (var bareName in substitutions) {
      var pattern = new RegExp('\\[\\[' + escapeRegexForLabel_(bareName) + '\\]\\]', 'g');
      text = text.replace(pattern, '[[' + substitutions[bareName] + ']]');
    }
    return text;
  });
}

function chunkArray_(arr, size) {
  var chunks = [];
  for (var i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// 画像生成Appのgenerateモードは内部チャンク分割を行わないため、producer側で
// シーン画像をIMAGE_GEN_CHUNK_SIZE件ずつに分けて呼び出す（GASの6分実行上限対策、
// 音声/圧縮工程と同じ考え方）。
var IMAGE_GEN_CHUNK_SIZE = 5;

function runImageGenInChunks_(rows, folderId) {
  var allResults = [];
  var chunks = chunkArray_(rows, IMAGE_GEN_CHUNK_SIZE);
  for (var i = 0; i < chunks.length; i++) {
    var res = callImageGenApp_({ mode: 'generate', rows: chunks[i], folderId: folderId });
    if (!res || res.ok === false) {
      throw new Error('画像生成エラー（chunk ' + i + '）: ' + (res && res.error));
    }
    allResults = allResults.concat(res.results || []);
  }
  return allResults;
}

// 「圧縮」工程が出力したスプシのタブ1「台本」を読み戻し、画像工程のscene
// モードに渡すための台本テキストを再構成する。圧縮工程の出力テキスト
// （genResult.script）自体はDoc等に保存されておらずスプシのみが残るため
// （apps/compression-tool/Code.gsのparseScriptToRows形式に対応した読み戻し）。
function readCompressedScriptText_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('台本');
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var lines = [];
  for (var i = 0; i < values.length; i++) {
    var col = String(values[i][0] || '').trim();
    var line = String(values[i][1] || '').trim();
    if (!col) continue;
    lines.push(line ? (col + '「' + line + '」') : col);
  }
  return lines.join('\n');
}

function callCatCommentaryApp_(payload) {
  return httpPostJson_(
    getRequiredProp_(CONFIG_KEYS.CAT_COMMENTARY_APP_URL),
    getOptionalProp_(CONFIG_KEYS.CAT_COMMENTARY_APP_KEY),
    { scenario: payload.scenario }
  );
}
