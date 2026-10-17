const header = document.querySelector("header");
const ext_dashboard = document.createElement("div");
ext_dashboard.setAttribute("id", "ext_dashboard");
ext_dashboard.classList.add("card-body");


//inside div - innerHTML
const extInner =
    `
    <div class="duedle-dashboard-actions">
    <button class="btn btn-primary" id="scrapebutton">課題を更新</button>
    <button class="btn btn-secondary" id="displaybutton">一覧を隠す</button>
    <button class="btn btn-secondary" id="selecttasksbutton" aria-pressed="false">課題を選択</button>
    </div>
    <div hidden id="taskselectionbar" role="group" aria-label="選択した課題の操作">
      <span id="taskselectioncount" role="status" aria-live="polite"></span>
      <button type="button" class="btn btn-secondary" id="hideselectedtasks">選択した課題を隠す</button>
      <button type="button" class="btn btn-secondary" id="restoreselectedtasks">選択した課題を戻す</button>
      <button type="button" class="btn btn-outline-secondary" id="canceltaskselection">キャンセル</button>
    </div>
    <p id="collectionstatus" role="status" aria-live="polite" class="my-2"></p>
    <p id="collectionhint" class="my-2 small text-muted" hidden>更新が終わるまで、このページを開いたままにしてください。</p>
    <p id="listupdated" class="my-2 small text-muted"></p>
    <div hidden id="filter" class="filter-group my-2 p-2 border-radius border">
        <fieldset id="fieldfilter">
        </fieldset>
        <fieldset id="fieldcolor">
        </fieldset>
    </div>
    <div hidden id="display">
    </div>`;
ext_dashboard.insertAdjacentHTML("beforeend", extInner);
if (header) header.after(ext_dashboard);
else (document.querySelector("#region-main") || document.body).prepend(ext_dashboard);

const filter = document.querySelector("#filter")
const display = document.querySelector("#display");
const fieldset = document.querySelector("#fieldfilter");
const fieldcolor = document.querySelector("#fieldcolor");
const scrapebutton = document.querySelector("#scrapebutton");
const collectionstatus = document.querySelector("#collectionstatus");
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
let collectionRunning = false;
let collectionErrorReason = null;
let completionError = "";
let completionStatus = "";
let completionTimer;
function clearCompletionNotice() {
    clearTimeout(completionTimer);
    completionStatus = "";
    completionError = "";
}
function expireCompletionNotice() {
    clearTimeout(completionTimer);
    completionTimer = setTimeout(() => {
        clearCompletionNotice();
        if (!collectionRunning && globalThis.duedleAccountActive !== false) {
            setCollectionStatus("");
            queueRerender(0);
        }
    }, 10000);
}
let settledToken = null;
let observedRefresh = null;
let refreshUiRevision = 0;
const collectionhint = document.querySelector("#collectionhint");
function setCollectionStatus(text) {
    if (collectionstatus.textContent !== text) collectionstatus.textContent = text;
}
function showRefreshState(state, coordinator) {
    // Late progress notifications/reads cannot restore "updating" after finish.
    if (coordinator?.lease?.token && coordinator.lease.token === settledToken) return;
    if (coordinator?.lease?.mode === "manual") {
        if (observedRefresh?.token !== coordinator.lease.token) clearCompletionNotice();
        observedRefresh = { token: coordinator.lease.token, startedAt: coordinator.lease.startedAt };
    }
    if (collectionRunning && !state.running) return;
    setCollectionStatus(coordinator?.lease ? state.status : completionError || completionStatus || state.status);
}
function observeRefreshOutcome(coordinator, history) {
    // A page opened after completion must stay quiet. Only report the end of a
    // manual refresh whose progress this page has actually displayed.
    if (collectionRunning || coordinator?.lease || !observedRefresh) return;
    const attempt = history?.attempt;
    if (attempt?.mode !== "manual" || !(attempt.at >= observedRefresh.startedAt)) return;
    settledToken = observedRefresh.token;
    observedRefresh = null;
    clearCompletionNotice();
    completionStatus = TaskListState.describe({ history, coordinator, showOutcome: true }).status;
    if (completionStatus) expireCompletionNotice();
}
let cooldownTimer;
let refreshBusy = false;
let manualToken = null;
let manualAbort = null;
window.addEventListener("pagehide", () => {
    manualAbort?.abort();
    if (manualToken) ext.runtime.sendMessage({ type: "REFRESH_FINISH", token: manualToken,
        outcome: "cancelled", reason: "navigation" }).catch(() => {});
});

//scrape mode
const scrapeModeValues = ["scrape", "tab"];
const scrapeModeText = ["通常", "CSE用（別タブ）"];
const scrapeFilter = new FilterSelect("scrapeModeSelect", "収集モード", scrapeModeValues, scrapeModeText, "scrapeMode");
scrapeFilter.applyDefault("scrape");
(async () => {
    const scrapeFilterel = await scrapeFilter.getElement();
    scrapeFilterel.map((el) => {
        fieldset.appendChild(el);
    });
})();

//filters
//type filter
const typeValues = ["all", "assign_list", "quiz_list"];
const typeOptionsText = ["すべて", "提出課題", "小テスト"];
const typeFilter = new FilterSelect("typeSelect", "種類", typeValues, typeOptionsText, "selectedType");
typeFilter.applyDefault("all");
(async () => {
    const typeFilterel = await typeFilter.getElement();
    typeFilterel.map((el) => {
        fieldset.appendChild(el);
    });
})();

//status filter
const statusValues = ["all", "complete", "ex-complete", "incomplete", "expired", "unknown"];
const statusOptionsText = ["すべて", "完了", "完了以外", "未提出", "行き詰まり・期限切れ", "点数不明(小テストのみ)"];
const statusFilter = new FilterSelect("statusSelect", "状態", statusValues, statusOptionsText, "selectedStatus");
statusFilter.valueAliases = { qualify: "complete", stuck: "expired" };
statusFilter.applyDefault("ex-complete");
(async () => {
    const statusFilterel = await statusFilter.getElement();
    statusFilterel.map((el) => {
        fieldset.appendChild(el);
    });
})();

//due filter
const dueValues = ["all", "progressing", "week", "today", "dueweek", "overdue"];
const dueOptionsText = ["すべて", "進行中", "今週", "24時間以内", "直近1週間に終了", "終了"];
const dueFilter = new FilterSelect("dueSelect", "期限", dueValues, dueOptionsText, "selectedDue");
dueFilter.applyDefault("all");
(async () => {
    const dueFilterel = await dueFilter.getElement();
    dueFilterel.map((el) => {
        fieldset.appendChild(el);
    });
})();

//show filter
const showValues = ["all", "normal", "deleted"];
const showOptionsText = ["すべて", "通常", "非表示"];
const showFilter = new FilterSelect("showSelect", "表示", showValues, showOptionsText, "selectedShow");
showFilter.applyDefault("normal");
(async () => {
    const showFilterel = await showFilter.getElement();
    showFilterel.map((el) => {
        fieldset.appendChild(el);
    });
})();



async function updateCooldownButton() {
    clearTimeout(cooldownTimer);
    if (globalThis.duedleAccountActive === false) {
        scrapebutton.disabled = true;
        scrapebutton.textContent = "課題を更新";
        return;
    }
    if (collectionRunning) return;
    const revision = refreshUiRevision;
    const [{ scrapeCooldown, manualCooldownDisabled }, refresh] = await Promise.all([
        ext.storage.local.get(["scrapeCooldown", "manualCooldownDisabled"]),
        ext.runtime.sendMessage({ type: "REFRESH_STATUS" })
    ]);
    if (revision !== refreshUiRevision) return;
    if (globalThis.duedleAccountActive === false) return updateCooldownButton();
    if (collectionRunning) return;
    const next = new Date(new Date(scrapeCooldown).getTime() + COOLDOWN_MS);
    const coolingDown = manualCooldownDisabled !== true && next.getTime() > Date.now();
    const busy = refresh?.busy === true;
    refreshBusy = busy;
    scrapebutton.disabled = coolingDown || busy;
    const remainingMinutes = Math.max(1, Math.ceil((next.getTime() - Date.now()) / 60000));
    const remainingLabel = remainingMinutes >= 60
        ? `残り${Math.floor(remainingMinutes / 60)}時間${remainingMinutes % 60}分`
        : `残り${remainingMinutes}分`;
    scrapebutton.textContent = busy ? "更新中…"
        : coolingDown ? "クールダウン: " + remainingLabel : "課題を更新";
    if (coolingDown || busy) cooldownTimer = setTimeout(() => updateCooldownButton().catch(console.error), 30000);
}

// Listen on the existing action row: disabled buttons do not reliably receive
// pointer events in Safari. Their hit area falls through to this row via CSS.
const refreshActions = document.querySelector(".duedle-dashboard-actions");
let cooldownHold = null;
let suppressRefreshClick = false;
let cooldownTogglePending = false;
const cancelCooldownHold = () => {
    if (cooldownHold) clearTimeout(cooldownHold.timer);
    cooldownHold = null;
};
const onRefreshButton = event => {
    const rect = scrapebutton.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
};
refreshActions.addEventListener("pointerdown", event => {
    suppressRefreshClick = false;
    if (cooldownHold) { cancelCooldownHold(); return; }
    if (event.button !== 0 || !event.isPrimary || !onRefreshButton(event)
        || globalThis.duedleAccountActive === false || cooldownTogglePending) return;
    const hold = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    cooldownHold = hold;
    hold.timer = setTimeout(async () => {
        if (cooldownHold !== hold || globalThis.duedleAccountActive === false) return;
        suppressRefreshClick = true;
        cooldownTogglePending = true;
        try {
            const saved = await ext.storage.local.get("manualCooldownDisabled");
            if (globalThis.duedleAccountActive === false) return;
            await ext.storage.local.set({ manualCooldownDisabled: saved.manualCooldownDisabled !== true });
            refreshUiRevision++;
            await updateCooldownButton();
        } catch (error) { console.error(error); }
        finally { cooldownTogglePending = false; }
    }, 5000);
});
window.addEventListener("pointermove", event => {
    const hold = cooldownHold;
    if (hold && event.pointerId === hold.pointerId
        && (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10 || !onRefreshButton(event))) cancelCooldownHold();
}, { passive: true });
window.addEventListener("pointerup", event => {
    if (event.pointerId === cooldownHold?.pointerId) cancelCooldownHold();
});
window.addEventListener("pointercancel", cancelCooldownHold);
window.addEventListener("pagehide", cancelCooldownHold);
window.addEventListener("blur", cancelCooldownHold);
window.addEventListener("scroll", cancelCooldownHold, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => { if (document.hidden) cancelCooldownHold(); });
refreshActions.addEventListener("contextmenu", event => {
    if (cooldownHold || suppressRefreshClick) event.preventDefault();
});
refreshActions.addEventListener("click", event => {
    if (!suppressRefreshClick || event.detail === 0) return;
    suppressRefreshClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);

scrapebutton.addEventListener("click", async () => {
    if (globalThis.duedleAccountActive === false) return;
    if (collectionRunning) return;
    collectionRunning = true;
    refreshUiRevision++;
    settledToken = null;
    collectionhint.hidden = false;
    collectionErrorReason = null;
    clearCompletionNotice();
    scrapebutton.disabled = true;
    scrapebutton.textContent = "更新中…";
    setCollectionStatus("更新の準備中…");
    let token;
    let owned = true;
    let heartbeatTimer;
    let lastVerified = 0;
    let verifying;
    let outcome = "error";
    let summary = { courses: 0, saved: 0, failed: 0, message: "" };
    const verifyLease = async (force = false) => {
        if (!owned || !token) return false;
        if (!force && Date.now() - lastVerified < 20000) return true;
        if (verifying) return verifying;
        verifying = ext.runtime.sendMessage({ type: "REFRESH_HEARTBEAT", token })
            .then(response => {
                owned = response?.ok === true && response.owned === true;
                lastVerified = Date.now();
                return owned;
            }, () => { owned = false; return false; })
            .finally(() => { verifying = null; });
        return verifying;
    };
    try {
        await globalThis.duedlePageReady;
        const claim = await ext.runtime.sendMessage({ type: "REFRESH_CLAIM", mode: "manual", pageId: globalThis.duedlePageId });
        if (!claim?.ok) throw new Error(claim?.error || "課題情報を更新できませんでした");
        if (!claim.granted) {
            collectionstatus.textContent = claim.reason === "cooldown"
                ? "課題更新のクールダウン中です。"
                : "課題情報を更新しています。完了までお待ちください。";
            return;
        }
        token = claim.token;
        manualToken = token;
        manualAbort = new AbortController();
        lastVerified = Date.now();
        heartbeatTimer = setInterval(() => verifyLease(true).catch(console.error), 30000);
        const { scrapeMode = "scrape" } = await ext.storage.sync.get("scrapeMode");
        collectionstatus.textContent = "登録コースを確認中…";
        const enrolled = await new CourseCollector({ shouldContinue: verifyLease, signal: manualAbort.signal }).enrolledCourseIds();
        await ext.storage.local.set({ courseIds: enrolled });
        let result;
        if (scrapeMode === "tab") {
            const response = await ext.runtime.sendMessage({ type: "TAB_COURSE", refreshToken: token });
            if (!response?.ok) throw new Error(response?.error || "課題情報を更新できませんでした");
            result = response.result;
        } else {
            const collector = new CourseCollector({ shouldContinue: verifyLease, signal: manualAbort.signal, onProgress: async progress => {
                const reply = await ext.runtime.sendMessage({ type: "REFRESH_PROGRESS", token,
                    progress: { phase: "courses", completed: progress.courses, total: progress.totalCourses, saved: progress.saved } });
                if (!reply?.ok || !reply.owned) throw Object.assign(new Error("更新が中断されました。再度お試しください。"), { code: "REFRESH_CANCELLED" });
                summary = { courses: progress.courses, saved: progress.saved, failed: progress.failed,
                    message: progress.errors[0]?.message || "" };
                setCollectionStatus(TaskListState.progressLabel({ phase: "courses", completed: progress.courses,
                    total: progress.totalCourses, saved: progress.saved }));
            } });
            result = await collector.run(enrolled);
        }
        outcome = result.failed === 0 ? "success" : "partial";
        summary = { courses: result.courses, saved: result.saved, failed: result.failed,
            message: result.errors[0]?.message || "" };
    } catch (error) {
        collectionErrorReason = error.code === "AUTH_REQUIRED" ? "auth" : null;
        if (error.code === "REFRESH_CANCELLED") outcome = "cancelled";
        summary.message = error.message || "課題情報を更新できませんでした。もう一度お試しください。";
        if (!token) completionError = summary.message;
        setCollectionStatus(summary.message);
    } finally {
        clearInterval(heartbeatTimer);
        settledToken = token || null;
        refreshUiRevision++;
        if (token) {
            try {
                const finished = await ext.runtime.sendMessage({
                    type: "REFRESH_FINISH", token, outcome, fullSweep: true, reason: collectionErrorReason, summary
                });
                if (!finished?.ok) throw new Error(finished?.error || "更新結果を保存できませんでした。次回の更新で再試行します。");
                if (finished.owned) {
                    completionStatus = TaskListState.describe({ showOutcome: true,
                        history: { attempt: { mode: "manual", outcome, reason: collectionErrorReason, summary } } }).status;
                } else {
                    const stored = await ext.storage.local.get(["refreshCoordinator", "refreshHistory"]);
                    collectionstatus.textContent = TaskListState.describe({ coordinator: stored.refreshCoordinator,
                        history: stored.refreshHistory }).status;
                }
            } catch (error) { completionError = error.message; collectionstatus.textContent = completionError; }

        }
        manualToken = null;
        manualAbort = null;
        observedRefresh = null;
        collectionRunning = false;
        collectionhint.hidden = true;
        // Do not depend on storage.onChanged delivery to display the final result.
        // The saved finish must precede this read; rendering during the lease shows stale progress.
        try { await rerender(); }
        catch (error) { setCollectionStatus(completionError || summary.message || error.message); }
        if (completionStatus || completionError) expireCompletionNotice();
        await updateCooldownButton().catch(console.error);
        if (globalThis.duedleAccountActive === false) collectionstatus.textContent = "アカウントが変わりました。このページを再読み込みしてください。";
    }
});
updateCooldownButton().catch(console.error);
let checkingProgress = false;
setInterval(async () => {
    if (document.hidden || checkingProgress || !refreshBusy) return;
    checkingProgress = true;
    const revision = refreshUiRevision;
    try {
        const stored = await ext.storage.local.get(["refreshCoordinator", "refreshHistory"]);
        const lease = stored.refreshCoordinator?.lease;
        if (!lease || revision !== refreshUiRevision || lease.token === settledToken) return;
        const state = TaskListState.describe({ coordinator: stored.refreshCoordinator,
            history: stored.refreshHistory });
        if (state.status) showRefreshState(state, stored.refreshCoordinator);
        if (!state.running) {
            manualAbort?.abort();
            await ext.runtime.sendMessage({ type: "REFRESH_STATUS" });
            await updateCooldownButton();
        }
    } catch (error) { console.error(error); }
    finally { checkingProgress = false; }
}, 1000);

//display show button
const displaybutton = document.querySelector("#displaybutton");
displaybutton.addEventListener("click", () => {
    const visible = display.hidden;
    applyMenuVisibility(visible);
    ext.storage.sync.set({ displayShow: visible });
});

// Explicitly selected cards only; task IDs never come from link text or URLs.
const selectedTasks = new Map();
let taskSelectionActive = false;
let taskSelectionSaving = false;
const selectTasksButton = document.querySelector("#selecttasksbutton");
const selectionBar = document.querySelector("#taskselectionbar");
const hideSelectedButton = document.querySelector("#hideselectedtasks");
const restoreSelectedButton = document.querySelector("#restoreselectedtasks");

function updateTaskSelection() {
    selectionBar.hidden = !taskSelectionActive || display.hidden;
    selectTasksButton.disabled = display.hidden || taskSelectionSaving;
    selectTasksButton.setAttribute("aria-pressed", String(taskSelectionActive));
    selectTasksButton.textContent = taskSelectionActive ? "選択を終了" : "課題を選択";
    document.querySelector("#taskselectioncount").textContent = taskSelectionSaving
        ? "反映中…" : `${selectedTasks.size}件を選択`;
    hideSelectedButton.disabled = taskSelectionSaving || ![...selectedTasks.values()].some(task => task.show);
    restoreSelectedButton.disabled = taskSelectionSaving || ![...selectedTasks.values()].some(task => !task.show);
    document.querySelector("#canceltaskselection").disabled = taskSelectionSaving;
    display.querySelectorAll(".duedle-task-selection").forEach(label => {
        label.hidden = !taskSelectionActive;
        const input = label.querySelector("input");
        input.disabled = taskSelectionSaving;
        input.checked = selectedTasks.has(label.dataset.taskKey);
    });
}
function setTaskSelection(active) {
    if (taskSelectionSaving) return;
    taskSelectionActive = active;
    if (!active) selectedTasks.clear();
    updateTaskSelection();
}
function installTaskSelection(card, task) {
    const idProperty = task.group === "assign_list" ? "assignId" : "quizId";
    const id = Number(task[idProperty]);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const key = `${task.group}:${id}`;
    card.dataset.duedleTaskKey = key;
    const selection = { group: task.group, idProperty, id, show: Boolean(task.show) };
    if (selectedTasks.has(key)) selectedTasks.set(key, selection);
    const label = document.createElement("label");
    label.className = "duedle-task-selection";
    label.dataset.taskKey = key;
    label.hidden = !taskSelectionActive;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedTasks.has(key);
    input.disabled = taskSelectionSaving;
    input.setAttribute("aria-label", `${task.assignName || task.quizName || "課題"}を選択`);
    input.addEventListener("change", () => {
        if (taskSelectionSaving) return;
        if (input.checked) selectedTasks.set(key, selection);
        else selectedTasks.delete(key);
        updateTaskSelection();
    });
    const text = document.createElement("span");
    text.textContent = "この課題を選択";
    label.append(input, text);
    card.prepend(label);
}
function reconcileTaskSelection() {
    const keys = new Set([...display.querySelectorAll("[data-duedle-task-key]")].map(card => card.dataset.duedleTaskKey));
    for (const key of selectedTasks.keys()) if (!keys.has(key)) selectedTasks.delete(key);
    updateTaskSelection();
}
async function saveSelectedVisibility(show) {
    if (taskSelectionSaving) return;
    taskSelectionSaving = true;
    updateTaskSelection();
    let saved = 0;
    try {
        // A render temporarily removes cards; reconcile only after it has finished.
        await renderChain;
        reconcileTaskSelection();
        const targets = [...selectedTasks.values()].filter(task => task.show !== show);
        if (!targets.length) return;
        for (const task of targets) {
            await StorageUtil.editData(task.group, task.idProperty, task.id, "show", show);
            selectedTasks.delete(`${task.group}:${task.id}`);
            saved++;
        }
        completionError = "";
        taskSelectionActive = false;
        selectedTasks.clear();
        await rerender();
        collectionstatus.textContent = `${saved}件の課題を${show ? "一覧に戻しました" : "非表示にしました"}。`;
    } catch (error) {
        completionError = `${saved}件を反映しました。残りの変更に失敗しました。${error.message || "再試行してください"}`;
        collectionstatus.textContent = completionError;
    } finally {
        taskSelectionSaving = false;
        updateTaskSelection();
    }
}
selectTasksButton.addEventListener("click", () => setTaskSelection(!taskSelectionActive));
document.querySelector("#canceltaskselection").addEventListener("click", () => setTaskSelection(false));
hideSelectedButton.addEventListener("click", () => saveSelectedVisibility(false).catch(console.error));
restoreSelectedButton.addEventListener("click", () => saveSelectedVisibility(true).catch(console.error));

//setting color
// Each color setting may cover multiple states; state/filter semantics stay separate.
const colorTypesValue = ["complete", "incomplete", "expired", "warning", "unknown", "unvisited"];
const colorTypesLabel = ["完了", "未提出", "行き詰まり・期限切れ", "期限近い", "不明", "未参照"];
const colorTypesTitle = [
    "提出が完了している / 小テストで満点または合格の状態",
    "提出していない / 小テストに答えていない",
    "小テストの受験回数上限に達して合格していない / 未完了のまま期限を過ぎている",
    "期限が3日以内だが未提出",
    "点数が非公開のため評価できない (小テストのみ)",
    "まだ確認していないタスク"
];
colorTypesValue.map((value, index) => {
    const input = document.createElement("input");
    input.type = "color";
    input.name = value;
    input.id = "colorSelect_" + value;
    input.classList.add("form-select", "form-select-sm", "mb-1", "mb-md-0", "mr-md-2");
    const colorLabel = document.createElement("label");
    colorLabel.textContent = colorTypesLabel[index];
    colorLabel.setAttribute("for", input.id);
    colorLabel.classList.add("filterlabel", "mr-md-2", "mb-md-0");
    colorLabel.title = colorTypesTitle[index];
    const group = document.createElement("div");
    group.className = "duedle-color-control";
    group.append(colorLabel, input);
    fieldcolor.appendChild(group);

    input.addEventListener("change", async () => {
        if (document.querySelector(".darkmode")) {
            await ext.storage.sync.set({ ["colorSelect_dark_" + value]: input.value }); // 選択した値をローカルストレージに保存
        } else {
            await ext.storage.sync.set({ ["colorSelect_light_" + value]: input.value });
        }
        applyColor(value, input.value);
    });
});



// Missing preferences show the menu. A saved false is never overwritten.
function applyMenuVisibility(value) {
    const visible = value !== false;
    display.hidden = !visible;
    filter.hidden = !visible;
    const updated = document.querySelector("#listupdated");
    if (updated) updated.hidden = !visible;
    const settings = document.querySelector("#duedle-course-settings");
    if (settings && !settings.querySelector("#notion")) settings.hidden = !visible;
    displaybutton.textContent = visible ? "一覧を隠す" : "一覧を表示";
    displaybutton.setAttribute("aria-expanded", String(visible));
    if (!visible) setTaskSelection(false);
    updateTaskSelection();
}
const menuReady = ext.storage.sync.get("displayShow").then(saved => applyMenuVisibility(saved.displayShow));
const upcomingResolver = new CalendarEventResolver();
let upcomingGeneration = 0;
async function resolveUpcomingEvents(stored) {
    const generation = ++upcomingGeneration;
    const refs = await upcomingResolver.resolve(document, stored.refreshCoordinator?.collectorState?.events);
    if (generation !== upcomingGeneration || globalThis.duedleAccountActive === false) return;
    const tasks = await StorageUtil.getAllData();
    if (generation !== upcomingGeneration || globalThis.duedleAccountActive === false) return;
    upcomingEventRefs = refs;
    refreshUpcomingEventStatuses(tasks);
    checkUnvisited();
    colorReload();
}
window.addEventListener("pagehide", () => { upcomingGeneration++; upcomingResolver.clear(); });
let renderChain = Promise.resolve();
function rerender() {
    clearTimeout(renderTimer);
    renderPending = false;
    renderChain = renderChain.catch(() => {}).then(renderList);
    return renderChain;
}
async function renderList() {
    const [alldata, stored] = await Promise.all([
        StorageUtil.getAllData(), ext.storage.local.get(["refreshHistory", "refreshCoordinator"]), menuReady
    ]);
    const scrollPosition = display.scrollLeft;
    // Keep the current cards visible while asynchronous card construction finishes.
    const nextDisplay = document.createElement("div");
    const visible = await displaybox(alldata, nextDisplay);
    observeRefreshOutcome(stored.refreshCoordinator, stored.refreshHistory);
    const state = TaskListState.describe({ total: alldata.length, visible,
        history: stored.refreshHistory, coordinator: stored.refreshCoordinator });
    if (!visible) nextDisplay.textContent = state.empty;
    if (globalThis.duedleAccountActive !== false) {
        display.replaceChildren(...nextDisplay.childNodes);
        display.scrollLeft = scrollPosition;
        reconcileTaskSelection();
        refreshUpcomingEventStatuses(alldata);
        checkUnvisited();
        colorReload();
        resolveUpcomingEvents(stored).catch(console.error);
    }
    showRefreshState(state, stored.refreshCoordinator);
    const updated = document.querySelector("#listupdated");
    updated.textContent = TaskListState.timestamp(stored.refreshHistory);
    updated.title = "「課題を更新」による全体更新が最後に正常完了した時刻です。自動更新や途中終了では変わりません。";
    if (globalThis.duedleAccountActive === false) {
        display.replaceChildren();
        updated.textContent = "";
        collectionstatus.textContent = "Moodleのユーザー情報を確認できません。このページを再読み込みしてください。";
    }
}

document.addEventListener("duedle:account-changed", () => {
    clearCompletionNotice();
    observedRefresh = null;
    upcomingGeneration++;
    upcomingResolver.clear();
    upcomingEventRefs.clear();
    refreshUpcomingEventStatuses([]);
    manualAbort?.abort();
    collectionhint.hidden = true;
    setTaskSelection(false);
    display.replaceChildren();
    document.querySelector("#listupdated").textContent = "";
    scrapebutton.disabled = true;
    collectionstatus.textContent = "アカウントが変わりました。このページを再読み込みしてください。";
});

// Deadline state also changes without a storage mutation or a network fetch.
setInterval(() => { if (!document.hidden) queueRerender(); }, 60000);

// Refresh open lists when another page or an automatic batch saves task details.
let renderTimer;
let renderPending = false;
let rendering = false;
const queueRerender = (delay = 750) => {
    renderPending = true;
    clearTimeout(renderTimer);
    if (document.hidden || rendering) return;
    renderTimer = setTimeout(async () => {
        if (document.hidden) return;
        rendering = true;
        renderPending = false;
        try { await rerender(); }
        catch (error) { console.error(error); }
        finally {
            rendering = false;
            if (renderPending) queueRerender();
        }
    }, typeof delay === "number" ? delay : 750);
};
ext.storage.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes.displayShow) applyMenuVisibility(changes.displayShow.newValue);
    if (area === "sync" && Object.keys(changes).some(key => key.startsWith("selected"))) queueRerender(0);
    if (area !== "local") return;
    if (changes.assign_list || changes.quiz_list || changes.refreshHistory
        || changes.refreshCoordinator && !changes.refreshCoordinator.newValue?.lease) queueRerender();
    if (changes.refreshCoordinator) refreshBusy = Boolean(changes.refreshCoordinator.newValue?.lease);
    if (changes.refreshCoordinator?.newValue?.lease) {
        const coordinator = changes.refreshCoordinator.newValue;
        const state = TaskListState.describe({ coordinator });
        if (state.status) showRefreshState(state, coordinator);
    }
    if (changes.manualCooldownDisabled) refreshUiRevision++;
    if (changes.scrapeCooldown || changes.manualCooldownDisabled || changes.refreshCoordinator) {
        updateCooldownButton().catch(console.error);
    }
});
document.addEventListener("duedle:tasks-updated", queueRerender);
document.addEventListener("duedle:account-ready", () => {
    queueRerender(0);
    updateCooldownButton().catch(console.error);
});
document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(renderTimer);
    else {
        if (renderPending) queueRerender();
        updateCooldownButton().catch(console.error);
    }
});


//色適用
const applyColor = (type, toColor) => {
    if (!colorTypesValue.includes(type) || !/^#[\da-f]{6}$/i.test(toColor)) return;
    // Share the status palette between the dashboard and course activity cards.
    // CSS variables leave author styles and mode switching untouched.
    const channels = toColor.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255);
    const light = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = light.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const text = (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
    const linkBase = text === "#000000" ? [0, 86, 179] : [139, 197, 232];
    let link = linkBase;
    for (let mix = 0; mix <= 1; mix += 0.05) {
        link = linkBase.map(value => text === "#000000" ? value * (1 - mix) : value + (255 - value) * mix);
        const brightness = link.reduce((sum, value, index) => {
            const channel = value / 255;
            return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        if ((Math.max(luminance, brightness) + 0.05) / (Math.min(luminance, brightness) + 0.05) >= 4.5) break;
    }
    const dark = document.body.classList.contains("darkmode");
    const base = dark ? 0.034 : 1;
    let border = channels;
    for (let mix = 0; mix <= 1; mix += 0.05) {
        border = channels.map(value => dark ? value + (1 - value) * mix : value * (1 - mix));
        const brightness = border.reduce((sum, value, index) => sum +
            (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
        if ((Math.max(base, brightness) + 0.05) / (Math.min(base, brightness) + 0.05) >= 3) break;
    }
    const states = type === "complete" ? ["complete", "qualify"]
        : type === "expired" ? ["expired", "stuck"] : [type];
    const selector = states.map(state => `#display > .${state}, .duedle-task-status.${state}`).join(", ");
    document.querySelectorAll(selector).forEach(item => {
        item.style.setProperty("--duedle-status-color", toColor);
        item.style.setProperty("--duedle-status-text", text);
        item.style.setProperty("--duedle-status-link", `rgb(${link.map(Math.round).join(", ")})`);
        item.style.setProperty("--duedle-status-border", `rgb(${border.map(value => Math.round(value * 255)).join(", ")})`);
    });
};

const colorDefault_light = ["#90ee90", "#ffffe0", "#ff9090", "#ffb681", "#c8c8c8", "#eac1ff"];
const colorDefault_dark = ["#063906", "#57422a", "#821f1f", "#7c3316", "#454545", "#4a1745"];
colorTypesValue.map(async (value, index) => {
    const lsName_light = "colorSelect_light_" + value;
    const lsName_dark = "colorSelect_dark_" + value;
    if (!(await ext.storage.sync.get([lsName_light]))[lsName_light]) {
        await ext.storage.sync.set({ [lsName_light]: colorDefault_light[index] });
    }
    if (!(await ext.storage.sync.get([lsName_dark]))[lsName_dark]) {
        await ext.storage.sync.set({ [lsName_dark]: colorDefault_dark[index] });
    }
});
