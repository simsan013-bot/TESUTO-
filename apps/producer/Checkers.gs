// チェッカー①〜⑦：プロデューサー直下で各工程の出力をAIがOK/NG判定する。
// NG時はrecordCheckResult()が既存のリトライ（最大2回）→3回目Sim確認ゲートへ
// エスカレーションのロジックをそのまま使う（Code.gs参照）。
//
// 各工程のexecutorが返すJSONから「チェックすべき内容」を取り出す方法が
// 工程ごとに異なるため、CHECKER_DEFINITIONSに集約する。
// ここで定義済みでも、実際にチェッカーが発火するのはその工程のexecutorが
// 正しい入力payloadを受け取って実際に成功実行できるようになってから
// （キャラ別台本/音声/猫感想/画像/編集/サムネは入力payloadの組み立てが
// 未対応のため現時点ではexecutor自体が動かず、チェッカーも発火しない。
// README「既知の未解決事項」参照）。

var CHECKER_DEFINITIONS = {
  '圧縮': {
    checkerName: 'チェッカー①（台本品質）',
    focus: '圧縮・感情強化後の台本（STORY_BIBLE/起承転結）の品質。話の繋がり・感情の起伏・セリフの自然さ・文字数が十分かを見る。',
    extractContent_: function (result) {
      return 'STORY_BIBLE:\n' + result.storyBible + '\n\n台本本文:\n' + result.script
        + '\n\n純セリフ文字数合計: ' + result.totalChars + '字';
    },
    isReady_: function (result) { return true; }
  },
  'キャラ別台本': {
    checkerName: 'チェッカー②（キャラ別台本）',
    focus: 'キャラクター別音声モデルへの台本振り分け処理が正しく完了したか。実行ログにエラー・スキップがないかを見る。',
    extractContent_: function (result) { return '実行ログ:\n' + (result.logs || []).join('\n'); },
    isReady_: function (result) { return true; }
  },
  '音声': {
    checkerName: 'チェッカー③（音声確認）',
    focus: 'TTS音声生成が正しく完了したか。実行ログにエラーがないか、保存ファイル数が想定通りかを見る。',
    extractContent_: function (result) {
      return '実行ログ:\n' + (result.logs || []).join('\n') + '\n保存ファイル数: ' + (result.savedFiles || []).length;
    },
    isReady_: function (result) { return result.allDone !== false; }
  },
  '猫感想': {
    checkerName: 'チェッカー④（感想コメンタリー）',
    focus: '猫視点の感想コメントが、トーン（率直・少し毒・憎めない）とお決まりフレーズの形式を守って生成されているかを見る。',
    extractContent_: function (result) { return result.output || ''; },
    isReady_: function (result) { return true; }
  },
  '画像': {
    checkerName: 'チェッカー⑤（画像・アニメ素材）',
    focus: '画像生成が想定枚数分、エラーなく完了したかを見る。',
    extractContent_: function (result) {
      var items = result.results || [];
      var lines = items.map(function (r) {
        return (r.ok ? 'OK' : 'NG') + ': ' + r.promptJa + (r.error ? '（' + r.error + '）' : '');
      });
      return lines.join('\n');
    },
    isReady_: function (result) { return true; }
  },
  '編集': {
    checkerName: 'チェッカー⑥（動画プレビュー）',
    focus: '編集済み動画プレビューが正しく生成されたかを見る。',
    extractContent_: function (result) { return JSON.stringify(result); },
    isReady_: function (result) { return true; }
  },
  'サムネ': {
    checkerName: 'チェッカー⑦（サムネ）',
    focus: 'サムネイル画像が正しく生成されたかを見る。',
    extractContent_: function (result) { return JSON.stringify(result); },
    isReady_: function (result) { return true; }
  }
};

function buildCheckerSystemPrompt_(focus) {
  return 'あなたはYouTube動画制作パイプラインのチェッカーです。\n'
    + '担当範囲：' + focus + '\n\n'
    + '与えられた内容を確認し、OKかNGかを判定してください。\n'
    + '判定理由は「NGだけ」のような曖昧な一言ではなく、後で傾向分析に使える具体的な指摘'
    + '（例：「説明口調が3箇所」「文字数が目標の70%」など）にしてください。\n\n'
    + '必ず次のJSON形式のみで出力してください（前後に説明文を付けない）：\n'
    + '{"ok": true または false, "reason": "判定理由（NGの場合は具体的に）", "fixInstruction": "NGの場合の修正指示（OKの場合は空文字）"}';
}

function buildCheckerUserPrompt_(content) {
  return '以下の内容を確認し、判定してください。\n\n' + content;
}

function parseCheckerVerdict_(text) {
  var match = text.match(/\{[\s\S]*\}/);
  var jsonText = match ? match[0] : text;
  try {
    var parsed = JSON.parse(jsonText);
    return {
      ok: !!parsed.ok,
      reason: parsed.reason || '',
      fixInstruction: parsed.fixInstruction || ''
    };
  } catch (err) {
    return { ok: false, reason: '判定結果のJSON解析に失敗: ' + text, fixInstruction: '' };
  }
}

function runCheckerJudgment_(processName, content) {
  var def = CHECKER_DEFINITIONS[processName];
  var text = callClaudeForCheck_(buildCheckerSystemPrompt_(def.focus), buildCheckerUserPrompt_(content));
  return parseCheckerVerdict_(text);
}
