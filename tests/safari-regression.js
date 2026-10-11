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

    test("reviewing an older lower or hidden quiz grade does not falsely complete the quiz", async () => {
        for (const grade of ["8 / 10", "成績は非公開です"]) {
            const old = {
                group: "quiz_list", quizId: 63, courseName: "Course", quizName: "Quiz", point: 9, maxp: 10,
                required: 5, count: 1, maxcount: null, status: "qualify", show: true, start: null, due: null,
                fetchedAt: 1700000000000, courseId: 615
            };
            const env = mockStorage({ quiz_list: [old] });
            const doc = {
                querySelector(selector) {
                    if (selector === "h1") return { textContent: "Course" };
                    if (selector === "[aria-current='page']") return { textContent: "Quiz" };
                    if (selector === "tr:last-of-type td") return { textContent: grade };
                    return null;
                }
            };
            const { ScrapeQuizReview } = production("src/storage/class/scrape/ScrapeQuizReview.js", ["ScrapeQuizReview"], {
                ...scrapeBindings(), document: doc
            });
            const review = ScrapeQuizReview.getData(old);
            await env.StorageUtil.saveData("quiz_list", "quizId", review);
            equal(env.state.quiz_list[0].status, "qualify", "Review of " + grade + " should preserve the qualified result");
            equal(env.state.quiz_list[0].point, 9);
            equal(env.state.quiz_list[0].maxp, 10);
            equal(env.state.quiz_list[0].fetchedAt, old.fetchedAt, "Review reads do not extend complete-detail freshness");
            equal(env.state.quiz_list[0].courseId, old.courseId);
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
            querySelectorAll() {
                return links.map(href => ({ getAttribute(name) { return name === "href" ? href : null; } }));
            }
        };
    }
    function collectorEnvironment(routes, onProgress) {
        const storage = mockStorage();
        const timers = mockTimers();
        const bindings = scrapeBindings();
        const { ScrapeAssign } = production("src/storage/class/scrape/ScrapeAssign.js", ["ScrapeAssign"], bindings);
        const { ScrapeQuiz } = production("src/storage/class/scrape/ScrapeQuiz.js", ["ScrapeQuiz"], bindings);
        const { CourseCollector } = production("src/storage/class/CourseCollector.js", ["CourseCollector"], {
            URL: URLClass, AbortController: TestAbortController, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
            ScrapeAssign, ScrapeQuiz, StorageUtil: storage.StorageUtil
        });
        const requests = [];
        const collector = new CourseCollector({
            async fetch(url, options) {
                requests.push({ url, options });
                const response = routes[url.slice(moodle.length)];
                if (!response) throw new Error("Unexpected request: " + url);
                if (response.error) throw response.error;
                if (response.hang) {
                    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("Aborted request"))));
                }
                return {
                    ok: response.ok !== false,
                    status: response.status || 200,
                    url: response.url || url,
                    async text() { return url.slice(moodle.length); }
                };
            },
            parse(html) { return routes[html].doc; },
            onProgress: onProgress || (() => {})
        });
        return { ...storage, timers, collector, CourseCollector, requests };
    }

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
            const env = collectorEnvironment({ "course/view.php?id=1": response });
            await rejects(() => env.collector.run([1, 2, 3]), /ログイン/);
            equal(env.requests.length, 1, "Authentication failure stops the sweep immediately");
            equal(env.writes.length, 0);
            equal(env.timers.count(), 0);
        }
    });

    test("collector stops immediately on access, rate-limit and server failures", async () => {
        for (const status of [401, 403, 429, 503]) {
            const env = collectorEnvironment({ "course/view.php?id=1": { ok: false, status } });
            await rejects(() => env.collector.run([1, 2]), /HTTP/);
            equal(env.requests.length, 1);
            equal(env.writes.length, 0);
            equal(env.timers.count(), 0);
        }
    });

    test("collector stops fetching after the owner loses permission to continue", async () => {
        let allowed = true;
        const env = collectorEnvironment({
            "course/view.php?id=1": { doc: courseDocument([
                "/moodle40a/mod/assign/view.php?id=91", "/moodle40a/mod/assign/view.php?id=92"
            ]) },
            "mod/assign/view.php?id=91": { doc: taskDocument("assign") }
        }, progress => { if (progress.saved) allowed = false; });
        env.collector.shouldContinue = async () => allowed;
        await rejects(() => env.collector.run([1, 2]), /中断/);
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
        equal(env.writes.length, 0);
        equal(env.timers.count(), 0);
    });

    test("collector external cancellation aborts pending fetch and releases listeners", async () => {
        const env = collectorEnvironment({ "course/view.php?id=1": { hang: true } });
        const controller = new TestAbortController();
        env.collector.signal = controller.signal;
        const pending = env.collector.run([1, 2]);
        await flushPromises();
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
        await flushPromises();
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
        const result = await env.runTabScraping();
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

    test("deadline-specific filters exclude tasks without a deadline", async () => {
        for (const selectedDue of ["today", "week", "overdue", "dueweek", "progressing"]) {
            const env = await displayEnvironment({ selectedDue });
            await env.displaybox([{ group: "assign_list", assignId: 101, assignName: "Undated", courseName: "Course", show: true, due: null }]);
            equal(env.children.length, 0, selectedDue + " must not include undated tasks");
        }
        const all = await displayEnvironment({ selectedDue: "all" });
        await all.displaybox([{ group: "assign_list", assignId: 101, assignName: "Undated", courseName: "Course", show: true, due: null }]);
        equal(all.children.length, 1);
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
