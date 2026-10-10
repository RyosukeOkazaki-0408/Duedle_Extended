class ScrapeQuizReview extends Scrape {
    static getData(oldData) {
        //courseName
        const courseName = document.querySelector("h1").textContent.trim();

        //quizName
        const quizName = document.querySelector("[aria-current='page']").textContent.trim();

        //point
        let point = oldData.point ?? null, maxp = oldData.maxp ?? null;
        try {
            const pointraw = document.querySelector("tr:last-of-type td").textContent.trim();
            const match = pointraw.match(/([\d.]+)\s*\/\s*([\d.]+)/);

            if (match && (point === null || point <= parseFloat(match[1]))) {
                point = parseFloat(match[1]); // 左側（現在の得点）
                maxp = parseFloat(match[2]);     // 右側（満点）
            }
        } catch (error) {
            // Keep the previously reviewed score if the current page hides grades.
        }
        const count = oldData.count === 0 ? 1 : oldData.count;

        let a_status;
        if (maxp !== null && point !== null) { //得点状況がわかるとき
            if (point === maxp) {
                a_status = "complete";
            } else if (oldData.required === null || oldData.required === undefined) {
                if (count === 0) {
                    a_status = "incomplete";
                } else {
                    a_status = "qualify";
                }
            } else if (point >= oldData.required) {
                a_status = "qualify";
            } else {
                a_status = "incomplete";
            }
        } else { //得点状況がわからないとき
            if (count === 0) {
                a_status = "incomplete";
            } else {
                a_status = "unknown";
            }
        }
        if (point !== null && oldData.required != null && point < oldData.required && a_status === "incomplete" && count === oldData.maxcount) { //受験回数が上限に達しているのに合格点に達していないとき
            a_status = "stuck";
        }
        //warningやexpiredにおきかえ

        if (a_status === "incomplete") {
            if (oldData.due && new Date(oldData.due) - Date.now() < 3 * 24 * 60 * 60 * 1000) {
                a_status = "warning";
            }
            //締め切りを過ぎている場合はexpiredにする
            if (oldData.due && new Date(oldData.due) - Date.now() < 0) {
                a_status = "expired";
            }
        }

        const newData = {
            group: oldData.group,
            quizId: oldData.quizId,
            courseName: courseName,
            quizName: quizName,
            start: oldData.start,
            due: oldData.due,
            point: point,
            required: oldData.required,
            maxp: maxp,
            count: count,
            maxcount: oldData.maxcount,
            status: a_status,
            show: oldData.show,
            notified: oldData.notified
        }
        return newData;
    }
}
