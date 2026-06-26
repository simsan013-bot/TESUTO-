// パイプラインの工程順序・ゲート位置の対応表。
// apps/producer/Pipeline.gsのPIPELINE_EXECUTION_ORDER/PIPELINE_GATE_AFTERと
// 同じ工程名・同じ構造を維持する（詳細はdocs/automation-node-plan.md参照）。
// PIPELINE_EXECUTORSはNode版ではsrc/stages/index.jsに定義する（関数呼び出しのみで
// HTTP・合言葉のレイヤーが不要なため、ここでは工程名と実行関数を直接対応付ける）。

const PIPELINE_EXECUTION_ORDER = [
  'シナリオ',
  'アナリストFB',
  '圧縮',
  'キャラ別台本',
  '音声',
  '猫感想',
  '画像',
  '編集',
  'サムネ',
  '投稿',
];

const PIPELINE_GATE_AFTER = {
  アナリストFB: 'A',
  圧縮: 'B',
  編集: 'C',
  サムネ: '最終確認',
};

function getNextProcessName(currentProcess) {
  if (!currentProcess) {
    return PIPELINE_EXECUTION_ORDER[0];
  }
  const index = PIPELINE_EXECUTION_ORDER.indexOf(currentProcess);
  if (index === -1 || index === PIPELINE_EXECUTION_ORDER.length - 1) {
    return null;
  }
  return PIPELINE_EXECUTION_ORDER[index + 1];
}

module.exports = {
  PIPELINE_EXECUTION_ORDER,
  PIPELINE_GATE_AFTER,
  getNextProcessName,
};
