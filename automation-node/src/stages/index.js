// apps/producer/Pipeline.gsのPIPELINE_EXECUTORS・Code.gsのbuildStagePayload_/
// saveStageResult_を1つにまとめたもの。GAS版はexecutor（外部AppへのHTTP呼び出し）と
// 入力payloadの組み立て（buildStagePayload_）・出力の保存（saveStageResult_）が
// 別関数に分かれていたが、これはGAS側がHTTPの「合言葉付きJSON body」という
// 共通プロトコルでやり取りしていたための分離。Node版は同一プロセス内の関数呼び出しで
// 工程ごとに引数の形が異なるため、「前工程の出力を読む→実行する→自分の出力を保存する」
// を1工程1関数にまとめている（最終成果物の等価性は維持：保存するoutputIdの意味・
// 各工程が読む入力データの内容はGAS版のbuildStagePayload_/saveStageResult_と同一）。
// 「編集」「サムネ」「投稿」はGAS版同様、入力payloadの組み立てに必要なAppが未実装のため
// 実行関数を登録していない（producerTick.jsはexecutorが無い工程は待機のままにする）。

const path = require('path');
const { saveTextAsFile, loadFileText, buildStepsDocText, parseStepsDocText } = require('../storage/textFiles');
const { saveJsonFile, loadJsonFile } = require('../storage/jsonFiles');

const { runScenarioPipeline } = require('./scenarioApp');
const { runAnalystFeedback } = require('./analystFeedbackApp');
const { runCompressionStage } = require('./compressionTool');
const { generateModelDocs } = require('./characterScriptApp');
const { runFishAudioStage } = require('./fishAudioTts');
const { runCatCommentary } = require('./catCommentaryApp');
const { runImageStage } = require('./imageStage');

function loadStepsOutput(outputId) {
  return parseStepsDocText(loadFileText(outputId));
}

function saveStepsOutput(work, processName, fileNameSuffix, result) {
  const docText = buildStepsDocText(result.title, result.design, result.steps);
  const fileName = `No${work.work_id}_${processName}${fileNameSuffix || ''}`;
  return saveTextAsFile(work.folder_path, fileName, docText);
}

// buildStagePayload_('シナリオ',...)＋saveStageResult_の対応部分
async function runScenarioStage({ work }) {
  const result = await runScenarioPipeline(work.ref_scenario, work.title);
  const outputId = saveStepsOutput(work, 'シナリオ', '', result);
  return { ok: true, ...result, outputId };
}

// buildStagePayload_('アナリストFB',...)＋saveStageResult_の対応部分
async function runAnalystFeedbackStage({ work }) {
  const scenarioOutputId = work.processStates.シナリオ.output_id;
  const scenarioOutput = loadStepsOutput(scenarioOutputId);
  const result = await runAnalystFeedback(scenarioOutput.title, scenarioOutput.design, scenarioOutput.steps);
  const outputId = saveStepsOutput(work, 'アナリストFB', '_修正版', result);
  return { ok: true, ...result, outputId };
}

// buildStagePayload_('圧縮',...)＋saveStageResult_の対応部分（GAS版はspreadsheetIdを
// そのまま出力IDとしていたが、Node版はJSONファイルパスを出力IDとする）
async function runCompressionStageExecutor({ work }) {
  const feedbackOutputId = work.processStates.アナリストFB.output_id;
  const feedbackOutput = loadStepsOutput(feedbackOutputId);
  const script = feedbackOutput.steps.join('\n\n');
  const result = await runCompressionStage(script, '', feedbackOutput.design);
  const outputId = saveJsonFile(work.folder_path, `No${work.work_id}_圧縮`, result);
  return { ok: true, ...result, outputId };
}

// buildStagePayload_('キャラ別台本',...)＋saveStageResult_の対応部分
async function runCharacterScriptStage({ work }) {
  const compressionOutputId = work.processStates.圧縮.output_id;
  const compressionOutput = loadJsonFile(compressionOutputId);
  const outputFolder = path.join(work.folder_path, 'キャラ別台本');
  const result = generateModelDocs(compressionOutput.scriptRows, compressionOutput.voiceRows, outputFolder);
  const outputId = saveJsonFile(work.folder_path, `No${work.work_id}_キャラ別台本`, result);
  return { ok: result.success, ...result, outputId };
}

// buildStagePayload_('音声',...)＋saveStageResult_の対応部分
async function runVoiceStage({ work }) {
  const charScriptOutputId = work.processStates.キャラ別台本.output_id;
  const charScriptOutput = loadJsonFile(charScriptOutputId);
  const outputFolder = path.join(work.folder_path, '音声');
  const result = await runFishAudioStage(charScriptOutput.docRecords, outputFolder, true);
  const outputId = saveJsonFile(work.folder_path, `No${work.work_id}_音声`, result);
  return { ok: true, ...result, outputId };
}

// buildStagePayload_('猫感想',...)＋saveStageResult_の対応部分
async function runCatCommentaryStage({ work }) {
  const feedbackOutputId = work.processStates.アナリストFB.output_id;
  const feedbackOutput = loadStepsOutput(feedbackOutputId);
  const scenario = feedbackOutput.steps.join('\n\n');
  const output = await runCatCommentary(scenario);
  const outputId = saveTextAsFile(work.folder_path, `No${work.work_id}_猫感想`, output);
  return { ok: true, output, outputId };
}

// buildStagePayload_('画像',...)＋saveStageResult_の対応部分（GAS版同様、出力IDは
// 実体のファイルパスではなく「○枚生成（キャラ○・シーン○）」という説明文字列）
async function runImageStageExecutor({ work }) {
  const feedbackOutputId = work.processStates.アナリストFB.output_id;
  const feedbackOutput = loadStepsOutput(feedbackOutputId);
  const compressionOutputId = work.processStates.圧縮.output_id;
  const compressionOutput = loadJsonFile(compressionOutputId);
  const outputFolder = path.join(work.folder_path, '画像');
  const result = await runImageStage(work.work_id, feedbackOutput.design, compressionOutput.script, outputFolder);
  const outputId = `${(result.results || []).length}枚生成（キャラ${result.characterCount || 0}・シーン${result.totalScenes || 0}）`;
  return { ok: true, ...result, outputId };
}

const PIPELINE_EXECUTORS = {
  シナリオ: runScenarioStage,
  アナリストFB: runAnalystFeedbackStage,
  圧縮: runCompressionStageExecutor,
  キャラ別台本: runCharacterScriptStage,
  音声: runVoiceStage,
  猫感想: runCatCommentaryStage,
  画像: runImageStageExecutor,
};

module.exports = { PIPELINE_EXECUTORS };
