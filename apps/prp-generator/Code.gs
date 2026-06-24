// PRP生成App: 元はブラウザ単体ツール(PROMPT_GEN.html)。プロンプト文面は無改修のまま、
// producerからHTTP POSTで呼べるWebアプリ形に移植した。

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var mode = body.mode;

  if (mode === 'character') {
    var blocks = generateCharacterPrompts_(body.input);
    return jsonResponse_({
      ok: true,
      characters: blocks,
      rows: characterBlocksToRows_(blocks)
    });
  }

  if (mode === 'scene') {
    if (body.batchIndex !== undefined && body.batchIndex !== null) {
      var batch = generateSceneBatch_(body.script, body.totalScenes, body.batchIndex);
      return jsonResponse_({
        ok: true,
        batch: batch,
        rows: sceneBatchTextToRows_(batch.text)
      });
    }
    var batches = generateAllSceneBatches_(body.script, body.totalScenes);
    var allRows = [];
    for (var i = 0; i < batches.length; i++) {
      allRows = allRows.concat(sceneBatchTextToRows_(batches[i].text));
    }
    return jsonResponse_({ ok: true, batches: batches, rows: allRows });
  }

  return jsonResponse_({ ok: false, error: 'mode は "character" または "scene" を指定してください。' });
}

function doGet(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
