# PRP生成App（キャラ・Scene 画像生成プロンプト生成）

元はブラウザ単体で動く `PROMPT_GEN.html`（Anthropic APIをブラウザから直接呼び、
APIキーはlocalStorage保存）だった。プロンプト文面・分割ルール・モデルIDは
一字一句変更せず、producerからHTTP POSTで呼べるGAS Webアプリに移植した。

## 変更した点（呼び出し方のみ）
- APIキーの保存先: ブラウザlocalStorage → Script Properties (`ANTHROPIC_API_KEY`)
- 実行方式: ブラウザでのストリーミング表示 → サーバー側で完了まで待って一括返却
- レート制限時のリトライ: SCENEモードのみ元ツールと同じ待機時間で実装（CHARACTERモードは元ツールにリトライがないため未追加）

## 変更していない点
- `Prompts.gs` のシステムプロンプト文面（CHARACTER/SCENE両方）
- `CLAUDE_MODEL`（元ツールと同じ `claude-sonnet-4-20250514`）
- Sceneの10件バッチ分割、TSV整形ロジック

## API
`doPost` に以下のJSONを送る。

### キャラクター生成
```json
{ "mode": "character", "input": "【登場人物設計】の本文" }
```
レスポンス: `{ ok, characters: [{name, content}], rows: ["スプシ貼り付け用1行ずつ"] }`

### Scene生成（1バッチ分・推奨）
```json
{ "mode": "scene", "script": "台本全文", "totalScenes": 150, "batchIndex": 0 }
```
レスポンス: `{ ok, batch: {batchIndex, startScene, endScene, text}, rows: [...] }`

### Scene生成（全バッチ一括・少数バッチ時のみ推奨）
```json
{ "mode": "scene", "script": "台本全文", "totalScenes": 30 }
```
GASのWebApp実行は最大6分のため、`totalScenes` が大きい場合は必ず `batchIndex` を
指定して producer 側でバッチごとに呼び出すこと。

## セットアップ
1. `clasp create --type webapp --title "prp-generator"`
2. `clasp push`
3. Script Properties に `ANTHROPIC_API_KEY` を設定
4. Webアプリとしてデプロイし、そのURLを producer 側の Script Properties
   `PRP_APP_URL` に設定する（`PRP_APP_KEY` は未使用のため空でよい）
