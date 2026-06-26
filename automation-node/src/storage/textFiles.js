// シナリオ/アナリストFB工程の出力（title・design・steps）をワークのフォルダに
// プレーンテキストファイルとして保存し、次工程の入力として読み戻すためのヘルパー。
// apps/producer/StageOutput.gsのDoc方式と同じテキスト形式（===TITLE===等の区切り行）
// をそのまま使う。保存先がGoogle DocsからローカルファイルになっただけでGAS版と
// 完全に同じパース・組み立てロジックを使う。

const fs = require('fs');
const path = require('path');

function buildStepsDocText(title, design, steps) {
  const parts = ['===TITLE===', title, '===DESIGN===', design];
  for (const step of steps) {
    parts.push('===STEP===');
    parts.push(step);
  }
  return parts.join('\n');
}

function parseStepsDocText(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line === '===TITLE===' || line === '===DESIGN===' || line === '===STEP===') {
      current = { label: line.replace(/=/g, ''), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  let title = '';
  let design = '';
  const steps = [];
  for (const sec of sections) {
    const sectionText = sec.lines.join('\n').replace(/\n+$/, '');
    if (sec.label === 'TITLE') title = sectionText;
    else if (sec.label === 'DESIGN') design = sectionText;
    else if (sec.label === 'STEP') steps.push(sectionText);
  }

  return { title, design, steps };
}

function saveTextAsFile(folderPath, fileName, text) {
  fs.mkdirSync(folderPath, { recursive: true });
  const filePath = path.join(folderPath, `${fileName}.txt`);
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function loadFileText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
  buildStepsDocText,
  parseStepsDocText,
  saveTextAsFile,
  loadFileText,
};
