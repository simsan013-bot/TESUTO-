// Script Properties に保存する設定値のキー定義。
// APIキーはハードコードせず、すべてここ経由で取得する。

var CONFIG_KEYS = {
  CLAUDE_KEY: 'CLAUDE_KEY',
  PRODUCER_SHARED_KEY: 'PRODUCER_SHARED_KEY',
  ANALYST_PERSONAS: 'ANALYST_PERSONAS'
};

function getOptionalProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// アナリスト（視聴者ペルソナ／専門職ペルソナ）の初期セット。
// 投稿後の実際の反応を見ながら、人数・観点をsetAnalystPersonas()で増減・調整していく想定。
var DEFAULT_ANALYST_PERSONAS = [
  { name: '視聴者A（58歳・元工場勤務）', focus: '本筋に厳しい視聴者。展開の説得力・伏線回収・矛盾点を厳しく見る。' },
  { name: '視聴者B（45歳・自営業）', focus: 'キャラ萎え重視。主人公・悪役・理解者の言動に共感できるか、嫌われ要素がないかを見る。' },
  { name: '視聴者C（68歳・定年退職）', focus: 'テンポ重視。間延び・冗長な説明セリフ・繰り返しの有無を見る。' },
  { name: 'プロ動画シナリオライター', focus: 'タイトル詐欺チェック。タイトルで煽った内容が本文で回収されているか、構成の整合性を見る。' },
  { name: '監督', focus: 'ストーリーの奥深さ・感情の起伏。どん底から転への落差・カタルシスの強度を見る。' }
];

function getAnalystPersonas() {
  var raw = getOptionalProp_(CONFIG_KEYS.ANALYST_PERSONAS);
  if (!raw) return DEFAULT_ANALYST_PERSONAS;
  return JSON.parse(raw);
}

// 例: setAnalystPersonas([{ name: '視聴者D（30歳・会社員）', focus: '...' }, ...])
// 呼ぶたびに全件を入れ替える（既存リストへの追加ではない）。
function setAnalystPersonas(personas) {
  PropertiesService.getScriptProperties().setProperty(CONFIG_KEYS.ANALYST_PERSONAS, JSON.stringify(personas));
}

function setScriptProperties(propsObject) {
  PropertiesService.getScriptProperties().setProperties(propsObject, false);
}
