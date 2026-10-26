# Duedle用の実Moodleデモ

Duedle本体は既存の `src/` とSafariプロジェクトを使い続ける。ここは別ディレクトリで管理するMoodleサーバーのセットアップ・データ投入用ソース。本体やプロジェクト一式の複製は含まない。

## 構成

- 専用のGoogle Cloud VM：Debian 12 amd64、e2-medium、標準永続ディスク20GB。
- Moodle 4.5.15+（公式コミット `cae172ee4aeec1d7a6eaba7bb5ae12a5f0fe3772`）・Classicテーマ。
- DebianのApache・PHP 8.2・PostgreSQL。MacへのDocker追加は不要。
- `/opt/duedle-moodle-demo/` にソース、データ、CLIを配置。DBもデモ専用。
- 初回は外部IPを含む `duedle-<IP>.sslip.io` のDNS名を使い、CertbotでHTTPS化する。TLS証明書取得時にはLet's Encryptの利用規約への同意が含まれる。既存ドメインを使う場合は、あらかじめVMへDNSを向けて `setup.sh hostname` と指定する。
- パスは大学サイトと同じ `/moodle40a/`。大学の実アカウント・教材・認証情報は使わない。メール送信と自己登録は無効。

## アップロードと起動

リポジトリ直下で `python3 demo/moodle/build_bundle.py` を実行し、生成された `build/demo/duedle-moodle-demo.tar.gz` だけをGoogle CloudのブラウザSSHの「ファイルをアップロード」で送る。

VM上で、同名の展開先がまだないことを確認して実行する：

```sh
test ! -e "$HOME/duedle-moodle-demo" && tar -xzf "$HOME/duedle-moodle-demo.tar.gz" -C "$HOME" && sudo bash "$HOME/duedle-moodle-demo/setup.sh"
```

セットアップに失敗した場合は、表示された原因を解消して `sudo bash "$HOME/duedle-moodle-demo/setup.sh"` を再実行する。成功済みの架空データは再投入しない。既存の別MoodleやDBは上書きせず停止する。プラグイン導入中に停止したデモDBは、標準の `upgrade.php` で続きを実行し、未設定の管理者・サイト設定だけを完了する。設定済みの管理者パスワードは変更せず、DBも削除しない。コア作成自体が不完全な場合はエラーで停止する。

2026-10-26の修正：シラバス用ディレクトリにも正規のブロック定義（`version.php`・クラス・言語ファイル）を同梱。コピー前にブロック構成とPHP構文を検査する。`detectedbrokenplugin: Missing version.php` で停止した場合も、修正版をアップロードして実行すればDBを再作成せず続行できる。ローカルの構成検査は `python3 tests/demo-packaging-regression.py`。

最後にURLと `reviewer` 学生アカウント・管理者アカウントのパスワードを表示する。ランダム生成した資格情報はVMの `/opt/duedle-moodle-demo/instance.env` にroot専用権限で保存する。パスワードをリポジトリや公開資料へ記載しない。

## データと操作

- コース3件、課題7件、小テスト3件。課題は未提出、提出済み、下書き、期限切れ、開始18時間後、開始4日後、期限なしを用意。
- 小テストは実際の問題・解答処理を使い、未受験、合格、不合格で受験回数を使い切った例を用意。
- 提出済み課題に架空のPDF・PNG・テキストを添付。既存のガイド画像・動画は変更しない。
- 開始・期限は初回投入時からの相対日時。再実行で利用者の提出や期限を勝手にリセットしない。時間が経つと状態は自然に変わる。
- 大学独自のコース並べ替え用URLは、デモ専用ページで再現。保存した順番はダッシュボードの「Demo courses」ブロックへ反映する。標準Moodleの別ブロックの並び順までは変更しない。
- `/local/duedledemo/index.php` に操作ガイド。大学独自SSOと外部シラバスサービスの接続は対象外。

## 検証状況と残作業

公開先：<https://duedle-35-184-191-167.sslip.io/moodle40a/>

2026-10-26、VM上のインストールと架空データ投入を完了。学生のブラウザログイン、3コース、提出済み課題の添付を確認した。コース並べ替えフォームの保存とダッシュボードへの反映を実ブラウザで確認し、確認後に元の順番へ戻した。読み取り専用のHTTP検証で登録コース・コース状態・更新API、課題10件、認証付きPDF・PNG・テキストの応答を確認。その実応答をDuedleの本番収集・解析・保存処理へ再生し、課題7件・小テスト3件、開始日時10件・既知の期限9件、提出済み・合格・回数上限の状態を照合した。HTTP認証検証と再生テストは、拡張機能を入れた実機での全操作の検証とは区別する。

Duedleの `src/common/sites.js` とmanifestには大学MoodleとこのHTTPSホストのみを登録。初期検討時のlocalhost権限は除去した。接続先ごとの同一ユーザーID・同一課題IDのデータ分離と復元は `tests/sites-regression.js` と、実Chrome拡張機能を合成ページで読み込む `tests/browser-demo-isolation.cjs` で確認済み。

追加検証：`DUEDLE_DEMO_PASSWORD` を環境変数で渡して `python3 tests/demo-moodle-http-probe.py` を実行。出力された一時ディレクトリを `node tests/browser-demo-recording.cjs <directory>` に渡す。パスワードは保存しない。一時HTMLにはセッション情報が含まれるため、Gitへ追加しない。

通常のChrome読込先は `src/`、Safariは既存プロジェクトと `python3 scripts/prepare_safari.py --resources-only` を使用する。Chrome開発版の再読み込み、Safariの新ビルドの実機確認・署名・TestFlightへの再提出は別途必要。既存の配布済みTestFlightビルドへソース変更が自動反映されることはない。

公開後はVMを停止するとデモも停止する。外部IPが変わるとURL・証明書・拡張機能の接続先も変わるため、審査期間に使うIPの固定は別途確認する。無料試用の期限・クレジット残高とVMの費用はGoogle Cloud側で管理する。

根拠：
- [Moodle 4.5の対応条件](https://moodledev.io/general/releases/4.5)
- [MoodleのCLIインストール](https://docs.moodle.org/en/Administration_via_command_line)
- [sslip.io / nip.ioとTLS](https://nip.io/)
- [Certbot](https://certbot.eff.org/)
