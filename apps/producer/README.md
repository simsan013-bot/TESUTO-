# producer

プロデューサー（全体統括AI）のGASプロジェクト。自動化キューシート／NGログシートの
CRUDと、パイプラインのオーケストレーション（状態管理・ゲート引き上げ・リトライ制御）を持つ。

実装範囲はSTEP1〜4（自動化キューシート、プロデューサーの状態機械、既存6App呼び出し、
アナリストFB工程、チェッカー①〜⑦・ディレクター・Sim確認ゲートUI）。
新規3App（編集／サムネ／投稿）・channels設定はまだ未実装（指示書7章のSTEP6・8）。

## チェッカー①〜⑦・ディレクター・ゲートUI

`Checkers.gs`（チェッカー①〜⑦の判定定義）・`Director.gs`（ディレクター判定）・
`AI.gs`（判定用のClaude API呼び出し）・`GateUi.gs`+`gate.html`（Sim確認ゲートの
確認画面）を追加。判定は`startProcess_`（`Code.gs`）の中で、各工程のexecutorが
結果を返した直後に**同期的に**実行される（`runCheckOrDirector_`）。

- OK→工程完了、NG→修正指示を出して再実行（最大2回）→3回目もNGならその工程の
  ゲート（無ければ「なし」）にSim確認待ちとしてエスカレーション（既存の
  `recordCheckResult`のロジックをそのまま使用、変更なし）
- NG理由・修正指示は必ずNGログシートに記録される（指示書3.5章準拠）
- チェッカーの`fixInstruction`は次回実行時のpayloadに自動で注入されない
  （指示書3.5章の運用ルール通り、傾向が見えたら**生成側プロンプト**に
  人間が反映する想定のため。チェッカー側で自動修正ループにはしない）

### 実際に発火するのは①〜④＋ディレクター＋ゲートA/Bのみ（現状）

チェッカー②〜⑦の判定ロジック自体はすべて実装済みだが、`画像`以降の
工程は`buildStagePayload_`（`Code.gs`）がまだ各App固有の正しいpayloadを
組み立てられないため、executor自体が実行できず判定にも到達しない
（`画像`=PRP生成App用payload未接続、`編集`/`サムネ`=App自体が未実装）。
`キャラ別台本`は`圧縮`工程（`runCompressionStage_`、`apps/producer/ExternalApps.gs`）が
スプシ出力まで行い`圧縮_出力ID`にspreadsheetIdを保存するようになったため、
チェッカー②も含めてすでに発火対象。`音声`はfish-audio-ttsの「1回の呼び出しで
Doc1件だけ処理する」仕様を`runFishAudioStage_`が1工程内でループ呼び出しして
吸収する形で接続済み（チェッカー③）。`猫感想`もcat-commentary-appの`doPost`に
合言葉チェックを追加して`PIPELINE_EXECUTORS`に登録済み（チェッカー④）。
これら未解決の工程は別途解消が必要な既知の課題で、解消され次第、追加実装なしで
チェッカーが自動的に発火するようにしてある。

ゲートUI自体はキューシート/NGログシートのみを見るため、上記の制約と無関係に
今すぐ動作する（後述のURLで確認可）。

## Sim確認ゲートUIの開き方

producerのWebApp URLの末尾に `?view=gate` を付けて開く（例：
`https://script.google.com/macros/s/xxxx/exec?view=gate`）。
Sim確認待ちの作品一覧・直近のNGログ・「クリアして次工程へ進める」ボタンを表示する。
クリアボタンは内部で既存の`clearGate(workId)`を呼ぶだけで、新しいロジックは無い。

## シナリオ→アナリストFB→圧縮 間のデータ受け渡し

`圧縮`App・`アナリストFB`Appはどちらも`title`/`design`/`script`（または`steps`）を
JSONの値としてそのまま受け取る設計のため、工程間で大きな台本テキストを橋渡しする
必要がある。`startProcess_`（`Code.gs`）はワークの`フォルダID`に
`title`/`design`/`steps`をテキスト化したDocを保存し、次工程の実行時にそのDocを
読み込んで入力を組み立てる（`StageOutput.gs`の`buildStepsDocText_`/
`parseStepsDocText_`/`saveTextAsDoc_`/`loadDocText_`）。

- `シナリオ`工程完了時：`No{作品No}_シナリオ`Docを保存（出力ID列に記録）
- `アナリストFB`工程：`シナリオ`Docを読み込んで本Appに渡し、修正後の結果を
  `No{作品No}_アナリストFB_修正版`Docとして保存
- `圧縮`工程：`アナリストFB`Docを読み込んで`script`/`design`を組み立てて渡す
  （`chars`は現時点でキャラクター設定生成元が無いため常に空文字）

`圧縮`工程の出力は上記Doc方式ではなく、スプレッドシートとして次工程に渡る
（`キャラ別台本`が要求するタブ1/タブ2形式が必要なため）。`runCompressionStage_`
（`apps/producer/ExternalApps.gs`）が圧縮App側の`mode:'run'`（テキスト生成）→
`mode:'export'`（folderId直接指定でのスプシ出力、`apps/compression-tool`の
`exportForProducer_`）を1工程内で連結し、できたspreadsheetIdを`圧縮_出力ID`に
保存する。`キャラ別台本`はそのIDを`spreadsheetId`としてそのまま受け取る
（詳細は`apps/compression-tool/README.md`「producer連携」参照）。
`音声`以降はまだこの仕組みに乗せていない（別途payload未接続、上記参照）。

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
  ANALYST_FEEDBACK_APP_URL: '...',
  ANALYST_FEEDBACK_APP_KEY: '...',
  COMPRESSION_APP_URL: '...',
  COMPRESSION_APP_KEY: '...',
  CHARACTER_SCRIPT_APP_URL: '...',
  CHARACTER_SCRIPT_APP_KEY: '...',
  FISH_AUDIO_URL: '...',
  FISH_AUDIO_KEY: '...',
  PRP_APP_URL: '...',
  PRP_APP_KEY: '...',
  IMAGE_APP_URL: '...',
  IMAGE_APP_KEY: '...',
  CAT_COMMENTARY_APP_URL: '...',
  CAT_COMMENTARY_APP_KEY: '...',
  CLAUDE_KEY: '...'              // チェッカー・ディレクターの判定に使うAnthropic APIキー
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
| `recordCheckResult(workId, processName, checkerName, isOk, reason, fixInstruction)` | チェッカー／ディレクターからの判定結果を受けてリトライ/エスカレーションを処理 |
| `runCheckOrDirector_(workId, processName, row, result)` | 工程実行直後にチェッカー/ディレクター判定を呼び出す（`startProcess_`内部から自動実行） |
| `clearGate(workId)` | Sim確認ゲートをクリアして次工程へ進める |
| `listGateWaitingItems()` / `getRecentNgLogForWorkId(workId, limit)` | ゲートUI（`gate.html`）が確認画面表示に使う読み取り専用関数 |
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
