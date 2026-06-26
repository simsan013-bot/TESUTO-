# image-generator（スプシ画像生成App）

元は「Gemini 画像生成ツール v5」という、特定のスプレッドシートに紐付く
（コンテナバインド）メニュー操作専用のGASツール。プロンプト・判定ロジック・
モデルID・シート構成はすべて無改修。今回の移植で変更したのは下記2点のみ。

## 変更した点

1. **構文をリポジトリの house style（var/function）に変換**
   元のスクリプトは `const`/`let`/アロー関数/オプショナルチェイニング/
   スプレッド構文を使用していた（GAS V8ランタイムはこれらをサポートするが、
   このリポジトリでは `var`/`function` のみを使う方針のため変換した）。
   生成ロジック・プロンプト文面・APIエンドポイント・モデルID・シート名・
   列構成・料金表示・確認ダイアログの文言は一切変更していない。

2. **`doPost` Web APIエントリーポイントを追加（`WebApi.gs`）**
   producerがHTTP POSTで呼べるようにするため新規追加。
   メニュー実行（`generateImages`/`translatePromptsOnly`等）と
   Web API実行は、1行分の生成本体である `generateOneImage_`
   （`ImageGeneration.gs`）を両方から呼ぶ共通関数として抽出したのみで、
   生成手順自体は完全に同一。

   このAppはコンテナバインドのままなので、Web Appとしてデプロイしても
   `SpreadsheetApp.getActiveSpreadsheet()` は紐付け先のスプレッドシートを
   指す（クライアントから渡されたスプレッドシートではない）。そのため
   `共通プロンプト`/`参照画像`/`生成履歴` シートはメニュー実行時と同じ
   ものが自動的に使われる。

## 保持したもの（無改修）

- 画像生成プロンプト・共通プロンプト・参照画像（`[[ラベル名]]`）の仕組み
- Geminiモデル：`gemini-3.1-flash-image-preview`（画像）/`gemini-2.5-flash`（翻訳・動画プロンプト生成）
- Veo 3.1 Fast（`veo-3.1-fast-generate-preview`）による動画化機能（メニューのみ、Web API未対応）
- J列キュー方式の自動生成トリガー機能
- シート構成（画像生成／生成履歴／共通プロンプト／参照画像）と列レイアウト
- 確認ダイアログ・料金目安表示・エラーメッセージの文言

## ファイル構成

```
Config.gs         定数（CONFIG/SHEET/COL/ANIM_CONFIG等）とScript Properties取得
RefImages.gs       共通プロンプト取得・[[ラベル名]]解析・Drive画像取得
ImageGeneration.gs 画像生成本体（generateOneImage_）・翻訳・Gemini画像API呼び出し
SheetSetup.gs       各シートの初期作成・ヘッダー再構築・生成履歴追記
Menu.gs             onOpenメニュー・共通プロンプト/参照画像シートを開く・設定確認・保存先変更
AutoQueue.gs        J列キューによる自動生成（startAutoGenerate/runNextRow/stopAutoGenerate）
Animation.gs        Veo 3.1 Fastによる選択画像の動画化
WebApi.gs           doPost/doGet（producerからのHTTP呼び出し用、新規追加）
```

## セットアップ

1. このフォルダを `clasp create --type sheets` 等でスプレッドシート紐付けの
   GASプロジェクトとして作成し、`clasp push` する
   （または既存のスプレッドシートの拡張機能エディタにそのまま貼り付ける）。
2. スクリプトプロパティに以下を設定する。
   - `GEMINI_API_KEY` : Google AI Studio で取得したAPIキー
   - `DRIVE_FOLDER_ID` : 生成画像/動画の保存先Google DriveフォルダID
3. メニュー「🔧 シート初期設定（ヘッダー再作成）」を一度実行してシート構成を整える。
4. スクリプトプロパティに `PRODUCER_SHARED_KEY`（producer専用の合言葉）を設定する。
   producer側の `IMAGE_APP_KEY` と**同じ値**にすること。未設定の場合、producerからの
   呼び出しはすべて拒否される。
5. Web Appとしてデプロイし、デプロイURLを producer 側の
   `IMAGE_APP_URL`、上記合言葉を `IMAGE_APP_KEY` に設定する
   （`setScriptProperties({IMAGE_APP_URL: '...', IMAGE_APP_KEY: '...'})`）。

## doPost の入出力契約

### mode: "generate"

producer の `runImageStage_`（`apps/producer/ExternalApps.gs`）が
PRP生成Appのキャラクター用／シーン用プロンプトをそれぞれこのモードで渡す。

リクエスト：
```json
{
  "mode": "generate",
  "rows": ["プロンプト1", "プロンプト2"],
  "folderId": "（省略可。省略時はDRIVE_FOLDER_IDを使用）"
}
```

レスポンス：
```json
{
  "ok": true,
  "results": [
    { "promptJa": "...", "ok": true, "imageUrl": "...", "driveUrl": "...", "missing": [], "refLabels": [] }
  ]
}
```

### mode: "registerRef"（producer連携で新規追加）

人間が参照画像シート（`参照画像`タブ、A=ラベル名/B=Drive URL/C=用途メモ）に
手動でラベルとURLを書く操作のAPI版（`registerRefImage_`、`RefImages.gs`）。
このAppはコンテナバインドのため参照画像シートは全ワーク共通の1枚しかない。
producer側はワーク単位のラベル（例：`No12_岡本`）を付けて渡すことで、
ワーク間のラベル衝突を避ける（後述「producer連携」参照）。

リクエスト：
```json
{
  "mode": "registerRef",
  "refs": [
    { "label": "No12_岡本", "url": "https://drive.google.com/...", "memo": "（省略可）" }
  ]
}
```

レスポンス：
```json
{ "ok": true, "registered": 1 }
```

## producer連携（解消済み）

以前は「画像」工程のexecutor（`runImageStage_`）がPRP生成Appの出力を
そのままこのAppに渡すだけで、登場人物設計から参照画像を作って登録する手順
（従来は人間が手作業で行っていた）が未実装だった。

`apps/producer/ExternalApps.gs`の`runImageStage_`を書き換え、PRP生成Appの
`character`モードでキャラクター別プロンプトを生成→各キャラの正面プロンプトを
このAppの`generate`モードで1枚ずつ画像化→生成したURLをこのAppの新しい
`registerRef`モードでワーク単位ラベル（`No{作品No}_名前`）として登録、という
手順を1工程内で連結している。シーン用プロンプト（PRP生成Appの`scene`モード）
が出力する`[[名前]]`参照は、producer側で`[[No{作品No}_名前]]`に文字列置換
してからこのAppの`generate`モードに渡すため、画像生成App自身のロジック・
プロンプトは無改修のまま、ワークをまたいだラベル衝突を避けられる。
