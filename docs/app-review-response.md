# Duedle：App Reviewへの回答案

作成日：2026年10月22日／デモ環境の追記：2026年10月26日

現行ソース・プライバシーポリシー・利用ガイドを基にした英文案です。App Store Connectへは未送信です。提出済みビルドと現行ソースの一致、および実機テストの結果は今回確認していません。

## 使用前の確認

- 下の英文の角括弧を、実機動画のリンクまたは添付ファイル名、撮影端末・OS、実際にテストした提出ビルドの情報に置き換えてください。テストしていない機種を記載しないでください。
- 審査用の大学アカウントは提供できず、大学から書面による許可も得ていない事実を反映しています。この2点は説明だけで受理されるとは限らないため、Appleに審査方法と必要書類を確認する回答になっています。
- アプリ起動からの操作を含む最新OSの実機動画を用意してから、審査メッセージへの返信とApp Review InformationのNotesに下の英文を記載します。動画だけで審査可能とは断定していません。
- デモMoodleをGoogle Cloud上に構築済みです。学生ログインと架空データの表示を確認しています。下記のデモ対応を含む新ビルドの実機確認・アップロードが済むまで、提出済みビルドで利用できると案内しないでください。パスワードは本ファイルに保存せず、App Review Informationの専用欄で共有します。

## 貼り付け用英文

```text
Hello App Review Team,

Thank you for reviewing Duedle. Below is the requested information, including questions about review access and authorization.

1. Physical-device recording and testing

Recording: [VIDEO LINK OR ATTACHMENT FILENAME]
Recording device and OS: [DEVICE MODEL / OS VERSION]
Submitted version/build tested: [VERSION / BUILD]
Physical-device tests completed: [ACTUAL DEVICE MODELS, OS VERSIONS, AND TEST RESULTS]

2. Purpose and intended audience

Duedle is a Safari Web Extension for students using Nagoya Institute of Technology's Moodle. A separate developer-operated Moodle demo uses synthetic courses and submissions for review. The containing app provides setup instructions; main features run on Moodle pages in Safari.

Students can check assignments, quizzes, deadlines, and submission status together; filter, hide, and refresh tasks; change themes; reorder courses; navigate sections; and preview supported submitted files. This reduces the effort of checking multiple courses. Moodle remains the source of truth for deadlines, submissions, and grades.

3. Setup, feature access, and accounts

iPhone/iPad: Open Duedle, then enable it in Settings > Apps > Safari > Extensions > Duedle (Settings > Safari on older OS versions).
Mac: Enable Duedle in Safari > Settings > Extensions.

In Safari, open https://cms7.ict.nitech.ac.jp/moodle40a/, sign in through the university, allow Duedle access to this site, and reload.

On the dashboard, tap "課題を更新" (Update tasks) and keep the page open until completion. Expand "課題の設定" (Task settings) on narrow screens for filters. Use "課題を選択" (Select tasks) for bulk hiding/restoring. Open "Duedle設定" (Duedle settings) at the top right for themes, course ordering, and help. Course pages show course-specific tasks and section navigation. Open supported submitted files from assignment pages; use Safari's Back control to return.

Duedle has no separate account registration, subscriptions, in-app purchases, or social-sharing service. It uses the existing Moodle session without independently collecting or storing Moodle passwords. University accounts, course content, and submissions are managed by the university/Moodle, not Duedle.

Review site: https://duedle-35-184-191-167.sslip.io/moodle40a/
Review username: reviewer
Review password: [ENTER IN THE APP REVIEW INFORMATION PASSWORD FIELD]

The demo is an actual Moodle installation with three synthetic courses, seven assignments and three quizzes. It includes future opening dates, overdue and submitted assignments, draft work, graded quiz attempts, and sample PDF, image and text submissions. It uses a separate Moodle account, without university authentication or university content. Enable the Safari extension for this demo hostname, reload the dashboard, and use the controls described above. The demo guide is linked at the top of Moodle pages. The university's SSO and external syllabus service are not reproduced.

Demo-site functionality verified on the submitted build and physical devices: [FILL ONLY AFTER TESTING THE NEW BUILD].

4. External services and platforms

- Developer-operated demo Moodle on Google Cloud: review login, synthetic course/task data and sample submissions. The demo server stores demo activity and ordinary access logs. University data is not transferred to it.
- University Moodle and its sign-in service: authentication, course/task information, and files, using the existing browser session.
- Apple Safari Web Extensions: extension execution and browser-managed storage.
- GitHub Pages: public installation instructions, help, and privacy policy.
- Google Forms: user-initiated support inquiries.

The separately operated demo is the only developer-hosted Moodle service; normal university use communicates directly with university Moodle. No AI service, advertising/analytics SDK, or payment integration is used. Data is stored in browser storage; browser sync/OS backups may apply. Automatic refresh runs while authenticated Moodle pages are open.

5. Regional differences

Features do not vary by country/region. The supported site is the university Moodle above; the interface is primarily Japanese. Content depends on account/enrollment, and access is subject to university authentication/network policies.

6. Third-party authorization and regulated services

Duedle is independently developed, not an official or university-endorsed app. No written university authorization has been obtained. It enhances pages/files accessible to the signed-in user and does not bypass authentication.

It provides academic task organization and browser customization, not medical, financial, or gambling services. We do not claim that third-party rights documentation is unnecessary. Please advise what authorization documentation this extension requires.

Thank you.
```

## 大学への確認事項

情報基盤センター等のMoodle運用窓口に、次の点を具体的に確認するのが適切です。問い合わせ自体は送信していません。

1. 学生が自分のアカウントで開いたMoodleの表示を変更し、課題情報を取得・更新するSafari拡張機能を配布・利用してよいか。
2. App Storeの商品説明や審査資料で、対象サイトを説明するために大学名・サイト画面を使用してよいか。審査動画に教材が映る場合は、その権利者にも確認が必要か。
3. 許容される利用条件、情報取得の頻度等の制約、Appleに提示できる許可のメール・文書を得られるか。

大学の公式案内にはMoodleアプリを使わないよう求める記載があります。DuedleはSafari上の拡張機能であり、この記載だけで同じ扱いかは断定できません。問い合わせでは実装方式を説明して確認してください。

## 根拠・確認範囲

- 実装・説明：`src/manifest.json`、`src/common/privacy.html`、`src/common/install.html`、`src/common/help.html`、`src/common/account.js`、Safariの既存アプリ実装、`readme.md`。
- Appleの追加情報案内：https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- Appleのガイドライン2.1・5.2.2：https://developer.apple.com/app-store/review/guidelines/
- 大学のMoodle公式案内：https://www.cc.nitech.ac.jp/moodle-login

デモ対応のソース・接続先設定を更新しています。通常の `src/` と既存のSafariプロジェクト、ビルド・提出手順を使います。新ビルドの実機確認・署名・アップロードは別途必要です。
