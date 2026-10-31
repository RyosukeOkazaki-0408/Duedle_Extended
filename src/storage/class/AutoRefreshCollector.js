// Read-only calendar discovery uses Moodle's core/ajax transport from the authenticated tab.
// Transport: https://jsdoc.moodledev.io/4.01/lib_amd_src_ajax.js.html
// Method: moodle/moodle MOODLE_400_STABLE calendar/externallib.php, lib/db/services.php.
class AutoRefreshCollector {
    static baseURL = CourseCollector.baseURL;
    static DAY = 86400000;
    static METHOD = "core_calendar_get_action_events_by_timesort";

    constructor({ fetch = globalThis.fetch.bind(globalThis),
        parse = html => new DOMParser().parseFromString(html, "text/html"),
        onProgress = () => {}, shouldContinue = async () => true,
        pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
        now = () => Date.now(), random = () => Math.random(),
        document = globalThis.document, pageURL = globalThis.location?.href || AutoRefreshCollector.baseURL,
        signal = null, storage = StorageUtil,
        scrapers = { assign: ScrapeAssign, quiz: ScrapeQuiz } } = {}) {
        Object.assign(this, { fetch, parse, onProgress, shouldContinue, pause, now, random, document, pageURL, signal, storage, scrapers });
    }

    static positiveId(value) {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    static taskRef(type, id) {
        id = this.positiveId(id);
        return ["assign", "quiz"].includes(type) && id ? { type, id } : null;
    }

    static detailInterval(task, now = Date.now()) {
        if (task.status === "complete" || task.show === false) return this.DAY;
        const due = Date.parse(task.due);
        return Number.isFinite(due) && due >= now && due - now <= this.DAY ? 3 * 3600000 : 12 * 3600000;
    }

    static fetchedTime(value) {
        if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
        const parsed = typeof value === "string" ? Date.parse(value) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    static detailDue(task, now = Date.now()) {
        const fetched = this.fetchedTime(task.fetchedAt);
        const due = Date.parse(task.due);
        // Verify unfinished pre-deadline snapshots once after closing, before
        // the longer overdue TTL can leave a submitted task marked expired.
        if (task.show !== false && ["incomplete", "warning", "expired", "unknown"].includes(task.status)
            && fetched !== null && Number.isFinite(due) && fetched < due && due <= now) return true;
        return fetched === null || fetched > now || now - fetched >= this.detailInterval(task, now);
    }

    static findSesskey(doc, pageURL = this.baseURL) {
        const valid = value => typeof value === "string" && /^[a-zA-Z0-9]{6,64}$/.test(value) ? value : null;
        const input = doc?.querySelector('input[name="sesskey"]');
        const fromInput = valid(input?.value || input?.getAttribute("value"));
        if (fromInput) return fromInput;
        for (const link of doc?.querySelectorAll('a[href*="sesskey="]') || []) {
            try {
                const url = new URL(link.getAttribute("href"), pageURL);
                if (url.origin !== new URL(this.baseURL).origin) continue;
                const key = valid(url.searchParams.get("sesskey"));
                if (key) return key;
            } catch { /* Ignore unrelated malformed links. */ }
        }
        // The isolated extension world cannot read Moodle's window.M. Read JSON only;
        // no eval, script injection, AMD loader, or page-world function calls.
        for (const script of doc?.querySelectorAll("script:not([src])") || []) {
            const text = script.textContent || "";
            const match = /\bM\.cfg\s*=\s*\{/.exec(text);
            if (!match) continue;
            const start = match.index + match[0].lastIndexOf("{");
            let depth = 0, quoted = false, escaped = false;
            for (let index = start; index < text.length; index++) {
                const char = text[index];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === '"') quoted = false;
                } else if (char === '"') quoted = true;
                else if (char === "{") depth++;
                else if (char === "}" && --depth === 0) {
                    try {
                        const key = valid(JSON.parse(text.slice(start, index + 1)).sesskey);
                        if (key) return key;
                    } catch { /* Non-JSON page code is deliberately not executed. */ }
                    break;
                }
            }
        }
        return null;
    }

    static fingerprint(event) {
        const value = JSON.stringify([
            event.modulename, event.instance ?? event.cmid, event.eventtype, event.timestart, event.timesort,
            event.timeduration, event.timemodified, event.visible, event.name,
            event.course?.id || event.courseid, event.action?.name,
            event.action?.itemcount, event.action?.actionable, event.action?.url || event.url
        ]);
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(16);
    }

    static eventRef(event) {
        if (event.visible === false || event.visible === 0 || event.uservisible === false || event.uservisible === 0) return null;
        // Moodle 4.0 exports the course-module ID as "instance" (not the activity DB ID).
        const item = this.taskRef(event.modulename, event.instance ?? event.cmid);
        if (!item) return null;
        const target = event.action?.url || event.url;
        if (target) {
            try {
                const url = new URL(target, this.baseURL);
                if (url.origin !== new URL(this.baseURL).origin
                    || url.pathname !== new URL(this.baseURL).pathname + "mod/" + item.type + "/view.php"
                    || this.positiveId(url.searchParams.get("id")) !== item.id) return null;
            } catch { return null; }
        }
        const seconds = Number(event.timesort || event.timestart);
        return { ...item, courseId: this.positiveId(event.course?.id || event.courseid),
            due: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null };
    }

    normalizeState(raw = {}) {
        const now = this.now();
        const state = { version: 1, cursor: null, events: {}, pending: {}, courses: {} };
        const cursor = raw?.cursor;
        if (cursor && Number.isInteger(cursor.from) && Number.isInteger(cursor.to)
            && cursor.to - cursor.from === 104 * 86400
            && Number.isSafeInteger(cursor.after) && cursor.after >= 0
            && Number.isFinite(cursor.startedAt) && cursor.startedAt <= now
            && now - cursor.startedAt < 7 * AutoRefreshCollector.DAY) {
            state.cursor = { from: cursor.from, to: cursor.to, after: cursor.after, startedAt: cursor.startedAt };
        }
        const taskKey = key => /^(assign|quiz):[1-9]\d*$/.test(key);
        const recent = time => Number.isFinite(time) && time <= now && time >= now - 90 * AutoRefreshCollector.DAY;
        Object.entries(raw?.events || {}).filter(([id, entry]) =>
            AutoRefreshCollector.positiveId(id) && entry && taskKey(entry.key)
            && typeof entry.fingerprint === "string" && entry.fingerprint.length <= 32
            && recent(entry.seenAt) && now - entry.seenAt <= 30 * AutoRefreshCollector.DAY)
            .sort((a, b) => b[1].seenAt - a[1].seenAt).slice(0, 2000)
            .forEach(([id, entry]) => { state.events[id] = { key: entry.key, fingerprint: entry.fingerprint, seenAt: entry.seenAt }; });
        Object.entries(raw?.pending || {}).filter(([key, entry]) =>
            taskKey(key) && entry && AutoRefreshCollector.taskRef(entry.type, entry.id)
            && key === entry.type + ":" + entry.id && recent(entry.addedAt))
            .sort((a, b) => a[1].addedAt - b[1].addedAt).slice(0, 1000)
            .forEach(([key, entry]) => {
                state.pending[key] = { type: entry.type, id: Number(entry.id),
                    courseId: AutoRefreshCollector.positiveId(entry.courseId),
                    due: Number.isFinite(entry.due) && entry.due > 0 ? entry.due : null,
                    addedAt: entry.addedAt,
                    neededAt: Number.isFinite(entry.neededAt) && entry.neededAt > 0 ? Math.min(now, entry.neededAt) : entry.addedAt,
                    changed: entry.changed !== false,
                    failures: Math.max(0, Math.min(12, Number(entry.failures) || 0)),
                    retryAt: Number.isFinite(entry.retryAt) ? Math.min(entry.retryAt, now + AutoRefreshCollector.DAY) : 0 };
            });
        Object.entries(raw?.courses || {}).filter(([id, entry]) => AutoRefreshCollector.positiveId(id) && entry && recent(entry.seenAt))
            .sort((a, b) => b[1].seenAt - a[1].seenAt).slice(0, 100)
            .forEach(([id, entry]) => {
                state.courses[id] = { seenAt: entry.seenAt,
                    discoveredAt: Number.isFinite(entry.discoveredAt) ? Math.min(now, entry.discoveredAt) : 0,
                    failures: Math.max(0, Math.min(12, Number(entry.failures) || 0)),
                    retryAt: Number.isFinite(entry.retryAt) ? Math.min(entry.retryAt, now + AutoRefreshCollector.DAY) : 0 };
                const scan = entry.sectionScan;
                if (scan && recent(scan.startedAt) && now - scan.startedAt < 7 * AutoRefreshCollector.DAY
                    && Array.isArray(scan.pending) && Array.isArray(scan.visited)
                    && scan.pending.length + scan.visited.length < CourseCollector.maxCoursePages
                    && [...scan.pending, ...scan.visited].every(section => Number.isSafeInteger(section) && section >= 0)
                    && new Set([...scan.pending, ...scan.visited]).size === scan.pending.length + scan.visited.length
                    && scan.pending.length) {
                    const items = Array.isArray(scan.items) && scan.items.length <= 10000
                        && scan.items.every(item => this.constructor.taskRef(item?.type, item?.id) && typeof item.available === "boolean")
                        ? scan.items : [];
                    state.courses[id].sectionScan = { startedAt: scan.startedAt,
                        pending: [...scan.pending], visited: [...scan.visited], items,
                        hasRoot: Array.isArray(scan.items) && scan.hasRoot === true };
                }
            });
        return state;
    }

    error(reason, message, status) {
        return Object.assign(new Error(message), { reason, status });
    }

    async checkpoint(pace = false) {
        if (this.signal?.aborted || !await this.shouldContinue()) throw this.error("cancelled", "更新を中止しました");
        if (this.now() - this.startedAt >= 60000) throw this.error("budget", "更新を次回に続けます");
        if (pace && this.requests) {
            await this.pause(1500 + Math.floor(Math.max(0, Math.min(1, this.random())) * 1500));
            await this.checkpoint();
        }
    }

    async request(url, options = {}, format = "text") {
        await this.checkpoint(true);
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, Math.max(1, Math.min(15000, 60000 - (this.now() - this.startedAt))));
        this.requests++;
        try {
            const response = await this.fetch(url, { ...options, credentials: "include", signal: controller.signal });
            const finalURL = new URL(response.url || url);
            if (finalURL.origin !== new URL(AutoRefreshCollector.baseURL).origin || /\/(?:login|auth)\//.test(finalURL.pathname)) {
                throw this.error("auth", "Moodleへのログインが必要です");
            }
            let text;
            if (!response.ok) {
                const status = Number(response.status);
                const reason = [401, 403].includes(status) ? "auth" : status === 429 ? "rate-limit" : status >= 500 ? "temporary" : "invalid";
                const type = new URL(url).pathname.match(/^\/moodle40a\/mod\/(assign|quiz)\/view\.php$/)?.[1];
                let denied = null;
                if (format !== 'json' && [403, 404].includes(status) && this.scrapers[type]?.unavailableTask) {
                    text = await response.text();
                    denied = this.scrapers[type].unavailableTask(this.parse(text), url);
                }
                if (!denied) throw this.error(reason, `Moodleの情報を取得できませんでした (HTTP ${status})`, status);
            }
            text ??= await response.text();
            await this.checkpoint();
            if (format === "json") {
                try { return JSON.parse(text); }
                catch {
                    if (/loginform|name=["']password|<form[^>]+login/i.test(text)) throw this.error("auth", "Moodleへのログインが必要です");
                    throw this.error("temporary", "Moodleからの応答を読み取れませんでした");
                }
            }
            return text;
        } catch (error) {
            if (error.reason) throw error;
            if (this.signal?.aborted) throw this.error("cancelled", "更新を中止しました");
            if (controller.signal.aborted) throw this.error(this.now() - this.startedAt >= 60000 ? "budget" : "temporary", "Moodleからの応答がタイムアウトしました");
            throw this.error("temporary", "Moodleに接続できませんでした");
        } finally {
            clearTimeout(timer);
            this.signal?.removeEventListener("abort", abort);
        }
    }

    async fetchDocument(url) {
        const doc = this.parse(await this.request(url));
        if (doc.querySelector('form#login, #loginform, input[name="password"]')) throw this.error("auth", "Moodleへのログインが必要です");
        try { globalThis.duedleAssertAccountDocument?.(doc, url); }
        catch (error) { throw this.error("auth", error.message); }
        return doc;
    }

    async calendarPage(cursor, sesskey) {
        // Only this fixed read-only method is callable. Never retain the URL or sesskey.
        const url = AutoRefreshCollector.baseURL + "lib/ajax/service.php?sesskey=" + encodeURIComponent(sesskey)
            + "&info=" + AutoRefreshCollector.METHOD + "&nosessionupdate=true";
        const payload = await this.request(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{ index: 0, methodname: AutoRefreshCollector.METHOD,
                args: { timesortfrom: cursor.from, timesortto: cursor.to,
                    aftereventid: cursor.after, limitnum: 50, limittononsuspendedevents: true } }])
        }, "json");
        const entry = Array.isArray(payload) && payload.length === 1 ? payload[0] : null;
        if (!entry || entry.error || entry.exception) {
            const code = String(entry?.exception?.errorcode || entry?.errorcode || "");
            throw this.error(/sesskey|login|session|nopermission|access/i.test(code) ? "auth" : "temporary", "Moodleの予定一覧を取得できませんでした");
        }
        if (!Array.isArray(entry.data?.events) || entry.data.events.length > 50) throw this.error("temporary", "Moodleの予定一覧の形式が正しくありません");
        return entry.data;
    }

    queue(state, item, changed = true, revision = true) {
        const key = item.type + ":" + item.id;
        const old = state.pending[key];
        state.pending[key] = { ...item, addedAt: old?.addedAt ?? this.now(),
            neededAt: !old || revision ? this.now() : old.neededAt,
            changed: changed || old?.changed === true, failures: old?.failures || 0, retryAt: old?.retryAt || 0 };
    }

    noteCourse(state, id) {
        if (!AutoRefreshCollector.positiveId(id)) return;
        state.courses[id] = { discoveredAt: 0, failures: 0, retryAt: 0, ...state.courses[id], seenAt: this.now() };
    }

    failedEntry(entry) {
        entry.failures = Math.min(12, (entry.failures || 0) + 1);
        entry.retryAt = this.now() + Math.min(AutoRefreshCollector.DAY, 300000 * 2 ** (entry.failures - 1));
    }

    detailAvailable(item, cached, availability = this.availability) {
        const courseId = item.courseId || cached?.courseId;
        if (!cached && courseId && !availability?.[courseId]) return false;
        return StorageUtil.taskAvailable({ group: item.type + "_list", courseId,
            [item.type === "assign" ? "assignId" : "quizId"]: item.id }, availability, this.enrolledCourseIds);
    }

    selectDetails(state, local) {
        const now = this.now();
        for (const [key, pending] of Object.entries(state.pending)) {
            const task = { ...local.get(key), group: pending.type + "_list",
                [pending.type === "assign" ? "assignId" : "quizId"]: pending.id,
                courseId: pending.courseId || local.get(key)?.courseId };
            if (!StorageUtil.taskAvailable(task, this.availability, this.enrolledCourseIds)) { delete state.pending[key]; continue; }
            const fetched = AutoRefreshCollector.fetchedTime(local.get(key)?.fetchedAt);
            if (fetched !== null && fetched <= now && fetched >= pending.neededAt) delete state.pending[key];
        }
        for (const task of local.values()) {
            if (!StorageUtil.taskAvailable(task, this.availability, this.enrolledCourseIds)) continue;
            const type = task.group === "assign_list" ? "assign" : task.group === "quiz_list" ? "quiz" : null;
            const item = AutoRefreshCollector.taskRef(type, task.assignId || task.quizId);
            const courseId = AutoRefreshCollector.positiveId(task.courseId);
            // Cached tasks already pass membership and availability checks above.
            // Calendar/UI discovery may not have seen their course in this session.
            if (!item || !AutoRefreshCollector.detailDue(task, now)) continue;
            const key = item.type + ":" + item.id;
            if (!state.pending[key]) this.queue(state, { ...item, courseId, due: Date.parse(task.due) || null }, false);
        }
        const eligible = Object.entries(state.pending).filter(([key, item]) => item.retryAt <= now
            && this.detailAvailable(item, local.get(key)));
        const nearDue = item => Number.isFinite(item.due) ? Math.abs(item.due - now) : Infinity;
        eligible.sort((a, b) => Number(b[1].changed) - Number(a[1].changed)
            || nearDue(a[1]) - nearDue(b[1]) || a[1].addedAt - b[1].addedAt);
        const selected = eligible.slice(0, 8);
        // Reserve one slot for the oldest eligible detail so continuous new deadlines
        // cannot starve existing tasks indefinitely.
        const oldest = eligible.slice().sort((a, b) => {
            const age = entry => AutoRefreshCollector.fetchedTime(local.get(entry[0])?.fetchedAt) ?? entry[1].addedAt;
            return age(a) - age(b) || a[1].addedAt - b[1].addedAt;
        })[0];
        if (selected.length === 8 && oldest && !selected.some(entry => entry[0] === oldest[0])) selected[7] = oldest;
        return selected;
    }

    async run({ state: raw, listDue = false, courseIds = [] } = {}) {
        this.startedAt = this.now();
        this.requests = 0;
        const state = this.normalizeState(raw);
        this.state = state;
        const result = { saved: 0, failed: 0, errors: [], state, moreWork: false, listComplete: false };
        const report = (url, error) => {
            result.failed++;
            result.errors.push({ url, message: error.message, reason: error.reason || "invalid", status: error.status || null });
            if (result.errors.length > 20) result.errors.shift();
        };
        const stop = error => ["auth", "rate-limit", "temporary", "cancelled", "budget"].includes(error.reason);
        try {
            await this.checkpoint();
            const tasks = await this.storage.getAllData({ includeUnavailable: true });
            this.availability = await this.storage.getCourseAvailability();
            this.enrolledCourseIds = await this.storage.getEnrolledCourseIds?.() ?? null;
            const local = new Map((Array.isArray(tasks) ? tasks : []).map(task => [
                (task.group === "assign_list" ? "assign" : "quiz") + ":" + (task.assignId || task.quizId), task
            ]));
            for (const id of [...new Set(courseIds.map(Number))]) this.noteCourse(state, id);
            if (listDue || state.cursor) {
                const sesskey = AutoRefreshCollector.findSesskey(this.document, this.pageURL);
                if (!sesskey) throw this.error("auth", "Moodleのセッションを確認できませんでした");
                if (!state.cursor) {
                    const seconds = Math.floor(this.now() / 1000);
                    state.cursor = { from: seconds - 14 * 86400, to: seconds + 90 * 86400, after: 0, startedAt: this.now() };
                }
                await this.onProgress({ phase: "list", completed: 0, total: 1, saved: result.saved });
                const seenCursors = new Set([state.cursor.after]);
                for (let page = 0; page < 2 && state.cursor; page++) {
                    const data = await this.calendarPage(state.cursor, sesskey);
                    for (const event of data.events) {
                        const id = AutoRefreshCollector.positiveId(event.id);
                        const item = AutoRefreshCollector.eventRef(event);
                        if (!id || !item) continue;
                        const key = item.type + ":" + item.id;
                        const fingerprint = AutoRefreshCollector.fingerprint(event);
                        const old = state.events[id];
                        const cached = local.get(key);
                        const changed = !!old && old.fingerprint !== fingerprint;
                        const modified = Number(event.timemodified) * 1000;
                        const fetched = AutoRefreshCollector.fetchedTime(cached?.fetchedAt);
                        const baselineNewer = !old && Number.isFinite(modified) && modified > (fetched || 0);
                        if (!cached || changed || baselineNewer) this.queue(state, item, true, !old || changed || !state.pending[key]);
                        state.events[id] = { key, fingerprint, seenAt: this.now() };
                        this.noteCourse(state, item.courseId);
                        // An older full inventory cannot rule out a newly added activity.
                        // Verify it through the existing bounded course-discovery pass.
                        const inventory = this.availability?.[item.courseId];
                        if ((!old || changed) && inventory?.inventoryComplete === true
                            && inventory.items?.[key] !== true && state.courses[item.courseId]) {
                            state.courses[item.courseId].discoveredAt = 0;
                        }
                    }
                    if (data.events.length < 50) {
                        state.cursor = null;
                        result.listComplete = true;
                    } else {
                        const after = AutoRefreshCollector.positiveId(data.lastid || data.events[data.events.length - 1]?.id);
                        if (!after || seenCursors.has(after)) throw this.error("temporary", "Moodleの予定一覧の続きが進みませんでした");
                        seenCursors.add(after);
                        state.cursor.after = after;
                    }
                }
            }

            if (listDue || result.listComplete || state.cursor) {
                await this.onProgress({ phase: "list", completed: 1, total: 1, saved: result.saved });
            }
            const discovery = Object.entries(state.courses).filter(([id, course]) =>
                (!Array.isArray(this.enrolledCourseIds) || this.enrolledCourseIds.includes(Number(id)))
                && (!this.availability?.[id] || this.now() - course.discoveredAt >= AutoRefreshCollector.DAY) && course.retryAt <= this.now())
                .sort((a, b) => a[1].discoveredAt - b[1].discoveredAt || b[1].seenAt - a[1].seenAt)[0];
            if (discovery) {
                await this.onProgress({ phase: "courses", completed: 0, total: 1, saved: result.saved });
                const [courseId, course] = discovery;
                const section = course.sectionScan?.pending[0];
                const url = AutoRefreshCollector.baseURL + "course/view.php?id=" + courseId
                    + (section === undefined ? "" : "&section=" + section);
                try {
                    const doc = await this.fetchDocument(url);
                    if (!doc.querySelector("h1") || doc.querySelector(".errorcode, .errormessage")) throw this.error("invalid", "コースの情報を読み取れませんでした");
                    // Keep the existing budget of one course page per batch.
                    // A multipage course is fresh only after every section is read.
                    const scan = course.sectionScan || { startedAt: this.now(), pending: [], visited: [], items: [], hasRoot: true };
                    const visited = new Set(scan.visited);
                    if (section !== undefined) visited.add(section);
                    const pending = scan.pending.filter(value => value !== section);
                    for (const sectionURL of CourseCollector.getSectionURLs(doc, url, courseId)) {
                        const number = Number(new URL(sectionURL).searchParams.get("section"));
                        if (!visited.has(number) && !pending.includes(number)) pending.push(number);
                    }
                    if (pending.length + visited.size >= CourseCollector.maxCoursePages) {
                        throw this.error("invalid", "コースのページ数が多すぎるため、全課題を確認できませんでした。");
                    }
                    const observed = await CourseCollector.collectAvailability(doc, url, url => this.fetchDocument(url));
                    const observations = new Map(scan.items.map(item => [item.type + ":" + item.id, item]));
                    for (const item of observed) {
                        const key = item.type + ":" + item.id;
                        observations.set(key, { ...item, available: item.available && observations.get(key)?.available !== false });
                    }
                    await this.storage.setCourseAvailability(Number(courseId), observed);
                    for (const item of CourseCollector.getItems(doc, url).filter(item => observations.get(item.type + ":" + item.id)?.available !== false)) {
                        const key = item.type + ":" + item.id;
                        if (!local.has(key)) this.queue(state, { ...item, courseId: Number(courseId), due: null });
                    }
                    if (pending.length) course.sectionScan = { startedAt: scan.startedAt, pending,
                        visited: [...visited], items: [...observations.values()], hasRoot: scan.hasRoot };
                    else {
                        if (scan.hasRoot) await this.storage.setCourseAvailability(Number(courseId), [...observations.values()], true);
                        delete course.sectionScan;
                        course.discoveredAt = this.now();
                    }
                    course.failures = 0;
                    course.retryAt = 0;
                } catch (error) {
                    if (!["cancelled", "budget"].includes(error.reason)) this.failedEntry(course);
                    if (stop(error)) throw error;
                    report(url, error);
                }
            }

            if (discovery) await this.onProgress({ phase: "courses", completed: 1, total: 1, saved: result.saved });
            this.availability = await this.storage.getCourseAvailability();
            const details = this.selectDetails(state, local);
            let completed = 0;
            if (details.length) await this.onProgress({ phase: "details", completed, total: details.length, saved: result.saved });
            for (const [key, item] of details) {
                const url = AutoRefreshCollector.baseURL + "mod/" + item.type + "/view.php?id=" + item.id;
                try {
                    if (!this.detailAvailable(item, local.get(key), await this.storage.getCourseAvailability())) continue;
                    const idproperty = item.type === "assign" ? "assignId" : "quizId";
                    const expectedFetchedAt = await this.storage.getTaskFetchedAt(item.type + "_list", idproperty, item.id);
                    const doc = await this.fetchDocument(url);
                    if (!await this.storage.markUnavailableDocument(doc, url, this.scrapers[item.type])) {
                        const scraped = this.scrapers[item.type].getData(doc, url);
                        if (!scraped || scraped.group !== item.type + "_list" || Number(scraped[idproperty]) !== item.id) throw this.error("invalid", "課題の情報を読み取れませんでした");
                        const data = { ...scraped, fetchedAt: this.now(),
                            courseId: AutoRefreshCollector.positiveId(scraped.courseId) || item.courseId || null };
                        await this.checkpoint();
                        const saved = await this.storage.saveData(data.group, idproperty, data, expectedFetchedAt);
                        if (saved === false) {
                            const latest = (await this.storage.getAllData({ includeUnavailable: true }))
                                .find(task => task.group === data.group && Number(task[idproperty]) === item.id);
                            if (latest) local.set(key, latest);
                            const fetched = AutoRefreshCollector.fetchedTime(latest?.fetchedAt);
                            if (fetched === null || fetched > this.now() || fetched < state.pending[key].neededAt) continue;
                        } else {
                            result.saved++;
                            const old = local.get(key);
                            local.set(key, { ...old, ...data, show: old?.show ?? data.show,
                                status: old?.status === "complete" && data.status === "unknown" ? old.status : data.status });
                        }
                    }
                    delete state.pending[key];
                } catch (error) {
                    if (!["cancelled", "budget"].includes(error.reason)) this.failedEntry(item);
                    if (stop(error)) throw error;
                    report(url, error);
                }
                await this.onProgress({ phase: "details", completed: ++completed, total: details.length, saved: result.saved });
            }
        } catch (error) {
            result.stopReason = error.reason || "temporary";
            if (result.stopReason === "cancelled") result.cancelled = true;
            else if (result.stopReason !== "budget") report(AutoRefreshCollector.baseURL, error);
        }
        result.state = this.normalizeState(state);
        this.state = result.state;
        result.moreWork = !!result.state.cursor || Object.keys(result.state.pending).length > 0
            || Object.entries(result.state.courses).some(([id, course]) =>
                (!Array.isArray(this.enrolledCourseIds) || this.enrolledCourseIds.includes(Number(id)))
                && this.now() - course.discoveredAt >= AutoRefreshCollector.DAY);
        return result;
    }
}
