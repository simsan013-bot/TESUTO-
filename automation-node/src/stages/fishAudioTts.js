// apps/fish-audio-tts/Code.gs (generateAudio/buildSrt) を移植したもの。
// SPLITグループ分割・句読点付与・SRT組み立てロジックはGAS版と同一。
// GAS版はDoc本文＋別シートのモデル名→voice_id表からvoiceIdを逆引きしていたが、
// Node版はsrc/stages/characterScriptApp.jsのgenerateModelDocsが生成した
// docRecordに既にvoiceIdが入っているため、その逆引きステップ自体が不要になった
// （バックエンドの段取りの最適化であり、AI呼び出し・SRT生成ロジックは無改修）。

const fs = require('fs');
const path = require('path');
const { fishTts, fishAsr } = require('../clients/fishAudio');

const SPLIT_SLEEP_MS = 5000;
const ASR_SLEEP_MS = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// generateAudioの④（セリフをSPLITグループ単位に分類）と同一ロジック
function splitIntoGroups(bodyText) {
  const lines = bodyText.split('\n');
  const splitGroups = { 1: [] };
  let splitNum = 1;
  const endChars = ['。', '、', '！', '？', '…', '」', '♪', '!', '?'];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^【.*】$/.test(line)) continue;
    if (line.indexOf('===SPLIT===') !== -1) {
      splitNum++;
      splitGroups[splitNum] = [];
      continue;
    }
    if (line.indexOf('===') === 0 && line.lastIndexOf('===') > 0) continue;

    const lastChar = line.slice(-1);
    const hasPunct = endChars.includes(lastChar);
    splitGroups[splitNum].push(hasPunct ? line : line + '。');
  }

  return Object.keys(splitGroups)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .filter((sn) => splitGroups[sn].length > 0)
    .map((sn) => ({ splitNum: sn, lines: splitGroups[sn] }));
}

// buildSrt/formatSrtTimeと同一ロジック
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }

function formatSrtTime(sec) {
  if (!sec || sec < 0) sec = 0;
  const ms = Math.round((sec % 1) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ',' + pad3(ms);
}

function buildSrt(segments) {
  const sentences = [];
  let buf = { text: '', start: null, end: null };
  const breakChars = ['。', '！', '？', '!', '?', '…'];

  for (const seg of segments) {
    const text = (seg.text || '').trim();
    if (!text) continue;
    if (buf.start === null) buf.start = seg.start || 0;
    buf.text += text;
    buf.end = seg.end || (seg.start + 1);
    const isBreak = breakChars.includes(buf.text.slice(-1));
    const isTooLong = buf.text.length >= 30;
    if (isBreak || isTooLong) {
      sentences.push(buf);
      buf = { text: '', start: null, end: null };
    }
  }
  if (buf.text.trim()) sentences.push(buf);

  let srt = '';
  sentences.forEach((s, j) => {
    srt += (j + 1) + '\n';
    srt += formatSrtTime(s.start) + ' --> ' + formatSrtTime(s.end) + '\n';
    srt += s.text + '\n\n';
  });
  return srt;
}

// generateAudioのNode版。1つのdocRecord（characterScriptApp.generateModelDocsの
// 出力、{ fileName, filePath, voiceId }）を処理し、SPLITグループごとにTTS
// （＋任意でASR→SRT）を実行してoutputFolderに保存する。
async function generateAudioForDoc(docRecord, outputFolder, generateSrt) {
  const logs = [];
  const savedFiles = [];

  const bodyText = fs.readFileSync(docRecord.filePath, 'utf8');
  const groups = splitIntoGroups(bodyText);
  logs.push('📄 ' + docRecord.fileName);
  logs.push('   SPLITグループ数: ' + groups.length + ' 個');

  fs.mkdirSync(outputFolder, { recursive: true });

  for (let spi = 0; spi < groups.length; spi++) {
    const { splitNum, lines } = groups[spi];
    const ttsText = lines.join('');
    logs.push('SPLIT' + splitNum + ': ' + lines.length + ' セリフ / ' + ttsText.length + ' 文字');

    if (spi > 0) await sleep(SPLIT_SLEEP_MS);

    let wavBuffer;
    try {
      wavBuffer = await fishTts(ttsText, docRecord.voiceId);
    } catch (err) {
      logs.push('   ❌ ' + err.message + ' — このSPLITをスキップ');
      continue;
    }

    const wavName = docRecord.fileName + '_SPLIT' + splitNum + '.wav';
    const wavPath = path.join(outputFolder, wavName);
    fs.writeFileSync(wavPath, wavBuffer);
    savedFiles.push({ name: wavName, path: wavPath });
    logs.push('   ✅ 保存: ' + wavName);

    if (generateSrt) {
      await sleep(ASR_SLEEP_MS);
      try {
        const segments = await fishAsr(wavBuffer);
        if (segments.length > 0) {
          const srtContent = buildSrt(segments);
          const srtName = docRecord.fileName + '_SPLIT' + splitNum + '.srt';
          const srtPath = path.join(outputFolder, srtName);
          fs.writeFileSync(srtPath, srtContent, 'utf8');
          savedFiles.push({ name: srtName, path: srtPath, isSrt: true });
          logs.push('   ✅ SRT保存: ' + srtName);
        } else {
          logs.push('   ⚠️ SRTセグメント取得失敗 — スキップ');
        }
      } catch (err) {
        logs.push('   ⚠️ SRTエラー: ' + err.message);
      }
    }
  }

  return { logs, savedFiles };
}

// docRecords全件を順に処理する（GAS版の「1回1Doc」呼び出しをproducer側で
// allDoneまでループしていたrunFishAudioStage_と同じ意味のまとめ役）。
async function runFishAudioStage(docRecords, outputFolder, generateSrt) {
  let logs = [];
  let savedFiles = [];
  for (const docRecord of docRecords) {
    const result = await generateAudioForDoc(docRecord, outputFolder, generateSrt);
    logs = logs.concat(result.logs);
    savedFiles = savedFiles.concat(result.savedFiles);
  }
  return { logs, savedFiles };
}

module.exports = {
  splitIntoGroups,
  buildSrt,
  generateAudioForDoc,
  runFishAudioStage,
};
