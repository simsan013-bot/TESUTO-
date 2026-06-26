# character-script-app（キャラ別台本生成App）

スプレッドシートの台本（タブ1）とキャラ別音声モデル指定（タブ2「キャラ一覧」）から、
音声モデル（voice_id）ごとに台詞をまとめたGoogle Docを自動生成するツール。
元は `Code.gs`＋`Index.html`（HtmlServiceで配信、`google.script.run`経由の
2ボタン操作）のスタンドアロンApp。運用者が一人のみの想定のため、人間用UIの
パスワード入力（Script Propertiesの`SECRET_KEY`と入力値を比較する方式）は
撤去済み（デプロイURLを知っていれば誰でもブラウザから開ける状態になる）。

## 移植にあたっての構造変更

元のソースは全関数が`var`/`function`のみで記述されており、`const`/`let`/
アロー関数/テンプレートリテラルは使われていなかったため、構文変換は不要だった。
ロジック・文言・正規表現は一切変更していない
（`looksLikeCharName`等の`\uXXXX`形式のUnicodeエスケープは、移植時に等価な
リテラル文字表記に変わっているが、指し示すコードポイントは同一）。

1. **`doPost` Web APIエントリーポイントを追加（`WebApi.gs`、新規ファイル）**

   元のUIは「STEP1: キャラ一覧をスプシに書き出す（`extractCharacterList`）→
   人間が「キャラ一覧」タブのC列にvoice_idを入力 → STEP2: モデル別Doc生成
   （`generateModelDocs`）」という、人間が2つのボタンを順に押す前提の設計。
   `extractCharacterList`は実行するたびに「キャラ一覧」タブを
   `clearContents()`するため、ここでSTEP1とSTEP2を自動連結（chain）すると、
   人間が入力済みのvoice_id割り当てを毎回消してしまう。そのため`doPost`でも
   元のUIと同じ2ボタン構成をそのまま独立した2モードとして公開した
   （`mode: 'extract'` / `mode: 'run'`）。自動連結は行っていない。

   - producerからの呼び出し自体を認証するための
     `PRODUCER_SHARED_KEY`（`verifyProducerSecret_()`）を追加した。
     producer側の`CHARACTER_SCRIPT_APP_KEY`と**同じ値**にする必要がある。
     未設定の場合、producerからの呼び出しはすべて拒否される。

## 保持したもの（無改修）

- `authDrive()`（コピー先スプレッドシートはOAuthトークンを引き継がないため、
  初回デプロイ後に一度実行してDrive/Docsのスコープを認証する用途）
- `TAG_OPTIONS`・タグごとの色・条件付き書式
- `extractCharacterList`/`generateModelDocs`/`detectColumns`等のロジック
  （タブ1の台本解析、4000文字超ブロックの警告、モデル別Doc分割・保存先
  フォルダ自動作成など）
- `Index.html`（対話型UI、ブラウザから`doGet`経由でアクセス。一字一句無改修）

## 移植時に分離したもの：`onEdit`トリガー

元のソース末尾にあった`onEdit(e)`（「キャラ一覧」タブのvoice_id列を編集した際、
同じタグの全行に自動反映する）は、**このWebAppプロジェクトには含めていない**。
スタンドアロンWebアプリのプロジェクトに置いても、対象スプレッドシート側の
編集に対して発火しないため。元のコード末尾コメントの指示どおり、
**台本を置く各スプレッドシート自身の拡張機能 → Apps Script** に下記をそのまま
貼り付けて設置する。

```js
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'キャラ一覧') return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (col !== 3 || row < 2) return;

  var newVoiceId = String(e.value || '').trim();
  if (!newVoiceId) return;

  var editedTag = String(sheet.getRange(row, 1).getValue()).trim();
  if (!editedTag) return;

  var lastRow = sheet.getLastRow();
  var updated = 0;

  for (var r = 2; r <= lastRow; r++) {
    if (r === row) continue;
    var tagVal = String(sheet.getRange(r, 1).getValue()).trim();
    if (tagVal === editedTag) {
      sheet.getRange(r, 3).setValue(newVoiceId);
      updated++;
    }
  }

  if (updated > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'タグ「' + editedTag + '」の ' + updated + '行に voice_id を反映しました',
      '✅ 自動入力完了',
      3
    );
  }
}
```

## ファイル構成

```
Code.gs        authDrive・doGet・TAG_OPTIONS・extractCharacterList・generateModelDocs等
WebApi.gs      doPost（producerからのHTTP呼び出し用、新規追加）
Index.html     対話型UI（無改修）
```

## セットアップ

1. `clasp create --type webapp --title "character-script-app" --rootDir .`
2. Script Propertiesに`PRODUCER_SHARED_KEY`（producer専用の合言葉）を
   設定する。producer側の`CHARACTER_SCRIPT_APP_KEY`と**同じ値**にすること。
3. デプロイ後、エディタから`authDrive()`を一度実行してDrive/Docsのスコープを認証する。
4. Webアプリとしてデプロイ（`executeAs: USER_DEPLOYING` / `access: ANYONE`）。
5. デプロイURLを producer 側の Script Properties に設定する。
   ```js
   setScriptProperties({
     CHARACTER_SCRIPT_APP_URL: '...',
     CHARACTER_SCRIPT_APP_KEY: '...'   // 上記PRODUCER_SHARED_KEYと同じ値
   });
   ```
7. 台本を置く各スプレッドシートの拡張機能 → Apps Scriptに、上記`onEdit`を設置する。

## doPost の入出力契約

リクエスト（キャラ一覧の書き出し。初回・シナリオ更新時のみ）：
```json
{ "mode": "extract", "spreadsheetId": "..." }
```

リクエスト（モデル別Doc生成。「キャラ一覧」タブにvoice_id入力済みであること）：
```json
{ "mode": "run", "spreadsheetId": "..." }
```

レスポンス：
```json
{ "ok": true, "logs": ["..."], "charCount": 0 }
```

エラー時：
```json
{ "ok": false, "error": "..." }
```

## producer連携：`圧縮`工程からのspreadsheetId受け渡し（解消済み）

以前は、`圧縮`工程の出力からこのAppが要求する`spreadsheetId`を得る経路が
未設計だった（タブ1/タブ2形式のスプシを作る`exportToSpreadsheet`が
管理表`MGMT_SHEET`の行番号からフォルダIDを取得する設計で、producerの
自動化キューシート＝作品ごとに`フォルダID`を直接持つ設計と噛み合わなかった）。

`apps/compression-tool`側に`exportForProducer_`＋`doPost`の`mode:'export'`
（producerの自動化キューシートの`フォルダID`を直接渡せる経路。詳細は
`apps/compression-tool/README.md`参照）を追加し、producerの「圧縮」工程
（`apps/producer/ExternalApps.gs`の`runCompressionStage_`）がテキスト生成後に
このスプシを作成、`圧縮_出力ID`として保存するようにした。
`apps/producer/Code.gs`の`buildStagePayload_`が「キャラ別台本」工程実行時に
その`圧縮_出力ID`をそのまま`spreadsheetId`としてこのAppの`mode:'run'`に渡す
（タブ2のvoice_idは`圧縮`工程側で選定済みのため、`mode:'extract'`は呼ばない）。
