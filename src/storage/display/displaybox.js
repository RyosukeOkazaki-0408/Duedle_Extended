const displaybox = async (data) => {
    if (globalThis.duedleAccountActive === false) return 0;
    const display = document.querySelector("#display");
    let rendered = 0;
    const settings = await ext.storage.sync.get(["selectedType", "selectedStatus", "selectedDue", "selectedShow"]);
    if (data) {
        for (const savedItem of data) {
            const item = { ...savedItem, status: Scrape.statusAt(savedItem.status, savedItem.due) };
            //condition
            const savedType = settings.selectedType ?? "all";
            const savedStatus = settings.selectedStatus ?? "all";
            const savedDue = settings.selectedDue ?? "all";
            const savedShow = settings.selectedShow ?? "normal";
            const currentURL = new URL(location.href);
            if (currentURL.pathname === "/moodle40a/course/view.php") {
                const courseName = document.querySelector("h1")?.textContent.trim();
                if (item.courseId ? Number(currentURL.searchParams.get("id")) !== Number(item.courseId) : courseName !== item.courseName) {
                    continue;
                }
                changeActivityColor(item);
            }

            if (item.start) { item.start = new Date(item.start); }
            if (item.due) { item.due = new Date(item.due); }
            changeAct(item, data);

            //表示状態確認
            if (savedShow === "normal" && !item.show) {
                continue;
            }
            if (savedShow === "deleted" && item.show) {
                continue;
            }

            if (savedType !== "all" && item.group !== savedType) {
                continue; // タイプが一致しない場合はスキップ
            }
            const statusMatches = savedStatus === "incomplete"
                ? ["incomplete", "warning"].includes(item.status) : item.status === savedStatus;
            if (savedStatus !== "all" && savedStatus !== "ex-complete" && !statusMatches) {
                continue; // 状態が一致しない場合はスキップ
            }
            if (savedStatus === "ex-complete" && item.status === "complete") {
                continue;
            }
            const remainhours = item.due ? (item.due - Date.now()) / (1000 * 60 * 60) : NaN;
            if (savedDue !== "all" && !Number.isFinite(remainhours)) continue;
            if (savedDue !== "all" && savedDue !== "progressing") {
                // 期限フィルタのロジックをここに追加

                if (savedDue === "today" && (remainhours > 24 || remainhours < 0)) {
                    continue; // 24時間以内でない場合はスキップ
                }
                if (savedDue === "week" && (remainhours > 24 * 7 || remainhours < 0)) {
                    continue; // 今週以内でない場合はスキップ
                }
                if (savedDue === "overdue" && remainhours >= 0) {
                    continue; // 期限切れでない場合はスキップ
                }
                if (savedDue === "dueweek" && (remainhours >= 0 || remainhours < -24 * 7)) {
                    continue;
                }
            }
            if (savedDue === "progressing" && remainhours < 0) {
                continue;
            }


            if (item.start) { item.start = new Date(item.start); }
            if (item.due) { item.due = new Date(item.due); }
            if (item.group === "assign_list") {
                const assignbox = new AssignBox(item);
                const assign = await assignbox.getElement();
                if (globalThis.duedleAccountActive === false) return 0;
                if (typeof installTaskSelection === "function") installTaskSelection(assign, item);
                display.appendChild(assign);
                rendered++;
            } else if (item.group === "quiz_list") {
                const quizbox = new QuizBox(item);
                const quiz = await quizbox.getElement();
                if (globalThis.duedleAccountActive === false) return 0;
                if (typeof installTaskSelection === "function") installTaskSelection(quiz, item);
                display.appendChild(quiz);
                rendered++;
            }
        }
    }
    checkUnvisited();
    colorReload();
    return rendered;
};

const setActivityStatus = (element, status) => {
    const statuses = ["complete", "qualify", "incomplete", "stuck", "warning", "expired", "unknown", "unvisited"];
    element.classList.remove(...statuses);
    if (statuses.includes(status)) element.classList.add(status, "duedle-task-status");
};

const changeActivityColor = (item) => {
    const type = item.group === "assign_list" ? "assign" : "quiz";
    const id = item.group === "assign_list" ? item.assignId : item.quizId;
    // Prefer stable activity URLs. Legacy markup without a link can only be
    // matched by a unique exact name, never by a partial title.
    const linked = [...document.querySelectorAll(`.${type} [data-activityname]`)]
        .filter(el => [...(el.querySelectorAll?.("a[href]") || [])].some(link => taskLinkMatches(link, type, id)));
    if (linked.length) {
        linked.forEach(el => setActivityStatus(el, item.status));
        return;
    }
    if (item.group === "assign_list") {
        const actbox = [...document.querySelectorAll(".assign [data-activityname]")]
            .filter(el => el.dataset.activityname === item.assignName);
        if (actbox.length === 1 && !(actbox[0].querySelectorAll?.("a[href]") || []).length) {
            setActivityStatus(actbox[0], item.status);
        }

    } else if (item.group === "quiz_list") {
        const actbox = [...document.querySelectorAll(".quiz [data-activityname]")]
            .filter(el => el.dataset.activityname === item.quizName);
        if (actbox.length === 1 && !(actbox[0].querySelectorAll?.("a[href]") || []).length) {
            setActivityStatus(actbox[0], item.status);
        }
    }
}

const taskLinkMatches = (link, type, id) => {
    try {
        const url = new URL(link.getAttribute("href"), location.href);
        return url.origin === "https://cms7.ict.nitech.ac.jp"
            && url.pathname === `/moodle40a/mod/${type}/view.php`
            && Number(url.searchParams.get("id")) === Number(id);
    } catch { return false; }
};

// Moodle's upcoming block links to calendar events rather than activity URLs.
// Only use the Japanese event label when exactly one saved task matches it.
const calendarEventMatches = (element, item, tasks) => {
    const link = element.querySelector('a[data-type="event"][data-action="view-event"]');
    if (!link) return false;
    try {
        const url = new URL(link.getAttribute("href"), location.href);
        if (url.origin !== "https://cms7.ict.nitech.ac.jp" || url.pathname !== "/moodle40a/calendar/view.php") return false;
    } catch { return false; }
    const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
    const text = normalize(link.textContent);
    const assign = /^「([\s\S]+)」\s*の提出期限$/.exec(text);
    const quiz = /^([\s\S]+?)\s*の受験可能期間の(?:開始|終了)$/.exec(text);
    const group = assign ? "assign_list" : quiz ? "quiz_list" : null;
    if (!group) return false;
    const name = normalize((assign || quiz)[1]);
    const matches = tasks.filter(task => task.group === group && normalize(group === "assign_list" ? task.assignName : task.quizName) === name);
    const keys = new Set(matches.map(task => group === "assign_list" ? task.assignId : task.quizId));
    return item.group === group && keys.size === 1 && keys.has(group === "assign_list" ? item.assignId : item.quizId);
};

const changeAct = (item, tasks = []) => {
    const actbox = Array.from(document.querySelectorAll(`.event`));
    actbox.map((i) => {
        const type = item.group === "assign_list" ? "assign" : "quiz";
        const id = item.group === "assign_list" ? item.assignId : item.quizId;
        const link = i.querySelector(`a[href*="/mod/${type}/view.php"]`);
        if (link ? taskLinkMatches(link, type, id) : calendarEventMatches(i, item, tasks)) {
            setActivityStatus(i, item.status);
        }
        const dateElement = i.querySelector(".date");
        const i_datetxt = dateElement?.textContent || "";
        const due = transDue(i_datetxt);
        if (due) {
            dateElement.textContent = formatRemainingTime(due);
        }
        const i_title = i.querySelector("a.text-truncate");
        if (i_title) i_title.setAttribute("title", i_title.textContent);

    });
};

//unvisited
const checkUnvisited = () => {
    const unvisitedboxes = Array.from(document.querySelectorAll(`[data-activityname]:not(.activity-information,.complete,.incomplete,.unknown,.expired,.stuck,.qualify,.warning,.unvisited)`));
    unvisitedboxes.map((item) => {
        if (!item.querySelector(".content") &&
            (item.textContent.includes(" 課題") || item.textContent.includes(" 小テスト"))) {
            item.classList.add("unvisited", "duedle-task-status");
        }
    });
    const unvisitedboxes_ = Array.from(document.querySelectorAll(`.event:not(.complete,.incomplete,.unknown,.expired,.stuck,.qualify,.warning)`));
    unvisitedboxes_.map((i) => {
        i.classList.add("unvisited", "duedle-task-status");
        const dateElement = i.querySelector(".date");
        const i_datetxt = dateElement?.textContent || "";
        const due = transDue(i_datetxt);
        if (due) {
            dateElement.textContent = formatRemainingTime(due);
        }
        const i_title = i.querySelector("a.text-truncate");
        if (i_title) i_title.setAttribute("title", i_title.textContent);
    });

    const unvisitedboxesh6 = Array.from(document.querySelectorAll(`h6.d-flex.mb-1`));
    unvisitedboxesh6.map((item) => {
        item.classList.remove("mb-1");
    });
}

let colorReloadVersion = 0;
const colorReload = () => {
    const version = ++colorReloadVersion;
    colorTypesValue.map(async (value, index) => {
        const query = document.querySelector("#colorSelect_" + value);
        if (!query) return;
        const dark = Boolean(document.querySelector(".darkmode"));
        const key = `colorSelect_${dark ? "dark" : "light"}_${value}`;
        const saved = await ext.storage.sync.get(key);
        if (version !== colorReloadVersion) return;
        query.value = saved[key] || (dark ? colorDefault_dark[index] : colorDefault_light[index]);
        applyColor(value, query.value);
    });
};

const transDue = (txt) => {
    if (txt.includes("本日")) {
        const time = txt.match(/本日,\s*(\d{1,2}):(\d{2})/);
        if (!time) return null;
        const [, hour, minute] = time;
        const now = new Date();
        return new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            Number(hour),
            Number(minute)
        );
    } else if (txt.includes("明日")) {
        const time = txt.match(/明日,\s*(\d{1,2}):(\d{2})/);
        if (!time) return null;
        const [, hour, minute] = time;
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        return new Date(
            tomorrow.getFullYear(),
            tomorrow.getMonth(),
            tomorrow.getDate(),
            Number(hour),
            Number(minute)
        );
    } else {
        const time = txt.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日,\s*(\d{1,2}):(\d{2})/);
        if (time) {
            const [, year, month, day, hour, minute] = time;
            return new Date(
                Number(year),
                Number(month) - 1, // 月は0始まり
                Number(day),
                Number(hour),
                Number(minute)
            );
        }

    }
};

rerender().catch(console.error);
