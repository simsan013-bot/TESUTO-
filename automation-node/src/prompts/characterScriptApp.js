// apps/compression-tool/Code.gs の detectCharacterRoles/selectVoiceModels/VOICE_MODEL_LIST
// （キャラ別台本工程のAI判定に使うプロンプト文面）を一字一句そのまま移植したもの。
// 元の関数はClaude呼び出し（callClaude）まで含むが、ここではプロンプト文面の
// 構築部分のみを抽出する（API呼び出し自体はsrc/stages側で行う）。

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

function buildDetectCharacterRolesPrompt(fullScript) {
  fullScript = fullScript || '';

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

  return { sys: sys, userMsg: userMsg };
}

function buildSelectVoiceModelsPrompt(characterRoles, fullScript) {
  var sys = 'あなたは音声モデル選定の専門家です。'
    + '与えられたキャラクター情報と台本から各キャラクターの性別・年代・性格・役割を読み取り、'
    + '音声モデル一覧から最も適したモデルを選定してください。'
    + 'JSONのみ出力すること。説明・コードブロック記号は一切付けないこと。';

  var modelListText = VOICE_MODEL_LIST.map(function(m) {
    return '・' + m.name + ' | voice_id:' + m.voice_id
      + ' | 性別:' + m.gender + ' | 年代:' + m.age
      + ' | 向き:' + m.type.join('/') + ' | トーン:' + m.tone
      + ' | 説明:' + m.memo;
  }).join('\n');

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

  return { sys: sys, userMsg: userMsg };
}

module.exports = {
  VOICE_MODEL_LIST: VOICE_MODEL_LIST,
  buildDetectCharacterRolesPrompt: buildDetectCharacterRolesPrompt,
  buildSelectVoiceModelsPrompt: buildSelectVoiceModelsPrompt,
};
