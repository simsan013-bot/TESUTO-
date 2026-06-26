// apps/image-generator/ImageGeneration.gs の translateToImagePrompt/callGeminiImageAPI
// （Gemini API呼び出し部分）を移植したもの。エンドポイント・モデルID・payload構造・
// レスポンス解釈（finishReason/inlineData抽出ロジック）はGAS版と同一。
// APIキーは環境変数 GEMINI_API_KEY から読む。

const { TRANSLATE_SYSTEM_INSTRUCTION, maskKeptQuotes, unmaskKeptQuotes } = require('../prompts/imageGenerator');

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const TEXT_MODEL = 'gemini-2.5-flash';

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  return key;
}

// translateToImagePromptと同一ロジック
async function translateToImagePrompt(promptJa) {
  const apiKey = getApiKey();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`;

  const { masked, kept } = maskKeptQuotes(promptJa);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: TRANSLATE_SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: masked }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || `HTTP ${res.status}`);
  }
  const translated = (json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text || '').trim();
  return unmaskKeptQuotes(translated, kept);
}

// callGeminiImageAPIと同一ロジック。refImages = [{ label, base64, mimeType }]
// 戻り値: { buffer, mimeType } または画像が返らなかった場合はnull
async function callGeminiImageAPI(prompt, refImages) {
  const apiKey = getApiKey();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const parts = [];
  if (refImages && refImages.length > 0) {
    for (const img of refImages) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }
    const imageDesc = refImages.map((img, i) => `${i + 1}枚目の画像：${img.label}`).join('、');
    parts.push({ text: `【参照画像について】${imageDesc}\n\n${prompt}` });
  } else {
    parts.push({ text: prompt });
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || `HTTP ${res.status}`);
  }

  const resParts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
  for (const part of resParts) {
    if (part && part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.indexOf('image/') === 0) {
      return { buffer: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType };
    }
  }

  const finishReason = (json.candidates && json.candidates[0] && json.candidates[0].finishReason) || '';
  const textJoined = resParts.filter((p) => p.text).map((p) => p.text).join(' ').trim();
  if (finishReason && finishReason !== 'STOP') throw new Error(`生成中断（finishReason: ${finishReason}）`);
  if (textJoined) throw new Error(`モデルが画像を返しませんでした：「${textJoined.substring(0, 80)}…」`);
  return null;
}

module.exports = { translateToImagePrompt, callGeminiImageAPI, IMAGE_MODEL, TEXT_MODEL };
