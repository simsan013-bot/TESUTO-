// ================================================================
// キャラ別台本生成App — Code.gs  v7
// ================================================================

function authDrive() {
  DriveApp.getRootFolder();
  DocumentApp.create('_auth_temp_delete_me').saveAndClose();
  Logger.log('✅ スコープ認証完了');
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('キャラ別台本生成App')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================================================================
// タグ定義（ドロップダウン・条件付き書式共通）
// ================================================================
var TAG_OPTIONS = [
  { value: 'MAIN',    color: '#b10202', fontColor: '#ffffff' },
  { value: 'HERO',    color: '#0a53a8', fontColor: '#ffffff' },
  { value: 'VILLAIN', color: '#5a3286', fontColor: '#ffffff' },
  { value: 'KEY',     color: '#ffe523', fontColor: '#000000' },
  { value: 'MOB_YM1', color: '#bfe1f6', fontColor: '#000000' },
  { value: 'MOB_YM2', color: '#bfe1f6', fontColor: '#000000' },
  { value: 'MOB_YM3', color: '#bfe1f6', fontColor: '#000000' },
  { value: 'MOB_OM1', color: '#8db5c1', fontColor: '#000000' },
  { value: 'MOB_OM2', color: '#8db5c1', fontColor: '#000000' },
  { value: 'MOB_OM3', color: '#8db5c1', fontColor: '#000000' },
  { value: 'MOB_YF1', color: '#ffc8aa', fontColor: '#000000' },
  { value: 'MOB_YF2', color: '#ffc8aa', fontColor: '#000000' },
  { value: 'MOB_YF3', color: '#ffc8aa', fontColor: '#000000' },
  { value: 'MOB_OF1', color: '#dcb389', fontColor: '#000000' },
  { value: 'MOB_OF2', color: '#dcb389', fontColor: '#000000' },
  { value: 'MOB_OF3', color: '#dcb389', fontColor: '#000000' },
  { value: 'UK_M1',   color: '#d4edbc', fontColor: '#000000' },
  { value: 'UK_M2',   color: '#d4edbc', fontColor: '#000000' },
  { value: 'UK_M3',   color: '#d4edbc', fontColor: '#000000' },
  { value: 'UK_F1',   color: '#edbcdd', fontColor: '#000000' },
  { value: 'UK_F2',   color: '#edbcdd', fontColor: '#000000' },
  { value: 'UK_F3',   color: '#edbcdd', fontColor: '#000000' }
];

// ================================================================
// ユーティリティ
// ================================================================

function normalizeCharName(s) {
  var t = String(s).trim();
  if (!t) return '';
  if (t.charAt(0) === '【' && t.charAt(t.length - 1) === '】') return t;
  return '【' + t + '】';
}

function looksLikeCharName(s) {
  return /[぀-鿿]/.test(String(s));
}

function countDialogueChars(text) {
  if (!text) return 0;
  var t = String(text);
  t = t.replace(/[「」\s　\n\r。、！？…・『』（）\(\)\[\]\{\}\.,!?\-—―～－：:；;《》〈〉]/g, '');
  return t.length;
}

function wrapDialogue(text) {
  var t = String(text).trim();
  if (!t) return '「」';
  if (t.charAt(0) === '「' && t.charAt(t.length - 1) === '」') return t;
  return '「' + t + '」';
}

function stripBrackets(charName) {
  return String(charName).replace(/^【|】$/g, '').trim();
}

function getOrCreateFolder(parentFolder, folderName) {
  var iter = parentFolder.getFoldersByName(folderName);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(folderName);
}

function moveDocToFolder(docId, outputFolder, logs, fileName) {
  var docFile = DriveApp.getFileById(docId);
  try {
    docFile.moveTo(outputFolder);
  } catch(e1) {
    try {
      outputFolder.addFile(docFile);
      var parents = docFile.getParents();
      while (parents.hasNext()) {
        var p = parents.next();
        if (p.getId() !== outputFolder.getId()) {
          try { p.removeFile(docFile); } catch(e3) {}
        }
      }
    } catch(e2) {
      logs.push('   ⚠️ ' + fileName + ' の移動失敗。マイドライブに保存されています。');
    }
  }
}

// ================================================================
// タブ2 列自動検出
// ================================================================
function detectColumns(modelValues) {
  var startRow = 0;
  if (modelValues.length > 0) {
    var firstRowStr = modelValues[0].map(function(c) { return String(c); }).join('');
    if (firstRowStr.indexOf('キャラ') !== -1 ||
        firstRowStr.indexOf('voice') !== -1 ||
        firstRowStr.indexOf('speed') !== -1 ||
        firstRowStr.indexOf('モデル') !== -1) {
      startRow = 1;
    }
  }
  for (var r = startRow; r < modelValues.length; r++) {
    var row = modelValues[r];
    for (var c = 0; c < row.length; c++) {
      if (looksLikeCharName(String(row[c]).trim())) {
        return { charColIdx: c, modelColIdx: c + 1 };
      }
    }
  }
  return { charColIdx: 0, modelColIdx: 1 };
}

// ================================================================
// キャラクター一覧抽出 → スプシ「キャラ一覧」タブに書き出し
// ================================================================
function extractCharacterList(spreadsheetId, secretKey) {

  var props = PropertiesService.getScriptProperties();
  var storedKey = props.getProperty('SECRET_KEY');
  if (!storedKey || String(secretKey) !== storedKey) {
    return { success: false, logs: ['❌ 認証エラー：シークレットキーが正しくありません'] };
  }

  var logs = [];

  try {
    var ssId = String(spreadsheetId).trim();
    var ss = SpreadsheetApp.openById(ssId);
    logs.push('✅ スプレッドシートを開きました：「' + ss.getName() + '」');

    var sheets = ss.getSheets();
    if (sheets.length < 1) {
      return { success: false, logs: logs.concat(['❌ エラー：タブが見つかりません']) };
    }

    // ── タブ1からキャラ名を出現順・重複なしで抽出 ──────────────
    var EXCLUDE_LIST = ['キャラ', 'キャラ／指示', '指示', 'ナレーター', 'キャラ名'];
    var scriptValues = sheets[0].getDataRange().getValues();
    var seen = {};
    var chars = [];

    for (var r = 0; r < scriptValues.length; r++) {
      var cellA = String(scriptValues[r][0]).trim();
      if (!cellA) continue;
      if (cellA.charAt(0) === '=') continue;

      var excluded = false;
      for (var ei = 0; ei < EXCLUDE_LIST.length; ei++) {
        if (cellA === EXCLUDE_LIST[ei] || cellA === '【' + EXCLUDE_LIST[ei] + '】') {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      var isChar = (cellA.charAt(0) === '【' && cellA.charAt(cellA.length - 1) === '】') ||
                   looksLikeCharName(cellA);
      if (!isChar) continue;

      var normalized = normalizeCharName(cellA);
      if (seen[normalized]) continue;
      seen[normalized] = true;
      chars.push(normalized);
    }

    if (chars.length === 0) {
      return { success: false, logs: logs.concat(['❌ キャラ名が見つかりませんでした（タブ1のA列を確認してください）']) };
    }

    logs.push('✅ キャラクター ' + chars.length + '名を検出');

    // ── 「キャラ一覧」タブに書き出し ───────────────────────────
    var SHEET_NAME = 'キャラ一覧';
    var listSheet = ss.getSheetByName(SHEET_NAME);
    if (listSheet) {
      listSheet.clearContents();
      listSheet.clearFormats();
      listSheet.clearConditionalFormatRules();
    } else {
      listSheet = ss.insertSheet(SHEET_NAME);
    }

    // ── ヘッダー行 ──────────────────────────────────────────────
    var headers = ['タグ', 'キャラ名', 'voice_id', 'speed', 'emotion_tag'];
    listSheet.appendRow(headers);

    var headerRange = listSheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a1d38');
    headerRange.setFontColor('#a78bfa');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(10);

    // ── データ行書き出し ─────────────────────────────────────────
    for (var ci = 0; ci < chars.length; ci++) {
      listSheet.appendRow(['', chars[ci], '', '', '']);
    }

    // ── A列：タグ ドロップダウン（データの入力規則） ────────────
    var tagValues = TAG_OPTIONS.map(function(t) { return t.value; });
    var validation = SpreadsheetApp.newDataValidation()
      .requireValueInList(tagValues, true)
      .setAllowInvalid(false)
      .setHelpText('タグをリストから選択してください')
      .build();
    listSheet.getRange(2, 1, chars.length, 1).setDataValidation(validation);

    // ── A列：条件付き書式（タグ選択時に背景色・文字色を自動設定）
    var cfRules = [];
    var cfRange = listSheet.getRange(2, 1, chars.length, 1);
    for (var ti = 0; ti < TAG_OPTIONS.length; ti++) {
      var opt = TAG_OPTIONS[ti];
      var cfRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(opt.value)
        .setBackground(opt.color)
        .setFontColor(opt.fontColor)
        .setRanges([cfRange])
        .build();
      cfRules.push(cfRule);
    }
    listSheet.setConditionalFormatRules(cfRules);

    // ── 列幅・書式 ──────────────────────────────────────────────
    listSheet.setColumnWidth(1, 120);
    listSheet.setColumnWidth(2, 220);
    listSheet.setColumnWidth(3, 300);
    listSheet.setColumnWidth(4, 80);
    listSheet.setColumnWidth(5, 160);

    var dataRange = listSheet.getRange(2, 1, chars.length, headers.length);
    dataRange.setFontSize(10);
    dataRange.setVerticalAlignment('middle');

    var nameRange = listSheet.getRange(2, 2, chars.length, 1);
    nameRange.setFontColor('#c4b5fd');
    nameRange.setFontWeight('bold');

    listSheet.setFrozenRows(1);

    logs.push('📋 「' + SHEET_NAME + '」タブに ' + chars.length + '行を書き出しました');
    logs.push('   A列のタグセルをクリックするとドロップダウンが表示されます');
    logs.push('   タグ選択後、セルが自動で色付けされます');
    logs.push('');
    logs.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logs.push('✅ 完了　C列に voice_id を入力後、Doc生成を実行してください');

    return { success: true, logs: logs, charCount: chars.length };

  } catch(err) {
    logs.push('❌ 処理エラー：' + err.toString());
    return { success: false, logs: logs };
  }
}

// ================================================================
// 生成Doc一覧タブの書き出し
// ================================================================
function writeDocListSheet(ss, docRecords) {
  var SHEET_NAME = '生成Doc一覧';
  var listSheet = ss.getSheetByName(SHEET_NAME);
  if (listSheet) {
    listSheet.clearContents();
  } else {
    listSheet = ss.insertSheet(SHEET_NAME);
  }

  var headers = ['ファイル名', 'キャラクター', 'Doc ID', 'Doc URL', '台詞行数', '文字数', '生成日時'];
  listSheet.appendRow(headers);

  var headerRange = listSheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a1d38');
  headerRange.setFontColor('#a78bfa');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);

  for (var i = 0; i < docRecords.length; i++) {
    var rec = docRecords[i];
    listSheet.appendRow([rec.fileName, rec.characters, rec.docId, rec.docUrl,
                         rec.dialogueCount, rec.charCount, rec.createdAt]);
  }

  listSheet.setColumnWidth(1, 200);
  listSheet.setColumnWidth(2, 260);
  listSheet.setColumnWidth(3, 300);
  listSheet.setColumnWidth(4, 340);
  listSheet.setColumnWidth(5, 80);
  listSheet.setColumnWidth(6, 80);
  listSheet.setColumnWidth(7, 160);

  if (docRecords.length > 0) {
    var dataRange = listSheet.getRange(2, 1, docRecords.length, headers.length);
    dataRange.setFontSize(10);
    dataRange.setVerticalAlignment('middle');
    for (var i = 0; i < docRecords.length; i++) {
      var urlCell = listSheet.getRange(i + 2, 4);
      if (docRecords[i].docUrl) {
        urlCell.setFormula('=HYPERLINK("' + docRecords[i].docUrl + '","開く")');
        urlCell.setFontColor('#4a9eff');
      }
    }
  }

  listSheet.setFrozenRows(1);
}

// ================================================================
// メイン処理：モデル別 Doc 生成
// ================================================================
function generateModelDocs(spreadsheetId, secretKey) {

  var props = PropertiesService.getScriptProperties();
  var storedKey = props.getProperty('SECRET_KEY');
  if (!storedKey || String(secretKey) !== storedKey) {
    return { success: false, logs: ['❌ 認証エラー：シークレットキーが正しくありません'] };
  }

  var logs = [];
  var ssId = String(spreadsheetId).trim();

  var ss = SpreadsheetApp.openById(ssId);
  logs.push('✅ スプレッドシートを開きました：「' + ss.getName() + '」');

  var sheets = ss.getSheets();
  if (sheets.length < 2) {
    return {
      success: false,
      logs: logs.concat(['❌ エラー：タブが2つ必要です（タブ1：台本、タブ2：モデル指定）'])
    };
  }

  var modelValues = sheets[1].getDataRange().getValues();
  var colInfo = detectColumns(modelValues);
  var charColIdx = colInfo.charColIdx;
  var modelColIdx = colInfo.modelColIdx;
  logs.push('📊 タブ2 列検出：キャラ名=' + (charColIdx + 1) + '列目 / モデル名=' + (modelColIdx + 1) + '列目');

  var charModelMap = {};
  var modelCharsMap = {};

  for (var i = 0; i < modelValues.length; i++) {
    var mRow = modelValues[i];
    var rawChar = String(mRow[charColIdx] || '').trim();
    var modelId = String(mRow[modelColIdx] || '').trim();
    if (!rawChar || !modelId) continue;
    if (!looksLikeCharName(rawChar)) continue;
    var charKey = normalizeCharName(rawChar);
    charModelMap[charKey] = modelId;
    if (!modelCharsMap[modelId]) modelCharsMap[modelId] = [];
    modelCharsMap[modelId].push(charKey);
  }

  var allModels = Object.keys(modelCharsMap);
  if (allModels.length === 0) {
    return { success: false, logs: logs.concat(['❌ エラー：タブ2に有効なモデル設定がありません']) };
  }

  logs.push('✅ モデルマップ作成完了：' + allModels.length + ' モデル');
  for (var mi = 0; mi < allModels.length; mi++) {
    logs.push('   🎤 [' + allModels[mi].substring(0, 8) + '...]  ←  ' +
      modelCharsMap[allModels[mi]].map(stripBrackets).join(' / '));
  }

  var EXCLUDE_LIST = ['キャラ', 'キャラ／指示', '指示', 'ナレーター', 'キャラ名'];
  var scriptValues = sheets[0].getDataRange().getValues();
  var blocks = [];
  var currentBlock = [];

  for (var r = 0; r < scriptValues.length; r++) {
    var cellA = String(scriptValues[r][0]).trim();
    var cellB = String(scriptValues[r][1]).trim();
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

    var excluded = false;
    for (var ei = 0; ei < EXCLUDE_LIST.length; ei++) {
      if (cellA === EXCLUDE_LIST[ei] || cellA === '【' + EXCLUDE_LIST[ei] + '】') {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    var isChar = (cellA.charAt(0) === '【' && cellA.charAt(cellA.length - 1) === '】') ||
                 looksLikeCharName(cellA);
    if (isChar) {
      var normA = normalizeCharName(cellA);
      var assigned = charModelMap[normA] || null;
      currentBlock.push({ type: 'dialogue', charName: normA, model: assigned,
                          text: cellB, unassigned: !assigned });
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  logs.push('✅ 台本解析完了：' + blocks.length + ' ブロック');

  var unassignedMap = {};
  for (var b = 0; b < blocks.length; b++) {
    for (var li = 0; li < blocks[b].length; li++) {
      var lr = blocks[b][li];
      if (lr.type === 'dialogue' && lr.unassigned) unassignedMap[lr.charName] = true;
    }
  }
  var unassignedKeys = Object.keys(unassignedMap);
  if (unassignedKeys.length > 0) {
    logs.push('⚠️ モデル未割当キャラ（除外）：' + unassignedKeys.map(stripBrackets).join('、'));
  }

  for (var b = 0; b < blocks.length; b++) {
    var bTotal = 0;
    for (var li = 0; li < blocks[b].length; li++) {
      if (blocks[b][li].type === 'dialogue') bTotal += countDialogueChars(blocks[b][li].text);
    }
    if (bTotal > 4000) logs.push('⚠️ ブロック' + (b + 1) + '：合計 ' + bTotal + '文字（上限4000超）');
  }

  var ssFile = DriveApp.getFileById(ssId);
  var parentIter = ssFile.getParents();
  var parentFolder = parentIter.hasNext() ? parentIter.next() : DriveApp.getRootFolder();
  var outputFolder = getOrCreateFolder(parentFolder, '音声台本');
  logs.push('📁 保存先：' + parentFolder.getName() + ' ＞ 音声台本');

  var totalGenerated = 0;
  var docRecords = [];
  var createdAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  for (var mi = 0; mi < allModels.length; mi++) {
    var modelId = allModels[mi];
    var filePrefix = stripBrackets(modelCharsMap[modelId][0]);
    var modelCharLabels = modelCharsMap[modelId].map(stripBrackets).join(' / ');

    var docSegments = [];
    var currentDocLines = [];
    var currentDocCharCount = 0;

    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var blockLines = [];
      var blockCharCount = 0;

      for (var li = 0; li < block.length; li++) {
        var item = block[li];
        if (item.type === 'scene') {
          blockLines.push({ type: 'scene', text: item.text });
        } else if (item.type === 'dialogue' && item.model === modelId) {
          blockLines.push({ type: 'dialogue', charName: item.charName, text: item.text });
          blockCharCount += countDialogueChars(item.text);
        }
      }

      var hasDialogue = false;
      for (var li2 = 0; li2 < blockLines.length; li2++) {
        if (blockLines[li2].type === 'dialogue') { hasDialogue = true; break; }
      }
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

      for (var li3 = 0; li3 < blockLines.length; li3++) {
        currentDocLines.push(blockLines[li3]);
      }
      currentDocCharCount += blockCharCount;
    }

    if (currentDocLines.length > 0) docSegments.push(currentDocLines);

    if (docSegments.length === 0) {
      logs.push('⏭ ' + filePrefix + '：台詞なし（スキップ）');
      continue;
    }

    for (var seg = 0; seg < docSegments.length; seg++) {
      var seqStr = (seg + 1 < 10) ? ('0' + (seg + 1)) : String(seg + 1);
      var fileName = filePrefix + '_' + seqStr;

      var doc = DocumentApp.create(fileName);
      var body = doc.getBody();
      body.clear();

      var segLines = docSegments[seg];
      var dialogueCount = 0;
      var segCharCount = 0;

      for (var sli = 0; sli < segLines.length; sli++) {
        var sItem = segLines[sli];
        if (sItem.type === 'split') {
          body.appendParagraph('===SPLIT===');
          body.appendParagraph('');
        } else if (sItem.type === 'scene') {
          body.appendParagraph(sItem.text);
          body.appendParagraph('');
        } else if (sItem.type === 'dialogue') {
          body.appendParagraph(sItem.charName);
          body.appendParagraph(wrapDialogue(sItem.text));
          body.appendParagraph('');
          dialogueCount++;
          segCharCount += countDialogueChars(sItem.text);
        }
      }

      doc.saveAndClose();

      var docId  = doc.getId();
      var docUrl = 'https://docs.google.com/document/d/' + docId + '/edit';
      moveDocToFolder(docId, outputFolder, logs, fileName);

      docRecords.push({ fileName: fileName, characters: modelCharLabels, docId: docId,
                        docUrl: docUrl, dialogueCount: dialogueCount,
                        charCount: segCharCount, createdAt: createdAt });
      totalGenerated++;
      logs.push('   📄 ' + fileName + '　台詞 ' + dialogueCount + '行 / ' + segCharCount + '文字');
    }

    logs.push('✅ ' + filePrefix + '：' + docSegments.length + ' ファイル生成完了');
  }

  if (docRecords.length > 0) {
    writeDocListSheet(ss, docRecords);
    logs.push('📋 「生成Doc一覧」タブを書き出しました（' + docRecords.length + '件）');
  }

  logs.push('');
  logs.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logs.push('✅ 全処理完了　生成ファイル数：' + totalGenerated + ' 件');

  return { success: true, logs: logs };
}
