// ============================================================
// Web API エントリーポイント（新規追加）
//
// 元のApp（HtmlService）は「ボタンを1回押すと、ブラウザ側JS
// （processNext()）がDocを1件処理するgenerateAudio()呼び出しを
// 再帰的に繰り返し、全Doc完了まで進める」設計。1回のgenerateAudio()
// 呼び出しはDoc 1件のみを処理する（SPLITグループ単位のTTS呼び出し
// ＋Utilities.sleep(5000)＋任意のASR呼び出し＋sleep(5000)を繰り返す
// ため、Doc内のSPLIT数次第でGASの6分実行上限に達するリスクがある）。
//
// このdoPostも同じ「1回の呼び出しでDoc 1件だけ処理する」設計を
// そのまま維持する。全件処理するには、呼び出し側がレスポンスの
// nextIdxを次のリクエストのcurrentIdxに入れて、allDone:trueになる
// までdoPostを繰り返し呼ぶ必要がある。
// ロジック・文言は一切変更していない。
//
// 【doPostの入力】
//   {
//     mode: 'run',
//     sheetId: '...', sheetName: '...',
//     docIds: ['...', ...], outputFolder: '...',
//     generateSrt: true, currentIdx: 0
//   }
//
// 【doPostの出力】
//   {
//     ok: true, allDone: false, logs: [...], savedFiles: [...],
//     nextIdx: 1, originalIdx: 0
//   }
//   { ok: false, error: '...' }
// ============================================================

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var mode = body.mode;

  if (mode === 'run') {
    return jsonResponse_(runOneDoc_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "run" を指定してください。' });
}

function runOneDoc_(body) {
  var sheetId      = (body.sheetId || '').toString().trim();
  var sheetName    = (body.sheetName || '').toString().trim();
  var docIds       = body.docIds || [];
  var outputFolder = (body.outputFolder || '').toString();
  var generateSrt  = !!body.generateSrt;
  var currentIdx   = body.currentIdx || 0;

  if (!sheetId || !sheetName) {
    return { ok: false, error: 'sheetId と sheetName を指定してください。' };
  }

  try {
    var result = generateAudio(sheetId, sheetName, docIds, outputFolder, generateSrt, currentIdx);
    return {
      ok: result.success,
      allDone: !!result.allDone,
      logs: result.logs,
      savedFiles: result.savedFiles || [],
      nextIdx: result.nextIdx,
      originalIdx: result.originalIdx,
      error: result.success ? undefined : (result.logs ? result.logs.join('\n') : 'unknown error')
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
