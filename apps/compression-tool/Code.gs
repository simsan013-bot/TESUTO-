// ---- doGet ----
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('スカッと系シナリオ 圧縮・再編集ツール')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- 管理表から話数リストを取得 ----
function getWorkList() {
  var auth = checkAuth();
  if (!auth.allowed) return { success: false, error: 'Access denied: ' + auth.email };
  try {
    var ss    = SpreadsheetApp.openById(MGMT_SHEET_ID);
    var sheet = ss.getSheetByName(MGMT_SHEET_NAME);
    if (!sheet) throw new Error('シート「' + MGMT_SHEET_NAME + '」が見つかりません');
    var lastRow = sheet.getLastRow();
    var works   = [];
    for (var i = 2; i <= lastRow; i++) {
      var no    = sheet.getRange(i, 1).getValue();
      var title = sheet.getRange(i, 2).getValue();
      if (no || title) {
        works.push({ row: i, no: String(no || ''), title: String(title || '') });
      }
    }
    return { success: true, works: works };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ==================================================
//  キャラクターロール自動判定
// ==================================================
function detectCharacterRoles(params) {
  var auth = checkAuth();
  if (!auth.allowed) return { success: false, error: 'Access denied: ' + auth.email };

  var fullScript = params.fullScript || '';

  var sys = 'あなたは日本語シナリオ分析の専門家です。'
    + '与えられた台本を分析し、登場人物を指定のロールに分類してJSON形式のみで出力してください。'
    + 'JSONの前後に説明文・コメント・コードブロック記号は一切付けないこと。';

  var userMsg = '以下の台本を分析し、登場人物を8つのロールに分類してください。\n\n'
    + '【ロール定義】\n'
    + 'MAIN    : 主人公（物語の中心人物）\n'
    + 'HERO    : 相手（ヒーロー/ヒロイン、主人公の恋愛対象または最大の理解者）\n'
    + 'VILLAIN : 悪役（主人公を最も苦しめる敵対者）\n'
    + 'KEY1    : キーパーソン1（上位審判者・恩人など物語の鍵を握る重要人物）\n'
    + 'MOB_YM  : モブ・若い男（20〜40代の男性脇役）\n'
    + 'MOB_OM  : モブ・年配の男（50代以上の男性脇役）\n'
    + 'MOB_YF  : モブ・若い女（20〜40代の女性脇役）\n'
    + 'MOB_OF  : モブ・年配の女（50代以上の女性脇役）\n\n'
    + '【注意】\n'
    + '・登場しないロールは「未登場」と記入すること\n'
    + '・キャラ名は台本中の【】表記をそのまま使うこと（例：【山田課長】）\n'
    + '・複数のモブが該当する場合は最も出番の多いキャラを選ぶこと\n\n'
    + '【出力形式】以下のJSON形式のみ出力すること：\n'
    + '{"MAIN":"【キャラ名】","HERO":"【キャラ名】または未登場","VILLAIN":"【キャラ名】","KEY1":"【キャラ名】または未登場","MOB_YM":"【キャラ名】または未登場","MOB_OM":"【キャラ名】または未登場","MOB_YF":"【キャラ名】または未登場","MOB_OF":"【キャラ名】または未登場"}\n\n'
    + '【台本（先頭8000文字）】\n' + fullScript.slice(0, 8000);

  try {
    var raw   = callClaude(sys, userMsg);
    var clean = raw.replace(/```[a-z]*|```/g, '').trim();
    var roles = JSON.parse(clean);
    return { success: true, roles: roles };
  } catch(e) {
    return { success: false, error: 'キャラ判定エラー: ' + e.message };
  }
}

// ==================================================
//  スプシ出力
// ==================================================
function formatForSheet(value) {
  if (typeof value === 'string' && value.startsWith('===')) return ' ' + value;
  return value;
}

function parseScriptToRows(text) {
  var lines = text.split('\n');
  var rows  = [];
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('===')) {
      rows.push([formatForSheet(trimmed), '']);
      continue;
    }
    var m = trimmed.match(/^【([^】]*)】「([\s\S]*)」\s*$/);
    if (m) { rows.push(['【' + m[1] + '】', m[2]]); continue; }
    var m2 = trimmed.match(/^(【[^】]*】)(.*)$/);
    if (m2) {
      var rest = m2[2].trim().replace(/^「/, '').replace(/」$/, '');
      rows.push([m2[1], rest]);
      continue;
    }
    rows.push([trimmed, '']);
  }
  return rows;
}

// ==================================================
//  音声モデル一覧（音声モデル一覧_v2 より）
//  モデル追加・変更時はこのリストを更新すること
// ==================================================
var VOICE_MODEL_LIST = [
  { voice_id:'8f8504bdf66d4aea944c0d475bb80df0', name:'橋本',             gender:'男', age:'30〜40代', type:['キーパーソン','モブ'],      tone:'冷静・温かみ・プロフェッショナル',  memo:'落ち着いたトーン・明瞭な発音。ナレーション/プレゼン向き' },
  { voice_id:'806aae5008fb469ab132a4adddbff696', name:'白石豪（52歳）A',   gender:'男', age:'50〜60代', type:['ヴィラン','キーパーソン'],    tone:'威圧的・断定的・選民意識（粗暴でない）', memo:'老舗三代目。プライド高く相手で態度が変わる。体裁を保つ悪役' },
  { voice_id:'d18fe9c86bc34c97945d6529bf6b6fce', name:'藤井雄一郎（45歳）', gender:'男', age:'40〜50代', type:['ヴィラン','キーパーソン'],    tone:'圧迫的・断定的・自信過剰・鼻につく',   memo:'大手代理店営業部長。数字至上主義・スマートな悪役。押し切る推進力あり' },
  { voice_id:'dffd03fb821f4bd8972e7937f434871b', name:'白石豪（52歳）B',   gender:'男', age:'50〜60代', type:['ヴィラン','キーパーソン'],    tone:'力強い・冷静・ダーク・老獪・断定的・見下し気味', memo:'老舗三代目・料亭主人系。粗暴ではない圧のある悪役向き' },
  { voice_id:'5f6d9a3b08614800946ece48ecd01997', name:'白石健一（32歳）',  gender:'男', age:'30〜40代', type:['主人公','キーパーソン'],      tone:'冷静・明朗・誠実・温かい',             memo:'良い人・平凡・主人公系。教師らしい落ち着きと誠実さ。感情押し付けない語り向き' },
  { voice_id:'2ec7c749af714b03941cc217f9f73245', name:'富山信雄（68歳）',  gender:'男', age:'50〜70代', type:['キーパーソン','ヴィラン'],    tone:'力強い・冷静・老獪・重厚・断罪感・威厳', memo:'業界の重鎮系。上位審判者・社長・会長向き' },
  { voice_id:'81c366bd4f3941f8b2c27db916359ae4', name:'田中良平（35歳）',  gender:'男', age:'30〜40代', type:['主人公','キーパーソン'],      tone:'冷静・誠実・明朗・安定・説得力',       memo:'良い人・主人公・平凡系。証言役や現場責任者ポジ向き' },
  { voice_id:'8d6e8052a9cc4a4a9dea79dc650e10f0', name:'森田美咲（27歳）',  gender:'女', age:'20代',    type:['ヴィラン','キーパーソン'],    tone:'力強い・ダーク・高圧的・断定的・不安定', memo:'若い社長系悪役。気の強い女性、キャリア女性。主張と声の強い女性役に向く' },
  { voice_id:'6a7d795babc547b4986ccd2e03d319ef', name:'白石道代（61歳）',  gender:'女', age:'50〜60代', type:['ヒロイン','キーパーソン'],    tone:'冷静・明朗・温かい・包容力・安定・丁寧', memo:'キーパーソン、助け人向き。上品なご年配。会長・社長婦人・資産家役に向く声' },
  { voice_id:'6279eb7e5b35484ebb6418303667c04f', name:'田中美咲（28歳）',  gender:'女', age:'20代',    type:['主人公','ヒロイン'],          tone:'冷静・誠実・温かい・芯がある・穏やか',  memo:'主人公・ヒロイン系。静かな介入が効く、控えめで芯のある若い女性' },
  { voice_id:'2e34da5a2e874d488b75e9fce51365db', name:'鈴木幸代（72歳）',  gender:'女', age:'50〜70代', type:['ヒロイン','キーパーソン','モブ'], tone:'温かい・冷静・包容力・丁寧・芯がある', memo:'柔らかく包み込む高齢女性。優しい・一般的な高齢女性' },
  { voice_id:'78913738b1e94d6fa56ce2f37f0885a9', name:'鈴木弘二（75歳）',  gender:'男', age:'70代〜',  type:['キーパーソン','モブ'],        tone:'冷静・温かい・老獪・上品・観察眼・信頼感', memo:'Theお爺さん系。やや低め・弱々しさは出さず、影の権威タイプ' },
];

// ==================================================
//  AIによる動的voice_id選定
//  キャラクター情報と台本を分析し、一覧から最適モデルを割り当てる
// ==================================================
function selectVoiceModels(characterRoles, fullScript) {
  var sys = 'あなたは音声モデル選定の専門家です。'
    + '与えられたキャラクター情報と台本から各キャラクターの性別・年代・性格・役割を読み取り、'
    + '音声モデル一覧から最も適したモデルを選定してください。'
    + 'JSONのみ出力すること。説明・コードブロック記号は一切付けないこと。';

  // モデル一覧をテキストに変換
  var modelListText = VOICE_MODEL_LIST.map(function(m) {
    return '・' + m.name + ' | voice_id:' + m.voice_id
      + ' | 性別:' + m.gender + ' | 年代:' + m.age
      + ' | 向き:' + m.type.join('/') + ' | トーン:' + m.tone
      + ' | 説明:' + m.memo;
  }).join('\n');

  // キャラクター情報テキスト
  var charText = Object.keys(characterRoles).map(function(role) {
    return role + ' : ' + (characterRoles[role] || '未登場');
  }).join('\n');

  var userMsg = '以下のキャラクター設定・台本冒頭を分析し、各ロールに最適な音声モデルを選定してください。\n\n'
    + '【キャラクター設定（ロール：キャラ名）】\n' + charText + '\n\n'
    + '【台本冒頭（キャラクター分析用）】\n' + fullScript.slice(0, 5000) + '\n\n'
    + '【音声モデル一覧】\n' + modelListText + '\n\n'
    + '【選定ルール】\n'
    + '1. 各ロールのキャラクターの性別・年代・性格・役割を台本から読み取ること\n'
    + '2. 未登場ロール（「未登場」と記載）は voice_id を空欄にすること\n'
    + '3. 同じ voice_id を複数ロールに割り当てないこと（1モデル1ロール）\n'
    + '4. speedは通常キャラ1.0、年配キャラ0.9、悪役の煽り場面は1.1を目安にすること\n'
    + '5. 一覧にない性別・年代のキャラクターには最も近いモデルを選ぶこと\n\n'
    + '【出力形式】以下のJSONのみ出力すること：\n'
    + '{"MAIN":{"voice_id":"...","speed":1.0},"HERO":{"voice_id":"...","speed":1.0},'
    + '"VILLAIN":{"voice_id":"...","speed":1.0},"KEY1":{"voice_id":"...","speed":0.9},'
    + '"MOB_YM":{"voice_id":"...","speed":1.0},"MOB_OM":{"voice_id":"...","speed":0.9},'
    + '"MOB_YF":{"voice_id":"...","speed":1.0},"MOB_OF":{"voice_id":"...","speed":0.9}}';

  try {
    var raw   = callClaude(sys, userMsg);
    var clean = raw.replace(/```[a-z]*|```/g, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    Logger.log('selectVoiceModels エラー: ' + e.message);
    // 失敗時は空オブジェクト（voice_idなしで出力）
    return {};
  }
}

function exportToSpreadsheet(params) {
  var auth = checkAuth();
  if (!auth.allowed) return { success: false, error: 'Access denied: ' + auth.email };

  try {
    var fullScript     = params.fullScript     || '';
    var selectedWork   = params.selectedWork;   // { row, no, title }
    var characterRoles = params.characterRoles; // { MAIN, HERO, VILLAIN, ... }

    if (!fullScript)   throw new Error('台本が空です');
    if (!selectedWork) throw new Error('話数が選択されていません');

    var rowIndex = parseInt(selectedWork.row, 10);
    if (isNaN(rowIndex) || rowIndex < 2) throw new Error('行番号が不正です');

    // 管理表からフォルダIDを取得（AD列 = col 30）
    var mgmtSs    = SpreadsheetApp.openById(MGMT_SHEET_ID);
    var mgmtSheet = mgmtSs.getSheetByName(MGMT_SHEET_NAME);
    if (!mgmtSheet) throw new Error('管理表に「' + MGMT_SHEET_NAME + '」が見つかりません');

    var folderRaw = mgmtSheet.getRange(rowIndex, 30).getValue();
    if (!folderRaw) throw new Error(rowIndex + '行目のAD列（フォルダID）が空です');

    var folderId;
    var urlMatch = String(folderRaw).match(/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      folderId = urlMatch[1];
    } else {
      var idMatch = String(folderRaw).match(/[-\w]{25,}/);
      if (!idMatch) throw new Error('AD列からフォルダIDを取得できません: ' + folderRaw);
      folderId = idMatch[0];
    }
    var folder = DriveApp.getFolderById(folderId);

    // ファイル名
    var workNo   = selectedWork.no    || '';
    var title    = selectedWork.title || '';
    var fileName = (workNo ? '【' + workNo + '】' : '') + '25min ' + title;

    // スプシ新規作成
    var ss = SpreadsheetApp.create(fileName);

    // ---- タブ1: 台本 ----
    var scriptSheet = ss.getActiveSheet();
    scriptSheet.setName('台本'); // 台本
    scriptSheet.getRange(1, 1).setValue('キャラ／指示'); // キャラ／指示
    scriptSheet.getRange(1, 2).setValue('セリフ'); // セリフ
    scriptSheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    var rows = parseScriptToRows(fullScript);
    if (rows.length > 0) {
      scriptSheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }

    // ---- C列：セリフ文字数 ／ D列：累計文字数 ----
    scriptSheet.getRange(1, 3).setValue('文字数');           // 文字数
    scriptSheet.getRange(1, 4).setValue('累計文字数'); // 累計文字数
    scriptSheet.getRange(1, 3, 1, 2).setFontWeight('bold');

    if (rows.length > 0) {
      // LEN+SUBSTITUTE数式（記号・括弧・スペースをすべて除外 18種）
      var SUBS = ['「','」','、','。','！','？',
                  '…','・','　',' ','『','』',
                  '（','）','【','】','―','～'];
      var cFormulas = [];
      var dFormulas = [];
      for (var r = 0; r < rows.length; r++) {
        var rowNum = r + 2;
        var inner = 'B' + rowNum;
        for (var s = 0; s < SUBS.length; s++) {
          inner = 'SUBSTITUTE(' + inner + ',"' + SUBS[s] + '","")';
        }
        cFormulas.push(['=LEN(' + inner + ')']);
        dFormulas.push(['=SUM($C$2:C' + rowNum + ')']);
      }
      scriptSheet.getRange(2, 3, rows.length, 1).setFormulas(cFormulas);
      scriptSheet.getRange(2, 4, rows.length, 1).setFormulas(dFormulas);
    }

    scriptSheet.setColumnWidth(1, 200);
    scriptSheet.setColumnWidth(2, 500);
    scriptSheet.setColumnWidth(3, 80);
    scriptSheet.setColumnWidth(4, 100);

    // ---- タブ2: 作品No音声モデル ----
    var voiceSheet = ss.insertSheet('作品No音声モデル'); // 作品No音声モデル
    var voiceHeader = [['タグ', 'キャラ名', 'voice_id', 'speed', 'emotion_tag']];
    voiceSheet.getRange(1, 1, 1, 5).setValues(voiceHeader);
    voiceSheet.getRange(1, 1, 1, 5).setFontWeight('bold');

    var ROLE_TAGS = [
      { tag: 'MAIN',    role: 'MAIN' },
      { tag: 'HERO',    role: 'HERO' },
      { tag: 'VILLAIN', role: 'VILLAIN' },
      { tag: 'KEY1',    role: 'KEY1' },
      { tag: 'MOB_YM',  role: 'MOB_YM' },
      { tag: 'MOB_OM',  role: 'MOB_OM' },
      { tag: 'MOB_YF',  role: 'MOB_YF' },
      { tag: 'MOB_OF',  role: 'MOB_OF' },
    ];

    // ── AIによる動的voice_id選定 ──────────────────────────
    var voiceAssignment = selectVoiceModels(characterRoles, fullScript);

    var voiceRows = ROLE_TAGS.map(function(item) {
      var charName = (characterRoles && characterRoles[item.role] && characterRoles[item.role] !== '未登場')
        ? characterRoles[item.role] : '';
      var assigned = voiceAssignment[item.role] || {};
      return [
        item.tag,
        charName,
        assigned.voice_id || '',
        assigned.speed    || '',
        ''  // emotion_tag は話数ごとに設定するため空白
      ];
    });
    voiceSheet.getRange(2, 1, voiceRows.length, 5).setValues(voiceRows);
    voiceSheet.setColumnWidth(1, 180);
    voiceSheet.setColumnWidth(2, 180);
    voiceSheet.setColumnWidth(3, 220);
    voiceSheet.setColumnWidth(4, 80);
    voiceSheet.setColumnWidth(5, 200);

    // フォルダに移動
    var ssFile = DriveApp.getFileById(ss.getId());
    folder.addFile(ssFile);
    DriveApp.getRootFolder().removeFile(ssFile);

    // 管理表 AE列（col 31）にスプシIDを書き込み
    mgmtSheet.getRange(rowIndex, 31).setValue(ss.getId());

    Logger.log('スプシ出力完了: ' + ss.getUrl());
    return {
      success:  true,
      ssId:     ss.getId(),
      ssUrl:    ss.getUrl(),
      fileName: fileName,
      rowCount: rows.length
    };

  } catch(e) {
    Logger.log('exportToSpreadsheet error: ' + e.message);
    return { success: false, error: e.message };
  }
}
