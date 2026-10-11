// Dependency-free account isolation checks, also runnable with macOS jsc.
(async () => {
    const node = typeof require === "function";
    const read = node ? path => require("fs").readFileSync(path, "utf8") : readFile;
    const log = node ? console.log : print;
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const copy = value => JSON.parse(JSON.stringify(value));
    class TestURL {
        constructor(value, base) {
            if (value.startsWith("/")) value = new TestURL(base).origin + value;
            const match = /^(https?:)\/\/([^/]+)([^?#]*)(?:\?([^#]*))?/.exec(value);
            if (!match) throw new Error("Invalid URL");
            this.origin = match[1] + "//" + match[2];
            this.pathname = match[3];
            this.searchParams = { get: key => {
                const pair = (match[4] || "").split("&").find(part => part.split("=")[0] === key);
                return pair ? pair.split("=")[1] : null;
            } };
        }
    }
    const state = {};
    const { AccountSession } = Function("URL", "globalThis", "CustomEvent", read("src/common/account.js") + ";return {AccountSession};")(TestURL, state, class { constructor(type) { this.type = type; } });
    const values = { assign_list: [{ assignId: 1, file: "unowned.pdf" }], courseIds: [9] };
    let fail = false;
    const storage = {
        async get(keys) {
            if (typeof keys === "string") keys = [keys];
            return copy(Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]])));
        },
        async set(update) {
            if (fail) { fail = false; throw new Error("Write failed"); }
            Object.assign(values, copy(update));
        }
    };
    let session = new AccountSession({ storage });
    const url = "https://cms7.ict.nitech.ac.jp/moodle40a/my/";
    const sender = (id, documentId = "doc" + id) => ({ url, tab: { id }, frameId: 0, documentId });
    const page = (accountId, pageId) => ({ accountId, pageId });
    const a = page(11, "a"), b = page(22, "b");
    const denied = async operation => {
        let rejected = false;
        try { await operation(); } catch { rejected = true; }
        assert(rejected, "An old or unrelated page must be rejected");
    };
    await session.register(a, sender(1));
    assert(values.assign_list.length === 0 && values.courseIds.length === 0, "Unowned legacy data must not appear for the first account");
    assert(values["duedleAccountData:legacy"].assign_list[0].file === "unowned.pdf", "Legacy cache remains recoverable");
    await session.run(a, sender(1), () => storage.set({ assign_list: [{ assignId: 1, file: "a-private.pdf" }], quiz_list: [{ quizId: 1, point: 90 }], courseIds: [1], history: [{ title: "A" }], scrapeCooldown: 99, refreshCoordinator: { lease: "old" } }));
    await session.register(b, sender(2));
    assert(values.assign_list.length === 0 && values.quiz_list.length === 0 && values.history.length === 0 && values.scrapeCooldown === null, "All personal data must change together");
    await denied(() => session.run(a, sender(1), () => storage.set({ assign_list: [{ file: "stale" }] })));
    await session.run(b, sender(2), () => storage.set({ assign_list: [{ assignId: 1, file: "b-private.pdf" }] }));
    session = new AccountSession({ storage }); // Nonpersistent background restart.
    await session.run(b, sender(2), async () => {});
    await session.register(page(11, "a-new"), sender(1, "new-document"));
    assert(values.assign_list[0].file === "a-private.pdf" && values.quiz_list[0].point === 90 && values.courseIds[0] === 1 && values.scrapeCooldown === 99, "Returning to an account restores its own data");
    assert(values.refreshCoordinator === null, "Returning cannot revive an old lease");
    await denied(() => session.run(a, sender(1), async () => {}));
    await denied(() => session.run(page(11, "a-new"), sender(1, "old-document"), async () => {}));
    await denied(() => session.run(page(11, "a-new"), { ...sender(1, "new-document"), frameId: 1 }, async () => {}));
    await denied(() => session.run(page(11, "a-new"), { ...sender(1), url: "https://example.invalid/moodle40a/my/" }, async () => {}));
    // A save queued before a switch completes in A; a save after the switch is rejected.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const save = session.run(page(11, "a-new"), sender(1, "new-document"), async () => {
        await gate;
        await storage.set({ history: [{ title: "Saved before switch" }] });
    });
    const switchAccount = session.register(b, sender(2));
    release();
    await Promise.all([save, switchAccount]);
    assert(values["duedleAccountData:11"].history[0].title === "Saved before switch" && values.history.length === 0, "Concurrent saves cannot cross the account boundary");
    await session.register(page(null, "logout"), sender(3));
    assert(values.duedleAccount === null && values.assign_list.length === 0, "Logout and unidentified pages expose no personal cache");
    assert(values["duedleAccountData:legacy"].assign_list[0].file === "unowned.pdf", "Logout cannot overwrite the recoverable legacy cache");
    await denied(() => session.run(b, sender(2), async () => {}));
    fail = true;
    await denied(() => session.register(b, sender(2)));
    await session.register(b, sender(2));
    assert(values.assign_list[0].file === "b-private.pdf", "A failed write cannot poison subsequent account operations");
    const doc = (script, links = [], login = false, navigationId = null) => ({
        querySelector: () => login ? {} : null,
        querySelectorAll: selector => selector === "script:not([src])" ? [{ textContent: script }]
            : selector.startsWith('#nav-notification') ? navigationId ? [{ getAttribute: name => name === 'data-userid' ? String(navigationId) : null }] : []
            : links.map(href => ({ getAttribute: () => href }))
    });
    assert(AccountSession.findUser(doc('M.cfg={"sesskey":"abc123"};', [], false, 22), url) === '22', 'Moodle standard notification ID works without userid in M.cfg');
    assert(AccountSession.findUser(doc('M.cfg={"userid":11,"nested":{"text":"}\\\""}};'), url) === "11", "JSON bootstrap handles braces and escaped quotes");
    assert(AccountSession.findUser(doc('M.cfg={userid:22};', [url.replace("my/", "user/profile.php?id=22")]), url) === "22", "Own-profile link supports non-JSON themes");
    assert(AccountSession.findUser(doc('M.cfg={"userid":11};', [], true), url) === null, "Login forms cannot expose cached bootstrap identity");
    assert(AccountSession.findUser(doc('M.cfg={"userid":11};'), url.replace("my/", "login/index.php")) === null, "Login URLs cannot expose bootstrap identity");
    assert(AccountSession.findUser(doc('window.bad=1;', ["https://example.invalid/moodle40a/user/profile.php?id=11"]), url) === null, "Unrelated links cannot establish identity");
    let deliver, started;
    const requestStarted = new Promise(resolve => { started = resolve; });
    const fetchedReply = new Promise(resolve => { deliver = resolve; });
    const contentDoc = doc('M.cfg={"userid":22};');
    contentDoc.getElementById = () => null;
    contentDoc.dispatchEvent = () => {};
    const native = {
        runtime: { async sendMessage(message) {
            if (message.type === "ACCOUNT_GET") { started(); return fetchedReply; }
            return { ok: true };
        } },
        storage: { local: storage, onChanged: { addListener() {} } }
    };
    const nativeRuntime = native.runtime;
    Object.defineProperty(nativeRuntime, "getURL", {value(path) { assert(this === nativeRuntime, "Runtime methods retain their native receiver"); return "safari-web-extension://test/" + path; }});
    Object.defineProperty(nativeRuntime, "onMessage", {value:{addListener() {}}});
    const sync = {async get() {return {displayShow:true};}};
    Object.defineProperty(native.storage, "sync", {value:sync});
    const inherited = Object.create(native);
    const api = AccountSession.contentAPI(inherited, contentDoc, url);
    assert(api.runtime.getURL("common/help.html") === "safari-web-extension://test/common/help.html", "Non-enumerable runtime methods remain available");
    assert(api.runtime.onMessage === nativeRuntime.onMessage, "Runtime message events remain available");
    assert(api.storage.sync === sync && (await api.storage.sync.get()).displayShow, "Inherited storage and non-enumerable sync preferences remain available");
    const pendingRead = api.storage.local.get("assign_list");
    await requestStarted;
    state.duedleAssertAccountDocument(doc('M.cfg={"userid":22};'), url);
    let mismatch;
    try { state.duedleAssertAccountDocument(doc('M.cfg={"userid":11};'), url); } catch (error) { mismatch = error; }
    assert(mismatch?.code === "AUTH_REQUIRED" && state.duedleAccountActive === false, "Changed cookies stop collection before saving another user's document");
    deliver({ ok: true, data: { assign_list: [{ file: "b-private.pdf" }] } });
    assert(!("assign_list" in await pendingRead), "A late personal-data response cannot repopulate an invalidated page");
    log("PASS account isolation: legacy quarantine, account restore, background restart, stale documents, logout, queued saves, failed writes and safe identity parsing");
})().catch(error => {
    if (typeof process !== "undefined") { console.error(error); process.exitCode = 1; }
    else { print(error.stack || error); quit(1); }
});
