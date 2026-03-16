require('dotenv').config();
const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const IMAGEN_MODEL = process.env.IMAGEN_MODEL || 'imagen-3.0-generate-001';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001';

// Google Auth setup
let authClient = null;

async function getAccessToken() {
  if (!authClient) {
    const credentials = process.env.GOOGLE_CREDENTIALS_JSON
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
      : undefined;

    authClient = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  const client = await authClient.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// ===== Vertex AI: Gemini Text =====
async function callGemini(prompt) {
  const token = await getAccessToken();
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 65536,
        responseMimeType: 'text/plain',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ===== Vertex AI: Imagen =====
async function callImagen(prompt, aspectRatio = '1:1') {
  const token = await getAccessToken();
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${IMAGEN_MODEL}:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
        safetyFilterLevel: 'BLOCK_SOME',
        personGeneration: 'ALLOW_ADULT',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagen API error: ${err}`);
  }

  const data = await res.json();
  const prediction = data.predictions?.[0];
  if (!prediction) throw new Error('No image generated');

  return {
    image: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType || 'image/png',
  };
}

// ===== API Routes =====

// 1. Generate character image prompt from description
app.post('/api/character/prompt', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const geminiPrompt = `You are an expert at creating image generation prompts for AI image generators.
Based on the following character description, create a detailed English image prompt.
Include: physical appearance, hair, eyes, clothing, style, expression, and art style (anime/illustration).
Output ONLY the prompt text, nothing else. Do not use bullet points or line breaks.

Character Description (Japanese):
${description}`;

    const prompt = await callGemini(geminiPrompt);
    res.json({ prompt: prompt.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Generate image using Imagen
app.post('/api/image/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio = '1:1' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const result = await callImagen(prompt, aspectRatio);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Split scenario into scenes with prompts
app.post('/api/scenario/split', async (req, res) => {
  try {
    const { scenario, sceneCount, characterRef } = req.body;
    if (!scenario || !sceneCount) {
      return res.status(400).json({ error: 'scenario and sceneCount are required' });
    }

    const geminiPrompt = `You are a visual storyteller and AI image prompt creator.

CHARACTER REFERENCE (must appear in every image prompt):
${characterRef}

SCENARIO:
${scenario}

TASK:
Split the scenario above into exactly ${sceneCount} scenes distributed evenly.
For each scene create a detailed English image generation prompt.

Output a JSON array with EXACTLY ${sceneCount} objects. Output ONLY valid JSON with NO markdown formatting, NO code blocks:
[
  {
    "sceneNumber": 1,
    "sceneText": "シーンの要約（日本語、1〜2文）",
    "imagePrompt": "Detailed English prompt describing the scene. ALWAYS include character appearance. Describe setting, action, lighting, mood, anime illustration style."
  }
]

RULES:
- The sceneText must be in Japanese
- The imagePrompt must be in English
- Every imagePrompt must include character appearance details for visual consistency
- Output ONLY the JSON array, absolutely no other text`;

    const text = await callGemini(geminiPrompt);

    // Clean and parse JSON
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const scenes = JSON.parse(cleaned);
    if (!Array.isArray(scenes)) throw new Error('Invalid response format');

    res.json({ scenes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    project: PROJECT_ID,
    location: LOCATION,
    imagenModel: IMAGEN_MODEL,
    geminiModel: GEMINI_MODEL,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎨 Scenario Image Generator`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Project: ${PROJECT_ID || '(not set)'}`);
  console.log(`   Location: ${LOCATION}`);
  console.log(`   Imagen model: ${IMAGEN_MODEL}`);
  console.log(`   Gemini model: ${GEMINI_MODEL}\n`);
});
