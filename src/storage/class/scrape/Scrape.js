class Scrape {
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

    //return start
    static callstart(doc = document) {
        try {
            const temp = doc.querySelector(".description-inner div:nth-child(2)").textContent.trim();
            const start = doc.querySelector(".description-inner div").textContent.trim();
            return extractDate(start);
        } catch (error) {
            try {
                const start = doc.querySelector(".description-inner div").textContent.trim();
                if (start.includes("始")) {
                    return extractDate(start);
                } else {
                    return null;
                }
            } catch {
                return null;
            }
            // 開始日時が見つからない場合はnullを返す
        }
    }
    //return due
    static calldue(doc = document) {
        try {
            const dueraw = doc.querySelector(".description-inner div:nth-child(2)").textContent.trim();
            return extractDate(dueraw);
        } catch (error) {
            try {
                const dueraw = doc.querySelector(".description-inner div").textContent.trim();
                if (!dueraw.includes("始")) {
                    return extractDate(dueraw);
                } else {
                    return null;
                }

            } catch (error) {
                return null;
            }
        }
    }

    


}
