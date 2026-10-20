# Duedle

**Due + Moodle = Duedle**

名古屋工業大学のMoodleで、課題の確認やコースの閲覧をしやすくするブラウザ拡張機能です。Chrome版はChromeウェブストアで配布しています。Mac・iPhone・iPad向けのSafari版はApp Storeでの配布を準備しています。

## 導入方法・使い方・お問い合わせ

- [導入方法](https://ryosukeokazaki-0408.github.io/Duedle_Extended/install.html)
- [使い方](https://ryosukeokazaki-0408.github.io/Duedle_Extended/help.html)
- [お問い合わせ（Googleフォーム）](https://forms.gle/DkUKfGv2Eqx12jhC6)

拡張機能を入れていない方も、上記のリンクから閲覧・問い合わせができます。導入後は、Moodle右上の「Duedle設定」からも使い方と問い合わせ先を開けます。

## 主な機能

- **課題・小テスト一覧** — 横スクロールする一覧で、各課題の期限や提出状況を確認。種類・状態・期限での絞り込み、状態色の変更、選択した課題の非表示・復帰に対応。
- **課題情報の更新** — 手動更新と、ログイン済みMoodleの表示中に行う自動更新。
- **画面の見た目** — ブラウザと同期・ダーク・ライト・ほのぼのの4つのカラーモード。独立してON/OFFできるiOS風モード。
- **コースの閲覧補助** — コースの表示順変更、折りたたんだセクションの表示切り替え、セクション一覧、最近開いたページへのアクセス。
- **提出ファイルのプレビュー** — 対応するPDF・画像・テキストをブラウザ上で表示。

## 対象環境

| ブラウザ | 対象 | 配布状況 |
| --- | --- | --- |
| Google Chrome | Windows・MacのPC | Chromeウェブストアで配布中 |
| Safari | macOS 13以降、iOS / iPadOS 16以降 | App Storeでの配布を準備中 |

対象サイトは[名古屋工業大学のMoodle](https://cms7.ict.nitech.ac.jp/moodle40a/)です。Safari版は上記のOSを対象に開発していますが、すべてのOSバージョン・端末での動作を確認しているわけではありません。

iPhone・iPad向けはSafari版の配布準備中です。スマホ版ChromeではDuedleを利用できません。

## ご利用にあたって

- 課題一覧は取得時点の情報です。期限・提出状況・成績は、Moodle本体の課題・小テストのページで最終確認してください。
- 自動更新はログイン済みのMoodleを表示している間に行われます。ブラウザを閉じている間の常時取得や、OSの締切通知はありません。
- 課題情報や設定はブラウザに保存されます。Duedle独自の端末間同期・ブラウザ間のデータ移行機能はありません。

更新方法や表示設定、困ったときの対処は[使い方](https://ryosukeokazaki-0408.github.io/Duedle_Extended/help.html)をご覧ください。

## 開発経緯

Duedleは、Ryosuke Okazakiを含む5人のチームで共同開発したプロジェクトです。本リポジトリでは、当時のDuedleを基に、Ryosuke Okazakiが個人で機能の追加・改善、UIの改修、Safariへの移植などを進め、継続的に開発しています。

## お問い合わせ

不具合報告、改善のご要望、使い方の質問は[Googleフォーム](https://forms.gle/DkUKfGv2Eqx12jhC6)からお送りください。Moodleの「Duedle設定」→「お問い合わせ」からも開けます。

返信をご希望の場合は、フォームに返信先のメールアドレスを記入してください。授業や課題の内容は担当教員へ、大学のシステムに関するお問い合わせはMoodleの「サイトサポートに連絡する」へお願いします。

## 開発者向け資料

ソースからの導入、ビルド、検証、保守については[開発・保守ガイド](guideline.md)を参照してください。

## ライセンス・免責事項

[MIT License](LICENSE)。

この拡張機能の使用により生じたいかなる損害についても、開発者は一切の責任を負いません。

[プライバシーポリシー](https://ryosukeokazaki-0408.github.io/Duedle_Extended/privacy.html)
