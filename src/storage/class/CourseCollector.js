// Fetch in the Moodle tab so Safari uses the same authenticated session.
class CourseCollector {
    static baseURL = "https://cms7.ict.nitech.ac.jp/moodle40a/";

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

    static shouldStop(error) {
        return error.code === "REFRESH_CANCELLED" || error.code === "AUTH_REQUIRED"
            || [401, 403, 429].includes(error.status) || error.status >= 500;
    }

    async run(courseIds) {
        const ids = [...new Set((courseIds || []).map(Number))]
            .filter(id => Number.isInteger(id) && id > 0);
        if (!ids.length) throw new Error("マイコースを表示してから課題情報を更新してください");
        const result = { courses: 0, saved: 0, failed: 0, errors: [] };
        const seen = new Set();
        for (const courseId of ids) {
            const url = `${CourseCollector.baseURL}course/view.php?id=${courseId}`;
            try {
                const course = await this.fetchDocument(url);
                if (!course.querySelector("h1") || course.querySelector(".errorcode, .errormessage")) {
                    throw new Error("コースを開けませんでした。Moodleのアクセス権を確認してください");
                }
                for (const item of CourseCollector.getItems(course, url)) {
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
                    this.onProgress({ ...result, totalCourses: ids.length });
                }
                result.courses++;
            } catch (error) {
                if (CourseCollector.shouldStop(error)) throw error;
                result.failed++;
                result.errors.push({ url, message: error.message });
            }
            this.onProgress({ ...result, totalCourses: ids.length });
        }
        return result;
    }
}
