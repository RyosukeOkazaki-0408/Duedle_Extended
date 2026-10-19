(() => {
    (async () => {
        if (await StorageUtil.markUnavailableDocument(document)) return;
        const data = ScrapeQuiz.getData(document);
        if (data) await StorageUtil.saveData("quiz_list", "quizId", data);
    })().catch(console.error);
    ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type !== "COLLECT_TASK") return false;
        (async () => {
            const account = await globalThis.duedleCollectAccountContext();
            const unavailable = await StorageUtil.markUnavailableDocument(document);
            if (unavailable) return { ok: true, unavailable, ...account };
            const current = ScrapeQuiz.getData(document);
            return current ? { ok: true, data: current, ...account } : { ok: false, error: "小テストを読み取れませんでした" };
        })().then(sendResponse, error => sendResponse({ ok: false, error: error.message, code: error.code }));
        return true;
    });
})();
