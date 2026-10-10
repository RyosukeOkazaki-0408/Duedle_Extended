> [!NOTE]
> このドキュメントはAI（Claude）によって生成されました。内容に誤りが含まれる可能性があるため、適宜確認・修正してください。

## Duedleが叶えること
- ダークモードでMoodleを使いたい！(ダークモード機能)
- 課題・小テストの締め切りを一覧で確認したい！(タスクダッシュボード機能)
- コースページをNotion風のサイドバーで素早く移動したい！(コースナビゲーション機能)
- 不要なUI要素を非表示にしてスッキリ使いたい！(QoL改善機能)
- 最近見たページに素早くアクセスしたい！(閲覧履歴機能)

## Moodleに追加する機能
- ダークモード（ブラウザ設定と同期 / 強制ON / 強制OFF）
- タスクダッシュボード（課題・小テストの締め切り管理・フィルタリング）
- 表示中の課題情報の自動更新（締切一覧API＋詳細の分割取得。詳細は締切間近3時間・その他未完了12時間・完了済み/非表示24時間）
- Notion風コースナビゲーション（セクションサイドバー・トップへ戻るリンク）
- コース表示順のカスタマイズ（ドラッグ&ドロップ）
- 非表示コースセクションの表示/非表示トグル
- ユーザー名・「マイコース」リンクの非表示
- ナビバーのブランディングカスタマイズ
- 閲覧履歴サイドバー（最大10件）
- ファイルのforce-downloadの削除（直接プレビュー可能に）

## 技術的な説明

### 概要
DuedleはManifest v3のWeb Extensionとして実装されており、名工大Moodle（`https://cms7.ict.nitech.ac.jp/moodle40a/`）にコンテントスクリプトを注入して動作する。Chromeでは `src/` を直接読み込む。Safariでは同じソースを `scripts/prepare_safari.py` で配置し、iPhone・iPad・Mac用のXcodeプロジェクトをビルドする。[Safari版のセットアップと制限](docs/safari.md)を参照。

### ディレクトリ構成
```
src/
├── manifest.json         # Chrome拡張機能の設定（Manifest v3）
├── common/               # 全ページ共通の機能（ユーザー名非表示、タイトル変更など）
├── theme/                # テーマ・ダークモード
├── storage/              # 課題取得・保存・タスクダッシュボード
│   ├── class/            # 取得・解析・保存・表示の共通クラス
│   ├── display/          # ダッシュボードとフィルター
│   ├── auto_refresh.js   # 表示中の自動更新
│   ├── service_worker.js # 保存・更新の調整・タブ収集、Chromeの通知
│   └── background.html   # Safariの非永続背景ページ
├── notionnav/            # Notion風ナビゲーション（navigation.js）
├── qol/                  # ファイルプレビュー
├── document_start/       # 初期表示の調整
├── cource/               # コース表示順カスタマイズ
├── login_screen/         # ログインページカスタマイズ
├── syllabus/             # シラバスページ向けダークモード
└── lib/                  # 共通ユーティリティ（configManager.ts）
```

### データ永続化

**拡張機能の `storage.local`（タスクデータ）**

`assign_list` 配列（各課題の識別子: `assignId`）:
| フィールド | 内容 |
|---|---|
| assignId | 課題ID |
| courseName | コース名 |
| assignName | 課題名 |
| start / submit / due | 開始・提出・締め切り日時（タイムスタンプ） |
| file / filenum | 提出ファイル名・ファイル数 |
| status | `complete` / `incomplete` / `expired` |
| fetchedAt / courseId | 詳細を正常取得した時刻（ミリ秒）・所属コースID |

`quiz_list` 配列（各小テストの識別子: `quizId`）:
| フィールド | 内容 |
|---|---|
| quizId | 小テストID |
| courseName / quizName | コース名・小テスト名 |
| start / submit / due | 開始・提出・締め切り日時 |
| point / required / maxp | 得点・合格点・満点 |
| count / maxcount | 挑戦回数・最大挑戦回数 |
| status | `complete` / `qualify` / `incomplete` / `stuck` / `unknown` / `expired` |
| fetchedAt / courseId | 詳細を正常取得した時刻（ミリ秒）・所属コースID |

**ユーザー設定**

テーマと履歴は拡張機能の `storage.local`、フィルター・色設定は `storage.sync` に保存する。閉じたセクションの表示設定はMoodleの `localStorage` に保存する。ブラウザ間のデータ移行や端末同期機能は追加していない。

自動更新の予定時刻・実行ロック・取得の続きは `storage.local` の `refreshCoordinator` に保存する。端末ごとに時刻をずらし、複数タブ・手動更新との重複取得を防ぐ。[自動更新の仕様](docs/auto-refresh.md)を参照。

| キー | 内容 |
|---|---|
| `thememode` | 0=ブラウザ同期 / 1=ダーク / 2=ライト / 3=ほのぼの |
| `history` | 最近の閲覧ページ（最大10件の配列） |
| `selectedType` | タスクフィルター: 種別 |
| `selectedStatus` | タスクフィルター: ステータス |
| `selectedDue` | タスクフィルター: 締め切り期間 |
| `hide` | 非表示コースセクションの表示切替 |

### インストール方法
1. リポジトリをクローン
   ```bash
   git clone git@github.com:mtugb/duedle.git
   cd duedle
   npm install
   ```
2. `chrome://extensions/` を開き、デベロッパーモードを有効化
3. 「パッケージ化されていない拡張機能を読み込む」で `src/` ディレクトリを選択

### 開発時の注意
- ファイルを編集したら `chrome://extensions/` でリロードが必要
- コンテントスクリプトの注入先は `manifest.json` の `content_scripts` で管理
- 新機能は `src/` 配下に機能名ディレクトリを切って実装する
