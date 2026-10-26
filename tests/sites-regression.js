// Account IDs can be identical on separate Moodle installations.
(async () => {
    const node = typeof require === "function";
    const read = node ? path => require('fs').readFileSync(path, 'utf8') : readFile;
    const log = node ? console.log : print;
    const assert = (value, message) => { if (!value) throw new Error(message); };
    class SiteURL {
        constructor(value) {
            const match = /^(https?:)\/\/([^/?#]+)([^?#]*)/.exec(String(value));
            if (!match) throw new Error('Invalid URL');
            this.origin = match[1] + '//' + match[2]; this.pathname = match[3] || '/';
        }
    }
    const global = {};
    Function('globalThis', 'URL', read('src/common/sites.js'))(global, SiteURL);
    const { DuedleSites: sites } = global;
    const university = sites.production + '/moodle40a/my/';
    const demo = sites.origins.find(origin => origin !== sites.production) + '/moodle40a/my/';
    assert(sites.allowed(university) && sites.allowed(demo), 'Both explicit Moodle origins must be allowed');
    for (const url of ['https://example.invalid/moodle40a/my/', demo.replace('https:', 'http:'),
        demo.replace('/moodle40a/', '/other/'), demo.replace('.sslip.io', '.sslip.io.attacker.invalid')]) {
        assert(!sites.allowed(url), 'Unrelated hosts/protocols/paths must be rejected');
    }
    const { AccountSession } = Function('globalThis', 'URL', read('src/common/account.js') + ';return { AccountSession };')(global, SiteURL);
    const values = {};
    const storage = { async get(keys) {
        if (typeof keys === 'string') keys = [keys];
        return JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]]))));
    }, async set(data) { Object.assign(values, JSON.parse(JSON.stringify(data))); } };
    const session = new AccountSession({ storage });
    const sender = (url, tab) => ({ url, frameId: 0, tab: { id: tab }, documentId: 'document-' + tab });
    const message = { accountId: '5', pageId: 'university' };
    const demoMessage = { accountId: '5', pageId: 'demo' };
    await session.register(message, sender(university, 1));
    await session.run(message, sender(university, 1), () => storage.set({ assign_list: [{ assignId: 18, file: 'university.pdf' }] }));
    assert(values.duedleAccount === '5', 'Existing university archive keys must remain unchanged');
    await session.register(demoMessage, sender(demo, 2));
    assert(values.assign_list.length === 0, 'A matching numeric ID on the demo must not read university tasks');
    await session.run(demoMessage, sender(demo, 2), () => storage.set({ assign_list: [{ assignId: 18, file: 'demo.pdf' }] }));
    let denied = false;
    try { await session.run(message, sender(university, 1), async () => {}); } catch { denied = true; }
    assert(denied, 'Old university pages must not write into the active demo account');
    await session.register(message, sender(university, 1));
    assert(values.assign_list[0].file === 'university.pdf', 'University data must be restored');
    await session.register(demoMessage, sender(demo, 2));
    assert(values.assign_list[0].file === 'demo.pdf', 'Demo data must be restored separately');
    // Collection-tab markers carry the wire user ID; compare with its site scope.
    values.duedleCollectionTabs = { 3: '5' };
    await session.register({ accountId: '5', pageId: 'collector' }, sender(demo, 3));
    denied = false;
    try { await session.register({ accountId: '5', pageId: 'cross-site' }, sender(university, 3)); } catch { denied = true; }
    assert(denied, 'A temporary collection tab cannot switch sites while collecting');
    log('PASS explicit site allowlist, unchanged university keys, identical-ID data separation/restoration, stale pages and collection-tab isolation');
})().catch(error => { if (typeof console !== 'undefined') console.error(error); throw error; });
