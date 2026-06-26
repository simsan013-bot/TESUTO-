// apps/producer/StageOutput.gsのDoc方式（buildStepsDocText_/parseStepsDocText_）は
// title/design/steps形式の出力（シナリオ/アナリストFB）専用のため、それ以外の工程
// （圧縮・キャラ別台本・音声）が持つ構造化された出力をtickの間で保存・読み戻す
// ための汎用JSONファイルストレージ。GAS版に対応物は無い（GAS版はスプシ自体が
// 状態を保持していたため不要だった）。

const fs = require('fs');
const path = require('path');

function saveJsonFile(folderPath, fileName, data) {
  fs.mkdirSync(folderPath, { recursive: true });
  const filePath = path.join(folderPath, `${fileName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = { saveJsonFile, loadJsonFile };
