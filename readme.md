# Duedle
Due + Moodle = Duedle
## Duedleって何？
名工大のMoodleページをより快適に利用できるようにパワーアップする拡張機能です。
## Duedleのメイン機能
- ダークモード
- わかりやすい課題一覧をトップに表示
- Moodleを表示中に課題情報を自動更新（[更新間隔・負荷対策](docs/auto-refresh.md)）
- コース表示順のカスタマイズ
- コースページで折りたたんだ項目の表示/非表示
- 冗長な情報の削減
- ページの閲覧履歴を左に表示
- ファイルをブラウザ上で閲覧

[詳細はこちら](guideline.md)

新規導入時はライト表示・課題メニューONで開始します。更新時は既存設定を維持します。課題一覧の空状態と最終更新時刻で取得状況を確認できます。

[開発用ダミー環境](docs/debug.md) / [今回の変更と実機確認項目](docs/development-status.md)

## Safari版（iPhone・iPad・Mac）

Safari Web Extension用のXcodeプロジェクトを追加しました。iOS / iPadOS 16以降、macOS 13以降を対象としています。

```sh
python3 scripts/prepare_safari.py
```

`safari/Duedle/Duedle.xcodeproj` を開いてビルドします。実機で使用するには署名設定と、Safariでの拡張機能の有効化・Moodleへのアクセス許可が必要です。

[セットアップ・対応機能・検証手順](docs/safari.md)を参照してください。OS締切通知はChrome・Safariとも提供しません。ログイン済みMoodleでの実機動作はまだ確認していません。

## DuedleのChromeへの導入方法(Chrome拡張機能)
[こちらを参照](https://support.google.com/chrome_webstore/answer/2664769?hl=ja)

## Q&A

## 困ったこと・改善案
[こちらのページ](https://github.com/mtugb/duedle/issues/new)でタイトルおよび内容を入力して投稿してください。

## 免責事項
この拡張機能の使用により生じたいかなる損害についても、開発者は一切の責任を負いません。
