var SCENE_BATCH_SIZE = 10;
var SCENE_MAX_RETRY = 3;

function generateSceneBatch_(script, totalScenes, batchIndex) {
  var s = batchIndex * SCENE_BATCH_SIZE + 1;
  var e = Math.min((batchIndex + 1) * SCENE_BATCH_SIZE, totalScenes);
  var systemPrompt = buildSceneSystemPrompt_(totalScenes, s, e, script);
  var userMessage = 'scene' + pad3_(s) + '〜scene' + pad3_(e) + 'を生成してください。';
  var text = callClaudeApiWithRetry_(systemPrompt, userMessage, SCENE_MAX_RETRY);
  return { batchIndex: batchIndex, startScene: s, endScene: e, text: text };
}

// 注意: GASのWebApp実行は最大6分。Scene数が多い場合は呼び出し側(producer)で
// バッチ単位(generateSceneBatch_)を1回ずつ呼ぶこと。このまとめ関数は少数バッチ/動作確認用。
function generateAllSceneBatches_(script, totalScenes) {
  var batchCount = Math.ceil(totalScenes / SCENE_BATCH_SIZE);
  var batches = [];
  for (var i = 0; i < batchCount; i++) {
    batches.push(generateSceneBatch_(script, totalScenes, i));
  }
  return batches;
}

// スプシ貼り付け用TSV行（元ツールのcopyAllScenesTSVと同じ整形ルール）
function sceneBatchTextToRows_(batchText) {
  var blocks = batchText.split(/\n(?=scene\d{3}「)/);
  var rows = [];
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].trim();
    if (!block) continue;
    var lines = block.split('\n');
    var cleanedLines = [];
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (line && line !== 'Prompt:') cleanedLines.push(line);
    }
    if (cleanedLines.length === 0) continue;
    var label = cleanedLines[0];
    var body = cleanedLines.slice(1).join('、');
    rows.push(label + '／' + body);
  }
  return rows;
}
