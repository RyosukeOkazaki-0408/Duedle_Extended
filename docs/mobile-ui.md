# Safari UI修正と検証（2026年10月11日）

## 原因と変更

- 凡例は装飾アイコンではなく、設定保存につながる `input[type=color]`。WebKitのiOS描画実装 `paintColorWellDecorations` は虹色の円周を描画するため、CSS競合だけによるものではない。タッチ主体の端末では本体・swatch-wrapper・swatchの `appearance` を無効化し、単色の円と中立色の枠を使う。ネイティブ色選択・既存の明暗別設定キーは維持。マウス主体のPC表示は維持する。iOS端末上での最終描画とカラーピッカー操作は未確認。
- テーマ選択は `#usernavigation` 内にしか生成されず、スマホでナビゲーションが隠れると利用できなかった。767px以下、またはナビゲーションが非表示・未生成の場合は `#region-main` の先頭（なければbody末尾）の通常フローへ配置する。広い画面では従来位置。DOM準備後に保存値を読み、DOM置換・表示属性変更・リサイズ・pageshowで一つの選択UIを維持。既存の4モード、設定保存、ブラウザとの同期を維持し、別タブの設定変更にも追従する。44pxのタッチ高さと16pxの文字を使用。
- 767px以下で `flex-direction:column` とカード `width:100%` を指定していた。横一列へ変更し、狭い画面のカード幅は一覧の85%と300pxの小さい方。PCは従来の250〜300px幅を維持し、縮小を防ぐ。一覧のoverflowを横方向に閉じ込め、高さ上限を除去。スナップ、ドラッグ用JS、スクロール位置の操作は追加しない。
- 本番の課題カードは通常のhrefを持ち、カードリンクをキャンセルするイベントは確認されなかった。開発用 `dev/ui.js` は全リンクにpreventDefaultを使い、実Moodleへの誤接続を防ぐ仕様。本番資産には含まれない。Simulatorで報告された現象がこの画面によるものかは未確定。本番リンク処理への推測による変更は行っていない。

## 確認済み

- `python3 scripts/check_extension.py`：既存の全回帰テスト、JavaScript構文、manifest参照。
- `tests/browser-production.cjs`：本番Chrome拡張を合成Moodleページで検証。新規ライト表示、ダークとメニューOFFの再読込保持。
- `tests/browser-responsive.cjs`：本番Chrome拡張と合成Moodle。320/375/390/600/767/768/820/1024/1440px、横並び・次カードの見切れ（320〜390px）・自然な高さ・ページ全体の横はみ出しなし、テーマUIの単一生成、未生成・置換・非表示のナビゲーション、ブラウザ同期、テーマ変更時の横スクロール位置保持、課題・科目のタップ遷移と再読込。拡張読込前のリンク遷移と、既存ページ再読込後のUI生成も確認。

ブラウザテストにはPlaywrightとGoogle Chromeが必要。実Moodleへの通信はテスト側で遮断し、合成応答を返す。タッチエミュレーションの成功はiOS Safari確認を意味しない。

## 未確認・残る検証

macOS Safari / iPadOS Safari / iOS Safariと実Moodleは未確認。Simulatorへのアクセスが許可されなかったため、iPhone Simulatorでの再現・拡張有効/無効比較は未実施。実際のMoodleのCSS・イベントが関わるリンク不具合は未解決。

有効化・サイトアクセス許可より前から開いているページでは、コンテントスクリプトがまだ注入されていない場合がある。スクリプト自体が未実行ならページ内のDOM監視では回復できないため、そのページを再読み込みして確認する。Safariの有効化時の挙動はこの環境では未検証であり、常に更新が必要とは断定しない。新規ページ・更新済みページでDOMが遅れて生成される場合は今回の処理で対応する。

Safariで残る確認：初回有効化前から開いているタブと有効化後の新規タブ、サイト権限付与前後、再読込・Moodle遷移・戻る操作、縦横回転・iPad分割表示、色表示と色変更保存、横スワイプとリンクタップの競合、ブラウザ同期と手動テーマ変更、ページ全体の横移動がないこと。リンクが止まる場合は同じURLで拡張無効時と比較し、タップ対象・遮蔽要素・defaultPrevented・hrefを記録する。

参考：
- [WebKit iOS色コントロールの実装](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/ios/RenderThemeIOS.mm)
- [WebKit標準フォームCSS](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/html.css)
- [Apple HIG：ボタン](https://developer.apple.com/jp/design/human-interface-guidelines/buttons)

## iPhoneコースページの追加調整

599px以下のコースページでは、テーマ・閉じたタブの表示・セクション一覧を、初期状態で閉じた「Duedle設定」にまとめる。既存要素を移動するためイベント・保存機能は維持し、画面幅を広げた場合は元位置へ戻す。フィルターは2列、色コントロールは28pxに縮小。ユーザーの追加要望に合わせ、iPhone幅では操作欄の高さ・余白も縮めた。Chrome回帰テストで折りたたみ、遅れて生成される設定の収容、テーマ保存、PC幅への復元を確認。iPhone Simulator用のアプリもビルド・更新したが、Safariで拡張をONにした状態の最終表示は未確認。
