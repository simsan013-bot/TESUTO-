// シナリオApp: 元はHtmlServiceの対話型Webアプリ（参考シナリオ入力→設計→
// 類似性チェック→タイトル確認→STEP0〜7台本生成を1画面ずつ進める）。
// プロンプト・生成ロジックは無改修。今回の移植で追加したのは下記のみ。
//
// 1. 各公開関数（designScenario/checkSimilarity/writeStep/regenerateStep）の
//    本体を `_` 付きのコア関数に分離した。コア関数はWebApi.gs の doPost
//    （producerからの自動実行）も直接呼ぶ。
// 2. `WebApi.gs` にdoPostを追加（doGetは元のHtmlService出力のまま無改修）。

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Scenario AI')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- シナリオ設計 ----
function designScenario(refScenario, newTitle) {
  return designScenario_(refScenario, newTitle);
}

function designScenario_(refScenario, newTitle) {
  var provider = getProperty('AI_PROVIDER') || 'claude';
  try {
    var analysis = callAI(provider, SYS_ANALYZE, '以下の参考シナリオを解析してください：\n\n' + refScenario);
    var titleLine = newTitle ? '\n\n新規シナリオタイトル（ユーザー指定）：「' + newTitle + '」\nこのタイトルの内容・雰囲気・設定を最大限に反映してシナリオを設計すること。' : '';
    var design = callAI(provider, SYS_DESIGN,
      '参考シナリオ解析結果：\n' + analysis +
      titleLine +
      '\n\n上記をもとに新規シナリオを設計してください。\n' +
      '登場人物の名前は、以下の名前データを参考に、年齢・性別に合った自然な日本人名を毎回新しく創作してください。\n' +
      'リストから選ぶのではなく、このデータが示す命名センス・世代感を参考に、重複しない新しい名前を考案してください。\n' +
      '同じ姓や名の繰り返しは禁止。読み仮名を必ず付けること。\n\n' +
      getRandomNameTable(12)
    );
    return { success: true, result: design };
  } catch(e) { return { success: false, error: e.message }; }
}

// ---- 類似性チェック ----
function checkSimilarity(params) {
  return checkSimilarity_(params);
}

function checkSimilarity_(params) {
  var provider = getProperty('AI_PROVIDER') || 'claude';
  var refScenario    = params.refScenario;
  var scenarioDesign = params.scenarioDesign;
  try {
    var sys = buildCheckSystem();
    var msg = '【元シナリオ（参考）】\n' + refScenario
            + '\n\n【新規シナリオ設計（チェック対象）】\n' + scenarioDesign
            + '\n\n上記の元シナリオを学習し、新規シナリオ設計との酷似性チェックを実施してください。'
            + '報告フォーマットに従って出力してください。';
    var result = callAI(provider, sys, msg);
    return { success: true, result: result };
  } catch(e) { return { success: false, error: e.message }; }
}

function proposeTitle(scenarioDesign) {
  var provider = getProperty('AI_PROVIDER') || 'claude';
  try {
    var sys = 'あなたはYouTube逆転スカッと系動画のタイトル専門ライターです。シナリオ設計をもとに高クリック率のタイトルを3案提案してください。\n\n'
      + '【タイトル設計ルール】\n'
      + '基本構造：加害者の侮辱台詞 + 主人公の弱い立場 + 理不尽な追放 + 数日あと/翌朝/会議室での逆転\n'
      + '強い要素：差別発言 / 立場の弱さ / 即日解雇・追放 / 翌朝・数日あと / 本社・会長・社長・監査・大口顧客 / 真相暴露 / 青ざめた・凍りついた・崩れ落ちた\n'
      + '例：「派遣のくせに口答え？」不正を拒んだ新人が即日解雇。だが3日あと、本社監査役の一言で部長が凍りついた\n\n'
      + '【出力形式】\n案1：（タイトル本文のみ）\n案2：（タイトル本文のみ）\n案3：（タイトル本文のみ）\n\n3案のみ出力。説明不要。';
    var result = callAI(provider, sys, 'シナリオ設計：\n' + scenarioDesign);
    return { success: true, result: result };
  } catch(e) { return { success: false, error: e.message }; }
}

// ---- STEPごとの台本生成 ----
function writeStep(params) {
  return writeStep_(params);
}

function writeStep_(params) {
  var provider = getProperty('AI_PROVIDER') || 'claude';
  var stepNum  = params.stepNum;
  var stepInfo = STEP_DEFINITIONS[stepNum];
  try {
    var sys = buildStepSystem(stepNum, stepInfo.minChars, stepInfo.instruction);
    var user = buildStepUser(params.design, params.title, stepInfo.name, params.prevText, null, stepInfo.minChars);
    var result = callAI(provider, sys, user);
    return { success: true, result: result };
  } catch(e) { return { success: false, error: e.message }; }
}

// ---- STEPの再生成 ----
function regenerateStep(params) {
  return regenerateStep_(params);
}

function regenerateStep_(params) {
  var provider = getProperty('AI_PROVIDER') || 'claude';
  var stepNum  = params.stepNum;
  var stepInfo = STEP_DEFINITIONS[stepNum];
  try {
    var sys = buildRegenSystem(stepNum, stepInfo.minChars, stepInfo.instruction);
    var user = buildStepUser(params.design, params.title, stepInfo.name, params.prevText, params.currentText, stepInfo.minChars);
    var result = callAI(provider, sys, user);
    return { success: true, result: result };
  } catch(e) { return { success: false, error: e.message }; }
}
