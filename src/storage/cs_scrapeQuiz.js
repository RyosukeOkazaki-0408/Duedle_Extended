(() => {
    const data = ScrapeQuiz.getData(document);
    if (data) StorageUtil.saveData("quiz_list", "quizId", data).catch(console.error);
    ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type !== "COLLECT_TASK") return false;
        const current = ScrapeQuiz.getData(document);
        sendResponse(current ? { ok: true, data: current } : { ok: false, error: "小テストを読み取れませんでした" });
        return false;
    });
})();
