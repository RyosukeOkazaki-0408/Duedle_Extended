# Duedle

**Due + Moodle = Duedle**

名古屋工業大学のMoodleで、課題の確認やコースの閲覧をしやすくするブラウザ拡張機能です。Google ChromeとSafariに対応し、Mac・iPhone・iPad向けのSafari版も共通ソースからビルドします。

## 主な機能

- **課題・小テスト一覧** — 横スクロールする一覧で、各課題の期限や提出状況を確認。種類・状態・期限での絞り込み、状態色の変更、選択した課題の非表示・復帰に対応。
- **課題情報の更新** — 手動更新と、ログイン済みMoodleの表示中に行う自動更新。
- **画面の見た目** — ブラウザと同期・ダーク・ライト・ほのぼのの4つのカラーモード。独立してON/OFFできるiOS風モード。
- **コースの閲覧補助** — コースの表示順変更、折りたたんだセクションの表示切り替え、セクション一覧、最近開いたページへのアクセス。
- **提出ファイルのプレビュー** — 対応するPDF・画像・テキストをブラウザ上で表示。

## 対象環境

| ブラウザ | 対象 |
| --- | --- |
| Google Chrome | PC |
| Safari | macOS 13以降、iOS / iPadOS 16以降 |

対象サイトは `https://cms7.ict.nitech.ac.jp/moodle40a/` です。SafariのOS下限はビルド設定に基づくもので、すべてのOSバージョン・端末での実機確認を意味するものではありません。

## 使い方

Moodle右上の **「Duedle設定」→「使い方」** から、操作ガイドを開けます。課題の更新、非表示にした課題の戻し方、表示設定、困ったときの対処を説明しています。

ガイドは拡張機能に同梱しています。[HTMLソース](src/common/help.html)はブラウザで直接開いても閲覧できます。GitHub上のリンク先ではソースが表示されます。

## 導入

### Google Chrome

Windows・MacのChromeでは、Chromeウェブストアからインストールできます。

1. パソコンのChromeで、[DuedleのChromeウェブストアページ](https://chromewebstore.google.com/detail/duedle/bbepilmbnkgbjnpecphajobphmgopmjm?hl=ja)を開きます。
2. 「Chromeに追加」を押し、確認画面で「拡張機能を追加」を押します。
3. [名工大Moodle](https://cms7.ict.nitech.ac.jp/moodle40a/)へログインします。すでに開いていたMoodleのページは再読み込みしてください。
4. 左上に「Duedle: Extended」が表示されていれば、導入は完了です。

詳しい手順や追加できない場合の対処は、[導入ガイド](src/common/install.html)を参照してください。

### Safari（Mac・iPhone・iPad）

XcodeとPython 3が利用できるMacで、リポジトリのルートから実行します。

```sh
python3 scripts/prepare_safari.py
```

生成・更新された `safari/Duedle/Duedle.xcodeproj` をXcodeで開き、対象の端末向けにビルドします。実機へのインストールには署名設定が必要です。インストール後はSafariでDuedleを有効にし、Moodleへのアクセスを許可してください。

署名、端末別の手順、リソース更新については[Safari版のセットアップ](docs/safari.md)を参照してください。

## 更新とデータ保存

手動更新中は、更新を始めたページを開いたままにしてください。再読み込みやページ移動で中断した場合も、取得済みの情報は保持します。全件の取得に成功した後は、次の手動更新まで3時間のクールダウンがあります。

自動更新は、ログイン済みのMoodleを表示している間に動作します。取得間隔、分割取得、失敗時の再試行については[自動更新の仕様](docs/auto-refresh.md)を参照してください。ブラウザを閉じている間の常時取得やOSの締切通知は提供していません。

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

## お問い合わせ

不具合報告、改善のご要望、使い方の質問は[Googleフォーム](https://forms.gle/DkUKfGv2Eqx12jhC6)からお送りください。Moodleの「Duedle設定」→「お問い合わせ」からも開けます。

Duedleの窓口と、大学の「サイトサポートに連絡する」は別の窓口です。

開発時に問い合わせ先を変更する場合は、`src/common/support-config.js` の `contactFormUrl` を更新してください。設定メニューと操作ガイドに共通で反映されます。このREADMEのリンクも併せて更新してください。

## ライセンス・免責事項

[MIT License](LICENSE)。

この拡張機能の使用により生じたいかなる損害についても、開発者は一切の責任を負いません。
