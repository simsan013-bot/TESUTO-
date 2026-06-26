// apps/image-generator/ImageGeneration.gs (generateOneImage_) /
// WebApi.gs (generateImagesForApi_) / RefImages.gs (extractRefImages等) を移植したもの。
// プロンプト組み立てロジック（commonPrompt付加・[[ラベル]]参照画像抽出）・
// SLEEP_MS(1500ms)はGAS版と同一。
// GAS版は参照画像をGoogle Drive+「参照画像」シートのラベル→URL表で管理していたが、
// Node版はDrive依存を排し、呼び出し側が渡すrefImageMap（label→ローカルファイルパス）
// で同じ意味のラベル解決を行う（バックエンドの段取りの最適化）。
// なお自動実行パス（doPost mode:'generate'）はpromptJa（+commonPrompt）をそのまま
// Gemini画像APIに渡しており、translateToImagePromptは人手の「翻訳のみ実行」メニュー
// 専用の別経路だったため、このステージ実行関数でも同様に翻訳を挟まない。

const { callGeminiImageAPI } = require('../clients/gemini');
const { saveImageFile, loadImageAsBase64 } = require('../storage/mediaFiles');

const SLEEP_MS = 1500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// extractRefImagesと同一ロジック（Drive取得をローカルファイル読み込みに置換）
function resolveRefImages(prompt, refImageMap) {
  const matches = prompt.match(/\[\[([^\]]+)\]\]/g);
  if (!matches || matches.length === 0) return { images: [], missing: [] };

  const images = [];
  const seen = {};
  const missing = [];

  for (const raw of matches) {
    const label = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (seen[label]) continue;
    seen[label] = true;

    const filePath = refImageMap && refImageMap[label];
    if (!filePath) {
      missing.push(label);
      continue;
    }
    try {
      const { base64, mimeType } = loadImageAsBase64(filePath);
      images.push({ label, base64, mimeType });
    } catch (e) {
      missing.push(label);
    }
  }

  return { images, missing };
}

// generateOneImage_のNode版。outputFolder/fileNameを指定してローカルに保存する。
async function generateOneImage(promptJa, options) {
  const { commonPrompt = '', promptEnOverride = null, refImageMap = {}, outputFolder, fileName } = options;

  const usedEnOverride = !!promptEnOverride;
  const promptToUse = usedEnOverride ? promptEnOverride : (commonPrompt ? `${promptJa}\n\n${commonPrompt}` : promptJa);

  const { images: refImages, missing } = resolveRefImages(promptToUse, refImageMap);

  try {
    const result = await callGeminiImageAPI(promptToUse, refImages);
    if (!result) throw new Error('画像データが返されませんでした');

    const filePath = saveImageFile(outputFolder, fileName, result.buffer, result.mimeType);
    return {
      ok: true,
      filePath,
      missing,
      refLabels: refImages.map((img) => img.label),
    };
  } catch (e) {
    return { ok: false, error: e.message, missing, refLabels: [] };
  }
}

// generateImagesForApi_のNode版。rows（プロンプト文字列の配列）を1件ずつ画像生成する。
async function generateImagesForPrompts(rows, options) {
  const { commonPrompt = '', refImageMap = {}, outputFolder, fileNamePrefix = 'gemini' } = options;

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const promptJa = (rows[i] || '').toString().trim();
    if (!promptJa) continue;

    const fileName = `${fileNamePrefix}_row${i + 1}`;
    const result = await generateOneImage(promptJa, { commonPrompt, refImageMap, outputFolder, fileName });
    results.push({ promptJa, ...result });

    if (i < rows.length - 1) await sleep(SLEEP_MS);
  }
  return { ok: true, results };
}

module.exports = { generateOneImage, generateImagesForPrompts, resolveRefImages };
