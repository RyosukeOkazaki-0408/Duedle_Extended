// The review displays one attempt. Read Moodle's aggregate result from the
// overview, then commit only if a newer overview has not been saved meanwhile.
(async () => {
    await globalThis.duedlePageReady;
    if (globalThis.duedleAccountActive !== true) return;
    const review = ScrapeQuizReview.getData(document, location.href);
    if (!review) return;
    const { quiz_list = [] } = await ext.storage.local.get("quiz_list");
    const old = quiz_list.find(quiz => Number(quiz.quizId) === review.quizId);
    if (!old) {
        console.info("小テストの概要ページを開くと成績を保存できます");
        return;
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    window.addEventListener("pagehide", cancel, { once: true });
    document.addEventListener("duedle:account-changed", cancel, { once: true });
    try {
        const collector = new CourseCollector({ signal: controller.signal,
            shouldContinue: async () => globalThis.duedleAccountActive === true });
        const overviewURL = `${CourseCollector.baseURL}mod/quiz/view.php?id=${review.quizId}`;
        const doc = await collector.fetchDocument(overviewURL);
        const data = ScrapeQuiz.getData(doc, overviewURL);
        if (!data) throw new Error("小テストの概要を読み取れませんでした");
        await collector.assertContinue();
        await StorageUtil.saveQuizReviewOverview(data, old.fetchedAt ?? null);
    } finally {
        window.removeEventListener("pagehide", cancel);
        document.removeEventListener("duedle:account-changed", cancel);
    }
})().catch(console.error);
