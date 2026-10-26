<?php
defined('MOODLE_INTERNAL') || die();

function local_duedledemo_before_standard_top_of_body_html(): string {
    global $CFG;
    $url = new moodle_url('/local/duedledemo/index.php');
    return html_writer::div('Duedle Demo — Synthetic courses and submissions / 架空データ専用 · ' .
        html_writer::link($url, 'Demo guide / 操作ガイド'), 'alert alert-info', ['role' => 'note']);
}

function local_duedledemo_courses(): array {
    global $CFG;
    require_once($CFG->libdir . '/enrollib.php');
    $courses = array_values(enrol_get_my_courses('id,fullname,shortname', 'fullname ASC'));
    $order = json_decode(get_user_preferences('duedledemo_course_order', '[]'), true) ?: [];
    $positions = array_flip(array_map('intval', $order));
    usort($courses, static function($a, $b) use ($positions) {
        return ($positions[$a->id] ?? PHP_INT_MAX) <=> ($positions[$b->id] ?? PHP_INT_MAX)
            ?: strcmp($a->fullname, $b->fullname);
    });
    return $courses;
}
