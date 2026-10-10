(async () => {
    await debugReady;
    if (debugClock.base === 1800000000000) {
        const stored = await debugNative.storage.local.get(DEBUG_PREFIX + 'config');
        if (!stored[DEBUG_PREFIX + 'config']) await control('reset');
    }
    // Keep the real controller's visibility, cancellation, timers and messages.
    globalThis.duedleAutoRefreshController.stop();
    const controllerWindow = {
        location: { href: root + 'my/' },
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window)
    };
    controllerWindow.top = controllerWindow.self = controllerWindow;
    const controller = new AutoRefreshController({ window: controllerWindow, document });
    controller.start();
    globalThis.duedleAutoRefreshController = controller;
    document.querySelector('#scenario').value = debugClock.scenario;
    const mode = document.querySelector('#scrapeModeSelect');
    if (mode) { mode.value = 'scrape'; mode.disabled = true; }
    await ext.storage.sync.set({ scrapeMode: 'scrape' });
    function report(error) { document.querySelector('#debug-status').textContent = error.message || String(error); }
    async function control(action, value) {
        const reply = await debugNative.runtime.sendMessage({ type: 'DEBUG_CONTROL', action, value });
        if (!reply?.ok) throw new Error(reply?.error || '操作に失敗しました');
    }
    const bind = (selector, action) => document.querySelector(selector).addEventListener('click', () => action().catch(report));
    bind('#manual-now', async () => { await control('manual'); await updateCooldownButton(); document.querySelector('#scrapebutton').click(); });
    bind('#auto-now', async () => { await control('auto'); controller.nextAt = 0; controller.wake(); });
    bind('#advance', async () => { await control('advance', Number(document.querySelector('#advance-value').value)); controller.nextAt = 0; controller.wake(); await diagnostics(); });
    bind('#reset', async () => { await control('reset'); location.reload(); });
    document.querySelector('#scenario').addEventListener('change', event => control('scenario', event.target.value).catch(report));
    // Dummy task links must never navigate to the actual Moodle instance.
    document.addEventListener('click', event => { if (event.target.closest('a')) { event.preventDefault(); report('ダミー課題のリンクです。実Moodleへは移動しません。'); } });
    async function diagnostics() {
        const saved = await ext.storage.local.get(null);
        const tasks = [...(saved.assign_list || []), ...(saved.quiz_list || [])];
        document.querySelector('#diagnostics').textContent = JSON.stringify({
            clock: new Date(Date.now()).toISOString(), scenario: debugClock.scenario,
            requests: debugRequests.length, recentRequests: debugRequests.slice(-12),
            history: saved.refreshHistory, schedule: saved.refreshCoordinator,
            tasks: tasks.map(task => ({ id: task.assignId || task.quizId, status: task.status, fetchedAt: task.fetchedAt,
                selectionReason: AutoRefreshCollector.detailDue(task) ? '詳細の再取得時期' : '詳細は取得間隔内',
                intervalHours: AutoRefreshCollector.detailInterval(task) / 3600000 }))
        }, null, 2);
    }
    setInterval(() => diagnostics().catch(report), 1000);
    await diagnostics();
})().catch(error => { document.querySelector('#debug-status').textContent = error.message; });
