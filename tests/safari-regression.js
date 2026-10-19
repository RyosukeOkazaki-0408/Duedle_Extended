/*
 * Dependency-free regression checks. Run from the repository root with:
 *   node tests/safari-regression.js
 * or on macOS without Node:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/safari-regression.js
 * DOM and extension APIs are mocked; the production JavaScript is evaluated unchanged.
 */
(function () {
    "use strict";

    const isNode = typeof require === "function";
    const read = isNode ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = isNode ? value => console.log(value) : print;
    const tests = [];

    function test(name, run) { tests.push({ name, run }); }
    function assert(value, message) {
        if (!value) throw new Error(message || "Assertion failed");
    }
    function equal(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error((message || "Values differ") + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
        }
    }
    async function rejects(run, pattern) {
        let error;
        try { await run(); } catch (caught) { error = caught; }
        assert(error, "Expected rejection");
        if (pattern) assert(pattern.test(String(error.message || error)), "Unexpected error: " + error);
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function production(path, names, bindings) {
        const keys = Object.keys(bindings || {});
        return Function(...keys, read(path) + "\nreturn { " + names.join(", ") + " };")(...keys.map(key => bindings[key]));
    }

    // JavaScriptCore's command-line runner omits Web URL APIs. These small test
    // substitutes only implement the HTTPS/query behavior used by this extension.
    class TestSearchParams {
        constructor(search) {
            this.entries = String(search || "").replace(/^\?/, "").split("&").filter(Boolean).map(part => {
                const index = part.indexOf("=");
                const name = index < 0 ? part : part.slice(0, index);
                const value = index < 0 ? "" : part.slice(index + 1);
                return [decodeURIComponent(name.replace(/\+/g, " ")), decodeURIComponent(value.replace(/\+/g, " "))];
            });
        }
        get(name) {
            const entry = this.entries.find(pair => pair[0] === name);
            return entry ? entry[1] : null;
        }
    }
    class TestURL {
        constructor(raw, base) {
            let value = String(raw);
            if (!/^https?:\/\//.test(value)) {
                if (!base) throw new TypeError("Invalid URL");
                const parent = new TestURL(String(base));
                if (value.startsWith("//")) value = parent.protocol + value;
                else if (value.startsWith("/")) value = parent.origin + value;
                else if (value.startsWith("?")) value = parent.origin + parent.pathname + value;
                else value = parent.origin + parent.pathname.replace(/[^/]*$/, "") + value;
            }
            const match = /^(https?:)\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(value);
            if (!match) throw new TypeError("Invalid URL");
            this.protocol = match[1];
            this.host = match[2];
            this.hostname = this.host.split(":")[0];
            this.origin = this.protocol + "//" + this.host;
            const segments = [];
            for (const segment of (match[3] || "/").split("/")) {
                if (segment === "..") segments.pop();
                else if (segment && segment !== ".") segments.push(segment);
            }
            this.pathname = "/" + segments.join("/");
            if (match[3] && match[3].endsWith("/") && this.pathname !== "/") this.pathname += "/";
            this.search = match[4] || "";
            this.hash = match[5] || "";
            this.href = this.origin + this.pathname + this.search + this.hash;
            this.searchParams = new TestSearchParams(this.search);
        }
        toString() { return this.href; }
    }
    const URLClass = typeof URL === "function" ? URL : TestURL;
    const SearchParamsClass = typeof URLSearchParams === "function" ? URLSearchParams : TestSearchParams;

    class TestAbortController {
        constructor() {
            const listeners = new Set();
            this.signal = {
                aborted: false,
                addEventListener(type, listener) { if (type === "abort") listeners.add(listener); },
                removeEventListener(type, listener) { if (type === "abort") listeners.delete(listener); },
                listenerCount() { return listeners.size; }
            };
            this.abort = () => {
                this.signal.aborted = true;
                for (const listener of listeners) listener();
            };
        }
    }
    function mockTimers() {
        let nextID = 1;
        let now = 0;
        const pending = new Map();
        return {
            setTimeout(callback, delay) {
                const id = nextID++;
                pending.set(id, { callback, due: now + Number(delay || 0) });
                return id;
            },
            clearTimeout(id) { pending.delete(id); },
            advance(milliseconds) {
                const end = now + milliseconds;
                while (true) {
                    const entry = [...pending].filter(pair => pair[1].due <= end).sort((a, b) => a[1].due - b[1].due)[0];
                    if (!entry) break;
                    pending.delete(entry[0]);
                    now = entry[1].due;
                    entry[1].callback();
                }
                now = end;
            },
            count() { return pending.size; }
        };
    }
    async function flushPromises() {
        for (let index = 0; index < 12; index++) await Promise.resolve();
    }

    function mockStorage(initial) {
        const state = clone(initial || {});
        const writes = [];
        const api = {
            async get(keys) {
                await Promise.resolve();
                const requested = Array.isArray(keys) ? keys : [keys];
                const result = {};
                for (const key of requested) {
                    if (state[key] !== undefined) result[key] = clone(state[key]);
                }
                return result;
            },
            async set(values) {
                await Promise.resolve();
                Object.assign(state, clone(values));
                writes.push(clone(values));
            }
        };
        const ext = { storage: { local: api } };
        const { StorageUtil } = production("src/storage/class/StorageUtil.js", ["StorageUtil"], { ext, console: { log() {} } });
        StorageUtil.isBackground = true;
        return { state, writes, api, ext, StorageUtil };
    }

    test("storage awaits saves and preserves simultaneous tasks", async () => {
        const { state, StorageUtil } = mockStorage();
        await Promise.all([
            StorageUtil.saveData("assign_list", "assignId", { assignId: 11, assignName: "First", show: true }),
            StorageUtil.saveData("assign_list", "assignId", { assignId: 12, assignName: "Second", show: true }),
            StorageUtil.saveData("assign_list", "assignId", { assignId: 13, assignName: "Third", show: true })
        ]);
        equal(state.assign_list.map(item => item.assignId).sort(), [11, 12, 13]);
    });

    test("refresh preserves visibility, reviewed grades and completion", async () => {
        const { state, StorageUtil } = mockStorage({
            quiz_list: [{ quizId: 23, show: false, notified: true, maxp: 10, point: 0, status: "complete", quizName: "Old title" }]
        });
        await StorageUtil.saveData("quiz_list", "quizId", {
            quizId: 23, show: true, notified: false, maxp: null, point: null, status: "unknown", quizName: "New title"
        });
        const quiz = state.quiz_list[0];
        equal(state.quiz_list.length, 1);
        equal(quiz.show, false);
        equal(quiz.notified, undefined);
        equal(quiz.maxp, 10);
        equal(quiz.point, 0);
        equal(quiz.status, "complete");
        equal(quiz.quizName, "New title");
    });

    test("storage edit racing a refresh does not lose the user's preference", async () => {
        const { state, StorageUtil } = mockStorage({ assign_list: [{ assignId: 31, show: true, status: "incomplete", assignName: "Before" }] });
        await Promise.all([
            StorageUtil.editData("assign_list", "assignId", 31, "show", false),
            StorageUtil.saveData("assign_list", "assignId", { assignId: 31, show: true, status: "incomplete", assignName: "After" })
        ]);
        equal(state.assign_list[0].show, false);
        equal(state.assign_list[0].assignName, "After");
    });

    test("legacy reminder flags are removed and a fetched zero grade replaces an old grade", async () => {
        const { state, StorageUtil } = mockStorage({
            quiz_list: [{ quizId: 32, show: false, notified: true, due: "2026-10-10T12:00:00Z", point: 9 }]
        });
        await StorageUtil.saveData("quiz_list", "quizId", {
            quizId: 32, show: true, notified: true, due: "2026-10-11T12:00:00Z", point: 0
        });
        equal(state.quiz_list[0].show, false);
        equal(state.quiz_list[0].notified, undefined);
        equal(state.quiz_list[0].point, 0);
    });

    test("unknown deadlines lead the list while known deadlines stay in ascending order", async () => {
        const env = mockStorage({
            assign_list: [
                { group: 'assign_list', assignId: 1, due: '2099-02-01T00:00:00Z' },
                { group: 'assign_list', assignId: 2 },
                { group: 'assign_list', assignId: 3, due: '2020-01-01T00:00:00Z' },
                { group: 'assign_list', assignId: 4, due: 'unreadable' }
            ],
            quiz_list: [
                { group: 'quiz_list', quizId: 5, due: null },
                { group: 'quiz_list', quizId: 6, due: '2099-01-01T00:00:00Z' }
            ]
        });
        equal((await env.StorageUtil.getAllData()).map(item => item.assignId || item.quizId), [2, 4, 5, 3, 6, 1]);
    });

    test("a storage write failure rejects and does not poison later saves", async () => {
        const { state, api, StorageUtil } = mockStorage();
        const set = api.set;
        let failOnce = true;
        api.set = async values => {
            if (failOnce) {
                failOnce = false;
                throw new Error("Storage write denied");
            }
            return set(values);
        };
        await rejects(() => StorageUtil.saveData("assign_list", "assignId", { assignId: 41 }), /denied/);
        await StorageUtil.saveData("assign_list", "assignId", { assignId: 42 });
        equal(state.assign_list.map(item => item.assignId), [42]);
    });

    test("separate content tabs await mutations through one background storage queue", async () => {
        const env = mockStorage();
        const messages = [];
        env.ext.runtime = {
            async sendMessage(message) {
                messages.push(clone(message));
                if (message.type === "SAVE_TASK") await env.StorageUtil.saveData(message.table, message.idproperty, message.data);
                else if (message.type === "EDIT_TASK") await env.StorageUtil.editData(message.table, message.idproperty, message.id, message.property, message.value);
                return { ok: true };
            }
        };
        const tab1 = production("src/storage/class/StorageUtil.js", ["StorageUtil"], { ext: env.ext }).StorageUtil;
        const tab2 = production("src/storage/class/StorageUtil.js", ["StorageUtil"], { ext: env.ext }).StorageUtil;
        await Promise.all([
            tab1.saveData("assign_list", "assignId", { assignId: 51 }),
            tab2.saveData("assign_list", "assignId", { assignId: 52 })
        ]);
        await tab2.editData("assign_list", "assignId", 51, "show", false);
        equal(env.state.assign_list.map(item => item.assignId), [51, 52]);
        equal(env.state.assign_list[0].show, false);
        equal(messages.map(message => message.type), ["SAVE_TASK", "SAVE_TASK", "EDIT_TASK"]);
    });

    test("content tab reports a rejected background save", async () => {
        const { StorageUtil } = production("src/storage/class/StorageUtil.js", ["StorageUtil"], {
            ext: { runtime: { async sendMessage() { return { ok: false, error: "Background storage unavailable" }; } } }
        });
        await rejects(() => StorageUtil.saveData("assign_list", "assignId", { assignId: 61 }), /Background storage unavailable/);
    });

    test("review overview saves cannot overwrite a newer overview and preserve visibility", async () => {
        const old = { group: "quiz_list", quizId: 7, point: 5, count: 1, due: "2026-10-15", show: false, fetchedAt: 1000 };
        const env = mockStorage({ quiz_list: [old] });
        const latest = { ...old, point: 10, count: 2, due: "2026-10-20", fetchedAt: 2000 };
        await env.StorageUtil.saveData("quiz_list", "quizId", latest);
        await env.StorageUtil.saveQuizReviewOverview({ ...old, show: true, fetchedAt: 3000 }, 1000);
        equal(env.state.quiz_list, [latest], "A stale review must not roll back grades, dates, count or freshness");
        await env.StorageUtil.saveQuizReviewOverview({ ...latest, point: 8, show: true, fetchedAt: 4000 }, 2000);
        equal(env.state.quiz_list[0].point, 8, "The authoritative aggregate may decrease");
        equal(env.state.quiz_list[0].show, false);
        equal(env.state.quiz_list[0].fetchedAt, 4000);
        await rejects(() => env.StorageUtil.saveQuizReviewOverview({ ...latest }, undefined), /Invalid/);
        await env.StorageUtil.saveQuizReviewOverview({ group: "quiz_list", quizId: 8, fetchedAt: 5000 }, null);
        equal(env.state.quiz_list.map(item => item.quizId), [7, 8], "A direct review can discover a new quiz via its overview");
    });

    function scrapeBindings() {
        const utils = production("src/common/utils.js", ["extractDate"]);
        const { Scrape } = production("src/storage/class/scrape/Scrape.js", ["Scrape"], { ...utils, URL: URLClass });
        return { Scrape, extractDate: utils.extractDate, URL: URLClass, URLSearchParams: SearchParamsClass };
    }
    function taskDocument(type) {
        return {
            querySelector(selector) {
                if (selector === "h1") return { textContent: "Course from fetched document" };
                if (selector === "h2") return { textContent: type === "assign" ? "Fetched assignment" : "Fetched quiz" };
                return null;
            },
            querySelectorAll() { return []; },
            getElementsByTagName() { return []; }
        };
    }

    test("fetched assignment reads its task ID from the supplied URL", async () => {
        const { ScrapeAssign } = production("src/storage/class/scrape/ScrapeAssign.js", ["ScrapeAssign"], scrapeBindings());
        const item = ScrapeAssign.getData(taskDocument("assign"), "https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=481&forceview=1");
        equal(item.assignId, 481);
        equal(item.courseName, "Course from fetched document");
        equal(item.assignName, "Fetched assignment");
        assert(Number.isFinite(item.fetchedAt), "Full detail reads advance freshness");
    });

    test("fetched quiz reads its task ID from the supplied URL", async () => {
        const { ScrapeQuiz } = production("src/storage/class/scrape/ScrapeQuiz.js", ["ScrapeQuiz"], scrapeBindings());
        const item = ScrapeQuiz.getData(taskDocument("quiz"), "https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?forceview=1&id=592");
        equal(item.quizId, 592);
        equal(item.courseName, "Course from fetched document");
        equal(item.quizName, "Fetched quiz");
        assert(Number.isFinite(item.fetchedAt), "Full detail reads advance freshness");
    });

    test("full detail reads discover course ID from body or Moodle breadcrumbs", async () => {
        const bindings = scrapeBindings();
        const { ScrapeAssign } = production("src/storage/class/scrape/ScrapeAssign.js", ["ScrapeAssign"], bindings);
        const { ScrapeQuiz } = production("src/storage/class/scrape/ScrapeQuiz.js", ["ScrapeQuiz"], bindings);
        const assignment = taskDocument("assign");
        assignment.body = { className: "path-mod-assign course-615 context-123" };
        const before = Date.now();
        const first = ScrapeAssign.getData(assignment, "https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=481");
        equal(first.courseId, 615);
        assert(first.fetchedAt >= before && first.fetchedAt <= Date.now());
        const quiz = taskDocument("quiz");
        quiz.querySelectorAll = selector => selector.startsWith("#page-navbar") ? [
            { getAttribute() { return "https://example.com/moodle40a/course/view.php?id=999"; } },
            { getAttribute() { return "../../course/view.php?id=616"; } }
        ] : [];
        const second = ScrapeQuiz.getData(quiz, "https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?id=592");
        equal(second.courseId, 616);
        assert(second.fetchedAt >= before && second.fetchedAt <= Date.now());
    });

    test("review grades remain attempt data and never become a stored task snapshot", async () => {
        for (const grade of ["8 / 10", "成績は非公開です"]) {
            const doc = {
                querySelector() { return null; },
                querySelectorAll(selector) {
                    return selector === "table.quizreviewsummary tr" ? [{
                        querySelector(tag) { return { textContent: tag === "th" ? "評点" : grade }; }
                    }] : [];
                }
            };
            const { ScrapeQuizReview } = production("src/storage/class/scrape/ScrapeQuizReview.js", ["ScrapeQuizReview"], scrapeBindings());
            const review = ScrapeQuizReview.getData(doc, "https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/review.php?cmid=63");
            equal(review, { quizId: 63, attemptPoint: grade === "8 / 10" ? 8 : null,
                attemptMaxp: grade === "8 / 10" ? 10 : null });
            assert(!("status" in review) && !("fetchedAt" in review), "An attempt cannot claim aggregate status or full-detail freshness");
        }
    });

    const moodle = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    function courseDocument(links, options) {
        options = options || {};
        return {
            querySelector(selector) {
                if (selector === "h1") return options.noHeading ? null : { textContent: "Course" };
                if (selector.includes("login") && options.login) return {};
                if (selector.includes("errorcode") && options.denied) return {};
                return null;
            },
            querySelectorAll(selector) {
                return selector.includes('a[href') ? links.map(href => ({ getAttribute(name) { return name === "href" ? href : null; } })) : [];
            }
        };
    }
    function collectorEnvironment(routes, onProgress, concurrency = 2, api = false) {
        const storage = mockStorage();
        const timers = mockTimers();
        const bindings = scrapeBindings();
        const { ScrapeAssign } = production("src/storage/class/scrape/ScrapeAssign.js", ["ScrapeAssign"], bindings);
        const { ScrapeQuiz } = production("src/storage/class/scrape/ScrapeQuiz.js", ["ScrapeQuiz"], bindings);
        const { CourseCollector } = production("src/storage/class/CourseCollector.js", ["CourseCollector"], {
            URL: URLClass, AbortController: TestAbortController, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
            ScrapeAssign, ScrapeQuiz, StorageUtil: storage.StorageUtil,
            AutoRefreshCollector: { findSesskey: () => api ? 'testsession' : null }
        });
        // Exercise both the production worker limit and serial comparisons.
        CourseCollector.courseConcurrency = concurrency;
        const requests = [];
        const collector = new CourseCollector({
            async fetch(url, options) {
                requests.push({ url, options });
                const response = routes[url.slice(moodle.length)];
                if (!response) throw new Error("Unexpected request: " + url);
                if (response.error) throw response.error;
                if (response.hang) {
                    return new Promise((resolve, reject) => {
                        if (options.signal.aborted) reject(new Error("Aborted request"));
                        else options.signal.addEventListener("abort", () => reject(new Error("Aborted request")));
                    });
                }
                return {
                    ok: response.ok !== false,
                    status: response.status || 200,
                    url: response.url || url,
                    headers: { get(name) { return name === 'Date' ? response.date || null : null; } },
                    async text() { return response.payload === undefined ? url.slice(moodle.length) : JSON.stringify(response.payload); }
                };
            },
            parse(html) { return routes[html].doc; },
            onProgress: onProgress || (() => {})
        });
        return { ...storage, timers, collector, CourseCollector, requests };
    }

    const stateRoute = 'lib/ajax/service.php?sesskey=testsession&info=core_courseformat_get_state&nosessionupdate=true';
    const updatesRoute = 'lib/ajax/service.php?sesskey=testsession&info=core_course_get_updates_since&nosessionupdate=true';
    function apiState(courseId = 1) {
        return { course: { id: String(courseId) }, section: [{ id: '100', visible: true, cmlist: ['10', '20', '21'] }],
            cm: [10, 20, 21].map(id => ({ id: String(id), sectionid: '100', visible: true,
                uservisible: id !== 21, accessvisible: false,
                url: moodle + `mod/${id === 10 ? 'assign' : 'quiz'}/view.php?id=${id}` })) };
    }
    function deltaEnvironment(updates = { instances: [], warnings: [] }) {
        const date = 'Sun, 18 Oct 2026 00:00:00 GMT';
        const env = collectorEnvironment({
            [stateRoute]: { date, payload: [{ data: JSON.stringify(apiState()) }] },
            [updatesRoute]: { payload: [{ data: updates }] },
            'mod/assign/view.php?id=10': { doc: taskDocument('assign') },
            'mod/quiz/view.php?id=20': { doc: taskDocument('quiz') }
        }, null, 1, true);
        const since = Math.floor(Date.parse(date) / 1000) - 3600;
        env.state.courseAvailability = { 1: { complete: true, detailsCheckedSince: since,
            items: { 'assign:10': true, 'quiz:20': true, 'quiz:21': true } } };
        env.state.assign_list = [{ group: 'assign_list', courseId: 1, assignId: 10, fetchedAt: 123, status: 'incomplete', show: false }];
        env.state.quiz_list = [{ group: 'quiz_list', courseId: 1, quizId: 20, fetchedAt: 123, status: 'complete' }];
        return { ...env, since };
    }
    test('API inventory rejects subsequently discovered tasks absent from the course', async () => {
        const env = deltaEnvironment();
        env.state.courseAvailability[1].items['quiz:99'] = true;
        await env.collector.run([1]);
        for (const id of [98, 99]) {
            const task = { group: 'quiz_list', courseId: 1, quizId: id, status: 'incomplete' };
            assert(!env.StorageUtil.taskAvailable(task, env.state.courseAvailability), 'Unlisted task must stay excluded');
            await env.StorageUtil.saveData('quiz_list', 'quizId', task);
            assert(!env.state.quiz_list.some(item => item.quizId === id));
        }
    });
    test('unknown detail readings retry even when the previous complete display is retained', async () => {
        const env = deltaEnvironment();
        await env.StorageUtil.saveData('quiz_list', 'quizId', {
            group: 'quiz_list', courseId: 1, quizId: 20, fetchedAt: 456, status: 'unknown'
        });
        equal(env.state.quiz_list[0].status, 'complete');
        const result = await env.collector.run([1]);
        equal(result.saved, 1, 'Unknown acquisition must be retried');
        assert(env.requests.some(request => request.url.endsWith('quiz/view.php?id=20')));
        await env.StorageUtil.saveData('quiz_list', 'quizId', {
            group: 'quiz_list', courseId: 1, quizId: 20, fetchedAt: 789, status: 'complete'
        });
        equal((await env.collector.run([1])).skipped, 2, 'A known reading clears retry state');
    });
    test('a page observing a released task invalidates the previous detail baseline', async () => {
        const env = deltaEnvironment();
        env.state.courseAvailability[1].items['quiz:20'] = false;
        await env.StorageUtil.setCourseAvailability(1, [{ type: 'quiz', id: 20, available: true }]);
        const result = await env.collector.run([1]);
        assert(result.saved >= 1);
        assert(env.requests.some(request => request.url.endsWith('quiz/view.php?id=20')));
    });
    test('unchanged tasks skip details while availability and server checkpoints are refreshed', async () => {
        const env = deltaEnvironment();
        const before = clone(env.state.assign_list);
        const result = await env.collector.run([1]);
        equal({ saved: result.saved, skipped: result.skipped, failed: result.failed }, { saved: 0, skipped: 2, failed: 0 });
        equal(env.requests.length, 2);
        equal(env.state.assign_list, before, 'Skipped detail freshness and user preferences stay unchanged');
        equal(env.state.courseAvailability[1].items['quiz:21'], false, 'Availability is always checked');
        assert(env.state.courseAvailability[1].detailsCheckedSince > env.since);
        assert(env.state.courseAvailability[1].detailsCheckedSince < Date.parse('Sun, 18 Oct 2026 00:00:00 GMT') / 1000);
        equal(JSON.parse(env.requests[1].options.body)[0].args, { courseid: 1, since: env.since });
        equal(env.collector.timings.skippedTasks, 2);
        assert(env.collector.timings.requests[1].path.endsWith('info=core_course_get_updates_since'));
        assert(!JSON.stringify(env.collector.timings).includes('testsession'));
    });
    test('only changed available tasks are fetched; unavailable update reports never enable a task', async () => {
        const env = deltaEnvironment({ instances: [10, 21].map(id => ({ contextlevel: 'module', id,
            updates: [{ name: 'submissions', itemids: [123] }] })), warnings: [] });
        const result = await env.collector.run([1]);
        equal(result.saved, 1);
        equal(result.skipped, 1);
        equal(env.requests.length, 3);
        assert(env.requests[2].url.endsWith('assign/view.php?id=10'));
        equal(env.state.assign_list[0].show, false);
    });
    test('first run performs full details and establishes a checkpoint for the next run', async () => {
        const env = deltaEnvironment();
        delete env.state.courseAvailability[1].detailsCheckedSince;
        const first = await env.collector.run([1]);
        equal(first.saved, 2);
        assert(env.requests.every(request => !request.url.includes('get_updates_since')));
        // The fixture freezes HTTP Date; leave room for per-request latency rounding.
        env.state.courseAvailability[1].detailsCheckedSince -= 2;
        const second = await env.collector.run([1]);
        // The parser fixture may produce unknown statuses; make the cache known
        // below in the other tests. First-run behavior must never assume a baseline.
        assert(second.courses === 1 && env.requests.some(request => request.url.includes('get_updates_since')));
    });
    test('new, newly released, unknown and time-transitioned tasks are read despite no updates', async () => {
        for (const prepare of [
            env => env.state.assign_list = [],
            env => env.state.courseAvailability[1].items['assign:10'] = false,
            env => env.state.assign_list[0].status = 'unknown',
            env => env.state.assign_list[0].status = 'unvisited',
            env => env.state.assign_list[0].status = 'unexpected',
            env => env.state.assign_list[0].fetchedAt = 0,
            env => env.state.assign_list[0].due = new Date((env.since + 5) * 1000).toISOString()
        ]) {
            const env = deltaEnvironment(); prepare(env);
            const result = await env.collector.run([1]);
            equal(result.saved, 1);
            equal(result.skipped, 1);
            equal(env.requests.length, 3);
        }
    });
    test('warning, malformed, unsupported and transport failures use full details instead', async () => {
        for (const response of [
            { payload: [{ data: { instances: [], warnings: [{ warningcode: 'missingmodule' }] } }] },
            { payload: [{ data: { instances: 'broken', warnings: [] } }] },
            { payload: [{ error: true, exception: { errorcode: 'invalidrecord' } }] },
            { error: new Error('Network failed') }
        ]) {
            const env = deltaEnvironment();
            const fetch = env.collector.fetch;
            env.collector.fetch = async (url, options) => {
                if (!url.includes('core_course_get_updates_since')) return fetch(url, options);
                env.requests.push({ url, options });
                if (response.error instanceof Error) throw response.error;
                return { ok: true, status: 200, url, text: async () => JSON.stringify(response.payload) };
            };
            const result = await env.collector.run([1]);
            equal(result.saved, 2);
            equal(result.skipped, 0);
        }
    });
    test('missing server time and clock rollback disable differential reads', async () => {
        for (const mode of ['missing', 'future']) {
            const env = deltaEnvironment();
            if (mode === 'future') env.state.courseAvailability[1].detailsCheckedSince += 86400;
            else {
                const fetch = env.collector.fetch;
                env.collector.fetch = async (...args) => { const response = await fetch(...args); delete response.headers; return response; };
            }
            equal((await env.collector.run([1])).saved, 2);
            assert(env.requests.every(request => !request.url.includes('get_updates_since')));
        }
    });
    test('partial detail failures do not advance the previous checkpoint', async () => {
        const env = deltaEnvironment({ instances: [{ contextlevel: 'module', id: 10, updates: [{ name: 'configuration' }] }], warnings: [] });
        const fetch = env.collector.fetch;
        env.collector.fetch = async (url, options) => {
            if (url.endsWith('assign/view.php?id=10')) throw new Error('Task failed');
            return fetch(url, options);
        };
        equal((await env.collector.run([1])).failed, 1);
        equal(env.state.courseAvailability[1].detailsCheckedSince, env.since);
    });
    test('course state replaces course/index HTML and excludes restricted and omitted cached tasks', async () => {
        const env = collectorEnvironment({
            [stateRoute]: { payload: [{ data: JSON.stringify(apiState()) }] },
            'mod/assign/view.php?id=10': { doc: taskDocument('assign') },
            'mod/quiz/view.php?id=20': { doc: taskDocument('quiz') }
        }, null, 2, true);
        env.state.quiz_list = [{ group: 'quiz_list', quizId: 99, courseId: 1 }];
        const result = await env.collector.run([1]);
        equal(result.saved, 2);
        equal(env.requests.length, 3);
        equal(env.state.courseAvailability[1].items['quiz:21'], false);
        equal(env.state.courseAvailability[1].items['quiz:99'], false);
        assert(!JSON.stringify(env.collector.timings).includes('testsession'));
        assert(!JSON.stringify(env.collector.timings).includes('sesskey'));
        equal(JSON.parse(env.requests[0].options.body)[0].args, { courseid: 1 });
        equal(env.requests[0].options.method, 'POST');
        equal(env.timers.count(), 0);
    });
    test('course state validates schema, IDs, parent availability and current-user permission', () => {
        const { CourseCollector } = collectorEnvironment({});
        const state = apiState();
        state.section[0].visible = false;
        assert(CourseCollector.stateAvailability(state, 1).every(item => !item.available));
        for (const change of [
            state => state.course.id = '2',
            state => delete state.cm[0].uservisible,
            state => state.cm[0].url = 'https://example.com/mod/assign/view.php?id=10',
            state => state.cm[0].url = moodle + 'mod/assign/view.php?id=999',
            state => state.section[0].cmlist.push('999'),
            state => state.cm.push(state.cm[0])
        ]) {
            const invalid = apiState(); change(invalid);
            let failed = false;
            try { CourseCollector.stateAvailability(invalid, 1); } catch { failed = true; }
            assert(failed, 'Unknown or inconsistent state must fall back to HTML');
        }
    });
    test('normal URL-less activities do not force a whole course back to HTML', async () => {
        const state = apiState();
        for (const [index, url] of [undefined, null, ''].entries()) {
            const id = String(30 + index);
            state.cm.push({ id, sectionid: '100', visible: true, uservisible: true, url });
            state.section[0].cmlist.push(id);
        }
        const env = collectorEnvironment({
            [stateRoute]: { payload: [{ data: JSON.stringify(state) }] },
            'mod/assign/view.php?id=10': { doc: taskDocument('assign') },
            'mod/quiz/view.php?id=20': { doc: taskDocument('quiz') }
        }, null, 1, true);
        equal((await env.collector.run([1])).saved, 2);
        equal(env.requests.length, 3, 'No root HTML or index requests for normal URL-less modules');
        assert(!env.collector.timings.courses[0].stateFallback);
    });
    test('unsupported, malformed or mismatched API responses fall back to HTML', async () => {
        for (const payload of [[{ error: true, exception: { errorcode: 'invalidrecord' } }],
            [{ data: '{broken' }], [{ data: apiState(2) }]]) {
            const env = collectorEnvironment({ [stateRoute]: { payload },
                'course/view.php?id=1': { doc: courseDocument([]) } }, null, 2, true);
            equal((await env.collector.run([1])).courses, 1);
            equal(env.requests.length, 2);
            assert(typeof env.collector.timings.courses[0].stateFallback === 'string');
            assert(!JSON.stringify(env.collector.timings).includes('testsession'));
        }
    });
    test('API authentication and rate/server failures stop without HTML retry', async () => {
        for (const response of [{ payload: [{ error: true, exception: { errorcode: 'invalidsesskey' } }] },
            { ok: false, status: 429 }, { ok: false, status: 503 }]) {
            const env = collectorEnvironment({ [stateRoute]: response }, null, 2, true);
            await rejects(() => env.collector.run([1]));
            equal(env.requests.length, 1);
            equal(env.timers.count(), 0);
        }
    });
    test('two course API requests share the worker limit and cancel without HTML retries', async () => {
        const env = collectorEnvironment({ [stateRoute]: { hang: true } }, null, 2, true);
        const controller = new TestAbortController();
        env.collector.signal = controller.signal;
        const pending = env.collector.run([1, 2, 3]);
        for (let attempt = 0; attempt < 100 && env.requests.length < 2; attempt++) await flushPromises();
        equal(env.requests.length, 2);
        equal(env.collector.timings.peakRequests, 2);
        controller.abort();
        await rejects(() => pending, /中断/);
        equal(env.requests.length, 2);
        equal(env.timers.count(), 0);
    });

    test("collector normalizes course IDs and collects each activity once", async () => {
        const progress = [];
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([
                "../mod/assign/view.php?id=10&forceview=1",
                "/moodle40a/mod/assign/view.php?forceview=1&id=10",
                "/moodle40a/mod/quiz/view.php?id=20"
            ]) },
            "course/view.php?id=2": { doc: courseDocument([
                "/moodle40a/mod/assign/view.php?id=10",
                "/moodle40a/mod/assign/view.php?id=11"
            ]) },
            "mod/assign/view.php?id=10": { doc: taskDocument("assign") },
            "mod/assign/view.php?id=11": { doc: taskDocument("assign") },
            "mod/quiz/view.php?id=20": { doc: taskDocument("quiz") }
        }, value => progress.push(clone(value)));
        const result = await env.collector.run([1, "1", 2, null, -1, "bad", 0]);
        equal({ courses: result.courses, saved: result.saved, failed: result.failed }, { courses: 2, saved: 3, failed: 0 });
        equal(env.requests.length, 5);
        equal(env.state.assign_list.map(item => item.assignId).sort(), [10, 11]);
        equal(env.state.quiz_list.map(item => item.quizId), [20]);
        assert(env.requests.every(request => request.options.credentials === "include"), "Authenticated cookies must be included");
        assert(env.requests.every(request => request.options.signal), "Fetches must have cancellation signals");
        equal(progress[progress.length - 1].saved, 3);
        equal(progress[progress.length - 1].totalCourses, 2);
        equal(env.timers.count(), 0, "Successful fetch timers are removed");
    });

    test("collector excludes activities outside Moodle and invalid IDs", async () => {
        const env = collectorEnvironment({});
        const doc = courseDocument([
            "/moodle40a/mod/assign/view.php?id=71",
            "/moodle40a/mod/assign/view.php?id=71&duplicate=true",
            "/moodle40a/mod/quiz/view.php?id=71",
            "https://example.com/moodle40a/mod/assign/view.php?id=72",
            "/other/mod/assign/view.php?id=73",
            "/moodle40a/mod/assign/view.php?id=-1",
            "/moodle40a/mod/assign/view.php?id=12oops",
            "/moodle40a/mod/assign/view.php"
        ]);
        equal(env.CourseCollector.getItems(doc, moodle + "course/view.php?id=1"), [{ type: "assign", id: 71 }, { type: "quiz", id: 71 }]);
    });

    test("availability hides cached tasks without deleting user preferences and blocks direct saves", async () => {
        const hidden = { group: "quiz_list", quizId: 22, courseId: 1, status: "qualify", show: false, fetchedAt: 10 };
        const env = mockStorage({ assign_list: [
            { group: "assign_list", assignId: 11, courseId: 1, show: true },
            { group: "assign_list", assignId: 12, courseId: 1, show: true },
            { group: "assign_list", assignId: 13, courseId: 2, show: true }
        ], quiz_list: [hidden] });
        await env.StorageUtil.setCourseAvailability(1, [{ type: "quiz", id: 22, available: false }]);
        assert(!env.StorageUtil.taskAvailable({ group: "quiz_list", quizId: 22 }, env.state.courseAvailability), "Old records without a course ID still respect explicit module restrictions");
        equal((await env.StorageUtil.getAllData()).map(item => item.assignId || item.quizId).sort(), [11, 12, 13]);
        await env.StorageUtil.saveData("quiz_list", "quizId", { ...hidden, show: true, status: "incomplete", fetchedAt: 20 });
        equal(env.state.quiz_list, [hidden]);
        await env.StorageUtil.saveData("quiz_list", "quizId", { group: "quiz_list", quizId: 22, fetchedAt: 30 });
        equal(env.state.quiz_list, [hidden], "A missing course ID cannot bypass a known restriction");
        await env.StorageUtil.setCourseAvailability(1, [{ type: "assign", id: 11, available: true }], true);
        equal((await env.StorageUtil.getAllData()).map(item => item.assignId || item.quizId).sort(), [11, 12, 13], "A missing link cannot hide an otherwise available cached task");
        equal(env.state.assign_list.length, 3, "Unavailable records are retained for later release");
        await env.StorageUtil.saveData("assign_list", "assignId", { group: "assign_list", assignId: 99, courseId: 1 });
        equal(env.state.assign_list.length, 4, "An unlisted URL is not an explicit denial");
        await env.StorageUtil.setCourseAvailability(1, [{ type: "quiz", id: 22, available: true }]);
        equal((await env.StorageUtil.getAllData()).map(item => item.assignId || item.quizId).sort(), [11, 12, 13, 22, 99]);
        equal(env.state.quiz_list, [hidden], "Release preserves the user's hidden/completion settings");
    });

    test("verified enrolment removes departed-course tasks, preserves preferences and supports rejoining", async () => {
        const old = { group: "quiz_list", quizId: 71, courseId: 9, show: false, status: "qualify" };
        const env = mockStorage({ quiz_list: [old, { group: "quiz_list", quizId: 72 }],
            assign_list: [{ group: "assign_list", assignId: 31, courseId: 4 }], courseIds: [4],
            courseAvailability: { 9: { items: { "quiz:72": true } } } });
        equal((await env.StorageUtil.getAllData()).length, 3, "Legacy/partial course IDs must not remove saved tasks");
        await env.api.set({ enrolledCourseIds: [4] });
        equal((await env.StorageUtil.getAllData()).map(item => item.assignId || item.quizId), [31],
            "Both task course IDs and older module-to-course observations respect confirmed membership");
        equal((await env.StorageUtil.getAllData({ includeUnavailable: true })).length, 3);
        equal(env.state.quiz_list[0], old, "Exclusion does not erase personal settings");
        await env.StorageUtil.setCourseAvailability(9, [{ type: "quiz", id: 71, available: true }]);
        equal((await env.StorageUtil.getAllData()).length, 1, "An accessible old URL cannot restore membership");
        await env.api.set({ enrolledCourseIds: [] });
        equal(await env.StorageUtil.getAllData(), [], "A confirmed empty membership is authoritative");
        await env.api.set({ enrolledCourseIds: [4, 9] });
        equal((await env.StorageUtil.getAllData()).find(item => item.quizId === 71), old,
            "Rejoining restores the task and its preferences");
    });

    test("legacy empty complete snapshots do not hide or prevent updating normal cached tasks", async () => {
        const task = { group: "assign_list", assignId: 11, courseId: 1, show: true, status: "incomplete" };
        const env = mockStorage({ assign_list: [task], quiz_list: [],
            courseAvailability: { 1: { items: {}, complete: true } } });
        equal(await env.StorageUtil.getAllData(), [task], "Existing snapshots recover without clearing personal data");
        await env.StorageUtil.saveData("assign_list", "assignId", { ...task, assignName: "Updated" });
        equal((await env.StorageUtil.getAllData())[0].assignName, "Updated");
        await env.StorageUtil.setCourseAvailability(1, [], true);
        equal((await env.StorageUtil.getAllData()).length, 1, "An empty scan must not empty the task list");
    });

    test("multipage courses visit same-course sections once and collect their activities", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([
                "view.php?id=1&section=1&sesskey=do-not-forward#title", "view.php?section=1&id=1",
                "view.php?id=2&section=3", "https://example.org/moodle40a/course/view.php?id=1&section=2",
                "view.php?id=1&section=-1", "view.php?id=1&section=abc"
            ]) },
            "course/view.php?id=1&section=1": { doc: courseDocument([
                "view.php?id=1&section=1", "view.php?id=1&section=2", "../mod/assign/view.php?id=10"
            ]) },
            "course/view.php?id=1&section=2": { doc: courseDocument([
                "view.php?id=1&section=1", "../mod/assign/view.php?id=10", "../mod/quiz/view.php?id=20"
            ]) },
            "mod/assign/view.php?id=10": { doc: taskDocument("assign") },
            "mod/quiz/view.php?id=20": { doc: taskDocument("quiz") }
        });
        const result = await env.collector.run([1]);
        equal([result.courses, result.saved, result.failed], [1, 2, 0]);
        equal(env.requests.length, 5);
        assert(env.requests.every(item => !item.url.includes("sesskey")));
        const failed = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument(["view.php?id=1&section=1"]) },
            "course/view.php?id=1&section=1": { ok: false, status: 404 }
        });
        const partial = await failed.collector.run([1]);
        equal([partial.courses, partial.saved, partial.failed], [0, 0, 1]);
    });

    test("multipage course discovery is bounded and never reports truncated coverage as success", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument(Array.from({ length: 201 }, (_, section) => `view.php?id=1&section=${section}`)) }
        });
        const result = await env.collector.run([1]);
        equal([result.courses, result.failed], [0, 1]);
        equal(env.requests.length, 1);
    });

    test("collector reports task and course failures while saving available tasks", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([
                "/moodle40a/mod/assign/view.php?id=81",
                "/moodle40a/mod/quiz/view.php?id=82",
                "/moodle40a/mod/assign/view.php?id=83"
            ]) },
            "course/view.php?id=2": { ok: false, status: 404 },
            "mod/assign/view.php?id=81": { ok: false, status: 400 },
            "mod/quiz/view.php?id=82": { doc: taskDocument("quiz") },
            "mod/assign/view.php?id=83": { error: new Error("Network offline") }
        });
        const result = await env.collector.run([1, 2]);
        equal({ courses: result.courses, saved: result.saved, failed: result.failed }, { courses: 1, saved: 1, failed: 3 });
        equal(result.errors.length, 3);
        assert(result.errors.some(error => error.message.includes("400")));
        assert(result.errors.some(error => error.message.includes("404")));
        assert(result.errors.some(error => error.message.includes("Network offline")));
        equal(env.state.quiz_list[0].quizId, 82);
        equal(env.timers.count(), 0);
    });

    test("collector rejects login redirects, external redirects and login forms", async () => {
        for (const response of [{ url: moodle + "login/index.php" },
            { url: "https://sso.example.com/login" }, { doc: courseDocument([], { login: true }) }]) {
            const env = collectorEnvironment({ "course/view.php?id=1": response, "course/view.php?id=2": { hang: true } });
            await rejects(() => env.collector.run([1, 2, 3]), /ログイン/);
            equal(env.requests.length, 2, "Authentication failure stops both active courses without starting the third");
            equal(env.writes.length, 0);
            equal(env.timers.count(), 0);
        }
    });

    test("collector stops immediately on access, rate-limit and server failures", async () => {
        for (const status of [401, 403, 429, 503]) {
            const env = collectorEnvironment({ "course/view.php?id=1": { ok: false, status }, "course/view.php?id=2": { hang: true } });
            await rejects(() => env.collector.run([1, 2, 3]), /HTTP/);
            equal(env.requests.length, 2);
            equal(env.writes.length, 0);
            equal(env.timers.count(), 0);
        }
    });

    test("two different courses overlap, refill independently, and keep all requests bounded to two", async () => {
        const paths = ["mod/assign/view.php?id=91", "mod/quiz/view.php?id=92", "mod/assign/view.php?id=93", "mod/quiz/view.php?id=94"];
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([moodle + paths[0], moodle + "course/view.php?id=1&section=1"]) },
            "course/view.php?id=1&section=1": { doc: courseDocument([moodle + paths[1]]) },
            "course/view.php?id=2": { doc: courseDocument([moodle + paths[2]]) },
            "course/view.php?id=3": { doc: courseDocument([moodle + paths[3]]) },
            ...Object.fromEntries(paths.map(path => [path, { doc: taskDocument(path.includes("quiz") ? "quiz" : "assign") }]))
        });
        const releases = new Map(), started = [];
        let active = 0, peak = 0;
        const fetch = env.collector.fetch;
        env.collector.fetch = (url, options) => {
            const response = fetch(url, options);
            const key = url.slice(moodle.length);
            started.push(key);
            peak = Math.max(peak, ++active);
            return new Promise(resolve => releases.set(key, () => { active--; resolve(response); }));
        };
        const waitFor = async predicate => {
            for (let attempt = 0; attempt < 100 && !predicate(); attempt++) await flushPromises();
            assert(predicate(), "Expected collection progress");
        };
        const running = env.collector.run([1, 2, 3]);
        await waitFor(() => releases.has("course/view.php?id=2"));
        equal(started, ["course/view.php?id=1", "course/view.php?id=2"], "Different course pages start together");
        releases.get("course/view.php?id=1")();
        await waitFor(() => releases.has(paths[0]));
        releases.get("course/view.php?id=2")();
        await waitFor(() => releases.has(paths[2]));
        releases.get(paths[2])();
        await waitFor(() => releases.has("course/view.php?id=3"));
        assert(!releases.has(paths[1]), "Details within a course remain sequential");
        releases.get("course/view.php?id=3")();
        await waitFor(() => releases.has(paths[3]));
        releases.get(paths[3])();
        releases.get(paths[0])();
        await waitFor(() => releases.has("course/view.php?id=1&section=1"));
        releases.get("course/view.php?id=1&section=1")();
        await waitFor(() => releases.has(paths[1]));
        releases.get(paths[1])();
        const result = await running;
        equal([result.courses, result.saved, result.failed], [3, 4, 0]);
        equal(peak, 2, "Concurrency never exceeds two");
        equal(env.collector.timings.peakRequests, 2, "Diagnostics measure actual in-flight requests");
        equal(env.collector.timings.requests.length, 8);
        equal(env.requests.length, 8, "Every course, section and detail is requested exactly once");
        equal(new Set(started).size, 8, "Neither worker duplicates another worker's requests");
        equal(env.state.assign_list.map(task => task.assignId).sort(), [91, 93]);
        equal(env.state.quiz_list.map(task => task.quizId).sort(), [92, 94]);
        equal(Object.keys(env.state.courseAvailability).sort(), ["1", "2", "3"], "Parallel courses cannot overwrite each other's availability");
        equal(env.state.assign_list.find(task => task.assignId === 93).courseId, 2);
        equal(env.timers.count(), 0);
    });

    test("one-worker comparison visits each course and task once without overlap", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([moodle + "mod/assign/view.php?id=91"]) },
            "course/view.php?id=2": { doc: courseDocument([moodle + "mod/quiz/view.php?id=92"]) },
            "mod/assign/view.php?id=91": { doc: taskDocument("assign") },
            "mod/quiz/view.php?id=92": { doc: taskDocument("quiz") }
        }, undefined, 1);
        const result = await env.collector.run([1, 2]);
        equal([result.courses, result.saved, result.failed], [2, 2, 0]);
        equal(env.requests.map(request => request.url.slice(moodle.length)), [
            "course/view.php?id=1", "mod/assign/view.php?id=91", "course/view.php?id=2", "mod/quiz/view.php?id=92"
        ]);
        equal(env.collector.timings.version, "courses-1-v1");
        equal(env.collector.timings.concurrency, 1);
        equal(env.collector.timings.peakRequests, 1);
        equal(env.collector.timings.networkOverlapMs, 0);
    });

    test("refresh timing separates headers, body, parsing and storage without adding requests", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([moodle + "mod/assign/view.php?id=91"]) },
            "mod/assign/view.php?id=91": { doc: taskDocument("assign") }
        });
        let clock = 0;
        env.collector.now = () => clock;
        env.collector.onProgress = () => { clock++; };
        const fetch = env.collector.fetch, parse = env.collector.parse, save = env.StorageUtil.saveData;
        env.collector.fetch = async (url, options) => {
            clock += 5;
            const response = await fetch(url, options);
            return { ...response, text: async () => { clock += 3; return response.text(); } };
        };
        env.collector.parse = html => { clock += 2; return parse(html); };
        env.StorageUtil.saveData = async (...args) => { clock += 7; return save.apply(env.StorageUtil, args); };
        const result = await env.collector.run([1]);
        const timing = env.collector.timings;
        equal(result.saved, 1);
        equal(env.requests.length, 2);
        equal(timing.totalMs, 30);
        equal(timing.networkActiveMs, 16);
        equal(timing.networkOverlapMs, 0);
        equal(timing.storageMs, 7);
        equal(timing.progressMs, 2);
        equal(timing.peakRequests, 1);
        assert(timing.requests.every(request => request.headersMs === 5 && request.bodyMs === 3 && request.parseMs === 2));
        assert(timing.requests.every(request => request.courseId === 1 && !request.failed));
        assert(!JSON.stringify(timing).includes("sesskey"));
        equal(env.collector.profiling, false);
    });

    test("a terminal failure aborts the other course and prevents another course or task save", async () => {
        for (const failure of [{ ok: false, status: 401 }, { ok: false, status: 429 }, { ok: false, status: 503 },
            { url: moodle + "login/index.php" }]) {
            const env = collectorEnvironment({
                "course/view.php?id=1": { doc: courseDocument([moodle + "mod/assign/view.php?id=91"]) },
                "course/view.php?id=2": { doc: courseDocument([moodle + "mod/assign/view.php?id=92"]) },
                "mod/assign/view.php?id=91": { hang: true },
                "mod/assign/view.php?id=92": failure,
                "mod/assign/view.php?id=93": { doc: taskDocument("assign") }
            });
            await rejects(() => env.collector.run([1, 2, 3]), /HTTP|ログイン/);
            equal(env.requests.length, 4, "Only two course pages and their first tasks were requested");
            assert(env.requests.find(request => request.url.endsWith("id=91")).options.signal.aborted, "The other course's pending detail is aborted");
            equal(env.writes.filter(write => "assign_list" in write || "quiz_list" in write).length, 0);
            equal(env.timers.count(), 0);
        }
    });

    test("a different account in either parallel response prevents all task saves", async () => {
        const foreign = taskDocument("quiz");
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([moodle + "mod/assign/view.php?id=91"]) },
            "course/view.php?id=2": { doc: courseDocument([moodle + "mod/quiz/view.php?id=92"]) },
            "mod/assign/view.php?id=91": { hang: true }, "mod/quiz/view.php?id=92": { doc: foreign }
        });
        const previous = globalThis.duedleAssertAccountDocument;
        globalThis.duedleAssertAccountDocument = doc => {
            if (doc === foreign) throw Object.assign(new Error("Account changed"), { code: "AUTH_REQUIRED" });
        };
        try {
            await rejects(() => env.collector.run([1, 2, 3]), /Account changed/);
            assert(env.requests.find(request => request.url.endsWith("id=91")).options.signal.aborted);
            equal(env.writes.filter(write => "assign_list" in write || "quiz_list" in write).length, 0);
            equal(env.timers.count(), 0);
        } finally {
            if (previous) globalThis.duedleAssertAccountDocument = previous;
            else delete globalThis.duedleAssertAccountDocument;
        }
    });

    test("external cancellation stops both courses without starting another course", async () => {
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([moodle + "mod/assign/view.php?id=91"]) },
            "course/view.php?id=2": { doc: courseDocument([moodle + "mod/assign/view.php?id=92"]) },
            "mod/assign/view.php?id=91": { hang: true }, "mod/assign/view.php?id=92": { hang: true },
            "mod/assign/view.php?id=93": { doc: taskDocument("assign") }
        });
        const controller = new TestAbortController();
        env.collector.signal = controller.signal;
        const running = env.collector.run([1, 2, 3]);
        for (let attempt = 0; attempt < 100 && env.requests.length < 4; attempt++) await flushPromises();
        equal(env.requests.length, 4);
        controller.abort();
        await rejects(() => running, /中断/);
        assert(env.requests.slice(2).every(request => request.options.signal.aborted));
        equal(env.requests.length, 4);
        equal(controller.signal.listenerCount(), 0);
        equal(env.timers.count(), 0);
    });

    test("collector stops fetching after the owner loses permission to continue", async () => {
        let allowed = true;
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([
                "/moodle40a/mod/assign/view.php?id=91", "/moodle40a/mod/assign/view.php?id=92", "/moodle40a/mod/assign/view.php?id=93"
            ]) },
            "mod/assign/view.php?id=91": { doc: taskDocument("assign") },
            "mod/assign/view.php?id=92": { doc: taskDocument("assign") },
            "mod/assign/view.php?id=93": { doc: taskDocument("assign") }
        }, progress => { if (progress.saved) allowed = false; });
        env.collector.shouldContinue = async () => allowed;
        await rejects(() => env.collector.run([1]), /中断/);
        equal(env.requests.map(request => request.url), [moodle + "course/view.php?id=1", moodle + "mod/assign/view.php?id=91"]);
        equal(env.state.assign_list.map(item => item.assignId), [91]);
        equal(env.timers.count(), 0);
    });

    test("collector checks ownership again before saving a parsed task", async () => {
        let allowed = true;
        const task = taskDocument("assign");
        const query = task.querySelector;
        task.querySelector = selector => { if (selector === "h2") allowed = false; return query(selector); };
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument(["/moodle40a/mod/assign/view.php?id=91"]) },
            "mod/assign/view.php?id=91": { doc: task }
        });
        env.collector.shouldContinue = async () => allowed;
        await rejects(() => env.collector.run([1]), /中断/);
        equal(env.requests.length, 2);
        equal(env.writes.filter(write => "assign_list" in write || "quiz_list" in write).length, 0);
        equal(env.timers.count(), 0);
    });

    test("collector external cancellation aborts pending fetch and releases listeners", async () => {
        const env = collectorEnvironment({ "course/view.php?id=1": { hang: true } });
        const controller = new TestAbortController();
        env.collector.signal = controller.signal;
        const pending = env.collector.run([1]);
        for (let attempt = 0; attempt < 100 && !env.requests.length; attempt++) await flushPromises();
        equal(controller.signal.listenerCount(), 1);
        controller.abort();
        await rejects(() => pending, /中断/);
        equal(env.requests.length, 1);
        assert(env.requests[0].options.signal.aborted);
        equal(controller.signal.listenerCount(), 0);
        equal(env.timers.count(), 0);
    });

    test("collector explains when course IDs are unavailable", async () => {
        const env = collectorEnvironment({});
        await rejects(() => env.collector.run([0, -1, "bad"]), /マイコース/);
        equal(env.requests.length, 0);
    });

    test("collector aborts stalled fetches and clears the timeout", async () => {
        const env = collectorEnvironment({ "course/view.php?id=1": { hang: true } });
        const running = env.collector.run([1]);
        for (let attempt = 0; attempt < 100 && !env.requests.length; attempt++) await flushPromises();
        env.timers.advance(20000);
        const result = await running;
        equal(result.failed, 1);
        equal(result.saved, 0);
        assert(env.requests[0].options.signal.aborted);
        equal(env.timers.count(), 0);
    });

    function extensionEvent() {
        const listeners = new Set();
        return {
            addListener(listener) { listeners.add(listener); },
            removeListener(listener) { listeners.delete(listener); },
            emit(...args) { return [...listeners].map(listener => listener(...args)); },
            count() { return listeners.size; }
        };
    }
    function backgroundEnvironment(initial, options) {
        options = options || {};
        const env = mockStorage(initial);
        const timers = mockTimers();
        const removed = [];
        const created = [];
        env.ext.runtime = {
            onMessage: extensionEvent(), onInstalled: extensionEvent(), onStartup: extensionEvent(),
            getURL(path) { return "safari-web-extension://test/" + path; }
        };
        env.ext.tabs = {
            onUpdated: extensionEvent(), onRemoved: extensionEvent(),
            async create(properties) { created.push(clone(properties)); return { id: 77, ...properties }; },
            async update(id, properties) {
                if (options.update) return options.update(id, properties, env.ext.tabs);
                const tab = { id, ...properties, status: "complete" };
                // Safari can report cached-page completion before update resolves.
                env.ext.tabs.onUpdated.emit(id, { status: "complete" }, tab);
                return tab;
            },
            async get(id) { return options.get(id); },
            async sendMessage(id, message) {
                if (options.sendMessage) return options.sendMessage(id, message);
                return { ok: true, items: [] };
            },
            async remove(id) { removed.push(id); env.ext.tabs.onRemoved.emit(id); }
        };
        if (options.notifications) env.ext.notifications = options.notifications;
        if (options.alarms) env.ext.alarms = options.alarms;
        const { RefreshCoordinator } = production("src/storage/class/RefreshCoordinator.js", ["RefreshCoordinator"], { URL: URLClass });
        const background = production("src/storage/service_worker.js", [
            "navigateTab", "runTabScraping", "initializeInstallation"
        ], {
            AccountSession: class {
                serial(fn) { return fn(); }
                run(message, from, fn) { return fn(); }
                forget() { return Promise.resolve(); }
            },
            ext: env.ext, StorageUtil: env.StorageUtil, RefreshCoordinator, importScripts() {}, URL: URLClass,
            setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
            console: { warn() {}, error() {} }
        });
        return { ...env, ...background, timers, removed, created };
    }
    function assertNavigationCleaned(env) {
        equal(env.ext.tabs.onUpdated.count(), 1, "Only the permanent owner-navigation listener remains");
        equal(env.ext.tabs.onRemoved.count(), 1, "Only the permanent owner-close listener remains");
        equal(env.timers.count(), 0, "Load timeout is removed");
    }

    test("notification removal never registers delivery or click handlers", async () => {
        const clicked = extensionEvent();
        const alarm = extensionEvent();
        const env = backgroundEnvironment({}, {
            notifications: { onClicked: clicked, create() { throw new Error("Must not notify"); } },
            alarms: { onAlarm: alarm, create() { throw new Error("Must not schedule"); } }
        });
        equal(clicked.count(), 0);
        equal(alarm.count(), 0);
        equal(env.ext.runtime.onMessage.count(), 1);
    });

    test("fresh installs use light while upgrades and explicit themes are preserved", async () => {
        for (const reason of ["install", "update"]) {
            for (const mode of [undefined, 0, 1, 2, 3, 4]) {
                const env = backgroundEnvironment(mode === undefined ? {} : { thememode: mode });
                await env.initializeInstallation({ reason });
                equal(env.state.themeDefault, reason === "install" ? 2 : 0);
                equal(env.state.thememode, mode);
                await env.initializeInstallation({ reason: "update" });
                equal(env.state.themeDefault, reason === "install" ? 2 : 0);
            }
        }
    });

    test("navigation catches cached-page completion before update resolves", async () => {
        const env = backgroundEnvironment();
        await env.navigateTab(77, moodle + "course/view.php?id=1");
        assertNavigationCleaned(env);
    });

    test("navigation ignores queued completion from the previous page", async () => {
        const requested = moodle + "course/view.php?id=1";
        for (const previous of ["about:blank", moodle + "course/view.php?id=2", moodle + "mod/assign/view.php?id=1"]) {
            const env = backgroundEnvironment({}, {
                async update(id, properties, tabs) {
                    tabs.onUpdated.emit(id, { status: "complete" }, { id, url: previous, status: "complete" });
                    return { id, ...properties, status: "loading" };
                }
            });
            const pending = env.navigateTab(77, requested);
            let completed = false;
            pending.then(() => { completed = true; }, () => { completed = true; });
            await flushPromises();
            equal(completed, false, "Previous page must not complete the requested navigation: " + previous);
            env.ext.tabs.onUpdated.emit(77, { status: "complete" }, { id: 77, url: requested, status: "complete" });
            await pending;
            assertNavigationCleaned(env);
        }
    });

    test("navigation cleans up listeners when updating a tab fails", async () => {
        const env = backgroundEnvironment({}, { async update() { throw new Error("Tab unavailable"); } });
        await rejects(() => env.navigateTab(77, moodle + "course/view.php?id=1"), /Tab unavailable/);
        assertNavigationCleaned(env);
    });

    test("navigation without tabs permission ignores a hidden queued blank-page completion", async () => {
        const requested = moodle + "course/view.php?id=1";
        const env = backgroundEnvironment({}, {
            async update(id, properties, tabs) {
                tabs.onUpdated.emit(id, { status: "complete" }, { id, status: "complete" });
                return { id, status: "loading", pendingUrl: properties.url };
            },
            async get(id) { return { id, status: "loading", pendingUrl: requested }; }
        });
        const pending = env.navigateTab(77, requested);
        let completed = false;
        pending.then(() => { completed = true; }, () => { completed = true; });
        await flushPromises();
        equal(completed, false, "Hidden about:blank must not complete or reject the new navigation");
        env.ext.tabs.onUpdated.emit(77, { status: "complete" }, { id: 77, url: requested, status: "complete" });
        await pending;
        assertNavigationCleaned(env);
    });

    test("navigation without tabs permission rejects an inaccessible completed destination", async () => {
        const env = backgroundEnvironment({}, {
            async update(id, properties, tabs) {
                tabs.onUpdated.emit(id, { status: "complete" }, { id, status: "complete" });
                return { id, status: "loading" };
            },
            async get(id) { return { id, status: "complete" }; }
        });
        await rejects(() => env.navigateTab(77, moodle + "course/view.php?id=1"), /ログイン/);
        assertNavigationCleaned(env);
    });

    test("navigation cleans up when a hidden completed tab disappears during recheck", async () => {
        const env = backgroundEnvironment({}, {
            async update(id, properties, tabs) {
                tabs.onUpdated.emit(id, { status: "complete" }, { id, status: "complete" });
                return { id, status: "loading" };
            },
            async get() { throw new Error("Tab unavailable"); }
        });
        await rejects(() => env.navigateTab(77, moodle + "course/view.php?id=1"), /Tab unavailable/);
        assertNavigationCleaned(env);
    });

    test("navigation ignores other tabs and cleans up a timed-out load", async () => {
        const env = backgroundEnvironment({}, { async update(id, properties) { return { id, ...properties, status: "loading" }; } });
        const pending = env.navigateTab(77, moodle + "course/view.php?id=1", 50);
        let completed = false;
        pending.then(() => { completed = true; }, () => { completed = true; });
        await flushPromises();
        env.ext.tabs.onUpdated.emit(78, { status: "complete" }, { url: moodle + "course/view.php?id=1" });
        await flushPromises();
        equal(completed, false);
        env.timers.advance(50);
        await rejects(() => pending, /タイムアウト/);
        assertNavigationCleaned(env);
    });

    test("navigation rejects a closed collection tab and cleans up", async () => {
        const env = backgroundEnvironment({}, { async update(id, properties) { return { id, ...properties, status: "loading" }; } });
        const pending = env.navigateTab(77, moodle + "course/view.php?id=1");
        await flushPromises();
        env.ext.tabs.onRemoved.emit(77);
        await rejects(() => pending, /閉じられ/);
        assertNavigationCleaned(env);
    });

    test("navigation rejects login redirects and cleans up", async () => {
        const env = backgroundEnvironment({}, {
            async update(id, properties, tabs) {
                const tab = { id, status: "complete", url: moodle + "login/index.php" };
                tabs.onUpdated.emit(id, { status: "complete" }, tab);
                return tab;
            }
        });
        await rejects(() => env.navigateTab(77, moodle + "course/view.php?id=1"), /ログイン/);
        assertNavigationCleaned(env);
    });

    test("tab collection closes its temporary tab after course failure", async () => {
        const env = backgroundEnvironment({ courseIds: [1, "1"] }, {
            async sendMessage() { return { ok: false, error: "Course unavailable" }; }
        });
        const result = await env.runTabScraping(null, { tab: { id: 1 } }, { accountId: "1", pageId: "owner" });
        equal({ courses: result.courses, saved: result.saved, failed: result.failed }, { courses: 0, saved: 0, failed: 1 });
        equal(env.created, [{ url: "about:blank", active: false }]);
        equal(env.removed, [77]);
        assertNavigationCleaned(env);
    });

    async function displayEnvironment(settings, activities, events) {
        const children = [];
        const display = {
            textContent: "表示するものがありません",
            appendChild(child) { children.push(child); }
        };
        const document = {
            querySelector(selector) {
                if (selector === "#display") return display;
                if (selector === "h1") return { textContent: "Course" };
                return null;
            },
            querySelectorAll(selector) {
                if (selector === ".event" || selector.startsWith(".event:not(")) return events || [];
                if (selector.startsWith(".assign [data-activityname") || selector.startsWith(".quiz [data-activityname")) {
                    if (/\[data-activityname\]$/.test(selector)) return activities || [];
                    const match = /\[data-activityname="((?:\\.|[^"\\])*)"\]$/.exec(selector);
                    if (!match) throw new SyntaxError("Invalid activity name selector");
                    const name = match[1].replace(/\\(.)/g, "$1");
                    return (activities || []).filter(activity => activity.dataset.activityname === name);
                }
                return [];
            }
        };
        class Box {
            constructor(data) { this.data = data; }
            async getElement() { return this.data; }
        }
        const ui = production("src/storage/display/displaybox.js", ["displaybox", "changeActivityColor", "transDue"], {
            Scrape: scrapeBindings().Scrape, URL: URLClass,
            document, display, rerender: async () => {}, location: { href: moodle + "my/" },
            ext: { storage: { sync: { async get() { return settings || {}; } } } },
            StorageUtil: { async getAllData() { return []; } }, AssignBox: Box, QuizBox: Box,
            noexistmsg: "表示するものがありません", colorTypesValue: [], colorDefault_light: [], colorDefault_dark: [],
            applyColor() {}, formatRemainingTime: () => "Remaining", console: { error(error) { throw error; } }
        });
        await flushPromises();
        return { ...ui, children };
    }

    test("activity color matching handles task titles containing quotes and ampersands", async () => {
        const added = [];
        const title = 'Report "A" & B';
        const env = await displayEnvironment({}, [
            { dataset: { activityname: "Other report" }, classList: { remove() {}, add() { throw new Error("Wrong activity matched"); } } },
            { dataset: { activityname: title }, classList: { remove() {}, add(status) { added.push(status); } } }
        ]);
        env.changeActivityColor({ group: "assign_list", assignName: title, status: "complete" });
        equal(added, ["complete"]);
    });

    test("automatic recoloring replaces the previous task status", async () => {
        const classes = new Set(["activity", "incomplete", "unvisited"]);
        const env = await displayEnvironment({}, [{ dataset: { activityname: "Task" }, classList: {
            remove(...names) { names.forEach(name => classes.delete(name)); },
            add(name) { classes.add(name); }
        } }]);
        env.changeActivityColor({ group: "assign_list", assignName: "Task", status: "complete" });
        equal([...classes].sort(), ["activity", "complete"]);
    });

    test("deadline filters retain unknown deadlines without bypassing other filters", async () => {
        const now = Date.now();
        const task = (id, due, extra = {}) => ({ group: 'assign_list', assignId: id,
            assignName: 'Task ' + id, courseName: 'Course', show: true, status: 'incomplete', due, ...extra });
        const items = [task(101, null), task(102, undefined, { group: 'quiz_list', quizId: 102 }), task(103, ''),
            task(201, new Date(now + 3600000).toISOString()),
            task(202, new Date(now - 3600000).toISOString()),
            task(203, new Date(now + 30 * 86400000).toISOString())];
        const expected = {
            all: [101, 102, 103, 201, 202, 203], today: [101, 102, 103, 201],
            week: [101, 102, 103, 201], overdue: [101, 102, 103, 202],
            dueweek: [101, 102, 103, 202], progressing: [101, 102, 103, 201, 203]
        };
        for (const [selectedDue, ids] of Object.entries(expected)) {
            const env = await displayEnvironment({ selectedDue, selectedStatus: 'all' });
            await env.displaybox(items);
            equal(env.children.map(item => item.assignId || item.quizId), ids, selectedDue);
        }
        const scoped = await displayEnvironment({ selectedDue: 'week', selectedStatus: 'ex-complete', selectedShow: 'normal' });
        await scoped.displaybox([task(101, null), task(104, null, { status: 'complete' }), task(105, null, { show: false })]);
        equal(scoped.children.map(item => item.assignId), [101], 'Completion and user visibility choices remain effective');
    });

    test("dashboard rendering tolerates events with no date or link", async () => {
        const event = { textContent: "Unrelated event", classList: { add() {} }, querySelector() { return null; } };
        const env = await displayEnvironment({}, [], [event]);
        await env.displaybox([]);
        equal(env.children.length, 0);
        equal(env.transDue("本日"), null);
        equal(env.transDue("明日"), null);
        const tomorrow = env.transDue("明日, 9:30");
        equal(tomorrow.getHours(), 9);
        equal(tomorrow.getMinutes(), 30);
    });

    async function runTests() {
        let failures = 0;
        for (const entry of tests) {
            try {
                await entry.run();
                log("PASS " + entry.name);
            } catch (error) {
                failures++;
                log("FAIL " + entry.name + ": " + error + (error.stack ? "\n" + error.stack : ""));
            }
        }
        log((tests.length - failures) + "/" + tests.length + " regression checks passed");
        if (failures) throw new Error(failures + " regression check(s) failed");
    }

    let completed = false;
    let failure;
    runTests().then(() => { completed = true; }, error => {
        completed = true;
        failure = error;
        if (isNode) process.exitCode = 1;
    });
    if (!isNode && typeof drainMicrotasks === "function") {
        drainMicrotasks();
        if (!completed) throw new Error("Test suite left pending asynchronous work");
        if (failure) throw failure;
    }
})();
