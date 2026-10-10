(() => {
    const inlineUrl = (href) => {
        const url = new URL(href, location.href);
        url.searchParams.delete("forcedownload");
        return url.href;
    };
    document.querySelectorAll("a[href]").forEach((link) => {
        let url;
        try {
            url = new URL(link.href);
        } catch {
            return;
        }
        if (!url.pathname.includes("submission_files") && /\.pdf$/i.test(url.pathname) && url.searchParams.has("forcedownload")) {
            link.href = inlineUrl(link.href);
        }
    });
    document.addEventListener("click", async (event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const link = target?.closest("a[href]");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute("download")) return;
        let sourceUrl;
        try {
            sourceUrl = new URL(link.href);
        } catch {
            return;
        }
        if (!sourceUrl.pathname.includes("submission_files") || !["http:", "https:"].includes(sourceUrl.protocol)) return;
        const previewUrl = inlineUrl(link.href);
        // Open while the tap/click still has user activation. Safari blocks window.open after await.
        const preview = window.open("about:blank", "_blank");
        event.preventDefault();
        if (!preview) {
            location.assign(previewUrl);
            return;
        }
        preview.opener = null;
        preview.document.title = "提出ファイルを開いています";
        preview.document.body.textContent = "提出ファイルを開いています…";
        try {
            const response = await fetch(previewUrl, { credentials: "include" });
            if (!response.ok || (response.redirected && new URL(response.url).pathname.includes("login"))) {
                throw new Error("Submitted file could not be fetched");
            }
            const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            const inlineTypes = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "text/plain"];
            if (!inlineTypes.includes(contentType)) {
                // Let Safari handle downloads and file formats without a built-in preview.
                if (!preview.closed) preview.location.replace(previewUrl);
                return;
            }
            const blob = await response.blob();
            if (preview.closed) return;
            const blobUrl = URL.createObjectURL(blob);
            preview.location.replace(blobUrl);
            // Keep the URL available for the viewer's download action, then release its memory.
            window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60 * 1000);
        } catch (error) {
            console.warn("Duedle: submitted file preview fell back to the Moodle link", error);
            if (!preview.closed) preview.location.replace(previewUrl);
        }
    });
})();
