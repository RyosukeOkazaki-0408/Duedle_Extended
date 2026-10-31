// Fetch in the Moodle tab so Safari uses the same authenticated session.
class CourseCollector {
    static baseURL = (globalThis.DuedleSites?.root() ?? "https://cms7.ict.nitech.ac.jp/moodle40a/");
    static maxCoursePages = 200;
    static courseConcurrency = 1;

    constructor({ fetch = globalThis.fetch.bind(globalThis),
        parse = html => new DOMParser().parseFromString(html, "text/html"),
        onProgress = () => {}, shouldContinue = async () => true, signal = null,
        now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
        this.fetch = fetch;
        this.parse = parse;
        this.onProgress = onProgress;
        this.shouldContinue = shouldContinue;
        this.signal = signal;
        this.now = now;
        this.responseSince = new WeakMap();
    }

    async assertContinue() {
        const started = this.profiling ? this.now() : null;
        try {
            if (this.signal?.aborted || !await this.shouldContinue()) {
                const error = new Error("更新を中断しました");
                error.code = "REFRESH_CANCELLED";
                throw error;
            }
        } finally {
            if (started !== null) this.timings.ownershipCheckMs += this.now() - started;
        }
    }

    static isUnavailable(node) {
        const sectionSelector = '.course-section, li.section, [data-for="section"]';
        const activitySelector = '.activity, [data-for="cmitem"]';
        const section = node.closest?.(sectionSelector);
        const activity = node.closest?.(activitySelector) || node.closest?.('.activity-item');
        for (const scope of [activity, section].filter(Boolean)) {
            if (scope.matches('.hidden, .sectionhidden, .hiddenactivity, [data-uservisible="false"], [data-uservisible="0"], [data-available="false"], [data-available="0"]')) return true;
            if (scope === activity && [...scope.querySelectorAll('.hiddenactivity')].some(marker =>
                (marker.closest(activitySelector) || marker.closest('.activity-item')) === activity)) return true;
            for (const marker of scope.querySelectorAll('.availabilityinfo, [data-region="availabilityinfo"], .badge')) {
                // An unavailable child activity must not hide its siblings.
                const owner = marker.closest(activitySelector) || marker.closest('.activity-item');
                if (scope === section && (owner || marker.closest(sectionSelector) !== section)) continue;
                if (scope === activity && owner !== activity) continue;
                if (/利用できません|利用不可|学生から非表示|Not available\b|Hidden from students\b/i.test(marker.textContent)) return true;
            }
        }
        return node.getAttribute?.('aria-disabled') === 'true' || node.matches?.('a.dimmed, a.dimmed_text') === true;
    }

    static getTaskAvailability(doc, pageURL = this.baseURL) {
        const items = new Map();
        const priorities = new Map();
        const content = doc.querySelector('.course-content');
        for (const link of doc.querySelectorAll('a[href*="/mod/assign/view.php"], a[href*="/mod/quiz/view.php"]')) {
            if (content && !content.contains(link)) continue;
            let url;
            try { url = new URL(link.getAttribute("href"), pageURL); } catch { continue; }
            if (url.origin !== new URL(this.baseURL).origin
                || !["/moodle40a/mod/assign/view.php", "/moodle40a/mod/quiz/view.php"].includes(url.pathname)) continue;
            const id = Number(url.searchParams.get("id"));
            if (!Number.isInteger(id) || id <= 0) continue;
            const type = url.pathname.endsWith("/assign/view.php") ? "assign" : "quiz";
            const key = `${type}:${id}`;
            const activity = link.closest?.('.activity, [data-for="cmitem"]') || link.closest?.('.activity-item');
            const moduleId = activity?.id?.match(/^module-(\d+)$/)?.[1] || activity?.getAttribute('data-id');
            if (moduleId && Number(moduleId) !== id) continue;
            const priority = activity ? 2 : 1;
            if ((priorities.get(key) || 0) > priority) continue;
            const available = !this.isUnavailable(link)
                && ((priorities.get(key) || 0) < priority || items.get(key)?.available !== false);
            priorities.set(key, priority);
            items.set(key, { type, id, available });
        }
        // Restricted Moodle activities can retain their module ID and type
        // while replacing the primary link with plain text.
        const activities = new Set();
        for (const node of doc.querySelectorAll('.activity, [data-for="cmitem"], .activity-item')) {
            const activity = node.closest('.activity, [data-for="cmitem"]') || node;
            if (activities.has(activity) || content && !content.contains(activity)) continue;
            activities.add(activity);
            const id = Number(activity.id?.match(/^module-(\d+)$/)?.[1] || activity.getAttribute('data-id'));
            const type = ['assign', 'quiz'].find(type => activity.matches('.modtype_' + type) || activity.querySelector('.modtype_' + type));
            if (!Number.isSafeInteger(id) || id <= 0 || !type) continue;
            const hasLink = [...activity.querySelectorAll('a[href]')].some(link => {
                try {
                    const url = new URL(link.getAttribute('href'), pageURL);
                    return url.origin === new URL(this.baseURL).origin && url.pathname === `/moodle40a/mod/${type}/view.php`
                        && Number(url.searchParams.get('id')) === id;
                } catch { return false; }
            });
            const restriction = [...activity.querySelectorAll('.availabilityinfo, [data-region="availabilityinfo"]')].some(marker =>
                (marker.closest('.activity, [data-for="cmitem"]') || marker.closest('.activity-item')) === activity && marker.textContent.trim());
            if (this.isUnavailable(activity) || !hasLink && restriction) items.set(`${type}:${id}`, { type, id, available: false });
        }
        return [...items.values()];
    }

    static getItems(doc, pageURL = this.baseURL) {
        return this.getTaskAvailability(doc, pageURL).filter(item => item.available)
            .map(({ type, id }) => ({ type, id }));
    }

    static sectionName(text) {
        return String(text || "").normalize("NFKC").replace(/\s+/g, "");
    }

    static getSectionAvailability(doc) {
        const sections = new Map();
        for (const section of doc.querySelectorAll('.course-section, li.section, [data-for="section"]')) {
            const heading = section.querySelector('.sectionname, [data-for="section_title"], .section-title, h3, h2');
            if (!heading) continue;
            const title = heading.cloneNode(true);
            title.querySelectorAll('.badge, .accesshide, .sr-only, .visually-hidden').forEach(node => node.remove());
            const name = this.sectionName(title.textContent);
            if (!name) continue;
            const available = !this.isUnavailable(section);
            // Duplicate names with different restrictions cannot identify a section.
            sections.set(name, sections.has(name) && sections.get(name) !== available ? null : available);
        }
        return sections;
    }

    // Moodle 4.0's quiz/assignment indexes put the section name in the first
    // column, followed by module links. Subsequent rows in a section leave it blank.
    static getIndexAvailability(doc, pageURL, type, sections) {
        const items = new Map();
        for (const table of doc.querySelectorAll('table.generaltable')) {
            let section = null;
            for (const row of table.querySelectorAll('tbody > tr')) {
                const cells = [...row.cells];
                if (cells.length < 2 || cells[0].colSpan > 1) { section = null; continue; }
                const name = this.sectionName(cells[0].textContent);
                if (name) section = sections.has(name) ? sections.get(name) : null;
                for (const link of cells[1].querySelectorAll('a[href]')) {
                    let url;
                    try { url = new URL(link.getAttribute('href'), pageURL); } catch { continue; }
                    const id = Number(url.searchParams.get('id'));
                    if (url.origin !== new URL(this.baseURL).origin
                        || url.pathname !== `/moodle40a/mod/${type}/view.php`
                        || !Number.isSafeInteger(id) || id <= 0) continue;
                    // A public section does not prove that each activity is
                    // available. Indexes only add explicit negative decisions.
                    if (section !== false && !link.matches('.dimmed, .dimmed_text, [aria-disabled="true"]')) continue;
                    items.set(id, { type, id, available: false });
                }
            }
        }
        return [...items.values()].filter(item => item.available !== null);
    }

    static async collectAvailability(doc, pageURL, fetchDocument = url => new this().fetchDocument(url), cache = new Map()) {
        const observed = new Map(this.getTaskAvailability(doc, pageURL).map(item => [`${item.type}:${item.id}`, item]));
        const sections = this.getSectionAvailability(doc);
        const page = new URL(pageURL);
        const courseId = Number(page.searchParams.get('id'));
        if (page.origin !== new URL(this.baseURL).origin || page.pathname !== '/moodle40a/course/view.php'
            || !Number.isSafeInteger(courseId) || courseId <= 0 || !sections.size) return [...observed.values()];
        if (![...sections.values()].includes(false)) {
            const previous = (await StorageUtil.getCourseAvailability())[courseId];
            if (!Object.values(previous?.items || {}).includes(false)) return [...observed.values()];
        }
        for (const type of ['quiz', 'assign']) {
            const url = `${this.baseURL}mod/${type}/index.php?id=${courseId}`;
            try {
                if (!cache.has(url)) cache.set(url, fetchDocument(url));
                const index = await cache.get(url);
                const indexCourse = index.body?.className?.match(/\bcourse-(\d+)\b/);
                if (indexCourse && Number(indexCourse[1]) !== courseId) continue;
                if (index.querySelector('.errorcode, .errormessage')) continue;
                for (const item of this.getIndexAvailability(index, url, type, sections)) {
                    const key = `${type}:${item.id}`;
                    observed.set(key, { ...item, available: item.available && observed.get(key)?.available !== false });
                }
            } catch (error) {
                if ([403, 404].includes(error.status)) continue;
                if (this.shouldStop(error) || ['auth', 'cancelled', 'budget', 'rate-limit', 'temporary'].includes(error.reason)) throw error;
                // An unavailable index provides no evidence about individual tasks.
            }
        }
        return [...observed.values()];
    }

    // Follow only read-only section links for this exact course. Strip hashes
    // and unrelated parameters (including editing/session actions).
    static sectionURL(raw, pageURL, courseId) {
        const baseURL = globalThis.DuedleSites?.root(pageURL) ?? this.baseURL;
        try {
            const url = new URL(raw, pageURL);
            const section = url.searchParams.get("section");
            if (!Number.isSafeInteger(Number(courseId)) || Number(courseId) <= 0
                || url.origin !== new URL(baseURL).origin
                || url.pathname !== "/moodle40a/course/view.php"
                || Number(url.searchParams.get("id")) !== Number(courseId)
                || !/^\d+$/.test(section || "") || !Number.isSafeInteger(Number(section))) return null;
            return `${baseURL}course/view.php?id=${Number(courseId)}&section=${Number(section)}`;
        } catch { return null; }
    }

    static getSectionURLs(doc, pageURL, courseId) {
        const urls = new Set();
        const blocked = new Set();
        for (const section of doc.querySelectorAll('.course-section, li.section, [data-for="section"]')) {
            if (!this.isUnavailable(section)) continue;
            const number = section.getAttribute('data-sectionid') ?? section.getAttribute('data-number')
                ?? section.id?.match(/^section-(\d+)$/)?.[1];
            if (/^\d+$/.test(number || '')) blocked.add(Number(number));
        }
        for (const link of doc.querySelectorAll("a[href]")) {
            const url = this.sectionURL(link.getAttribute("href"), pageURL, courseId);
            if (url && !this.isUnavailable(link) && !blocked.has(Number(new URL(url).searchParams.get('section')))) urls.add(url);
            if (urls.size >= this.maxCoursePages) throw new Error("コースのページ数が多すぎるため、全課題を確認できませんでした。");
        }
        return [...urls];
    }

    // A complete state response must be understood before it replaces HTML.
    static stateAvailability(state, courseId) {
        const validId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
        if (Number(state?.course?.id) !== courseId || !Array.isArray(state?.section)
            || !Array.isArray(state?.cm) || state.cm.length > 10000) throw new Error("Invalid course state");
        const sections = new Map();
        for (const section of state.section) {
            if (!validId(section?.id) || sections.has(Number(section.id)) || typeof section.visible !== 'boolean'
                || !Array.isArray(section.cmlist) || !section.cmlist.every(validId)) throw new Error("Invalid section state");
            sections.set(Number(section.id), section);
        }
        const seen = new Set(), items = [];
        for (const cm of state.cm) {
            if (!validId(cm?.id) || seen.has(Number(cm.id))) throw new Error("Invalid activity state");
            seen.add(Number(cm.id));
            // Moodle omits URLs for activities such as labels, as well as
            // unlinked restricted items. They are not task-link candidates.
            if (cm.url == null || cm.url === '') continue;
            if (typeof cm.url !== 'string') throw new Error("Invalid activity URL");
            const url = new URL(cm.url, this.baseURL);
            if (url.origin !== new URL(this.baseURL).origin) throw new Error("Invalid activity origin");
            const type = url.pathname.match(/^\/moodle40a\/mod\/(assign|quiz)\/view\.php$/)?.[1];
            if (!type) continue;
            const section = sections.get(Number(cm.sectionid)), id = Number(cm.id);
            if (Number(url.searchParams.get('id')) !== id || !section
                || typeof cm.visible !== 'boolean' || typeof cm.uservisible !== 'boolean') throw new Error("Incomplete activity state");
            // accessvisible describes restrictions for everyone, not this user's access.
            items.push({ type, id, available: cm.visible && cm.uservisible && section.visible
                && section.cmlist.some(value => Number(value) === id) });
        }
        if ([...sections.values()].some(section => section.cmlist.some(id => !seen.has(Number(id))))) {
            throw new Error("Incomplete course state");
        }
        return items;
    }

    async fetchCourseState(courseId, signal) {
        const payload = await this.fetchCourseAPI('core_courseformat_get_state', { courseid: courseId }, signal, courseId);
        const items = CourseCollector.stateAvailability(typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data, courseId);
        this.responseSince.set(items, this.responseSince.get(payload));
        return items;
    }

    async fetchCourseAPI(method, args, signal, courseId) {
        const sesskey = AutoRefreshCollector.findSesskey(globalThis.document);
        if (!sesskey) throw new Error("Missing Moodle session key");
        const url = CourseCollector.baseURL + 'lib/ajax/service.php?sesskey=' + encodeURIComponent(sesskey)
            + '&info=' + method + '&nosessionupdate=true';
        const payload = await this.fetchDocument(url, signal, courseId, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ index: 0, methodname: method, args }])
        });
        const entry = Array.isArray(payload) && payload.length === 1 ? payload[0] : null;
        if (!entry || entry.error || entry.exception) {
            const error = new Error('Course state API unavailable');
            if (/^(?:requireloginerror|notloggedin|invalidsesskey|servicerequireslogin)$/.test(entry?.exception?.errorcode || '')) error.code = 'AUTH_REQUIRED';
            throw error;
        }
        this.responseSince.set(entry, this.responseSince.get(payload));
        return entry;
    }

    async changedTasks(courseId, since, signal) {
        const { data } = await this.fetchCourseAPI('core_course_get_updates_since', { courseid: courseId, since }, signal, courseId);
        if (!Array.isArray(data?.instances) || !Array.isArray(data?.warnings) || data.warnings.length
            || data.instances.some(item => item?.contextlevel !== 'module' || !Number.isSafeInteger(item.id) || item.id <= 0
                || !Array.isArray(item.updates) || item.updates.some(update => typeof update?.name !== 'string'))) {
            throw new Error('Incomplete course updates');
        }
        return new Set(data.instances.map(item => item.id));
    }

    async fetchDocument(url, signal = this.signal, courseId = null, ajax = null) {
        await this.assertContinue();
        if (signal?.aborted) throw Object.assign(new Error("更新が中断されました"), { code: "REFRESH_CANCELLED" });
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener?.("abort", abort, { once: true });
        if (signal?.aborted) abort();
        const timer = setTimeout(() => controller.abort(), 20000);
        const timing = this.profiling ? this.timings : null;
        const started = this.now();
        const request = timing ? { courseId, path: new URL(url).pathname + (ajax ? '?info=' + new URL(url).searchParams.get('info') : new URL(url).search),
            startMs: started - timing.startedAt, headersMs: null, bodyMs: null, parseMs: 0, failed: false } : null;
        if (request) {
            timing.requests.push(request);
            timing.peakRequests = Math.max(timing.peakRequests, ++timing.activeRequests);
        }
        const endNetwork = () => {
            if (request && request.networkEndMs === undefined) {
                request.networkEndMs = this.now() - timing.startedAt;
                request.bodyMs = Math.max(0, request.networkEndMs - request.startMs - (request.headersMs ?? 0));
                timing.activeRequests--;
            }
        };
        try {
            const response = await this.fetch(url, { ...ajax, credentials: "include", signal: controller.signal });
            if (request) { request.headersMs = this.now() - started; request.status = response.status; }
            const taskType = new URL(url).pathname.match(/^\/moodle40a\/mod\/(assign|quiz)\/view\.php$/)?.[1];
            const statusError = Object.assign(new Error(`ページを取得できませんでした (HTTP ${response.status})`), { status: response.status });
            if (!response.ok && !([403, 404].includes(response.status) && taskType)) throw statusError;
            const finalURL = new URL(response.url || url);
            if (finalURL.origin !== new URL(CourseCollector.baseURL).origin
                || /\/(?:login|auth)\//.test(finalURL.pathname)) {
                const error = new Error("Moodleにログインし直してから更新してください");
                error.code = "AUTH_REQUIRED";
                throw error;
            }
            const html = await response.text();
            endNetwork();
            const parseStarted = this.now();
            let doc;
            try { doc = ajax ? JSON.parse(html) : this.parse(html); }
            finally { if (request) request.parseMs = this.now() - parseStarted; }
            if (ajax) {
                // Use server time, conservatively before this request. Never
                // move the checkpoint to the end of a scan and miss concurrent edits.
                const serverTime = Date.parse(response.headers?.get('Date'));
                if (doc && typeof doc === 'object' && Number.isFinite(serverTime)) {
                    this.responseSince.set(doc, Math.floor(serverTime / 1000) - Math.ceil((this.now() - started) / 1000) - 2);
                }
                await this.assertContinue(); return doc;
            }
            if (doc.querySelector('form#login, #loginform, input[name="password"]')) {
                const error = new Error("Moodleにログインし直してから更新してください");
                error.code = "AUTH_REQUIRED";
                throw error;
            }
            globalThis.duedleAssertAccountDocument?.(doc, finalURL.href || url);
            await this.assertContinue();
            if (!response.ok && !(taskType === 'quiz' ? ScrapeQuiz : ScrapeAssign).unavailableTask(doc, url)) throw statusError;
            return doc;
        } catch (error) {
            if (request) request.failed = true;
            if (this.signal?.aborted) await this.assertContinue();
            throw error;
        } finally {
            endNetwork();
            clearTimeout(timer);
            signal?.removeEventListener?.("abort", abort);
        }
    }

    // Moodle 4.0 core_course_external::get_enrolled_courses_by_timeline_classification:
    // Only courses shown in the overview are collection/display targets.
    // limit=0 includes the full visible list, independently of UI pagination.
    async enrolledCourseIds(doc = document) {
        await this.assertContinue();
        const sesskey = AutoRefreshCollector.findSesskey(doc);
        if (!sesskey) throw new Error("登録コースを確認できません。Moodleのページを再読み込みしてください。");
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.signal?.addEventListener?.("abort", abort, { once: true });
        const timer = setTimeout(abort, 20000);
        try {
            const method = "core_course_get_enrolled_courses_by_timeline_classification";
            const response = await this.fetch(CourseCollector.baseURL + "lib/ajax/service.php?sesskey="
                + encodeURIComponent(sesskey) + "&info=" + method + "&nosessionupdate=true", {
                method: "POST", credentials: "include", signal: controller.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([{ index: 0, methodname: method,
                    args: { classification: "all", limit: 0, offset: 0 } }])
            });
            if (!response.ok || response.redirected) throw new Error("登録コースの取得に失敗しました。再読み込みしてからお試しください。");
            const payload = await response.json();
            const entry = Array.isArray(payload) && payload.length === 1 ? payload[0] : null;
            const courses = entry?.data?.courses;
            if (entry?.error || entry?.exception || !Array.isArray(courses) || courses.length > 10000
                || courses.some(course => !Number.isSafeInteger(course?.id) || course.id <= 0)) {
                throw new Error("登録コースを確認できませんでした。Moodleへのログイン状態を確認してください。");
            }
            await this.assertContinue();
            return [...new Set(courses.map(course => course.id))];
        } finally {
            clearTimeout(timer);
            this.signal?.removeEventListener?.("abort", abort);
        }
    }

    static shouldStop(error) {
        return error.code === "REFRESH_CANCELLED" || error.code === "AUTH_REQUIRED"
            || [401, 403, 429].includes(error.status) || error.status >= 500;
    }

    async run(courseIds) {
        const ids = [...new Set((courseIds || []).map(Number))]
            .filter(id => Number.isInteger(id) && id > 0);
        if (!ids.length) throw new Error("マイコースを表示してから課題情報を更新してください");
        const result = { courses: 0, saved: 0, skipped: 0, failed: 0, errors: [] };
        const concurrency = CourseCollector.courseConcurrency;
        const timing = this.timings = { version: `courses-${concurrency}-v1`, concurrency, startedAt: this.now(), totalMs: 0,
            requests: [], courses: [], storageMs: 0, progressMs: 0, taskParseMs: 0, queueWaitMs: 0,
            activeRequests: 0, peakRequests: 0, ownershipCheckMs: 0, skippedTasks: 0 };
        await this.onProgress({ ...result, totalCourses: ids.length });
        this.profiling = true;
        const seen = new Set();
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.signal?.addEventListener?.("abort", abort, { once: true });
        if (this.signal?.aborted) abort();
        let next = 0, stopped, writes = Promise.resolve();
        const check = async () => {
            await this.assertContinue();
            if (stopped) throw stopped;
            if (controller.signal.aborted) throw Object.assign(new Error("更新が中断されました"), { code: "REFRESH_CANCELLED" });
        };
        // Course workers share the queue; storage/progress updates stay serial.
        const commit = (operation, phase = "storageMs") => {
            const queuedAt = this.now();
            const pending = writes.then(async () => {
                timing.queueWaitMs += this.now() - queuedAt;
                await check();
                const started = this.now();
                try { return await operation(); }
                finally { timing[phase] += this.now() - started; }
            });
            writes = pending.catch(() => {});
            return pending;
        };
        const publish = () => commit(() => this.onProgress({ ...result, totalCourses: ids.length }), "progressMs");
        const worker = async () => {
            while (true) {
                await check();
                if (next >= ids.length) return;
                const courseId = ids[next++];
                const courseTiming = { courseId, startMs: this.now() - timing.startedAt, totalMs: 0 };
                timing.courses.push(courseTiming);
                const fetchDocument = async url => { await check(); return this.fetchDocument(url, controller.signal, courseId); };
                const url = `${CourseCollector.baseURL}course/view.php?id=${courseId}`;
                try {
                    const previous = (await StorageUtil.getCourseAvailability())[courseId];
                    const cached = (await StorageUtil.getAllData({ includeUnavailable: true })).filter(item => Number(item.courseId) === courseId);
                    const cache = new Map(cached.map(item => [item.group === 'assign_list' ? `assign:${item.assignId}` : `quiz:${item.quizId}`, item]));
                    let state = null;
                    try { state = await this.fetchCourseState(courseId, controller.signal); }
                    catch (error) {
                        if (stopped || CourseCollector.shouldStop(error)) throw stopped || error;
                        // Only fixed messages: never retain response bodies or session keys.
                        courseTiming.stateFallback = ['Invalid course state', 'Invalid section state', 'Invalid activity state',
                            'Invalid activity URL', 'Invalid activity origin', 'Incomplete activity state', 'Incomplete course state',
                            'Course state API unavailable', 'Missing Moodle session key'].includes(error.message)
                            ? error.message : 'Course state request or response failed';
                    }
                    const checkpoint = state && this.responseSince.get(state);
                    const since = previous?.detailsCheckedSince;
                    let changes = null;
                    if (state && Number.isSafeInteger(checkpoint) && checkpoint > 0
                        && Number.isSafeInteger(since) && since > 0 && since <= checkpoint) {
                        try { changes = await this.changedTasks(courseId, since, controller.signal); }
                        catch (error) { if (stopped || CourseCollector.shouldStop(error)) throw stopped || error; }
                    }
                    const failedAtStart = result.failed;
                    const pages = state ? [null] : [url];
                    const scheduled = new Set(pages);
                    const availability = new Map();
                    const indexes = new Map();
                    for (let page = 0; page < pages.length; page++) {
                        const pageURL = pages[page];
                        const course = state ? null : await fetchDocument(pageURL);
                        if (!state) {
                            if (!course.querySelector("h1") || course.querySelector(".errorcode, .errormessage")) {
                                throw new Error("コースを開けませんでした。Moodleのアクセス権を確認してください");
                            }
                            for (const section of CourseCollector.getSectionURLs(course, pageURL, courseId)) {
                                if (scheduled.has(section)) continue;
                                if (scheduled.size >= CourseCollector.maxCoursePages) throw new Error("コースのページ数が多すぎるため、全課題を確認できませんでした。");
                                scheduled.add(section);
                                pages.push(section);
                            }
                        }
                        const observed = state || await CourseCollector.collectAvailability(course, pageURL, fetchDocument, indexes);
                        if (state) {
                            // A validated full inventory can also retire cached activities
                            // omitted entirely by Moodle (for example, hidden activities).
                            const keys = new Set(observed.map(item => `${item.type}:${item.id}`));
                            for (const old of cached) {
                                const type = old.group === 'assign_list' ? 'assign' : old.group === 'quiz_list' ? 'quiz' : null;
                                const id = old[type === 'assign' ? 'assignId' : 'quizId'];
                                if (type && !keys.has(`${type}:${id}`)) observed.push({ type, id, available: false });
                            }
                        }
                        await commit(() => StorageUtil.setCourseAvailability(courseId, observed));
                        for (const item of observed) {
                            const key = `${item.type}:${item.id}`;
                            availability.set(key, { ...item, available: item.available && availability.get(key)?.available !== false });
                        }
                        const candidates = (state ? observed.filter(item => item.available) : CourseCollector.getItems(course, pageURL)).filter(item => {
                            const key = `${item.type}:${item.id}`;
                            if (seen.has(key) || availability.get(key)?.available === false) return false;
                            seen.add(key);
                            return true;
                        });
                        for (const item of candidates) {
                            const key = `${item.type}:${item.id}`;
                            const old = cache.get(key);
                            // A newly released, missing or unreadable task always
                            // needs a detail read, even if the update API is silent.
                            const crossedTime = old && [old.start, old.due].some(value => {
                                const at = Date.parse(value);
                                return Number.isFinite(at) && at >= since * 1000 && at <= (checkpoint + 3) * 1000;
                            });
                            if (changes && !changes.has(item.id) && previous?.items?.[key] === true
                                && old && Number.isFinite(old.fetchedAt) && old.fetchedAt > 0
                                && ['complete', 'qualify', 'incomplete', 'stuck', 'warning', 'expired'].includes(old.status)
                                && old.needsDetailRetry !== true && !crossedTime) {
                                result.skipped++;
                                timing.skippedTasks++;
                                continue;
                            }
                            const taskURL = `${CourseCollector.baseURL}mod/${item.type}/view.php?id=${item.id}`;
                            try {
                                const idproperty = item.type === "assign" ? "assignId" : "quizId";
                                const expectedFetchedAt = await StorageUtil.getTaskFetchedAt(item.type + "_list", idproperty, item.id);
                                const taskDoc = await fetchDocument(taskURL);
                                const scraper = item.type === "assign" ? ScrapeAssign : ScrapeQuiz;
                                if (await commit(() => StorageUtil.markUnavailableDocument(taskDoc, taskURL, scraper))) {
                                    availability.set(key, { ...item, available: false });
                                    continue;
                                }
                                const parseStarted = this.now();
                                let data;
                                try { data = scraper.getData(taskDoc, taskURL); }
                                finally { timing.taskParseMs += this.now() - parseStarted; }
                                if (!data) throw new Error("課題の情報を読み取れませんでした");
                                await commit(async () => {
                                    const saved = await StorageUtil.saveData(data.group, idproperty, { ...data, courseId }, expectedFetchedAt);
                                    if (saved !== false) result.saved++;
                                    else { result.skipped++; timing.skippedTasks++; }
                                });
                            } catch (error) {
                                if (stopped || CourseCollector.shouldStop(error)) throw stopped || error;
                                await commit(() => {
                                    result.failed++;
                                    result.errors.push({ url: taskURL, message: error.message });
                                });
                            }
                            await publish();
                        }
                    }
                    await commit(async () => {
                        await StorageUtil.setCourseAvailability(courseId, [...availability.values()], true,
                            state && result.failed === failedAtStart && Number.isSafeInteger(checkpoint) && checkpoint > 0 ? checkpoint : null, Boolean(state));
                        result.courses++;
                    });
                } catch (error) {
                    if (stopped || CourseCollector.shouldStop(error)) throw stopped || error;
                    await commit(() => {
                        result.failed++;
                        result.errors.push({ url, message: error.message });
                    });
                } finally { courseTiming.totalMs = this.now() - timing.startedAt - courseTiming.startMs; }
                await publish();
            }
        };
        try {
            await Promise.allSettled(Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
                try { await worker(); }
                catch (error) {
                    stopped ||= error;
                    controller.abort();
                }
            }));
            if (stopped) throw stopped;
            return result;
        } finally {
            timing.totalMs = this.now() - timing.startedAt;
            const events = timing.requests.filter(request => request.networkEndMs > request.startMs).flatMap(request => [
                { at: request.startMs, change: 1 }, { at: request.networkEndMs, change: -1 }
            ]).sort((a, b) => a.at - b.at || a.change - b.change);
            let active = 0, previous = 0;
            timing.networkActiveMs = 0;
            timing.networkOverlapMs = 0;
            for (const event of events) {
                if (active > 0) timing.networkActiveMs += event.at - previous;
                if (active > 1) timing.networkOverlapMs += event.at - previous;
                active += event.change;
                previous = event.at;
            }
            delete timing.startedAt;
            delete timing.activeRequests;
            this.profiling = false;
            this.signal?.removeEventListener?.("abort", abort);
        }
    }
}
