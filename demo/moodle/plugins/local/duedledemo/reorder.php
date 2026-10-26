<?php
require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');
require_login();
$courses = local_duedledemo_courses();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_sesskey();
    $order = optional_param_array('order', [], PARAM_INT);
    uasort($courses, static function($a, $b) use ($order) {
        return ($order[$a->id] ?? 0) <=> ($order[$b->id] ?? 0);
    });
    set_user_preference('duedledemo_course_order', json_encode(array_map(static fn($course) => (int)$course->id, array_values($courses))));
    redirect(new moodle_url('/my/'));
}
$PAGE->set_url('/course/mycourse_config/reorder.php');
$PAGE->set_context(context_system::instance());
$PAGE->set_title('Myコースの表示設定');
$PAGE->set_heading('Myコースの表示設定');
$PAGE->navbar->add('Dashboard', new moodle_url('/my/'));
$PAGE->navbar->add('Myコースの表示設定');
echo $OUTPUT->header();
echo '<form method="post"><input type="hidden" name="sesskey" value="' . s(sesskey()) . '">' .
    '<center><table class="generaltable"><tbody><tr><th>Order</th><th>Course</th></tr>';
foreach ($courses as $index => $course) {
    echo '<tr><td><input aria-label="Order" type="number" name="order[' . (int)$course->id . ']" value="' . ($index + 1) * 10 . '"></td><td>' .
        html_writer::link(new moodle_url('/course/view.php', ['id' => $course->id]), format_string($course->fullname)) . '</td></tr>';
}
echo '</tbody></table></center><p align="center"><input class="btn btn-primary" type="submit" value="Save / 保存"> ' .
    html_writer::link(new moodle_url('/my/'), 'Cancel / 戻る', ['class' => 'btn btn-secondary']) . '</p></form>';
echo $OUTPUT->footer();
