// Automatic collection belongs to a visible Moodle page. The background only
// coordinates the persisted schedule and the lease shared by all tabs.
class AutoRefreshController {
    static root = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    static heartbeatMs = 30000;
    static ownershipCheckMs = 10000;

    constructor({ extension = ext, document = globalThis.document,
        window = globalThis.window, location = window?.location,
        Collector = AutoRefreshCollector, now = () => Date.now(),
        setTimeout = globalThis.setTimeout.bind(globalThis),
        clearTimeout = globalThis.clearTimeout.bind(globalThis),
        AbortController = globalThis.AbortController,
        CustomEvent = globalThis.CustomEvent } = {}) {
        Object.assign(this, { extension, document, window, location, Collector,
            now, setTimeout, clearTimeout, AbortController, CustomEvent });
        this.started = false;
        this.suspended = false;
        this.temporary = false;
        this.generation = 0;
        this.nextAt = 0;
        this.failures = 0;
        this.active = null;
        this.claiming = null;
        this.timer = null;
        this.statusRequest = null;
        this.statusAgain = false;
        this.coordinatorRevision = 0;
        this.onVisibility = () => {
            if (this.visible()) this.wake();
            else {
                this.generation++;
                this.clearTimer();
                this.cancel(this.active);
            }
        };
        this.onPageShow = () => { this.suspended = false; this.wake(); };
        this.onPageHide = () => this.suspend();
        this.onStorage = (changes, area) => this.storageChanged(changes, area);
    }

    visible() {
        return this.document?.visibilityState === "visible" && !this.document.hidden;
    }

    eligible() {
        if (!this.started || this.suspended || this.temporary || !this.visible()) return false;
        if (this.window && this.window.top !== this.window.self) return false;
        const href = this.location?.href || "";
        if (!href.startsWith(AutoRefreshController.root)
            || /\/moodle40a\/(?:login\/|auth\/|blocks\/syllabus\/)/.test(href)) return false;
        if (this.document.querySelector('form#login, #loginform, input[name="password"]')) return false;
        if (typeof this.Collector.findSesskey === "function") {
            return Boolean(this.Collector.findSesskey(this.document, href));
        }
        return Boolean(this.document.querySelector('body.loggedin, a[href*="/login/logout.php"], input[name="sesskey"]'));
    }

    courseIds() {
        const ids = [];
        const filter = this.document.querySelector("span[data-active-item-text]");
        if (!filter?.textContent?.includes("削除済み")) {
            for (const element of this.document.querySelectorAll("[data-course-id]")) {
                ids.push(Number(element.dataset?.courseId ?? element.getAttribute("data-course-id")));
            }
        }
        const href = this.location?.href || "";
        if (/\/course\/view\.php\?/.test(href)) {
            const match = /[?&]id=(\d+)(?:[&#]|$)/.exec(href);
            if (match) ids.push(Number(match[1]));
        }
        return [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0);
    }

    start() {
        if (this.started) return;
        this.started = true;
        this.suspended = false;
        this.document.addEventListener("visibilitychange", this.onVisibility);
        this.window?.addEventListener("pageshow", this.onPageShow);
        this.window?.addEventListener("pagehide", this.onPageHide);
        this.window?.addEventListener("beforeunload", this.onPageHide);
        this.extension.storage.onChanged?.addListener(this.onStorage);
        this.wake();
    }

    stop() {
        if (!this.started) return;
        this.suspend();
        this.started = false;
        this.document.removeEventListener("visibilitychange", this.onVisibility);
        this.window?.removeEventListener("pageshow", this.onPageShow);
        this.window?.removeEventListener("pagehide", this.onPageHide);
        this.window?.removeEventListener("beforeunload", this.onPageHide);
        this.extension.storage.onChanged?.removeListener(this.onStorage);
    }

    clearTimer() {
        if (this.timer !== null) this.clearTimeout(this.timer);
        this.timer = null;
    }

    schedule(nextAt) {
        this.clearTimer();
        // Missing/stale replies are transport failures, not a reason to spin.
        this.nextAt = Number.isFinite(Number(nextAt)) && Number(nextAt) > this.now()
            ? Number(nextAt) : this.now() + 60000;
        if (!this.eligible()) return;
        this.timer = this.setTimeout(() => {
            this.timer = null;
            this.wake();
        }, Math.min(this.nextAt - this.now(), 2147483647));
    }

    retry() {
        this.failures++;
        this.schedule(this.now() + Math.min(60000 * 2 ** (this.failures - 1), 300000));
    }

    wake() {
        if (!this.eligible() || this.active || this.claiming) return;
        if (this.nextAt > this.now()) {
            this.schedule(this.nextAt);
            return;
        }
        this.clearTimer();
        const attempt = { generation: this.generation };
        this.claiming = attempt;
        attempt.promise = this.claim(attempt);
    }

    async claim(attempt) {
        try {
            const response = await this.extension.runtime.sendMessage({ type: "REFRESH_CLAIM", mode: "auto" });
            if (!response?.ok) throw new Error("Refresh coordinator unavailable");
            this.failures = 0;
            if (!response.granted) {
                if (response.reason === "temporary") this.temporary = true;
                this.schedule(response.nextAt);
                return;
            }
            const job = {
                token: response.token, state: response.state, generation: attempt.generation,
                lastOwnershipCheck: this.now(), controller: new this.AbortController(),
                cancelled: false, cancelOutcome: "cancelled", heartbeat: null,
                heartbeatRequest: null, finishRequest: null,
            };
            this.active = job;
            this.claiming = null;
            if (!this.eligible() || attempt.generation !== this.generation) {
                this.cancel(job);
                await this.finish(job, "cancelled");
                return;
            }
            this.scheduleHeartbeat(job);
            try {
                const collector = new this.Collector({
                    document: this.document, pageURL: this.location.href,
                    signal: job.controller.signal,
                    shouldContinue: () => this.shouldContinue(job),
                });
                job.collector = collector;
                job.result = await collector.run({ state: response.state,
                    listDue: response.listDue, courseIds: this.courseIds() });
                if (job.result?.saved > 0 && this.CustomEvent) {
                    this.document.dispatchEvent(new this.CustomEvent("duedle:tasks-updated"));
                }
                const result = job.result || {};
                const outcome = job.cancelled ? job.cancelOutcome
                    : result.cancelled ? "cancelled"
                    : result.failed > 0 ? (result.saved > 0 ? "partial" : "error")
                    : ["auth", "rate-limit", "temporary"].includes(result.stopReason) ? "error" : "success";
                await this.finish(job, outcome);
            } catch {
                await this.finish(job, job.cancelled ? job.cancelOutcome : "error");
            }
        } catch {
            this.retry();
        } finally {
            if (this.claiming === attempt) this.claiming = null;
        }
    }

    scheduleHeartbeat(job) {
        if (job.heartbeat !== null) this.clearTimeout(job.heartbeat);
        job.heartbeat = null;
        if (this.active !== job || job.cancelled || !this.eligible()) return;
        job.heartbeat = this.setTimeout(() => {
            job.heartbeat = null;
            this.renew(job);
        }, AutoRefreshController.heartbeatMs);
    }

    async renew(job) {
        if (this.active !== job || job.cancelled || !this.eligible()) return false;
        if (job.heartbeatRequest) return job.heartbeatRequest;
        job.heartbeatRequest = (async () => {
            try {
                const response = await this.extension.runtime.sendMessage({ type: "REFRESH_HEARTBEAT", token: job.token });
                if (!response?.ok) throw new Error("Refresh coordinator unavailable");
                if (!response.owned) {
                    this.cancel(job);
                    return false;
                }
                job.lastOwnershipCheck = this.now();
                this.scheduleHeartbeat(job);
                return !job.cancelled && this.eligible();
            } catch {
                this.cancel(job, "error");
                return false;
            } finally {
                job.heartbeatRequest = null;
            }
        })();
        return job.heartbeatRequest;
    }

    async shouldContinue(job) {
        if (this.active !== job || job.cancelled || !this.eligible()) return false;
        if (this.now() - job.lastOwnershipCheck >= AutoRefreshController.ownershipCheckMs) {
            return this.renew(job);
        }
        return true;
    }

    cancel(job, outcome = "cancelled") {
        if (!job || job.cancelled) return;
        job.cancelled = true;
        job.cancelOutcome = outcome;
        if (job.heartbeat !== null) this.clearTimeout(job.heartbeat);
        job.heartbeat = null;
        job.controller.abort();
    }

    finish(job, outcome) {
        if (job.finishRequest) return job.finishRequest;
        if (job.heartbeat !== null) this.clearTimeout(job.heartbeat);
        job.heartbeat = null;
        job.finishRequest = (async () => {
            try {
                const response = await this.extension.runtime.sendMessage({
                    type: "REFRESH_FINISH", token: job.token, outcome,
                    collectorState: job.result?.state ?? job.collector?.state ?? job.state,
                    moreWork: Boolean(job.result?.moreWork),
                    listComplete: Boolean(job.result?.listComplete),
                    reason: job.result?.stopReason || null,
                });
                if (!response?.ok) throw new Error("Refresh coordinator unavailable");
                this.failures = 0;
                this.schedule(response.nextAt);
            } catch {
                this.retry();
            } finally {
                if (this.active === job) this.active = null;
            }
        })();
        return job.finishRequest;
    }

    suspend() {
        this.suspended = true;
        this.generation++;
        this.clearTimer();
        const job = this.active;
        this.cancel(job);
        // Unload/BFCache can freeze promises; release best-effort, then rely on
        // the persisted lease expiry if messaging cannot complete.
        if (job) this.finish(job, "cancelled");
    }

    storageChanged(changes, area) {
        if (area !== "local" || !changes.refreshCoordinator) return;
        this.coordinatorRevision++;
        if (!this.eligible() || this.active || this.claiming) return;
        const state = changes.refreshCoordinator.newValue;
        if (state?.lease?.expiresAt > this.now()) {
            this.schedule(state.lease.expiresAt);
            return;
        }
        if (this.statusRequest) {
            this.statusAgain = true;
            return;
        }
        this.refreshSchedule();
    }

    refreshSchedule() {
        const revision = this.coordinatorRevision;
        const generation = this.generation;
        const current = () => revision === this.coordinatorRevision && generation === this.generation
            && this.eligible() && !this.active && !this.claiming;
        this.statusRequest = (async () => {
            try {
                const response = await this.extension.runtime.sendMessage({ type: "REFRESH_STATUS" });
                // A reply preceding a newer lease/schedule must not undo it.
                if (!current()) return;
                if (!response?.ok) throw new Error("Refresh coordinator unavailable");
                if (Number(response.nextAt) <= this.now() && !response.busy) {
                    this.nextAt = 0;
                    this.wake();
                } else this.schedule(response.nextAt);
            } catch { if (current()) this.retry(); }
            finally {
                this.statusRequest = null;
                const again = this.statusAgain;
                this.statusAgain = false;
                if (again && this.eligible() && !this.active && !this.claiming) this.refreshSchedule();
            }
        })();
    }
}

if (typeof document !== "undefined" && typeof window !== "undefined"
    && typeof AutoRefreshCollector === "function") {
    globalThis.duedleAutoRefreshController = new AutoRefreshController();
    globalThis.duedleAutoRefreshController.start();
}
