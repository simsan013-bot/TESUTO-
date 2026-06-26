// apps/compression-tool/WebApi.gs (runCompressionPipeline_/countChars_) と
// Code.gs (parseScriptToRows/formatForSheet/selectVoiceModels/exportForProducer_の
// スプシ生成ロジック部分を除いたコア) を移植したもの。
// AI呼び出し順序・プロンプト文面はGAS版と同一。
// mode:'export'相当（タブ1台本/タブ2作品No音声モデル）はGoogle Sheats依存を排し、
// 同じ行データ・voice割当データをプレーンなJSオブジェクトとして返す
// （保存形式は自由に最適化してよい範囲のため、Sheet生成コードはポートしていない）。

const { callClaude } = require('../clients/anthropic');
const {
  buildBiblePrompt,
  buildSystemPrompt,
  buildDigestPrompt,
  buildKiPrompt,
  buildShoPrompt,
  buildTenPrompt,
  buildKetsuPrompt,
} = require('../prompts/compressionTool');
const {
  VOICE_MODEL_LIST,
  buildDetectCharacterRolesPrompt,
  buildSelectVoiceModelsPrompt,
} = require('../prompts/characterScriptApp');

const CLAUDE_OPTIONS = { maxTokens: 16000, retry: { maxRetry: 3, retryWaitSec: 70 } };

function callClaudeForPipeline(systemPrompt, userMessage) {
  return callClaude(systemPrompt, userMessage, CLAUDE_OPTIONS);
}

// index.htmlのcountChars()と同一ロジック（純セリフ文字数：===指示===・【名前】・「」・空白記号を除く）
function countChars(text) {
  if (!text) return 0;
  let t = text;
  t = t.replace(/===[^=]*===/g, '');
  t = t.replace(/【[^】]*】/g, '');
  t = t.replace(/[「」]/g, '');
  t = t.replace(/[\s　\n\r。、！？…・『』（）()\[\]{}.,!?\-—―～－：:；;《》〈〉""'']/g, '');
  return t.length;
}

// runCompressionPipeline_(body) のNode版。
// script: 元のシナリオ本文, chars: キャラクター設定（任意）, design: シナリオ設計書（任意）
async function runCompressionPipeline(script, chars, design) {
  script = (script || '').toString().trim();
  chars = (chars || '').toString().trim();
  design = (design || '').toString().trim();
  if (!script) throw new Error('script が空です。');

  const isDesignDoc = design.length > 0;
  const bibleSource = isDesignDoc ? design : script;
  const storyBible = await callClaudeForPipeline(buildSystemPrompt(chars), buildBiblePrompt(bibleSource, isDesignDoc));

  const digest = await callClaudeForPipeline(buildSystemPrompt(chars), buildDigestPrompt(script, chars, storyBible));
  const ki = await callClaudeForPipeline(buildSystemPrompt(chars), buildKiPrompt(script, chars, digest, storyBible));
  const sho = await callClaudeForPipeline(buildSystemPrompt(chars), buildShoPrompt(script, chars, digest, ki, storyBible));
  const ten = await callClaudeForPipeline(buildSystemPrompt(chars), buildTenPrompt(script, chars, ki, sho, storyBible));
  const ketsu = await callClaudeForPipeline(buildSystemPrompt(chars), buildKetsuPrompt(script, chars, ten, storyBible));

  const charCounts = {
    digest: countChars(digest),
    ki: countChars(ki),
    sho: countChars(sho),
    ten: countChars(ten),
    ketsu: countChars(ketsu),
  };
  const totalChars = charCounts.digest + charCounts.ki + charCounts.sho + charCounts.ten + charCounts.ketsu;

  return {
    storyBible,
    digest,
    ki,
    sho,
    ten,
    ketsu,
    script: [digest, ki, sho, ten, ketsu].join('\n\n'),
    charCounts,
    totalChars,
  };
}

// Code.gsのformatForSheet/parseScriptToRowsと同一ロジック（台本タブの行データ化）
function formatForSheet(value) {
  if (typeof value === 'string' && value.startsWith('===')) return ' ' + value;
  return value;
}

function parseScriptToRows(text) {
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('===')) {
      rows.push([formatForSheet(trimmed), '']);
      continue;
    }
    const m = trimmed.match(/^【([^】]*)】「([\s\S]*)」\s*$/);
    if (m) { rows.push(['【' + m[1] + '】', m[2]]); continue; }
    const m2 = trimmed.match(/^(【[^】]*】)(.*)$/);
    if (m2) {
      const rest = m2[2].trim().replace(/^「/, '').replace(/」$/, '');
      rows.push([m2[1], rest]);
      continue;
    }
    rows.push([trimmed, '']);
  }
  return rows;
}

// Code.gsのbuildCharacterScriptSpreadsheet_のC/D列（LEN+SUBSTITUTE数式）と同一ロジック
const ROW_CHAR_SUBS = ['「','」','、','。','！','？','…','・','　',' ','『','』','（','）','【','】','―','～'];

function countRowChars(line) {
  let t = line || '';
  for (const s of ROW_CHAR_SUBS) t = t.split(s).join('');
  return t.length;
}

const ROLE_TAGS = ['MAIN', 'HERO', 'VILLAIN', 'KEY1', 'MOB_YM', 'MOB_OM', 'MOB_YF', 'MOB_OF'];

async function detectCharacterRoles(fullScript) {
  const { sys, userMsg } = buildDetectCharacterRolesPrompt(fullScript);
  const raw = await callClaude(sys, userMsg);
  const clean = raw.replace(/```[a-z]*|```/g, '').trim();
  return JSON.parse(clean);
}

async function selectVoiceModels(characterRoles, fullScript) {
  const { sys, userMsg } = buildSelectVoiceModelsPrompt(characterRoles, fullScript);
  try {
    const raw = await callClaude(sys, userMsg);
    const clean = raw.replace(/```[a-z]*|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return {};
  }
}

// exportForProducer_/buildCharacterScriptSpreadsheet_のNode版。
// Google Sheets出力の代わりに、タブ1（台本行）・タブ2（音声モデル割当）と
// 同じ内容をプレーンなJSオブジェクトとして返す。
async function buildCharacterScriptExport(fullScript, characterRoles) {
  if (!fullScript) throw new Error('台本が空です');
  if (!characterRoles) {
    characterRoles = await detectCharacterRoles(fullScript);
  }

  const rows = parseScriptToRows(fullScript);
  let cumulative = 0;
  const scriptRows = rows.map(([label, line]) => {
    const chars = countRowChars(line);
    cumulative += chars;
    return { label, line, chars, cumulativeChars: cumulative };
  });

  const voiceAssignment = await selectVoiceModels(characterRoles, fullScript);
  const voiceRows = ROLE_TAGS.map((role) => {
    const charName = (characterRoles[role] && characterRoles[role] !== '未登場') ? characterRoles[role] : '';
    const assigned = voiceAssignment[role] || {};
    return {
      tag: role,
      charName,
      voice_id: assigned.voice_id || '',
      speed: assigned.speed || '',
      emotion_tag: '',
    };
  });

  return { characterRoles, scriptRows, voiceRows };
}

module.exports = {
  runCompressionPipeline,
  countChars,
  parseScriptToRows,
  detectCharacterRoles,
  selectVoiceModels,
  buildCharacterScriptExport,
  VOICE_MODEL_LIST,
};
