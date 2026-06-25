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
4. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）。
5. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     FISH_AUDIO_URL: '...',
     FISH_AUDIO_KEY: '...'   // 未使用のため省略可
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

## 既知の未解決事項

1. **producerから複数回呼び出す仕組みが未実装**

   上述のとおり、この App は1回の`doPost`でDoc 1件しか処理しない。元のUIは
   ブラウザ側JSの再帰呼び出しでこれを吸収していたが、producer側
   （`apps/producer/Pipeline.gs`の`PIPELINE_EXECUTORS['音声'] = callFishAudioTts_`）の
   `startProcess_`は現状、各工程の実行関数を**1回だけ**呼んで`CHECKING`状態に
   遷移させる設計になっている（`apps/producer/Code.gs`）。そのため、producerが
   この App を呼んでも最初の1Docしか処理されず、`nextIdx`を使って残りのDocを
   処理し続ける仕組みは未実装。

2. **producerからの入力（`sheetId`/`sheetName`/`docIds`/`outputFolder`）の
   受け渡し経路が未設計**

   `startProcess_`が各executorに渡すpayloadは現状
   `{ workId, title, refScenario, channelId, folderId }`の固定形であり、
   この App が要求する音声モデル設定シートのID・タブ名・対象Doc ID配列は
   含まれていない。`apps/character-script-app/README.md`に記載の
   `圧縮`→`キャラ別台本`間のspreadsheetId連携未設計と同種の課題であり、
   `キャラ別台本`（`generateModelDocs`が生成するDoc群）の出力を、この App の
   `docIds`としてどう受け渡すかも合わせて今後の設計課題。

3. **音声モデル設定シートの形式は`character-script-app`の「キャラ一覧」タブと
   互換性がある（未接続）**

   この App の`generateAudio`は列B＝キャラ名（`【】`除去）、列C＝voice_idの
   シートを読む。`character-script-app`の「キャラ一覧」タブ（タグ＝A、
   キャラ名＝B、voice_id＝C、speed＝D、emotion_tag＝E）と列レイアウトが
   一致するため、同じスプレッドシートをそのまま`sheetId`/`sheetName`として
   渡せる可能性があるが、実際にどの工程の出力からこのシートIDを得るかは
   上記2.の解消と合わせて今後の設計課題（まだ接続・実装していない）。
