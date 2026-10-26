<?php
defined('MOODLE_INTERNAL') || die();

class block_duedledemo extends block_base {
    public function init() { $this->title = get_string('pluginname', 'block_duedledemo'); }
    public function applicable_formats() { return ['my' => true, 'course-view' => true]; }
    public function get_content() {
        global $CFG;
        if ($this->content !== null) { return $this->content; }
        require_once($CFG->dirroot . '/local/duedledemo/lib.php');
        $links = [];
        foreach (local_duedledemo_courses() as $course) {
            $links[] = html_writer::link(new moodle_url('/course/view.php', ['id' => $course->id]), format_string($course->fullname));
        }
        $this->content = (object)['text' => html_writer::alist($links),
            'footer' => html_writer::link(new moodle_url('/course/mycourse_config/reorder.php'), 'コースの並べ替え')];
        return $this->content;
    }
}
