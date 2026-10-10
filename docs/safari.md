# Safari版の開発・動作確認

Duedleの共有ソースは `src/` です。Chrome向けは従来どおり `src/` を読み込み、Safari向けは同じソースからiPhone・iPad・Mac用のアプリとSafari Web Extensionをビルドします。

## 対象環境

- iOS / iPadOS 16以降
- macOS 13以降
- XcodeとPython 3が利用できるMac

この下限はXcodeのビルド設定です。すべてのOSバージョンでの実機動作を確認したという意味ではありません。現在の確認環境はXcode 27.0です。

## プロジェクトの準備

リポジトリ直下で実行します。

```sh
python3 scripts/prepare_safari.py
```

`safari/Duedle/Duedle.xcodeproj` をXcodeで開きます。拡張機能のリソースは `safari/build/extension/` に配置され、Chrome専用のmanifest設定がSafari用へ変換されます。このディレクトリとビルド成果物はGit管理対象外です。

ソースを変更したら、Xcodeでビルドする前に毎回リソースを更新してください。

```sh
python3 scripts/prepare_safari.py --resources-only
```

標準の準備コマンドは既存のネイティブプロジェクトを再利用します。`--regenerate-project` はSwiftや署名設定などのネイティブ側の編集を置き換えるため、再生成が必要な場合だけ使ってください。`src/` の直下に新しいリソースフォルダーを追加する場合はXcodeプロジェクトへの追加も必要です。

## iPhone・iPadで確認する

1. Schemeを `Duedle (iOS)` にして、接続したiPhone・iPadを選択します。
2. アプリと拡張機能の両ターゲットの「Signing & Capabilities」で自分のTeamを指定します。Bundle Identifierの変更が必要なら両ターゲットで変更してください。
3. Xcodeから実行してアプリをインストールします。実機では開発者モードなど、Xcodeが案内する設定も行います。
4. 設定アプリ内のSafariの「拡張機能」でDuedleを有効にします。
5. Safariで名工大Moodleへログインし、Duedleに `cms7.ict.nitech.ac.jp` へのアクセスを許可します。

## Macで確認する

1. Schemeを `Duedle (macOS)` にして、署名用のTeamを設定します。
2. Xcodeから実行します。DuedleアプリのボタンからSafariの機能拡張設定を開き、有効にします。
3. SafariでMoodleへログインし、Duedleにサイトへのアクセスを許可します。

アプリのBundle Identifierを変更した場合は、`Shared (App)/ViewController.swift` 内の `extensionBundleIdentifier` も拡張機能側に合わせます。プロジェクトには開発者アカウントや証明書を保存していません。

## 実装済みの動作

| 機能 | Safari版の動作 |
| --- | --- |
| テーマ・表示の整理 | 共有のコンテントスクリプトとCSSを使用 |
| 課題・小テスト一覧 | 期限順の表示、種類・状態・期限のフィルター |
| 通常の一括更新 | 開いているMoodleページからログイン済みの状態で取得・解析 |
| 課題の自動更新 | 表示中に締切一覧APIを確認し、必要な課題の詳細を分割取得 |
| CSE用の更新 | 一時的に別タブでページを開いて収集し、終了・失敗時にそのタブを閉じる |
| コースの並べ替え | ドラッグハンドルの長押しで任意の位置へ移動。マウス・キーボード操作にも対応 |
| 履歴・セクション一覧 | スマホ幅では折りたたみ、広い画面では展開 |
| ファイルプレビュー | PDF・画像・テキストを表示。失敗・非対応形式は元のリンクへ移動 |
| OSの締切通知 | Safari版では未対応。締切はページ上の課題一覧で確認 |

手動更新中は元のMoodleページを開いたままにしてください。ページを離れると通常の一括取得は中断します。取得済みの課題は保存されます。自動更新はログイン済みのMoodleを表示している間に動作し、Safariを閉じている間は取得しません。[更新間隔・負荷対策](auto-refresh.md)を参照してください。

手動の全件更新がすべて成功すると従来どおり3時間のクールダウンに入ります。ログイン切れ・通信失敗・部分失敗ではクールダウンを新たに設定しません。自動更新は別の予定時刻で動作し、失敗時には再試行間隔を延ばします。データの保存完了を待ってから更新完了を表示します。

課題データの保存はバックグラウンドへ集約し、複数ページで同時に保存しても互いの課題・表示設定を上書きしないようにしています。設定や履歴は各ブラウザの拡張機能ストレージに保存されます。Chromeのデータ移行やSafari端末間の同期機能は追加していません。

Safariの背景ページはManifest V3の非永続ページです。`offscreen` は不要になり、Safari用のmanifestは `storage`・`alarms`・`tabs` の権限だけを宣言します。Chromeの締切通知は通知APIが利用できる場合に維持されます。SafariのOS通知は今後、同梱アプリでの通知予約などを別途実装する必要があります。

## 検証

依存パッケージなしでmanifest参照、全JavaScriptの構文、収集・保存・表示・通知・タブ操作・タッチ操作・ファイルプレビュー・自動更新の回帰テストを実行できます。

```sh
python3 scripts/check_extension.py
```

署名なしのビルド確認は次のコマンドです。これだけでは実機にインストールできません。

```sh
python3 scripts/prepare_safari.py --resources-only
xcodebuild -project safari/Duedle/Duedle.xcodeproj -scheme 'Duedle (macOS)' -configuration Debug -destination 'generic/platform=macOS' -derivedDataPath safari/DerivedData/macOS CODE_SIGNING_ALLOWED=NO build
xcodebuild -project safari/Duedle/Duedle.xcodeproj -scheme 'Duedle (iOS)' -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath safari/DerivedData/iOS CODE_SIGNING_ALLOWED=NO build
```

ビルド成功とモックを使った回帰テストは確認済みです。ログイン済みMoodleでの実機動作は未確認です。次の項目は実際のアカウントと端末で確認してください。

- ダッシュボード・コースページの一覧、ダークモード、フィルターの保存
- 通常更新とCSE更新、ログイン切れ・通信失敗時の案内
- 自動更新の一覧・詳細反映、複数タブの重複防止、非表示からの復帰
- iPhoneの縦画面とiPadの分割表示、Macでのサイドバー配置
- コースの長押しドラッグ・スクロール中の移動・フォーム送信後の順番保存
- 提出PDFの表示とダウンロード、非対応形式の元リンクへの移動
- 小テストの概要・レビューでの成績反映

App Store / TestFlightへは公開していません。配布時は署名・審査情報・App Store用アイコンの設定が必要です。

Apple公式：[Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)、[Safari用のパッケージング](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)。
