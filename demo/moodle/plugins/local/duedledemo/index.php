<?php
require_once(__DIR__ . '/../../config.php');
require_login();
$PAGE->set_url('/local/duedledemo/index.php');
$PAGE->set_context(context_system::instance());
$PAGE->set_title('Duedle demo guide');
$PAGE->set_heading('Duedle demo guide / 操作ガイド');
echo $OUTPUT->header();
echo $OUTPUT->heading('Synthetic data / すべて架空のデータです', 2);
echo '<ol><li>Enable Duedle in Safari or Chrome and allow access to this demo site. Reload the dashboard.</li>' .
    '<li>Open the dashboard and select 「課題を更新」. Keep the page open until it finishes.</li>' .
    '<li>Try task filters: type, status, start date, deadline and visibility. Open 「課題の設定」 on narrow screens.</li>' .
    '<li>Try the four themes and iOS appearance in 「Duedle設定」.</li>' .
    '<li>Open courses to try section navigation, activity colors and recently visited courses.</li>' .
    '<li>Open the submitted assignment to preview PDF, PNG and text. Use the browser Back control to return.</li>' .
    '<li>Try the course ordering page, save, and check the Demo courses block on the dashboard.</li>' .
    '<li>Use an unsubmitted assignment or quiz to submit your own synthetic work, then refresh Duedle.</li></ol>';
echo '<p>大学の実アカウント・教材は使用していません。名工大独自のSSOや外部シラバスサービスは再現していません。</p>';
echo html_writer::link(new moodle_url('/my/'), 'Dashboard / ダッシュボードへ', ['class' => 'btn btn-primary mr-2']);
echo html_writer::link(new moodle_url('/course/mycourse_config/reorder.php'), 'Course ordering / コースの並べ替え', ['class' => 'btn btn-secondary']);
echo $OUTPUT->footer();
