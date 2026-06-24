// ============================================================
// シート初期化ユーティリティ
// ============================================================
function getOrCreateMainSheet(ss) {
  var sheet = ss.getSheetByName(SHEET.MAIN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.MAIN);
    var headers = ['指示プロンプト（日本語）', 'プロンプト上書き（英語・任意）', 'サムネイル', '元画像リンク', '生成日時', 'ステータス'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#4285F4').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(COL.PROMPT_JA, 280);
    sheet.setColumnWidth(COL.PROMPT_EN, 280);
    sheet.setColumnWidth(COL.THUMB, (THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto']).w + 4);
    sheet.setColumnWidth(COL.DRIVE_URL, 150);
    sheet.setColumnWidth(COL.DATE, 160);
    sheet.setColumnWidth(COL.STATUS, 240);
    sheet.getRange(2, COL.PROMPT_JA).setValue('夕暮れの富士山、水面への反射、写実的なスタイル');
    sheet.getRange(3, COL.PROMPT_JA).setValue('モダンなカフェの内装、温かい照明、北欧デザイン');
  }
  return sheet;
}

function getOrCreateHistorySheet(ss) {
  var sheet = ss.getSheetByName(SHEET.HISTORY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.HISTORY);
    var headers = ['実行日時', '日本語プロンプト', '英語プロンプト（B列入力時のみ）', 'サムネイル', 'Drive で開く', '⭐ コレクション', '共通プロンプト', '参照画像'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#34A853').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, (THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto']).w + 4);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 280);
    sheet.setColumnWidth(8, 160);
  }
  return sheet;
}

function getOrCreateCommonPromptSheet(ss) {
  var sheet = ss.getSheetByName(SHEET.COMMON);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.COMMON);

    sheet.getRange(1, 1).setValue('共通プロンプト（スタイル・雰囲気の共通指定）')
      .setBackground('#FF9900').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.getRange(1, 2).setValue('使い方')
      .setBackground('#444444').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 400);
    sheet.setColumnWidth(2, 500);

    var instructions = [
      '【このシートの使い方】\nA列（2行目以降）に、全画像に共通するスタイル・雰囲気を1行1項目で入力します。\n[[ラベル名]] をA列に書くと、参照画像シートの画像も全行に自動で添付されます。\n例：[[植物キャラ]] かわいいゆるいイラスト風',
      '【A列：共通プロンプトの書き方】\n・1行1項目で入力（複数行OK）\n・空にすると共通プロンプトなしで生成されます\n・B列（英語上書き）を使った行には付加されません\n例①：かわいいゆるいイラスト風、パステルカラー\n例②：背景はやわらかいグラデーション\n例③：[[植物キャラ]] を必ずキャラクターとして使用する',
      '【[[ラベル名]] の書き方】\n・参照画像シートに登録したラベル名を [[ ]] で囲んで書きます\n・A列のどこに書いても認識されます\n・複数書くと複数の画像が全行に添付されます\n・ラベルが参照画像シートに見つからない場合はステータス列に警告が表示されます',
      '【注意事項】\n・参照画像はDriveで「リンクを知っている人が閲覧可」に設定してください\n・参照画像はキャラの「雰囲気を近づける」効果があります（完全固定は不可）\n・修正モードの場合はプロンプトに「この画像の〇〇を変えて」と書いてください'
    ];

    for (var i = 0; i < instructions.length; i++) {
      sheet.getRange(i + 2, 2)
        .setValue(instructions[i])
        .setFontColor('#555555')
        .setFontStyle('italic')
        .setWrap(true);
    }

    sheet.setRowHeight(2, 80);
    sheet.setRowHeight(3, 110);
    sheet.setRowHeight(4, 110);
    sheet.setRowHeight(5, 90);
  }
  return sheet;
}

function getOrCreateRefImageSheet(ss) {
  var sheet = ss.getSheetByName(SHEET.REF);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.REF);
    var headers = ['ラベル名', 'Drive URL', '用途メモ'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#9C27B0').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(3, 280);

    sheet.getRange(2, 4)
      .setValue('← A列にラベル名、B列にDrive URLを入力してください。\n'
        + '登録したラベルはプロンプト内で [[ラベル名]] の形式で使用します。\n'
        + '【参照モード例】「[[植物キャラ]] を参考に、驚いている表情のイラストを描いて」\n'
        + '【修正モード例】「[[完成画像]] の背景を夜空に変えて、星を追加して」\n'
        + '【複数参照例】「[[植物キャラ]] と [[バナナキャラ]] が並んでいるイラストを描いて」')
      .setFontColor('#888888').setFontStyle('italic').setWrap(true);
    sheet.setColumnWidth(4, 500);
    sheet.setRowHeight(2, 100);
  }
  return sheet;
}

function appendHistory(sheet, promptJa, promptEn, imageUrl, driveUrl, date, thumb, commonPrompt, refImageLabel) {
  var nextRow = sheet.getLastRow() + 1;
  var dateStr = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  var t = thumb || THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto'];

  sheet.setRowHeight(nextRow, t.h + 4);
  sheet.getRange(nextRow, 1).setValue(dateStr);
  sheet.getRange(nextRow, 2).setValue(promptJa);
  sheet.getRange(nextRow, 3).setValue(promptEn || '');
  sheet.getRange(nextRow, 4).setFormula('=IMAGE("' + imageUrl + '", 4, ' + t.h + ', ' + t.w + ')');
  sheet.getRange(nextRow, 5).setFormula('=HYPERLINK("' + driveUrl + '", "🔍 開く")');
  sheet.getRange(nextRow, 6).insertCheckboxes();
  sheet.getRange(nextRow, 7).setValue(commonPrompt || '');
  sheet.getRange(nextRow, 8).setValue(refImageLabel || '');
}

// ============================================================
// シート初期設定（ヘッダー行のみ上書き・データ行は保持）
// ============================================================
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var log = [];

  // ── 画像生成シート ───────────────────────────────────────
  (function () {
    var sheet = ss.getSheetByName(SHEET.MAIN);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.MAIN);
      log.push('✅ 「' + SHEET.MAIN + '」シートを新規作成しました');
    } else {
      log.push('📋 「' + SHEET.MAIN + '」シートのヘッダーを更新しました');
    }
    var headers = ['指示プロンプト（日本語）', 'プロンプト上書き（英語・任意）', 'サムネイル', '元画像リンク', '生成日時', 'ステータス'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#4285F4').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(COL.PROMPT_JA, 280);
    sheet.setColumnWidth(COL.PROMPT_EN, 280);
    sheet.setColumnWidth(COL.THUMB, (THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto']).w + 4);
    sheet.setColumnWidth(COL.DRIVE_URL, 150);
    sheet.setColumnWidth(COL.DATE, 160);
    sheet.setColumnWidth(COL.STATUS, 240);

    sheet.getRange(1, QUEUE_COL)
      .setValue('📋 キュー（一括貼り付け用）')
      .setBackground('#607D8B').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidth(QUEUE_COL, 280);
  })();

  // ── 生成履歴シート ───────────────────────────────────────
  (function () {
    var sheet = ss.getSheetByName(SHEET.HISTORY);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.HISTORY);
      log.push('✅ 「' + SHEET.HISTORY + '」シートを新規作成しました');
    } else {
      log.push('📋 「' + SHEET.HISTORY + '」シートのヘッダーを更新しました');
    }
    var headers = ['実行日時', '日本語プロンプト', '英語プロンプト（B列入力時のみ）', 'サムネイル', 'Drive で開く', '⭐ コレクション', '共通プロンプト', '参照画像'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#34A853').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, (THUMB_SIZE[CONFIG.ASPECT_RATIO] || THUMB_SIZE['auto']).w + 4);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 280);
    sheet.setColumnWidth(8, 160);
  })();

  // ── 共通プロンプトシート ─────────────────────────────────
  (function () {
    var sheet = ss.getSheetByName(SHEET.COMMON);
    var isNew = !sheet;
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.COMMON);
      log.push('✅ 「' + SHEET.COMMON + '」シートを新規作成しました');
    } else {
      log.push('📋 「' + SHEET.COMMON + '」シートのヘッダーを更新しました');
    }
    sheet.getRange(1, 1).setValue('共通プロンプト（スタイル・雰囲気の共通指定）')
      .setBackground('#FF9900').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.getRange(1, 2).setValue('使い方')
      .setBackground('#444444').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 400);
    sheet.setColumnWidth(2, 500);

    if (isNew) {
      var instructions = [
        '【このシートの使い方】\nA列（2行目以降）に、全画像に共通するスタイル・雰囲気を1行1項目で入力します。\n[[ラベル名]] をA列に書くと、参照画像シートの画像も全行に自動で添付されます。\n例：[[植物キャラ]] かわいいゆるいイラスト風',
        '【A列：共通プロンプトの書き方】\n・1行1項目で入力（複数行OK）\n・空にすると共通プロンプトなしで生成されます\n・B列（英語上書き）を使った行には付加されません\n例①：かわいいゆるいイラスト風、パステルカラー\n例②：背景はやわらかいグラデーション\n例③：[[植物キャラ]] を必ずキャラクターとして使用する',
        '【[[ラベル名]] の書き方】\n・参照画像シートに登録したラベル名を [[ ]] で囲んで書きます\n・A列のどこに書いても認識されます\n・複数書くと複数の画像が全行に添付されます\n・ラベルが参照画像シートに見つからない場合はステータス列に警告が表示されます',
        '【注意事項】\n・参照画像はDriveで「リンクを知っている人が閲覧可」に設定してください\n・参照画像はキャラの「雰囲気を近づける」効果があります（完全固定は不可）\n・修正モードの場合はプロンプトに「この画像の〇〇を変えて」と書いてください'
      ];
      for (var i = 0; i < instructions.length; i++) {
        sheet.getRange(i + 2, 2).setValue(instructions[i])
          .setFontColor('#555555').setFontStyle('italic').setWrap(true);
      }
      sheet.setRowHeight(2, 80);
      sheet.setRowHeight(3, 110);
      sheet.setRowHeight(4, 110);
      sheet.setRowHeight(5, 90);
    }
  })();

  // ── 参照画像シート ───────────────────────────────────────
  (function () {
    var sheet = ss.getSheetByName(SHEET.REF);
    var isNew = !sheet;
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.REF);
      log.push('✅ 「' + SHEET.REF + '」シートを新規作成しました');
    } else {
      log.push('📋 「' + SHEET.REF + '」シートのヘッダーを更新しました');
    }
    var headers = ['ラベル名', 'Drive URL', '用途メモ'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#9C27B0').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(3, 280);

    if (isNew) {
      sheet.getRange(2, 4)
        .setValue('← A列にラベル名、B列にDrive URLを入力してください。\n登録したラベルはプロンプト内で [[ラベル名]] の形式で使用します。\n【参照モード例】「[[植物キャラ]] を参考に、驚いている表情のイラストを描いて」\n【修正モード例】「[[完成画像]] の背景を夜空に変えて、星を追加して」\n【複数参照例】「[[植物キャラ]] と [[バナナキャラ]] が並んでいるイラストを描いて」')
        .setFontColor('#888888').setFontStyle('italic').setWrap(true);
      sheet.setColumnWidth(4, 500);
      sheet.setRowHeight(2, 100);
    }
  })();

  ui.alert(
    'シート初期設定 完了',
    log.join('\n') + '\n\n⚠️ データ行（2行目以降）は変更していません。\nヘッダー行（1行目）と列幅・固定行のみ更新しました。',
    ui.ButtonSet.OK
  );
}
