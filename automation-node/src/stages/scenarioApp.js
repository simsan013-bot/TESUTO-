// apps/scenario-app/Code.gs (designScenario_/checkSimilarity_/writeStep_/regenerateStep_)
// と apps/scenario-app/WebApi.gs (runScenarioPipeline_/countEffective_) を
// 1つの実行関数にまとめたもの。プロンプト構築・STEP再生成判定ロジックは
// GAS版と同一（MAX_REGEN_ATTEMPTS = 2）。AI呼び出し先はsrc/clients/anthropic.jsに統一。

const { callClaude } = require('../clients/anthropic');
const {
  SYS_ANALYZE,
  SYS_DESIGN,
  buildCheckSystem,
  buildStepSystem,
  buildRegenSystem,
  buildStepUser,
  STEP_DEFINITIONS,
  getRandomNameTable,
} = require('../prompts/scenarioApp');

const MAX_REGEN_ATTEMPTS = 2;

// index.htmlのcountEffective()と同一ロジック（実質文字数：【名前】「」== ==・空白を除く）
function countEffective(text) {
  let t = text || '';
  t = t.replace(/【[^】]*】/g, '');
  t = t.replace(/[「」]/g, '');
  t = t.replace(/==\s*[^=\n]*\s*==/g, '');
  t = t.replace(/[\s\n\r\t]/g, '');
  return t.length;
}

async function designScenario(refScenario, newTitle) {
  const analysis = await callClaude(SYS_ANALYZE, '以下の参考シナリオを解析してください：\n\n' + refScenario);
  const titleLine = newTitle
    ? '\n\n新規シナリオタイトル（ユーザー指定）：「' + newTitle + '」\nこのタイトルの内容・雰囲気・設定を最大限に反映してシナリオを設計すること。'
    : '';
  const design = await callClaude(
    SYS_DESIGN,
    '参考シナリオ解析結果：\n' + analysis
      + titleLine
      + '\n\n上記をもとに新規シナリオを設計してください。\n'
      + '登場人物の名前は、以下の名前データを参考に、年齢・性別に合った自然な日本人名を毎回新しく創作してください。\n'
      + 'リストから選ぶのではなく、このデータが示す命名センス・世代感を参考に、重複しない新しい名前を考案してください。\n'
      + '同じ姓や名の繰り返しは禁止。読み仮名を必ず付けること。\n\n'
      + getRandomNameTable(12)
  );
  return design;
}

async function checkSimilarity(refScenario, scenarioDesign) {
  const sys = buildCheckSystem();
  const msg = '【元シナリオ（参考）】\n' + refScenario
    + '\n\n【新規シナリオ設計（チェック対象）】\n' + scenarioDesign
    + '\n\n上記の元シナリオを学習し、新規シナリオ設計との酷似性チェックを実施してください。'
    + '報告フォーマットに従って出力してください。';
  return callClaude(sys, msg);
}

async function writeStep(design, title, stepNum, prevText) {
  const stepInfo = STEP_DEFINITIONS[stepNum];
  const sys = buildStepSystem(stepNum, stepInfo.minChars, stepInfo.instruction);
  const user = buildStepUser(design, title, stepInfo.name, prevText, null, stepInfo.minChars);
  return callClaude(sys, user);
}

async function regenerateStep(design, title, stepNum, prevText, currentText) {
  const stepInfo = STEP_DEFINITIONS[stepNum];
  const sys = buildRegenSystem(stepNum, stepInfo.minChars, stepInfo.instruction);
  const user = buildStepUser(design, title, stepInfo.name, prevText, currentText, stepInfo.minChars);
  return callClaude(sys, user);
}

// runScenarioPipeline_(body) のNode版。refScenario/titleを受け取り
// { title, design, check, steps, script } を返す。
async function runScenarioPipeline(refScenario, title) {
  refScenario = (refScenario || '').toString().trim();
  title = (title || '').toString().trim();
  if (!refScenario) throw new Error('refScenario が空です。');
  if (!title) throw new Error('title が空です。');

  const design = await designScenario(refScenario, title);
  const check = await checkSimilarity(refScenario, design);

  const stepTexts = [];
  for (let stepNum = 0; stepNum < STEP_DEFINITIONS.length; stepNum++) {
    const minChars = STEP_DEFINITIONS[stepNum].minChars;
    const prevText = stepTexts.join('\n\n');

    let text = await writeStep(design, title, stepNum, prevText);

    let attempt = 0;
    while (countEffective(text) < minChars && attempt < MAX_REGEN_ATTEMPTS) {
      text = await regenerateStep(design, title, stepNum, prevText, text);
      attempt++;
    }

    stepTexts.push(text);
  }

  return {
    title,
    design,
    check,
    steps: stepTexts,
    script: stepTexts.join('\n\n'),
  };
}

module.exports = {
  runScenarioPipeline,
  designScenario,
  checkSimilarity,
  writeStep,
  regenerateStep,
  countEffective,
};
