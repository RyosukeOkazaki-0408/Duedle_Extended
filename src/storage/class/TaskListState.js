// UI state is derived from saved outcomes, never from a new network request.
class TaskListState {
    static progressLabel(progress) {
        const unit = { courses: "コース", list: "一覧確認", details: "課題" }[progress.phase] || "処理";
        return `${progress.completed}/${progress.total}${unit}・${progress.saved}件を更新中…`;
    }

    static describe({ total = 0, visible = 0, history = {}, coordinator = {}, now = Date.now(), showOutcome = false } = {}) {
        history ||= {};
        coordinator ||= {};
        const lease = coordinator.lease;
        const p = lease?.progress;
        const deadline = Math.min(lease?.expiresAt ?? 0, (p?.at ?? lease?.startedAt ?? now) + (p ? 90000 : 30000));
        const running = Boolean(lease && deadline > now);
        const attempt = showOutcome ? history.attempt || {} : {};
        const success = Math.max(history.calendarAt || 0, history.fullSweepAt || 0);
        const failed = ["error", "partial", "cancelled"].includes(attempt.outcome);

        let status = "";
        if (running) {
            if (p) {
                status = this.progressLabel(p);
            } else status = "更新の準備中…";
        } else if (lease || attempt.reason === "timeout") status = "更新の応答が途絶えました。再度お試しください。";
        else if (attempt.outcome === "cancelled") status = "更新が中断されました。再度お試しください。";
        else if (failed && attempt.reason === "auth") status = "ログイン状態を確認できません。Moodleに再ログインして課題情報を更新してください。";
        else if (failed) status = "課題情報の更新に失敗しました。再度お試しください。";
        // Only explicitly requested transient notifications use the saved result.
        // A partial result must not look like either a full success or zero saved tasks.
        const summary = attempt.mode === "manual" && !running && !lease ? attempt.summary : null;
        if (summary) {
            if (attempt.outcome === "success") status = `${summary.courses}コース・${summary.saved}件の課題情報を更新しました。`;
            else if (attempt.outcome === "partial") status = `${summary.saved}件を更新しました。${summary.failed}件を取得できませんでした。${summary.message || "もう一度お試しください。"}`;
            else if (attempt.outcome === "error" && summary.message) status = (summary.saved ? `${summary.saved}件を更新しました。` : "") + summary.message;
        }

        let empty = "";
        if (!visible && !running && !failed && (!status || attempt.outcome === "success" && !lease)) {
            empty = total || success
                ? "条件に一致する課題はありません。"
                : "課題情報が取得されていません。";
        }

        return { status, empty, running };
    }

    static timestamp(history = {}) {
        // Automatic list checks may leave task details pending.
        const at = history.fullSweepAt || 0;
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
