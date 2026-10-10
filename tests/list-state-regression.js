(function () {
    const read = typeof require === 'function' ? p => require('fs').readFileSync(p, 'utf8') : readFile;
    const log = typeof print === 'function' ? print : console.log;
    const State = Function(read('src/storage/class/TaskListState.js') + ';return TaskListState')();
    function assert(value, name) { if (!value) throw new Error(name); }
    const now = 1800000000000;
    const pending = State.describe({ now });
    assert(pending.empty.includes('課題情報が取得されていません'), 'Unfetched is explicit');
    const empty = State.describe({ history: { fullSweepAt: now - 1 }, now });
    assert(empty.empty.includes('条件に一致する課題はありません'), 'Successful zero does not imply unfetched');
    const filtered = State.describe({ total: 3, visible: 0, now });
    assert(filtered.empty.includes('条件に一致'), 'Filtered zero explains filters');
    const running = State.describe({ coordinator: { lease: { expiresAt: now + 1 } }, now });
    assert(running.status.includes('取得しています') && !running.empty, 'Running is not an empty-list success');
    const completed = State.describe({ history: { attempt: { outcome: 'success', mode: 'manual' } }, now });
    assert(completed.status === '', 'A completed message is not restored from saved history after reload');
    for (const outcome of ['error', 'partial', 'cancelled']) {
        const state = State.describe({ history: { attempt: { outcome } }, now });
        assert(state.status && !state.empty, 'Failed attempts do not claim no tasks: ' + outcome);
    }
    assert(State.describe({ history: { attempt: { outcome: 'error', reason: 'auth' } }, now }).status.includes('失敗'), 'Authentication failures give next action');
    assert(!State.describe({ total: 3, visible: 1, now }).empty, 'Existing results remain available');
    assert(!State.describe({ coordinator: { lease: { expiresAt: now - 1 } }, now }).running, 'Expired lease is not permanently loading');
    assert(State.timestamp({ calendarAt: now }).startsWith('最終更新：'), 'Calendar coverage is accurately labelled');
    assert(State.timestamp({ fullSweepAt: now }).startsWith('最終更新：'), 'Full sweep coverage is accurately labelled');
    const manifest = JSON.parse(read('src/manifest.json'));
    assert(!manifest.permissions.includes('notifications') && !manifest.permissions.includes('alarms'), 'Production does not request notification or alarm permissions');
    assert(!/notifications\.|alarms\./.test(read('src/storage/service_worker.js')), 'No delivery or alarm API remains');
    assert(!JSON.stringify(manifest).includes('dev/'), 'Production does not include developer entry');
    log('16 list state, coverage and packaging checks passed');
})();
