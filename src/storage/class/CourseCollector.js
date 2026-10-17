// Fetch in the Moodle tab so Safari uses the same authenticated session.
class CourseCollector {
    static baseURL = "https://cms7.ict.nitech.ac.jp/moodle40a/";
    static maxCoursePages = 200;

    constructor({ fetch = globalThis.fetch.bind(globalThis),
        parse = html => new DOMParser().parseFromString(html, "text/html"),
        onProgress = () => {}, shouldContinue = async () => true, signal = null } = {}) {
        this.fetch = fetch;
        this.parse = parse;
        this.onProgress = onProgress;
        this.shouldContinue = shouldContinue;
        this.signal = signal;
    }

    async assertContinue() {
        if (this.signal?.aborted || !await this.shouldContinue()) {
            const error = new Error("更新を中断しました");
            error.code = "REFRESH_CANCELLED";
            throw error;
        }
    }

    static getItems(doc, pageURL = this.baseURL) {
        const items = new Map();
        for (const link of doc.querySelectorAll('a[href*="/mod/assign/view.php"], a[href*="/mod/quiz/view.php"]')) {
            let url;
            try { url = new URL(link.getAttribute("href"), pageURL); } catch { continue; }
            if (url.origin !== new URL(this.baseURL).origin
                || !["/moodle40a/mod/assign/view.php", "/moodle40a/mod/quiz/view.php"].includes(url.pathname)) continue;
            const id = Number(url.searchParams.get("id"));
            if (!Number.isInteger(id) || id <= 0) continue;
            const type = url.pathname.endsWith("/assign/view.php") ? "assign" : "quiz";
            items.set(`${type}:${id}`, { type, id });
        }
        return [...items.values()];
    }

    // Follow only read-only section links for this exact course. Strip hashes
    // and unrelated parameters (including editing/session actions).
    static sectionURL(raw, pageURL, courseId) {
        try {
            const url = new URL(raw, pageURL);
            const section = url.searchParams.get("section");
            if (!Number.isSafeInteger(Number(courseId)) || Number(courseId) <= 0
                || url.origin !== new URL(this.baseURL).origin
                || url.pathname !== "/moodle40a/course/view.php"
                || Number(url.searchParams.get("id")) !== Number(courseId)
                || !/^\d+$/.test(section || "") || !Number.isSafeInteger(Number(section))) return null;
            return `${this.baseURL}course/view.php?id=${Number(courseId)}&section=${Number(section)}`;
        } catch { return null; }
    }

    static getSectionURLs(doc, pageURL, courseId) {
        const urls = new Set();
        for (const link of doc.querySelectorAll("a[href]")) {
            const url = this.sectionURL(link.getAttribute("href"), pageURL, courseId);
            if (url) urls.add(url);
            if (urls.size >= this.maxCoursePages) throw new Error("コースのページ数が多すぎるため、全課題を確認できませんでした。");
        }
        return [...urls];
    }

    async fetchDocument(url) {
        await this.assertContinue();
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.signal?.addEventListener?.("abort", abort, { once: true });
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await this.fetch(url, { credentials: "include", signal: controller.signal });
            if (!response.ok) {
                const error = new Error(`ページを取得できませんでした (HTTP ${response.status})`);
                error.status = response.status;
                throw error;
            }
            const finalURL = new URL(response.url || url);
            if (finalURL.origin !== new URL(CourseCollector.baseURL).origin
                || /\/(?:login|auth)\//.test(finalURL.pathname)) {
                const error = new Error("Moodleにログインし直してから更新してください");
                error.code = "AUTH_REQUIRED";
                throw error;
            }
            const doc = this.parse(await response.text());
            if (doc.querySelector('form#login, #loginform, input[name="password"]')) {
                const error = new Error("Moodleにログインし直してから更新してください");
                error.code = "AUTH_REQUIRED";
                throw error;
            }
            globalThis.duedleAssertAccountDocument?.(doc, finalURL.href || url);
            await this.assertContinue();
            return doc;
        } catch (error) {
            if (this.signal?.aborted) await this.assertContinue();
            throw error;
        } finally {
            clearTimeout(timer);
            this.signal?.removeEventListener?.("abort", abort);
        }
    }

    // Moodle 4.0 core_course_external::get_enrolled_courses_by_timeline_classification:
    // classification=all excludes courses removed from the overview; limit=0
    // returns the complete result independently of UI filters and pagination.
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
        const result = { courses: 0, saved: 0, failed: 0, errors: [] };
        await this.onProgress({ ...result, totalCourses: ids.length });
        const seen = new Set();
        for (const courseId of ids) {
            const url = `${CourseCollector.baseURL}course/view.php?id=${courseId}`;
            try {
                const pages = [url];
                const scheduled = new Set(pages);
                for (let page = 0; page < pages.length; page++) {
                    const pageURL = pages[page];
                    const course = await this.fetchDocument(pageURL);
                    if (!course.querySelector("h1") || course.querySelector(".errorcode, .errormessage")) {
                        throw new Error("コースを開けませんでした。Moodleのアクセス権を確認してください");
                    }
                    for (const section of CourseCollector.getSectionURLs(course, pageURL, courseId)) {
                        if (scheduled.has(section)) continue;
                        if (scheduled.size >= CourseCollector.maxCoursePages) throw new Error("コースのページ数が多すぎるため、全課題を確認できませんでした。");
                        scheduled.add(section);
                        pages.push(section);
                    }
                    for (const item of CourseCollector.getItems(course, pageURL)) {
                        const key = `${item.type}:${item.id}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const taskURL = `${CourseCollector.baseURL}mod/${item.type}/view.php?id=${item.id}`;
                        try {
                            const taskDoc = await this.fetchDocument(taskURL);
                            const scraper = item.type === "assign" ? ScrapeAssign : ScrapeQuiz;
                            const data = scraper.getData(taskDoc, taskURL);
                            if (!data) throw new Error("課題の情報を読み取れませんでした");
                            await this.assertContinue();
                            await StorageUtil.saveData(data.group, item.type === "assign" ? "assignId" : "quizId", data);
                            result.saved++;
                        } catch (error) {
                            if (CourseCollector.shouldStop(error)) throw error;
                            result.failed++;
                            result.errors.push({ url: taskURL, message: error.message });
                        }
                        await this.onProgress({ ...result, totalCourses: ids.length });
                    }
                }
                result.courses++;
            } catch (error) {
                if (CourseCollector.shouldStop(error)) throw error;
                result.failed++;
                result.errors.push({ url, message: error.message });
            }
            await this.onProgress({ ...result, totalCourses: ids.length });
        }
        return result;
    }
}
