# compression-tool（スカッと系シナリオ 圧縮・再編集ツール）

元は `index.html` 単体（ブラウザから Anthropic API を直接 `fetch()` する対話型ツール、
`google.script.run` は使わない）と、管理表からのスプシ出力・音声モデル割り当てなどを
担う `Code.gs`（HtmlServiceで配信）から成るツール。運用者が一人のみの想定のため、
人間用UIのメールアドレス許可リスト`checkAuth()`は撤去済み（デプロイURLを知っていれば
誰でもブラウザから開ける状態になる）。
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
- `Code.gs` の `getWorkList`/`detectCharacterRoles`/
  `formatForSheet`/`parseScriptToRows`/`VOICE_MODEL_LIST`/`selectVoiceModels`/
  `exportToSpreadsheet`（旧プロンプト群削除以外は無改修。スプシ生成の本体は
  `buildCharacterScriptSpreadsheet_`に切り出したが、`exportToSpreadsheet`自体の
  入出力・管理表連携の挙動は変更していない。詳細は後述「producer連携」参照）
- `index.html`（対話型UI、ブラウザから `doGet` 経由でアクセス。一字一句無改修）

## ファイル構成

```
Config.gs      MGMT_SHEET_ID/NAME
AI.gs          callClaude（既存）／callClaudeForPipeline_（新規・429リトライ付き）
Prompts.gs     index.html由来の全プロンプト（現行仕様）
Code.gs        doGet・getWorkList・detectCharacterRoles・スプシ出力関連
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
index.html     対話型UI（無改修）
```

## セットアップ

1. `clasp create --type webapp --title "compression-tool" --rootDir .`
2. Script Properties に `CLAUDE_KEY` を設定する。
3. Script Properties に `PRODUCER_SHARED_KEY`（producer専用の合言葉）を設定する。
   producer側の `COMPRESSION_APP_KEY` と**同じ値**にすること。未設定の場合、
   producerからの呼び出しはすべて拒否される。
4. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）
5. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     COMPRESSION_APP_URL: '...',
     COMPRESSION_APP_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
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

## producer連携：「キャラ別台本」工程へのスプシ受け渡し（`mode: 'export'`）

`apps/character-script-app`の`generateModelDocs`は、タブ1（台本）＋タブ2
（「作品No音声モデル」、タグ・キャラ名・voice_id等）を持つスプレッドシートIDを
入力に取る。このフォーマットのスプシを作る`exportToSpreadsheet`は元々
人間用UIボタン専用の関数で、`apps/compression-tool/index.html`の現行UIからは
実際には呼ばれておらず（死蔵）、かつ管理表（`MGMT_SHEET_ID`の行番号）から
フォルダIDを取得する設計のため、producerの自動化キューシート（作品ごとに
`フォルダID`を直接持つ）とは連携できなかった。

これを解消するため、スプシ生成の本体を`buildCharacterScriptSpreadsheet_`に
切り出し（`exportToSpreadsheet`の挙動・管理表連携は無変更）、producerからは
`folderId`/`fileName`を直接渡せる`exportForProducer_`＋`doPost`の
`mode: 'export'`で呼び出す形にした。`characterRoles`を省略した場合は
`detectCharacterRoles`で自動判定する。AI選定プロンプト（`selectVoiceModels`/
`detectCharacterRoles`）はexportToSpreadsheet経由の人間用フローと完全に共通。

リクエスト：
```json
{
  "mode": "export",
  "script": "スプシ化する台本本文（mode:'run'のscript結果をそのまま渡す想定）",
  "folderId": "出力先DriveフォルダID",
  "fileName": "作成するスプシ名",
  "characterRoles": "（任意・省略時はdetectCharacterRolesで自動判定）"
}
```

レスポンス：
```json
{ "ok": true, "spreadsheetId": "...", "spreadsheetUrl": "..." }
```

producer側は`apps/producer/ExternalApps.gs`の`runCompressionStage_`が
`callCompressionTool_`（`mode:'run'`）→`callCompressionExport_`
（`mode:'export'`）の2段呼び出しをまとめて1つの「圧縮」工程として実行し、
返ってきた`spreadsheetId`を`圧縮_出力ID`としてキューシートに保存する
（次工程の`キャラ別台本`はそのIDをそのまま`callCharacterScriptApp_`に渡す）。
