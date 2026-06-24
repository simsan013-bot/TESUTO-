// ============================================================
// G・H・I列を初期化
// ============================================================
function initAnimCheckboxes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);
  var ui = SpreadsheetApp.getUi();
  var lastRow = sheet.getLastRow();

  sheet.getRange(1, COL_ANIM)
    .setValue('🎬 選択')
    .setBackground('#E91E63').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setColumnWidth(COL_ANIM, 70);

  sheet.getRange(1, COL_ANIM_INSTR)
    .setValue('✏️ 動きの指示')
    .setBackground('#FF9800').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setColumnWidth(COL_ANIM_INSTR, 230);

  sheet.getRange(1, COL_ANIM_RESULT)
    .setValue('🎥 動画URL')
    .setBackground('#9C27B0').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.setColumnWidth(COL_ANIM_RESULT, 170);

  var added = 0;
  for (var r = 2; r <= lastRow; r++) {
    if (sheet.getRange(r, COL.DATE).getValue() === '') continue;
    var cb = sheet.getRange(r, COL_ANIM);
    if (cb.getValue() === '') { cb.insertCheckboxes(); added++; }
    var instr = sheet.getRange(r, COL_ANIM_INSTR);
    if (instr.getValue() === '') {
      instr.setValue('例：ゆっくり微笑む、手を振る、驚いて飛び上がる');
      instr.setFontColor('#AAAAAA').setFontStyle('italic');
    }
  }

  ui.alert('✅ 完了',
    added + ' 件にチェックボックスを追加しました。\n\n'
    + '【使い方】\n'
    + '① H列に動きの指示を日本語で入力\n'
    + '   例：ゆっくり瞬きしてほほえむ\n'
    + '   例：驚いて手を口に当てる\n'
    + '   例：風に髪をなびかせながら前を向く\n\n'
    + '② G列にチェック（最大 ' + ANIM_CONFIG.MAX_SELECT + ' 枚）\n'
    + '③「🎬 選択画像をアニメーション化」を実行\n\n'
    + '📐 出力：MP4 / ' + ANIM_CONFIG.ASPECT_RATIO + ' / ' + ANIM_CONFIG.VIDEO_SECONDS + '秒\n'
    + '💰 料金目安：約 ¥68/本（Veo 3.1 Fast）',
    ui.ButtonSet.OK);
}

// ============================================================
// メイン：Veo 3.1 Fast で動画生成
// ============================================================
function animateSelectedImages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);
  var ui = SpreadsheetApp.getUi();

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  var folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!apiKey) { ui.alert('GEMINI_API_KEY が設定されていません。'); return; }
  if (!folderId) { ui.alert('DRIVE_FOLDER_ID が設定されていません。'); return; }

  var lastRow = sheet.getLastRow();
  var selected = [];
  for (var r = 2; r <= lastRow; r++) {
    if (sheet.getRange(r, COL_ANIM).getValue() !== true) continue;
    var promptJa = sheet.getRange(r, COL.PROMPT_JA).getValue().toString().trim();
    if (!promptJa) continue;
    var instrRaw = sheet.getRange(r, COL_ANIM_INSTR).getValue().toString().trim();
    var isHolder = instrRaw.indexOf('例：') === 0 || instrRaw === '';
    var instruction = isHolder ? '' : instrRaw;
    var formula = sheet.getRange(r, COL.DRIVE_URL).getFormula();
    var m = formula.match(/\/d\/([a-zA-Z0-9_-]+)/);
    selected.push({ row: r, promptJa: promptJa, instruction: instruction, fileId: m ? m[1] : null });
  }

  if (selected.length === 0) {
    ui.alert('G列でチェックを入れてください。\n（先に「☑️ アニメ選択列を初期化」を実行してください）');
    return;
  }
  if (selected.length > ANIM_CONFIG.MAX_SELECT) {
    ui.alert('選択オーバー',
      '最大 ' + ANIM_CONFIG.MAX_SELECT + ' 枚まで選択できます（現在 ' + selected.length + ' 枚）。',
      ui.ButtonSet.OK);
    return;
  }

  var costPerVideo = Math.round(ANIM_CONFIG.VIDEO_SECONDS * 0.15 * 155);
  var confirm = ui.alert('実行確認',
    selected.length + ' 枚を動画化します。\n\n'
    + '🎬 モデル     ：Veo 3.1 Fast\n'
    + '⏱️ 動画の長さ ：' + ANIM_CONFIG.VIDEO_SECONDS + ' 秒\n'
    + '📐 アスペクト ：' + ANIM_CONFIG.ASPECT_RATIO + '（' + (ANIM_CONFIG.ASPECT_RATIO === '16:9' ? '横型' : '縦型') + '）\n'
    + '💰 料金目安   ：約 ¥' + costPerVideo + ' × ' + selected.length + ' 本 = 約 ¥' + (costPerVideo * selected.length) + '\n'
    + '📁 保存先     ：画像と同じ Drive フォルダ（.mp4）\n\n'
    + '⚠️ 生成には1本あたり1〜3分かかります。',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var folder = DriveApp.getFolderById(folderId);
  var successCount = 0, errorCount = 0;

  for (var i = 0; i < selected.length; i++) {
    var row = selected[i].row;
    var promptJa = selected[i].promptJa;
    var instruction = selected[i].instruction;
    var fileId = selected[i].fileId;
    var progress = (i + 1) + '/' + selected.length;

    var refBase64 = null, refMime = 'image/png';
    if (fileId) {
      try {
        var blob = DriveApp.getFileById(fileId).getBlob();
        refBase64 = Utilities.base64Encode(blob.getBytes());
        refMime = blob.getContentType() || 'image/png';
      } catch (e) { console.warn('元画像取得失敗:', e.message); }
    }

    sheet.getRange(row, COL.STATUS).setValue('🔤 動画プロンプト生成中… (' + progress + ')');
    SpreadsheetApp.flush();

    var videoPrompt;
    try {
      videoPrompt = buildVideoPrompt(apiKey, promptJa, instruction);
    } catch (e) {
      videoPrompt = instruction
        ? instruction + '. ' + promptJa + '. smooth natural animation, cinematic'
        : 'smooth natural animation. ' + promptJa + '. cinematic quality';
      console.warn('プロンプト自動生成失敗、フォールバック:', e.message);
    }

    sheet.getRange(row, COL.STATUS).setValue('🎬 動画生成リクエスト送信中… (' + progress + ')');
    SpreadsheetApp.flush();

    var operationName;
    try {
      operationName = callVeoAPI(apiKey, videoPrompt, refBase64, refMime);
    } catch (e) {
      sheet.getRange(row, COL.STATUS).setValue('❌ リクエストエラー：' + e.message);
      console.error('[Row ' + row + '] Veo request error:', e.message);
      errorCount++;
      continue;
    }

    sheet.getRange(row, COL.STATUS).setValue(
      '⏳ 動画生成中（最大 ' + Math.ceil(ANIM_CONFIG.POLL_MAX * ANIM_CONFIG.POLL_INTERVAL_MS / 60000) + ' 分）… (' + progress + ')'
    );
    SpreadsheetApp.flush();

    var videoUri;
    try {
      videoUri = pollVeoOperation(apiKey, operationName, row, sheet, progress);
    } catch (e) {
      sheet.getRange(row, COL.STATUS).setValue('❌ 生成タイムアウト/エラー：' + e.message);
      console.error('[Row ' + row + '] Veo poll error:', e.message);
      errorCount++;
      continue;
    }

    sheet.getRange(row, COL.STATUS).setValue('💾 動画を Drive に保存中… (' + progress + ')');
    SpreadsheetApp.flush();

    try {
      var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
      var fileName = 'video_row' + row + '_' + ts + '.mp4';
      var viewUrl = saveVideoToFolder(apiKey, videoUri, fileName, folder, row, sheet);

      sheet.getRange(row, COL.STATUS).setValue('✅ 動画完了');
      sheet.getRange(row, COL_ANIM_RESULT).setFormula('=HYPERLINK("' + viewUrl + '", "🎥 動画を開く")');
      sheet.getRange(row, COL_ANIM).setValue(false);
      SpreadsheetApp.flush();
      successCount++;
    } catch (e) {
      sheet.getRange(row, COL.STATUS).setValue('❌ 保存エラー：' + e.message);
      console.error('[Row ' + row + '] save error:', e.message);
      errorCount++;
    }
  }

  ui.alert('動画生成 完了',
    '✅ 成功：' + successCount + ' 本\n❌ エラー：' + errorCount + ' 件\n\n'
    + (errorCount === 0
      ? 'I列のリンクから直接動画を確認できます。'
      : 'エラーの詳細は F列のステータスをご確認ください。'),
    ui.ButtonSet.OK);
}

// ============================================================
// 動画生成用プロンプトを自動生成（Gemini Text）
// ============================================================
function buildVideoPrompt(apiKey, originalPrompt, instruction) {
  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.TEXT_MODEL + ':generateContent?key=' + apiKey;

  var system =
    'You are an expert AI video generation prompt engineer. '
    + 'Convert the Japanese image description and motion instruction into '
    + 'a concise English video generation prompt for Veo. '
    + 'Focus on smooth, natural motion. Include character appearance details. '
    + 'Output ONLY the English prompt, no explanation, under 150 words.';

  var user =
    'Image description: ' + originalPrompt + '\n'
    + 'Motion instruction: ' + (instruction || 'gentle natural movement, subtle breathing');

  var payload = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: user }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
  };

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    var errJson = JSON.parse(res.getContentText());
    throw new Error((errJson && errJson.error && errJson.error.message) || ('HTTP ' + res.getResponseCode()));
  }
  var json = JSON.parse(res.getContentText());
  return ((json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text) || '').trim();
}

// ============================================================
// Veo API 呼び出し → operationName を返す
// ============================================================
function callVeoAPI(apiKey, prompt, imageBase64, imageMime) {
  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + ANIM_CONFIG.MODEL + ':predictLongRunning?key=' + apiKey;

  var instance = { prompt: prompt };
  if (imageBase64) {
    instance.image = {
      bytesBase64Encoded: imageBase64,
      mimeType: imageMime || 'image/png'
    };
  }

  var payload = {
    instances: [instance],
    parameters: {
      aspectRatio: ANIM_CONFIG.ASPECT_RATIO,
      durationSeconds: ANIM_CONFIG.VIDEO_SECONDS,
      sampleCount: 1
    }
  };

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true, deadline: 60
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    var errJson = JSON.parse(res.getContentText());
    throw new Error((errJson && errJson.error && errJson.error.message) || ('HTTP ' + code));
  }

  var json = JSON.parse(res.getContentText());
  if (!json.name) {
    throw new Error('operationName が返されませんでした：' + JSON.stringify(json).substring(0, 120));
  }
  return json.name;
}

// ============================================================
// ポーリング：完了まで待って videoUri を返す
// ============================================================
function pollVeoOperation(apiKey, operationName, row, sheet, progress) {
  var pollUrl = 'https://generativelanguage.googleapis.com/v1beta/' + operationName + '?key=' + apiKey;

  for (var attempt = 1; attempt <= ANIM_CONFIG.POLL_MAX; attempt++) {
    Utilities.sleep(ANIM_CONFIG.POLL_INTERVAL_MS);

    sheet.getRange(row, COL.STATUS).setValue(
      '⏳ 動画生成中… ' + (attempt * Math.round(ANIM_CONFIG.POLL_INTERVAL_MS / 1000)) + '秒経過 (' + progress + ')'
    );
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch(pollUrl, { muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code !== 200) {
      throw new Error('ポーリングエラー HTTP ' + code + ': ' + res.getContentText().substring(0, 120));
    }

    var json = JSON.parse(res.getContentText());

    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    if (json.done) {
      var samples = json.response && json.response.generateVideoResponse && json.response.generateVideoResponse.generatedSamples;
      if (!samples || samples.length === 0) {
        throw new Error('動画サンプルが返されませんでした：' + JSON.stringify(json.response).substring(0, 200));
      }
      var uri = samples[0] && samples[0].video && samples[0].video.uri;
      if (!uri) throw new Error('video.uri が見つかりません');
      return uri;
    }
  }
  throw new Error('タイムアウト：' + ANIM_CONFIG.POLL_MAX + ' 回ポーリングしても完了しませんでした');
}

// ============================================================
// 動画 URI から MP4 をダウンロードして Drive に保存
// ============================================================
function saveVideoToFolder(apiKey, videoUri, fileName, folder, row, sheet) {
  // Veo の一時URIにはAPIキーを付けてフェッチ
  var fetchUrl = videoUri.indexOf('?') !== -1
    ? videoUri + '&key=' + apiKey
    : videoUri + '?alt=media&key=' + apiKey;

  var res = UrlFetchApp.fetch(fetchUrl, { muteHttpExceptions: true, deadline: 120 });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('動画ダウンロード失敗 HTTP ' + code);
  }

  var blob = res.getBlob().setName(fileName).setContentType('video/mp4');
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('共有設定をスキップ：' + e.message);
  }

  return 'https://drive.google.com/file/d/' + file.getId() + '/preview';
}
