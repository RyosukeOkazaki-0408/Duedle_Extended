const nativeExtension = globalThis.browser ?? chrome;
const isMoodleContent = typeof document !== "undefined" && typeof location !== "undefined"
    && location.href.startsWith("https://cms7.ict.nitech.ac.jp/moodle40a/");
const ext = isMoodleContent ? AccountSession.contentAPI(nativeExtension, document, location.href) : nativeExtension;
if (typeof document !== "undefined" && typeof location !== "undefined"
    && location.href.startsWith("https://cms7.ict.nitech.ac.jp/moodle40a/")
    && !/\/(?:login|auth)\//.test(location.pathname)) {
    globalThis.duedlePageReady = ext.runtime.sendMessage({ type: "REFRESH_PAGE_READY", pageId: globalThis.duedlePageId }).catch(console.error);
}
