<?php
// CLI only. All users, content and submissions created here are synthetic.
define('CLI_SCRIPT', true);
require('/opt/duedle-moodle-demo/www/moodle40a/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir . '/enrollib.php');
require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->dirroot . '/mod/assign/locallib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

if (get_config('local_duedledemo', 'seedcomplete')) {
    echo "Demo data already exists. Existing submissions and dates were preserved.\n";
    exit(0);
}
if (!getenv('DEMO_STUDENT_PASSWORD')) { throw new RuntimeException('Student password is required.'); }
\core\session\manager::set_user(get_admin());
$admin = $USER;
$transaction = $DB->start_delegated_transaction();
set_config('theme', 'classic');
set_config('forcelogin', 1);
set_config('guestloginbutton', 0);
set_config('registerauth', '');
set_config('timezone', 'Asia/Tokyo');
set_config('enablecompletion', 1);
set_config('enableavailability', 1);
set_config('messaging', 0);
set_config('updatenotifications', 0);
set_config('passwordpolicy', 1);
set_config('defaultpreference_maildisplay', 0);

if ($DB->record_exists('user', ['username' => 'reviewer', 'mnethostid' => $CFG->mnet_localhost_id])) {
    throw new RuntimeException('An existing reviewer account was found. Refusing to reuse or change it.');
}
$studentid = user_create_user((object)[
    'auth' => 'manual', 'confirmed' => 1, 'mnethostid' => $CFG->mnet_localhost_id,
    'username' => 'reviewer', 'password' => getenv('DEMO_STUDENT_PASSWORD'),
    'firstname' => 'Demo', 'lastname' => 'Student', 'email' => 'student@example.com',
    'maildisplay' => 0, 'lang' => 'en', 'timezone' => 'Asia/Tokyo',
]);
$student = $DB->get_record('user', ['id' => $studentid], '*', MUST_EXIST);
$category = core_course_category::create(['name' => 'Duedle Demo / 架空の授業', 'idnumber' => 'duedle-demo']);
$roleid = $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST);
$enrolplugin = enrol_get_plugin('manual');
$now = time();
$day = DAYSECS;
$courses = [];
foreach (['プログラミング基礎', '情報デザイン', 'データサイエンス'] as $index => $name) {
    $course = create_course((object)[
        'fullname' => $name . ' — Demo', 'shortname' => 'DEMO-' . ($index + 1),
        'idnumber' => 'duedle-demo-' . ($index + 1), 'category' => $category->id,
        'summary' => '<p>Synthetic course for testing Duedle. 教材・課題・成績はすべて架空です。</p>',
        'summaryformat' => FORMAT_HTML, 'format' => 'topics', 'numsections' => 3,
        'startdate' => $now - 30 * $day, 'enddate' => $now + 120 * $day,
        'visible' => 1, 'enablecompletion' => 1,
    ]);
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
    $instanceid = $instance ? $instance->id : $enrolplugin->add_instance($course);
    $enrolplugin->enrol_user($DB->get_record('enrol', ['id' => $instanceid], '*', MUST_EXIST), $studentid, $roleid);
    course_create_sections_if_missing($course, [1, 2, 3]);
    foreach ([1 => '第1回：授業と課題', 2 => '第2回：演習', 3 => '第3回：振り返り'] as $section => $title) {
        $DB->set_field('course_sections', 'name', $title, ['course' => $course->id, 'section' => $section]);
    }
    $courses[] = $course;
}

function demo_activity(stdClass $course, string $type, string $name, array $options): stdClass {
    global $DB;
    $base = [
        'modulename' => $type, 'module' => $DB->get_field('modules', 'id', ['name' => $type], MUST_EXIST),
        'name' => $name, 'section' => 1, 'visible' => 1, 'groupmode' => 0,
        'cmidnumber' => '', 'showdescription' => 1,
        'intro' => '<p>This activity contains synthetic demonstration data only. You may submit sample work.</p>',
        'introformat' => FORMAT_HTML,
    ];
    if ($type === 'assign') {
        $base += [
            'alwaysshowdescription' => 1, 'submissiondrafts' => 1, 'requiresubmissionstatement' => 0,
            'sendnotifications' => 0, 'sendstudentnotifications' => 0, 'sendlatenotifications' => 0,
            'grade' => 100, 'gradepass' => 60, 'cutoffdate' => 0, 'gradingduedate' => 0,
            'teamsubmission' => 0, 'requireallteammemberssubmit' => 0, 'teamsubmissiongroupingid' => 0,
            'blindmarking' => 0, 'attemptreopenmethod' => 'none', 'maxattempts' => 1,
            'markingworkflow' => 0, 'markingallocation' => 0, 'timelimit' => 0,
            'activityformat' => 0, 'submissionattachments' => 0,
            'assignsubmission_file_enabled' => 1, 'assignsubmission_file_maxfiles' => 3,
            'assignsubmission_file_maxsizebytes' => 2 * 1024 * 1024,
            'assignsubmission_onlinetext_enabled' => 1,
            'assignfeedback_comments_enabled' => 1,
        ];
    } else {
        $base += [
            'timeopen' => 0, 'timeclose' => 0, 'preferredbehaviour' => 'deferredfeedback',
            'attempts' => 2, 'attemptonlast' => 0, 'grademethod' => QUIZ_GRADEHIGHEST,
            'decimalpoints' => 2, 'questiondecimalpoints' => -1, 'questionsperpage' => 1,
            'shuffleanswers' => 0, 'sumgrades' => 0, 'grade' => 10, 'gradepass' => 6,
            'timelimit' => 0, 'overduehandling' => 'autosubmit', 'graceperiod' => 0,
            'quizpassword' => '', 'subnet' => '', 'browsersecurity' => '',
            'delay1' => 0, 'delay2' => 0, 'showuserpicture' => 0, 'showblocks' => 0,
            'navmethod' => QUIZ_NAVMETHOD_FREE,
        ];
        foreach (['attempt', 'correctness', 'maxmarks', 'marks', 'specificfeedback', 'generalfeedback', 'rightanswer', 'overallfeedback'] as $review) {
            foreach (['during', 'immediately', 'open', 'closed'] as $phase) {
                $base[$review . $phase] = 1;
            }
        }
    }
    return add_moduleinfo((object)array_replace($base, $options), $course);
}

function demo_submission(stdClass $module, stdClass $student, string $status, bool $files): void {
    global $DB;
    [$course, $cm] = get_course_and_cm_from_cmid($module->coursemodule, 'assign');
    $context = context_module::instance($cm->id);
    $assignment = new assign($context, $cm, $course);
    $submission = $assignment->get_user_submission($student->id, true);
    $submission->status = $status;
    $submission->timemodified = time();
    $DB->update_record('assign_submission', $submission);
    if ($files) {
        foreach (['report.pdf', 'notes.txt', 'diagram.png'] as $filename) {
            get_file_storage()->create_file_from_pathname([
                'contextid' => $context->id, 'component' => 'assignsubmission_file',
                'filearea' => 'submission_files', 'itemid' => $submission->id,
                'filepath' => '/', 'filename' => $filename, 'userid' => $student->id,
            ], __DIR__ . '/files/' . $filename);
        }
        $DB->insert_record('assignsubmission_file', (object)[
            'assignment' => $module->instance, 'submission' => $submission->id, 'numfiles' => 3,
        ]);
    } else {
        $DB->insert_record('assignsubmission_onlinetext', (object)[
            'assignment' => $module->instance, 'submission' => $submission->id,
            'onlinetext' => '<p>This is a synthetic draft. Submit it to test the status change.</p>',
            'onlineformat' => FORMAT_HTML,
        ]);
    }
}

$activities = [];
$assignments = [
    [0, '未提出：プログラミング演習', -7 * $day, 2 * $day, null],
    [0, '提出済み：レポートとプレビュー用ファイル', -7 * $day, 4 * $day, 'submitted'],
    [1, '開始前：明日からのデザイン課題', 18 * HOURSECS, 5 * $day, null],
    [1, '開始前：4日後の演習', 4 * $day, 10 * $day, null],
    [2, '期限切れ：振り返りレポート', -10 * $day, -$day, null],
    [2, '下書き：データ分析レポート', -3 * $day, 12 * HOURSECS, 'draft'],
    [2, '期限なし：自由課題', -$day, 0, null],
];
foreach ($assignments as $index => [$courseindex, $name, $start, $due, $status]) {
    $module = demo_activity($courses[$courseindex], 'assign', $name, [
        'section' => ($index % 3) + 1, 'allowsubmissionsfromdate' => $now + $start,
        'duedate' => $due ? $now + $due : 0,
    ]);
    if ($status) { demo_submission($module, $student, $status, $status === 'submitted'); }
    $activities[] = ['type' => 'assign', 'cmid' => $module->coursemodule, 'name' => $name];
}

foreach ([['未受験：基礎確認', null], ['合格済み：確認テスト', 1], ['不合格・回数上限：復習テスト', 0]] as $index => [$name, $answer]) {
    $course = $courses[$index];
    $module = demo_activity($course, 'quiz', $name, [
        'section' => 2, 'timeopen' => $now - $day, 'timeclose' => $now + 3 * $day,
        'attempts' => $answer === 0 ? 1 : 2,
    ]);
    $context = context_course::instance($course->id);
    $categoryid = $DB->insert_record('question_categories', (object)[
        'contextid' => $context->id, 'name' => 'Demo question', 'info' => '',
        'infoformat' => FORMAT_HTML, 'stamp' => make_unique_id_code(), 'parent' => 0, 'sortorder' => 1,
    ]);
    $editor = static fn($text) => ['text' => $text, 'format' => FORMAT_HTML, 'itemid' => 0];
    $question = question_bank::get_qtype('truefalse')->save_question((object)['qtype' => 'truefalse'], (object)[
        'category' => $categoryid . ',' . $context->id, 'name' => 'Demo: 2 + 2 = 4',
        'questiontext' => $editor('<p>2 + 2 = 4.</p>'), 'generalfeedback' => $editor('2 + 2 is 4.'),
        'defaultmark' => 1, 'penalty' => 1, 'correctanswer' => 1,
        'feedbacktrue' => $editor('Correct.'), 'feedbackfalse' => $editor('Try again.'),
        'showstandardinstruction' => 0,
    ]);
    $quiz = $DB->get_record('quiz', ['id' => $module->instance], '*', MUST_EXIST);
    quiz_add_quiz_question($question->id, $quiz);
    $quizsettings = \mod_quiz\quiz_settings::create($quiz->id);
    $quizsettings->get_grade_calculator()->recompute_quiz_sumgrades();
    if ($answer !== null) {
        \core\session\manager::set_user($student);
        $quizsettings = \mod_quiz\quiz_settings::create($quiz->id, $student->id);
        $attempt = quiz_prepare_and_start_new_attempt($quizsettings, 1, null);
        $attemptobject = \mod_quiz\quiz_attempt::create($attempt->id);
        $attemptobject->process_submitted_actions(time(), false, [1 => ['answer' => $answer]]);
        $attemptobject->process_finish(time(), false);
        \core\session\manager::set_user($admin);
    }
    $activities[] = ['type' => 'quiz', 'cmid' => $module->coursemodule, 'name' => $name];
}

// Standard Moodle block instances, inherited by each student's dashboard/course.
foreach ([['my-index', 'content'], ['course-view-*', 'side-post']] as [$page, $region]) {
    $DB->insert_record('block_instances', (object)[
        'blockname' => 'duedledemo', 'parentcontextid' => context_system::instance()->id,
        'showinsubcontexts' => 1, 'pagetypepattern' => $page, 'subpagepattern' => null,
        'defaultregion' => $region, 'defaultweight' => -10, 'configdata' => '',
        'timecreated' => $now, 'timemodified' => $now,
    ]);
}
set_config('activities', json_encode($activities), 'local_duedledemo');
set_config('seededat', $now, 'local_duedledemo');
set_config('seedcomplete', 1, 'local_duedledemo');
$transaction->allow_commit();
purge_all_caches();
echo 'Created demo student, 3 courses, 7 assignments and 3 quizzes (2 graded attempts).' . "\n";
