class ScrapeQuiz extends Scrape {
    static getData(doc = document, pageURL = doc.URL) {
        if (this.hasTaskDenial(doc)) return null;
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

        // Only the overview's aggregate grade belongs in the task record.
        const grade = this.gradeRatio(doc.querySelector("#feedback h3")?.textContent);
        let point = grade?.point ?? null, maxp = grade?.maxp ?? null;
        const information = [...doc.querySelectorAll(".quizinfo p, p.text-left")]
            .filter(node => !node.closest("#intro, .activity-description"))
            .map(node => node.textContent.trim());
        const requiredraw = information.find(text => /^(?:合格点|Grade to pass)(?:\s|[:：]|$)/i.test(text));
        const requiredGrade = this.gradeRatio(requiredraw);
        const required = requiredGrade?.point ?? null;
        if (maxp === null) maxp = requiredGrade?.maxp ?? null;
        // Moodle omits the pass-mark/attempt-limit messages when unset. This is
        // meaningful only on a recognized overview in a supported language;
        // unreadable settings must never turn a failing attempt into a pass.
        const language = doc.documentElement?.lang || "";
        const recognizedOverview = /^(?:ja|en)(?:[-_]|$)/i.test(language)
            && Boolean(doc.querySelector(".quizattempt"));
        const requiredState = requiredGrade ? "known" : !requiredraw && recognizedOverview ? "none" : "unknown";

        const legacyCount = [...doc.querySelectorAll("table.quizattemptsummary tbody tr")]
            .filter(row => row.querySelector("td")).length;
        // Moodle 4.5 renders one labelled summary card per attempt instead of
        // the legacy attempt table. Never count grade/detail rows as attempts.
        const cards = [...doc.querySelectorAll("table.quizreviewsummary")].filter(table =>
            !table.closest?.("#intro, .activity-description")
            && /^(?:Attempt|受験|解答|試行)\s*\d+/i.test(table.querySelector("caption")?.textContent.trim() || ""));
        const count = legacyCount || cards.length;
        const maxcountraw = information.find(text => /^(?:受験可能回数|Attempts allowed)(?:\s|[:：]|$)/i.test(text));
        const maxcountMatch = maxcountraw?.match(/[:：]\s*(\d+)\s*$/);
        const explicitUnlimited = /[:：]\s*(?:無制限|Unlimited)\s*$/i.test(maxcountraw || "");
        const parsedMaxcount = maxcountMatch ? Number(maxcountMatch[1]) : null;
        const maxcount = Number.isSafeInteger(parsedMaxcount) && parsedMaxcount >= 0 ? parsedMaxcount
            : explicitUnlimited || (!maxcountraw && recognizedOverview) ? 0 : null;

        let a_status;
        if (maxp !== null && point !== null) {
            if (point === maxp) {
                a_status = "complete";
            } else if (requiredState === "unknown") {
                a_status = count === 0 ? "incomplete" : "unknown";
            } else if (requiredState === "none") {
                a_status = count === 0 ? "incomplete" : "qualify";
            } else {
                a_status = point >= required ? "qualify" : "incomplete";
            }
        } else {
            a_status = count === 0 ? "incomplete" : "unknown";
        }
        if (point !== null && required !== null && point < required && a_status === "incomplete"
            && maxcount > 0 && count >= maxcount) {
            a_status = "stuck";
        }

        // Diagnostic metadata only: do not change the visible status or retry policy.
        let statusDetail = { kind: "known", reason: null };
        if (a_status === "unknown") {
            const headers = [...doc.querySelectorAll("table.quizattemptsummary thead th")]
                .map(node => node.textContent.trim());
            const stateColumn = headers.findIndex(text => /^(?:状態|State)$/i.test(text));
            const rows = [...doc.querySelectorAll("table.quizattemptsummary tbody tr")]
                .filter(row => row.querySelector("td"));
            const inProgress = stateColumn >= 0 && rows.length > 0 && rows.every(row =>
                /^(?:進行中|In progress)$/i.test(row.querySelectorAll("td")[stateColumn]?.textContent.trim() || ""));
            const gradeColumn = headers.findIndex(text => /^(?:評点|成績|Grade)(?:\s*\/.*)?$/i.test(text));
            const awaitingGrade = gradeColumn >= 0 && rows.length > 0 && rows.every(row =>
                /^(?:未評定|未採点|採点待ち|Not yet graded|Requires grading)$/i.test(
                    row.querySelectorAll("td")[gradeColumn]?.textContent.trim() || ""));
            if (requiredraw && !requiredGrade) {
                statusDetail = { kind: "error", reason: "pass_mark_parse_failed" };
            } else if (inProgress && point === null) {
                statusDetail = { kind: "unknown", reason: "attempt_in_progress" };
            } else if (awaitingGrade && point === null) {
                statusDetail = { kind: "unknown", reason: "awaiting_grade" };
            } else {
                // Missing marks alone do not prove that Moodle deliberately hides them.
                statusDetail = { kind: "unverified", reason: point === null || maxp === null
                    ? "grade_unavailable" : "pass_mark_unverified" };
            }
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
            requiredState: requiredState,
            maxp: maxp,
            count: count,
            maxcount: maxcount,
            status: a_status,
            statusDetail,
            show: true, //default
        }
        return data;


    }
}
