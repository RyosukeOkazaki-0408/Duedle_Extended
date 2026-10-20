importScripts('adapter.js', '../common/common.js', '../storage/class/StorageUtil.js', '../storage/class/RefreshCoordinator.js');
StorageUtil.isBackground = true;
const coordinator = new RefreshCoordinator({ storage: ext.storage.local });
let debugQueue = Promise.resolve();
debugNative.runtime.onMessage.addListener((message, realSender, respond) => {
    if (!realSender.url?.startsWith(debugNative.runtime.getURL('dev/'))) return false;
    // Only this developer-only bridge supplies a Moodle-shaped sender to the real coordinator.
    const sender = { tab: { id: realSender.tab?.id ?? 0 }, url: RefreshCoordinator.moodleRoot + 'my/' };
    const run = async () => {
        await debugReady;
        switch (message.type) {
        case 'GET_SETTINGS': return { ok: true, themeDefault: 2 };
        case 'SAVE_TASK': await StorageUtil.saveData(message.table, message.idproperty, message.data); return { ok: true };
        case 'EDIT_TASK': await StorageUtil.editData(message.table, message.idproperty, message.id, message.property, message.value); return { ok: true };
        case 'SET_COURSE_AVAILABILITY':
            await StorageUtil.setCourseAvailability(message.courseId, message.items, message.complete,
                message.detailsCheckedSince, message.inventoryComplete);
            return { ok: true };
        case 'REFRESH_STATUS': return coordinator.status(sender);
        case 'REFRESH_CLAIM': return coordinator.claim(message, sender);
        case 'REFRESH_HEARTBEAT': return coordinator.heartbeat(message.token, sender);
        case 'REFRESH_FINISH': return coordinator.finish(message, sender);
        case 'REFRESH_PROGRESS': return coordinator.progress(message, sender);
        case 'REFRESH_PAGE_READY': return coordinator.pageReady(message.pageId, sender);
        case 'DEBUG_CONTROL': {
            const status = await coordinator.status(sender);
            if (status.busy) throw new Error('更新中です。完了・中断してから操作してください。');
            if (message.action === 'reset') {
                const all = await debugNative.storage.local.get(null);
                await debugNative.storage.local.remove(Object.keys(all).filter(key => key.startsWith(DEBUG_PREFIX)));
                Object.assign(debugClock, { offset: 0, base: realNow(), scenario: 'normal' });
                await debugNative.storage.local.set({ [DEBUG_PREFIX + 'config']: debugClock });
                await ext.storage.local.set({ courseIds: [1], themeDefault: 2 });
                return { ok: true };
            }
            if (message.action === 'scenario') debugClock.scenario = message.value;
            if (message.action === 'advance') debugClock.offset += Number(message.value) || 0;
            await debugNative.storage.local.set({ [DEBUG_PREFIX + 'config']: debugClock });
            // Bypass only the requested wait, keeping the production claim and lease checks.
            if (message.action === 'manual') await ext.storage.local.set({ scrapeCooldown: null });
            if (message.action === 'auto') {
                const { state } = await coordinator.load();
                state.nextWorkAt = Date.now(); state.nextListAt = Date.now();
                await coordinator.save(state);
            }
            return { ok: true };
        }
        default: throw new Error('この操作はデバッグ環境では利用できません');
        }
    };
    const operation = debugQueue.catch(() => {}).then(run);
    debugQueue = operation;
    operation.then(respond, error => respond({ ok: false, error: error.message }));
    return true;
});
