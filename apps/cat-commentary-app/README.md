# cat-commentary-app（猫感想ツール）

既存の「デブ猫スカッとコメント生成ツール」を、人間用UI（`index.html`）付きの
GASプロジェクトとしてそのままリポジトリに取り込んだもの。シナリオ本文を渡すと、
語り手キャラ「デブ猫」視点のYouTube向け感想コメント（チャンネル登録誘導の
お決まりフレーズ付き）を生成する。

プロンプト・ロジックは既存App側のまま変更していない（`SYSTEM_PROMPT`・
`callClaude`・`saveHistory`等は元のコードと同一）。

`docs/instruction.md`の パイプライン上の`猫感想`工程に対応するが、現時点では
`apps/producer`からは未接続（Gap 2、動画作成の主要フロー（アナリストFB／
編集・サムネ・投稿／チェッカー・ディレクター）を先に固めてから接続する方針のため）。

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

## 入出力

- 人間用UI：WebAppのURLを開き、シナリオ本文を貼り付けて「猫に喋らせる」を押す。
- 外部からの呼び出し（Make/n8n等）：`doPost`に`{ "scenario": "シナリオ本文" }`をJSONで送ると
  `{ "success": true, "output": "猫のコメント" }`（またはエラー時`{ "success": false, "error": "..." }`）を返す。

## producer連携（未接続・将来の接続候補）

`apps/producer`から呼び出す場合は、他App（`apps/analyst-feedback-app`等）と同様に
`doPost`に`secret`（合言葉）を含めて呼ぶ運用に揃える必要がある。現状の`doPost`には
合言葉チェックが無いため、接続する際は`verifyProducerSecret_`相当のチェックを
追加する必要がある（既存の人間用UI経由の呼び出しを壊さないよう、`mode`や`secret`の
有無で人間用/producer用を分岐する設計が必要になる）。
