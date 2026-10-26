// SCORM's same-origin wrapper is a separate document, so page CSS cannot reach
// its white canvas. Theme only that canvas, without editing teaching content.
(() => {
    if (location.pathname !== "/moodle40a/mod/scorm/player.php" || !document.body) return;
    const registered = new WeakSet();
    const styleId = "duedle-scorm-canvas-theme";
    const neutral = (value, light) => {
        const channels = String(value).match(/[\d.]+/g)?.map(Number);
        if (!channels || channels.length < 3) return false;
        if (channels.length === 4 && channels[3] === 0) return light;
        return Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) < 25
            && (light ? Math.min(...channels.slice(0, 3)) >= 220 : Math.max(...channels.slice(0, 3)) <= 100);
    };
    const sync = frame => {
        if (!frame.isConnected) return;
        let doc;
        try {
            doc = frame.contentDocument;
            if (!doc?.head || !doc.body || new URL(doc.URL).origin !== location.origin
                || !new URL(doc.URL).pathname.startsWith("/moodle40a/")) return;
        } catch { return; } // External teaching services keep their own origin/security rules.
        let style = doc.getElementById(styleId);
        if (!document.body.classList.contains("darkmode")) {
            style?.remove();
            return;
        }
        // Read author styles without measuring our own previous dark palette.
        if (style) style.disabled = true;
        const rootStyle = doc.defaultView.getComputedStyle(doc.documentElement);
        const bodyStyle = doc.defaultView.getComputedStyle(doc.body);
        const ios = document.body.classList.contains("iosmode");
        const background = ios ? "#000000" : "#1d2831";
        const color = ios ? "#f2f2f7" : "#dddddf";
        const rules = [];
        // Keep authored background images and colored canvases intact. Nested
        // images, videos, panels and foreign iframes are never selected here.
        if (rootStyle.backgroundImage === "none" && bodyStyle.backgroundImage === "none") {
            if (neutral(rootStyle.backgroundColor, true)) rules.push(`html { background-color: ${background} !important; }`);
            if (neutral(bodyStyle.backgroundColor, true)) {
                rules.push(`body { background-color: ${background} !important;${neutral(bodyStyle.color, false) ? ` color: ${color} !important;` : ""} }`);
            }
        }
        if (style) style.disabled = false;
        if (!rules.length) { style?.remove(); return; }
        if (!style) {
            style = doc.createElement("style");
            style.id = styleId;
            doc.head.appendChild(style);
        }
        const css = rules.join("\n");
        if (style.textContent !== css) style.textContent = css;
    };
    const refresh = () => {
        document.querySelectorAll("iframe#scorm_object").forEach(frame => {
            if (!registered.has(frame)) {
                registered.add(frame);
                frame.addEventListener("load", () => sync(frame));
            }
            sync(frame);
        });
    };
    let pending = false;
    new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; refresh(); });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    refresh();
})();
