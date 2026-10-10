// This file is packaged only in build/debug, which has no Moodle host permissions.
const debugNative = globalThis.browser ?? globalThis.chrome;
const DEBUG_PREFIX = 'duedle-debug:';
const debugClock = { offset: 0, base: 1800000000000, scenario: 'normal' };
const realNow = Date.now.bind(Date);
const DebugDateBase = Date;
globalThis.Date = class extends DebugDateBase {
    constructor(...args) { super(...(args.length ? args : [realNow() + debugClock.offset])); }
    static now() { return realNow() + debugClock.offset; }
};
const debugReady = debugNative.storage.local.get(DEBUG_PREFIX + 'config').then(saved => {
    Object.assign(debugClock, saved[DEBUG_PREFIX + 'config'] || {});
});
function debugArea(area) {
    const prefix = DEBUG_PREFIX + area + ':';
    return {
        get(keys, callback) {
            const promise = debugNative.storage.local.get(null).then(all => {
                const saved = Object.fromEntries(Object.entries(all).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
                if (keys == null) return saved;
                const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
                return Object.fromEntries(names.filter(key => key in saved || typeof keys === 'object' && !Array.isArray(keys)).map(key => [key, saved[key] ?? keys[key]]));
            });
            if (callback) promise.then(callback);
            return promise;
        },
        async set(values) {
            await debugReady;
            if (debugClock.scenario === 'save-failure' && ('assign_list' in values || 'quiz_list' in values)) throw new Error('ダミー保存失敗');
            await debugNative.storage.local.set(Object.fromEntries(Object.entries(values).map(([key, value]) => [prefix + key, value])));
        }
    };
}
const debugChanges = new Map();
globalThis.browser = {
    storage: {
        local: debugArea('local'), sync: debugArea('sync'),
        onChanged: {
            addListener(listener) {
                const wrapped = (changes, area) => {
                    if (area !== 'local') return;
                    if (changes[DEBUG_PREFIX + 'config']) Object.assign(debugClock, changes[DEBUG_PREFIX + 'config'].newValue || {});
                    for (const kind of ['local', 'sync']) {
                        const prefix = DEBUG_PREFIX + kind + ':';
                        const mapped = Object.fromEntries(Object.entries(changes).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
                        if (Object.keys(mapped).length) listener(mapped, kind);
                    }
                };
                debugChanges.set(listener, wrapped);
                debugNative.storage.onChanged.addListener(wrapped);
            },
            removeListener(listener) { debugNative.storage.onChanged.removeListener(debugChanges.get(listener)); debugChanges.delete(listener); }
        }
    },
    runtime: {
        onMessage: debugNative.runtime.onMessage,
        sendMessage: message => debugNative.runtime.sendMessage(message),
        getURL: path => debugNative.runtime.getURL(path)
    }
};
debugNative.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DEBUG_PREFIX + 'config']) Object.assign(debugClock, changes[DEBUG_PREFIX + 'config'].newValue || {});
});
