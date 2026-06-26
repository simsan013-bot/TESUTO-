// apps/character-script-app/Code.gs (generateModelDocs/extractCharacterList) を移植したもの。
// このAppはAI呼び出しを一切行わない決定的なテキスト分割ロジックのみのため、
// 「AI-prompt/content-quality-affecting logic」の対象外（一字一句の制約はない）。
// ただし最終成果物（音声モデル別の台詞まとめ）の等価性のため、ブロック分割・
// 4000文字制限・台詞整形ロジックはGAS版と同じ挙動を再現する。
// 入力はGoogle Sheetsのタブ1/タブ2の代わりに、
// src/stages/compressionTool.jsのbuildCharacterScriptExportが返す
// { scriptRows, voiceRows } をそのまま使う。出力はGoogle Docsの代わりに
// src/storage/textFiles.jsでローカルの.txtファイルとして保存する。

const { saveTextAsFile } = require('../storage/textFiles');

function normalizeCharName(s) {
  const t = String(s).trim();
  if (!t) return '';
  if (t.charAt(0) === '【' && t.charAt(t.length - 1) === '】') return t;
  return '【' + t + '】';
}

function looksLikeCharName(s) {
  return /[぀-鿿]/.test(String(s));
}

function countDialogueChars(text) {
  if (!text) return 0;
  let t = String(text);
  t = t.replace(/[「」\s　\n\r。、！？…・『』（）\(\)\[\]\{\}\.,!?\-—―～－：:；;《》〈〉]/g, '');
  return t.length;
}

function wrapDialogue(text) {
  const t = String(text).trim();
  if (!t) return '「」';
  if (t.charAt(0) === '「' && t.charAt(t.length - 1) === '」') return t;
  return '「' + t + '」';
}

function stripBrackets(charName) {
  return String(charName).replace(/^【|】$/g, '').trim();
}

const EXCLUDE_LIST = ['キャラ', 'キャラ／指示', '指示', 'ナレーター', 'キャラ名'];

// generateModelDocsのNode版。scriptRows/voiceRowsからモデル別の台詞ブロックを
// 組み立て、outputFolderにテキストファイルとして保存する。
function generateModelDocs(scriptRows, voiceRows, outputFolder) {
  const logs = [];

  const charModelMap = {};
  const modelCharsMap = {};
  for (const v of voiceRows) {
    const rawChar = (v.charName || '').trim();
    const modelId = (v.voice_id || '').trim();
    if (!rawChar || !modelId) continue;
    if (!looksLikeCharName(rawChar)) continue;
    const charKey = normalizeCharName(rawChar);
    charModelMap[charKey] = modelId;
    if (!modelCharsMap[modelId]) modelCharsMap[modelId] = [];
    modelCharsMap[modelId].push(charKey);
  }

  const allModels = Object.keys(modelCharsMap);
  if (allModels.length === 0) {
    return { success: false, logs: logs.concat(['❌ エラー：voiceRowsに有効なモデル設定がありません']) };
  }
  logs.push('✅ モデルマップ作成完了：' + allModels.length + ' モデル');

  const blocks = [];
  let currentBlock = [];
  for (const row of scriptRows) {
    const cellA = (row.label || '').toString().trim();
    const cellB = (row.line || '').toString().trim();
    if (!cellA) continue;

    if (cellA === '===SPLIT===' || cellA === '=====SPLIT=====') {
      blocks.push(currentBlock);
      currentBlock = [];
      continue;
    }
    if (cellA.charAt(0) === '=' && cellA.charAt(cellA.length - 1) === '=') {
      currentBlock.push({ type: 'scene', text: cellA });
      continue;
    }
    if (EXCLUDE_LIST.includes(cellA) || EXCLUDE_LIST.some((e) => cellA === '【' + e + '】')) continue;

    const isChar = (cellA.charAt(0) === '【' && cellA.charAt(cellA.length - 1) === '】') || looksLikeCharName(cellA);
    if (isChar) {
      const normA = normalizeCharName(cellA);
      const assigned = charModelMap[normA] || null;
      currentBlock.push({ type: 'dialogue', charName: normA, model: assigned, text: cellB, unassigned: !assigned });
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);
  logs.push('✅ 台本解析完了：' + blocks.length + ' ブロック');

  const unassignedMap = {};
  for (const block of blocks) {
    for (const lr of block) {
      if (lr.type === 'dialogue' && lr.unassigned) unassignedMap[lr.charName] = true;
    }
  }
  const unassignedKeys = Object.keys(unassignedMap);
  if (unassignedKeys.length > 0) {
    logs.push('⚠️ モデル未割当キャラ（除外）：' + unassignedKeys.map(stripBrackets).join('、'));
  }

  for (let b = 0; b < blocks.length; b++) {
    let bTotal = 0;
    for (const item of blocks[b]) {
      if (item.type === 'dialogue') bTotal += countDialogueChars(item.text);
    }
    if (bTotal > 4000) logs.push('⚠️ ブロック' + (b + 1) + '：合計 ' + bTotal + '文字（上限4000超）');
  }

  let totalGenerated = 0;
  const docRecords = [];
  const createdAt = new Date().toISOString();

  for (const modelId of allModels) {
    const filePrefix = stripBrackets(modelCharsMap[modelId][0]);
    const modelCharLabels = modelCharsMap[modelId].map(stripBrackets).join(' / ');

    const docSegments = [];
    let currentDocLines = [];
    let currentDocCharCount = 0;

    for (const block of blocks) {
      const blockLines = [];
      let blockCharCount = 0;
      for (const item of block) {
        if (item.type === 'scene') {
          blockLines.push({ type: 'scene', text: item.text });
        } else if (item.type === 'dialogue' && item.model === modelId) {
          blockLines.push({ type: 'dialogue', charName: item.charName, text: item.text });
          blockCharCount += countDialogueChars(item.text);
        }
      }

      const hasDialogue = blockLines.some((l) => l.type === 'dialogue');
      if (!hasDialogue) continue;

      while (blockLines.length > 0 && blockLines[blockLines.length - 1].type === 'scene') {
        blockLines.pop();
      }
      if (blockLines.length === 0) continue;

      if (currentDocLines.length > 0 && currentDocCharCount + blockCharCount > 4000) {
        docSegments.push(currentDocLines);
        currentDocLines = [];
        currentDocCharCount = 0;
      }
      if (currentDocLines.length > 0) currentDocLines.push({ type: 'split' });
      currentDocLines.push(...blockLines);
      currentDocCharCount += blockCharCount;
    }
    if (currentDocLines.length > 0) docSegments.push(currentDocLines);

    if (docSegments.length === 0) {
      logs.push('⏭ ' + filePrefix + '：台詞なし（スキップ）');
      continue;
    }

    for (let seg = 0; seg < docSegments.length; seg++) {
      const seqStr = (seg + 1 < 10) ? ('0' + (seg + 1)) : String(seg + 1);
      const fileName = filePrefix + '_' + seqStr;

      const paragraphs = [];
      let dialogueCount = 0;
      let segCharCount = 0;
      for (const sItem of docSegments[seg]) {
        if (sItem.type === 'split') {
          paragraphs.push('===SPLIT===', '');
        } else if (sItem.type === 'scene') {
          paragraphs.push(sItem.text, '');
        } else if (sItem.type === 'dialogue') {
          paragraphs.push(sItem.charName, wrapDialogue(sItem.text), '');
          dialogueCount++;
          segCharCount += countDialogueChars(sItem.text);
        }
      }

      const filePath = saveTextAsFile(outputFolder, fileName, paragraphs.join('\n'));

      docRecords.push({
        fileName, characters: modelCharLabels, filePath, voiceId: modelId,
        dialogueCount, charCount: segCharCount, createdAt,
      });
      totalGenerated++;
      logs.push('   📄 ' + fileName + '　台詞 ' + dialogueCount + '行 / ' + segCharCount + '文字');
    }
    logs.push('✅ ' + filePrefix + '：' + docSegments.length + ' ファイル生成完了');
  }

  logs.push('✅ 全処理完了　生成ファイル数：' + totalGenerated + ' 件');
  return { success: true, logs, docRecords, totalGenerated };
}

module.exports = {
  generateModelDocs,
  normalizeCharName,
  looksLikeCharName,
  countDialogueChars,
  wrapDialogue,
  stripBrackets,
};
