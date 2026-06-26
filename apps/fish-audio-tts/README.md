# fish-audio-tts（音声生成App）

スプレッドシートの音声モデル設定（タブ：キャラ名→voice_id）と、台本Doc（`===SPLIT===`
区切り）を入力に、[Fish Audio](https://fish.audio/) のTTS（音声合成）／ASR（字幕用文字起こし）
APIを呼び出して`.wav`（＋任意で`.srt`）をDriveに保存するツール。
元は`Code.gs`＋`index.html`（HtmlServiceで配信、`google.script.run`経由のボタン操作）の
スタンドアロンApp。

## 移植にあたっての構造変更

元のソースは全関数が`var`/`function`のみで記述されており、`const`/`let`/
アロー関数/テンプレートリテラルは使われていなかったため、構文変換は不要だった。
ロジック・文言は一切変更していない。

1. **`doPost` Web APIエントリーポイントを追加（`WebApi.gs`、新規ファイル）**

   元のUIは「ボタンを1回押す → ブラウザ側JS（`processNext()`）が
   `generateAudio()`をDoc 1件ずつ再帰呼び出しし、全Doc完了まで自動で進める」設計。
   `generateAudio()`自体は**1回の呼び出しでDoc 1件のみ**処理する（Doc内の
   `===SPLIT===`区切りごとにTTS呼び出し＋`Utilities.sleep(5000)`、字幕生成
   オプション有効時はさらにASR呼び出し＋`sleep(5000)`を繰り返すため、SPLIT数の
   多いDocではGASの6分実行上限に達するリスクがあるための設計）。

   `doPost`もこの「1回の呼び出しでDoc 1件だけ処理する」設計をそのまま維持した。
   **全Docを処理するには、呼び出し側がレスポンスの`nextIdx`を次のリクエストの
   `currentIdx`に入れて、`allDone: true`になるまで`doPost`を繰り返し呼ぶ必要がある**
   （元のUIの`processNext()`再帰呼び出しと同じ進行方式）。

## 保持したもの（無改修）

- `authDrive()`（初回デプロイ後に一度実行してDrive/Docsのスコープを認証する用途）
- `setApiKey()`/`checkApiKey()`（管理者用。`setApiKey()`内のプレースホルダー文字列は
  実際のAPIキーではなく、管理者が手動で書き換えてから一度だけ実行する前提）
- `generateAudio`/`buildSrt`/`formatSrtTime`/`pad2`/`pad3`等のロジック
  （SPLITグループ単位のセリフ分類、モデル未登録・Doc読み込み失敗時の自動スキップ、
  Drive保存先フォルダ自動作成など）
- `index.html`（対話型UI、ブラウザから`doGet`経由でアクセス。一字一句無改修）

## ファイル構成

```
Code.gs        doGet・generateAudio・buildSrt・setApiKey・checkApiKey・authDrive等
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
index.html     対話型UI（無改修。doGetが小文字'index'を参照するためファイル名も小文字）
```

## セットアップ

1. `clasp create --type webapp --title "fish-audio-tts" --rootDir .`
2. エディタから`setApiKey()`内のプレースホルダーを実際のFish Audio APIキーに
   書き換えて一度実行する（`FISH_API_KEY`としてScript Propertiesに保存される）。
   `checkApiKey()`で設定済みか確認できる。
3. 同じくエディタから`authDrive()`を一度実行してDriveのスコープを認証する。
4. Script Propertiesに`PRODUCER_SHARED_KEY`（producer専用の合言葉）を設定する。
   producer側の`FISH_AUDIO_KEY`と**同じ値**にすること。未設定の場合、
   producerからの呼び出しはすべて拒否される。
5. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）。
6. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     FISH_AUDIO_URL: '...',
     FISH_AUDIO_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
   });
   ```

## doPost の入出力契約

リクエスト（Doc 1件処理。`currentIdx`は0始まり、`docIds`配列内のインデックス基準
ではなく「空欄を除いた有効Doc配列」内のインデックス基準であることに注意）：
```json
{
  "mode": "run",
  "sheetId": "...",
  "sheetName": "キャスト設定",
  "docIds": ["docId1", "docId2", ""],
  "outputFolder": "作品01",
  "generateSrt": true,
  "currentIdx": 0
}
```

レスポンス（処理継続中）：
```json
{
  "ok": true,
  "allDone": false,
  "logs": ["..."],
  "savedFiles": [{ "name": "...", "url": "..." }],
  "nextIdx": 1,
  "originalIdx": 0
}
```

レスポンス（全Doc完了）：
```json
{ "ok": true, "allDone": true, "logs": ["✅ 全Docの処理が完了しています。"], "savedFiles": [], "nextIdx": 1 }
```

エラー時：
```json
{ "ok": false, "error": "..." }
```

## producer連携（解消済み）

以前は、(1) producerから複数回呼び出す仕組みが無い、(2) producerからの入力
（`sheetId`/`sheetName`/`docIds`/`outputFolder`）の受け渡し経路が未設計、
という2点が未解決だった。

`apps/producer/ExternalApps.gs`に`runFishAudioStage_`（「圧縮」工程の
`runCompressionStage_`と同じ「1工程内で連結」パターン）を追加し、
`PIPELINE_EXECUTORS['音声']`をこれに変更した。`runFishAudioStage_`は
`callFishAudioTts_`を`allDone:true`になるまでループ呼び出しし、各回の
`logs`/`savedFiles`を集約して1つの結果として返す（`nextIdx`が進まない
応答が返った場合は、リトライしても解決しない設定エラーと判断して打ち切る）。

入力の受け渡しは、`apps/producer/Code.gs`の`buildStagePayload_`の`音声`分岐が
担う。音声モデル設定シートの列レイアウトが`character-script-app`の
「キャラ一覧」タブと互換であることを利用し、`圧縮_出力ID`（キャラ別台本工程が
書き込んだスプシのID）をそのまま`sheetId`に、`sheetName`は`'キャラ一覧'`を
渡す。`docIds`は同じスプシの「生成Doc一覧」タブ（`character-script-app`の
`generateModelDocs`が書き出す）のDoc ID列を`readGeneratedDocIds_`
（`apps/producer/ExternalApps.gs`）で読み取って渡す。
