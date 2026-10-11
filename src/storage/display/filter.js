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
let cooldownTimer;

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
const statusValues = ["all", "complete", "ex-complete", "qualify", "incomplete", "stuck", "expired", "unknown"];
const statusOptionsText = ["すべて", "完了", "完了以外", "合格(小テストのみ)", "未提出", "行き詰まり(小テストのみ)", "期限切れ", "点数不明(小テストのみ)"];
const statusFilter = new FilterSelect("statusSelect", "状態", statusValues, statusOptionsText, "selectedStatus");
statusFilter.applyDefault("all");
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
    if (collectionRunning) return;
    const [{ scrapeCooldown }, refresh] = await Promise.all([
        ext.storage.local.get("scrapeCooldown"),
        ext.runtime.sendMessage({ type: "REFRESH_STATUS" })
    ]);
    if (collectionRunning) return;
    const next = new Date(new Date(scrapeCooldown).getTime() + COOLDOWN_MS);
    const coolingDown = next.getTime() > Date.now();
    const busy = refresh?.busy === true;
    scrapebutton.disabled = coolingDown || busy;
    scrapebutton.textContent = busy ? "更新中…"
        : coolingDown ? "クールダウン: " + formatRemainingTime(next) : "課題を更新";
    if (coolingDown || busy) cooldownTimer = setTimeout(() => updateCooldownButton().catch(console.error), 30000);
}

scrapebutton.addEventListener("click", async () => {
    if (collectionRunning) return;
    collectionRunning = true;
    collectionErrorReason = null;
    completionError = "";
    scrapebutton.disabled = true;
    scrapebutton.textContent = "更新中…";
    collectionstatus.textContent = "更新が終わるまで、このページを開いたままにしてください。";
    let token;
    let owned = true;
    let heartbeatTimer;
    let lastVerified = 0;
    let verifying;
    let outcome = "error";
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
        const claim = await ext.runtime.sendMessage({ type: "REFRESH_CLAIM", mode: "manual" });
        if (!claim?.ok) throw new Error(claim?.error || "課題情報を更新できませんでした");
        if (!claim.granted) {
            collectionstatus.textContent = claim.reason === "cooldown"
                ? "課題更新のクールダウン中です。"
                : "課題情報を更新しています。完了までお待ちください。";
            return;
        }
        token = claim.token;
        lastVerified = Date.now();
        heartbeatTimer = setInterval(() => verifyLease(true).catch(console.error), 30000);
        const { scrapeMode = "scrape" } = await ext.storage.sync.get("scrapeMode");
        let result;
        if (scrapeMode === "tab") {
            const response = await ext.runtime.sendMessage({ type: "TAB_COURSE", refreshToken: token });
            if (!response?.ok) throw new Error(response?.error || "課題情報を更新できませんでした");
            result = response.result;
        } else {
            const stored = (await ext.storage.local.get("courseIds")).courseIds || [];
            // Include the current/visible courses even if the MutationObserver has not saved them yet.
            const visible = [...document.querySelectorAll("[data-course-id]")].map(el => Number(el.dataset.courseId));
            const current = location.pathname.endsWith("/course/view.php")
                ? Number(new URL(location.href).searchParams.get("id")) : 0;
            const collector = new CourseCollector({ shouldContinue: verifyLease, onProgress: progress => {
                collectionstatus.textContent = `${progress.courses}/${progress.totalCourses}コース・${progress.saved}件を更新中… このページを開いたままにしてください。`;
            } });
            result = await collector.run([...stored, ...visible, current]);
        }
        if (result.failed === 0) {
            outcome = "success";
            collectionstatus.textContent = `${result.courses}コース・${result.saved}件の課題情報を更新しました。`;
        } else {
            outcome = "partial";
            collectionstatus.textContent = `${result.saved}件を更新しました。${result.failed}件を取得できませんでした。${result.errors[0]?.message || "もう一度お試しください"}`;
        }
        await rerender();
    } catch (error) {
        collectionErrorReason = error.code === "AUTH_REQUIRED" ? "auth" : null;
        if (error.code === "REFRESH_CANCELLED") outcome = "cancelled";
        collectionstatus.textContent = error.message || "課題情報を更新できませんでした。もう一度お試しください。";
    } finally {
        clearInterval(heartbeatTimer);
        if (token) {
            try {
                const finished = await ext.runtime.sendMessage({
                    type: "REFRESH_FINISH", token, outcome, fullSweep: true, reason: collectionErrorReason
                });
                if (!finished?.ok || !finished.owned) throw new Error("更新結果を保存できませんでした。次回の更新で再試行します。");
            } catch (error) { completionError = error.message; collectionstatus.textContent = completionError; }

        }
        collectionRunning = false;
        updateCooldownButton().catch(console.error);
    }
});
updateCooldownButton().catch(console.error);

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
const colorTypesValue = ["complete", "qualify", "incomplete", "stuck", "warning", "expired", "unknown", "unvisited"];
const colorTypesLabel = ["完了", "合格", "未提出", "行き詰まり", "期限近い", "期限切れ", "不明", "未参照"];
const colorTypesTitle = [
    "提出が完了している / 満点をとっている",
    "必要点数に達しているが満点ではない (小テストのみ)",
    "提出していない / 小テストに答えていない",
    "テスト回数上限に達したが合格していない (小テストのみ)",
    "期限が3日以内だが未提出",
    "期限を過ぎている",
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
    fieldcolor.appendChild(colorLabel);
    fieldcolor.appendChild(input);

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
    if (settings?.dataset.taskSettings === "true") settings.hidden = !visible;
    displaybutton.textContent = visible ? "一覧を隠す" : "一覧を表示";
    displaybutton.setAttribute("aria-expanded", String(visible));
    if (!visible) setTaskSelection(false);
    updateTaskSelection();
}
const menuReady = ext.storage.sync.get("displayShow").then(saved => applyMenuVisibility(saved.displayShow));
let renderChain = Promise.resolve();
function rerender() {
    renderChain = renderChain.catch(() => {}).then(renderList);
    return renderChain;
}
async function renderList() {
    const [alldata, stored] = await Promise.all([
        StorageUtil.getAllData(), ext.storage.local.get(["refreshHistory", "refreshCoordinator"]), menuReady
    ]);
    const scrollPosition = display.scrollLeft;
    display.textContent = "";
    const visible = await displaybox(alldata);
    display.scrollLeft = scrollPosition;
    reconcileTaskSelection();
    const state = TaskListState.describe({ total: alldata.length, visible,
        history: stored.refreshHistory, coordinator: stored.refreshCoordinator });
    if (!visible) display.textContent = state.empty;
    if (!collectionRunning) collectionstatus.textContent = completionError || state.status;
    const updated = document.querySelector("#listupdated");
    updated.textContent = TaskListState.timestamp(stored.refreshHistory);
    updated.title = "締切一覧確認は対象期間の一覧確認です。各課題の詳細情報は順次更新します。";
}

// Refresh open lists when another page or an automatic batch saves task details.
let renderTimer;
let renderPending = false;
let rendering = false;
const queueRerender = () => {
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
    }, 750);
};
ext.storage.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes.displayShow) applyMenuVisibility(changes.displayShow.newValue);
    if (area === "sync" && Object.keys(changes).some(key => key.startsWith("selected"))) queueRerender();
    if (area !== "local") return;
    if (changes.assign_list || changes.quiz_list || changes.refreshHistory || changes.refreshCoordinator) queueRerender();
    if (changes.scrapeCooldown || changes.refreshCoordinator) {
        updateCooldownButton().catch(console.error);
    }
});
document.addEventListener("duedle:tasks-updated", queueRerender);
document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(renderTimer);
    else {
        if (renderPending) queueRerender();
        updateCooldownButton().catch(console.error);
    }
});


//色適用
const applyColor = (type, toColor) => {
    if (document.querySelector(".darkmode")) {
        const q = Array.from(document.querySelectorAll(
            ".darkmode ." + type + ", .darkmode ." + type + ".type, .darkmode ." + type + " .title, .darkmode ." + type + " .info, .darkmode ."
            + type + " .date, .darkmode ." + type + " h6, .darkmode ." + type + " .overflow-auto, .darkmode ." + type + " div:not(.activityiconcontainer)"
        ));
        q.map((item) => {
            item.style.background = toColor;
        })
    } else {
        const q = Array.from(document.querySelectorAll(
            "." + type + ", ." + type + ".type, ." + type + " .title, ." + type + " .info, ."
            + type + " .date, ." + type + " h6, ." + type + " .overflow-auto, ." + type + " div:not(.activityiconcontainer)"

        ));
        q.map((item) => {
            item.style.background = toColor;
        })
    }
};


const colorDefault_light = ["#90ee90", "#add8e6", "#ffffe0", "#ffffff", "#ffb681", "#ff9090", "#c8c8c8", "#eac1ff"];
const colorDefault_dark = ["#063906", "#12515e", "#57422a", "#000000", "#7c3316", "#821f1f", "#454545", "#4a1745"];
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
