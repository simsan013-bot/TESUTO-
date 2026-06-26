// ============================================================
// ▼ 共通プロンプトを取得する
//
// 共通プロンプトシートの構成：
//   A列2行目以降：共通プロンプト（1行1項目）
//   [[ラベル名]] をA列に書くと、参照画像シートの画像も一緒にAPIに送られる
// ============================================================
function getCommonPrompt(ss) {
  var sheet = ss.getSheetByName(SHEET.COMMON);
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var lines = [];
  for (var i = 0; i < values.length; i++) {
    var line = values[i][0].toString().trim();
    if (line.length > 0) lines.push(line);
  }
  return lines.join('\n');
}

// ============================================================
// ▼ プロンプト内の [[ラベル名]] を解析して参照画像リストを返す
//
// 戻り値：{ images: [ { label, base64, mimeType }, ... ], missing: [ label, ... ] }
//   ・重複ラベルは1回だけ取得（同じ画像を2回送らない）
//   ・ラベルが参照画像シートに見つからない場合は missing に追加してステータス警告
// ============================================================
function extractRefImages(ss, prompt, row, sheet) {
  var matches = prompt.match(/\[\[([^\]]+)\]\]/g);
  if (!matches || matches.length === 0) return { images: [], missing: [] };

  var images = [];
  var seen = {};
  var missing = [];

  for (var i = 0; i < matches.length; i++) {
    var label = matches[i].replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (seen[label]) continue;
    seen[label] = true;

    var url = getRefImageUrl(ss, label);
    if (!url) {
      missing.push(label);
      console.warn('参照画像ラベル「' + label + '」が参照画像シートに見つかりません。');
      continue;
    }
    try {
      var fetched = fetchImageAsBase64(url);
      images.push({ label: label, base64: fetched.base64, mimeType: fetched.mimeType });
    } catch (e) {
      missing.push(label);
      console.warn('参照画像「' + label + '」の取得失敗：' + e.message);
    }
  }

  // ステータス列に警告を一時表示（生成開始時に上書きされるが missing は呼び出し元に返す）
  if (missing.length > 0 && sheet && row) {
    var labelList = [];
    for (var j = 0; j < missing.length; j++) labelList.push('[[' + missing[j] + ']]');
    var warnMsg = '⚠️ 未登録ラベル：' + labelList.join(' ') + '（プロンプトのみで生成）';
    sheet.getRange(row, COL.STATUS).setValue(warnMsg);
    SpreadsheetApp.flush();
    Utilities.sleep(800);
  }

  return { images: images, missing: missing };
}

// ============================================================
// ▼ 参照画像シートからラベルに対応するURLを取得
// ============================================================
function getRefImageUrl(ss, labelOrUrl) {
  if (!labelOrUrl) return null;

  // Drive URLが直接入力されている場合はそのまま返す
  if (labelOrUrl.indexOf('https://') === 0) return labelOrUrl;

  // ラベル検索
  var sheet = ss.getSheetByName(SHEET.REF);
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var label = values[i][0].toString().trim();
    var url = values[i][1].toString().trim();
    if (label === labelOrUrl && url) return url;
  }
  return null;
}

// ============================================================
// ▼ 参照画像シートにラベル→URLを登録（既存ラベルは上書き、無ければ追加）
//   producerからの自動登録用（人間が手動でシートに書く操作と同じ結果）
// ============================================================
function registerRefImage_(ss, label, url, memo) {
  var sheet = ss.getSheetByName(SHEET.REF);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.REF);
    sheet.getRange(1, 1, 1, 3).setValues([['ラベル名', 'Drive URL', '用途メモ']]);
  }
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][0].toString().trim() === label) {
        sheet.getRange(i + 2, REF_COL.URL).setValue(url);
        sheet.getRange(i + 2, REF_COL.MEMO).setValue(memo || '');
        return;
      }
    }
  }
  sheet.appendRow([label, url, memo || '']);
}

// ============================================================
// ▼ Drive URLから画像をbase64で取得
//
// 対応URL形式：
//   https://drive.google.com/file/d/FILE_ID/view
//   https://drive.google.com/uc?export=view&id=FILE_ID
// ============================================================
function fetchImageAsBase64(driveUrl) {
  try {
    // FILE_ID を抽出
    var fileId = null;
    var m1 = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    var m2 = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m1) fileId = m1[1];
    else if (m2) fileId = m2[1];

    if (!fileId) throw new Error('Drive URLからFile IDを取得できませんでした');

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var mimeType = blob.getContentType() || 'image/png';
    var base64 = Utilities.base64Encode(blob.getBytes());

    return { base64: base64, mimeType: mimeType };
  } catch (e) {
    throw new Error('参照画像の取得に失敗しました：' + e.message);
  }
}
