<?php
defined('MOODLE_INTERNAL') || die();

class block_syllabus extends block_base {
    public function init() { $this->title = get_string('pluginname', 'block_syllabus'); }
    public function get_content() {
        if ($this->content === null) {
            $this->content = (object)[
                'text' => html_writer::link(new moodle_url('/blocks/syllabus/view.php'), 'Demo syllabus / 架空の授業計画'),
                'footer' => '',
            ];
        }
        return $this->content;
    }
}
