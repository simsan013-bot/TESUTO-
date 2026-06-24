// ============================================================
// メイン処理：翻訳 → 画像生成（メニュー実行版）
// ============================================================
function generateImages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);
  var ui = SpreadsheetApp.getUi();

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  var folderId = props.getProperty('DRIVE_FOLDER_ID');

  if (!apiKey || !folderId) {
    ui.alert('設定エラー',
      'スクリプトプロパティに以下を設定してください。\n\n'
      + (!apiKey ? '❌ GEMINI_API_KEY が未設定\n' : '')
      + (!folderId ? '❌ DRIVE_FOLDER_ID が未設定\n' : '') + '\n'
      + '「拡張機能 > Apps Script > プロジェクトの設定 > スクリプトプロパティ」',
      ui.ButtonSet.OK);
    return;
  }

  var targets = collectTargets(sheet);
  if (targets.length === 0) {
    ui.alert('生成するプロンプトが見つかりません。\nA列に日本語プロンプトを入力してください（E列生成日時が空の行が対象です）。');
    return;
  }

  var commonPrompt = getCommonPrompt(ss);
  var hasCommon = commonPrompt.length > 0;
  var hasOverride = 0;
  for (var ti = 0; ti < targets.length; ti++) if (targets[ti].promptEn) hasOverride++;
  var refPattern = /\[\[.+?\]\]/;
  var hasRefImage = 0;
  for (var tj = 0; tj < targets.length; tj++) {
    var t = targets[tj];
    if (refPattern.test(t.promptJa) || refPattern.test(t.promptEn || '') || refPattern.test(commonPrompt)) hasRefImage++;
  }
  var costPer = COST_YEN[CONFIG.IMAGE_SIZE] || 10;
  var costTotal = targets.length * costPer;

  var confirm = ui.alert(
    '実行確認',
    '以下の条件で実行します。よろしいですか？\n\n'
    + '📋 生成枚数          ：' + targets.length + ' 枚\n'
    + '📝 日本語プロンプト  ：' + (targets.length - hasOverride) + ' 行\n'
    + '🔤 B列英語で上書き   ：' + hasOverride + ' 行\n'
    + '🎨 共通プロンプト    ：' + (hasCommon ? '✅ あり' : '—') + '\n'
    + '🖼️ [[参照画像]] 使用 ：' + (hasRefImage > 0 ? hasRefImage + ' 行' : '—') + '\n'
    + '💰 料金目安          ：約 ¥' + costPer + ' / 枚　→　合計 約 ¥' + costTotal + '\n\n'
    + '※ 実際の料金は Google AI Studio の利用明細でご確認ください。',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var folder = DriveApp.getFolderById(folderId);
  var historySheet = getOrCreateHistorySheet(ss);
  var successCount = 0;
  var errorCount = 0;
  var missingLabelsAll = [];  // 全行で見つからなかったラベルを収集

  for (var i = 0; i < targets.length; i++) {
    var row = targets[i].row;
    var promptJa = targets[i].promptJa;
    var existingEn = targets[i].promptEn;
    var progress = (i + 1) + ' / ' + targets.length;

    var result = generateOneImage_(ss, sheet, historySheet, folder, apiKey, row, promptJa, existingEn, commonPrompt, hasCommon, progress);
    if (result.ok) {
      successCount++;
    } else {
      errorCount++;
    }
    for (var mi = 0; mi < result.missing.length; mi++) {
      var already = false;
      for (var mj = 0; mj < missingLabelsAll.length; mj++) {
        if (missingLabelsAll[mj].label === result.missing[mi]) { already = true; break; }
      }
      if (!already) missingLabelsAll.push({ label: result.missing[mi], row: row });
    }

    SpreadsheetApp.flush();
    if (i < targets.length - 1) Utilities.sleep(CONFIG.SLEEP_MS);
  }

  var completionMsg = '✅ 成功：' + successCount + ' 枚\n❌ エラー：' + errorCount + ' 件\n';
  if (missingLabelsAll.length > 0) {
    completionMsg += '\n⚠️ 参照画像シートに未登録のラベルがありました：\n';
    for (var k = 0; k < missingLabelsAll.length; k++) {
      completionMsg += '　・[[' + missingLabelsAll[k].label + ']]（' + missingLabelsAll[k].row + '行目）\n';
    }
    completionMsg += '\n参照画像シートにラベルとDrive URLを登録してから再生成してください。';
  } else if (errorCount === 0) {
    completionMsg += '\nすべて正常に生成されました！';
  } else {
    completionMsg += '\nエラーの詳細は F 列のステータスをご確認ください。';
  }
  ui.alert('生成完了', completionMsg, ui.ButtonSet.OK);
}

// ============================================================
// 1行分の画像生成本体。メニュー実行（generateImages/runNextRow）と
// Web API（WebApi.gsのdoPost）の両方から呼ばれる共通ロジック。
// シート・履歴シート・保存先フォルダはすべて呼び出し側から渡す。
// ============================================================
function generateOneImage_(ss, sheet, historySheet, folder, apiKey, row, promptJa, existingEn, commonPrompt, hasCommon, progress) {
  var promptToUse;
  var usedEnOverride = false;
  if (existingEn) {
    promptToUse = existingEn;
    usedEnOverride = true;
  } else {
    promptToUse = hasCommon ? (promptJa + '\n\n' + commonPrompt) : promptJa;
  }

  var refResult = extractRefImages(ss, promptToUse, row, sheet);
  var refImages = refResult.images;
  var rowMissing = refResult.missing;
  if (refImages.length > 0) {
    console.log('[Row ' + row + '] 参照画像 ' + refImages.length + ' 枚');
  }

  if (sheet && row) {
    var startStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm:ss');
    sheet.getRange(row, COL.STATUS).setValue(
      '🖼️ 画像生成中… (' + progress + ')  開始 ' + startStr +
      (refImages.length > 0 ? '  🖼️参照画像 ' + refImages.length + ' 枚' : '')
    );
    SpreadsheetApp.flush();
  }

  try {
    var imageBlob = callGeminiImageAPI(apiKey, promptToUse, refImages);
    if (!imageBlob) throw new Error('画像データが返されませんでした');

    var timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    var fileSuffix = row ? ('row' + row) : Utilities.getUuid().substring(0, 8);
    var fileName = 'gemini_' + timestamp + '_' + fileSuffix + '.png';
    var file = folder.createFile(imageBlob.setName(fileName));
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      console.warn('共有設定をスキップ：' + e.message);
    }

    var imageUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    var driveUrl = file.getUrl();

    var thumb = calcThumbFromBlob(imageBlob);

    if (sheet && row) {
      sheet.setRowHeight(row, thumb.h + 4);
      sheet.setColumnWidth(COL.THUMB, thumb.w + 4);
      sheet.getRange(row, COL.THUMB).setFormula('=IMAGE("' + imageUrl + '", 4, ' + thumb.h + ', ' + thumb.w + ')');
      sheet.getRange(row, COL.DRIVE_URL).setFormula('=HYPERLINK("' + driveUrl + '", "🔍 フルサイズで開く")');

      var dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
      sheet.getRange(row, COL.DATE).setValue(dateStr);
      var missingInRow = rowMissing.length > 0
        ? '　⚠️未登録：' + rowMissing.map(function (l) { return '[[' + l + ']]'; }).join(' ')
        : '';
      sheet.getRange(row, COL.STATUS).setValue(
        refImages.length > 0
          ? '✅ 完了（参照画像 ' + refImages.length + ' 枚使用）' + missingInRow
          : '✅ 完了' + missingInRow
      );
    }

    var labelJoined = [];
    for (var li = 0; li < refImages.length; li++) labelJoined.push(refImages[li].label);

    if (historySheet) {
      appendHistory(
        historySheet,
        promptJa,
        usedEnOverride ? existingEn : '',
        imageUrl,
        driveUrl,
        new Date(),
        thumb,
        hasCommon && !usedEnOverride ? commonPrompt : '',
        labelJoined.join(', ')
      );
    }

    return { ok: true, imageUrl: imageUrl, driveUrl: driveUrl, missing: rowMissing, refLabels: labelJoined };
  } catch (e) {
    if (sheet && row) {
      sheet.getRange(row, COL.STATUS).setValue('❌ 生成エラー：' + e.message);
    }
    console.error('[Row ' + row + '] ' + e.message);
    return { ok: false, error: e.message, missing: rowMissing, refLabels: [] };
  }
}

// ============================================================
// 英語プロンプト変換のみ実行
// ============================================================
function translatePromptsOnly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateMainSheet(ss);
  var ui = SpreadsheetApp.getUi();

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) { ui.alert('GEMINI_API_KEY が設定されていません。'); return; }

  var allTargets = collectTargets(sheet);
  var targets = [];
  for (var i = 0; i < allTargets.length; i++) {
    if (!allTargets[i].promptEn) targets.push(allTargets[i]);
  }
  if (targets.length === 0) {
    ui.alert('変換対象がありません。\nB列が空でA列にプロンプトがある行が対象です。');
    return;
  }

  var confirm = ui.alert('変換確認',
    targets.length + ' 行を英語プロンプトに変換します。よろしいですか？',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var count = 0;
  for (var j = 0; j < targets.length; j++) {
    var row = targets[j].row;
    var promptJa = targets[j].promptJa;
    sheet.getRange(row, COL.STATUS).setValue('🔤 変換中…');
    SpreadsheetApp.flush();
    try {
      var promptEn = translateToImagePrompt(apiKey, promptJa);
      sheet.getRange(row, COL.PROMPT_EN).setValue(promptEn);
      sheet.getRange(row, COL.STATUS).setValue('🔤 変換済み（未生成）');
      count++;
    } catch (e) {
      sheet.getRange(row, COL.STATUS).setValue('❌ 変換エラー：' + e.message);
    }
    SpreadsheetApp.flush();
    Utilities.sleep(500);
  }
  ui.alert('変換完了', count + ' 行を英語に変換しました。', ui.ButtonSet.OK);
}

// ============================================================
// 未生成ターゲット収集
// ============================================================
function collectTargets(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var targets = [];
  for (var r = 2; r <= lastRow && targets.length < CONFIG.MAX_PROMPTS; r++) {
    var promptJa = sheet.getRange(r, COL.PROMPT_JA).getValue().toString().trim();
    var promptEn = sheet.getRange(r, COL.PROMPT_EN).getValue().toString().trim();
    var hasDate = sheet.getRange(r, COL.DATE).getValue() !== '';
    if (promptJa && !hasDate) {
      targets.push({ row: r, promptJa: promptJa, promptEn: promptEn || null });
    }
  }
  return targets;
}

// ============================================================
// 日本語 → 画像生成用英語プロンプト変換
// ============================================================
function translateToImagePrompt(apiKey, promptJa) {
  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.TEXT_MODEL + ':generateContent?key=' + apiKey;

  var kept = [];
  var masked = promptJa.replace(/「([^」]*)」/g, function (whole, inner) {
    kept.push(inner);
    return '__KEEP_' + (kept.length - 1) + '__';
  });

  var systemInstruction =
    'You are an expert prompt engineer specializing in AI image generation. '
    + 'Convert the given Japanese description into a detailed English image generation prompt. '
    + 'Translate and include ALL details. Preserve every specific instruction. '
    + 'CRITICAL: Any placeholder like __KEEP_0__ must be copied EXACTLY as-is. '
    + 'Output ONLY the English prompt. No explanation, no preamble.';

  var payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: masked }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
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
  var translated = ((json.candidates && json.candidates[0] && json.candidates[0].content
    && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
    && json.candidates[0].content.parts[0].text) || '').trim();
  for (var i = 0; i < kept.length; i++) {
    var re = new RegExp('__[Kk][Ee][Ee][Pp]_' + i + '__', 'g');
    translated = translated.replace(re, '「' + kept[i] + '」');
  }
  return translated;
}

// ============================================================
// PNG バイトデータからサムネイルサイズを計算
// ============================================================
function calcThumbFromBlob(blob) {
  var THUMB_H = 160;
  try {
    var bytes = blob.getBytes();
    var imgW = ((bytes[16] & 0xFF) << 24) | ((bytes[17] & 0xFF) << 16) | ((bytes[18] & 0xFF) << 8) | (bytes[19] & 0xFF);
    var imgH = ((bytes[20] & 0xFF) << 24) | ((bytes[21] & 0xFF) << 16) | ((bytes[22] & 0xFF) << 8) | (bytes[23] & 0xFF);
    if (imgW > 0 && imgH > 0) return { h: THUMB_H, w: Math.round(THUMB_H * imgW / imgH) };
  } catch (e) { console.warn('PNG サイズ読み取り失敗:', e.message); }
  return THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto'];
}

// ============================================================
// Gemini 画像生成 API 呼び出し（複数参照画像対応）
//
// refImages = [ { label, base64, mimeType }, ... ]
//   参照画像が複数ある場合は「N枚目の画像：ラベル名」という補足を
//   プロンプトの先頭に自動付加してAPIに送る
// ============================================================
function callGeminiImageAPI(apiKey, prompt, refImages) {
  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.MODEL + ':generateContent?key=' + apiKey;

  var imageConfig = {};
  if (CONFIG.ASPECT_RATIO && CONFIG.ASPECT_RATIO !== 'auto') {
    imageConfig.aspectRatio = CONFIG.ASPECT_RATIO;
  }

  // parts を組み立て
  // 参照画像がある場合：画像データ → 補足テキスト → プロンプト の順で送る
  var parts = [];
  if (refImages && refImages.length > 0) {
    for (var i = 0; i < refImages.length; i++) {
      parts.push({ inlineData: { mimeType: refImages[i].mimeType, data: refImages[i].base64 } });
    }
    var imageDescParts = [];
    for (var j = 0; j < refImages.length; j++) {
      imageDescParts.push((j + 1) + '枚目の画像：' + refImages[j].label);
    }
    var imageDesc = imageDescParts.join('、');
    parts.push({ text: '【参照画像について】' + imageDesc + '\n\n' + prompt });
  } else {
    parts.push({ text: prompt });
  }

  var generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  var hasImageConfig = false;
  for (var k in imageConfig) { hasImageConfig = true; break; }
  if (hasImageConfig) generationConfig.imageConfig = imageConfig;

  var payload = {
    contents: [{ parts: parts }],
    generationConfig: generationConfig
  };

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true, deadline: 120
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    var errJson = JSON.parse(res.getContentText());
    throw new Error((errJson && errJson.error && errJson.error.message) || ('HTTP ' + code));
  }

  var json = JSON.parse(res.getContentText());
  var resParts = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
  for (var p = 0; p < resParts.length; p++) {
    var part = resParts[p];
    if (part && part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.indexOf('image/') === 0) {
      return Utilities.newBlob(Utilities.base64Decode(part.inlineData.data), part.inlineData.mimeType);
    }
  }
  var finishReason = (json.candidates && json.candidates[0] && json.candidates[0].finishReason) || '';
  var textParts = [];
  for (var q = 0; q < resParts.length; q++) if (resParts[q].text) textParts.push(resParts[q].text);
  var textJoined = textParts.join(' ').trim();
  if (finishReason && finishReason !== 'STOP') throw new Error('生成中断（finishReason: ' + finishReason + '）');
  if (textJoined) throw new Error('モデルが画像を返しませんでした：「' + textJoined.substring(0, 80) + '…」');
  return null;
}
