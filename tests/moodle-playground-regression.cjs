// Replays real Moodle 4.4 backend observations through the unchanged production
// collector and storage. Detail parsing and the real HTTP transport are NOT
// covered here: the detail adapter is deliberately a controlled known record.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/moodle-playground-44.json');
const load = (file, name, bindings = {}) => Function(...Object.keys(bindings),
    fs.readFileSync(path.join(root, file), 'utf8') + `\nreturn ${name};`)(...Object.values(bindings));
const baseURL = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const copy = value => JSON.parse(JSON.stringify(value));
const sorted = values => [...values].sort((a, b) => a - b);
function environment() {
    const values = { assign_list: [], quiz_list: [], enrolledCourseIds: [fixture.courseId] };
    const ext = { storage: { local: {
        async get(keys) { return Object.fromEntries((typeof keys === 'string' ? [keys] : keys)
            .filter(key => key in values).map(key => [key, copy(values[key])])); },
        async set(data) { Object.assign(values, copy(data)); }
    } } };
    const StorageUtil = load('src/storage/class/StorageUtil.js', 'StorageUtil', { ext });
    StorageUtil.isBackground = true;
    let current, changes = [], enrolled = [fixture.courseId], second = 1800000000;
    const fetched = [];
    const scraper = type => ({
        unavailableTask() { return null; },
        getData(doc, url) {
            const id = Number(new URL(url).searchParams.get('id'));
            fetched.push(id);
            return { group: type + '_list', [type === 'assign' ? 'assignId' : 'quizId']: id,
                courseId: fixture.courseId, fetchedAt: second * 1000, status: 'incomplete', show: true };
        }
    });
    const CourseCollector = load('src/storage/class/CourseCollector.js', 'CourseCollector', {
        StorageUtil, ScrapeAssign: scraper('assign'), ScrapeQuiz: scraper('quiz'),
        AutoRefreshCollector: { findSesskey() { return 'synthetic-session'; } }
    });
    const collector = new CourseCollector({ now: () => 0, parse: () => ({ querySelector() { return null; } }),
        fetch: async (url, options) => {
            const method = new URL(url).searchParams.get('info');
            const response = { ok: true, status: 200, url,
                headers: { get(name) { return name === 'Date' ? new Date(second * 1000).toUTCString() : null; } } };
            if (method === 'core_course_get_enrolled_courses_by_timeline_classification') {
                assert.deepEqual(JSON.parse(options.body)[0].args, {classification: 'all', limit: 0, offset: 0});
                response.json = async () => [{data: {courses: enrolled.map(id => ({id})), nextoffset: enrolled.length}}];
            } else if (method) {
                assert.equal(JSON.parse(options.body)[0].args.courseid, fixture.courseId);
                const data = method === 'core_courseformat_get_state' ? JSON.stringify(current)
                    : { instances: changes, warnings: [] };
                response.text = async () => JSON.stringify([{ data }]);
            } else {
                assert.match(url, /\/mod\/(assign|quiz)\/view.php\?id=\d+$/);
                response.text = async () => '<controlled-detail-adapter>';
            }
            return response;
        }
    });
    return { values, StorageUtil, collector, fetched,
        enrollment(ids) { enrolled = copy(ids); },
        select(row, updates = []) {
            second += 60;
            current = { course: { id: fixture.courseId },
                section: row[2].map(([id, visible, cmlist]) => ({ id, visible, cmlist })),
                cm: row[3].map(([id, sectionid, visible, uservisible, suffix]) => ({
                    id, sectionid, visible, uservisible, ...(suffix ? { url: baseURL + 'mod/' + suffix } : {}) })) };
            changes = copy(updates);
            fetched.length = 0;
        },
        async ids() { return sorted((await StorageUtil.getAllData()).map(x => x.assignId || x.quizId)); }
    };
}
(async () => {
    const delta = environment(), full = environment();
    const results = [];
    for (const row of fixture.availability) {
        delta.select(row); full.select(row);
        // Independently force the reference path to read every available detail.
        if (full.values.courseAvailability?.[fixture.courseId]) {
            delete full.values.courseAvailability[fixture.courseId].detailsCheckedSince;
        }
        const incremental = await delta.collector.run([fixture.courseId]);
        const reference = await full.collector.run([fixture.courseId]);
        assert.equal(incremental.failed, 0, row[0]);
        assert.equal(reference.failed, 0, row[0]);
        assert.deepEqual(await delta.ids(), sorted(row[1]), row[0] + ': expected student-accessible tasks');
        assert.deepEqual(await delta.ids(), await full.ids(), row[0] + ': differential/full mismatch');
        for (const id of delta.fetched) assert(row[1].includes(id), row[0] + ': restricted task was fetched');
        if (row[0].includes('released') || row[0].includes('restriction-removed')) {
            // Every newly accessible cached activity must be reread even though
            // the REAL update API reported an empty instance list in these cases.
            const previousIds = results.at(-1)?.ids || [];
            for (const id of row[1].filter(id => !previousIds.includes(id))) {
                assert(delta.fetched.includes(id), row[0] + ': newly released detail was skipped');
            }
        }
        results.push({ name: row[0], ids: await delta.ids(), saved: incremental.saved, skipped: incremental.skipped });
    }
    for (const [name, updates] of fixture.changes) {
        delta.select(fixture.availability[0], updates);
        const result = await delta.collector.run([fixture.courseId]);
        assert.equal(result.failed, 0, name);
        for (const instance of updates) assert(delta.fetched.includes(instance.id), name + ': changed detail was skipped');
        results.push({ name, fetched: [...delta.fetched] });
    }
    for (const [name, courseIds, expectedIds] of fixture.enrollment) {
        delta.enrollment(courseIds);
        // The dashboard persists the full enrollment snapshot before collecting.
        delta.values.enrolledCourseIds = await delta.collector.enrolledCourseIds({});
        assert.deepEqual(await delta.ids(), sorted(expectedIds), name + ': retired course tasks must not remain visible');
        assert.equal(delta.values.assign_list.length + delta.values.quiz_list.length, 3,
            name + ': membership changes preserve cached records and preferences');
        results.push({name, courseIds: [...delta.values.enrolledCourseIds], ids: await delta.ids()});
    }
    console.log(JSON.stringify({ environment: fixture.environment, results }, null, 2));
    console.log(`PASS ${results.length} recorded Moodle cases: availability, restrictions, releases, differential/full agreement and update-triggered reads`);
})().catch(error => { console.error(error); process.exitCode = 1; });
