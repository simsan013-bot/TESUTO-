# TESUTO-

スカッと系YouTube制作の自動化組織システム（GAS実装）。
詳細仕様は [docs/instruction.md](docs/instruction.md) を参照。

## 構成

```
apps/
  producer/       ← プロデューサー（全体統括AI）。自動化キューシート/NGログシートのCRUDと
                    オーケストレーション（状態管理・ゲート引き上げ・リトライ制御）を持つ。
  prp-generator/  ← キャラ・Scene画像生成プロンプト生成App。元はブラウザ単体ツール
                    だったものをプロンプト無改修でGAS Webアプリに移植（既存App群の1つ）。
  image-generator/ ← スプシ画像生成App。元はスプレッドシート紐付けのメニュー操作ツール
                    だったものをプロンプト無改修のままproducerからHTTP呼び出し可能にした
                    （既存App群の1つ。Veo動画化機能はメニュー専用のまま）。
  scenario-app/   ← シナリオ最適化AI。元は認証ガード付きの対話型Webアプリだったものを
                    プロンプト無改修のままproducerからHTTP呼び出し可能にした
                    （既存App群の1つ。対話型UIはそのまま利用可能）。
  compression-tool/ ← 圧縮・再編集ツール。元は認証ガード付きの対話型Webアプリだったものを
                    プロンプト無改修のままproducerからHTTP呼び出し可能にした
                    （既存App群の1つ。対話型UIはそのまま利用可能。producer側の
                    アナリストFB工程が未実装のため、自動巡回からは現時点では到達不可）。
  character-script-app/ ← キャラ別台本生成App。元は対話型Webアプリ（2ボタン操作）
                    だったものをロジック無改修のままproducerからHTTP呼び出し可能にした
                    （既存App群の1つ。対話型UIはそのまま利用可能。`圧縮`工程からの
                    spreadsheetId連携が未設計のため、自動巡回からは現時点では到達不可）。
  fish-audio-tts/ ← 音声生成App。元は対話型Webアプリ（ブラウザ側JSがDoc単位で
                    再帰呼び出し）だったものをロジック無改修のままproducerから
                    HTTP呼び出し可能にした（既存App群の1つ。対話型UIはそのまま
                    利用可能。1回の呼び出しでDoc1件のみ処理する設計のため、
                    producerが複数回呼び出して進める仕組み・入力受け渡し経路が
                    未設計で、自動巡回からは現時点では到達不可）。
docs/
  instruction.md  ← 実装指示書（仕様の原本）
```

各GAS App（プロデューサー、チェッカー群、新規3Appなど）は `apps/<app名>/` に
clasp想定の独立プロジェクトとして配置する。セットアップ手順は各App配下のREADME参照。

## 実装状況

指示書7章の推奨順序のうち、STEP1〜3（自動化キューシート／プロデューサーの状態機械／
既存6Appの呼び出しラッパー）まで実装済み。既存6App（PRP生成App・画像生成App・
シナリオApp・圧縮ツール・キャラ別台本生成App・音声生成App＝Fish Audio TTS）は
すべてコード移植済み。
STEP4以降（チェッカー①〜⑦、ディレクター・アナリスト、新規3App、ゲートUI、channels設定）は未実装。
