// The demo uses memory only. It does not access extension storage or Moodle.
const demoListeners = new Set();
const demoData = globalThis.duedleDemoFixtures();
function demoArea(area) {
    return {
        async get(keys) {
            const data = demoData[area];
            if (keys == null) return structuredClone(data);
            const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
            return Object.fromEntries(names.filter(key => key in data || typeof keys === 'object' && !Array.isArray(keys))
                .map(key => [key, structuredClone(key in data ? data[key] : keys[key])]));
        },
        async set(values) {
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
                changes[key] = { oldValue: demoData[area][key], newValue: structuredClone(value) };
                demoData[area][key] = structuredClone(value);
            }
            for (const listener of demoListeners) listener(changes, area);
        },
    };
}
globalThis.browser = {
    storage: { local: demoArea('local'), sync: demoArea('sync'), onChanged: {
        addListener: listener => demoListeners.add(listener), removeListener: listener => demoListeners.delete(listener),
    } },
    runtime: { getURL: () => '#demo-note', onMessage: { addListener() {}, removeListener() {} },
        async sendMessage(message) {
            if (message.type === 'GET_SETTINGS') return { ok: true, ...demoData.local };
            if (message.type === 'REFRESH_STATUS') return { ok: true, busy: false };
            if (message.type === 'EDIT_TASK') {
                const items = demoData.local[message.table] || [];
                await browser.storage.local.set({ [message.table]: items.map(item =>
                    Number(item[message.idproperty]) === Number(message.id) ? { ...item, [message.property]: message.value } : item) });
                return { ok: true };
            }
            return { ok: false, error: 'This operation requires the real Moodle site.' };
        },
    },
};
// The host's existing WKWebView delegate calls show() after local navigation.
function show() {}
