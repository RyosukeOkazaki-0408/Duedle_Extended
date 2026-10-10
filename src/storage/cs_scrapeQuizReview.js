// Write through the shared background queue, like assignments and quiz overview pages.
(async () => {
    const quizId = Number(new URL(location.href).searchParams.get("cmid"));
    if (!Number.isInteger(quizId) || quizId <= 0) return;
    const { quiz_list = [] } = await ext.storage.local.get("quiz_list");
    const old = quiz_list.find(quiz => Number(quiz.quizId) === quizId);
    if (!old) {
        console.info("小テストの概要ページを開くと成績を保存できます");
        return;
    }
    const data = ScrapeQuizReview.getData(old);
    await StorageUtil.saveData("quiz_list", "quizId", data);
})().catch(console.error);
