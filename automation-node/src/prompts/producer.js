// apps/producer/Checkers.gs・Director.gsのプロンプト文面（focus文言・
// システムプロンプト・JSON出力フォーマット指示・判定結果パース）を移植したもの。
// 一字一句GAS版と同一（CHECKER_DEFINITIONSのcheckerName/focus、
// buildCheckerSystemPrompt_/buildCheckerUserPrompt_/buildDirectorSystemPrompt_/
// buildDirectorUserPrompt_/parseCheckerVerdict_）。extractContent_/isReady_は
// 各工程のexecutorの戻り値の形に依存するbackendロジックのため、
// こちらはsrc/stages/producer.jsに分離している。

const CHECKER_FOCUS = {
  圧縮: {
    checkerName: 'チェッカー①（台本品質）',
    focus: '圧縮・感情強化後の台本（STORY_BIBLE/起承転結）の品質。話の繋がり・感情の起伏・セリフの自然さ・文字数が十分かを見る。',
  },
  キャラ別台本: {
    checkerName: 'チェッカー②（キャラ別台本）',
    focus: 'キャラクター別音声モデルへの台本振り分け処理が正しく完了したか。実行ログにエラー・スキップがないかを見る。',
  },
  音声: {
    checkerName: 'チェッカー③（音声確認）',
    focus: 'TTS音声生成が正しく完了したか。実行ログにエラーがないか、保存ファイル数が想定通りかを見る。',
  },
  猫感想: {
    checkerName: 'チェッカー④（感想コメンタリー）',
    focus: '猫視点の感想コメントが、トーン（率直・少し毒・憎めない）とお決まりフレーズの形式を守って生成されているかを見る。',
  },
  画像: {
    checkerName: 'チェッカー⑤（画像・アニメ素材）',
    focus: '画像生成が想定枚数分、エラーなく完了したかを見る。',
  },
  編集: {
    checkerName: 'チェッカー⑥（動画プレビュー）',
    focus: '編集済み動画プレビューが正しく生成されたかを見る。',
  },
  サムネ: {
    checkerName: 'チェッカー⑦（サムネ）',
    focus: 'サムネイル画像が正しく生成されたかを見る。',
  },
};

// buildCheckerSystemPrompt_と同一ロジック
function buildCheckerSystemPrompt(focus) {
  return 'あなたはYouTube動画制作パイプラインのチェッカーです。\n'
    + '担当範囲：' + focus + '\n\n'
    + '与えられた内容を確認し、OKかNGかを判定してください。\n'
    + '判定理由は「NGだけ」のような曖昧な一言ではなく、後で傾向分析に使える具体的な指摘'
    + '（例：「説明口調が3箇所」「文字数が目標の70%」など）にしてください。\n\n'
    + '必ず次のJSON形式のみで出力してください（前後に説明文を付けない）：\n'
    + '{"ok": true または false, "reason": "判定理由（NGの場合は具体的に）", "fixInstruction": "NGの場合の修正指示（OKの場合は空文字）"}';
}

// buildCheckerUserPrompt_と同一ロジック
function buildCheckerUserPrompt(content) {
  return '以下の内容を確認し、判定してください。\n\n' + content;
}

// buildDirectorSystemPrompt_と同一ロジック
function buildDirectorSystemPrompt() {
  return 'あなたはYouTubeチャンネルのディレクターです。\n'
    + 'アナリストFB工程で部分修正された台本案を確認し、次の圧縮工程（尺調整・感情強化）に\n'
    + '進めてよいか（GO/NG）を判断してください。\n\n'
    + '確認観点：\n'
    + '・タイトル・元の設計の範囲を超える展開・結末の変更が無いか\n'
    + '・キャラクターの口調・一貫性が崩れていないか\n'
    + '・アナリストの指摘が適切に反映されているか（過剰な書き換えになっていないか）\n'
    + '・文字数ルールが守られているか\n\n'
    + '必ず次のJSON形式のみで出力してください（前後に説明文を付けない）：\n'
    + '{"ok": true または false, "reason": "判断理由（NGの場合は具体的に）", "fixInstruction": "NGの場合の修正指示（OKの場合は空文字）"}';
}

// buildDirectorUserPrompt_と同一ロジック
function buildDirectorUserPrompt(result) {
  let msg = 'タイトル：「' + result.title + '」\n\nシナリオ設計：\n' + result.design + '\n\n';
  msg += '統合されたアナリスト修正方針：\n' + result.integratedPlan + '\n\n';
  msg += '修正前の台本：\n' + (result.originalSteps || []).join('\n\n') + '\n\n';
  msg += '修正後の台本：\n' + (result.steps || []).join('\n\n') + '\n\n';
  msg += '上記を確認し、圧縮工程に進めてよいか判断してください。';
  return msg;
}

// parseCheckerVerdict_と同一ロジック
function parseCheckerVerdict(text) {
  const match = text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : text;
  try {
    const parsed = JSON.parse(jsonText);
    return { ok: !!parsed.ok, reason: parsed.reason || '', fixInstruction: parsed.fixInstruction || '' };
  } catch (err) {
    return { ok: false, reason: '判定結果のJSON解析に失敗: ' + text, fixInstruction: '' };
  }
}

module.exports = {
  CHECKER_FOCUS,
  buildCheckerSystemPrompt,
  buildCheckerUserPrompt,
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  parseCheckerVerdict,
};
