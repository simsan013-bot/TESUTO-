// ═══════════════════════════════════════════════════════
// Code.gs — 音声生成App（1回1Doc処理・自動進行版）
// ═══════════════════════════════════════════════════════

var PROP_API_KEY       = 'FISH_API_KEY';
var PROP_SHEET_ID      = 'LAST_SHEET_ID';
var PROP_SHEET_NAME    = 'LAST_SHEET_NAME';
var PROP_OUTPUT_FOLDER = 'LAST_OUTPUT_FOLDER';
var PROP_CURRENT_IDX   = 'CURRENT_DOC_INDEX'; // 現在処理中のDoc番号

// ─── WebApp エントリーポイント ───────────────────────
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('音声生成App')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── 前回入力値を返す ────────────────────────────────
function getSavedSettings() {
  var props = PropertiesService.getUserProperties();
  return {
    sheetId     : props.getProperty(PROP_SHEET_ID)      || '',
    sheetName   : props.getProperty(PROP_SHEET_NAME)    || '',
    outputFolder: props.getProperty(PROP_OUTPUT_FOLDER) || '',
    currentIdx  : parseInt(props.getProperty(PROP_CURRENT_IDX) || '0')
  };
}

// ─── インデックスをリセット（新しいセット開始時）────
function resetIndex() {
  PropertiesService.getUserProperties().setProperty(PROP_CURRENT_IDX, '0');
  return { success: true };
}

// ─── メイン処理（1回1Doc）────────────────────────────
function generateAudio(sheetId, sheetName, docIds, outputFolderName, generateSrt, currentIdx) {

  var apiKey = PropertiesService.getScriptProperties().getProperty(PROP_API_KEY);
  if (!apiKey) {
    return { success: false, logs: ['❌ APIキーが未設定です。'], nextIdx: currentIdx };
  }

  // 設定保存
  var userProps = PropertiesService.getUserProperties();
  userProps.setProperty(PROP_SHEET_ID,      sheetId);
  userProps.setProperty(PROP_SHEET_NAME,    sheetName);
  userProps.setProperty(PROP_OUTPUT_FOLDER, outputFolderName || '');

  var logs       = [];
  var savedFiles = [];

  // 入力済みDocIDのみ抽出（空欄除外）
  var validDocs = [];
  for (var vi = 0; vi < docIds.length; vi++) {
    if (docIds[vi] && docIds[vi].trim() !== '') {
      validDocs.push({ id: docIds[vi].trim(), originalIdx: vi });
    }
  }

  if (validDocs.length === 0) {
    return { success: false, logs: ['❌ DocIDが入力されていません。'], nextIdx: 0 };
  }

  // currentIdx が範囲外 → 全完了
  if (currentIdx >= validDocs.length) {
    return {
      success   : true,
      allDone   : true,
      logs      : ['✅ 全Docの処理が完了しています。'],
      nextIdx   : currentIdx,
      savedFiles: []
    };
  }

  var target = validDocs[currentIdx];
  logs.push('【' + (currentIdx + 1) + ' / ' + validDocs.length + '】 処理中');

  try {

    // ① 音声モデル一覧を読み込み ─────────────────────
    logs.push('📋 モデル一覧を読み込み中...');
    var ss    = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      logs.push('❌ シート「' + sheetName + '」が見つかりません。');
      // スキップして次へ
      var skip1 = currentIdx + 1;
      userProps.setProperty(PROP_CURRENT_IDX, String(skip1));
      return { success: false, logs: logs, nextIdx: skip1, originalIdx: target.originalIdx };
    }

    var rows     = sheet.getDataRange().getValues();
    var modelMap = {};
    for (var i = 1; i < rows.length; i++) {
      var modelName = String(rows[i][1]).trim().replace(/^【|】$/g, '');
      var voiceId   = String(rows[i][2]).trim();
      if (modelName && voiceId && voiceId !== '') {
        modelMap[modelName.toLowerCase()] = { voiceId: voiceId, displayName: modelName };
      }
    }
    logs.push('   ' + Object.keys(modelMap).length + ' モデル読み込み済み');

    // ② 出力先フォルダ ────────────────────────────────
    var rootFolder;
    if (!outputFolderName || outputFolderName === '') {
      rootFolder = DriveApp.getRootFolder();
    } else {
      var rootFolders = DriveApp.getFoldersByName(outputFolderName);
      rootFolder = rootFolders.hasNext()
        ? rootFolders.next()
        : DriveApp.createFolder(outputFolderName);
    }
    var audioFolders = rootFolder.getFoldersByName('音声データ');
    var audioFolder  = audioFolders.hasNext()
      ? audioFolders.next()
      : rootFolder.createFolder('音声データ');

    // ③ Docを開く ─────────────────────────────────────
    var doc;
    try {
      doc = DocumentApp.openById(target.id);
    } catch (e) {
      logs.push('❌ Docを開けません（スキップ）: ' + e.toString());
      var skip2 = currentIdx + 1;
      userProps.setProperty(PROP_CURRENT_IDX, String(skip2));
      return { success: false, logs: logs, nextIdx: skip2, originalIdx: target.originalIdx };
    }

    var docTitle     = doc.getName();
    logs.push('📄 ' + docTitle);

    var modelNameRaw = docTitle.replace(/_\d+$/, '').trim();
    var modelKey     = modelNameRaw.toLowerCase();

    if (!modelMap[modelKey]) {
      logs.push('❌ モデル未登録: 「' + modelNameRaw + '」（スキップ）');
      var skip3 = currentIdx + 1;
      userProps.setProperty(PROP_CURRENT_IDX, String(skip3));
      return { success: false, logs: logs, nextIdx: skip3, originalIdx: target.originalIdx };
    }

    var voiceId     = modelMap[modelKey].voiceId;
    var displayName = modelMap[modelKey].displayName;
    logs.push('   モデル: ' + displayName + ' → ' + voiceId.substring(0, 8) + '...');

    var modelFolders = audioFolder.getFoldersByName(displayName);
    var modelFolder  = modelFolders.hasNext()
      ? modelFolders.next()
      : audioFolder.createFolder(displayName);

    // ④ セリフをSPLITグループ単位に分類 ───────────────
    var bodyText    = doc.getBody().getText();
    var lines       = bodyText.split('\n');
    var splitGroups = { 1: [] };
    var splitNum    = 1;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line) continue;
      if (/^【.*】$/.test(line)) continue;
      if (line.indexOf('===SPLIT===') !== -1) {
        splitNum++;
        splitGroups[splitNum] = [];
        continue;
      }
      if (line.indexOf('===') === 0 && line.lastIndexOf('===') > 0) continue;

      var endChars = ['。', '、', '！', '？', '…', '」', '♪', '!', '?'];
      var lastChar = line.slice(-1);
      var hasPunct = false;
      for (var ec = 0; ec < endChars.length; ec++) {
        if (lastChar === endChars[ec]) { hasPunct = true; break; }
      }
      splitGroups[splitNum].push(hasPunct ? line : line + '。');
    }

    var splitNums = Object.keys(splitGroups)
      .sort(function(a, b) { return parseInt(a) - parseInt(b); })
      .filter(function(sn) { return splitGroups[sn].length > 0; });

    logs.push('   SPLITグループ数: ' + splitNums.length + ' 個');
    logs.push('─────────────────────────────────');

    // ⑤ SPLITグループごとに音声生成 ───────────────────
    for (var spi = 0; spi < splitNums.length; spi++) {
      var spNum    = splitNums[spi];
      var serifArr = splitGroups[spNum];
      var ttsText  = serifArr.join('');

      logs.push('SPLIT' + spNum + ': ' + serifArr.length + ' セリフ / ' + ttsText.length + ' 文字');
      logs.push('   🎙️ 音声生成中...');

      if (spi > 0) Utilities.sleep(5000);

      var apiPayload = {
        text        : ttsText,
        reference_id: voiceId,
        format      : 'wav',
        latency     : 'normal',
        chunk_length: 300
      };

      var ttsRes = UrlFetchApp.fetch('https://api.fish.audio/v1/tts', {
        method            : 'post',
        headers           : {
          'Authorization' : 'Bearer ' + apiKey,
          'Content-Type'  : 'application/json',
          'model'         : 's2-pro'
        },
        payload           : JSON.stringify(apiPayload),
        muteHttpExceptions: true,
        deadline          : 300
      });

      var ttsCode = ttsRes.getResponseCode();
      if (ttsCode !== 200) {
        logs.push('   ❌ TTS APIエラー (HTTP ' + ttsCode + ') — このSPLITをスキップ');
        continue;
      }

      var wavName = displayName + '_SPLIT' + spNum + '.wav';
      var wavBlob = ttsRes.getBlob().setName(wavName).setContentType('audio/wav');
      var wavFile = modelFolder.createFile(wavBlob);
      savedFiles.push({ name: wavName, url: wavFile.getUrl() });
      logs.push('   ✅ 保存: ' + wavName);

      // SRT生成
      if (generateSrt) {
        logs.push('   📝 SRT生成中...');
        Utilities.sleep(5000);
        try {
          var asrRes = UrlFetchApp.fetch('https://api.fish.audio/v1/asr', {
            method            : 'post',
            headers           : { 'Authorization': 'Bearer ' + apiKey },
            payload           : {
              'audio'             : wavFile.getBlob(),
              'language'          : 'ja',
              'ignore_timestamps' : 'false'
            },
            muteHttpExceptions: true,
            deadline          : 300
          });

          if (asrRes.getResponseCode() === 200) {
            var asrJson = JSON.parse(asrRes.getContentText());
            var asrSegs = asrJson.segments || [];
            if (asrSegs.length > 0) {
              var srtContent = buildSrt(asrSegs);
              var srtName    = displayName + '_SPLIT' + spNum + '.srt';
              var srtFile    = modelFolder.createFile(
                Utilities.newBlob(srtContent, 'text/plain', srtName)
              );
              savedFiles.push({ name: srtName, url: srtFile.getUrl(), isSrt: true });
              logs.push('   ✅ SRT保存: ' + srtName);
            } else {
              logs.push('   ⚠️ SRTセグメント取得失敗 — スキップ');
            }
          } else {
            logs.push('   ⚠️ ASR APIエラー (HTTP ' + asrRes.getResponseCode() + ') — SRTをスキップ');
          }
        } catch (asrErr) {
          logs.push('   ⚠️ SRTエラー: ' + asrErr.toString().substring(0, 80));
        }
      }

      logs.push('─────────────────────────────────');
    }

    // ⑥ 次のインデックスを保存 ────────────────────────
    var nextIdx = currentIdx + 1;
    userProps.setProperty(PROP_CURRENT_IDX, String(nextIdx));

    var wavCount = savedFiles.filter(function(f) { return !f.isSrt; }).length;
    var srtCount = savedFiles.filter(function(f) { return  f.isSrt; }).length;
    logs.push('');
    logs.push('══════ Doc ' + (currentIdx + 1) + ' 完了 ══════');
    logs.push('音声: ' + wavCount + ' 件' + (generateSrt ? ' / SRT: ' + srtCount + ' 件' : ''));

    var allDone = nextIdx >= validDocs.length;
    if (allDone) {
      logs.push('🎉 全 ' + validDocs.length + ' Doc の処理が完了しました！');
    } else {
      logs.push('次回: Doc ' + (nextIdx + 1) + '/' + validDocs.length + ' を処理します');
    }

    return {
      success      : true,
      allDone      : allDone,
      logs         : logs,
      savedFiles   : savedFiles,
      nextIdx      : nextIdx,
      originalIdx  : target.originalIdx,
      doneOriginalIdx: target.originalIdx
    };

  } catch (err) {
    logs.push('❌ 予期しないエラー（スキップ）: ' + err.toString());
    var skipErr = currentIdx + 1;
    userProps.setProperty(PROP_CURRENT_IDX, String(skipErr));
    return { success: false, logs: logs, nextIdx: skipErr, originalIdx: target.originalIdx };
  }
}

// ─── SRTフォーマット生成 ─────────────────────────────
function buildSrt(segments) {
  var sentences  = [];
  var buf        = { text: '', start: null, end: null };
  var breakChars = ['。', '！', '？', '!', '?', '…'];

  for (var i = 0; i < segments.length; i++) {
    var seg  = segments[i];
    var text = (seg.text || '').trim();
    if (!text) continue;
    if (buf.start === null) buf.start = seg.start || 0;
    buf.text += text;
    buf.end   = seg.end || (seg.start + 1);
    var isBreak   = breakChars.indexOf(buf.text.slice(-1)) !== -1;
    var isTooLong = buf.text.length >= 30;
    if (isBreak || isTooLong) {
      sentences.push({ text: buf.text, start: buf.start, end: buf.end });
      buf = { text: '', start: null, end: null };
    }
  }
  if (buf.text.trim()) sentences.push({ text: buf.text, start: buf.start, end: buf.end });

  var srt = '';
  for (var j = 0; j < sentences.length; j++) {
    var s = sentences[j];
    srt += (j + 1) + '\n';
    srt += formatSrtTime(s.start) + ' --> ' + formatSrtTime(s.end) + '\n';
    srt += s.text + '\n\n';
  }
  return srt;
}

function formatSrtTime(sec) {
  if (!sec || sec < 0) sec = 0;
  var ms = Math.round((sec % 1) * 1000);
  var s  = Math.floor(sec) % 60;
  var m  = Math.floor(sec / 60) % 60;
  var h  = Math.floor(sec / 3600);
  return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ',' + pad3(ms);
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }

// ═══════════════════════════════════════════════════════
// 【管理者用】
// ═══════════════════════════════════════════════════════
function setApiKey() {
  var key = 'ここにFish_AudioのAPIキーを貼り付けて実行してください';
  PropertiesService.getScriptProperties().setProperty(PROP_API_KEY, key);
  Logger.log('✅ APIキーを設定しました');
}
function checkApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty(PROP_API_KEY);
  Logger.log(key ? '✅ 設定済み: ' + key.substring(0, 8) + '...' : '❌ 未設定');
}
function authDrive() {
  DriveApp.getRootFolder();
  Logger.log('✅ Drive認証完了');
}
