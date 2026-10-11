const ext = globalThis.browser ?? chrome;
if (typeof document !== "undefined" && typeof location !== "undefined"
    && location.href.startsWith("https://cms7.ict.nitech.ac.jp/moodle40a/")
    && !/\/(?:login|auth)\//.test(location.pathname)) {
    globalThis.duedlePageId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    globalThis.duedlePageReady = ext.runtime.sendMessage({ type: "REFRESH_PAGE_READY", pageId: globalThis.duedlePageId }).catch(console.error);
}
