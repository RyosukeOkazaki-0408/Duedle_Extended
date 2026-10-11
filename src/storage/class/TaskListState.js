// UI state is derived from saved outcomes, never from a new network request.
class TaskListState {
    static describe({ total = 0, visible = 0, history = {}, coordinator = {}, now = Date.now() } = {}) {
        const lease = coordinator.lease;
        const p = lease?.progress;
        const deadline = Math.min(lease?.expiresAt ?? 0, (p?.at ?? lease?.startedAt ?? now) + (p ? 90000 : 30000));
        const running = Boolean(lease && deadline > now);
        const attempt = history.attempt || {};
        const success = Math.max(history.calendarAt || 0, history.fullSweepAt || 0);
        const failed = ["error", "partial", "cancelled"].includes(attempt.outcome);

        let status = "";
        if (running) {
            if (p) {
                const unit = { courses: "コース", list: "一覧確認", details: "課題" }[p.phase] || "処理";
                status = `${p.completed}/${p.total}${unit}・${p.saved}件を更新中…`;
            } else status = "更新の準備中…";
        } else if (lease || attempt.reason === "timeout") status = "更新の応答が途絶えました。再度お試しください。";
        else if (attempt.outcome === "cancelled") status = "更新が中断されました。再度お試しください。";
        else if (failed) status = "課題情報の更新に失敗しました。再度お試しください。";

        let empty = "";
        if (!visible && !running && !failed && !status) {
            empty = total || success
                ? "条件に一致する課題はありません。"
                : "課題情報が取得されていません。";
        }

        return { status, empty, running };
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
