class ScrapeAssign extends Scrape {
    static getData(doc = document, pageURL = doc.URL) {
        //assignId, courseName, assignName, start, submit, due, file, filenum, status
        //assignId
        const urlParams = new URL(pageURL).searchParams;
        const assignId = Number(urlParams.get("id"));
        if (!Number.isInteger(assignId) || assignId <= 0) return null;

        //courseName
        const courseName = doc.querySelector("h1")?.textContent.trim();

        //assignName
        const assignName = doc.querySelector("h2")?.textContent.trim();
        if (!courseName || !assignName || assignName === "トピックアウトライン"
            || doc.querySelector(".errorcode, .errormessage")) {
            return null;
        }


        //file, status
        const files = Array.from(doc.querySelectorAll(".submissionstatustable .fileuploadsubmission a")).map(a => a.textContent.trim());
        const filenum = files.length;
        const file = files[0] || "?"; // 最初のファイル名、存在しない場合は?
        const due = this.calldue(doc);
        const submitted = doc.querySelector(".submissionstatustable .submissionstatussubmitted");
        const pending = doc.querySelector(".submissionstatustable .submissionstatusdraft, .submissionstatustable .submissionstatusnew, .submissionstatustable .submissionstatusreopened")
            // Moodle 4.0 renders the initial state without a status CSS class.
            || [...doc.querySelectorAll(".submissionstatustable tr")].some(row => {
                const cells = row.querySelectorAll("th, td");
                if (cells.length < 2 || !/^(提出ステータス|Submission status)$/i.test(cells[0].textContent.trim())) return false;
                return /^(まだ提出されていません[。.]?|何も提出されていません[。.]?|未提出|No submissions have been made yet[.]?|No submission[.]?|Nothing has been submitted[.]?)$/i.test(cells[1].textContent.trim());
            });
        // Files and online text may both be drafts. An unfamiliar page is unknown,
        // rather than claiming that the student has completed a submission.
        const a_status = this.statusAt(submitted ? "complete" : pending ? "incomplete" : "unknown", due);

        const data = {
            ...this.detailMetadata(doc, pageURL),
            group: "assign_list",
            assignId: assignId,
            courseName: courseName,
            assignName: assignName,
            start: this.callstart(doc)?.toISOString() ?? null,
            due: due?.toISOString() ?? null,
            file: file,
            filenum: filenum,
            status: a_status,
            show: true, //default
        }
        return data;
    }
}
