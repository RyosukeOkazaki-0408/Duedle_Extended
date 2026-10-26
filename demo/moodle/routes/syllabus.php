<?php
require_once(__DIR__ . '/../../config.php');
require_login();
$PAGE->set_url('/blocks/syllabus/view.php');
$PAGE->set_context(context_system::instance());
$PAGE->set_title('Demo syllabus');
$PAGE->set_heading('Demo syllabus / 架空の授業計画');
echo $OUTPUT->header();
echo '<p>これはデモ用の架空のシラバスです。大学の外部シラバスサービスとの接続は行いません。</p>';
echo html_writer::link(new moodle_url('/my/'), 'Back to dashboard / 戻る');
echo $OUTPUT->footer();
