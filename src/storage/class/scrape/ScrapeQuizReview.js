class ScrapeQuizReview extends Scrape {
    // This is a single attempt, never an aggregate grade or a task snapshot.
    static getData(doc = document, pageURL = doc.URL) {
        let url;
        try { url = new URL(pageURL); } catch { return null; }
        if (url.origin !== "https://cms7.ict.nitech.ac.jp" || url.pathname !== "/moodle40a/mod/quiz/review.php") return null;
        const ids = new Set();
        const cmid = Number(url.searchParams.get("cmid"));
        if (Number.isSafeInteger(cmid) && cmid > 0) ids.add(cmid);
        for (const link of doc.querySelectorAll('#page-navbar a[href*="/mod/quiz/view.php"], a.mod_quiz-next-nav[href*="/mod/quiz/view.php"]')) {
            try {
                const target = new URL(link.getAttribute("href"), pageURL);
                const id = Number(target.searchParams.get("id"));
                if (target.origin === url.origin && target.pathname === "/moodle40a/mod/quiz/view.php"
                    && Number.isSafeInteger(id) && id > 0) ids.add(id);
            } catch { /* Ignore malformed or unrelated links. */ }
        }
        if (ids.size !== 1 || doc.querySelector(".errorcode, .errormessage")) return null;
        let grade = null;
        for (const row of doc.querySelectorAll("table.quizreviewsummary tr")) {
            const label = row.querySelector("th")?.textContent.trim();
            if (!/^(?:評点|成績|Grade)\s*[:：]?$/i.test(label || "")) continue;
            grade = this.gradeRatio(row.querySelector("td")?.textContent);
            break;
        }
        return { quizId: [...ids][0], attemptPoint: grade?.point ?? null, attemptMaxp: grade?.maxp ?? null };
    }
}
