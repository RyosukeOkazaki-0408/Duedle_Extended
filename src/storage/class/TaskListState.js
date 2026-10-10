// UI state is derived from saved outcomes, never from a new network request.
class TaskListState {
    static describe({ total = 0, visible = 0, history = {}, coordinator = {}, now = Date.now() } = {}) {
        const running = coordinator.lease?.expiresAt > now;
        const attempt = history.attempt || {};
        const success = Math.max(history.calendarAt || 0, history.fullSweepAt || 0);
        const failed = ["error", "partial", "cancelled"].includes(attempt.outcome);

        let status = "";
        if (running) status = "課題情報を取得しています。";
        else if (failed) status = "課題情報の更新に失敗しました。";

        let empty = "";
        if (!visible && !running && !failed) {
            empty = total || success
                ? "条件に一致する課題はありません。"
                : "課題情報が取得されていません。";
        }

        return { status, empty };
    }

    static timestamp(history = {}) {
        const at = Math.max(history.calendarAt || 0, history.fullSweepAt || 0);
        if (!at) return "最終更新：記録なし";
        const text = new Date(at).toLocaleString("ja-JP", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
        return "最終更新：" + text;
    }
}
