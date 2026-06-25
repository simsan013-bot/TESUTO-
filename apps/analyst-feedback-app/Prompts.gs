// ---- シナリオApp（Prompts.gs）のbuildCommonRulesと同一の文面 ----
// 修正後もシナリオ作成時の基本ルール（書式・文字数・キャラ口調）を守らせるため、
// 神聖なルール文面を一字一句そのまま複製している（生成側のapps/scenario-appは無改修）。
function buildCommonRules_(minChars) {
  return '=== 【最重要】文字数ルール ===\n'
    + 'このSTEPの必要文字数：' + minChars + '字以上（実質文字数）\n'
    + '実質文字数：【キャラ名】ラベル・「」記号・== ==・改行・空白を除いた文字数\n'
    + '必ず' + minChars + '字以上になるまで書き続けること。不足なら場面・セリフを追加して達成すること。\n'
    + '\n'
    + '=== 会話劇形式ルール ===\n'
    + '・すべてのセリフの前に【キャラ名】を付ける\n'
    + '・セリフは「」で囲む\n'
    + '・ナレーションは【主人公ナレーション】で統一\n'
    + '・場面転換は == 場面名 == を入れる\n'
    + '・1文ごとに改行。1文36文字超は区切って改行\n'
    + '\n'
    + '=== キャラクター別語調 ===\n'
    + '主人公ナレーション：静か・少し切ない・観察的。控えめな内心ツッコミを適度に入れる\n'
    + '悪役：\n'
  + '【通常時】短く・感情的・体温がある。説明しない。感情とプライドで動く。\n'
  + '  言いかけてやめる：「それは——いや、もういい」\n'
  + '  遮る・被せる：「だから！」（相手の言葉を遮って）「そんな話はしていない」\n'
  + '  動作を絡める：（舌打ち）「…関係ない」（書類を叩きつけて）「ふざけるな」\n'
  + '  語尾を崩す：「知らんよ」「どうだっていい」「以上」「…まあ、わかってるよな？」\n'
  + '【追い詰められた時】急に長くなる・抽象的・主語が消える。この変化を必ず描く。\n'
  + '  抽象煙幕：「物事というのはそんな単純な話ではない」\n'
  + '  感情すり替え：「人の気持ちを考えたことがあるのか」\n'
  + '  経験マウント：「君はまだわかっていない」\n'
  + '  主語消し：「そういう流れで決まったことだ」\n'
  + '【禁止】悪役が「説明」した瞬間に視聴者のヘイトが冷める。論理的すぎるセリフは書かない。\n'
  + '上位者の前だけ急に敬語になる落差を必ず描く。\n'
    + '理解者：短く静かで重い言葉。乾いた一言でクスリと笑えるシーンを入れる\n'
    + '上位審判者：低く重く短い言葉。静かな皮肉を一箇所だけ入れる\n'
    + '\n'
    + '=== 禁止事項 ===\n'
    + '・他のSTEPの内容を書く\n'
    + '・「STEP〇」という見出しを出力する\n'
    + '・文字数が足りないまま終わる\n'
    + '・感情の直接説明（「悔しかった」→「奥歯を噛みしめた」等の間接表現を使う）\n'
    + '・AI音声誤読防止：「方」→ほう/かた、「後」→あと、「行った」→いった';
}

// apps/scenario-app/Prompts.gsのSTEP_DEFINITIONSと同じ並び・同じminChars（名称のみ参照用）
var STEP_NAMES_AND_MIN_CHARS = [
  { name: 'STEP0【導入・フック】', minChars: 400 },
  { name: 'STEP1【屈辱の始まり】', minChars: 1000 },
  { name: 'STEP2【静かな積み上げ】', minChars: 1500 },
  { name: 'STEP3【事件発生と理不尽】', minChars: 1500 },
  { name: 'STEP4【追放と水面下の反転】', minChars: 1500 },
  { name: 'STEP5【完全逆転・公開断罪】', minChars: 1500 },
  { name: 'STEP6【救済と再出発】', minChars: 1000 },
  { name: 'STEP7【締め】', minChars: 500 }
];

// ---- ① 各アナリストが独立に評価 ----
function buildPersonaSystemPrompt(persona) {
  return 'あなたはYouTube逆転スカッと系動画の視聴者・専門家として、台本を客観的に評価する役割です。\n'
    + 'あなたの人物像：' + persona.name + '\n'
    + 'あなたの評価観点：' + persona.focus + '\n'
    + '\n'
    + '採点や合否判定は不要です。指定された観点から見た具体的な良い点・気になる点・改善できる箇所を、\n'
    + '台本内の該当箇所（STEP番号や該当セリフを引用）を明示しながら指摘してください。\n'
    + '抽象的な感想ではなく、次の修正作業者がそのまま手を入れられる粒度の具体的な指摘にしてください。\n'
    + 'ストーリーの結末や主要キャラクターの運命そのものを変える提案はしないでください（部分修正の前提）。';
}

function buildPersonaUserPrompt(title, design, steps) {
  var msg = 'タイトル：「' + title + '」\n\nシナリオ設計：\n' + design + '\n\n台本全文：\n';
  for (var i = 0; i < steps.length; i++) {
    msg += '\n--- ' + STEP_NAMES_AND_MIN_CHARS[i].name + ' ---\n' + steps[i] + '\n';
  }
  msg += '\n上記の台本を、あなたの観点から評価してください。';
  return msg;
}

// ---- ② 統合意見 ----
function buildIntegrateSystemPrompt() {
  return 'あなたは複数のアナリスト意見を統合し、修正方針を決定するディレクター役です。\n'
    + '各アナリストの指摘の中から、複数人が共通して挙げている問題・台本の根本的な弱点を優先してください。\n'
    + '一人だけの個人的な好みに偏った指摘は採用しなくてよいです。\n'
    + '出力は「採用する修正方針」を、対象STEPごとに具体的な修正指示として箇条書きでまとめてください。\n'
    + '指摘が無いSTEPは明記不要です（そのSTEPは無変更になります）。\n'
    + '修正は元のタイトル・シナリオ設計の範囲内に収まるようにし、結末や主要キャラクターの運命を変える指摘は採用しないでください。';
}

function buildIntegrateUserPrompt(title, feedbacks) {
  var msg = 'タイトル：「' + title + '」\n\n各アナリストの意見：\n';
  for (var i = 0; i < feedbacks.length; i++) {
    msg += '\n=== ' + feedbacks[i].name + '（観点：' + feedbacks[i].focus + '）===\n' + feedbacks[i].feedback + '\n';
  }
  msg += '\n上記を統合し、採用すべき修正方針をSTEPごとにまとめてください。';
  return msg;
}

// ---- ③ 統合意見に基づくSTEP単位の部分修正 ----
function buildRevisionSystemPrompt(stepIndex, minChars, integratedPlan) {
  var stepName = STEP_NAMES_AND_MIN_CHARS[stepIndex].name;
  return 'あなたはYouTube逆転スカッと系動画専門の台本ライターです。\n'
    + '「YouTube逆転スカッと台本マニュアル Ver2」に完全準拠して、' + stepName + ' を修正します。\n'
    + '\n'
    + buildCommonRules_(minChars)
    + '\n\n=== 修正方針（アナリストFBの統合意見より） ===\n'
    + integratedPlan
    + '\n\n=== 修正の制約 ===\n'
    + '・このSTEPに関係する指摘のみを反映し、関係ない指摘は無視してよい\n'
    + '・このSTEPに関する指摘が無ければ、現在のテキストをそのまま出力してよい（変更不要）\n'
    + '・ストーリーの一貫性・キャラクターの口調・場面設定を変更してはならない\n'
    + '・タイトル・シナリオ設計の範囲を超える展開・設定変更は禁止\n'
    + '・文字数ルールは修正後も厳守すること';
}

function buildRevisionUserPrompt(title, design, prevStepsText, currentText, stepName, minChars) {
  var msg = 'シナリオ設計：\n' + design + '\n\nタイトル：「' + title + '」\n\n';
  if (prevStepsText) {
    msg += '【前のSTEPまでの台本（参照用、変更しない）】\n' + prevStepsText + '\n\n';
  }
  msg += '【現在の' + stepName + '】\n' + currentText + '\n\n';
  msg += '上記を修正方針に沿って修正し、' + stepName + ' の全文を出力してください（必要文字数' + minChars + '字以上を維持）。このSTEPのみを出力してください。';
  return msg;
}

// apps/scenario-app/WebApi.gsのcountEffective_と同一ロジック（実質文字数：【名前】「」== ==・空白を除く）
function countEffective_(text) {
  var t = text || '';
  t = t.replace(/【[^】]*】/g, '');
  t = t.replace(/[「」]/g, '');
  t = t.replace(/==\s*[^=\n]*\s*==/g, '');
  t = t.replace(/[\s\n\r\t]/g, '');
  return t.length;
}
