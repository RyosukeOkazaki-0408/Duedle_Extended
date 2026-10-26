# Safari版の開発・動作確認

コース・課題・小テストのページの読み込み条件は `view.php*`、採点結果は `review.php*` とします。WebKitのURLパターン判定はクエリを含まないパスを比較するため、`?id=*` や `?*` を含めるとスクリプトが読み込まれません。macOS 15.4以降とXcodeがある環境では、リポジトリ直下で `xcrun swift tests/safari-match-patterns.swift` を実行し、一覧・詳細保存・提出ファイルプレビューの読み込み条件を実際のWebKit APIで検証できます。

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
2. Xcodeから実行します。Safariを開き、「設定」→「機能拡張」でDuedleを有効にします。
3. SafariでMoodleへログインし、Duedleにサイトへのアクセスを許可します。

アプリのBundle Identifierを変更した場合は、`Shared (App)/ViewController.swift` 内の `extensionBundleIdentifier` も拡張機能側に合わせます。プロジェクトには開発者アカウントや証明書を保存していません。

## 実装済みの動作

| 機能 | Safari版の動作 |
| --- | --- |
| テーマ・表示の整理 | 共有のコンテントスクリプトとCSSを使用 |
| SCORMの背景 | 同じMoodle内の教材フレームの白い背景をダークモードへ追従。ライト・ほのぼのへ戻すと元の背景に復帰。教材の画像・背景画像・色付き背景と外部フレームは保持 |
| 課題・小テスト一覧 | 期限順の表示、種類・状態・開始・期限のフィルター。開始と期限は併用でき、選択内容は保存される |
| 通常の一括更新 | 開いているMoodleページからログイン済みの状態で取得・解析 |
| 課題の自動更新 | 表示中に締切一覧APIを確認し、必要な課題の詳細を分割取得 |
| CSE用の更新 | 一時的に別タブでページを開いて収集し、終了・失敗時にそのタブを閉じる |
| コースの並べ替え | ドラッグハンドルの長押しで任意の位置へ移動。マウス・キーボード操作にも対応 |
| 履歴・セクション一覧 | スマホ幅では折りたたみ、広い画面では展開 |
| ファイルプレビュー | PDF・画像・テキストを表示。失敗・非対応形式は元のリンクへ移動 |
| OSの締切通知 | Chrome・Safariとも提供しない |

手動更新中は元のMoodleページを開いたままにしてください。ページを離れると通常の一括取得は中断します。取得済みの課題は保存されます。自動更新はログイン済みのMoodleを表示している間に動作し、Safariを閉じている間は取得しません。[更新間隔・負荷対策](auto-refresh.md)を参照してください。

手動の課題更新がすべて成功すると従来どおり3時間のクールダウンに入ります。ログイン切れ・通信失敗・部分失敗ではクールダウンを新たに設定しません。自動更新は別の予定時刻で動作し、失敗時には再試行間隔を延ばします。データの保存完了を待ってから更新完了を表示します。

課題データの保存はバックグラウンドへ集約し、複数ページで同時に保存しても互いの課題・表示設定を上書きしないようにしています。設定や履歴は各ブラウザの拡張機能ストレージに保存されます。Chromeのデータ移行やSafari端末間の同期機能は追加していません。

Safariの背景ページはManifest V3の非永続ページです。Safari用のmanifestは `storage` 権限と対象Moodleのホスト権限を宣言します。別タブ収集には対象サイトへの権限を使い、全サイトのURL・タイトルを読み取る `tabs` 権限は宣言しません。`offscreen` は不要で、OS締切通知も提供しません。

Safari用manifestはmacOS・iOSで共通です。生成処理で背景ページに `"persistent": false` を明示し、iOS / iPadOSのApp Store検証要件を満たします。生成先を直接編集せず、`scripts/prepare_safari.py` で管理してください。

## 検証

依存パッケージなしでmanifest参照、全JavaScriptの構文、収集・保存・表示・通知処理の不在・タブ操作・タッチ操作・ファイルプレビュー・自動更新の回帰テストを実行できます。

```sh
python3 scripts/check_extension.py
```

PlaywrightとChromeが使える環境では、`node tests/browser-scorm-theme.cjs` でSCORMフレームの背景、テーマの切り替え、教材移動・フレーム再生成、元の教材内容と外部フレームの保持を合成ページで確認できます。大学の実教材への通信は行いません。

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

2026-10-21現在、ユーザーによる `1.3.0 (1)` のApp Store ConnectへのアップロードとTestFlight配布は完了しています。以下の修正版の署名付きArchive・Validation・アップロードは未実施です。

Apple公式：[Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)、[Safari用のパッケージング](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)。

## 2026-10-21: Build 2時点のmacOS設定ボタンと拡張機能アイコンの調査

以下はBuild 2の調査記録です。最新の変更・配布対象は末尾のBuild 3を参照してください。

### アイコンの原因と修正（確定）

`src/icons/` と `safari/build/extension/icons/` には16・32・48・128pxのPNGがあり、manifestのパス・ファイル名の大文字小文字も一致していました。しかしXcodeプロジェクトには `icons` のフォルダー参照と両拡張機能ターゲットのCopy Bundle Resourcesへの登録がありませんでした。他のフォルダーは登録されており、今回の欠落はアイコンに限られます。

既存の次のArchive（いずれも `1.3.0 (1)`）でも、manifestが参照する4枚すべてのアイコンが存在しないことを確認しました。

- `~/Library/Developer/Xcode/Archives/2026-10-21/Duedle (macOS) 2026-10-21, 1.12.xcarchive`
- `~/Library/Developer/Xcode/Archives/2026-10-21/Duedle (iOS) 2026-10-21, 1.29.xcarchive`

修正は既存プロジェクトに `../../build/extension/icons` のフォルダー参照を加え、両拡張機能ターゲットのCopy Bundle Resourcesに登録するものです。階層を保持して `icons/icon*.png` をコピーします。画像・manifestのアイコン設定・アプリアイコンは変更していません。

### Archiveへ入るmanifest

両拡張機能ターゲットとも `safari/build/extension/manifest.json` を参照します。`src/manifest.json` はChrome用の元ファイルで、Xcodeが直接コピーするファイルではありません。ビルドフェーズにmanifest変換スクリプトはなく、事前の `prepare_safari.py --resources-only` で生成されたものがコピーされます。

生成処理はChromeの `background.service_worker` をSafari用の `background.page: storage/background.html` と `persistent: false` に変換し、`$schema` を除きます。アイコンのパスや画像は変換しません。既存macOS Archiveには `persistent` がなく、後のiOS Archiveには `false` がありました。現在のプロジェクトでターゲットごとに別のmanifestを参照しているわけではありません。現在の生成結果と既存iOS Archiveのmanifestはバイト単位でも一致しました。

### 設定ボタンの調査と対応（根本原因は未確定）

既存macOS Archiveの `Base.lproj/Main.html` を実際のWKWebViewで読み込み、外部 `Script.js` の読み込み、ボタンのクリック、`controller` メッセージハンドラーへの `open-preferences` 到達を確認しました。相対パス・CSPがボタンのJavaScriptを妨げる問題は、このテストでは再現していません。Bundle IdentifierもArchiveの拡張機能Info.plistと一致しています。

公式APIは引き続き `SFSafariApplication.showPreferencesForExtension` を使用します。[AppleのAPI仕様](https://developer.apple.com/documentation/safariservices/sfsafariapplication/showpreferencesforextension(withidentifier:completionhandler:))では、呼び出し元アプリ内の拡張機能Identifierを渡し、失敗はcompletion handlerのerrorで受け取ります。元の実装はerrorを受けてもそのままreturnするため、エラーが発生すると画面・ログに理由が出ません。

修正では、設定APIの失敗時にメインスレッドでエラーのdomain・code・説明と手動設定の案内をアラート表示し、アプリを閉じずに残します。同じ情報をConsoleにも記録します。起動時の拡張機能状態取得エラーも記録します。正常終了時の既存動作は維持しています。メッセージの強制キャストも安全な型判定に変更しました。これらはmacOSに限定されます。

**TestFlightアプリ内での実際のAPIエラーは未取得であり、設定画面が開かない根本原因の特定・解消は未完了です。** 画面操作ツールは権限不足で使用できませんでした。単独のSwiftテストからは `SFErrorDomain (1)` が返りましたが、そのテスト実行ファイルには拡張機能が含まれないため、TestFlight版と同じ原因の証拠にはしていません。アイコン欠落と設定API失敗の因果関係も確定していません。

### 変更ファイル

| ファイル | 理由 |
| --- | --- |
| `safari/Duedle/Duedle.xcodeproj/project.pbxproj` | 両拡張機能にiconsフォルダーを同梱。全4ターゲットのDebug/ReleaseのBuild番号を2に統一 |
| `safari/Duedle/Shared (App)/ViewController.swift` | macOSで設定API失敗時のアラート・ログ、状態取得エラーのログ、安全なメッセージ型判定 |
| `tests/safari-bundle-regression.py` | Xcodeの両ターゲットのリソース登録、大小文字、PNG寸法・元画像との一致、実Archiveのmanifestと参照先を検証 |
| `scripts/check_extension.py` | macOSで既存の検証コマンドから新しいリソース検証を実行 |
| `docs/safari.md` | 調査結果・検証範囲・再配布手順を記録 |

Bundle Identifier、署名・Team、アプリアイコン、既存機能、既存Scheme、ビルド元は変更していません。別プロジェクトへの切り替えや再生成は行っていません。

### 検証結果

- `python3 scripts/check_extension.py`: 成功。既存回帰テスト・JavaScript構文・ZIP検証、および新しい両ターゲットのリソース登録検証を通過。
- 両OSの既存Schemeで署名なしRelease Archiveを作成: 成功。コンパイルエラーなし。AppIntents未使用によるメタデータ抽出省略の警告のみ。
- 両新Archiveのmanifestは現在のSafari用生成結果と一致。全参照先の存在、アイコン4枚のパス・大小文字・寸法・元画像とのバイト一致を確認。
- 両新Archiveのアプリ・拡張機能は `1.3.0 (2)`、Bundle Identifierは従来値。
- 未確認: 署名付きValidation、TestFlight再配布後の設定ボタンの成功/失敗表示、Safari設定内のアイコン表示、iPhone/iPad実機の表示、ログイン済みMoodle上の動作。

検証用Archiveは `/tmp/duedle-fix-macos.xcarchive` と `/tmp/duedle-fix-ios.xcarchive` です。これらは署名なしで、アップロード用ではありません。通常の提出には以下の既存Xcodeプロジェクトで作成する署名付きArchiveを使ってください。

### TestFlightへ再配布する手順

1. リポジトリ直下で `python3 scripts/prepare_safari.py --resources-only`、続いて `python3 scripts/check_extension.py` を実行します。`--regenerate-project` は使いません。
2. 既存の `safari/Duedle/Duedle.xcodeproj` を開きます。Versionは `1.3.0`、アプリ・拡張機能のBuildは `2` に設定済みです。先に別のBuild 2をアップロードしている場合は、その番号を超える同じ番号を全4ターゲットに設定してください。既存の署名設定を使用します。
3. `Duedle (macOS)` SchemeでProduct → Archive。iOS版も配布する場合は `Duedle (iOS)` と実機向けの汎用destinationを選んで別途Archiveします。
4. Organizerの新しいArchiveを右クリック → Show in Finderで確認し、そのパスを以下の検証に渡します。両方のパスをまとめて渡すこともできます。

   ```sh
   python3 tests/safari-bundle-regression.py '/path/to/new-macOS.xcarchive' '/path/to/new-iOS.xcarchive'
   ```

5. Organizerで各新ArchiveをValidate App → Distribute App → App Store Connect → Upload。処理完了後、App Store ConnectのTestFlightで `1.3.0 (2)` をテスターに配布します。外部テスターでは必要に応じてBeta App Reviewを行います。[Appleのアップロード手順](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
6. TestFlightから更新し、macOSのボタンが設定を開くか、失敗する場合にアラートが出るかを確認します。失敗時は表示されたdomain・code・説明とmacOS/Safariバージョンを記録します。Consoleではプロセス `Duedle` と `Duedle:` を手掛かりに検索できます。アラートが出ず無反応なら、アプリ内のWKWebView経路の追加調査が必要です。
7. Safariの「設定」→「機能拡張」で画像パスのエラーが消えたこと、Duedleのオン/オフとMoodleへのアクセス許可、課題一覧・更新・プレビューを確認します。iPhone/iPadでも拡張機能の表示と基本機能を確認してください。


## Build 3: 設定案内と初回表示の修正

macOSの「Safariの機能拡張設定を開く」は補助ボタンです。ユーザー提供のTestFlight画面で `SFErrorDomain (1)` の発生を確認し、ユーザーの「直すか消すか」という指定に基づき削除しました。画面にはSafariの「設定」→「機能拡張」でDuedleを有効にする案内を残します。HTMLのボタン、JavaScriptのイベント登録・ラベル変更、Swiftのメッセージハンドラー・設定API呼び出し・エラーアラートを削除しています。状態取得と有効/無効の案内は継続します。

初回のみ「Duedle設定」とスマートフォン幅の「課題の設定」が出ない問題は、両方を生成する `theme/main.js` の初期化が `document_start` のヘルパーと非同期の設定取得に依存していました。ページを開いた後に拡張機能を有効化し、早期スクリプトが実行されなかった条件を合成ページで再現すると、両ボタンが生成されませんでした。設定取得が完了しない条件でも、従来はUIの初期化が止まります。

`src/manifest.json` の通常のスクリプト実行にも既存の `theme/state.js` と `document_start/pre.js` を加えます。これらは重複実行を防ぐ既存ガードを持つため、通常の早期実行も維持します。`src/theme/main.js` は設定取得前にボタン・DOM監視・設定変更監視を登録し、設定値を取得できた時点で反映します。課題設定の新規作成時は閉じた状態とし、取得完了によってユーザーが開いたパネルを閉じ直しません。

今回の初回表示修正はiOS・macOS・Chrome共通のソースに入っています。Safari用リソースを更新し、iOS/macOSのアプリ・拡張機能を `1.3.0 (3)` に揃えます。各OSに配布するには、対応する既存Schemeを個別にArchiveしてアップロードしてください。設定ボタン削除をMacへ届けるSchemeは `Duedle (macOS)` です。Projectの再生成は不要です。

検証コマンド:

```sh
python3 scripts/prepare_safari.py --resources-only
python3 scripts/check_extension.py
# Playwrightを利用できる既存Node環境で実行
node tests/browser-first-install.cjs
node tests/browser-responsive.cjs
```

`browser-first-install.cjs` は設定が空・背景応答が保留・document_start未実行/実行済み・課題一覧の遅延追加を検証します。両ボタンの出現、課題設定の初期折りたたみ、設定メニューの開閉、非同期応答後の状態維持、画面幅変更時の配置復元を確認します。実機での権限付与直後の挙動はTestFlight再配布後に確認してください。

Build 3の検証結果: 修正前のHEADでは合成ページの設定ボタン待機がタイムアウトし、修正後は早期スクリプト未実行・実行済みの両ケースを通過しました。既存 `browser-responsive.cjs` の9画面幅・設定メニュー・課題操作・テーマ保持、`check_extension.py` の回帰テストも成功しました。両OSの署名なしRelease Archiveが成功し、両Archive内のアイコン・manifest・最新版の案内画面・Build番号3を確認しました。macOS Archiveの案内画面はWKWebViewで実行し、ボタンがないこと、有効/無効/不明の表示、iOS向け案内、画像読み込みを確認しました。案内文の更新がbody全体に及ばないよう、Script.jsの対象を段落に限定しました。TestFlightへのアップロード・実機での最終確認は未実施です。
