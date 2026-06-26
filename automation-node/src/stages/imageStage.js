// apps/producer/ExternalApps.gs の runImageStage_ とその補助関数
// （deriveCharacterBareName_/extractCharacterFrontPrompt_/generateCharacterReferenceImages_/
// estimateTotalScenes_/generateAllScenePromptsInBatches_/applyRefLabelSubstitution_/
// runImageGenInChunks_）を移植したもの。文字数からシーン数を概算する式・
// 正面プロンプト抽出の正規表現・ラベル置換ロジックはGAS版と同一。
//
// GAS版はPRP生成App/画像生成Appが別Webアプリだったため、(a) 参照画像をDrive+
// 「参照画像」シートのラベル→URL表で受け渡し、(b) GASの6分実行上限を避けるため
// シーン画像生成をIMAGE_GEN_CHUNK_SIZE件ずつのHTTP呼び出しに分割していた。
// Node版は同一プロセス内呼び出しのため、(a) はrefImageMap（label→ローカル
// ファイルパス）に置き換え、(b) のチャンク分割自体は不要（imageGenerator側の
// 1.5秒スリープが本質的なレート制御であり、チャンク境界には意味がないため）。
// また「圧縮」工程の出力（script）はNode版ではスプシ往復なしに直接渡されるため、
// readCompressedScriptText_に相当する読み戻しステップも不要。

const path = require('path');
const { generateCharacterPrompts, generateSceneBatch, sceneBatchTextToRows } = require('./prpGenerator');
const { generateOneImage, generateImagesForPrompts } = require('./imageGenerator');

// deriveCharacterBareName_と同一ロジック
function deriveCharacterBareName(name) {
  return (name || '').split('（')[0].split('・')[0].trim();
}

// extractCharacterFrontPrompt_と同一ロジック
function extractCharacterFrontPrompt(content) {
  const fixedMatch = content.match(/キャラクター固定設定\s*\n([\s\S]*?)\n\s*服装固定/);
  const costumeMatch = content.match(/服装固定\s*\n([\s\S]*?)\n\s*\[視点1/);
  const frontMatch = content.match(/\[視点1[^\]]*\]\s*\n?Prompt:\s*\n?([\s\S]*?)(?=\n\[視点2|\n---END---|$)/);
  const parts = [];
  if (fixedMatch) parts.push(fixedMatch[1].trim());
  if (costumeMatch) parts.push(costumeMatch[1].trim());
  if (frontMatch) parts.push(frontMatch[1].trim());
  if (parts.length === 0) return content.trim();
  return parts.join('\n');
}

// generateCharacterReferenceImages_のNode版。画像生成AppのregisterRef
// （参照画像シートへのラベル登録）に相当する部分は、refImageMapへの
// label→ローカルファイルパスの記録に置き換えている。
async function generateCharacterReferenceImages(workId, characters, outputFolder) {
  const substitutions = {};
  const refImageMap = {};

  for (const character of characters) {
    const bareName = deriveCharacterBareName(character.name);
    if (!bareName) continue;

    const label = 'No' + workId + '_' + bareName;
    const prompt = extractCharacterFrontPrompt(character.content);

    const result = await generateOneImage(prompt, { outputFolder: path.join(outputFolder, 'characters'), fileName: label });
    if (!result.ok) {
      throw new Error('キャラクター参照画像生成エラー（' + bareName + '）: ' + result.error);
    }

    refImageMap[label] = result.filePath;
    substitutions[bareName] = label;
  }

  return { substitutions, refImageMap };
}

// estimateTotalScenes_と同一ロジック
function estimateTotalScenes(script) {
  const effectiveLen = (script || '').replace(/[「」、。！？…・　\s『』（）【】―～]/g, '').length;
  const scenes = Math.round(effectiveLen / 200);
  return Math.max(10, Math.min(150, scenes));
}

// generateAllScenePromptsInBatches_と同一ロジック（PRP生成Appの内部
// SCENE_BATCH_SIZEに合わせてbatchIndexを進めながら全シーン分のrowsを集める）
async function generateAllScenePromptsInBatches(script, totalScenes) {
  let allRows = [];
  let batchIndex = 0;
  const maxIterations = totalScenes + 5;

  for (let i = 0; i < maxIterations; i++) {
    const batch = await generateSceneBatch(script, totalScenes, batchIndex);
    if (!batch || batch.startScene > totalScenes) break;
    allRows = allRows.concat(sceneBatchTextToRows(batch.text));
    if (batch.endScene >= totalScenes) break;
    batchIndex++;
  }
  return allRows;
}

function escapeRegexForLabel(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// applyRefLabelSubstitution_と同一ロジック
function applyRefLabelSubstitution(rows, substitutions) {
  return rows.map((row) => {
    let text = row;
    for (const bareName in substitutions) {
      const pattern = new RegExp('\\[\\[' + escapeRegexForLabel(bareName) + '\\]\\]', 'g');
      text = text.replace(pattern, '[[' + substitutions[bareName] + ']]');
    }
    return text;
  });
}

// runImageStage_のNode版。design（アナリストFB修正後の【登場人物設計】）と
// script（圧縮工程の出力テキスト）から、キャラクター参照画像→シーン画像までを
// 1関数で連結する。
async function runImageStage(workId, design, script, outputFolder) {
  const characters = await generateCharacterPrompts(design);

  const { substitutions, refImageMap } = await generateCharacterReferenceImages(workId, characters, outputFolder);

  const totalScenes = estimateTotalScenes(script);
  const sceneRows = await generateAllScenePromptsInBatches(script, totalScenes);
  const labeledRows = applyRefLabelSubstitution(sceneRows, substitutions);

  const { results } = await generateImagesForPrompts(labeledRows, {
    refImageMap,
    outputFolder: path.join(outputFolder, 'scenes'),
    fileNamePrefix: 'scene',
  });

  return { ok: true, results, totalScenes, characterCount: characters.length };
}

module.exports = {
  runImageStage,
  deriveCharacterBareName,
  extractCharacterFrontPrompt,
  generateCharacterReferenceImages,
  estimateTotalScenes,
  generateAllScenePromptsInBatches,
  applyRefLabelSubstitution,
};
