# analyst-feedback-app（アナリストFB工程App）

`docs/instruction.md`の組織図にある「アナリスト（ペルソナ群、5〜6体）」を実装した新規App。
シナリオApp出力後・圧縮工程の前に挿入される工程（`PIPELINE_EXECUTION_ORDER`の
`'シナリオ' → 'アナリストFB' → '圧縮'`）を担当する。人間用UIは持たず、
producerからの`doPost`呼び出しのみに応答するバックエンドWorker。

## 工程の流れ

1. **アナリスト評価（独立・並列ではなく順次）**：`getAnalystPersonas()`で取得した
   5〜6体の各ペルソナ（視聴者ペルソナ＋プロ動画シナリオライター・監督などの専門職ペルソナ）が、
   それぞれ独立に台本全体（title・design・STEP0〜7）を読み、自分の評価観点
   （例：本筋に厳しい視聴者／キャラ萎え重視／テンポ重視／タイトル詐欺チェック／
   ストーリーの奥深さ）から具体的な指摘を出す。
2. **統合意見**：全アナリストの指摘を1回のClaude呼び出しでまとめ、複数人が共通して
   挙げている問題を優先した「採用する修正方針」をSTEPごとの箇条書きに統合する
   （個人的な好みに偏った指摘・結末や主要キャラの運命を変える指摘は採用しない）。
3. **部分修正**：統合意見に基づき、STEPごとに`apps/scenario-app`と同一の文字数・
   会話劇形式・キャラ口調ルール（`buildCommonRules_`、一字一句複製）を厳守しながら
   修正する。該当する指摘が無いSTEPは無変更で出力してよい。修正後も文字数ルールを
   下回った場合は1回だけ追い修正を試みる（`scenario-app`の`regenerateStep_`と同じ安全策）。

タイトル・シナリオ設計の範囲を超える展開・設定変更は明示的に禁止しており、
あくまで「採用したアナリスト意見に基づく部分修正」に留める設計になっている。

## アナリストペルソナの調整

人数・観点は実際の動画の投稿後反応を見ながら増減・調整する想定のため、
コード変更ではなくScript Propertiesで設定する。

```js
setAnalystPersonas([
  { name: '視聴者A（58歳・元工場勤務）', focus: '本筋に厳しい視聴者。展開の説得力・伏線回収・矛盾点を厳しく見る。' },
  { name: '視聴者B（45歳・自営業）', focus: 'キャラ萎え重視。主人公・悪役・理解者の言動に共感できるか、嫌われ要素がないかを見る。' },
  { name: '視聴者C（68歳・定年退職）', focus: 'テンポ重視。間延び・冗長な説明セリフ・繰り返しの有無を見る。' },
  { name: 'プロ動画シナリオライター', focus: 'タイトル詐欺チェック。タイトルで煽った内容が本文で回収されているか、構成の整合性を見る。' },
  { name: '監督', focus: 'ストーリーの奥深さ・感情の起伏。どん底から転への落差・カタルシスの強度を見る。' }
]);
```

未設定の場合は`Config.gs`の`DEFAULT_ANALYST_PERSONAS`（上記と同内容）が使われる。
`setAnalystPersonas()`を呼ぶたびに全件入れ替えになる（既存リストへの追加ではない）。

## ファイル構成

```
Config.gs      CLAUDE_KEY/PRODUCER_SHARED_KEY/ANALYST_PERSONAS・getAnalystPersonas/setAnalystPersonas
Prompts.gs     buildCommonRules_（scenario-appと同一文面）・各STEPのプロンプト群
AI.gs          callClaudeForAnalyst_（429リトライ付き、compression-toolのAI.gsと同じ仕組み）
Code.gs        runAnalystFeedback_（評価→統合→修正の3段実行）・doGet
WebApi.gs      doPost（producerからのHTTP呼び出し用）
```

## セットアップ

1. `clasp create --type webapp --title "analyst-feedback-app" --rootDir .`
2. Script Propertiesに`CLAUDE_KEY`を設定する。
3. Script Propertiesに`PRODUCER_SHARED_KEY`（producer専用の合言葉）を設定する。
   producer側の`ANALYST_FEEDBACK_APP_KEY`と**同じ値**にすること。未設定の場合、
   producerからの呼び出しはすべて拒否される。
4. （任意）`setAnalystPersonas([...])`でアナリストペルソナを調整する。
5. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）。
6. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     ANALYST_FEEDBACK_APP_URL: '...',
     ANALYST_FEEDBACK_APP_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
   });
   ```

## doPost の入出力契約

リクエスト：
```json
{
  "mode": "run",
  "title": "...",
  "design": "シナリオ設計",
  "steps": ["STEP0本文", "STEP1本文", "...", "STEP7本文"]
}
```

レスポンス：
```json
{
  "ok": true,
  "title": "...",
  "design": "...",
  "feedbacks": [{ "name": "...", "focus": "...", "feedback": "..." }],
  "integratedPlan": "統合された修正方針",
  "originalSteps": ["..."],
  "steps": ["修正後のSTEP0本文", "..."],
  "script": "修正後STEP結合済みの台本本文"
}
```

エラー時：
```json
{ "ok": false, "error": "..." }
```

## producer側との連携

`apps/producer/Pipeline.gs`の`PIPELINE_EXECUTORS['アナリストFB']`に
`callAnalystFeedbackApp_`が登録されている。producerは「シナリオ」工程完了時に
保存したDoc（title/design/stepsをテキスト化したもの）を読み込んで本Appに渡し、
本Appの応答（修正後title/design/steps）を「修正版」Docとして保存してから
「圧縮」工程に進む。Doc保存・読み込みの実装は`apps/producer/StageOutput.gs`を参照。
