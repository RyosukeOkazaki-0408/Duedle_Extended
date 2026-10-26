// One background context owns this queue. The lease and schedule survive Safari
// unloading that context; storage.local keeps each device's schedule independent.
class RefreshCoordinator {
    static storageKey = "refreshCoordinator";
    static leaseMs = 90 * 1000;
    static preparationMs = 30 * 1000;
    static progressMs = 90 * 1000;

    static deadline(lease) {
        if (!lease) return 0;
        const activity = lease.progress?.at ?? lease.startedAt;
        const limit = lease.progress ? this.progressMs : this.preparationMs;
        return Math.min(lease.expiresAt, Number.isFinite(activity) ? activity + limit : lease.expiresAt);
    }

    async interrupt(state, reason) {
        const history = (await this.storage.get("refreshHistory")).refreshHistory || {};
        const { mode, tabId } = state.lease;
        state.lease = null;
        state.pendingWork = true;
        state.nextWorkAt = this.now() + this.interval(1, 5);
        await this.save(state, { refreshHistory: { ...history,
            attempt: { at: this.now(), mode, outcome: "cancelled", reason,
                ...(mode === "manual" && reason === "navigation" ? { navigationTabId: tabId } : {}) } } });
    }

    progress(message, sender) {
        const tabId = this.senderTab(sender);
        const p = message.progress;
        if (!p || !["courses", "list", "details"].includes(p.phase)
            || ![p.completed, p.total, p.saved].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)
            || p.total < 1 || p.completed > p.total) throw new Error("更新の進捗が不正です");
        return this.serial(async () => {
            const { state } = await this.load();
            const owned = this.owns(state, message.token, tabId);
            if (owned) {
                state.lease.progress = { phase: p.phase, completed: p.completed, total: p.total, saved: p.saved, at: this.now() };
                state.lease.expiresAt = this.now() + RefreshCoordinator.leaseMs;
                await this.save(state);
            }
            return { ok: true, owned };
        });
    }

    pageReady(pageId, sender) {
        const tabId = this.senderTab(sender);
        if (typeof pageId !== "string" || !pageId || pageId.length > 160) throw new Error("ページの識別子が不正です");
        return this.serial(async () => {
            const { state } = await this.load();
            if (state.lease?.tabId === tabId && state.lease.pageId && state.lease.pageId !== pageId) {
                await this.interrupt(state, "navigation");
            }
            const history = (await this.storage.get("refreshHistory")).refreshHistory;
            const attempt = history?.attempt;
            const navigationInterrupted = attempt?.mode === "manual" && attempt.outcome === "cancelled"
                && attempt.reason === "navigation" && attempt.navigationTabId === tabId
                && this.now() >= attempt.at && this.now() - attempt.at < 60000;
            if (navigationInterrupted) {
                const consumed = { ...attempt };
                delete consumed.navigationTabId;
                await this.save(state, { refreshHistory: { ...history, attempt: consumed } });
            }
            return { ok: true, navigationInterrupted };
        });
    }

    tabGone(tabId) {
        return this.serial(async () => {
            const { state } = await this.load();
            if (state.lease?.tabId === tabId) await this.interrupt(state, "navigation");
        });
    }
    static manualCooldownMs = 3 * 60 * 60 * 1000;
    static moodleRoot = "https://cms7.ict.nitech.ac.jp/moodle40a/";

    constructor({ storage, now = () => Date.now(), random = Math.random, tokenFactory } = {}) {
        this.storage = storage;
        this.now = now;
        this.random = random;
        this.tokenFactory = tokenFactory || (() => {
            if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
            return `${this.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        });
        this.queue = Promise.resolve();
    }

    static detailInterval(task, now = Date.now()) {
        if (task.show === false || task.status === "complete") return 24 * 60 * 60 * 1000;
        const due = task.due ? new Date(task.due).getTime() : NaN;
        return Number.isFinite(due) && due >= now && due <= now + 24 * 60 * 60 * 1000
            ? 3 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
    }

    static detailDue(task, now = Date.now()) {
        return !Number.isFinite(task.fetchedAt) || task.fetchedAt <= 0
            || task.fetchedAt > now || now - task.fetchedAt >= this.detailInterval(task, now);
    }

    static copyPayload(value) {
        let nodes = 0;
        const seen = new Set();
        const visit = (item, depth) => {
            if (++nodes > 50000 || depth > 20) throw new Error("更新状態が大きすぎます");
            if (item === null || typeof item === "string" || typeof item === "boolean") return;
            if (typeof item === "number" && Number.isFinite(item)) return;
            if (typeof item !== "object" || seen.has(item)) throw new Error("更新状態が不正です");
            if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype
                && Object.getPrototypeOf(item) !== null) throw new Error("更新状態が不正です");
            seen.add(item);
            if (Array.isArray(item)) {
                if (item.length > 10000) throw new Error("更新状態が大きすぎます");
                for (const entry of item) visit(entry, depth + 1);
            } else {
                for (const key of Object.keys(item)) visit(item[key], depth + 1);
            }
            seen.delete(item);
        };
        visit(value, 0);
        const serialized = JSON.stringify(value);
        if (serialized.length > 1000000) throw new Error("更新状態が大きすぎます");
        return JSON.parse(serialized);
    }

    senderTab(sender) {
        const tabId = sender?.tab?.id;
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Moodleのタブから更新してください");
        let url;
        try { url = new URL(sender.url || sender.tab.url); } catch (_) { /* invalid sender */ }
        const root = new URL(globalThis.DuedleSites?.root(sender.url || sender.tab.url) ?? RefreshCoordinator.moodleRoot);
        if (!url || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)
            || url.pathname.startsWith(root.pathname + "login/")
            || url.pathname.startsWith(root.pathname + "auth/")) {
            throw new Error("Moodleにログインしてから更新してください");
        }
        return tabId;
    }

    serial(operation) {
        const pending = this.queue.catch(() => {}).then(operation);
        this.queue = pending;
        return pending;
    }

    interval(minMinutes, maxMinutes) {
        const sample = Number(this.random());
        const fraction = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0.5;
        return Math.round((minMinutes + fraction * (maxMinutes - minMinutes)) * 60000);
    }

    async load() {
        const stored = await this.storage.get([RefreshCoordinator.storageKey, "scrapeCooldown", "manualCooldownDisabled"]);
        const now = this.now();
        const raw = stored[RefreshCoordinator.storageKey];
        let changed = false;
        let state;
        if (!raw || raw.version !== 1) {
            const initial = now + this.interval(1, 5);
            state = { version: 1, collectorState: null, nextListAt: initial, nextWorkAt: initial,
                failures: 0, pendingWork: false, lease: null, temporaryTabId: null };
            changed = true;
        } else {
            state = { ...raw };
            for (const key of ["nextListAt", "nextWorkAt"]) {
                if (!Number.isFinite(state[key]) || state[key] < 0) {
                    state[key] = now + this.interval(1, 5);
                    changed = true;
                }
            }
            if (!Number.isInteger(state.failures) || state.failures < 0 || state.failures > 100) {
                state.failures = 0;
                changed = true;
            }
            state.pendingWork = state.pendingWork === true;
            if (!Number.isInteger(state.temporaryTabId) || state.temporaryTabId < 0) state.temporaryTabId = null;
            try { state.collectorState = RefreshCoordinator.copyPayload(state.collectorState ?? null); }
            catch (_) { state.collectorState = null; changed = true; }
            const lease = state.lease;
            if (lease && Number.isFinite(lease.expiresAt) && RefreshCoordinator.deadline(lease) <= now) {
                await this.interrupt(state, "timeout");
                changed = true;
            }
            if (state.lease && (typeof lease.token !== "string" || !lease.token || lease.token.length > 160
                || !Number.isInteger(lease.tabId) || lease.tabId < 0
                || !["auto", "manual"].includes(lease.mode)
                || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= now
                || lease.expiresAt > now + RefreshCoordinator.leaseMs * 2)) {
                state.lease = null;
                if (Number.isFinite(lease.expiresAt) && lease.expiresAt <= now) {
                    state.pendingWork = true;
                    state.nextWorkAt = now + this.interval(1, 5);
                }
                changed = true;
            }
        }
        const savedCooldown = typeof stored.scrapeCooldown === "number"
            ? stored.scrapeCooldown : new Date(stored.scrapeCooldown).getTime();
        const cooldownUntil = stored.manualCooldownDisabled !== true && Number.isFinite(savedCooldown) && savedCooldown > 0
            ? savedCooldown + RefreshCoordinator.manualCooldownMs : 0;
        if (changed) await this.save(state);
        return { state, cooldownUntil };
    }

    save(state, extra = {}) {
        return this.storage.set({ [RefreshCoordinator.storageKey]: state, ...extra });
    }

    nextAt(state) {
        if (state.lease) return RefreshCoordinator.deadline(state.lease);
        return state.failures || state.pendingWork ? state.nextWorkAt
            : Math.min(state.nextListAt, state.nextWorkAt);
    }

    owns(state, token, tabId, mode) {
        return Boolean(state.lease && state.lease.token === token && state.lease.tabId === tabId
            && (!mode || state.lease.mode === mode));
    }

    status(sender) {
        this.senderTab(sender);
        return this.serial(async () => {
            const { state, cooldownUntil } = await this.load();
            return { ok: true, state: state.collectorState, nextAt: this.nextAt(state),
                nextListAt: state.nextListAt, nextWorkAt: state.nextWorkAt,
                busy: Boolean(state.lease), mode: state.lease?.mode ?? null,
                expiresAt: state.lease?.expiresAt ?? null, cooldownUntil };
        });
    }

    claim(message, sender) {
        const tabId = this.senderTab(sender);
        if (!["auto", "manual"].includes(message.mode)) throw new Error("更新方法が不正です");
        return this.serial(async () => {
            const { state, cooldownUntil } = await this.load();
            const now = this.now();
            const denied = (reason, nextAt) => ({ ok: true, granted: false, reason, nextAt });
            if (message.mode === "auto" && state.temporaryTabId === tabId) {
                return denied("temporary", state.lease?.expiresAt || now + RefreshCoordinator.leaseMs);
            }
            if (state.lease) return denied("busy", this.nextAt(state));
            if (message.mode === "manual" && now < cooldownUntil) return denied("cooldown", cooldownUntil);
            // Persist a new phase after a long absence. Students reopening Moodle
            // together should not all immediately issue their overdue requests.
            if (message.mode === "auto" && now - this.nextAt(state) > 10 * 60000) {
                state.pendingWork = true;
                state.nextWorkAt = now + this.interval(1, 5);
                await this.save(state);
                return denied("scheduled", state.nextWorkAt);
            }
            if (message.mode === "auto" && now < this.nextAt(state)) return denied("scheduled", this.nextAt(state));
            const token = this.tokenFactory();
            if (typeof token !== "string" || !token || token.length > 160) throw new Error("更新の識別子を作成できませんでした");
            state.lease = { token, tabId, mode: message.mode, startedAt: now, progress: null,
                pageId: typeof message.pageId === "string" ? message.pageId.slice(0, 160) : null,
                expiresAt: now + RefreshCoordinator.leaseMs };
            await this.save(state);
            return { ok: true, granted: true, token, state: state.collectorState,
                listDue: message.mode === "manual" || now >= state.nextListAt,
                nextListAt: state.nextListAt, nextWorkAt: state.nextWorkAt, nextAt: this.nextAt(state) };
        });
    }

    heartbeat(token, sender, requiredMode) {
        const tabId = this.senderTab(sender);
        return this.serial(async () => {
            const { state } = await this.load();
            const owned = this.owns(state, token, tabId, requiredMode);
            if (owned) {
                state.lease.expiresAt = this.now() + RefreshCoordinator.leaseMs;
                await this.save(state);
            }
            return { ok: true, owned, expiresAt: owned ? state.lease.expiresAt : null,
                nextAt: this.nextAt(state) };
        });
    }

    finish(message, sender) {
        const tabId = this.senderTab(sender);
        if (!["success", "partial", "error", "cancelled"].includes(message.outcome)) throw new Error("更新結果が不正です");
        return this.serial(async () => {
            const { state } = await this.load();
            if (!this.owns(state, message.token, tabId)) {
                return { ok: true, owned: false, nextAt: this.nextAt(state),
                    nextListAt: state.nextListAt, nextWorkAt: state.nextWorkAt };
            }
            if (Object.prototype.hasOwnProperty.call(message, "collectorState")) {
                state.collectorState = RefreshCoordinator.copyPayload(message.collectorState);
            }
            const now = this.now();
            const manual = state.lease.mode === "manual";
            const extra = {};
            const storedHistory = (await this.storage.get("refreshHistory")).refreshHistory || {};
            extra.refreshHistory = { ...storedHistory,
                attempt: { at: now, mode: manual ? "manual" : "auto", outcome: message.outcome,
                    reason: typeof message.reason === "string" ? message.reason.slice(0, 40) : null,
                    ...(manual && message.outcome === "cancelled" && message.reason === "navigation"
                        ? { navigationTabId: tabId } : {}) } };
            if (manual && message.summary && typeof message.summary === "object") {
                const summary = message.summary;
                if (![summary.courses, summary.saved, summary.failed].every(value =>
                    Number.isSafeInteger(value) && value >= 0 && value <= 1000000)) {
                    throw new Error("更新結果の件数が不正です");
                }
                // Persist only the bounded user-facing result, never fetched HTML,
                // session data, stack traces or arbitrary result objects.
                extra.refreshHistory.attempt.summary = { courses: summary.courses, saved: summary.saved,
                    failed: summary.failed, message: typeof summary.message === "string" ? summary.message.slice(0, 500) : "" };
            }
            if (message.outcome === "success") {
                if (manual && message.fullSweep === true && message.moreWork !== true) {
                    extra.refreshHistory.fullSweepAt = now;
                } else if (!manual && message.listComplete === true) {
                    extra.refreshHistory.calendarAt = now;
                }
            }
            if (message.outcome === "success") {
                state.failures = 0;
                if (message.listComplete === true) state.nextListAt = now + this.interval(55, 75);
                state.pendingWork = message.moreWork === true || (message.listComplete !== true && now >= state.nextListAt);
                state.nextWorkAt = now + (message.moreWork === true ? this.interval(5, 10) : 60 * 60000);
                if (manual && message.fullSweep === true && message.moreWork !== true) {
                    extra.scrapeCooldown = new Date(now).toISOString();
                }
            } else if (message.outcome === "cancelled") {
                state.pendingWork = true;
                state.nextWorkAt = now + this.interval(1, 3);
            } else {
                state.failures = Math.min(100, state.failures + 1);
                state.pendingWork = true;
                const baseMinutes = Math.min(120, 15 * Math.pow(2, Math.min(state.failures - 1, 3)));
                state.nextWorkAt = now + Math.min(120 * 60000, this.interval(baseMinutes * 0.85, baseMinutes * 1.15));
            }
            state.lease = null;
            await this.save(state, extra);
            return { ok: true, owned: true, nextAt: this.nextAt(state),
                nextListAt: state.nextListAt, nextWorkAt: state.nextWorkAt };
        });
    }

    setTemporaryTab(token, sender, tabId) {
        const ownerId = this.senderTab(sender);
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error("収集用のタブが不正です");
        return this.serial(async () => {
            const { state } = await this.load();
            if (!this.owns(state, token, ownerId, "manual")) throw new Error("更新の実行権を失いました");
            state.temporaryTabId = tabId;
            await this.save(state);
        });
    }

    clearTemporaryTab(tabId) {
        return this.serial(async () => {
            const { state } = await this.load();
            if (state.temporaryTabId === tabId) {
                state.temporaryTabId = null;
                await this.save(state);
            }
        });
    }
}
