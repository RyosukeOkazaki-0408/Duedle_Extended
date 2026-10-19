class Scrape {
    static hasTaskDenial(doc) {
        for (const node of doc.querySelectorAll('.alert-danger, .errorbox, .errorcode, .errormessage, [data-errorcode]')) {
            if (node.closest?.('#display, #collectionstatus, #intro, .activity-description, .que, .submissionstatustable')) continue;
            const code = node.getAttribute?.('data-errorcode') || (node.matches?.('.errorcode') ? node.textContent.trim() : '');
            if (/^(?:activityiscurrentlyhidden|activitynotavailable|notavailable)$/.test(code)) return true;
            const text = String(node.textContent || '').replace(/\s+/g, ' ');
            if (/この(?:活動|アクティビティ|課題|小テスト)は(?:現在)?(?:非表示|利用できません|利用不可)/.test(text)
                || /\bthis activity is (?:currently hidden|not (?:currently )?available)\b/i.test(text)) return true;
        }
        return false;
    }

    static unavailableTask(doc, pageURL = doc.URL) {
        let url;
        try { url = new URL(pageURL); } catch { return null; }
        const match = url.pathname.match(/^\/moodle40a\/mod\/(assign|quiz)\/view\.php$/);
        const id = Number(url.searchParams.get('id'));
        const action = url.searchParams.get('action');
        if (url.origin !== 'https://cms7.ict.nitech.ac.jp' || !match || !Number.isSafeInteger(id) || id <= 0
            || action && action !== 'view' || !this.hasTaskDenial(doc)) return null;
        return { type: match[1], id, available: false };
    }

    // Deadline warnings are derived at display time as well as on a detail read.
    static statusAt(status, due, now = Date.now()) {
        if (!["incomplete", "warning", "expired"].includes(status)) return status;
        const deadline = due ? new Date(due).getTime() : NaN;
        if (!Number.isFinite(deadline)) return "incomplete";
        if (deadline < now) return "expired";
        return deadline - now <= 3 * 86400000 ? "warning" : "incomplete";
    }

    // Only a complete detail-page read advances freshness; review/visibility edits do not.
    static detailMetadata(doc, pageURL) {
        const metadata = { fetchedAt: Date.now() };
        const bodyCourse = doc.body?.className?.match(/\bcourse-(\d+)\b/);
        if (bodyCourse && Number(bodyCourse[1]) > 0) {
            metadata.courseId = Number(bodyCourse[1]);
        } else {
            for (const link of doc.querySelectorAll('#page-navbar a[href*="/course/view.php"]')) {
                try {
                    const url = new URL(link.getAttribute("href"), pageURL);
                    const id = Number(url.searchParams.get("id"));
                    if (url.origin === new URL(pageURL).origin
                        && url.pathname === "/moodle40a/course/view.php"
                        && Number.isInteger(id) && id > 0) {
                        metadata.courseId = id;
                        break;
                    }
                } catch { /* Ignore unrelated or malformed navigation links. */ }
            }
        }
        return metadata;
    }

    // Grade ratios occur both as "8 / 10" and "8 out of 10" in Moodle.
    static gradeRatio(text) {
        const match = String(text ?? "").replace(/\u00a0/g, " ")
            .match(/(?:^|[^\d.,-])(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)(?![\d.,])/i);
        if (!match) return null;
        const point = Number(match[1]), maxp = Number(match[2]);
        return Number.isFinite(point) && Number.isFinite(maxp) && maxp > 0 ? { point, maxp } : null;
    }

    static activityDate(kind, doc = document) {
        const rows = [...doc.querySelectorAll(".description-inner div")];
        const startLabel = /^(?:開始(?:日時)?|利用開始|オープン|Opened?|Opens|Available from|Allows submissions from)\s*[:：]/i;
        const dueLabel = /^(?:終了|終了日時|期限|提出期限|締切|Closes?|Closed|Due date|Due)\s*[:：]/i;
        const label = kind === "start" ? startLabel : dueLabel;
        let row = rows.find(item => label.test(item.textContent.trim()));
        // Retain the historical positional fallback for unlabelled date blocks,
        // but never reinterpret an explicitly labelled opening date as a deadline.
        if (!row && !rows.some(item => startLabel.test(item.textContent.trim()) || dueLabel.test(item.textContent.trim()))) {
            const second = doc.querySelector(".description-inner div:nth-child(2)");
            row = second ? (kind === "start" ? rows[0] : second) : kind === "due" ? rows[0] : null;
        }
        if (!row) return null;
        const timestamp = row.querySelector("time[datetime]")?.getAttribute("datetime");
        if (timestamp) {
            const date = new Date(timestamp);
            if (Number.isFinite(date.getTime())) return date;
        }
        return extractDate(row.textContent);
    }

    static callstart(doc = document) { return this.activityDate("start", doc); }
    static calldue(doc = document) { return this.activityDate("due", doc); }
}
