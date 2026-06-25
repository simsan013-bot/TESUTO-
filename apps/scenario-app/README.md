# scenario-app（シナリオ最適化AI）

元はHtmlServiceの対話型Webアプリ（参考シナリオ入力→設計→
類似性チェック→タイトル確認→STEP0〜7台本生成を1画面ずつ進める）。
プロンプト文面（`SYS_ANALYZE`/`SYS_DESIGN`/`buildCheckSystem`/各STEPの
生成ルール・文字数しきい値）・AIモデルID・名前データは一字一句変更していない。
今回の移植で変更したのは下記2点のみ。
（運用者が一人のみの想定のため、人間用UIのメールアドレス許可リスト
`checkAuth()`は撤去済み。デプロイURLを知っていれば誰でもブラウザから
開ける状態になる）

## 変更した点（呼び出し方のみ）

1. **`designScenario`/`checkSimilarity`/`writeStep`/`regenerateStep` の
   本体を「`_`付きのコア関数」に分離**（`Code.gs`）。ブラウザの
   `google.script.run` からは薄いラッパー経由で呼ばれ、挙動は元のまま
   完全に同一。producerからのHTTP POST（サーバー間呼び出し）も
   コア関数を直接呼ぶ新しい `doPost`（`WebApi.gs`）から実行する。

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
Config.gs      getProperty()
AI.gs          callAI/callClaude/callOpenAI
Prompts.gs     全システムプロンプト・STEP定義（無改修）
NameTable.gs   登場人物の名前データ・ランダム抽出
Code.gs        doGet・各公開関数（薄いラッパー）＋ `_`付きコア関数
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
index.html     対話型UI（無改修）
```

## デプロイ設定（executeAs）

`appsscript.json` の `webapp.executeAs` は他の移植済みApp群と統一して
**`USER_DEPLOYING`** にしている。producerからの`doPost`呼び出しは
ブラウザでログインしたGoogleユーザーではないサーバー間通信（匿名アクセス）
のため、`USER_ACCESSING`だと`Session.getActiveUser()`が空になり実行権限が
不安定になる（producerが使う他の5Appも同じ理由で`USER_DEPLOYING`）。

## セットアップ

1. `clasp create --type webapp --title "scenario-app" --rootDir .`
2. Script Properties に以下を設定する。
   - `AI_PROVIDER`: `claude` または `openai`
   - `CLAUDE_KEY`（`AI_PROVIDER=claude`の場合）
   - `OPENAI_KEY`（`AI_PROVIDER=openai`の場合）
   - `PRODUCER_SHARED_KEY`: producer専用の合言葉。producer側の `SCENARIO_APP_KEY` と
     **同じ値**にすること。未設定の場合、producerからの呼び出しはすべて拒否される。
3. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）
4. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     SCENARIO_APP_URL: '...',
     SCENARIO_APP_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
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
