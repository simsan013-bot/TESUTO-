// ============================================================
//  デブ猫スカッとコメント生成ツール - Code.gs
//  設定: スクリプトプロパティに以下を登録
//    CLAUDE_API_KEY  : AnthropicのAPIキー
//    SHEET_ID        : 履歴保存先スプレッドシートのID（省略可）
// ============================================================

var SYSTEM_PROMPT = 'あなたはオフィス街に住みついている年齢不詳のデブ猫です（ジブリ「猫の恩返し」のムタのイメージ）。\n人間のドラマをこっそり観察し、YouTubeのスカッと系動画として配信しています。\n\n送られてくるシナリオを、見物した猫（語り手）として、以下のルールで出力してください。\n\n【ルール】\n1. 猫視点の感想・人間観察コメントを日本語で2〜300文字（1音1文字計算）で書く。\n　 ・率直で少し毒があり、でも憎めない口調（関西弁混じりでもOK）\n　 ・考察や意見の説明ラベルは不要。感想をそのまま書く。\n\n2. 感想の後に改行し、以下のお決まりフレーズを毎回付ける：\n\n---\n🐾 気に入ったらチャンネル登録＆ベルマークをポチっとな。\n👍 いいねも忘れんなよ、人間。\n\n📢 あんたにも似たような話あるやろ？\n[シナリオの内容に絡めた具体的な視聴者誘導フレーズ1〜2個。例：「上司に言われた今でも納得いかへん一言」「理不尽なやつをギャフンと言わせた武勇伝」など、内容に合わせて変える]\nコメント欄で教えてくれ。待っとるで。\n---\n\n出力はこの形式だけ。余計な説明は一切不要。';

// ============================================================
//  GET: Web App のページを返す
// ============================================================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('デブ猫スカッとコメント生成ツール')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
//  POST: producer（合言葉必須）からの呼び出しに対応
//  リクエストボディ JSON: { "scenario": "シナリオ本文", "secret": "..." }
//  レスポンス JSON:       { "ok": true, "output": "猫のコメント" }
//                    or  { "ok": false, "error": "エラーメッセージ" }
//
//  ブラウザの index.html はgoogle.script.run経由でhandlePost()を直接呼ぶため
//  （doPostは経由しない）、ここに合言葉チェックを追加しても人間用UIには
//  影響しない。
// ============================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (!verifyProducerSecret_(body)) {
      return buildJson({ ok: false, error: '認証エラー: secret が一致しません。' });
    }

    var scenario = body.scenario || '';

    if (!scenario.trim()) {
      return buildJson({ ok: false, error: 'シナリオが空やで' });
    }

    var output = callClaude(scenario);
    saveHistory(scenario, output);

    return buildJson({ ok: true, output: output });

  } catch (err) {
    return buildJson({ ok: false, error: err.message });
  }
}

// producerからの呼び出しを確認するための合言葉チェック。
// 未設定の場合は常に拒否する（安全側のデフォルト）。
function verifyProducerSecret_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('PRODUCER_SHARED_KEY');
  if (!expected) return false;
  return !!body && body.secret === expected;
}

// ============================================================
//  Claude API 呼び出し
// ============================================================
function callClaude(scenario) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('CLAUDE_API_KEY');

  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY がスクリプトプロパティに設定されていません');
  }

  var payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: scenario }]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    deadline: 120
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var data = JSON.parse(response.getContentText());

  if (data.error) {
    throw new Error('Claude APIエラー: ' + data.error.message);
  }

  var text = '';
  for (var i = 0; i < data.content.length; i++) {
    if (data.content[i].type === 'text') {
      text += data.content[i].text;
    }
  }
  return text;
}

// ============================================================
//  履歴をスプレッドシートに保存
//  SHEET_ID が未設定の場合はスキップ（エラーにしない）
// ============================================================
function saveHistory(scenario, output) {
  try {
    var props = PropertiesService.getScriptProperties();
    var sheetId = props.getProperty('SHEET_ID');
    if (!sheetId) return;

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('履歴') || ss.insertSheet('履歴');

    // ヘッダーがなければ追加
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['日時', 'シナリオ（先頭100文字）', 'シナリオ全文', '猫のコメント']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#3a2a10').setFontColor('#f5c842');
    }

    var date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    var shortScenario = scenario.length > 100 ? scenario.slice(0, 100) + '…' : scenario;
    sheet.appendRow([date, shortScenario, scenario, output]);

  } catch (err) {
    // 保存失敗してもコメント生成は成功扱いにする
    Logger.log('履歴保存エラー: ' + err.message);
  }
}

// ============================================================
//  JSON レスポンスを返すヘルパー
// ============================================================
function buildJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  ブラウザ（index.html）からの google.script.run 用
// ============================================================
function handlePost(scenario) {
  try {
    if (!scenario || !scenario.trim()) {
      return { success: false, error: 'シナリオが空やで' };
    }
    var output = callClaude(scenario);
    saveHistory(scenario, output);
    return { success: true, output: output };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
