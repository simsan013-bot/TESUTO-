// ============================================================
// Web API エントリーポイント（新規追加）
//
// 元のApp（HtmlService）は「STEP1: キャラ一覧をスプシに書き出す
// （extractCharacterList）→ 人間がvoice_idを入力 → STEP2: モデル別Doc生成
// （generateModelDocs）」を、人間がブラウザの2つのボタンで個別に実行する
// 対話型ツール（google.script.run経由）。
// extractCharacterListは実行するたびに「キャラ一覧」タブをclearContents()
// するため、すでに人間が入力したvoice_idを自動的に消してしまう。
// そのためproducerからの自動呼び出しでも、この2ステップを doPost 側で
// 自動的に連結（chain）することはせず、元のUIと同じく独立した2つの
// モードとして公開する（mode: 'extract' / mode: 'run'）。
// ロジック・文言は一切変更していない。
//
// 【doPostの入力】
//   { mode: 'extract', spreadsheetId: '...' }  … キャラ一覧をスプシに書き出す
//   { mode: 'run',      spreadsheetId: '...' }  … モデル別Docを生成する
//
// SECRET_KEYは（UIでは人間が入力するが）producerからの呼び出しでは
// このApp自身のScript Propertiesから読み取る。producer側にSECRET_KEYの
// 値を共有・複製する必要はない。
//
// 【doPostの出力】
//   { ok: true, logs: [...], charCount: 0 }
//   { ok: false, error: '...' }
// ============================================================

function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  if (!verifyProducerSecret_(body)) {
    return jsonResponse_({ ok: false, error: '認証エラー: secret が一致しません。' });
  }

  var mode = body.mode;

  if (mode === 'extract') {
    return jsonResponse_(runExtract_(body));
  }
  if (mode === 'run') {
    return jsonResponse_(runGenerate_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "extract" または "run" を指定してください。' });
}

// producerからの呼び出しを確認するための合言葉チェック。
// UIで人間が入力するSECRET_KEY（generateModelDocs等の引数）とは別の値。
// 未設定の場合は常に拒否する（安全側のデフォルト）。
function verifyProducerSecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('PRODUCER_SHARED_KEY');
  if (!expected) return false;
  return !!body && body.secret === expected;
}

function getSecretKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
  if (!key) throw new Error('SECRET_KEYがスクリプトプロパティに設定されていません');
  return key;
}

function runExtract_(body) {
  var spreadsheetId = (body.spreadsheetId || '').toString().trim();
  if (!spreadsheetId) return { ok: false, error: 'spreadsheetId が空です。' };

  try {
    var result = extractCharacterList(spreadsheetId, getSecretKey_());
    return { ok: result.success, logs: result.logs, charCount: result.charCount, error: result.success ? undefined : result.logs.join('\n') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function runGenerate_(body) {
  var spreadsheetId = (body.spreadsheetId || '').toString().trim();
  if (!spreadsheetId) return { ok: false, error: 'spreadsheetId が空です。' };

  try {
    var result = generateModelDocs(spreadsheetId, getSecretKey_());
    return { ok: result.success, logs: result.logs, error: result.success ? undefined : result.logs.join('\n') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
