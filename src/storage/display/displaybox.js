const displaybox = async (data) => {
    const display = document.querySelector("#display");
    let rendered = 0;
    const settings = await ext.storage.sync.get(["selectedType", "selectedStatus", "selectedDue", "selectedShow"]);
    if (data) {
        for (const item of data) {
            //condition
            const savedType = settings.selectedType ?? "all";
            const savedStatus = settings.selectedStatus ?? "all";
            const savedDue = settings.selectedDue ?? "all";
            const savedShow = settings.selectedShow ?? "normal";
            if (location.href.includes("https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=")) {
                const courseName = document.querySelector("h1")?.textContent.trim();
                if (courseName !== item.courseName) {
                    continue;
                }
                changeActivityColor(item);
            }

            if (item.start) { item.start = new Date(item.start); }
            if (item.due) { item.due = new Date(item.due); }
            changeAct(item);

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
            if (savedStatus !== "all" && savedStatus !== "ex-complete" && item.status !== savedStatus) {
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
                display.appendChild(assign);
                rendered++;
            } else if (item.group === "quiz_list") {
                const quizbox = new QuizBox(item);
                const quiz = await quizbox.getElement();
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
    if (statuses.includes(status)) element.classList.add(status);
};

const changeActivityColor = (item) => {
    if (item.group === "assign_list") {
        const actbox = [...document.querySelectorAll(".assign [data-activityname]")]
            .filter(el => el.dataset.activityname === item.assignName);
        if (actbox[0]) {
            setActivityStatus(actbox[0], item.status);
        }

    } else if (item.group === "quiz_list") {
        const actbox = [...document.querySelectorAll(".quiz [data-activityname]")]
            .filter(el => el.dataset.activityname === item.quizName);
        if (actbox[0]) {
            setActivityStatus(actbox[0], item.status);
        }
    }
}

const changeAct = (item) => {
    const actbox = Array.from(document.querySelectorAll(`.event`));
    actbox.map((i) => {
        if ((item.group === "assign_list" && i.textContent.includes(item.assignName)) || (item.group === "quiz_list" && i.textContent.includes(item.quizName))) {
            setActivityStatus(i, item.status);
            const link = i.querySelector("a");
            if (!link) return;
            link.removeAttribute("data-action");
            if (item.group === "quiz_list") {
                link.setAttribute("href", `https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?id=${item.quizId}`);
            } else if (item.group === "assign_list") {
                link.setAttribute("href", `https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=${item.assignId}`);
            }
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
            item.classList.add("unvisited");
        }
    });
    const unvisitedboxes_ = Array.from(document.querySelectorAll(`.event:not(.complete,.incomplete,.unknown,.expired,.stuck,.qualify,.warning)`));
    unvisitedboxes_.map((i) => {
        i.classList.add("unvisited");
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

const colorReload = () => {
    colorTypesValue.map(async (value, index) => {
        const query = document.querySelector("#colorSelect_" + value);
        if (!query) return;
        const dark = Boolean(document.querySelector(".darkmode"));
        const key = `colorSelect_${dark ? "dark" : "light"}_${value}`;
        query.value = (await ext.storage.sync.get(key))[key] || (dark ? colorDefault_dark[index] : colorDefault_light[index]);
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
