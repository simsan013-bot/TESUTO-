// ============================================================
// Gemini 画像生成ツール v5（Google Apps Script）
// モデル: gemini-3.1-flash-image-preview（Nano Banana 2）
//
// 元はスプレッドシート紐付け（コンテナバインド）の単体ツール。
// プロンプト・判定ロジックは無改修。GAS V8housestyle（var/function）への
// 構文変換と、producerから叩けるdoPost Web APIエントリーポイント追加のみ行った。
//
// 【スクリプトプロパティ】
//   GEMINI_API_KEY  : Google AI Studio で取得した API キー
//   DRIVE_FOLDER_ID : 画像の保存先 Google Drive フォルダ ID
//
// 【シート構成】
//   画像生成     ：プロンプト入力・生成結果表示
//   生成履歴     ：生成ログ（自動記録）
//   共通プロンプト：全画像に共通して付加するスタイル指定
//   参照画像     ：キャラクター画像などをラベルで管理
// ============================================================

var CONFIG = {
  MODEL: 'gemini-3.1-flash-image-preview',
  TEXT_MODEL: 'gemini-2.5-flash',
  ASPECT_RATIO: 'auto',
  IMAGE_SIZE: '1K',
  MAX_PROMPTS: 10,
  SLEEP_MS: 1500
};

var COST_YEN = { '512': 7, '1K': 10, '2K': 15, '4K': 23 };

var THUMB_SIZE = {
  'auto': { h: 110, w: 183 },
  '1:1': { h: 160, w: 160 },
  '16:9': { h: 160, w: 284 },
  '9:16': { h: 160, w: 90 },
  '4:3': { h: 160, w: 213 },
  '3:4': { h: 160, w: 120 }
};

var SHEET = {
  MAIN: '画像生成',
  HISTORY: '生成履歴',
  COMMON: '共通プロンプト',
  REF: '参照画像'
};

var COL = {
  PROMPT_JA: 1,  // A：指示プロンプト（日本語）
  PROMPT_EN: 2,  // B：プロンプト上書き（英語・任意）
  THUMB: 3,      // C：サムネイル（IMAGE関数）
  DRIVE_URL: 4,  // D：元画像リンク（Drive）
  DATE: 5,       // E：生成日時
  STATUS: 6      // F：ステータス
  // G列廃止：参照画像はプロンプト内の [[ラベル名]] で指定（v5.2）
};

// 参照画像シートの列
var REF_COL = {
  LABEL: 1,  // A：ラベル名
  URL: 2,    // B：Drive URL
  MEMO: 3    // C：用途メモ
};

// Veo 3.1 Fast 動画生成 設定
var ANIM_CONFIG = {
  MAX_SELECT: 3,                          // 最大選択枚数
  VIDEO_SECONDS: 4,                       // 動画の長さ（秒）
  ASPECT_RATIO: '16:9',                   // '16:9'=横型 / '9:16'=縦型
  POLL_INTERVAL_MS: 8000,                 // ポーリング間隔（ms）
  POLL_MAX: 45,                           // 最大ポーリング回数（約6分）
  MODEL: 'veo-3.1-fast-generate-preview'
};

var COL_ANIM = 7;          // G列：選択チェックボックス
var COL_ANIM_INSTR = 8;    // H列：アニメーション指示
var COL_ANIM_RESULT = 9;   // I列：MP4 URL

var QUEUE_COL = 10;        // J列：自動生成キュー
var PROP_CURRENT_IDX = 'autoGen_currentIndex';
var PROP_RUNNING = 'autoGen_running';
var TRIGGER_FUNC_NAME = 'runNextRow';

function getApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Script Properties に GEMINI_API_KEY が設定されていません。');
  }
  return key;
}

function getDriveFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) {
    throw new Error('Script Properties に DRIVE_FOLDER_ID が設定されていません。');
  }
  return id;
}
