// ============================================================
// Web API エントリーポイント（新規追加）
//
// 元のApp（HtmlService）は「参考シナリオ入力→設計→類似性チェック→
// タイトル確認→STEP0〜7台本生成」を人間が1画面ずつ進める対話型ツール。
// producerのパイプライン（'シナリオ'工程）はSim確認なしで一括実行できる
// 必要があるため、designScenario_〜regenerateStep_（Code.gs）を順に呼んで
// 全STEPを自動で組み立てるmode='run'を追加した。
// 類似性チェック・タイトル提案・各STEPのプロンプト自体は一切変更していない。
//
// 【doPostの入力】
//   {
//     mode: 'run',
//     refScenario: '参考にする元シナリオ本文',
//     title: '新規シナリオのタイトル'
//   }
//
// 【doPostの出力】
//   {
//     ok: true,
//     title: '...',
//     design: 'シナリオ設計（SYS_DESIGNの出力）',
//     check: '類似性チェック結果（SYS_ANALYZE/buildCheckSystemの出力。参考情報、自動実行はブロックしない）',
//     steps: ['STEP0本文', 'STEP1本文', ... 'STEP7本文'],
//     script: '全STEP結合済みの台本本文'
//   }
// ============================================================

var MAX_REGEN_ATTEMPTS = 2;

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var mode = body.mode;

  if (mode === 'run') {
    return jsonResponse_(runScenarioPipeline_(body));
  }

  return jsonResponse_({ ok: false, error: 'mode は "run" を指定してください。' });
}

function runScenarioPipeline_(body) {
  var refScenario = (body.refScenario || '').toString().trim();
  var title = (body.title || '').toString().trim();
  if (!refScenario) return { ok: false, error: 'refScenario が空です。' };
  if (!title) return { ok: false, error: 'title が空です。' };

  var designResult = designScenario_(refScenario, title);
  if (!designResult.success) {
    return { ok: false, error: 'シナリオ設計エラー: ' + designResult.error };
  }
  var design = designResult.result;

  var checkResult = checkSimilarity_({ refScenario: refScenario, scenarioDesign: design });

  var stepTexts = [];
  for (var stepNum = 0; stepNum < STEP_DEFINITIONS.length; stepNum++) {
    var minChars = STEP_DEFINITIONS[stepNum].minChars;
    var prevText = stepTexts.join('\n\n');

    var stepResult = writeStep_({ design: design, title: title, stepNum: stepNum, prevText: prevText });
    if (!stepResult.success) {
      return { ok: false, error: 'STEP' + stepNum + ' 生成エラー: ' + stepResult.error, title: title, design: design, steps: stepTexts };
    }
    var text = stepResult.result;

    var attempt = 0;
    while (countEffective_(text) < minChars && attempt < MAX_REGEN_ATTEMPTS) {
      var regenResult = regenerateStep_({ design: design, title: title, stepNum: stepNum, currentText: text, prevText: prevText, minChars: minChars });
      if (!regenResult.success) break;
      text = regenResult.result;
      attempt++;
    }

    stepTexts.push(text);
  }

  return {
    ok: true,
    title: title,
    design: design,
    check: checkResult.success ? checkResult.result : null,
    steps: stepTexts,
    script: stepTexts.join('\n\n')
  };
}

// index.htmlのcountEffective()と同一ロジック（実質文字数：【名前】「」== ==・空白を除く）
function countEffective_(text) {
  var t = text || '';
  t = t.replace(/【[^】]*】/g, '');
  t = t.replace(/[「」]/g, '');
  t = t.replace(/==\s*[^=\n]*\s*==/g, '');
  t = t.replace(/[\s\n\r\t]/g, '');
  return t.length;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
