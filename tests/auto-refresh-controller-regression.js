/* Dependency-free controller checks: node or macOS JavaScriptCore, from repo root. */
(function () {
    "use strict";
    const node = typeof require === "function";
    const read = node ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = node ? message => console.log(message) : print;
    const source = read("src/storage/auto_refresh.js");
    const Controller = Function(source + "\nreturn AutoRefreshController;")();
    const tests = [];
    function test(name, run) { tests.push({ name, run }); }
    function assert(value, message) { if (!value) throw new Error(message || "Assertion failed"); }
    function equal(actual, expected) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(JSON.stringify(actual) + " != " + JSON.stringify(expected));
        }
    }
    async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }

    class Events {
        constructor() { this.listeners = new Map(); this.events = []; }
        addEventListener(name, callback) {
            if (!this.listeners.has(name)) this.listeners.set(name, new Set());
            this.listeners.get(name).add(callback);
        }
        removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
        dispatchEvent(event) {
            this.events.push(event.type);
            for (const callback of this.listeners.get(event.type) || []) callback(event);
        }
        emit(type) { this.dispatchEvent({ type }); }
    }
    class Abort {
        constructor() { this.signal = { aborted: false }; }
        abort() { this.signal.aborted = true; }
    }
    class Event { constructor(type) { this.type = type; } }

    function harness({ visible = true, authenticated = true, href,
        claim, heartbeat, finish, status, run } = {}) {
        let time = 100000;
        let timerID = 0;
        let tokenID = 0;
        const timers = new Map();
        const messages = [];
        const runs = [];
        const collectors = [];
        const storageListeners = new Set();
        const doc = new Events();
        doc.visibilityState = visible ? "visible" : "hidden";
        doc.hidden = !visible;
        doc.authenticated = authenticated;
        doc.login = false;
        doc.filterText = "";
        doc.courses = [12, 13, 12];
        doc.querySelector = selector => {
            if (selector.includes("form#login")) return doc.login ? {} : null;
            if (selector === "span[data-active-item-text]") return { textContent: doc.filterText };
            return null;
        };
        doc.querySelectorAll = () => doc.courses.map(id => ({ dataset: { courseId: String(id) } }));
        const win = new Events();
        win.self = win;
        win.top = win;
        win.location = { href: href || "https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=14" };
        class Collector {
            static findSesskey(document) { return document.authenticated ? "test-session" : null; }
            constructor(options) { this.options = options; collectors.push(this); }
            async run(input) {
                runs.push(input);
                return run ? run(input, this.options) : {
                    saved: 0, failed: 0, state: { cursor: 1 }, moreWork: false, listComplete: true,
                };
            }
        }
        const ext = {
            runtime: {
                async sendMessage(message) {
                    messages.push(message);
                    switch (message.type) {
                        case "REFRESH_CLAIM": return claim ? claim(message) : {
                            ok: true, granted: true, token: "lease-" + (++tokenID),
                            state: { cursor: 0 }, listDue: true, nextListAt: time + 900000,
                        };
                        case "REFRESH_HEARTBEAT": return heartbeat ? heartbeat(message) : {
                            ok: true, owned: true, expiresAt: time + 90000, nextAt: time + 90000,
                        };
                        case "REFRESH_FINISH": return finish ? finish(message) : {
                            ok: true, owned: true, nextAt: time + 300000,
                            nextWorkAt: time + 900000,
                        };
                        case "REFRESH_STATUS": return status ? status(message) : {
                            ok: true, busy: false, nextAt: time + 180000,
                        };
                        default: throw new Error("Unexpected message " + message.type);
                    }
                },
            },
            storage: { onChanged: {
                addListener(callback) { storageListeners.add(callback); },
                removeListener(callback) { storageListeners.delete(callback); },
            } },
        };
        const controller = new Controller({ extension: ext, document: doc, window: win,
            Collector, now: () => time, AbortController: Abort, CustomEvent: Event,
            setTimeout(callback, delay) {
                const id = ++timerID;
                timers.set(id, { callback, at: time + Number(delay || 0) });
                return id;
            },
            clearTimeout(id) { timers.delete(id); },
        });
        return {
            controller, doc, win, messages, runs, collectors, timers,
            now: () => time,
            count: type => messages.filter(message => message.type === type).length,
            async start() { controller.start(); await flush(); },
            async visible(value) {
                doc.visibilityState = value ? "visible" : "hidden";
                doc.hidden = !value;
                doc.emit("visibilitychange");
                await flush();
            },
            async change(state) {
                for (const callback of storageListeners) callback({ refreshCoordinator: { newValue: state } }, "local");
                await flush();
            },
            async advance(milliseconds) {
                const end = time + milliseconds;
                let steps = 0;
                while (true) {
                    const due = [...timers].filter(([, timer]) => timer.at <= end)
                        .sort((a, b) => a[1].at - b[1].at)[0];
                    if (!due) break;
                    assert(++steps < 100, "Timer storm");
                    timers.delete(due[0]);
                    time = due[1].at;
                    due[1].callback();
                    await flush();
                }
                time = end;
                await flush();
            },
        };
    }

    test("hidden, unauthenticated, login, auth, syllabus and framed pages never claim", async () => {
        for (const config of [
            { visible: false }, { authenticated: false },
            { href: "https://cms7.ict.nitech.ac.jp/moodle40a/login/index.php" },
            { href: "https://cms7.ict.nitech.ac.jp/moodle40a/auth/oidc/" },
            { href: "https://cms7.ict.nitech.ac.jp/moodle40a/blocks/syllabus/view.php" },
            { href: "https://example.org/moodle40a/my/" },
        ]) {
            const h = harness(config);
            await h.start();
            equal(h.messages.length, 0);
            equal(h.timers.size, 0);
        }
        const frame = harness();
        frame.win.top = {};
        await frame.start();
        equal(frame.messages.length, 0);
    });

    test("busy and initial phase replies sleep until the persisted nextAt", async () => {
        const h = harness({ claim: () => ({ ok: true, granted: false,
            reason: "scheduled", nextAt: h.now() + 120000 }) });
        await h.start();
        equal(h.count("REFRESH_CLAIM"), 1);
        for (let i = 0; i < 20; i++) h.win.emit("pageshow");
        await flush();
        equal(h.count("REFRESH_CLAIM"), 1);
        await h.advance(119999);
        equal(h.count("REFRESH_CLAIM"), 1);
        await h.advance(1);
        equal(h.count("REFRESH_CLAIM"), 2);
        equal(h.runs.length, 0);
        equal(h.timers.size, 1);
    });

    test("temporary collection tabs do not start automatic retries", async () => {
        const h = harness({ claim: () => ({ ok: true, granted: false,
            reason: "temporary", nextAt: h.now() + 90000 }) });
        await h.start();
        await h.advance(600000);
        h.win.emit("pageshow");
        await flush();
        equal(h.count("REFRESH_CLAIM"), 1);
        equal(h.timers.size, 0);
    });

    test("visible collection sends current course observations and persists result once", async () => {
        const h = harness({ run: async () => ({ saved: 2, failed: 1,
            state: { cursor: 7 }, moreWork: true, listComplete: false }) });
        await h.start();
        equal(h.runs[0], { state: { cursor: 0 }, listDue: true, courseIds: [12, 13, 14] });
        const finish = h.messages.find(message => message.type === "REFRESH_FINISH");
        equal(finish, { type: "REFRESH_FINISH", token: "lease-1", outcome: "partial",
            collectorState: { cursor: 7 }, moreWork: true, listComplete: false, reason: null });
        equal(h.doc.events.filter(type => type === "duedle:tasks-updated").length, 1);
        equal([...h.timers.values()][0].at, h.now() + 300000);
        equal(h.count("REFRESH_HEARTBEAT"), 0);
    });

    test("deleted-course DOM filters are not included in observed courses", async () => {
        const h = harness();
        h.doc.filterText = "削除済み";
        await h.start();
        equal(h.runs[0].courseIds, [14]);
    });

    test("hiding aborts collection, removes timers and releases the lease once", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }) });
        await h.start();
        equal(h.timers.size, 1);
        await h.advance(30000);
        equal(h.count("REFRESH_HEARTBEAT"), 1);
        const options = h.collectors[0].options;
        await h.visible(false);
        assert(options.signal.aborted);
        assert(!await options.shouldContinue());
        equal(h.timers.size, 0);
        resolve({ saved: 0, failed: 0, cancelled: true, state: { cursor: 2 }, moreWork: true });
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
        equal(h.messages.find(message => message.type === "REFRESH_FINISH").outcome, "cancelled");
        equal(h.timers.size, 0);
        await h.visible(true);
        equal(h.count("REFRESH_CLAIM"), 1);
        equal(h.timers.size, 1);
    });

    test("late grants after hiding are released without any network collection", async () => {
        let grant;
        const h = harness({ claim: () => new Promise(done => { grant = done; }) });
        await h.start();
        await h.visible(false);
        grant({ ok: true, granted: true, token: "late", state: { cursor: 3 }, listDue: true });
        await flush();
        equal(h.runs.length, 0);
        equal(h.count("REFRESH_FINISH"), 1);
        equal(h.timers.size, 0);
    });

    test("beforeunload and pagehide use one best-effort finish even while run is pending", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }) });
        await h.start();
        h.win.emit("pagehide");
        h.win.emit("beforeunload");
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
        equal(h.timers.size, 0);
        resolve({ saved: 0, failed: 0, cancelled: true, state: { cursor: 9 } });
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
        h.win.emit("pageshow");
        await flush();
        equal(h.timers.size, 1);
    });

    test("suspension preserves the live cursor and pending work before run resolves", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }) });
        await h.start();
        const progress = { cursor: { after: 51 }, pending: { "assign:17": { id: 17 } } };
        h.collectors[0].state = progress;
        h.win.emit("pagehide");
        h.win.emit("beforeunload");
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
        const finish = h.messages.find(message => message.type === "REFRESH_FINISH");
        equal(finish.collectorState, progress);
        equal(finish.outcome, "cancelled");
        equal(h.timers.size, 0);
        resolve({ state: { cursor: { after: 52 } }, cancelled: true });
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
        equal(finish.collectorState.cursor.after, 51);
    });

    test("ownership is rechecked between steps and lost leases abort further work", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }),
            heartbeat: () => ({ ok: true, owned: false, nextAt: h.now() + 90000 }) });
        await h.start();
        const options = h.collectors[0].options;
        await h.advance(10001);
        assert(!await options.shouldContinue());
        equal(h.count("REFRESH_HEARTBEAT"), 1);
        assert(options.signal.aborted);
        assert(!await options.shouldContinue());
        equal(h.count("REFRESH_HEARTBEAT"), 1);
        equal(h.timers.size, 0);
        resolve({ cancelled: true, state: { cursor: 1 } });
        await flush();
        equal(h.count("REFRESH_FINISH"), 1);
    });

    test("claim transport failures retry after bounded backoff without event storms", async () => {
        const h = harness({ claim: () => { throw new Error("Background restarting"); } });
        await h.start();
        equal([...h.timers.values()][0].at, h.now() + 60000);
        for (let index = 0; index < 20; index++) h.win.emit("pageshow");
        await flush();
        equal(h.count("REFRESH_CLAIM"), 1);
        await h.advance(60000);
        equal(h.count("REFRESH_CLAIM"), 2);
        equal([...h.timers.values()][0].at, h.now() + 120000);
        await h.visible(false);
        equal(h.timers.size, 0);
        await h.advance(600000);
        equal(h.count("REFRESH_CLAIM"), 2);
    });

    test("collector and finish failures release once and do not spin", async () => {
        const h = harness({ run: () => { throw new Error("Network failed"); },
            finish: () => { throw new Error("Background unavailable"); } });
        await h.start();
        equal(h.count("REFRESH_FINISH"), 1);
        equal(h.messages.find(message => message.type === "REFRESH_FINISH").outcome, "error");
        equal(h.controller.active, null);
        equal(h.timers.size, 1);
        equal([...h.timers.values()][0].at, h.now() + 60000);
    });

    test("heartbeat failure cancels collector and sends an error outcome", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }),
            heartbeat: () => { throw new Error("No background"); } });
        await h.start();
        await h.advance(30000);
        assert(h.collectors[0].options.signal.aborted);
        equal(h.timers.size, 0);
        resolve({ cancelled: true, state: { cursor: 1 } });
        await flush();
        equal(h.messages.find(message => message.type === "REFRESH_FINISH").outcome, "error");
    });

    test("own storage writes are ignored; other lease extensions only move the wake timer", async () => {
        let resolve;
        const h = harness({ run: () => new Promise(done => { resolve = done; }) });
        await h.start();
        for (let index = 0; index < 10; index++) await h.change({ lease: { expiresAt: h.now() + 90000 } });
        equal(h.count("REFRESH_STATUS"), 0);
        equal(h.count("REFRESH_CLAIM"), 1);
        resolve({ saved: 0, failed: 0, state: { cursor: 1 } });
        await flush();
        await h.change({ lease: { expiresAt: h.now() + 180000 } });
        equal(h.count("REFRESH_STATUS"), 0);
        equal([...h.timers.values()][0].at, h.now() + 180000);
        await h.change({ lease: null, nextWorkAt: h.now() + 900000 });
        equal(h.count("REFRESH_STATUS"), 1);
        equal([...h.timers.values()][0].at, h.now() + 180000);
    });

    test("stale status replies cannot replace a newer lease wake with an immediate claim", async () => {
        let reply;
        const h = harness({ status: () => new Promise(done => { reply = done; }) });
        await h.start();
        await h.change({ lease: null });
        await h.change({ lease: { expiresAt: h.now() + 90000 } });
        reply({ ok: true, busy: false, nextAt: h.now() });
        await flush();
        equal(h.count("REFRESH_CLAIM"), 1);
        equal(h.count("REFRESH_STATUS"), 1);
        equal([...h.timers.values()][0].at, h.now() + 90000);
    });

    test("schedule changes during status lookup coalesce into one fresh lookup", async () => {
        let reply;
        let requests = 0;
        const h = harness({ status: () => ++requests === 1
            ? new Promise(done => { reply = done; })
            : { ok: true, busy: false, nextAt: h.now() + 120000, nextWorkAt: h.now() + 900000 } });
        await h.start();
        await h.change({ lease: null });
        for (let index = 0; index < 20; index++) await h.change({ lease: null, nextWorkAt: h.now() + 900000 });
        equal(h.count("REFRESH_STATUS"), 1);
        reply({ ok: true, busy: false, nextAt: h.now() });
        await flush();
        equal(h.count("REFRESH_STATUS"), 2);
        equal(h.count("REFRESH_CLAIM"), 1);
        equal([...h.timers.values()][0].at, h.now() + 120000);
    });

    test("page reload respects the background's persisted schedule", async () => {
        const first = harness();
        await first.start();
        first.controller.stop();
        const second = harness({ claim: () => ({ ok: true, granted: false,
            reason: "scheduled", nextAt: second.now() + 300000 }) });
        await second.start();
        equal(second.runs.length, 0);
        equal([...second.timers.values()][0].at, second.now() + 300000);
    });

    test("stop and restart reattach once and preserve the next scheduled wake", async () => {
        const h = harness();
        await h.start();
        h.controller.stop();
        equal(h.timers.size, 0);
        h.controller.start();
        h.controller.start();
        await flush();
        equal(h.count("REFRESH_CLAIM"), 1);
        equal(h.timers.size, 1);
        await h.visible(false);
        equal(h.timers.size, 0);
    });

    test("real coordinator initializes phase then persists controller progress", async () => {
        class SiteURL {
            constructor(raw) {
                const match = /^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(raw);
                if (!match) throw new Error("Invalid URL");
                this.origin = match[1];
                this.pathname = match[2];
            }
        }
        const Coordinator = Function("URL", read("src/storage/class/RefreshCoordinator.js")
            + "\nreturn RefreshCoordinator;")(SiteURL);
        const stored = {};
        const sender = { tab: { id: 41 }, url: "https://cms7.ict.nitech.ac.jp/moodle40a/my/" };
        let coordinator;
        const h = harness({
            claim: message => coordinator.claim(message, sender),
            heartbeat: message => coordinator.heartbeat(message.token, sender),
            finish: message => coordinator.finish(message, sender),
            status: () => coordinator.status(sender),
        });
        coordinator = new Coordinator({ now: h.now, random: () => 0, tokenFactory: () => "integrated-lease",
            storage: {
                async get(keys) {
                    const values = {};
                    for (const key of keys) if (key in stored) values[key] = JSON.parse(JSON.stringify(stored[key]));
                    return values;
                },
                async set(values) { Object.assign(stored, JSON.parse(JSON.stringify(values))); },
            },
        });
        await h.start();
        equal(h.runs.length, 0);
        equal(stored.refreshCoordinator.nextListAt, h.now() + 60000);
        await h.advance(60000);
        equal(h.runs.length, 1);
        equal(h.count("REFRESH_FINISH"), 1);
        equal(stored.refreshCoordinator.collectorState, { cursor: 1 });
        equal(stored.refreshCoordinator.lease, null);
        equal(stored.refreshCoordinator.failures, 0);
        equal(stored.refreshCoordinator.nextListAt, h.now() + 55 * 60000);
        assert(!Object.prototype.hasOwnProperty.call(stored, "scrapeCooldown"));
    });

    let completed = false, failure;
    (async () => {
        let failed = 0;
        for (const { name, run } of tests) {
            try { await run(); log("PASS " + name); }
            catch (error) { failed++; log("FAIL " + name + ": " + (error.stack || error)); }
        }
        log(`${tests.length - failed}/${tests.length} automatic controller checks passed.`);
        if (failed) {
            if (node) process.exitCode = 1;
            else throw new Error(failed + " automatic controller checks failed");
        }
    })().then(() => { completed = true; }, error => { completed = true; failure = error; if (node) process.exitCode = 1; });
    if (!node && typeof drainMicrotasks === "function") {
        drainMicrotasks();
        if (!completed) throw new Error("Pending asynchronous test work");
        if (failure) throw failure;
    }
})();
