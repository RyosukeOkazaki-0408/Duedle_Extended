// Integration checks for collection authorization and atomic browsing history.
// Runs in Node.js and macOS JavaScriptCore without third-party packages.
(async () => {
    const node = typeof require === "function";
    const read = node ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = node ? console.log : print;
    const root = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    const copy = value => JSON.parse(JSON.stringify(value));
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected),
        (message || "Values differ") + ": " + JSON.stringify(actual) + " != " + JSON.stringify(expected));
    const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
    const prod = (path, names, bindings = {}) => Function(...Object.keys(bindings), read(path)
        + "\nreturn {" + names.join(",") + "};")(...Object.values(bindings));
    class TestURL {
        constructor(value, base) {
            if (value.startsWith("/")) value = new TestURL(base).origin + value;
            if (value.startsWith("?")) value = String(base).split("?")[0] + value;
            const m = /^(https?:)\/\/([^/]+)([^?#]*)(?:\?([^#]*))?/.exec(value);
            if (!m) throw new Error("Invalid URL");
            this.origin = m[1] + "//" + m[2]; this.pathname = m[3]; this.href = value;
            this.searchParams = { get(key) { const p = (m[4] || "").split("&").find(v => v.split("=")[0] === key); return p ? p.split("=")[1] : null; } };
        }
    }
    const URLType = typeof URL === "function" ? URL : TestURL;
    const event = () => {
        const listeners = new Set();
        return { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); },
            emit(...args) { return [...listeners].map(fn => fn(...args)); } };
    };
    const sender = (id, url = root + "my/") => ({ tab: { id }, url, frameId: 0 });
    const owner = { accountId: "11", pageId: "owner" };
    function background(options = {}) {
        const values = { duedleAccount: "11", duedleAccountTabs: { 1: owner, 2: { accountId: "11", pageId: "other" } },
            assign_list: [{ group: "assign_list", assignId: 8, show: false, file: "old.pdf" }], quiz_list: [], courseIds: [7], history: [] };
        const storage = {
            async get(keys) { if (typeof keys === "string") keys = [keys]; return copy(Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]]))); },
            async set(update) { Object.assign(values, copy(update)); }
        };
        let currentURL = "about:blank", page = 0, message;
        const removed = [], navigated = [], timers = new Map();
        const ext = { storage: { local: storage, onChanged: event() }, runtime: { onMessage: event(), onInstalled: event(), onStartup: event() }, tabs: {
            onUpdated: event(), onRemoved: event(),
            async create() { return { id: 77 }; },
            async update(id, { url }) {
                currentURL = url; page++; navigated.push(url);
                const tab = { id, url, status: "complete" };
                ext.tabs.onUpdated.emit(id, { status: "complete" }, tab);
                return tab;
            },
            async remove(id) { removed.push(id); ext.tabs.onRemoved.emit(id); },
            async sendMessage(id, request) {
                const context = { accountId: "11", pageId: "page-" + page };
                const ready = await message({ type: "ACCOUNT_READY", ...context }, sender(id, currentURL));
                assert(ready.ok, "Fixture page registration succeeds");
                const response = request.type === "COLLECT_COURSE_ITEMS"
                    ? { ok: true, items: [{ type: "assign", id: 8 }], sections: [], ...context }
                    : { ok: true, data: { group: "assign_list", assignId: 8, file: "current.pdf", status: "complete" }, ...context };
                return options.reply ? options.reply({ id, request, response, url: currentURL, context, values, message, storage }) : response;
            }
        } };
        const { AccountSession } = prod("src/common/account.js", ["AccountSession"], { URL: URLType });
        const { StorageUtil } = prod("src/storage/class/StorageUtil.js", ["StorageUtil"], { ext });
        const { RefreshCoordinator } = prod("src/storage/class/RefreshCoordinator.js", ["RefreshCoordinator"], { URL: URLType });
        const { CourseCollector } = prod("src/storage/class/CourseCollector.js", ["CourseCollector"], { URL: URLType });
        prod("src/storage/service_worker.js", [], { ext, AccountSession, StorageUtil, RefreshCoordinator, CourseCollector,
            URL: URLType, importScripts() {}, setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
        message = (request, from = sender(1)) => new Promise((resolve, reject) => {
            if (!ext.runtime.onMessage.emit({ ...owner, ...request }, from, resolve).includes(true)) reject(new Error("Unhandled message"));
        });
        return { values, storage, message, ext, removed, navigated, timers };
    }
    {
        const env = background();
        const append = (title, id = 1) => env.message({ type: "ACCOUNT_APPEND_HISTORY", pageId: id === 1 ? "owner" : "other",
            entry: { title, url: root + "course/view.php?id=" + id } }, sender(id));
        const replies = await Promise.all([append("Course A"), append("Course B", 2)]);
        assert(replies.every(r => r.ok), "Parallel history appends are authorized");
        equal(env.values.history.map(item => item.title), ["Course A", "Course B"], "Parallel page opens retain both history entries");
        await append(" Course A ");
        equal(env.values.history.map(item => item.title), ["Course B", " Course A "], "Existing title deduplication and ordering are preserved");
        for (let i = 0; i < 12; i++) await append("Course " + i);
        equal(env.values.history.length, 10, "History remains bounded");
        equal(env.values.history[0].title, "Course 2");
        const before = copy(env.values.history);
        equal((await env.message({ type: "ACCOUNT_APPEND_HISTORY", pageId: "stale", entry: { title: "No", url: root + "course/view.php?id=9" } })).ok, false);
        equal((await env.message({ type: "ACCOUNT_APPEND_HISTORY", entry: { title: "No", url: "https://example.invalid/course/view.php?id=9" } })).ok, false);
        equal(env.values.history, before, "Denied history operations never change stored history");
        env.values.refreshCoordinator = { temporaryTabId: 2 };
        equal((await append("Collector", 2)).skipped, true);
        equal(env.values.history, before, "Temporary collection pages leave browsing history untouched");
        const changed = await env.message({ type: "ACCOUNT_READY", accountId: "22", pageId: "foreign" }, sender(2));
        equal(changed.ok, false);
        equal(env.values.duedleAccount, "11", "A temporary tab cannot switch the active account");
        equal((await env.message({ type: "ACCOUNT_READY", accountId: null, pageId: "logout" }, sender(2))).ok, false);
        equal((await env.message({ type: "ACCOUNT_VERIFY", pageId: "old" })).ok, false);
    }
    {
        const env = background();
        const result = await env.message({ type: "TAB_COURSE" });
        assert(result.ok && result.result.saved === 1 && result.result.failed === 0, "Registered same-account detail saves normally");
        equal(env.values.assign_list[0].file, "current.pdf");
        equal(env.values.assign_list[0].show, false, "Collection preserves a user's hidden task setting");
        assert(env.values.scrapeCooldown && env.values.refreshHistory.fullSweepAt, "Successful collection records its success only after saving");
        equal(env.removed, [77], "Only the created temporary tab is removed");
        equal(env.timers.size, 0, "Navigation timers are cleaned up");
        await tick();
        assert(!env.values.duedleCollectionTabs[77], "Closed collector tabs release their account ownership marker");
    }
    {
        const env = background({ async reply({ request, response, values, message, url }) {
            if (request.type !== "COLLECT_TASK") return response;
            equal(values.duedleCollectionTabs[77], "11", "Collection records ownership before navigating");
            const changed = await message({ type: "ACCOUNT_READY", accountId: "22", pageId: "new-account" }, sender(2));
            assert(changed.ok, "A normal tab may switch accounts during collection");
            equal(values.refreshCoordinator, null, "Account switching clears the previous account's refresh lease");
            equal(values.duedleCollectionTabs[77], "11", "Collector ownership survives account switching");
            const delayed = await message({ type: "ACCOUNT_READY", accountId: "11", pageId: "delayed-old-account" }, sender(77, url));
            equal(delayed.ok, false, "A delayed collector cannot switch back to the old account after its lease was cleared");
            equal((await message({ type: "ACCOUNT_READY", accountId: "22", pageId: "new-collector-account" }, sender(77, url))).ok,
                false, "A collector cannot adopt a different account");
            return response;
        } });
        const before = copy(env.values.assign_list);
        equal((await env.message({ type: "TAB_COURSE" })).ok, false, "Account switching stops the old collection");
        equal(env.values.duedleAccount, "22", "Delayed collector registration preserves the newly active account");
        equal(env.values.assign_list, [], "The new account receives no old account data");
        equal(env.values["duedleAccountData:11"].assign_list, before, "The previous account's saved data remains intact");
        equal(env.removed, [77], "Account switching still closes the created collector tab");
        await tick();
        assert(!env.values.duedleCollectionTabs[77], "Account switching does not leak collector markers");
        env.values.duedleCollectionTabs = { 88: "11" };
        env.values.refreshCoordinator = { temporaryTabId: 88, token: "interrupted" };
        env.ext.runtime.onStartup.emit();
        await tick();
        equal(env.values.duedleCollectionTabs, {}, "A full browser restart clears old session tab IDs");
        equal(env.values.refreshCoordinator.temporaryTabId, null, "Restart clears the legacy collector ID as well");
        assert((await env.message({ type: "ACCOUNT_READY", accountId: "33", pageId: "reused-tab" }, sender(88))).ok,
            "A normal tab reusing a former collector's ID can register after browser restart");
    }
    for (const kind of ["missing", "foreign", "stale", "replaced", "unregistered"]) {
        const env = background({ async reply({ request, response, values }) {
            if (request.type !== "COLLECT_TASK") return response;
            if (kind === "missing") { delete response.accountId; delete response.pageId; }
            if (kind === "foreign") response.accountId = "22";
            if (kind === "stale") response.pageId = "old-page";
            if (kind === "replaced") values.duedleAccountTabs[77].pageId = "new-page";
            if (kind === "unregistered") delete values.duedleAccountTabs[77];
            return response;
        } });
        const before = copy(env.values.assign_list);
        const result = await env.message({ type: "TAB_COURSE" });
        equal(result.ok, false, kind + " detail context stops collection");
        equal(env.values.assign_list, before, kind + " detail must not overwrite stored personal data");
        assert(!env.values.scrapeCooldown && !env.values.refreshHistory.fullSweepAt, "Rejected collection cannot claim full success");
        equal(env.removed, [77], "Rejected collection closes its temporary tab");
    }
    {
        const first = root + "course/view.php?id=7&section=1";
        const second = root + "course/view.php?id=7&section=2";
        const env = background({ reply({ request, response, url }) {
            if (request.type === "COLLECT_COURSE_ITEMS") {
                response.sections = url.includes("section=1") ? [first, second] : [first];
                response.items = url.includes("section=2") ? [{ type: "assign", id: 8 }] : [];
            }
            return response;
        } });
        const result = await env.message({ type: "TAB_COURSE" });
        assert(result.ok && result.result.saved === 1 && result.result.failed === 0, "CSE visits linked course sections");
        equal(env.navigated, [root + "course/view.php?id=7", first, second, root + "mod/assign/view.php?id=8"], "Repeated section links do not repeat requests");
    }
    for (const section of [root + "course/view.php?id=8&section=1", "https://example.invalid/course/view.php?id=7&section=1"]) {
        const env = background({ reply({ request, response }) {
            if (request.type === "COLLECT_COURSE_ITEMS") response.sections = [section];
            return response;
        } });
        const result = await env.message({ type: "TAB_COURSE" });
        assert(result.ok && result.result.failed === 1, "Invalid section is reported as a failed course page");
        equal(env.navigated, [root + "course/view.php?id=7"], "CSE never visits an unrelated course or origin");
        assert(!env.values.scrapeCooldown, "Incomplete course cannot start cooldown");
    }
    function content(script, mode) {
        let identity = mode === "delayed" || mode === "unknown" ? null : "11", observer, timeout, handler;
        const globals = {}, messages = [], doc = { documentElement: {},
            querySelector(selector) { return selector === "h1" ? {} : null; },
            querySelectorAll(selector) { return selector.startsWith("#nav-notification") && identity ? [{ getAttribute: () => identity }] : []; },
            getElementById() { return null; }, dispatchEvent() {} };
        const native = { runtime: { onMessage: { addListener(fn) { handler = fn; } }, async sendMessage(message) {
            messages.push(message);
            if (mode === "register-failed" && message.type === "ACCOUNT_READY") return { ok: false, error: "Registration failed" };
            if (mode === "verify-failed" && message.type === "ACCOUNT_VERIFY") return { ok: false, error: "Stale registration" };
            return { ok: true };
        } }, storage: { local: { async get() { return { duedleAccount: "11" }; } }, onChanged: event() } };
        const quiet = { error() {}, warn() {} };
        const { AccountSession } = prod("src/common/account.js", ["AccountSession"], { URL: URLType, globalThis: globals, console: quiet,
            CustomEvent: class {}, MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
            setTimeout(fn) { timeout = fn; return 1; }, clearTimeout() {} });
        const api = AccountSession.contentAPI(native, doc, root + "course/view.php?id=7");
        const data = { group: "assign_list", assignId: 8 };
        prod("src/storage/" + script, [], { ext: api, globalThis: globals, document: doc, location: { href: root + "course/view.php?id=7" }, URL: URLType,
            ScrapeAssign: { getData() { return data; } }, ScrapeQuiz: { getData() { return data; } },
            CourseCollector: { getItems() { return []; }, getSectionURLs() { return []; } }, StorageUtil: { async saveData() {} }, console: quiet });
        const request = () => new Promise(resolve => {
            equal(handler({ type: script === "cs_scrapeTaskList.js" ? "COLLECT_COURSE_ITEMS" : "COLLECT_TASK" }, {}, resolve), true, "Collection keeps the asynchronous response channel open");
        });
        return { globals, messages, request, reveal() { identity = "11"; observer(); }, expire() { timeout(); }, replaceIdentity() { identity = "22"; } };
    }
    for (const script of ["cs_scrapeAssign.js", "cs_scrapeQuiz.js", "cs_scrapeTaskList.js"]) {
        const delayed = content(script, "delayed");
        let replied = false;
        const pending = delayed.request().then(value => { replied = true; return value; });
        await tick();
        equal(replied, false, script + " waits for delayed identity instead of returning unverified data");
        delayed.reveal();
        const response = await pending;
        assert(response.ok && response.accountId === "11" && response.pageId, script + " returns the verified page context");
        assert(delayed.messages.some(message => message.type === "ACCOUNT_VERIFY"), "Collection rechecks registration with the background");
        for (const mode of ["unknown", "register-failed", "verify-failed", "changed"]) {
            const env = content(script, mode);
            if (mode === "changed") { await tick(); env.replaceIdentity(); }
            const pending = env.request();
            if (mode === "unknown") env.expire();
            const response = await pending;
            assert(!response.ok && response.code === "AUTH_REQUIRED" && !response.data && !response.items,
                script + " rejects " + mode + " identity without an empty-success or data response");
        }
    }
    log("PASS collection/account integration: verified identity, delayed/failed registration, stale pages, temporary tabs, atomic history, section traversal and safe cleanup");
})().catch(error => {
    if (typeof process !== "undefined") { console.error(error); process.exitCode = 1; }
    else { print(error.stack || error); quit(1); }
});
if (typeof drainMicrotasks === "function") drainMicrotasks();
