// パイプラインの工程順序・ゲート位置・実行関数の対応表。
// 実行順は仕様書2章の流れに準拠（キューシートの列順とは独立に定義する）。

var PIPELINE_EXECUTION_ORDER = ['シナリオ', 'アナリストFB', '圧縮', 'キャラ別台本', '音声', '猫感想', '画像', '編集', 'サムネ', '投稿'];

// 各工程の後にSim確認ゲートが入る工程（仕様書2章のゲートA/B/C）
var PIPELINE_GATE_AFTER = {
  'アナリストFB': 'A',
  '圧縮': 'B',
  '編集': 'C',
  'サムネ': '最終確認'
};

// STEP3で接続済みの既存App呼び出し＋アナリストFB工程。未接続の工程
// （ディレクター/チェッカー/新規3App）はキーを持たず、STEP4以降の実装時にここへ追加する。
var PIPELINE_EXECUTORS = {
  'シナリオ': callScenarioApp_,
  'アナリストFB': callAnalystFeedbackApp_,
  '圧縮': runCompressionStage_,
  'キャラ別台本': callCharacterScriptApp_,
  '音声': callFishAudioTts_,
  '画像': runImageStage_
};

function getNextProcessName_(currentProcess) {
  if (!currentProcess) {
    return PIPELINE_EXECUTION_ORDER[0];
  }
  var index = PIPELINE_EXECUTION_ORDER.indexOf(currentProcess);
  if (index === -1 || index === PIPELINE_EXECUTION_ORDER.length - 1) {
    return null;
  }
  return PIPELINE_EXECUTION_ORDER[index + 1];
}
