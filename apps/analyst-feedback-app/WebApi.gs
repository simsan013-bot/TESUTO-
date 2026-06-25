// ============================================================
// Web API エントリーポイント
//
// このAppはproducerからのみ呼ばれる純粋なバックエンドWorker（人間用UIは無し）。
// シナリオApp出力（title/design/steps）を受け取り、アナリストFB工程
// （①アナリスト評価→②統合意見→③部分修正）を実行して結果を返す。
//
// 【doPostの入力】
//   { mode: 'run', secret: '...', title: '...', design: '...', steps: ['STEP0本文', ...] }
//
// 【doPostの出力】
//   {
//     ok: true,
//     title, design,
//     feedbacks: [{ name, focus, feedback }, ...],
//     integratedPlan: '統合された修正方針',
//     originalSteps: [...],
//     steps: ['修正後のSTEP0本文', ...],
//     script: '修正後STEP結合済みの台本本文'
//   }
// ============================================================

function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  if (!verifyProducerSecret_(body)) {
    return jsonResponse_({ ok: false, error: '認証エラー: secret が一致しません。' });
  }

  if (body.mode === 'run') {
    return jsonResponse_(runAnalystFeedback_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "run" を指定してください。' });
}

// producerからの呼び出しを確認するための合言葉チェック。
// 未設定の場合は常に拒否する（安全側のデフォルト）。
function verifyProducerSecret_(body) {
  var expected = getOptionalProp_(CONFIG_KEYS.PRODUCER_SHARED_KEY);
  if (!expected) return false;
  return !!body && body.secret === expected;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
