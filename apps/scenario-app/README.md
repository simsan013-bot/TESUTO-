# scenario-app（シナリオ最適化AI）

元は `checkAuth()`（`Session.getActiveUser()` によるメールアドレス許可リスト判定）
でガードされた、HtmlServiceの対話型Webアプリ（参考シナリオ入力→設計→
類似性チェック→タイトル確認→STEP0〜7台本生成を1画面ずつ進める）。
プロンプト文面（`SYS_ANALYZE`/`SYS_DESIGN`/`buildCheckSystem`/各STEPの
生成ルール・文字数しきい値）・AIモデルID・名前データは一字一句変更していない。
今回の移植で変更したのは下記2点のみ。

## 変更した点（呼び出し方のみ）

1. **`designScenario`/`checkSimilarity`/`writeStep`/`regenerateStep` を
   「認証チェック付きの薄いラッパー」と「`_`付きのコア関数」に分離**
   （`Code.gs`）。ブラウザの `google.script.run` からはラッパー経由で
   呼ばれ、挙動は元のまま完全に同一。producerからのHTTP POST（サーバー間
   呼び出し）には `Session.getActiveUser()` が意味のある値を返さないため、
   コア関数を直接呼ぶ新しい `doPost`（`WebApi.gs`）を追加した。

2. **`doPost` Web APIエントリーポイントを追加（`WebApi.gs`、新規ファイル）**
   `mode: 'run'` を受けて、設計→類似性チェック（参考情報、ブロックしない）
   →STEP0〜7生成を一括で実行し、結果をまとめて返す `runScenarioPipeline_`
   を新規実装。元のUIでは人間が「再生成」ボタンを押して文字数しきい値を
   満たすまで繰り返す箇所は、自動実行のため `MAX_REGEN_ATTEMPTS = 2` 回まで
   `regenerateStep_` を自動で呼ぶようにした（`countEffective_` は
   `index.html` の `countEffective()` と同一ロジックをサーバー側に複製）。

## 保持したもの（無改修）

- `Prompts.gs` の全プロンプト文面（`SYS_ANALYZE`/`SYS_DESIGN`/
  `buildCheckSystem`/`buildCommonRules`/`buildStepSystem`/`buildRegenSystem`/
  `buildStepUser`/`STEP_DEFINITIONS`の各STEPの指示・文字数しきい値）
- `AI.gs` のAIプロバイダ呼び出し（Claude: `claude-sonnet-4-20250514` /
  OpenAI: `gpt-4o`）
- `NameTable.gs` の名前データ・ランダム抽出ロジック
- `index.html`（対話型UI、ブラウザから `doGet` 経由でアクセス）

## ファイル構成

```
Config.gs      ALLOWED_EMAILS・checkAuth()・getProperty()
AI.gs          callAI/callClaude/callOpenAI
Prompts.gs     全システムプロンプト・STEP定義（無改修）
NameTable.gs   登場人物の名前データ・ランダム抽出
Code.gs        doGet・各公開関数（認証ラッパー）＋ `_`付きコア関数
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
index.html     対話型UI（無改修）
```

## 重要：デプロイ設定（executeAs）

`appsscript.json` の `webapp.executeAs` は **`USER_ACCESSING`** のままにする
こと。`checkAuth()` はアクセスしているユーザー本人のメールアドレスを
`ALLOWED_EMAILS` と照合する設計のため、`USER_DEPLOYING`（他の移植済みApp
で使っている設定）に変更すると認証ロジックが意味を持たなくなる。

## セットアップ

1. `clasp create --type webapp --title "scenario-app" --rootDir .`
2. `Config.gs` の `ALLOWED_EMAILS` にブラウザでアクセスする人のメールアドレスを設定
3. Script Properties に以下を設定する。
   - `AI_PROVIDER`: `claude` または `openai`
   - `CLAUDE_KEY`（`AI_PROVIDER=claude`の場合）
   - `OPENAI_KEY`（`AI_PROVIDER=openai`の場合）
4. Webアプリとしてデプロイ（`executeAs: USER_ACCESSING` / `access: ANYONE`）
5. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     SCENARIO_APP_URL: '...',
     SCENARIO_APP_KEY: '...'   // 未使用のため省略可
   });
   ```

## doPost の入出力契約

producer の `callScenarioApp_`（`apps/producer/ExternalApps.gs`）は
キューシートの `参考シナリオ`/`タイトル` 列から以下のリクエストを組み立てて送る。

リクエスト：
```json
{
  "mode": "run",
  "refScenario": "参考にする元シナリオ本文",
  "title": "新規シナリオのタイトル"
}
```

レスポンス：
```json
{
  "ok": true,
  "title": "...",
  "design": "シナリオ設計（SYS_DESIGNの出力）",
  "check": "類似性チェック結果（参考情報、自動実行はブロックしない）",
  "steps": ["STEP0本文", "STEP1本文", "...", "STEP7本文"],
  "script": "全STEP結合済みの台本本文"
}
```

エラー時：
```json
{ "ok": false, "error": "..." }
```
