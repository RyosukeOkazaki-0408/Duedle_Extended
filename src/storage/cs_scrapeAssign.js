(() => {
    const data = ScrapeAssign.getData(document);
    if (data) StorageUtil.saveData("assign_list", "assignId", data).catch(console.error);
    ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type !== "COLLECT_TASK") return false;
        (async () => {
            const account = await globalThis.duedleCollectAccountContext();
            const current = ScrapeAssign.getData(document);
            return current ? { ok: true, data: current, ...account } : { ok: false, error: "課題を読み取れませんでした" };
        })().then(sendResponse, error => sendResponse({ ok: false, error: error.message, code: error.code }));
        return true;
    });
})();
