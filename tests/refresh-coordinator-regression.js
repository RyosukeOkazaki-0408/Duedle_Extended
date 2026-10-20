/* Run: node tests/refresh-coordinator-regression.js, or on macOS without Node:
 * /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/refresh-coordinator-regression.js
 * Tests execute the unchanged production coordinator and background with API stubs.
 */
(function () {
    "use strict";
    const isNode = typeof require === "function";
    const read = isNode ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = isNode ? value => console.log(value) : print;
    const tests = [];
    const minute = 60000;
    const baseTime = 1800000000000;
    const root = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    const sender = id => ({ tab: { id, url: root + "my/" }, url: root + "my/" });
    const clone = value => JSON.parse(JSON.stringify(value));
    function test(name, run) { tests.push({ name, run }); }
    function assert(value, message) { if (!value) throw new Error(message || "Assertion failed"); }
    function equal(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error((message || "Values differ") + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
        }
    }
    async function rejects(run, pattern) {
        let caught;
        try { await run(); } catch (error) { caught = error; }
        assert(caught, "Expected rejection");
        if (pattern) assert(pattern.test(String(caught.message || caught)), "Unexpected error: " + caught);
    }
    function production(path, names, bindings) {
        const keys = Object.keys(bindings || {});
        return Function(...keys, read(path) + "\nreturn { " + names.join(", ") + " }; ")(...keys.map(key => bindings[key]));
    }
    class TestURL {
        constructor(value) {
            const match = /^(https?:\/\/[^/]+)(\/[^?#]*)/.exec(String(value));
            if (!match) throw new Error("Invalid URL");
            this.origin = match[1]; this.pathname = match[2];
            this.searchParams = { get: name => {
                const pair = String(value).split("?")[1]?.split("&").find(item => item.split("=")[0] === name);
                return pair ? pair.split("=")[1] : null;
            } };
        }
    }
    const { RefreshCoordinator } = production("src/storage/class/RefreshCoordinator.js", ["RefreshCoordinator"], {
        URL: typeof URL === "function" ? URL : TestURL
    });
    function environment(initial, options = {}) {
        const state = clone(initial || {});
        const clock = { now: baseTime };
        const writes = [];
        let token = 0;
        let failWrite = false;
        const storage = {
            async get(keys) {
                await Promise.resolve();
                const result = {};
                for (const key of Array.isArray(keys) ? keys : [keys]) {
                    if (state[key] !== undefined) result[key] = clone(state[key]);
                }
                return result;
            },
            async set(values) {
                await Promise.resolve();
                if (failWrite) { failWrite = false; throw new Error("Storage failed"); }
                Object.assign(state, clone(values));
                writes.push(clone(values));
            }
        };
        const create = (random = () => 0.5) => new RefreshCoordinator({ storage, now: () => clock.now,
            random, tokenFactory: () => "lease-" + (++token) });
        return { state, clock, writes, storage, create, coordinator: create(options.random),
            failNextWrite() { failWrite = true; } };
    }
    function dueState(extra = {}) {
        return { refreshCoordinator: { version: 1, collectorState: null, nextListAt: baseTime,
            nextWorkAt: baseTime, failures: 0, pendingWork: false, lease: null,
            temporaryTabId: null, ...extra } };
    }
    test("manual finish stores bounded result details across background restart", async () => {
        const env = environment(dueState());
        const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        const result = await env.coordinator.finish({ token: claim.token, outcome: "partial", fullSweep: true,
            summary: { courses: 14, saved: 18, failed: 2, message: "x".repeat(700), ignored: "not stored" } }, sender(1));
        assert(result.owned);
        const summary = env.state.refreshHistory.attempt.summary;
        equal(Object.keys(summary).sort(), ["courses", "failed", "message", "saved"]);
        assert(summary.message.length === 500 && summary.saved === 18);
        assert(!env.state.scrapeCooldown && !env.state.refreshHistory.fullSweepAt);
        const restarted = env.create();
        await restarted.status(sender(1));
        equal(env.state.refreshHistory.attempt.summary, summary);
    });

    function event() {
        const listeners = new Set();
        return { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); },
            emit(...args) { return [...listeners].map(fn => fn(...args)); }, count() { return listeners.size; } };
    }
    function background(initial, options = {}) {
        const env = environment(initial);
        let nextTimer = 0;
        const timers = new Map();
        const created = [], removed = [], navigated = [];
        const ext = { storage: { local: env.storage }, runtime: {
            onMessage: event(), onInstalled: event(), onStartup: event(), getURL: path => path
        }, tabs: {
            onUpdated: event(), onRemoved: event(),
            async create(properties) { created.push(properties); return { id: 77, ...properties }; },
            async update(id, properties) {
                navigated.push(properties.url);
                const tab = { id, ...properties, status: "complete" };
                if (options.update) return options.update(id, properties, ext.tabs);
                ext.tabs.onUpdated.emit(id, { status: "complete" }, tab);
                return tab;
            },
            async sendMessage(id, message) {
                const reply = options.sendMessage ? await options.sendMessage(id, message, env) : { ok: true, items: [] };
                return { accountId: "1", pageId: "collection-page", sections: [], ...reply };
            },
            async remove(id) { removed.push(id); ext.tabs.onRemoved.emit(id); }
        } };
        const { StorageUtil } = production("src/storage/class/StorageUtil.js", ["StorageUtil"], { ext });
        class ClockCoordinator extends RefreshCoordinator {
            constructor({ storage }) { super({ storage, now: () => env.clock.now,
                random: () => 0.5, tokenFactory: () => "background-" + (++nextTimer) }); }
        }
        production("src/storage/service_worker.js", [], {
            // Account boundaries have their own integration/regression suite.
            AccountSession: class {
                serial(fn) { return fn(); }
                run(message, from, fn) { return fn(); }
                async authorize() { return "1"; }
                forget() { return Promise.resolve(); }
            },
            ext, StorageUtil, RefreshCoordinator: ClockCoordinator, importScripts() {},
            URL: typeof URL === "function" ? URL : TestURL,
            setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
            clearTimeout(id) { timers.delete(id); }, console: { warn() {}, error() {} }
        });
        const message = (data, from = sender(1)) => new Promise((resolve, reject) => {
            const handled = ext.runtime.onMessage.emit({ accountId: "1", pageId: "owner-page", ...data }, from, resolve);
            if (!handled.includes(true)) reject(new Error("Message was not handled"));
        });
        return { ...env, ext, message, created, removed, navigated, timers };
    }

    test("progress survives background restart and rejects other tabs and invalid counters", async () => {
        const env = environment(dueState());
        const claim = await env.coordinator.claim({ mode: "manual", pageId: "document-a" }, sender(1));
        const message = { token: claim.token, progress: { phase: "courses", completed: 3, total: 14, saved: 8 } };
        equal((await env.coordinator.progress(message, sender(2))).owned, false);
        equal((await env.coordinator.progress({ ...message, token: "wrong" }, sender(1))).owned, false);
        await rejects(() => env.coordinator.progress({ ...message, progress: { ...message.progress, completed: 15 } }, sender(1)));
        equal((await env.coordinator.progress(message, sender(1))).owned, true);
        equal((await env.create().load()).state.lease.progress, { ...message.progress, at: baseTime });
        await env.coordinator.pageReady("document-b", sender(2));
        await env.coordinator.pageReady("document-a", sender(1));
        assert((await env.coordinator.status(sender(2))).busy, "Other tabs and same document preserve owner");
        env.state.assign_list = [{ assignId: 42 }];
        await env.coordinator.pageReady("document-b", sender(1));
        equal(env.state.refreshCoordinator.lease, null);
        equal(env.state.refreshHistory.attempt.reason, "navigation");
        equal(env.state.assign_list, [{ assignId: 42 }]);
        assert(!env.state.scrapeCooldown, "Interruption is not success");
        assert((await env.coordinator.claim({ mode: "manual" }, sender(2))).granted, "Manual retry is immediate");
    });

    test("navigation interruption is delivered once to the owner replacement page", async () => {
        for (const path of ['page-ready', 'pagehide', 'tab-gone']) {
            const env = environment();
            const claim = await env.coordinator.claim({ mode: 'manual', pageId: 'old' }, sender(1));
            if (path === 'pagehide') await env.coordinator.finish({ token: claim.token, outcome: 'cancelled', reason: 'navigation' }, sender(1));
            if (path === 'tab-gone') await env.coordinator.tabGone(1);
            assert(!(await env.coordinator.pageReady('other', sender(2))).navigationInterrupted);
            assert((await env.coordinator.pageReady('new', sender(1))).navigationInterrupted, path);
            assert(!(await env.coordinator.pageReady('again', sender(1))).navigationInterrupted, 'Old interruption must not reappear');
        }
        const env = environment();
        const claim = await env.coordinator.claim({ mode: 'manual', pageId: 'old' }, sender(1));
        await env.coordinator.finish({ token: claim.token, outcome: 'success' }, sender(1));
        assert(!(await env.coordinator.pageReady('new', sender(1))).navigationInterrupted);
    });

    test("heartbeats cannot keep stalled preparation or progress alive", async () => {
        for (const progressed of [false, true]) {
            const env = environment(dueState());
            const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
            if (progressed) await env.coordinator.progress({ token: claim.token,
                progress: { phase: "courses", completed: 0, total: 14, saved: 0 } }, sender(1));
            const timeout = progressed ? RefreshCoordinator.progressMs : RefreshCoordinator.preparationMs;
            for (let elapsed = 10000; elapsed < timeout; elapsed += 10000) {
                env.clock.now = baseTime + elapsed;
                assert((await env.coordinator.heartbeat(claim.token, sender(1))).owned);
            }
            env.clock.now = baseTime + timeout;
            equal((await env.create().status(sender(2))).busy, false);
            equal(env.state.refreshHistory.attempt.reason, "timeout");
            equal((await env.coordinator.finish({ token: claim.token, outcome: "success", fullSweep: true }, sender(1))).owned, false);
            assert(!env.state.scrapeCooldown);
            assert((await env.coordinator.claim({ mode: "manual" }, sender(2))).granted);
        }
    });

    test("owner navigation and close events release the shared lease", async () => {
        for (const close of [false, true]) {
            const env = background(dueState());
            await env.message({ type: "REFRESH_PAGE_READY", pageId: "a" });
            const claim = await env.message({ type: "REFRESH_CLAIM", mode: "manual", pageId: "a" });
            await env.message({ type: "REFRESH_PROGRESS", token: claim.token,
                progress: { phase: "courses", completed: 2, total: 14, saved: 4 } });
            env.ext.tabs.onUpdated.emit(2, { status: "loading" });
            assert((await env.message({ type: "REFRESH_STATUS" })).busy);
            if (close) env.ext.tabs.onRemoved.emit(1);
            else env.ext.tabs.onUpdated.emit(1, { status: "loading" });
            equal((await env.message({ type: "REFRESH_STATUS" }, sender(2))).busy, false);
            equal(env.state.refreshHistory.attempt.reason, "navigation");
        }
    });

    test("initial random phase persists across reloads and tabs", async () => {
        const env = environment();
        const initial = await env.coordinator.status(sender(1));
        equal(initial.nextAt, baseTime + 3 * minute);
        equal(initial.busy, false);
        const reloaded = env.create(() => 1);
        const denied = await reloaded.claim({ mode: "auto" }, sender(2));
        equal(denied, { ok: true, granted: false, reason: "scheduled", nextAt: initial.nextAt });
        equal(env.writes.length, 1, "Reading an existing phase must not regenerate it");
    });

    test("simultaneous auto claims grant exactly one lease", async () => {
        const env = environment(dueState());
        const responses = await Promise.all([
            env.coordinator.claim({ mode: "auto" }, sender(1)),
            env.coordinator.claim({ mode: "auto" }, sender(2))
        ]);
        equal(responses.map(value => value.granted), [true, false]);
        equal(responses[1].reason, "busy");
        equal(env.state.refreshCoordinator.lease.tabId, 1);
        equal(responses[0].listDue, true);
    });

    test("background restart preserves live lease and jitters expired recovery", async () => {
        const env = environment(dueState());
        const first = await env.coordinator.claim({ mode: "auto" }, sender(1));
        const reloaded = env.create();
        equal((await reloaded.claim({ mode: "auto" }, sender(2))).reason, "busy");
        env.clock.now += RefreshCoordinator.leaseMs + 1;
        const delayed = await reloaded.claim({ mode: "auto" }, sender(2));
        equal(delayed.reason, "scheduled");
        equal(delayed.nextAt, env.clock.now + 3 * minute);
        equal((await reloaded.heartbeat(first.token, sender(1))).owned, false);
        env.clock.now = delayed.nextAt;
        const next = await reloaded.claim({ mode: "auto" }, sender(2));
        assert(next.granted && next.token !== first.token);
        equal((await reloaded.finish({ token: first.token, outcome: "success", fullSweep: true }, sender(1))).owned, false);
        equal(env.state.refreshCoordinator.lease.token, next.token);
    });

    test("long overdue reopen is staggered once and survives reload", async () => {
        const env = environment(dueState());
        env.clock.now += 4 * 60 * minute;
        const wake = await env.coordinator.claim({ mode: "auto" }, sender(1));
        equal(wake.reason, "scheduled");
        equal(wake.nextAt, env.clock.now + 3 * minute);
        const reloaded = env.create(() => 0);
        equal((await reloaded.claim({ mode: "auto" }, sender(2))).nextAt, wake.nextAt);
        env.clock.now = wake.nextAt;
        assert((await reloaded.claim({ mode: "auto" }, sender(2))).granted);
    });

    test("manual refresh settings persist and retain cross-tab exclusion", async () => {
        const env = environment({ ...dueState(), scrapeCooldown: new Date(baseTime).toISOString() });
        equal((await env.coordinator.claim({ mode: "manual" }, sender(1))).reason, "cooldown");
        await env.storage.set({ manualCooldownDisabled: true });
        for (let i = 0; i < 2; i++) {
            const coordinator = env.create(); // Also exercise nonpersistent background restart.
            equal((await coordinator.status(sender(1))).cooldownUntil, 0);
            const claim = await coordinator.claim({ mode: "manual" }, sender(1));
            assert(claim.granted, "The override persists after a successful run");
            equal((await env.create().claim({ mode: "manual" }, sender(2))).reason, "busy");
            await coordinator.finish({ token: claim.token, outcome: "success", fullSweep: true }, sender(1));
        }
        assert(env.state.manualCooldownDisabled === true);
        assert(env.state.scrapeCooldown, "Keep the successful refresh time");
        await env.storage.set({ manualCooldownDisabled: false });
        equal((await env.create().claim({ mode: "manual" }, sender(1))).reason, "cooldown");
        await env.storage.set({ manualCooldownDisabled: "true" });
        equal((await env.create().claim({ mode: "manual" }, sender(1))).reason, "cooldown");
    });

    test("manual claims bypass automatic phase but honor persisted cooldown", async () => {
        const env = environment();
        const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        assert(claim.granted);
        const [finished, competing] = await Promise.all([
            env.coordinator.finish({ token: claim.token, outcome: "success", fullSweep: true }, sender(1)),
            env.coordinator.claim({ mode: "manual" }, sender(2))
        ]);
        assert(finished.owned);
        equal(competing.reason, "cooldown");
        equal(competing.nextAt, baseTime + 3 * 60 * minute);
        equal(env.state.scrapeCooldown, new Date(baseTime).toISOString());
        const finalWrite = env.writes[env.writes.length - 1];
        assert(finalWrite.scrapeCooldown && finalWrite.refreshCoordinator.lease === null,
            "Success cooldown and lease release must be one storage write");
        equal((await env.create().claim({ mode: "manual" }, sender(3))).reason, "cooldown");
    });

    test("heartbeat and finish require the same token and owner tab", async () => {
        const env = environment(dueState());
        const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        env.clock.now += 20 * 1000;
        equal((await env.coordinator.heartbeat(claim.token, sender(2))).owned, false);
        equal((await env.coordinator.heartbeat("other", sender(1))).owned, false);
        equal((await env.coordinator.finish({ token: claim.token, outcome: "success" }, sender(2))).owned, false);
        const beat = await env.coordinator.heartbeat(claim.token, sender(1));
        equal(beat.expiresAt, env.clock.now + RefreshCoordinator.leaseMs);
        equal((await env.coordinator.status(sender(2))).mode, "manual");
    });

    test("pagination continues in 5 to 10 minutes without advancing list freshness", async () => {
        const env = environment(dueState());
        const claim = await env.coordinator.claim({ mode: "auto" }, sender(1));
        const cursor = { cursor: { from: 1, to: 2, after: 50 } };
        const result = await env.coordinator.finish({ token: claim.token, outcome: "success",
            collectorState: cursor, moreWork: true, listComplete: false }, sender(1));
        equal(result.nextListAt, baseTime);
        equal(result.nextAt, baseTime + 7.5 * minute);
        equal((await env.coordinator.claim({ mode: "auto" }, sender(2))).reason, "scheduled");
        env.clock.now = result.nextAt;
        const continued = await env.coordinator.claim({ mode: "auto" }, sender(2));
        equal(continued.state, cursor);
        const complete = await env.coordinator.finish({ token: continued.token, outcome: "success",
            listComplete: true, moreWork: false }, sender(2));
        equal(complete.nextListAt, env.clock.now + 65 * minute);
        equal(complete.nextAt, env.clock.now + 60 * minute);
    });

    test("partial failures back off even when the list is overdue", async () => {
        const env = environment(dueState());
        for (const minutes of [15, 30, 60, 120, 120]) {
            const claim = await env.coordinator.claim({ mode: "auto" }, sender(1));
            assert(claim.granted);
            const failed = await env.coordinator.finish({ token: claim.token, outcome: "partial",
                listComplete: true, collectorState: { retry: minutes } }, sender(1));
            equal(failed.nextListAt, baseTime, "Partial results do not advance complete-list freshness");
            equal(failed.nextAt, env.clock.now + minutes * minute);
            equal((await env.coordinator.claim({ mode: "auto" }, sender(2))).reason, "scheduled");
            assert(!env.state.scrapeCooldown);
            env.clock.now = failed.nextAt;
        }
    });

    test("cancellation preserves state and imposes a short shared pause", async () => {
        const env = environment(dueState({ collectorState: { old: true }, failures: 2 }));
        const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        const result = await env.coordinator.finish({ token: claim.token, outcome: "cancelled",
            collectorState: { cursor: { after: 7 } } }, sender(1));
        equal(result.nextAt, baseTime + 2 * minute);
        equal(env.state.refreshCoordinator.failures, 2);
        equal(env.state.refreshCoordinator.collectorState, { cursor: { after: 7 } });
        equal((await env.coordinator.claim({ mode: "auto" }, sender(2))).reason, "scheduled");
        assert(!env.state.scrapeCooldown);
    });

    test("real temporary collection tab cannot trigger automatic work", async () => {
        const env = environment(dueState());
        const claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        await env.coordinator.setTemporaryTab(claim.token, sender(1), 77);
        equal((await env.coordinator.claim({ mode: "auto" }, sender(77))).reason, "temporary");
        equal((await env.create().claim({ mode: "auto" }, sender(77))).reason, "temporary");
        await env.coordinator.clearTemporaryTab(88);
        equal(env.state.refreshCoordinator.temporaryTabId, 77);
        await env.coordinator.clearTemporaryTab(77);
        equal(env.state.refreshCoordinator.temporaryTabId, null);
    });

    test("invalid sender and unsafe or oversized state cannot mutate lease", async () => {
        const env = environment(dueState());
        await rejects(() => env.coordinator.claim({ mode: "manual" }, { tab: { id: 1, url: "https://example.com/" } }), /ログイン/);
        const { token } = await env.coordinator.claim({ mode: "manual" }, sender(1));
        for (const collectorState of [{ bad: NaN }, { bad: undefined }, { bad: new Date() }, { text: "x".repeat(1000001) }]) {
            await rejects(() => env.coordinator.finish({ token, outcome: "success", collectorState }, sender(1)), /更新状態/);
            equal(env.state.refreshCoordinator.lease.token, token);
        }
        const circular = {}; circular.self = circular;
        await rejects(() => env.coordinator.finish({ token, outcome: "success", collectorState: circular }, sender(1)), /更新状態/);
        await env.coordinator.finish({ token, outcome: "success", collectorState: { valid: [1, null, "ok"] } }, sender(1));
        equal(env.state.refreshCoordinator.collectorState, { valid: [1, null, "ok"] });
    });

    test("storage failure reports no grant and the queue recovers", async () => {
        const env = environment(dueState());
        env.failNextWrite();
        await rejects(() => env.coordinator.claim({ mode: "manual" }, sender(1)), /Storage failed/);
        equal(env.state.refreshCoordinator.lease, null);
        assert((await env.coordinator.claim({ mode: "manual" }, sender(2))).granted);
    });

    test("freshness TTL distinguishes upcoming, overdue and hidden tasks", async () => {
        const hour = 60 * minute;
        equal(RefreshCoordinator.detailInterval({ due: new Date(baseTime + 12 * hour).toISOString() }, baseTime), 3 * hour);
        equal(RefreshCoordinator.detailInterval({ due: new Date(baseTime - minute).toISOString() }, baseTime), 12 * hour);
        equal(RefreshCoordinator.detailInterval({ due: null }, baseTime), 12 * hour);
        equal(RefreshCoordinator.detailInterval({ show: false, due: new Date(baseTime).toISOString() }, baseTime), 24 * hour);
        equal(RefreshCoordinator.detailInterval({ status: "complete" }, baseTime), 24 * hour);
        assert(!RefreshCoordinator.detailDue({ fetchedAt: baseTime - 2 * hour, due: new Date(baseTime + hour).toISOString() }, baseTime));
        assert(RefreshCoordinator.detailDue({ fetchedAt: baseTime - 3 * hour, due: new Date(baseTime + hour).toISOString() }, baseTime));
        assert(RefreshCoordinator.detailDue({ fetchedAt: baseTime + hour }, baseTime));
    });

    test("background messages share manual and auto locks with TAB_COURSE", async () => {
        const env = background({ ...dueState(), courseIds: [1] });
        const claim = await env.message({ type: "REFRESH_CLAIM", mode: "manual" });
        assert(claim.granted);
        equal((await env.message({ type: "REFRESH_CLAIM", mode: "auto" }, sender(2))).reason, "busy");
        const wrong = await env.message({ type: "TAB_COURSE", refreshToken: "wrong" });
        equal(wrong.ok, false);
        equal(env.created.length, 0);
        const result = await env.message({ type: "TAB_COURSE", refreshToken: claim.token });
        equal(result, { ok: true, result: { courses: 1, saved: 0, failed: 0, errors: [] } });
        equal((await env.message({ type: "REFRESH_STATUS" })).busy, true,
            "Caller-owned TAB_COURSE must leave FINISH to the caller");
        equal(env.state.refreshCoordinator.temporaryTabId, null);
        equal(env.removed, [77]);
        await env.message({ type: "REFRESH_FINISH", token: claim.token, outcome: "success", fullSweep: true });
        equal((await env.message({ type: "REFRESH_CLAIM", mode: "manual" }, sender(2))).reason, "cooldown");
    });

    test("legacy TAB_COURSE acquires lease and writes cooldown only after success", async () => {
        const env = background({ ...dueState(), courseIds: [1] });
        const response = await env.message({ type: "TAB_COURSE" });
        assert(response.ok);
        equal(env.state.refreshCoordinator.lease, null);
        equal(env.state.scrapeCooldown, new Date(baseTime).toISOString());
        equal(env.state.refreshCoordinator.nextListAt, baseTime,
            "HTML sweep does not claim the calendar API was polled");
        equal((await env.message({ type: "TAB_COURSE" }, sender(2))).reason, "cooldown");
        equal(env.created.length, 1);
    });

    test("duplicate TAB_COURSE messages with one valid token start only one tab", async () => {
        const env = background({ ...dueState(), courseIds: [1] });
        const claim = await env.message({ type: "REFRESH_CLAIM", mode: "manual" });
        const responses = await Promise.all([
            env.message({ type: "TAB_COURSE", refreshToken: claim.token }),
            env.message({ type: "TAB_COURSE", refreshToken: claim.token })
        ]);
        equal(responses.map(value => value.ok), [true, false]);
        equal(env.created.length, 1);
        equal(env.removed, [77]);
    });

    test("TAB_COURSE saves actual task before successful finish and excludes its tab", async () => {
        let env;
        let insideClaim;
        env = background({ ...dueState(), courseIds: [5] }, {
            async sendMessage(id, message) {
                if (message.type === "COLLECT_COURSE_ITEMS") {
                    insideClaim = await env.message({ type: "REFRESH_CLAIM", mode: "auto" }, sender(id));
                    return { ok: true, items: [{ type: "assign", id: 42 }] };
                }
                return { ok: true, data: { group: "assign_list", assignId: 42, assignName: "Task", status: "incomplete" } };
            }
        });
        const response = await env.message({ type: "TAB_COURSE" });
        equal(insideClaim.reason, "temporary");
        equal(response.result.saved, 1);
        equal(env.state.assign_list[0].courseId, 5);
        assert(Number.isFinite(env.state.assign_list[0].fetchedAt));
        const saveIndex = env.writes.findIndex(values => values.assign_list);
        const finishIndex = env.writes.findIndex(values => values.scrapeCooldown);
        assert(saveIndex >= 0 && finishIndex > saveIndex, "Lease/cooldown must finish after awaited task save");
        equal(env.timers.size, 0);
    });

    test("failed task save prevents successful manual cooldown", async () => {
        const env = background({ ...dueState(), courseIds: [1] }, {
            async sendMessage(id, message) {
                return message.type === "COLLECT_COURSE_ITEMS"
                    ? { ok: true, items: [{ type: "quiz", id: 43 }] }
                    : { ok: true, data: { group: "quiz_list", quizId: 43, quizName: "Quiz" } };
            }
        });
        const set = env.storage.set;
        env.storage.set = async values => {
            if (values.quiz_list) throw new Error("Task save failed");
            return set(values);
        };
        const response = await env.message({ type: "TAB_COURSE" });
        equal(response.result.saved, 0);
        equal(response.result.failed, 1);
        equal(env.state.refreshCoordinator.failures, 1);
        equal(env.state.refreshCoordinator.lease, null);
        assert(!env.state.scrapeCooldown);
        assert(!env.state.quiz_list);
        equal(env.removed, [77]);
    });

    test("TAB_COURSE stops on lost lease without fetching another task", async () => {
        const env = background({ ...dueState(), courseIds: [1, 2] }, {
            async sendMessage(id, message, fixture) {
                fixture.clock.now += RefreshCoordinator.leaseMs + 1;
                return { ok: true, items: [{ type: "assign", id: 42 }] };
            }
        });
        const claim = await env.message({ type: "REFRESH_CLAIM", mode: "manual" });
        const response = await env.message({ type: "TAB_COURSE", refreshToken: claim.token });
        equal(response.ok, false);
        assert(response.error.includes("実行権"));
        equal(env.navigated, [root + "course/view.php?id=1"]);
        equal(env.removed, [77]);
        equal(env.state.refreshCoordinator.temporaryTabId, null);
        assert(!env.state.assign_list);
    });

    test("TAB_COURSE stops on authentication redirect and schedules backoff", async () => {
        for (const redirect of [root + "login/index.php", root + "auth/saml2/login.php", "https://sso.example.com/login"]) {
        const env = background({ ...dueState(), courseIds: [1, 2] }, {
            async update(id, properties, tabs) {
                const tab = { id, url: redirect, status: "complete" };
                tabs.onUpdated.emit(id, { status: "complete" }, tab);
                return tab;
            }
        });
        const result = await env.message({ type: "TAB_COURSE" });
        equal(result.ok, false);
        assert(result.error.includes("ログイン"));
        equal(env.navigated.length, 1);
        equal(env.removed, [77]);
        equal(env.state.refreshCoordinator.failures, 1);
        equal(env.state.refreshCoordinator.nextWorkAt, baseTime + 15 * minute);
        assert(!env.state.scrapeCooldown);
        equal(env.timers.size, 0);
        }
    });

    test("coverage advances only after successful complete acquisition and save", async () => {
        const env = environment(dueState());
        let claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        await env.coordinator.finish({ token: claim.token, outcome: "success", fullSweep: true }, sender(1));
        equal(env.state.refreshHistory.fullSweepAt, baseTime);
        assert(!env.state.refreshHistory.calendarAt);
        env.clock.now += 4 * 60 * minute;
        claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        await env.coordinator.finish({ token: claim.token, outcome: "partial", fullSweep: true }, sender(1));
        equal(env.state.refreshHistory.fullSweepAt, baseTime);
        equal(env.state.refreshHistory.attempt.outcome, "partial");
        claim = await env.coordinator.claim({ mode: "manual" }, sender(1));
        env.failNextWrite();
        await rejects(() => env.coordinator.finish({ token: claim.token, outcome: "success", fullSweep: true }, sender(1)), /Storage failed/);
        equal(env.state.refreshHistory.fullSweepAt, baseTime);
        assert(env.state.refreshCoordinator.lease, "Failed finish does not claim completion");
    });

    test("partial pagination never advances the last completed calendar timestamp", async () => {
        const env = environment(dueState());
        let claim = await env.coordinator.claim({ mode: "auto" }, sender(1));
        const first = await env.coordinator.finish({ token: claim.token, outcome: "success", moreWork: true, listComplete: false }, sender(1));
        assert(!env.state.refreshHistory.calendarAt);
        env.clock.now = first.nextAt;
        claim = await env.coordinator.claim({ mode: "auto" }, sender(1));
        await env.coordinator.finish({ token: claim.token, outcome: "success", listComplete: true }, sender(1));
        equal(env.state.refreshHistory.calendarAt, env.clock.now);
        assert(!env.state.refreshHistory.fullSweepAt);
    });

    async function run() {
        let failures = 0;
        for (const entry of tests) {
            try { await entry.run(); log("PASS " + entry.name); }
            catch (error) { failures++; log("FAIL " + entry.name + ": " + error + (error.stack ? "\n" + error.stack : "")); }
        }
        log((tests.length - failures) + "/" + tests.length + " refresh coordinator checks passed");
        if (failures) throw new Error(failures + " regression check(s) failed");
    }
    let completed = false, failure;
    run().then(() => { completed = true; }, error => { completed = true; failure = error; if (isNode) process.exitCode = 1; });
    if (!isNode && typeof drainMicrotasks === "function") {
        drainMicrotasks();
        if (!completed) throw new Error("Pending asynchronous test work");
        if (failure) throw failure;
    }
})();
