class StorageUtil {
    static isBackground = false;
    static queues = new Map();

    static async getAllData() {
        const result = await ext.storage.local.get(["assign_list", "quiz_list"]);
        return [...(result.assign_list || []), ...(result.quiz_list || [])]
            .sort((a, b) => (a.due ? new Date(a.due).getTime() : Infinity)
                - (b.due ? new Date(b.due).getTime() : Infinity));
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
        await this.mutate(table, items => this.mergeTask(items, idproperty, data));
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
        await this.mutate("quiz_list", items => {
            const old = items.find(item => Number(item.quizId) === Number(data.quizId));
            if ((old?.fetchedAt ?? null) !== expectedFetchedAt) return items;
            return this.mergeTask(items, "quizId", data);
        });
    }

    static mergeTask(items, idproperty, data) {
        const index = items.findIndex(item => String(item[idproperty]) === String(data[idproperty]));
        const old = items[index];
        const merged = { ...old, ...data };
        merged[idproperty] = Number(data[idproperty]);
        merged.show = old?.show ?? data.show ?? true;
        delete merged.notified; // Retire legacy reminder metadata when a task is saved.
        if (old?.maxp != null && data.maxp == null) merged.maxp = old.maxp;
        if (old?.point != null && data.point == null) merged.point = old.point;
        if (old?.status === "complete" && data.status === "unknown") merged.status = old.status;
        if (index === -1) return [...items, merged];
        return items.map((item, i) => i === index ? merged : item);
    }
}
