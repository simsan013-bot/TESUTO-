# TESUTO-

スカッと系YouTube制作の自動化組織システム（GAS実装）。
詳細仕様は [docs/instruction.md](docs/instruction.md) を参照。

## 構成

```
apps/
  producer/   ← プロデューサー（全体統括AI）。自動化キューシート/NGログシートのCRUDと
                オーケストレーション（状態管理・ゲート引き上げ・リトライ制御）を持つ。
docs/
  instruction.md  ← 実装指示書（仕様の原本）
```

各GAS App（プロデューサー、チェッカー群、新規3Appなど）は `apps/<app名>/` に
clasp想定の独立プロジェクトとして配置する。セットアップ手順は各App配下のREADME参照。

## 実装状況

指示書7章の推奨順序のうち、STEP1〜3（自動化キューシート／プロデューサーの状態機械／
既存6Appの呼び出しラッパー）まで実装済み。STEP4以降（チェッカー①〜⑦、ディレクター・
アナリスト、新規3App、ゲートUI、channels設定）は未実装。
