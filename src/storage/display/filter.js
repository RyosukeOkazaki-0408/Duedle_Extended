const header = document.querySelector("header");
const ext_dashboard = document.createElement("div");
ext_dashboard.setAttribute("id", "ext_dashboard");
ext_dashboard.classList.add("card-body");


//inside div - innerHTML
const extInner =
    `
    <button class="btn btn-primary" id="scrapebutton">課題情報を更新する</button>
    <button class="btn btn-secondary" id="displaybutton">課題メニュー表示を切り替える</button>
    <button class="btn btn-secondary" id="deletebutton"></button>
    <p id="collectionstatus" role="status" aria-live="polite" class="my-2"></p>
    <div id="filter" class="filter-group my-2 p-2 border-radius border">
        <fieldset id="fieldfilter">
        </fieldset>
        <fieldset id="fieldcolor">
        </fieldset>
    </div>
    <div id="display">
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
const noexistmsg = "表示するものがありません";
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
let collectionRunning = false;
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
const showOptionsText = ["すべて", "通常", "表示削除済み"];
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
        : coolingDown ? "クールダウン: " + formatRemainingTime(next) : "課題情報を更新する";
    if (coolingDown || busy) cooldownTimer = setTimeout(() => updateCooldownButton().catch(console.error), 30000);
}

scrapebutton.addEventListener("click", async () => {
    if (collectionRunning) return;
    collectionRunning = true;
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
                ? "全件更新のクールダウン中です。"
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
        if (error.code === "REFRESH_CANCELLED") outcome = "cancelled";
        collectionstatus.textContent = error.message || "課題情報を更新できませんでした。もう一度お試しください。";
    } finally {
        clearInterval(heartbeatTimer);
        if (token) {
            await ext.runtime.sendMessage({
                type: "REFRESH_FINISH", token, outcome, fullSweep: true
            }).catch(console.error);
        }
        collectionRunning = false;
        updateCooldownButton().catch(console.error);
    }
});
updateCooldownButton().catch(console.error);

//display show button
const displaybutton = document.querySelector("#displaybutton");
displaybutton.addEventListener("click", () => {
    if (!display.hasAttribute("hidden")) {
        display.setAttribute("hidden", "");
        filter.setAttribute("hidden", "");
    } else {
        display.removeAttribute("hidden");
        filter.removeAttribute("hidden");
    }
    ext.storage.sync.set({ displayShow: !display.hasAttribute("hidden") });
});

//deletebutton
let deletebutton_count = 5;
const deletebutton = document.querySelector("#deletebutton");
deletebutton.textContent = `一括表示切り替え(${deletebutton_count}クリック)`;
deletebutton.addEventListener("click", async () => {
    if (deletebutton_count !== 1) {
        deletebutton_count--;
    } else {
        const tasklink = Array.from(document.querySelectorAll("#display a"));
        for (const item of tasklink) {
            const link = item.getAttribute("href");
            const id = parseInt(link.match(/\d+$/)?.[0], 10);
            const ss = await ext.storage.sync.get("selectedShow");
            const showsetting = ss.selectedShow;
            if (link.includes("assign")) {
                if (showsetting === "normal") {
                    await StorageUtil.editData('assign_list', "assignId", id, "show", false);
                } else if (showsetting === "deleted") {
                    await StorageUtil.editData('assign_list', "assignId", id, "show", true);
                }
            } else if (link.includes("quiz")) {
                if (showsetting === "normal") {
                    await StorageUtil.editData('quiz_list', "quizId", id, "show", false);
                } else if (showsetting === "deleted") {
                    await StorageUtil.editData('quiz_list', "quizId", id, "show", true);
                }
            }
        }
        rerender();
        deletebutton_count = 5;
    }
deletebutton.textContent = `一括表示切り替え(${deletebutton_count}クリック)`;
});



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



//display appendまで待機
(async () => {
    const savedDisplayShow = (await ext.storage.sync.get(["displayShow"])).displayShow;
    if (savedDisplayShow === undefined) {
        display.setAttribute("hidden", "");
    }
})();

async function rerender() {
    document.querySelector("#display").innerHTML = ""; // 表示をクリア
    const alldata = await StorageUtil.getAllData();
    display.textContent = noexistmsg;
    await displaybox(alldata); // データを再表示
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
    if (area !== "local") return;
    if (changes.assign_list || changes.quiz_list) queueRerender();
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


//初期状態のlocalstorage
ext.storage.sync.get(["displayShow"], (result) => {
    if (result.displayShow === undefined) {
        ext.storage.sync.set({ displayShow: true });
    }
});

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
