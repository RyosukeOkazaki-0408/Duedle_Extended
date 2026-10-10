(() => {
    const data = ScrapeAssign.getData(document);
    if (data) StorageUtil.saveData("assign_list", "assignId", data).catch(console.error);
    ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type !== "COLLECT_TASK") return false;
        const current = ScrapeAssign.getData(document);
        sendResponse(current ? { ok: true, data: current } : { ok: false, error: "課題を読み取れませんでした" });
        return false;
    });
})();
