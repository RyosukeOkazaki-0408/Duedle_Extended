class ScrapeQuiz extends Scrape {
    static getData(doc = document, pageURL = doc.URL) {
        //quizId, courseName, quizName, start, submit, due, point, required, maxp, count, maxcount, status
        //quizId
        const urlParams = new URL(pageURL).searchParams;
        const quizId = Number(urlParams.get("id"));
        if (!Number.isInteger(quizId) || quizId <= 0) return null;

        //courseName
        const courseName = doc.querySelector("h1")?.textContent.trim();

        //quizName
        const quizName = doc.querySelector("h2")?.textContent.trim();
        if (!courseName || !quizName || quizName === "トピックアウトライン"
            || doc.querySelector(".errorcode, .errormessage")) {
            return null;
        }

        //point
        let point = null, maxp = null;
        try {
            const pointraw = doc.querySelector("#feedback h3").textContent.trim();
            const match = pointraw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);

            if (match) {
                point = parseFloat(match[1]); // 左側（現在の得点）
                maxp = parseFloat(match[2]);     // 右側（満点）
            }
        } catch (error) {
            point = null;
            maxp = null;
        }
        //required,maxp
        const requiredraw = [...doc.querySelectorAll("p.text-left")]
            .find(e => e.textContent.includes("合格点"));
        const requiredMatch = requiredraw ? requiredraw.textContent.trim().match(/合格点:\s*([\d.]+)\s*\/\s*([\d.]+)/) : null;
        const required = requiredMatch ? parseFloat(requiredMatch[1]) : null;
        if (maxp === null) maxp = requiredMatch ? parseFloat(requiredMatch[2]) : null;

        //count
        const count = [...doc.querySelectorAll("table.quizattemptsummary tbody tr")]
            .filter(row => row.querySelector("td")).length;

        //maxcount
        const maxcountraw = [...doc.querySelectorAll("p.text-left")]
            .find(e => e.textContent.includes("受験可能回数"));
        const maxcountMatch = maxcountraw?.textContent.trim().match(/受験可能回数:\s*(\d+)/);
        const maxcount = maxcountMatch ? Number(maxcountMatch[1]) : null;

        let a_status;
        if (maxp !== null && point !== null) { //得点状況がわかるとき
            if (point === maxp) {
                a_status = "complete";
            } else if (required === null || required === undefined) {
                if (count === 0) {
                    a_status = "incomplete";
                } else {
                    a_status = "qualify";
                }
            } else if (point >= required) {
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
        if (point !== null && required !== null && point < required && a_status === "incomplete" && count === maxcount) { //受験回数が上限に達しているのに合格点に達していないとき
            a_status = "stuck";
        }

        const due = this.calldue(doc);
        a_status = this.statusAt(a_status, due);


        const data = {
            ...this.detailMetadata(doc, pageURL),
            group: "quiz_list",
            quizId: quizId,
            courseName: courseName,
            quizName: quizName,
            start: this.callstart(doc)?.toISOString() ?? null,
            due: due?.toISOString() ?? null,
            point: point,
            required: required,
            maxp: maxp,
            count: count,
            maxcount: maxcount,
            status: a_status,
            show: true, //default
        }
        return data;


    }
}
