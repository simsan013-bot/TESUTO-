# cat-commentary-app（猫感想ツール）

既存の「デブ猫スカッとコメント生成ツール」を、人間用UI（`index.html`）付きの
GASプロジェクトとしてそのままリポジトリに取り込んだもの。シナリオ本文を渡すと、
語り手キャラ「デブ猫」視点のYouTube向け感想コメント（チャンネル登録誘導の
お決まりフレーズ付き）を生成する。

プロンプト・ロジックは既存App側のまま変更していない（`SYSTEM_PROMPT`・
`callClaude`・`saveHistory`等は元のコードと同一）。

`docs/instruction.md`の パイプライン上の`猫感想`工程に対応する。

## ファイル構成

```
Code.gs        doGet（index.html表示）/ doPost・handlePost（コメント生成）/ callClaude / saveHistory
index.html     生成・履歴タブを持つWebApp UI（google.script.runでCode.gsを呼ぶ）
```

## セットアップ（clasp）

```bash
cd apps/cat-commentary-app
clasp create --type webapp --title "cat-commentary-app" --rootDir .
clasp push
```

## Script Properties の設定

| キー | 用途 |
|---|---|
| `CLAUDE_API_KEY` | AnthropicのAPIキー（必須） |
| `SHEET_ID` | 生成履歴を保存するスプレッドシートのID（省略可。未設定なら履歴保存をスキップ） |
| `PRODUCER_SHARED_KEY` | producer専用の合言葉。producer側の`CAT_COMMENTARY_APP_KEY`と**同じ値**にすること。未設定の場合、producerからの呼び出しはすべて拒否される |

Webアプリとしてデプロイ後、デプロイURLをproducer側のScript Propertiesに設定する。
```js
setScriptProperties({
  CAT_COMMENTARY_APP_URL: '...',
  CAT_COMMENTARY_APP_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
});
```

## 入出力

- 人間用UI：WebAppのURLを開き、シナリオ本文を貼り付けて「猫に喋らせる」を押す
  （ブラウザは`google.script.run`経由で`handlePost()`を直接呼ぶため、`doPost`は経由しない）。
- producerからの呼び出し：`doPost`に`{ "scenario": "シナリオ本文", "secret": "..." }`を
  JSONで送ると`{ "ok": true, "output": "猫のコメント" }`
  （またはエラー時`{ "ok": false, "error": "..." }`）を返す。

## producer連携（解消済み）

`doPost`に`verifyProducerSecret_`（合言葉チェック）を追加した。ブラウザの
`index.html`は`doPost`を経由せず`handlePost()`を直接呼ぶ設計のため、この
チェック追加は人間用UIの挙動に影響しない。`apps/producer/ExternalApps.gs`に
`callCatCommentaryApp_`を追加し、`PIPELINE_EXECUTORS['猫感想']`に登録した。
`apps/producer/Code.gs`の`buildStagePayload_`は、圧縮工程が読むのと同じ
アナリストFB修正後Doc（`アナリストFB_出力ID`）のsteps結合文を`scenario`として渡す。
