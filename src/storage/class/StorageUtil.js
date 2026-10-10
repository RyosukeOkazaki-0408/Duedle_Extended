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
        await this.mutate(table, items => {
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
        });
    }
}
