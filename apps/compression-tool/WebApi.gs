// ============================================================
// Web API エントリーポイント（新規追加）
//
// 元のApp（HtmlService）は「元シナリオ貼り付け→（任意）キャラ設定・
// 設計書入力→STORY_BIBLE抽出→ダイジェスト→起承→葛藤〜どん底→転→結」を
// 人間がボタン操作で進める対話型ツール。各フェーズのAI呼び出しは
// ブラウザから直接Anthropic APIをfetch()する設計（google.script.runは
// 使われていない）。producerのパイプライン（'圧縮'工程）向けに、
// index.htmlのSTORY_BIBLE/キャラ設定対応プロンプト（Prompts.gs）を
// サーバー側から同じ順序で呼び出すmode='run'のdoPostを追加した。
// プロンプト文面・生成順序は一切変更していない。
//
// 【doPostの入力】
//   {
//     mode: 'run',
//     script: '元のシナリオ本文',
//     chars: 'キャラクター設定（任意・省略可）',
//     design: 'シナリオ設計書（任意・省略時は元シナリオからSTORY_BIBLEを抽出）'
//   }
//
// 【doPostの出力】
//   {
//     ok: true,
//     storyBible: '抽出されたSTORY_BIBLE',
//     digest, ki, sho, ten, ketsu: '各フェーズの生成テキスト',
//     script: '①〜⑤結合済みの台本本文',
//     charCounts: { digest, ki, sho, ten, ketsu の純セリフ文字数 },
//     totalChars: '純セリフ合計文字数'
//   }
// ============================================================

function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  if (!verifyProducerSecret_(body)) {
    return jsonResponse_({ ok: false, error: '認証エラー: secret が一致しません。' });
  }

  var mode = body.mode;

  if (mode === 'run') {
    return jsonResponse_(runCompressionPipeline_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "run" を指定してください。' });
}

// producerからの呼び出しを確認するための合言葉チェック。
// 未設定の場合は常に拒否する（安全側のデフォルト）。
function verifyProducerSecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('PRODUCER_SHARED_KEY');
  if (!expected) return false;
  return !!body && body.secret === expected;
}

function runCompressionPipeline_(body) {
  var script = (body.script || '').toString().trim();
  var chars  = (body.chars  || '').toString().trim();
  var design = (body.design || '').toString().trim();
  if (!script) return { ok: false, error: 'script が空です。' };

  try {
    // STEP0: STORY_BIBLE生成（index.htmlのstartGenerate()と同じく常に実行。
    // 設計書があれば設計書から、なければ元シナリオから抽出）
    var isDesignDoc = design.length > 0;
    var bibleSource = isDesignDoc ? design : script;
    var storyBible = callClaudeForPipeline_(buildSystemPrompt(chars), buildBiblePrompt(bibleSource, isDesignDoc));

    var digest = callClaudeForPipeline_(buildSystemPrompt(chars), buildDigestPrompt(script, chars, storyBible));
    var ki     = callClaudeForPipeline_(buildSystemPrompt(chars), buildKiPrompt(script, chars, digest, storyBible));
    var sho    = callClaudeForPipeline_(buildSystemPrompt(chars), buildShoPrompt(script, chars, digest, ki, storyBible));
    var ten    = callClaudeForPipeline_(buildSystemPrompt(chars), buildTenPrompt(script, chars, ki, sho, storyBible));
    var ketsu  = callClaudeForPipeline_(buildSystemPrompt(chars), buildKetsuPrompt(script, chars, ten, storyBible));

    var charCounts = {
      digest: countChars_(digest),
      ki: countChars_(ki),
      sho: countChars_(sho),
      ten: countChars_(ten),
      ketsu: countChars_(ketsu)
    };
    var totalChars = charCounts.digest + charCounts.ki + charCounts.sho + charCounts.ten + charCounts.ketsu;

    return {
      ok: true,
      storyBible: storyBible,
      digest: digest,
      ki: ki,
      sho: sho,
      ten: ten,
      ketsu: ketsu,
      script: [digest, ki, sho, ten, ketsu].join('\n\n'),
      charCounts: charCounts,
      totalChars: totalChars
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// index.htmlのcountChars()と同一ロジック（純セリフ文字数：===指示===・【名前】・「」・空白記号を除く）
function countChars_(text) {
  if (!text) return 0;
  var t = text;
  t = t.replace(/===[^=]*===/g, '');
  t = t.replace(/【[^】]*】/g, '');
  t = t.replace(/[「」]/g, '');
  t = t.replace(/[\s　\n\r。、！？…・『』（）()\[\]{}.,!?\-—―～－：:；;《》〈〉""'']/g, '');
  return t.length;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
