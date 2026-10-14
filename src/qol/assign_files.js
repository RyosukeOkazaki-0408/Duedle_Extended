(() => {
    const inlineUrl = (href) => {
        const url = new URL(href, location.href);
        url.searchParams.delete("forcedownload");
        return url.href;
    };
    // Remove the explicit download flag for ordinary PDF links.
    document.querySelectorAll("a[href]").forEach((link) => {
        let url;
        try {
            url = new URL(link.href);
        } catch {
            return;
        }
        if (!url.pathname.includes("submission_files") && !link.hasAttribute("download") && /\.pdf$/i.test(url.pathname) && url.searchParams.has("forcedownload")) {
            link.href = inlineUrl(link.href);
        }
    });
    document.addEventListener("click", async event => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const link = target?.closest("a[href]");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
            || event.shiftKey || event.altKey || link.hasAttribute("download")) return;
        const originalURL = link.href;
        let url;
        try { url = new URL(originalURL); } catch { return; }
        // Download-only and unknown formats keep the browser's native handling.
        if (!url.pathname.includes("submission_files") || !["http:", "https:"].includes(url.protocol)
            || !/\.(pdf|jpe?g|png|gif|webp|avif|txt)$/i.test(url.pathname)) return;
        event.preventDefault();
        try {
            const response = await fetch(inlineUrl(originalURL), { credentials: "include" });
            if (!response.ok || response.redirected && /\/(login|auth)\//.test(new URL(response.url).pathname)) {
                throw new Error("Submitted file could not be fetched");
            }
            const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            if (!["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "text/plain"].includes(type)) {
                await response.body?.cancel();
                location.assign(originalURL);
                return;
            }
            const blob = await response.blob();
            const blobURL = URL.createObjectURL(blob);
            // Stay on the assignment while loading; navigate only when ready.
            // A Blob URL avoids Moodle's attachment header without a waiting tab.
            location.assign(blobURL);
            window.setTimeout(() => URL.revokeObjectURL(blobURL), 10 * 60 * 1000);
        } catch (error) {
            console.warn("Duedle: submitted file preview fell back to the Moodle link", error);
            location.assign(originalURL);
        }
    });
})();
