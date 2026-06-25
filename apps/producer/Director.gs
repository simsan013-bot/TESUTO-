// ディレクター（チャンネル担当AI）：scenario工程の方針決定のみを担当。
// 本実装では「アナリストFBの採否判断」「台本化のGO/NG判断」を1回の判定にまとめ、
// アナリストFB工程完了直後（ゲートAの直前）に自動実行する。
// 「シナリオAppへの指示出し」は進捗管理シート/リサーチApp（指示書6章該当、未着手）が
// できるまで人力（addQueueRowでの手動入力）のまま。
//
// NG判定時はrecordCheckResult()のリトライ（最大2回）→3回目Sim確認ゲート(A)へ
// エスカレーションのロジックをチェッカーと共通で使う（checkerName='ディレクター'）。

function buildDirectorSystemPrompt_() {
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

function buildDirectorUserPrompt_(result) {
  var msg = 'タイトル：「' + result.title + '」\n\nシナリオ設計：\n' + result.design + '\n\n';
  msg += '統合されたアナリスト修正方針：\n' + result.integratedPlan + '\n\n';
  msg += '修正前の台本：\n' + (result.originalSteps || []).join('\n\n') + '\n\n';
  msg += '修正後の台本：\n' + (result.steps || []).join('\n\n') + '\n\n';
  msg += '上記を確認し、圧縮工程に進めてよいか判断してください。';
  return msg;
}

function runDirectorJudgment_(result) {
  var text = callClaudeForCheck_(buildDirectorSystemPrompt_(), buildDirectorUserPrompt_(result));
  return parseCheckerVerdict_(text);
}
