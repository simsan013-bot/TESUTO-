// アナリストFB工程：シナリオApp出力（title/design/steps）を受け取り、
// ①アナリスト5〜6体が独立に評価 → ②統合意見にまとめる → ③統合意見に基づきSTEP単位で部分修正する。
// 修正後も書式・文字数・キャラ口調・ストーリーの一貫性ルールは守り、
// 元のタイトル・シナリオ設計の範囲を超える展開・設定変更は行わない（部分修正の前提）。

function runAnalystFeedback_(body) {
  var title = (body.title || '').toString().trim();
  var design = (body.design || '').toString().trim();
  var steps = body.steps;

  if (!title) return { ok: false, error: 'title が空です。' };
  if (!design) return { ok: false, error: 'design が空です。' };
  if (!steps || !steps.length) return { ok: false, error: 'steps が空です。' };

  try {
    var personas = getAnalystPersonas();
    var feedbacks = [];
    for (var i = 0; i < personas.length; i++) {
      var persona = personas[i];
      var feedback = callClaudeForAnalyst_(buildPersonaSystemPrompt(persona), buildPersonaUserPrompt(title, design, steps));
      feedbacks.push({ name: persona.name, focus: persona.focus, feedback: feedback });
    }

    var integratedPlan = callClaudeForAnalyst_(buildIntegrateSystemPrompt(), buildIntegrateUserPrompt(title, feedbacks));

    var revisedSteps = [];
    for (var s = 0; s < steps.length; s++) {
      var stepDef = STEP_NAMES_AND_MIN_CHARS[s];
      var prevText = revisedSteps.join('\n\n');

      var revisedText = callClaudeForAnalyst_(
        buildRevisionSystemPrompt(s, stepDef.minChars, integratedPlan),
        buildRevisionUserPrompt(title, design, prevText, steps[s], stepDef.name, stepDef.minChars)
      );

      if (countEffective_(revisedText) < stepDef.minChars) {
        revisedText = callClaudeForAnalyst_(
          buildRevisionSystemPrompt(s, stepDef.minChars, integratedPlan),
          buildRevisionUserPrompt(title, design, prevText, revisedText, stepDef.name, stepDef.minChars)
        );
      }

      revisedSteps.push(revisedText);
    }

    return {
      ok: true,
      title: title,
      design: design,
      feedbacks: feedbacks,
      integratedPlan: integratedPlan,
      originalSteps: steps,
      steps: revisedSteps,
      script: revisedSteps.join('\n\n')
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function doGet(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}
