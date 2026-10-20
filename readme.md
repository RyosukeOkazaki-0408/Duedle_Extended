# Duedle

**Due + Moodle = Duedle**

名古屋工業大学のMoodleで、課題の確認やコースの閲覧をしやすくするブラウザ拡張機能です。Chrome版はChromeウェブストアで配布しています。Mac・iPhone・iPad向けのSafari版はApp Storeでの配布を準備しています。

## 主な機能

- **課題・小テスト一覧** — 横スクロールする一覧で、各課題の期限や提出状況を確認。種類・状態・期限での絞り込み、状態色の変更、選択した課題の非表示・復帰に対応。
- **課題情報の更新** — 手動更新と、ログイン済みMoodleの表示中に行う自動更新。
- **画面の見た目** — ブラウザと同期・ダーク・ライト・ほのぼのの4つのカラーモード。独立してON/OFFできるiOS風モード。
- **コースの閲覧補助** — コースの表示順変更、折りたたんだセクションの表示切り替え、セクション一覧、最近開いたページへのアクセス。
- **提出ファイルのプレビュー** — 対応するPDF・画像・テキストをブラウザ上で表示。

## 対象環境

| ブラウザ | 対象 |
| --- | --- |
| Google Chrome | Windows・MacのPC |
| Safari | macOS 13以降、iOS / iPadOS 16以降 |

対象サイトは `https://cms7.ict.nitech.ac.jp/moodle40a/` です。SafariのOS下限はビルド設定に基づくもので、すべてのOSバージョン・端末での実機確認を意味するものではありません。

iPhone・iPadではSafariを使ってください。スマホ版ChromeではDuedleを利用できません。

## 使い方・導入方法

Moodle右上の **「Duedle設定」→「使い方」** から、操作ガイドを開けます。課題の更新、非表示にした課題の戻し方、表示設定、困ったときの対処を説明しています。

拡張機能を入れていない方も、ブラウザから使い方・導入方法・問い合わせ先を閲覧できます。

- [使い方](https://ryosukeokazaki-0408.github.io/Duedle_Extended/help.html)
- [導入方法](https://ryosukeokazaki-0408.github.io/Duedle_Extended/install.html)
- [お問い合わせ（Googleフォーム）](https://forms.gle/DkUKfGv2Eqx12jhC6) — 拡張機能の導入前でも利用できます。

操作ガイドと導入ガイドは拡張機能にも同梱しています。「使い方」の冒頭にある「端末ごとの導入方法」から、導入ガイドを開けます。

カラーモードは4つから1つを選び、iOS風モードは別にON/OFFできます。ダークモードでは問題文・課題説明の配色も調整しますが、画像や図そのものの色は変更しません。

## 更新とデータ保存

手動更新中は、更新を始めたページを開いたままにしてください。再読み込みやページ移動で中断した場合も、取得済みの情報は保持します。全件の取得に成功した後は、次の手動更新まで3時間のクールダウンがあります。

自動更新は、ログイン済みのMoodleを表示している間に不定期に動作します。課題を確認する際は手動更新を推奨します。取得間隔、分割取得、失敗時の再試行については[自動更新の仕様](docs/auto-refresh.md)を参照してください。ブラウザを閉じている間の常時取得やOSの締切通知は提供していません。

課題情報・テーマ・履歴などは拡張機能のストレージに保存します。フィルターと色設定は `storage.sync`、閉じたセクションの表示設定はMoodleの `localStorage` を使用します。Duedle独自の端末間同期・ブラウザ間のデータ移行機能はありません。

一覧は取得時点の情報です。期限・提出状況・成績の最終確認は、Moodle本体の課題・小テストのページで行ってください。

## 開発

| 場所 | 内容 |
| --- | --- |
| `src/` | Chrome・Safari共通の拡張機能ソース |
| `src/common/help.html` | 利用者向けの操作ガイド |
| `scripts/` | 検証、Safariリソース配置、デバッグ版生成 |
| `tests/` | 回帰テスト・ブラウザテスト |
| `dev/` | 外部通信を行わないダミー環境 |
| `safari/` | Safari用のホストアプリとXcodeプロジェクト |
| `docs/` | 開発・検証用ドキュメント |

共通ソースを編集し、Safariの生成リソース `safari/build/extension/` は直接編集しないでください。

```sh
# manifest参照・JavaScript構文・回帰テスト
python3 scripts/check_extension.py

# Safari用リソースを更新（この後Xcodeで再ビルド）
python3 scripts/prepare_safari.py --resources-only

# オフラインのデバッグ版を生成
python3 scripts/prepare_debug.py
```

構文・回帰テストにはmacOSのJavaScriptCore、またはNode.jsが必要です。ブラウザテストにはPlaywrightとChromeを使用します。

- [オフラインの開発用環境](docs/debug.md)
- [Safari版のビルド・検証](docs/safari.md)
- [モバイルUIの確認項目](docs/mobile-ui.md)
- [自動更新の仕様](docs/auto-refresh.md)

## 開発経緯

Duedleは、Ryosuke Okazakiを含む5人のチームで共同開発したプロジェクトです。本リポジトリでは、当時のDuedleを基に、Ryosuke Okazakiが個人で機能の追加・改善、UIの改修、Safariへの移植などを進め、継続的に開発しています。

## お問い合わせ

不具合報告、改善のご要望、使い方の質問は[Googleフォーム](https://forms.gle/DkUKfGv2Eqx12jhC6)からお送りください。Moodleの「Duedle設定」→「お問い合わせ」からも開けます。

返信をご希望の場合は、フォームに返信先のメールアドレスを記入してください。授業や課題の内容は担当教員へ、大学のシステムに関するお問い合わせはMoodleの「サイトサポートに連絡する」へお願いします。

開発時に問い合わせ先を変更する場合は、`src/common/support-config.js` の `contactFormUrl` を更新してください。設定メニューと操作ガイドに共通で反映されます。このREADMEのリンクも併せて更新してください。

## ライセンス・免責事項

[MIT License](LICENSE)。

この拡張機能の使用により生じたいかなる損害についても、開発者は一切の責任を負いません。
