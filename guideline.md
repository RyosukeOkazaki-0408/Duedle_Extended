# Duedle 開発・保守ガイド

> [!NOTE]
> このドキュメントはAI（ChatGPT）の支援で整理しています。2026年10月20日時点のソース構成と実装を説明するもので、実機動作やセキュリティを保証するものではありません。実装を変更した際は、関連する説明も更新してください。

## この文書の役割

Duedleは、名古屋工業大学のMoodleで課題・小テストの確認とコースの閲覧を補助するManifest V3のブラウザ拡張機能です。対象は `https://cms7.ict.nitech.ac.jp/moodle40a/` です。

この文書はソースから導入する開発者・保守担当者向けです。利用者向けの[導入方法](https://ryosukeokazaki-0408.github.io/Duedle_Extended/install.html)と[使い方](https://ryosukeokazaki-0408.github.io/Duedle_Extended/help.html)はGitHub Pagesで公開しており、拡張機能なしでも閲覧できます。概要・配布状況・問い合わせ先は[README](readme.md)で案内します。

## 主な機能と範囲

- 課題・小テストの期限、提出状況、得点などを一覧表示し、種別・状態・期限・表示状態で絞り込む。選択した課題の非表示・復帰と状態色の変更に対応する。
- 手動更新と、ログイン済みMoodleの表示中に行う自動更新で一覧を更新する。
- ブラウザ同期・ダーク・ライト・ほのぼのの4つのカラーモードを切り替える。iOS風の外観は別設定でON/OFFする。
- コースの表示順変更、折りたたんだセクションの表示切り替え、セクションへの移動、最近開いたコースページの履歴表示を補助する。
- 対応する提出ファイルをプレビューし、ユーザー名など一部の画面要素を非表示にする。

一覧からの非表示や「完了とする」はDuedle内の表示・保存データの変更です。Moodle上の課題、提出物、評定を変更するものではありません。コースの表示順はMoodleの既存フォームを使って保存します。

一覧は取得時点の情報です。期限・提出・成績の最終確認はMoodle本体で行ってください。ブラウザを閉じている間の常時取得、OSの締切通知、Duedle独自の端末間同期・ブラウザ間データ移行は提供していません。

## 開発環境と導入

コマンドはリポジトリ直下で実行します。拡張機能本体はJavaScript・CSS・HTMLで構成され、通常のChrome読込にビルドや `npm install` は不要です。`package.json` はChrome APIの型定義を開発依存として持ち、実行用のnpm scriptsは定義していません。

### Chromeで共有ソースを読み込む

1. 公開リポジトリを取得し、作業ディレクトリを開きます。
2. PC版Chromeで `chrome://extensions/` を開き、デベロッパーモードを有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」で `src/` を選びます。
4. Moodleへログインします。すでに開いていたページは再読み込みしてください。

ソース変更後は拡張機能を再読み込みし、対象のMoodleページも再読み込みします。スマートフォン版Chromeは対象外です。

### Safari用リソースを準備する

Python 3とXcodeを利用できるMacで実行します。

```sh
python3 scripts/prepare_safari.py --resources-only
```

`src/` から `safari/build/extension/` を生成した後、`safari/Duedle/Duedle.xcodeproj` をXcodeで開いてビルドします。共有ソースの変更後は毎回リソースを生成し直してください。

署名、実機への導入、ネイティブプロジェクトの準備は[Safari版の開発・動作確認](docs/safari.md)を参照してください。`--regenerate-project` はネイティブ側の編集を置き換えるため、通常のリソース更新には使用しません。生成先を直接編集しても次回生成で失われます。

Safariのビルド下限はmacOS 13、iOS / iPadOS 16です。これは全対象OS・端末での実機確認済みを意味しません。

### オフラインでUIと更新処理を確認する

```sh
python3 scripts/prepare_debug.py
```

生成した `build/debug/` をChromeに別の拡張機能として読み込み、「拡張機能のオプション」を開きます。ダミー応答を使用し、Moodleのホスト権限とコンテントスクリプトを持たず、CSPで外部接続を禁止しています。保存先も本番と分離しています。[デバッグ環境の操作方法](docs/debug.md)を参照してください。

## ソース構成

| 場所 | 役割 |
| --- | --- |
| `src/manifest.json` | Chrome版の権限、読込先、スクリプトの順序、公開リソース |
| `src/common/` | 拡張APIの共通窓口、アカウント切替、履歴、コース並べ替え、ガイド |
| `src/theme/` | テーマ状態、設定UI、CSS、教員作成コンテンツの配色調整 |
| `src/document_start/` | ページ初期表示時のテーマ適用 |
| `src/storage/class/` | 取得、解析、保存、更新の排他制御、課題カードと一覧状態 |
| `src/storage/display/` | 一覧表示、フィルター、手動更新と進捗表示 |
| `src/storage/auto_refresh.js` | 自動更新とページ表示状態の連携 |
| `src/storage/service_worker.js` | メッセージ受付、保存の調整、別タブ収集、初期設定 |
| `src/storage/background.html` | Safari用の非永続背景ページ |
| `src/storage/cs_*.js` | 閲覧中のコース・課題・小テストからの情報取得 |
| `src/cource/` | 折りたたんだコースセクションの表示切替。ディレクトリ名は既存の綴りを使用 |
| `src/notionnav/` | コース内のセクションナビゲーション |
| `src/qol/` | ファイルリンクと提出ファイルのプレビュー |
| `src/login_screen/`・`src/syllabus/` | ログイン画面・シラバス向けの表示調整 |
| `dev/` | ダミーデータ、通信・ストレージの代替、デバッグ操作UI |
| `scripts/` | 構文・回帰チェック、Safariリソース配置、デバッグ版生成、Pages公開用ファイル生成 |
| `.github/workflows/pages.yml` | 利用者向けガイドのGitHub Pages公開 |
| `tests/` | 回帰テストと合成ページを使うブラウザテスト |
| `safari/Duedle/` | SafariホストアプリとXcodeプロジェクト |
| `docs/` | 機能別の設計・検証手順、過去の作業記録 |

コース並べ替えの実装は `src/common/change_order_freely.js` です。ChromeとSafariで共有する機能は `src/` を変更し、Safari固有のネイティブ処理は `safari/Duedle/` で管理します。

## 取得・保存・表示の流れ

1. `manifest.json` の指定に従ってスクリプトを読み込みます。`common/account.js` と `common/common.js` がログイン中アカウントと拡張APIの窓口を用意します。
2. 閲覧中ページの解析、手動のコース巡回、または自動更新で課題情報を取得します。通常の巡回は `CourseCollector`、締切一覧APIを併用する自動更新は `AutoRefreshCollector` を使います。
3. `ScrapeAssign`・`ScrapeQuiz` などがDOMから表示用データを作り、`StorageUtil` が背景処理へ保存を依頼します。課題データの更新は背景側で直列化します。
4. `storage/display/` と `TaskBox`・`AssignBox`・`QuizBox` が保存済み情報を絞り込み、表示します。

Chromeはservice worker、Safariは非永続背景ページで同じ保存・調整処理を動かします。CSE用の更新方式は一時タブを作成して収集し、処理終了時にそのタブを閉じます。

### 取得対象とページ復元の注意点

- 手動更新は通常・CSE用とも、Moodleのコース概要用APIを `classification=all, limit=0` で読み、概要から削除済みのものを除く登録コースの全一覧で `courseIds` を置き換えます。画面の絞り込み・ページ送り・閲覧履歴は更新対象に混ぜません。一覧取得に失敗した場合は保存済みデータを保持し、更新を中止します。
- ページ分割されたコースでは同じコースのセクションを確認し、活動を重複取得しません。手動更新は最大200ページを上限とし、未取得・失敗があれば全件成功にしません。自動更新は1回1コースページの取得量を維持し、残りのセクションを次回へ引き継ぎます。
- CSE収集は取得先タブの本人確認と元タブとの一致を検証してから保存します。識別不能・別アカウントの場合は中断します。履歴への追加は背景側で直列化し、収集専用タブは履歴に入れません。
- ブラウザの履歴キャッシュ（BFCache）から復元されたページは、同じアカウントが有効であることを背景処理で確認して再登録し、保存済み課題を再描画します。復元したページの情報でアカウントを切り替えたり、読取失敗を空の課題一覧として扱ったりしないでください。
- 課題の提出編集・確認・採点画面は、課題詳細として保存しません。提出編集画面に提出状況表がなくても、既存の状態・提出ファイル・取得時刻を上書きしないでください。

### 更新の間隔と成功時刻

通常の手動更新では、全件成功後に3時間のクールダウンを設けます。自動更新はログイン済みMoodleを表示している間に動き、締切一覧を55〜75分ごとに確認します。自動更新の詳細再取得の目安は次のとおりです。

| 保存済み課題の状態 | 前回の詳細取得からの間隔 |
| --- | --- |
| 締切まで0〜24時間の未完了課題 | 3時間 |
| その他の未完了課題 | 12時間 |
| 完了済み、または非表示の課題 | 24時間 |

この間隔判定での「完了済み」は `status === "complete"` を指します。合格を表す `qualify` や `unknown`・`stuck` も、非表示でなければ期限に応じた3時間・12時間の対象です。

初回・再開時の待機、新規課題の優先取得、分割取得、負荷分散、失敗時の再試行があります。詳細は[自動更新の仕様](docs/auto-refresh.md)を参照してください。

`fetchedAt` は課題詳細の鮮度、`refreshHistory.fullSweepAt` は手動巡回の成功時刻、`refreshHistory.calendarAt` は締切一覧の対象期間を確認し終えた成功時刻です。意味が異なるため、表示操作や部分成功で一律に更新しないでください。小テストのレビューの単一受験点だけでは詳細全体の `fetchedAt` を進めません。レビュー閲覧時に正規の概要ページを追加取得できた場合は、その総合点・期限・回数を保存して `fetchedAt` を更新します。取得中に別の概要保存が入った場合は、古い応答で上書きしません。

## 保存データとアカウント

### 課題・小テスト

拡張機能の `storage.local` に `assign_list` と `quiz_list` を保存します。以下は現行の主なフィールドです。取得不能な項目や旧データでは欠損があり得るため、表示側で扱えるようにします。

| フィールド | 内容 |
| --- | --- |
| `group` | `assign_list` または `quiz_list` |
| `assignId` / `quizId` | 対応するMoodle活動のID |
| `courseId` | 判定できた場合に保存するコースID |
| `courseName`、`assignName` / `quizName` | コース名と活動名 |
| `start` / `due` | 開始・期限のISO形式文字列、または `null` |
| `fetchedAt` | 詳細の取得時刻。Unix epochからのミリ秒 |
| `status` | 解析した状態。期限に応じて表示時にも再評価 |
| `show` | Duedleの一覧に表示するかどうか |
| `file` / `filenum` | 課題のみ。最初の提出ファイル名とリンク数 |
| `point` / `required` / `maxp` | 小テストのみ。概要ページの総合点・合格点・満点。取得不能なら `null` |
| `requiredState` | 合格点を判定できた `known`、設定なしを確認した `none`、解析不能の `unknown`。解析不能を合格とは扱わない |
| `count` / `maxcount` | 小テストのみ。受験回数・上限。正整数は上限、確認済み無制限は `0`、取得不能は `null`。旧データの欠損も「?」で表示 |

課題の状態は `complete`・`incomplete`・`unknown`・`warning`・`expired`、小テストではさらに `qualify`・`stuck` を扱います。`incomplete`・`warning`・`expired` は期限で再評価し、期限が3日以内なら `warning`、期限後なら `expired` として表示します。`unknown`・`qualify`・`stuck` はこの再評価の対象外です。現行スクレイパーは提出日時の `submit` フィールドを生成していません。

表示上は `complete` と `qualify` を「完了」にまとめ、状態フィルターの「完了以外」からは両方を除外します。状態フィルターの「期限切れ」は `expired` と `stuck` を含みます。色設定もそれぞれ共通ですが、カードの `stuck` は「行き詰まり」と表示します。色設定は完了・未完了・期限切れ・要注意・不明・未訪問の6項目です。内部の状態値は維持し、旧フィルター値 `qualify`・`stuck` は統合先へ読み替えます。

再取得時も既存の `show` を保持します。非表示の変更や手動の状態変更には `StorageUtil.editData()` を使い、複数タブから配列全体を上書きしないでください。

コース・課題の閲覧可否は、利用者が選ぶ `show` とは別に扱います。`enrolledCourseIds` は登録コース一覧、`courseAvailability` はコースごとの活動の閲覧可否を保持します。登録外のコースや利用不可と確認できた活動は一覧から除外します。完全な活動一覧を取得できた場合に限り、一覧に存在しない活動も利用不可として扱います。不完全なHTMLだけを根拠に、見つからない活動を一律に除外しません。保存済みの課題データや `show` は消去しません。

### アカウントの切替

`AccountSession` は現在のMoodleユーザーIDとタブ・ページを関連付け、個人データへのメッセージ操作を検証します。切替対象は課題、小テスト、コースID、登録コース一覧、活動の閲覧可否、履歴、更新の履歴・予定、クールダウンです。

別アカウントやログアウト状態への切替時は、前アカウントの情報を `duedleAccountData:<ユーザーID>` へ退避します。所有者が分からない旧データは `duedleAccountData:legacy` に保持します。同じユーザーで再開すると退避データを復元します。ログアウトや切替は端末上の保存データの消去ではありません。専用のアカウントデータ削除UIはありません。

これらは同じブラウザプロファイル内の表示・保存制御であり、OSユーザー間の隔離や暗号化の仕組みではありません。テーマとフィルター設定はアカウントごとの退避対象外です。

### 表示設定など

| 保存先 | 主なキー | 内容 |
| --- | --- | --- |
| `storage.local` | `thememode`、`themeDefault`、`iosAppearance` | カラーモード、初期値、iOS風外観 |
| `storage.local` | `history` | 最近開いたコースページのタイトルとURL。最大10件 |
| `storage.local` | `courseIds`、`enrolledCourseIds`、`courseAvailability` | 収集対象、登録コース一覧、コースごとの活動の閲覧可否 |
| `storage.local` | `refreshCoordinator`、`refreshHistory`、`scrapeCooldown` | 更新予定・排他制御、成功時刻、手動更新制限 |
| `storage.local` | `duedleAccount`、`duedleAccountTabs`、`duedleAccountData:*` | 現在のアカウント、ページ登録、退避データ |
| `storage.local` | `duedleCollectionTabs` | 一時収集タブの所有アカウント。アカウント切替時も保持し、タブ終了・ブラウザ起動時に除去 |
| `storage.sync` | `selectedType`、`selectedStatus`、`selectedDue`、`selectedShow` | 一覧の絞り込み。状態の初期値は `ex-complete`（完了以外）、保存済みの選択は維持 |
| `storage.sync` | `displayShow`、`scrapeMode`、`colorSelect_light_*`、`colorSelect_dark_*` | 課題メニューの表示、更新方式、状態色 |
| Moodleの `localStorage` | `hide` | 折りたたんだセクションの表示設定 |

`thememode` は `0=ブラウザ同期 / 1=ダーク / 2=ライト / 3=ほのぼの` です。新規導入の既定はライトで、明示した設定と既存利用者の挙動を維持する移行処理があります。旧値 `4` は互換処理用であり、新しい選択肢として追加しません。

`storage.sync` はブラウザの同期用APIです。同期の有無はブラウザの対応と設定に依存します。Duedle独自の同期機能がないことを、すべての設定が端末外へ出ないという意味で説明しないでください。

## 機能を変更するとき

- **テーマ**: Moodleの通常UIと教員作成コンテンツを区別し、対象を限定したセレクタを使います。文字色と背景色を組み合わせて確認し、画像・図、リンク、問題の正誤表示、ライトへの復帰にも注意します。
- **取得・解析**: MoodleのDOM、権限、表示言語、活動の種類による差を考慮します。不明な状態を完了と断定せず、ログイン切れや部分失敗でも取得済みの情報を保持します。
- **保存・非同期処理**: アカウント検証、`StorageUtil` の書き込み窓口、`RefreshCoordinator` の排他制御を利用します。画面移動、複数タブ、アカウント切替中の古い処理にも対応します。
- **入力の扱い**: Moodleのタイトル・ファイル名・API応答も外部入力です。文字列の表示は `textContent` を基本とし、URLは用途に応じてスキーム・ホスト・パス・IDを検証します。
- **権限・通信**: 現在の権限は `storage`、ホスト権限は対象Moodleです。タブ操作には全サイトのURL・タイトルを読む `tabs` 権限を使用しません。変更時は必要性と通信先を確認し、利用者向け説明も見直します。
- **ガイド**: 操作説明は `src/common/help.html`、導入説明は `src/common/install.html`、問い合わせURLは `src/common/support-config.js` が主な編集先です。READMEの説明・リンクも照合します。

## 検証

### 基本チェック

```sh
python3 scripts/check_extension.py
```

Python 3とmacOSのJavaScriptCore、またはNode.jsが必要です。manifestの参照ファイル、`src/`・`dev/` のJavaScript構文、保存・アカウント・UI・自動更新などの回帰テストを確認します。

このコマンドにはブラウザテスト、Safariのビルド、実Moodleでの確認は含まれません。

### 変更内容に応じたブラウザ確認

Playwrightを利用できるNode.js環境とChromeを別途用意します。Playwrightは現在の `package.json` には含まれていません。各テストのChrome実行ファイルの指定と前提条件を確認してから実行してください。

| 変更対象 | 主な確認コマンド |
| --- | --- |
| テーマ・Moodle部品の配色 | `node tests/browser-theme-components.cjs` |
| 設定メニュー・使い方ガイド | `node tests/browser-support.cjs` |
| アカウント切替・DOM表示 | `node tests/browser-review-fixes.cjs` |
| モバイル表示・操作 | `node tests/browser-responsive.cjs` |
| 非表示セクションへの移動・予定欄の残り時間 | `node tests/browser-course-calendar.cjs` |
| 初回表示・設定保持 | `node tests/browser-production.cjs` |
| ダミー環境での更新処理 | `node tests/browser-debug.cjs`（先にデバッグ版を生成） |
| 更新の進捗・中断表示 | `node tests/browser-refresh-progress.cjs` |
| タブ権限・別タブ収集・認証転送 | `node tests/browser-permissions.cjs` |

テーマ変更時は4つのカラーモードとiOS風ON/OFF、狭い画面、繰り返しの切替を確認します。取得処理の変更時は未取得・0件・部分失敗・ログイン切れ・複数タブも確認します。

合成ページでの成功と実Moodleでの成功は区別してください。Safariを配布する場合は共有リソースを生成し直してビルドし、対象端末で操作を確認します。チェック結果には実行したコマンド、環境、未確認事項を記録します。

## 利用者向けガイドの公開・保守

本文は `src/common/help.html` と `src/common/install.html`、スタイルと動作は `help.css`・`help.js` を編集します。画像・動画・字幕も `src/common/help*` に置き、同梱版と公開版の編集元を共通にします。

```sh
python3 scripts/prepare_pages.py
```

公開用ファイルは `build/pages/` に生成されます。対象は `src/common/help*`、`install.html`、`support-config.js` です。サイトの入口となる `index.html` は `help.html` と同じ内容で生成します。生成先は直接編集しません。

`.github/workflows/pages.yml` は、上記のソース・生成スクリプト・ワークフロー自体の変更を `main` にpushすると公開します。READMEやこのガイドだけの変更ではPagesの再公開は実行されません。必要な場合はActionsの「Publish guides to GitHub Pages」から手動実行できます。公開先は[GitHub Pages](https://ryosukeokazaki-0408.github.io/Duedle_Extended/)です。

問い合わせ先を変更するときは `src/common/support-config.js` の `contactFormUrl` とREADMEのフォームリンクを更新します。設定メニューと使い方ページはこの設定を参照します。Safari同梱版へ反映するには、従来どおりリソース生成と再ビルドが必要です。

公開後は使い方・導入方法・問い合わせへの移動、画像・動画・字幕の読込を拡張機能なしのブラウザで確認します。同梱版のブラウザテストだけでは公開版の配信成功を確認できません。

## GitHub公開・配布時の確認

公開するソース、Git履歴、配布ZIPは別々に確認します。`.gitignore` はすでに追跡したファイルや過去コミットから情報を消去するものではありません。

`./makezip.sh` は `src/` 内のGit追跡ファイルの現在の内容だけを圧縮し、`dist/` にZIPを作ります。未追跡の `.DS_Store` やローカル用ファイルは含みません。新しいソースや画像を追加した場合は、必要なファイルをGitの追跡対象にしてから実行してください。未コミットの編集もZIPへ反映されるため、配布前に差分を確認します。出力先は `./makezip.sh /path/to/output.zip` で指定できます。

- 資格情報、Cookie、セッションキー、個人の課題・成績・提出ファイル名を公開物に含めないよう確認する。Gitの作者・コミッター情報も公開対象になる。
- ガイド用の画像・動画、テストデータ、ログ、過去コミットも確認する。画面のユーザー名を隠すだけでは、他の情報やメタデータの匿名化にはならない。
- Safariの署名鍵・証明書・プロビジョニング情報と、個人用のXcode設定を分けて扱う。配布物へデバッグ環境や不要ファイルが混入していないことを確認する。
- manifestの権限、保存するデータ、アカウント切替後の保持、通信先について、実装と利用者向け説明を一致させる。
- バージョン、READMEの配布先・問い合わせ先、[ライセンス](LICENSE)、生成済みリソースの内容を確認する。

## 関連文書

- [README・概要と配布状況](readme.md)
- [利用者向け導入方法](https://ryosukeokazaki-0408.github.io/Duedle_Extended/install.html)
- [利用者向け使い方](https://ryosukeokazaki-0408.github.io/Duedle_Extended/help.html)
- [自動更新の仕様](docs/auto-refresh.md)
- [オフラインの開発用環境](docs/debug.md)
- [Safari版のビルド・検証](docs/safari.md)
- [モバイルUIの確認項目](docs/mobile-ui.md)

`docs/development-status.md` と `docs/documentation-handoff.md` は過去の作業記録です。当時の対象外機能や未確定事項を、現在の仕様・配布状況と混同しないでください。
