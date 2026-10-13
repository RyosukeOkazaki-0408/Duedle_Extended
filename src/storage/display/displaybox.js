const displaybox = async (data, target = null) => {
    if (globalThis.duedleAccountActive === false) return 0;
    const display = target || document.querySelector("#display");
    let rendered = 0;
    const settings = await ext.storage.sync.get(["selectedType", "selectedStatus", "selectedDue", "selectedShow"]);
    if (data) {
        for (const savedItem of data) {
            const item = { ...savedItem, status: Scrape.statusAt(savedItem.status, savedItem.due) };
            //condition
            const savedType = settings.selectedType ?? "all";
            const savedStatus = ({ qualify: "complete", stuck: "expired" })[settings.selectedStatus]
                ?? settings.selectedStatus ?? "ex-complete";
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
            const statusGroups = {
                complete: ["complete", "qualify"],
                incomplete: ["incomplete", "warning"],
                expired: ["expired", "stuck"]
            };
            const statusMatches = (statusGroups[savedStatus] || [savedStatus]).includes(item.status);
            if (savedStatus !== "all" && savedStatus !== "ex-complete" && !statusMatches) {
                continue; // 状態が一致しない場合はスキップ
            }
            if (savedStatus === "ex-complete" && statusGroups.complete.includes(item.status)) {
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
    if (!target) {
        refreshUpcomingEventStatuses(data || []);
        checkUnvisited();
        colorReload();
    }
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
    // Moodle 4 places the module type inside the activity-item. Match its own
    // title link, not links to other tasks inside the teacher's description.
    const activities = [...document.querySelectorAll(".course-content .activity-item")]
        .filter(el => [...el.querySelectorAll(".activityname a[href]")]
            .some(link => taskLinkMatches(link, type, id)));
    if (activities.length) {
        activities.forEach(el => setActivityStatus(el, item.status));
        return;
    }
    // Prefer stable activity URLs. Legacy markup without a link can only be
    // matched by a unique exact name, never by a partial title.
    const legacy = [...document.querySelectorAll(`.${type} [data-activityname]`)]
        .filter(el => !el.closest?.(".activity-item"));
    const linked = legacy
        .filter(el => [...(el.querySelectorAll?.("a[href]") || [])].some(link => taskLinkMatches(link, type, id)));
    if (linked.length) {
        linked.forEach(el => setActivityStatus(el, item.status));
        return;
    }
    const name = type === "assign" ? item.assignName : item.quizName;
    const actbox = legacy.filter(el => el.dataset.activityname === name);
    if (actbox.length === 1 && !(actbox[0].querySelectorAll?.("a[href]") || []).length) {
        setActivityStatus(actbox[0], item.status);
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

let upcomingEventRefs = new Map();
const calendarEventId = element => {
    const link = element.querySelector('a[data-type="event"][data-action="view-event"]');
    if (!link) return null;
    try {
        const url = new URL(link.getAttribute("href"), location.href);
        const id = Number(link.getAttribute("data-event-id"));
        return url.origin === "https://cms7.ict.nitech.ac.jp" && url.pathname === "/moodle40a/calendar/view.php"
            && Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch { return null; }
};

// Resolve modern events by identity. Name fallback is only for legacy markup without an event ID.
const calendarEventMatches = (element, item, tasks) => {
    const eventId = calendarEventId(element);
    if (eventId) {
        const ref = upcomingEventRefs.get(eventId);
        return Boolean(ref && item.group === (ref.type === "assign" ? "assign_list" : "quiz_list")
            && Number(item[ref.type === "assign" ? "assignId" : "quizId"]) === ref.id);
    }
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

// Keep the absolute deadline after replacing Moodle's date label with a countdown.
// Re-read it if Moodle updates the label or replaces the element.
const eventDeadlines = new WeakMap();
const updateEventRemaining = (element) => {
    if (!element) return;
    const text = element.textContent;
    const saved = eventDeadlines.get(element);
    const due = saved && text === saved.rendered ? saved.due : transDue(text);
    if (!due) {
        eventDeadlines.delete(element);
        return;
    }
    const rendered = formatRemainingTime(due);
    eventDeadlines.set(element, { due, rendered });
    if (text !== rendered) element.textContent = rendered;
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
        updateEventRemaining(i.querySelector(".date"));
        const i_title = i.querySelector("a.text-truncate");
        if (i_title) i_title.setAttribute("title", i_title.textContent);

    });
};

// Recompute from all stored tasks, regardless of the current course/list filters.
const refreshUpcomingEventStatuses = tasks => {
    document.querySelectorAll(".event.duedle-task-status").forEach(event => {
        event.classList.remove("complete", "qualify", "incomplete", "stuck", "warning", "expired", "unknown", "unvisited", "duedle-task-status");
        ["color", "text", "link", "border"].forEach(part => event.style?.removeProperty?.("--duedle-status-" + part));
    });
    tasks.forEach(task => changeAct({ ...task, status: Scrape.statusAt(task.status, task.due) }, tasks));
};

//unvisited
const checkUnvisited = () => {
    // Also update events with no saved task and events whose status is already known.
    document.querySelectorAll(".event").forEach(event => updateEventRemaining(event.querySelector(".date")));
    document.querySelectorAll(".course-content .activity-item:not(.duedle-task-status)").forEach(activity => {
        const task = [...activity.querySelectorAll(".activityname a[href]")].some(link => {
            try {
                const id = new URL(link.getAttribute("href"), location.href).searchParams.get("id");
                return Number.isSafeInteger(Number(id)) && Number(id) > 0
                    && ["assign", "quiz"].some(type => taskLinkMatches(link, type, id));
            } catch { return false; }
        });
        if (task) setActivityStatus(activity, "unvisited");
    });
    const unvisitedboxes = Array.from(document.querySelectorAll(`[data-activityname]:not(.activity-information,.complete,.incomplete,.unknown,.expired,.stuck,.qualify,.warning,.unvisited)`));
    unvisitedboxes.map((item) => {
        if (!item.querySelector(".content") &&
            (item.textContent.includes(" 課題") || item.textContent.includes(" 小テスト"))) {
            item.classList.add("unvisited", "duedle-task-status");
        }
    });
    const unvisitedboxes_ = Array.from(document.querySelectorAll(`.event:not(.complete,.incomplete,.unknown,.expired,.stuck,.qualify,.warning)`));
    unvisitedboxes_.map((i) => {
        const eventId = calendarEventId(i);
        const directTask = ["assign", "quiz"].some(type => {
            const link = i.querySelector(`a[href*="/mod/${type}/view.php"]`);
            if (!link) return false;
            try {
                const id = Number(new URL(link.getAttribute("href"), location.href).searchParams.get("id"));
                return Number.isSafeInteger(id) && id > 0 && taskLinkMatches(link, type, id);
            } catch { return false; }
        });
        if (directTask || (eventId && upcomingEventRefs.get(eventId))) setActivityStatus(i, "unvisited");
        else if (eventId && !upcomingEventRefs.has(eventId)) setActivityStatus(i, "unknown");
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
