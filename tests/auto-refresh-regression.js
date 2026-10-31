// Offline collector regressions. Run: node tests/auto-refresh-regression.js or jsc tests/auto-refresh-regression.js
(function () {
    "use strict";
    const isNode = typeof require === "function";
    const read = isNode ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = isNode ? value => console.log(value) : print;
    const tests = [];
    function test(name, run) { tests.push({ name, run }); }
    function assert(value, message) { if (!value) throw new Error(message || "Assertion failed"); }
    function equal(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error((message || "Values differ") + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function production(path, names, bindings = {}) {
        const keys = Object.keys(bindings);
        return Function(...keys, read(path) + "\nreturn { " + names.join(", ") + " };")(...keys.map(key => bindings[key]));
    }
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


    const base = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    const epoch = Date.parse("2026-10-10T12:00:00Z");
    const secret = "Abc123xyz9";
    const { CourseCollector } = production("src/storage/class/CourseCollector.js", ["CourseCollector"], { URL: URLClass });
    const event = (id, taskId, extras = {}) => ({
        id, name: "Assignment due", description: "", descriptionformat: 1,
        location: "", categoryid: 0, groupid: 0, userid: 1, repeatid: 0,
        eventcount: 1, component: "mod_assign", modulename: "assign",
        instance: taskId, eventtype: "due", timestart: Math.floor(epoch / 1000) + 7200,
        timeduration: 0, timesort: Math.floor(epoch / 1000) + 7200,
        visible: 1, timemodified: Math.floor(epoch / 1000) - 86400,
        course: { id: 42, fullname: "Course" },
        action: { name: "Add submission", url: base + "mod/assign/view.php?id=" + taskId, itemcount: 1, actionable: true },
        url: base + "calendar/view.php?view=day",
        ...extras
    });
    function courseDocument(links = []) {
        return {
            querySelector(selector) { return selector === "h1" ? { textContent: "Course" } : null; },
            querySelectorAll(selector) { return selector.includes("a[href") ? links.map(href => ({ getAttribute() { return href; } })) : []; }
        };
    }
    function pageDocument({ input = secret, links = [], scripts = [] } = {}) {
        return {
            querySelector(selector) { return selector.includes('name="sesskey"') && input ? { value: input, getAttribute() { return input; } } : null; },
            querySelectorAll(selector) {
                if (selector.startsWith("a[")) return links.map(href => ({ getAttribute() { return href; } }));
                if (selector.startsWith("script")) return scripts.map(textContent => ({ textContent }));
                return [];
            }
        };
    }
    function environment(config = {}) {
        let clock = epoch;
        let visible = true;
        let sequence = 0;
        const requests = [], pauses = [], documents = new Map();
        const confirmed = config.confirmed || [];
        const storage = mockStorage({ ...(confirmed.length ? { courseAvailability: { 42: {
            items: Object.fromEntries(confirmed.map(key => [key, true])), complete: false
        } } } : {}), ...config.initial });
        const timers = mockTimers();
        const { AutoRefreshCollector } = production("src/storage/class/AutoRefreshCollector.js", ["AutoRefreshCollector"], {
            CourseCollector, StorageUtil: storage.StorageUtil, ScrapeAssign: {}, ScrapeQuiz: {},
            URL: URLClass, AbortController: TestAbortController,
            setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout
        });
        const env = { requests, pauses, storage, timers, AutoRefreshCollector,
            advance(ms) { clock += ms; }, setVisible(value) { visible = value; }, clock: () => clock };
        const fetch = async (raw, options) => {
            const url = new URLClass(raw);
            const path = url.pathname.replace("/moodle40a/", "") + (url.searchParams.get("id") ? "?id=" + url.searchParams.get("id") : "")
                + (url.searchParams.get("section") !== null ? "&section=" + url.searchParams.get("section") : "");
            requests.push({ url: raw, path, options });
            if (config.onRequest) await config.onRequest(env, path);
            let route;
            if (path === "lib/ajax/service.php") {
                const value = config.api ? await config.api(env, JSON.parse(options.body)[0].args) : { events: [], lastid: null };
                route = value.status || value.hang || value.raw ? value : {
                    raw: JSON.stringify([value.entry || { error: false, data: value }])
                };
            } else {
                route = config.routes?.[path] || {};
            }
            if (route.error) throw route.error;
            if (route.hang) return new Promise((resolve, reject) => {
                if (options.signal.aborted) reject(new Error("Aborted"));
                else options.signal.addEventListener("abort", () => reject(new Error("Aborted")));
            });
            const token = "document:" + ++sequence;
            const isCourse = path.startsWith("course/");
            const type = path.includes("/quiz/") ? "quiz" : "assign";
            const id = Number(url.searchParams.get("id"));
            const doc = route.doc || (isCourse ? courseDocument(route.links || []) : {
                taskData: { group: type + "_list", [type === "assign" ? "assignId" : "quizId"]: id,
                    courseId: 42, courseName: "Course", [type === "assign" ? "assignName" : "quizName"]: "Detail",
                    status: "incomplete", due: null, show: true, notified: false, ...route.data },
                querySelector(selector) { return route.login && selector.includes("login") ? {} : null; }
            });
            documents.set(token, doc);
            return {
                ok: !route.status || route.status < 400, status: route.status || 200,
                url: route.finalURL || raw,
                async text() { return route.raw || token; }
            };
        };
        const scraper = { getData(doc) { config.onScrape?.(env); return doc.taskData || null; } };
        env.collector = new AutoRefreshCollector({
            fetch, parse: text => documents.get(text),
            shouldContinue: async () => visible && (config.shouldContinue ? await config.shouldContinue(env) : true),
            pause: async ms => { pauses.push(ms); clock += ms; }, now: () => clock, random: () => 0.5,
            document: config.document || pageDocument(), pageURL: base + "my/",
            signal: config.signal || null, storage: storage.StorageUtil, scrapers: { assign: scraper, quiz: scraper }
        });
        return env;
    }
    function pending(type, id, overrides = {}) {
        return { type, id, courseId: 42, due: null, addedAt: epoch - 10000, neededAt: epoch - 10000, changed: true, failures: 0, retryAt: 0, ...overrides };
    }
    function discoveredState(overrides = {}) {
        return { version: 1, courses: { 42: { seenAt: epoch, discoveredAt: epoch, failures: 0, retryAt: 0 } }, ...overrides };
    }

    test("Moodle 4.0 instance schema uses isolated authenticated read-only AJAX and canonical detail URLs", async () => {
        const env = environment({ api: () => ({ events: [event(1, 101)], lastid: 1 }), routes: {
            "course/view.php?id=42": { links: ["../mod/assign/view.php?id=101"] }
        } });
        const result = await env.collector.run({ listDue: true });
        equal(result.saved, 1);
        equal(result.listComplete, true);
        const request = env.requests[0];
        const url = new URLClass(request.url);
        equal(url.searchParams.get("sesskey"), secret);
        equal(url.searchParams.get("info"), "core_calendar_get_action_events_by_timesort");
        equal(url.searchParams.get("nosessionupdate"), "true");
        equal(request.options.method, "POST");
        equal(request.options.headers["Content-Type"], "application/json");
        const payload = JSON.parse(request.options.body);
        equal(payload.length, 1);
        equal(payload[0].index, 0);
        equal(payload[0].methodname, "core_calendar_get_action_events_by_timesort");
        equal(payload[0].args.limitnum, 50);
        equal(payload[0].args.timesortto - payload[0].args.timesortfrom, 104 * 86400);
        assert(env.requests.every(item => item.options.credentials === "include" && item.options.signal), "All requests share session cookies and cancellation signals");
        equal(env.requests.filter(item => item.path.startsWith("mod/")).map(item => item.url), [base + "mod/assign/view.php?id=101"]);
        assert(!JSON.stringify(result).includes(secret), "Session key must not be persisted or exposed in errors");
        equal(env.timers.count(), 0);
    });

    test("empty course snapshots preserve normal updates while explicit restrictions block calendar tasks", async () => {
        const env = environment({ initial: { courseAvailability: { 42: {
            items: { "quiz:250333": false }, complete: true
        } } }, api: () => ({ events: [event(1, 101), event(2, 250333, {
            modulename: "quiz", action: { url: base + "mod/quiz/view.php?id=250333" }
        })], lastid: 2 }) });
        const first = await env.collector.run({ listDue: true, courseIds: [41, 42], state: {
            courses: { 42: { seenAt: epoch, discoveredAt: epoch } }
        } });
        equal(first.saved, 1, "An unobserved normal task must remain collectable");
        assert(env.requests.some(request => request.path === "mod/assign/view.php?id=101"));
        assert(!env.requests.some(request => request.path === "mod/quiz/view.php?id=250333"), "An explicitly unavailable calendar task is never fetched");
        assert(!first.state.pending["quiz:250333"]);
        const cached = environment({ initial: { courseAvailability: { 42: { items: {}, complete: true } },
            assign_list: [{ group: "assign_list", assignId: 101, courseId: 42, fetchedAt: 1, show: true, status: "incomplete" }] } });
        equal((await cached.collector.run({ state: discoveredState() })).saved, 1, "A previously saved empty snapshot cannot stop automatic updates");
    });

    test("new calendar tasks recheck an older API inventory before being excluded", async () => {
        for (const visible of [true, false]) {
            const env = environment({ initial: { courseAvailability: { 42: {
                inventoryComplete: true, complete: true, items: {}, detailsCheckedSince: 123
            } } }, api: () => ({ events: [event(1, 101)], lastid: 1 }), routes: {
                "course/view.php?id=42": { links: visible ? [base + "mod/assign/view.php?id=101"] : [] }
            } });
            const result = await env.collector.run({ listDue: true, state: discoveredState() });
            assert(env.requests.some(request => request.path === "course/view.php?id=42"), "Old inventory must be rechecked for newly discovered tasks");
            equal(result.saved, visible ? 1 : 0);
            equal(env.requests.some(request => request.path === "mod/assign/view.php?id=101"), visible);
        }
    });

    test("sesskey comes from DOM or JSON bootstrap without executing page-world code", async () => {
        const cls = environment().AutoRefreshCollector;
        equal(cls.findSesskey(pageDocument({ input: null, links: ["https://other.test/?sesskey=ForeignKey", base + "login/logout.php?sesskey=FromLink99"] })), "FromLink99");
        equal(cls.findSesskey(pageDocument({ input: null, scripts: ['var M={}; M.cfg = {"nested":{"note":"} inside string"},"sesskey":"JsonKey999"}; throw new Error("Do not execute");'] })), "JsonKey999");
        equal(cls.findSesskey(pageDocument({ input: null, scripts: ["M.cfg = {sesskey: window.steal()};"] })), null);
        const missing = environment({ document: pageDocument({ input: null }) });
        const result = await missing.collector.run({ listDue: true, courseIds: [42] });
        equal(result.stopReason, "auth");
        equal(missing.requests.length, 0);
    });

    test("fresh first calendar baseline caches fingerprints without refetching cached details", async () => {
        const env = environment({ confirmed: ["assign:101"], initial: { assign_list: [{ group: "assign_list", assignId: 101, fetchedAt: epoch - 60000, status: "incomplete", due: new Date(epoch + 7200000).toISOString(), courseId: 42 }] },
            api: () => ({ events: [event(1, 101)], lastid: 1 }) });
        const result = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(result.saved, 0);
        equal(env.requests.length, 1);
        assert(result.state.events[1], "First baseline records its event fingerprint");
        equal(Object.keys(result.state.pending).length, 0);
    });

    test("two bounded pages resume the same fixed window and deduplicate multiple events for one task", async () => {
        const pages = [Array.from({ length: 50 }, (_, i) => event(i + 1, 101)), Array.from({ length: 50 }, (_, i) => event(i + 51, 101))];
        const env = environment({ confirmed: ["assign:101"], api: () => ({ events: pages.shift(), lastid: pages.length ? 50 : 100 }) });
        const first = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(first.saved, 1);
        equal(first.listComplete, false);
        equal(first.state.cursor.after, 100);
        equal(env.requests.filter(item => item.path === "lib/ajax/service.php").length, 2);
        const cursor = clone(first.state.cursor);
        const follow = environment({ initial: env.storage.state, api: (_env, args) => {
            equal([args.timesortfrom, args.timesortto, args.aftereventid], [cursor.from, cursor.to, 100]);
            return { events: [], lastid: null };
        } });
        follow.advance(env.clock() - epoch); // A later batch must not reset the clock before the saved fetch.
        const second = await follow.collector.run({ listDue: false, state: first.state });
        equal(second.listComplete, true);
        equal(second.saved, 0);
        equal(second.state.cursor, null);
        equal(follow.requests.length, 1);
    });

    test("different stable events for the same task do not alternate fingerprints or oscillate detail fetches", async () => {
        const events = [event(1, 101, { eventtype: "open" }), event(2, 101, { eventtype: "due" })];
        const env = environment({ confirmed: ["assign:101"], api: () => ({ events, lastid: 2 }) });
        const first = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(first.saved, 1);
        const before = env.requests.length;
        const second = await env.collector.run({ listDue: true, state: first.state });
        equal(second.saved, 0);
        equal(env.requests.length - before, 1);
    });

    test("failed pending details survive cached fingerprints and retry backoff until a successful save", async () => {
        const env = environment({ confirmed: ["assign:101"], api: () => ({ events: [event(1, 101)], lastid: 1 }), routes: { "mod/assign/view.php?id=101": { status: 404 } } });
        const first = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(first.failed, 1);
        assert(first.state.pending["assign:101"].retryAt > env.clock());
        assert(first.state.events[1]);
        const retry = environment({ confirmed: ["assign:101"], api: () => ({ events: [event(1, 101)], lastid: 1 }) });
        const early = await retry.collector.run({ listDue: true, state: first.state });
        equal(early.saved, 0);
        equal(retry.requests.length, 1);
        retry.advance(first.state.pending["assign:101"].retryAt - retry.clock() + 1000);
        const success = await retry.collector.run({ state: early.state });
        equal(success.saved, 1);
        equal(Object.keys(success.state.pending).length, 0);
    });

    test("manual or open-page refresh satisfies queued work while a newly changed event advances neededAt", async () => {
        const env = environment({ confirmed: ["assign:101"], initial: { assign_list: [{ group: "assign_list", assignId: 101, fetchedAt: epoch - 1000, courseId: 42, status: "incomplete", due: null }] } });
        const first = await env.collector.run({ state: discoveredState({ pending: { "assign:101": pending("assign", 101) } }) });
        equal(first.saved, 0);
        equal(Object.keys(first.state.pending).length, 0);
        const changed = environment({ initial: env.storage.state, api: () => ({ events: [event(1, 101, { name: "Changed deadline", timesort: epoch / 1000 + 3600 })], lastid: 1 }),
            routes: { "mod/assign/view.php?id=101": { status: 404 } } });
        const oldEvent = event(1, 101);
        const state = discoveredState({ events: { 1: { key: "assign:101", fingerprint: changed.AutoRefreshCollector.fingerprint(oldEvent), seenAt: epoch - 1000 } } });
        const second = await changed.collector.run({ listDue: true, state });
        assert(second.state.pending["assign:101"].neededAt >= epoch, "Actual changed event advances required detail freshness");
        equal(second.failed, 1);
    });

    test("calendar rejects wrong module IDs and external action URLs without trusting event status", async () => {
        const env = environment({ confirmed: ["assign:107"], api: () => ({ events: [
            event(1, 0), event(2, 102, { modulename: "forum" }),
            event(3, 103, { action: { url: "https://other.test/moodle40a/mod/assign/view.php?id=103" } }),
            event(4, 104, { action: { url: base + "mod/quiz/view.php?id=104" } }),
            event(5, 105, { action: { url: base + "mod/assign/view.php?id=106" } }),
            event(6, 107, { status: "complete", action: { url: base + "mod/assign/view.php?id=107", actionable: false } })
        ], lastid: 6 }) });
        const result = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(result.saved, 1);
        equal(env.storage.state.assign_list[0].assignId, 107);
        equal(env.storage.state.assign_list[0].status, "incomplete");
    });

    test("details obey urgent, overdue, complete and hidden TTLs and reserve an oldest eligible task slot", async () => {
        const cls = environment().AutoRefreshCollector;
        equal(cls.detailInterval({ due: new Date(epoch + 1000).toISOString(), status: "incomplete" }, epoch), 3 * 3600000);
        equal(cls.detailInterval({ due: new Date(epoch - 1000).toISOString(), status: "incomplete" }, epoch), 12 * 3600000);
        equal(cls.detailInterval({ due: new Date(epoch + 1000).toISOString(), status: "complete" }, epoch), 86400000);
        equal(cls.detailInterval({ show: false, status: "incomplete" }, epoch), 86400000);
        assert(cls.detailDue({ fetchedAt: null }, epoch));
        assert(!cls.detailDue({ fetchedAt: epoch - 3600000, due: new Date(epoch + 1000).toISOString() }, epoch));
        const tasks = [{ group: "assign_list", assignId: 999, courseId: 42, due: null, status: "complete", fetchedAt: epoch - 3 * 86400000, show: false }];
        const env = environment({ confirmed: ["assign:999", ...Array.from({ length: 20 }, (_, i) => "assign:" + (i + 101))], initial: { assign_list: tasks }, api: () => ({ events: Array.from({ length: 20 }, (_, i) => event(i + 1, i + 101)), lastid: 20 }) });
        const result = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(result.saved, 8);
        assert(env.requests.some(item => item.path === "mod/assign/view.php?id=999"), "Oldest eligible cached detail must not starve behind new events");
        assert(Object.keys(result.state.pending).length >= 13);
        assert(env.pauses.every(ms => ms >= 1500 && ms <= 3000), "Pacing jitter remains in the configured range");
    });

    test("daily discovery visits only one active course and finds undated tasks outside the timeline", async () => {
        const env = environment({ routes: { "course/view.php?id=42": { links: [base + "mod/assign/view.php?id=201"] } } });
        const result = await env.collector.run({ courseIds: [42, 43, 42, -1, "bad"], state: { courses: { 99: { seenAt: epoch - 91 * 86400000, discoveredAt: 0 } } } });
        equal(env.requests.filter(item => item.path.startsWith("course/")).length, 1);
        equal(result.saved, 1);
        assert(!result.state.courses[99], "Historical inactive course IDs expire");
        assert(result.state.courses[42].discoveredAt > 0);
        equal(result.moreWork, true);
    });

    test("deadline crossing rechecks unfinished visible details once without bypassing terminal or hidden TTLs", async () => {
        const cls = environment().AutoRefreshCollector;
        const task = { status: "incomplete", show: true, fetchedAt: epoch - 3600000,
            due: new Date(epoch).toISOString() };
        assert(!cls.detailDue(task, epoch - 1), "Future deadline retains the usual TTL");
        for (const status of ["incomplete", "warning", "expired", "unknown"]) {
            assert(cls.detailDue({ ...task, status }, epoch), "Recheck unfinished state at its deadline: " + status);
        }
        assert(!cls.detailDue({ ...task, fetchedAt: epoch }, epoch + 1000), "A deadline-time fetch is already current");
        assert(!cls.detailDue({ ...task, fetchedAt: epoch + 1000 }, epoch + 2000), "Do not repeatedly recheck after the deadline");
        for (const status of ["complete", "qualify", "stuck"]) {
            assert(!cls.detailDue({ ...task, status }, epoch), "Terminal state keeps its usual TTL: " + status);
        }
        assert(!cls.detailDue({ ...task, show: false }, epoch), "Hidden tasks keep their daily TTL");
        assert(!cls.detailDue({ ...task, due: null }, epoch), "Missing deadlines do not trigger a crossing");
        assert(!cls.detailDue({ ...task, due: "invalid" }, epoch), "Invalid deadlines do not trigger a crossing");
    });

    test("post-deadline recheck saves the completed quiz score and attempt count without fetching again", async () => {
        const due = new Date(epoch - 26 * 60000).toISOString();
        const old = { group: "quiz_list", quizId: 301, courseId: 42, status: "incomplete", show: true,
            count: 0, maxcount: 1, point: null, maxp: null, due, fetchedAt: epoch - 106 * 60000 };
        const env = environment({ confirmed: ["quiz:301"], initial: { quiz_list: [old] }, routes: {
            "mod/quiz/view.php?id=301": { data: { status: "complete", count: 1, maxcount: 1, point: 100, maxp: 100, due } }
        } });
        const result = await env.collector.run({ state: discoveredState() });
        equal(result.saved, 1, "A fresh pre-deadline cache must not suppress the post-deadline check");
        const saved = env.storage.state.quiz_list[0];
        equal([saved.status, saved.count, saved.maxcount, saved.point, saved.maxp], ["complete", 1, 1, 100, 100]);
        assert(saved.fetchedAt >= epoch);
        const next = await env.collector.run({ state: result.state });
        equal(next.saved, 0);
        equal(env.requests.filter(request => request.path === "mod/quiz/view.php?id=301").length, 1);
    });

    test("fresh collector rechecks cached tasks without course discovery and still excludes unavailable tasks", async () => {
        const due = new Date(epoch - 1000).toISOString();
        const task = { group: "quiz_list", quizId: 301, courseId: 42, status: "incomplete", show: true,
            due, fetchedAt: epoch - 60000 };
        for (const available of [true, false]) {
            const env = environment({ initial: { enrolledCourseIds: [42], quiz_list: [task],
                courseAvailability: { 42: { items: { "quiz:301": available }, complete: true } } }, routes: {
                "mod/quiz/view.php?id=301": { data: { status: "complete", count: 1, point: 100, maxp: 100, due } }
            } });
            const result = await env.collector.run({ state: null, listDue: true, courseIds: [] });
            equal(result.saved, available ? 1 : 0);
            equal(env.requests.filter(request => request.path === "mod/quiz/view.php?id=301").length, available ? 1 : 0);
            equal(Object.keys(result.state.courses), [], "Detail refresh does not invent course discovery");
            equal(result.failed, 0);
            if (available) equal(env.storage.state.quiz_list[0].status, "complete");
        }
    });

    test("a failed deadline-crossing recheck retains retry backoff", async () => {
        const old = { group: "quiz_list", quizId: 301, courseId: 42, status: "expired", show: true,
            due: new Date(epoch - 1000).toISOString(), fetchedAt: epoch - 3600000 };
        const env = environment({ confirmed: ["quiz:301"], initial: { quiz_list: [old] }, routes: {
            "mod/quiz/view.php?id=301": { error: new Error("Temporary network failure") }
        } });
        const result = await env.collector.run({ state: discoveredState() });
        equal(result.failed, 1);
        assert(result.state.pending["quiz:301"].retryAt > env.clock());
        const next = await env.collector.run({ state: result.state });
        equal(next.saved, 0);
        equal(env.requests.length, 1, "Crossing must not bypass a pending retry's backoff");
    });

    test("confirmed membership excludes departed courses from discovery and detail refresh", async () => {
        const env = environment({ initial: { enrolledCourseIds: [42],
            assign_list: [{ group: "assign_list", assignId: 101, courseId: 99, fetchedAt: 1 }],
            courseAvailability: { 42: { items: {} }, 99: { items: { "assign:101": true } } } } });
        const result = await env.collector.run({ courseIds: [42, 99], state: {
            courses: { 42: { seenAt: epoch, discoveredAt: epoch }, 99: { seenAt: epoch, discoveredAt: 0 } },
            pending: { "assign:101": { type: "assign", id: 101, courseId: 99, neededAt: epoch } }
        } });
        equal(env.requests.length, 0, "A departed course is not visited even if an old calendar/UI reference remains");
        equal(result.moreWork, false, "Departed courses must not keep automatic collection waking");
        assert(!result.state.pending["assign:101"]);
        equal((await env.storage.StorageUtil.getAllData()).length, 0);
        equal((await env.storage.StorageUtil.getAllData({ includeUnavailable: true })).length, 1);
    });

    test("automatic multipage discovery resumes one section per batch before marking the course fresh", async () => {
        const env = environment({ routes: {
            "course/view.php?id=42": { links: [base + "course/view.php?id=42&section=1", base + "course/view.php?id=99&section=7"] },
            "course/view.php?id=42&section=1": { links: [base + "course/view.php?id=42&section=2", base + "mod/assign/view.php?id=201"] },
            "course/view.php?id=42&section=2": { links: [base + "course/view.php?id=42&section=1", base + "mod/quiz/view.php?id=202"] }
        } });
        const first = await env.collector.run({ courseIds: [42] });
        equal(first.state.courses[42].discoveredAt, 0);
        equal(first.state.courses[42].sectionScan.pending, [1]);
        equal(env.requests.filter(item => item.path.startsWith("course/")).length, 1);
        assert(first.moreWork);
        env.advance(5 * 60000);
        const second = await env.collector.run({ state: first.state });
        equal(second.state.courses[42].discoveredAt, 0);
        equal(second.state.courses[42].sectionScan.pending, [2]);
        equal(second.saved, 1);
        equal(env.requests.filter(item => item.path.startsWith("course/")).length, 2);
        env.advance(5 * 60000);
        const last = await env.collector.run({ state: second.state });
        assert(last.state.courses[42].discoveredAt > 0);
        assert(!last.state.courses[42].sectionScan);
        equal(last.saved, 1);
        equal(env.requests.filter(item => item.path.startsWith("course/")).length, 3);
        assert(!last.moreWork);
    });

    test("failed automatic section remains pending without advancing course freshness", async () => {
        const env = environment({ routes: { "course/view.php?id=42&section=1": { status: 404 } } });
        const result = await env.collector.run({ state: { courses: { 42: { seenAt: epoch, discoveredAt: 0,
            sectionScan: { startedAt: epoch, pending: [1], visited: [] } } } } });
        equal(result.failed, 1);
        equal(result.state.courses[42].discoveredAt, 0);
        equal(result.state.courses[42].sectionScan.pending, [1]);
        assert(result.state.courses[42].retryAt > epoch);
    });

    test("login, rate limits and server errors stop the sweep immediately with a backoff reason", async () => {
        for (const [status, reason] of [[401, "auth"], [403, "auth"], [429, "rate-limit"], [503, "temporary"]]) {
            const env = environment({ api: () => ({ status }) });
            const result = await env.collector.run({ listDue: true, courseIds: [42] });
            equal(result.stopReason, reason);
            equal(env.requests.length, 1);
            equal(result.saved, 0);
            assert(!JSON.stringify(result).includes(secret));
        }
        const login = environment({ api: () => ({ raw: '<form id="loginform"><input name="password"></form>' }) });
        equal((await login.collector.run({ listDue: true })).stopReason, "auth");
        for (const finalURL of [base + "login/index.php", base + "auth/oidc/", "https://sso.example.test/auth/"]) {
            const redirect = environment({ api: () => ({ raw: "[]", finalURL }) });
            equal((await redirect.collector.run({ listDue: true, courseIds: [42] })).stopReason, "auth");
            equal(redirect.requests.length, 1);
        }
        const exception = environment({ api: () => ({ entry: { error: true, exception: { errorcode: "invalidsesskey", message: secret } } }) });
        const error = await exception.collector.run({ listDue: true });
        equal(error.stopReason, "auth");
        assert(!JSON.stringify(error).includes(secret));
    });

    test("a stuck pagination cursor is bounded and reports a temporary error", async () => {
        const events = Array.from({ length: 50 }, (_, i) => event(i + 1, 101));
        const env = environment({ api: () => ({ events, lastid: 50 }) });
        const result = await env.collector.run({ listDue: true });
        equal(env.requests.length, 2);
        equal(result.stopReason, "temporary");
        equal(result.listComplete, false);
        assert(result.state.pending["assign:101"], "Discovered work remains pending after list failure");
    });

    test("visibility or lease cancellation prevents subsequent requests and saves without penalizing pending entries", async () => {
        const env = environment({ confirmed: ["assign:101"], onRequest(_env, path) { if (path.startsWith("mod/")) _env.setVisible(false); } });
        const state = discoveredState({ pending: { "assign:101": pending("assign", 101) } });
        const result = await env.collector.run({ state });
        equal(result.cancelled, true);
        equal(result.saved, 0);
        equal(env.requests.length, 1);
        equal(env.storage.writes.length, 0);
        equal(result.state.pending["assign:101"].failures, 0);
        const save = environment({ confirmed: ["assign:101"], onScrape(_env) { _env.setVisible(false); } });
        const stopped = await save.collector.run({ state });
        equal(stopped.cancelled, true);
        equal(save.storage.writes.length, 0);
    });

    test("external abort and stalled fetches clean up request timers and retain pending work", async () => {
        const external = new TestAbortController();
        const env = environment({ confirmed: ["assign:101"], signal: external.signal, routes: { "mod/assign/view.php?id=101": { hang: true } } });
        const state = discoveredState({ pending: { "assign:101": pending("assign", 101) } });
        const running = env.collector.run({ state });
        await flushPromises();
        external.abort();
        const cancelled = await running;
        equal(cancelled.cancelled, true);
        equal(env.timers.count(), 0);
        const timeout = environment({ confirmed: ["assign:101"], routes: { "mod/assign/view.php?id=101": { hang: true } } });
        const stalled = timeout.collector.run({ state });
        for (let attempt = 0; attempt < 20 && !timeout.requests.length; attempt++) await flushPromises();
        equal(timeout.requests.length, 1, "Start the request before advancing its timeout");
        timeout.timers.advance(15000);
        equal((await stalled).stopReason, "temporary");
        equal(timeout.timers.count(), 0);
    });

    test("a late automatic detail cannot replace a result saved during its request", async () => {
        const old = { group: "quiz_list", quizId: 301, courseId: 42, status: "incomplete", show: true,
            count: 0, point: null, maxp: null, due: null, fetchedAt: epoch - 2 * 86400000 };
        const latest = { ...old, status: "complete", count: 1, point: 100, maxp: 100, fetchedAt: epoch + 1 };
        const env = environment({ confirmed: ["quiz:301"], initial: { quiz_list: [old] },
            routes: { "mod/quiz/view.php?id=301": { data: { status: "incomplete", count: 0, point: null, maxp: null } } },
            async onRequest(current, path) {
                if (path === "mod/quiz/view.php?id=301") {
                    current.advance(1);
                    await current.storage.StorageUtil.saveData("quiz_list", "quizId", latest);
                }
            }
        });
        const result = await env.collector.run({ state: discoveredState() });
        equal(env.storage.state.quiz_list[0], latest);
        equal([result.saved, result.failed], [0, 0], "Discarding superseded data is neither a save nor a failure");
        assert(!result.state.pending["quiz:301"], "The newer page already satisfied this detail request");
    });

    test("detail saves use StorageUtil preference merges and never infer completion from calendar absence", async () => {
        const old = { group: "quiz_list", quizId: 301, courseId: 42, status: "complete", show: false, notified: true, maxp: 10, point: 0, due: null, fetchedAt: epoch - 2 * 86400000 };
        const env = environment({ confirmed: ["quiz:301"], initial: { quiz_list: [old] }, routes: { "mod/quiz/view.php?id=301": { data: { status: "unknown", point: null, maxp: null } } } });
        const result = await env.collector.run({ listDue: true, state: discoveredState() });
        equal(result.saved, 1);
        const saved = env.storage.state.quiz_list[0];
        equal([saved.show, saved.status, saved.notified, saved.point, saved.maxp], [false, "complete", undefined, 0, 10]);
        assert(saved.fetchedAt >= epoch);
        equal(env.storage.state.quiz_list.length, 1);
    });

    test("in-flight collector state exposes completed calendar progress for unload persistence", async () => {
        const external = new TestAbortController();
        const env = environment({ signal: external.signal, api: (_env, args) => args.aftereventid === 0
            ? { events: Array.from({ length: 50 }, (_, index) => event(index + 1, 101)), lastid: 50 }
            : { hang: true } });
        const running = env.collector.run({ listDue: true, state: discoveredState() });
        for (let attempt = 0; attempt < 10 && env.requests.length < 2; attempt++) await flushPromises();
        equal(env.requests.length, 2);
        equal(env.collector.state.cursor.after, 50);
        assert(env.collector.state.pending["assign:101"], "Unload state includes already discovered detail work");
        external.abort();
        const stopped = await running;
        equal(stopped.state.cursor.after, 50);
        equal(stopped.cancelled, true);
    });

    test("time budget stops additional requests and saves while retaining unfinished details", async () => {
        const work = Object.fromEntries(Array.from({ length: 12 }, (_, index) => ["assign:" + (index + 101), pending("assign", index + 101)]));
        const env = environment({ confirmed: Object.keys(work), onRequest(_env) { _env.advance(15000); } });
        const result = await env.collector.run({ state: discoveredState({ pending: work }) });
        equal(result.stopReason, "budget");
        equal(result.failed, 0);
        equal(result.saved, 3);
        equal(env.requests.length, 4);
        assert(Object.keys(result.state.pending).length === 9);
        assert(env.requests[3].options.signal, "Last request still has the remaining-budget abort signal");
        equal(env.timers.count(), 0);
    });

    test("persisted state stays bounded and drops unknown fields including session keys", async () => {
        const env = environment();
        const state = env.collector.normalizeState({ sesskey: secret,
            events: Object.fromEntries(Array.from({ length: 2100 }, (_, index) => [index + 1, { key: "assign:101", fingerprint: "abc", seenAt: epoch }])),
            pending: Object.fromEntries(Array.from({ length: 1100 }, (_, index) => ["assign:" + (index + 1), pending("assign", index + 1)])),
            courses: Object.fromEntries(Array.from({ length: 150 }, (_, index) => [index + 1, { seenAt: epoch, discoveredAt: epoch }])) });
        equal([Object.keys(state.events).length, Object.keys(state.pending).length, Object.keys(state.courses).length], [2000, 1000, 100]);
        assert(!JSON.stringify(state).includes(secret));
        assert(JSON.stringify(state).length < 1000000);
    });

    async function runTests() {
        let failures = 0;
        for (const entry of tests) {
            try { await entry.run(); log("PASS " + entry.name); }
            catch (error) { failures++; log("FAIL " + entry.name + ": " + error + (error.stack ? "\n" + error.stack : "")); }
        }
        log((tests.length - failures) + "/" + tests.length + " automatic collector checks passed");
        if (failures) throw new Error(failures + " automatic collector regression(s) failed");
    }
    let complete = false, failure;
    if (isNode) process.once("beforeExit", () => {
        if (!complete) { console.error("Automatic collector checks left asynchronous work pending"); process.exitCode = 1; }
    });
    runTests().then(() => { complete = true; }, error => { complete = true; failure = error; if (isNode) process.exitCode = 1; });
    if (!isNode && typeof drainMicrotasks === "function") {
        drainMicrotasks();
        if (!complete) throw new Error("Automatic collector checks left asynchronous work pending");
        if (failure) throw failure;
    }
})();
