# compression-tool（スカッと系シナリオ 圧縮・再編集ツール）

元は `index.html` 単体（ブラウザから Anthropic API を直接 `fetch()` する対話型ツール、
`google.script.run` は使わない）と、管理表からのスプシ出力・音声モデル割り当てなどを
担う `checkAuth()` ガード付きの `Code.gs`（HtmlServiceで配信）から成るツール。
元シナリオ（2〜3万字）を STORY_BIBLE 抽出 → ①ダイジェスト → ②起承 → ③葛藤〜どん底 →
④転 → ⑤結 の順に8フェーズ感情設計で圧縮・再編集する。

## 移植にあたっての構造変更

1. **`index.html` のプロンプト群を「現行仕様」として採用、`Code.gs` 側の旧プロンプト群は削除**

   ユーザー提供の元ソースには、同名のプロンプト関数（`SYSTEM_PROMPT`/
   `buildDigestPrompt`/`buildKiPrompt`/`buildShoPrompt`/`buildTenPrompt`/
   `buildKetsuPrompt`/`generatePhase`）が `Code.gs` と `index.html` の両方に
   別バージョンとして存在していた。

   - `Code.gs` 側：キャラクター設定（`chars`）・STORY_BIBLE 非対応の初期版。
     `index.html` からは一切呼ばれておらず、フロントが
     `google.script.run` 経由でこれらを呼ぶ箇所も存在しないため、死蔵コード。
   - `index.html` 側：キャラクター設定・STORY_BIBLE 対応版（現在UIで使われている版）。

   GASは同一プロジェクト内の全 `.gs` ファイルを単一グローバルスコープに展開するため、
   両方を同名のまま `apps/compression-tool/` に置くと定義が衝突する
   （後から読み込まれた方が無条件に勝つ）。本移植では `index.html` 側を「現行仕様」
   として `Prompts.gs` に配置し、`Code.gs` 側の旧版（`SYSTEM_PROMPT`・
   `buildDigestPrompt`〜`buildKetsuPrompt`・`generatePhase`）は移植元に存在したまま
   **削除**した。プロンプトの文面自体は両方とも一字一句変更していない
   （採用しなかった旧版を削っただけ）。

2. **`doPost` Web APIエントリーポイントを追加（`WebApi.gs`、新規ファイル）**

   元の `index.html` の `startGenerate()` は、ブラウザの `localStorage` に保存した
   APIキーを使って Anthropic API を直接 `fetch()` し、レート制限（429）時は
   画面にカウントダウンを表示しながら人間に見せつつ再試行する設計。
   producerからのサーバー間呼び出し（HTTP POST）にはこのUIが存在しないため、
   `doPost` で `mode: 'run'` を受けて `runCompressionPipeline_` を実行し、
   `startGenerate()` と同じ順序（STORY_BIBLE→①→②→③→④→⑤）で一括生成する
   ようにした。

   - 429時の自動リトライは `AI.gs` に `callClaudeForPipeline_` として新規実装
     （既存の `callClaude`〜既存の対話型UI由来関数が使う関数〜には触れていない。
     `Utilities.sleep()` による待機リトライのみで、`callClaude` のAPIリクエスト
     形状（モデル・max_tokens・ヘッダー）自体は変更していない）。
   - 文字数カウントは `index.html` の `countChars()` と同一ロジックを
     `WebApi.gs` の `countChars_()` としてサーバー側に複製した
     （`apps/scenario-app/WebApi.gs` の `countEffective_()` と同じ前例）。

## 保持したもの（無改修）

- `Prompts.gs`（`index.html` 由来）の全プロンプト文面
  （`buildBiblePrompt`/`bibleBlock`/`buildSystemPrompt`/`charReminder`/
  `buildDigestPrompt`〜`buildKetsuPrompt`）。`buildSystemPrompt` のみ
  GAS V8互換のためテンプレートリテラル（バッククォート）を `var`/`function` +
  文字列連結に変換したが、出力される文字列は一字一句同一。
- `AI.gs` の `callClaude`（既存App群対話用、無改修）
- `Code.gs` の `checkAuth`/`getWorkList`/`detectCharacterRoles`/
  `formatForSheet`/`parseScriptToRows`/`VOICE_MODEL_LIST`/`selectVoiceModels`/
  `exportToSpreadsheet`（旧プロンプト群削除以外は無改修）
- `index.html`（対話型UI、ブラウザから `doGet` 経由でアクセス。一字一句無改修）

## ファイル構成

```
Config.gs      ALLOWED_EMAILS・MGMT_SHEET_ID/NAME・checkAuth()
AI.gs          callClaude（既存）／callClaudeForPipeline_（新規・429リトライ付き）
Prompts.gs     index.html由来の全プロンプト（現行仕様）
Code.gs        doGet・getWorkList・detectCharacterRoles・スプシ出力関連
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
index.html     対話型UI（無改修）
```

## セットアップ

1. `clasp create --type webapp --title "compression-tool" --rootDir .`
2. `Config.gs` の `ALLOWED_EMAILS` にブラウザでアクセスする人のメールアドレスを設定
3. Script Properties に `CLAUDE_KEY` を設定する。
4. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）
5. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     COMPRESSION_APP_URL: '...',
     COMPRESSION_APP_KEY: '...'   // 未使用のため省略可
   });
   ```

## doPost の入出力契約

リクエスト：
```json
{
  "mode": "run",
  "script": "元のシナリオ本文",
  "chars": "キャラクター設定（任意・省略可）",
  "design": "シナリオ設計書（任意・省略時は元シナリオからSTORY_BIBLEを抽出）"
}
```

レスポンス：
```json
{
  "ok": true,
  "storyBible": "抽出されたSTORY_BIBLE",
  "digest": "...", "ki": "...", "sho": "...", "ten": "...", "ketsu": "...",
  "script": "①〜⑤結合済みの台本本文",
  "charCounts": { "digest": 0, "ki": 0, "sho": 0, "ten": 0, "ketsu": 0 },
  "totalChars": 0
}
```

エラー時：
```json
{ "ok": false, "error": "..." }
```

## 既知の未解決事項：producerパイプラインから「圧縮」工程に到達できない

`apps/producer/Pipeline.gs` の `PIPELINE_EXECUTION_ORDER` は
`['シナリオ', 'アナリストFB', '圧縮', ...]` で、`シナリオ`工程の次は
`アナリストFB`工程（指示書STEP4・5、ディレクター・アナリスト）だが、
`アナリストFB` には `PIPELINE_EXECUTORS` の実行ロジックが未実装のため、
`startProcess_`（`apps/producer/Code.gs`）が「実行中」のまま待機し続け、
自動では `圧縮` 工程に到達できない。

本ツール自体は `doPost`/`callCompressionTool_` 経由で単独呼び出し可能な
状態まで実装済みだが、`アナリストFB` 工程（ディレクター・アナリスト実装、
指示書7章STEP4・5）が実装されるまでは producer の自動巡回からは
到達不可能な状態が続く。`script`/`chars`/`design` の自動キューシート連携
（どの列・工程の出力をどう引き渡すか）も、`アナリストFB` の出力仕様が
固まっていない現時点では未設計。
