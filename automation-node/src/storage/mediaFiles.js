// apps/image-generator/ImageGeneration.gsのDriveフォルダ保存（folder.createFile）に相当する
// ローカルファイル保存ヘルパー。保存先がDriveからローカルになっただけで、
// ファイル名の組み立てロジック（gemini_タイムスタンプ_行番号.png）は同じ意味を保つ。

const fs = require('fs');
const path = require('path');

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function saveImageFile(folderPath, fileName, buffer, mimeType) {
  fs.mkdirSync(folderPath, { recursive: true });
  const ext = EXT_BY_MIME[mimeType] || '.png';
  const filePath = path.join(folderPath, fileName.endsWith(ext) ? fileName : fileName + ext);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function loadImageAsBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return { base64: buffer.toString('base64'), mimeType };
}

module.exports = { saveImageFile, loadImageAsBase64 };
