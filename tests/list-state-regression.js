(function () {
    const read = typeof require === 'function' ? p => require('fs').readFileSync(p, 'utf8') : readFile;
    const log = typeof print === 'function' ? print : console.log;
    const State = Function(read('src/storage/class/TaskListState.js') + ';return TaskListState')();
    function assert(value, name) { if (!value) throw new Error(name); }
    const now = 1800000000000;
    const pending = State.describe({ now });
    assert(pending.empty.includes('課題情報が取得されていません'), 'Unfetched is explicit');
    assert(State.describe({ history: null, coordinator: null, now }).empty === pending.empty, 'Cleared account state renders safely');
    const empty = State.describe({ history: { fullSweepAt: now - 1 }, now });
    assert(empty.empty.includes('条件に一致する課題はありません'), 'Successful zero does not imply unfetched');
    const filtered = State.describe({ total: 3, visible: 0, now });
    assert(filtered.empty.includes('条件に一致'), 'Filtered zero explains filters');
    const running = State.describe({ coordinator: { lease: { expiresAt: now + 1 } }, now });
    assert(running.status.includes('準備中') && !running.empty, 'Running is not an empty-list success');
    const progress = { phase: 'courses', completed: 3, total: 14, saved: 8, at: now };
    const active = { expiresAt: now + 90000, startedAt: now - 60000, progress };
    assert(State.describe({ coordinator: { lease: active }, now }).status.includes('3/14コース'), 'Restored tabs retain actual counters');
    const stalled = State.describe({ coordinator: { lease: { ...active, expiresAt: now + 180000 } }, now: now + 90001 });
    assert(!stalled.running && stalled.status.includes('応答が途絶え'), 'Stalled counters cannot remain updating');
    const prep = State.describe({ coordinator: { lease: { expiresAt: now + 90000, startedAt: now - 30000 } }, now });
    assert(!prep.running && prep.status.includes('応答が途絶え'), 'Preparation expires even with a live heartbeat');
    const completed = State.describe({ showOutcome: true, history: { attempt: { outcome: 'success', mode: 'manual' } }, now });
    assert(completed.status === '', 'A completed message is not restored from saved history after reload');
    const result = { courses: 14, saved: 18, failed: 2, message: "課題の情報を読み取れませんでした" };
    const partial = State.describe({ showOutcome: true, history: { attempt: { outcome: "partial", mode: "manual", summary: result } }, now });
    assert(partial.status.includes("18件を更新しました。2件を取得できませんでした。") && partial.status.includes(result.message), "Partial results retain counts and cause");
    const done = State.describe({ showOutcome: true, history: { attempt: { outcome: "success", mode: "manual", summary: { ...result, failed: 0 } } }, now });
    assert(done.status === "14コース・18件の課題情報を更新しました。", "An explicit transient notification shows success counts");
    const filteredAfterSuccess = State.describe({ total: 18, visible: 0, history: { attempt: { outcome: "success", mode: "manual", summary: result } }, now });
    assert(filteredAfterSuccess.empty.includes("条件に一致"), "A saved success summary must not suppress the filtered empty state");
    for (const outcome of ['success', 'partial', 'error', 'cancelled']) {
        const history = {fullSweepAt: now - 1, attempt: {at: now, mode: 'manual', outcome, reason: 'auth', summary: result}};
        const reloaded = State.describe({history, now});
        assert(reloaded.status === '', 'Reload does not restore outcome: ' + outcome);
        assert(reloaded.empty.includes('条件に一致'), 'Old failure does not suppress empty state: ' + outcome);
    }
    const next = State.describe({ showOutcome: true, history: { attempt: { outcome: "partial", mode: "manual", summary: result } }, coordinator: { lease: active }, now });
    assert(next.status.includes("3/14コース") && !next.status.includes("取得できません"), "A new run replaces a previous result");
    for (const outcome of ['error', 'partial', 'cancelled']) {
        const state = State.describe({ showOutcome: true, history: { attempt: { outcome } }, now });
        assert(state.status && !state.empty, 'Failed attempts do not claim no tasks: ' + outcome);
    }
    assert(State.describe({ showOutcome: true, history: { attempt: { outcome: 'error', reason: 'auth' } }, now }).status.includes('再ログイン'), 'Authentication failures give next action');
    assert(!State.describe({ total: 3, visible: 1, now }).empty, 'Existing results remain available');
    assert(!State.describe({ coordinator: { lease: { expiresAt: now - 1 } }, now }).running, 'Expired lease is not permanently loading');
    assert(State.timestamp({ calendarAt: now }) === '最終更新：記録なし', 'Automatic list checks cannot claim a completed full refresh');
    const fullSweepAt = now - 3600000;
    const fullLabel = '最終更新：' + new Date(fullSweepAt).toLocaleString('ja-JP', {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    assert(State.timestamp({ fullSweepAt }) === fullLabel, 'Last updated shows the completed full refresh');
    assert(State.timestamp({ fullSweepAt, calendarAt: now }) === fullLabel, 'A newer automatic check does not advance last updated');
    for (const outcome of ['error', 'partial', 'cancelled']) {
        assert(State.timestamp({ fullSweepAt, attempt: { at: now, outcome } }) === fullLabel,
            'An unsuccessful refresh preserves the previous timestamp: ' + outcome);
    }
    const manifest = JSON.parse(read('src/manifest.json'));
    assert(manifest.permissions.length === 1 && manifest.permissions[0] === 'storage', 'Production uses storage and site-scoped host access without global tabs permission');
    assert(!manifest.permissions.includes('notifications') && !manifest.permissions.includes('alarms'), 'Production does not request notification or alarm permissions');
    assert(!/notifications\.|alarms\./.test(read('src/storage/service_worker.js')), 'No delivery or alarm API remains');
    assert(!JSON.stringify(manifest).includes('dev/'), 'Production does not include developer entry');
    log('List state, full-refresh timestamp and packaging checks passed');
})();
