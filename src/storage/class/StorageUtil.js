class StorageUtil {
    static isBackground = false;
    static queues = new Map();

    static taskAvailable(data, availability = {}, enrolledCourseIds = null) {
        const key = data.group === "assign_list" ? `assign:${data.assignId}` : `quiz:${data.quizId}`;
        const observedCourseId = Object.keys(availability || {})
            .find(id => Object.prototype.hasOwnProperty.call(availability[id].items || {}, key));
        const courseId = data.courseId || observedCourseId;
        if (Array.isArray(enrolledCourseIds) && courseId
            && !enrolledCourseIds.includes(Number(courseId))) return false;
        const course = availability?.[courseId] || availability?.[observedCourseId];
        if (!course) return true;
        // Only a complete API inventory establishes that missing activities are unavailable.
        // HTML course pages may be partial or use an unrecognised layout.
        return course.inventoryComplete === true ? course.items?.[key] === true : course.items?.[key] !== false;
    }

    static async getCourseAvailability() {
        return (await ext.storage.local.get("courseAvailability")).courseAvailability || {};
    }

    static async getEnrolledCourseIds() {
        return (await ext.storage.local.get("enrolledCourseIds")).enrolledCourseIds ?? null;
    }

    static async markUnavailableDocument(doc, pageURL = doc.URL, scraper = Scrape) {
        const task = scraper.unavailableTask?.(doc, pageURL);
        if (!task) return null;
        let courseId = scraper.detailMetadata(doc, pageURL).courseId;
        if (!courseId) {
            const key = task.type === 'assign' ? 'assignId' : 'quizId';
            courseId = (await this.getAllData({ includeUnavailable: true }))
                .find(item => item.group === task.type + '_list' && Number(item[key]) === task.id)?.courseId;
        }
        if (courseId) await this.setCourseAvailability(courseId, [task]);
        return task;
    }

    static async getAllData({ includeUnavailable = false } = {}) {
        const result = await ext.storage.local.get(["assign_list", "quiz_list", "courseAvailability", "enrolledCourseIds"]);
        const deadline = value => {
            const time = value ? new Date(value).getTime() : NaN;
            return Number.isFinite(time) ? time : -Infinity;
        };
        return [...(result.assign_list || []), ...(result.quiz_list || [])]
            .filter(item => includeUnavailable || this.taskAvailable(item, result.courseAvailability, result.enrolledCourseIds))
            .sort((a, b) => (deadline(a.due) - deadline(b.due)) || 0);
    }

    static async setCourseAvailability(courseId, items, complete = false, detailsCheckedSince = null, inventoryComplete = false) {
        if (!Number.isSafeInteger(Number(courseId)) || Number(courseId) <= 0
            || !Array.isArray(items) || items.length > 10000 || typeof complete !== "boolean"
            || typeof inventoryComplete !== "boolean" || inventoryComplete && !complete
            || detailsCheckedSince !== null && (!complete || !Number.isSafeInteger(detailsCheckedSince) || detailsCheckedSince <= 0)
            || items.some(item => !["assign", "quiz"].includes(item?.type)
                || !Number.isSafeInteger(item.id) || item.id <= 0
                || item.available !== undefined && typeof item.available !== "boolean")) {
            throw new Error("Invalid course availability");
        }
        if (!this.isBackground) {
            return this.requestMutation({ type: "SET_COURSE_AVAILABILITY", courseId: Number(courseId), items, complete, detailsCheckedSince, inventoryComplete });
        }
        const availability = await this.getCourseAvailability();
        const old = availability[courseId];
        const observed = inventoryComplete ? {} : { ...old?.items };
        const released = items.some(item => item.available !== false
            && (old?.items?.[`${item.type}:${item.id}`] === false
                || old?.inventoryComplete === true && old.items?.[`${item.type}:${item.id}`] !== true));
        for (const item of items) observed[`${item.type}:${item.id}`] = item.available !== false;
        await ext.storage.local.set({ courseAvailability: { ...availability,
            [courseId]: { ...old, items: observed, complete: complete || old?.complete === true,
                ...(inventoryComplete ? { inventoryComplete: true } : {}),
                ...(released && old?.detailsCheckedSince ? { detailsCheckedSince: null } : {}),
                ...(detailsCheckedSince === null ? {} : { detailsCheckedSince }) } } });
    }

    // All tabs write through the background context to avoid lost updates.
    static async requestMutation(message) {
        const response = await ext.runtime.sendMessage(message);
        if (!response?.ok) {
            throw new Error(response?.error || "課題情報を保存できませんでした");
        }
    }

    static validateTable(table, idproperty) {
        const keys = { assign_list: "assignId", quiz_list: "quizId" };
        if (!Object.prototype.hasOwnProperty.call(keys, table) || keys[table] !== idproperty) {
            throw new Error("Invalid task storage key");
        }
    }

    static async mutate(table, update) {
        const previous = this.queues.get(table) || Promise.resolve();
        const operation = previous.catch(() => {}).then(async () => {
            const result = await ext.storage.local.get(table);
            const items = Array.isArray(result[table]) ? result[table] : [];
            await ext.storage.local.set({ [table]: await update(items) });
        });
        this.queues.set(table, operation);
        try {
            await operation;
        } finally {
            if (this.queues.get(table) === operation) this.queues.delete(table);
        }
    }

    static async editData(table, idproperty, id, property, value) {
        this.validateTable(table, idproperty);
        if (!["show", "status"].includes(property)) {
            throw new Error("Invalid task property");
        }
        if (!this.isBackground) {
            return this.requestMutation({ type: "EDIT_TASK", table, idproperty, id, property, value });
        }
        await this.mutate(table, items => items.map(item =>
            String(item[idproperty]) === String(id) ? { ...item, [property]: value } : item));
    }

    static async saveData(table, idproperty, data) {
        this.validateTable(table, idproperty);
        if (!data || !Number.isInteger(Number(data[idproperty])) || Number(data[idproperty]) <= 0) {
            throw new Error("Invalid task ID");
        }
        if (!this.isBackground) {
            return this.requestMutation({ type: "SAVE_TASK", table, idproperty, data });
        }
        const availability = await this.getCourseAvailability();
        await this.mutate(table, items => {
            const old = items.find(item => Number(item[idproperty]) === Number(data[idproperty]));
            return this.taskAvailable({ ...old, ...data, courseId: data.courseId || old?.courseId }, availability)
                ? this.mergeTask(items, idproperty, data) : items;
        });
    }

    // A review fetches the authoritative overview, but must not roll back an
    // overview another tab saved while that request was in flight.
    static async saveQuizReviewOverview(data, expectedFetchedAt) {
        if (!data || data.group !== "quiz_list" || !Number.isSafeInteger(Number(data.quizId)) || Number(data.quizId) <= 0
            || !Number.isFinite(data.fetchedAt) || data.fetchedAt < 0
            || expectedFetchedAt !== null && (!Number.isFinite(expectedFetchedAt) || expectedFetchedAt < 0)) {
            throw new Error("Invalid quiz overview");
        }
        if (!this.isBackground) {
            return this.requestMutation({ type: "SAVE_QUIZ_REVIEW_OVERVIEW", data, expectedFetchedAt });
        }
        const availability = await this.getCourseAvailability();
        await this.mutate("quiz_list", items => {
            const old = items.find(item => Number(item.quizId) === Number(data.quizId));
            if (!this.taskAvailable({ ...old, ...data, courseId: data.courseId || old?.courseId }, availability)) return items;
            if ((old?.fetchedAt ?? null) !== expectedFetchedAt) return items;
            return this.mergeTask(items, "quizId", data);
        });
    }

    static mergeTask(items, idproperty, data) {
        const index = items.findIndex(item => String(item[idproperty]) === String(data[idproperty]));
        const old = items[index];
        const merged = { ...old, ...data };
        if (!merged.courseId && old?.courseId) merged.courseId = old.courseId;
        merged[idproperty] = Number(data[idproperty]);
        merged.show = old?.show ?? data.show ?? true;
        delete merged.notified; // Retire legacy reminder metadata when a task is saved.
        if (old?.maxp != null && data.maxp == null) merged.maxp = old.maxp;
        if (old?.point != null && data.point == null) merged.point = old.point;
        if (data.status) {
            if (data.status === "unknown") merged.needsDetailRetry = true;
            else delete merged.needsDetailRetry;
        }
        if (old?.status === "complete" && data.status === "unknown") merged.status = old.status;
        if (index === -1) return [...items, merged];
        return items.map((item, i) => i === index ? merged : item);
    }
}
