# producer

プロデューサー（全体統括AI）のGASプロジェクト。自動化キューシート／NGログシートの
CRUDと、パイプラインのオーケストレーション（状態管理・ゲート引き上げ・リトライ制御）を持つ。

実装範囲はSTEP1〜3（自動化キューシート、プロデューサーの状態機械、既存6App呼び出し）。
チェッカー①〜⑦・ディレクター・アナリスト・新規3App（編集／サムネ／投稿）・ゲートUI・
channels設定はまだ未実装（指示書7章のSTEP4以降）。

## セットアップ（clasp）

```bash
npm install -g @google/clasp
clasp login
cd apps/producer
clasp create --type webapp --title "producer" --rootDir .
clasp push
```

`clasp create` で生成される `.clasp.json` はリポジトリにはコミットしない（環境ごとのscriptIdを含むため `.gitignore` 済み）。

## Script Properties の設定

GASエディタの「プロジェクトの設定」→「スクリプト プロパティ」、または以下を一度だけ実行する。

```js
setScriptProperties({
  SPREADSHEET_ID: '...',           // 自動化キューシート/NGログを置くスプレッドシートのID
  SCENARIO_APP_URL: '...',
  SCENARIO_APP_KEY: '...',         // 不要な場合は省略可
  COMPRESSION_APP_URL: '...',
  COMPRESSION_APP_KEY: '...',
  CHARACTER_SCRIPT_APP_URL: '...',
  CHARACTER_SCRIPT_APP_KEY: '...',
  FISH_AUDIO_URL: '...',
  FISH_AUDIO_KEY: '...',
  PRP_APP_URL: '...',
  PRP_APP_KEY: '...',
  IMAGE_APP_URL: '...',
  IMAGE_APP_KEY: '...'
});
```

各App用の `..._APP_KEY` は、呼び出し先App側のスクリプトプロパティ `PRODUCER_SHARED_KEY` と
**同じ値**を設定すること（合言葉が一致しない呼び出しはApp側で拒否される）。

## 初期化

```js
setupQueueSheet();  // 自動化キューシートのヘッダーを作成
setupNgLogSheet();   // NGログシートのヘッダーを作成
```

## 主な関数

| 関数 | 用途 |
|---|---|
| `addQueueRow(title, channelId, folderId, refScenario)` | 新規作品をキューに追加（作品Noを自動採番）。`refScenario`はシナリオApp工程の入力（参考シナリオ本文）。ディレクター実装までの暫定で、手動入力を想定 |
| `getQueueRow(workId)` | 行をオブジェクトとして取得 |
| `updateProcessState(workId, processName, status, outputId)` | 工程の状態/出力ID/更新時刻を更新 |
| `runProducerTick()` | キューを巡回し、各作品を1ステップ進める（時間主導トリガー用） |
| `recordCheckResult(workId, processName, checkerName, isOk, reason, fixInstruction)` | チェッカー（STEP4で実装予定）からの判定結果を受けてリトライ/エスカレーションを処理 |
| `clearGate(workId)` | Sim確認ゲートをクリアして次工程へ進める |
| `installProducerTrigger(intervalMinutes)` | `runProducerTick` を時間主導トリガーで自動実行するよう設定する（省略時は30分おき） |
| `uninstallProducerTrigger()` | 自動実行トリガーを解除する |

## トリガー設定（自動実行）

GASエディタで `installProducerTrigger()` を一度だけ実行する（引数なしなら30分おき）。
以後はGASが自動でその間隔ごとに `runProducerTick()` を呼び続ける。

間隔を変更したい場合は、`installProducerTrigger(10)`（10分おきの例）のように
別の分数を指定して再実行すればよい。内部で古いトリガーを削除してから新しいトリガーを
作成するため、二重登録にはならない。指定できる分数はGASの仕様上 1 / 5 / 10 / 15 / 30 のいずれか。

トリガーを止めたい場合は `uninstallProducerTrigger()` を実行する。

なお、producer自身の `doPost` も外部から「今すぐ1回実行して」と呼べる入口として残してあるが、
緊急時の手動実行用。デプロイURLを知っていれば誰でも呼び出せる点に注意（合言葉チェックなし）。
