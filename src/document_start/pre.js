(() => {
    if (globalThis.duedleInitialTheme) return;
    const api = globalThis.browser ?? globalThis.chrome;
    globalThis.duedleInitialTheme = (async () => {
        try {
            const reply = await api.runtime.sendMessage({ type: "GET_SETTINGS" });
            if (reply?.ok) return reply.thememode ?? reply.themeDefault ?? 0;
        } catch { /* Existing background versions may not know GET_SETTINGS yet. */ }
        const saved = await api.storage.local.get(["thememode", "themeDefault"]);
        return saved.thememode ?? saved.themeDefault ?? 0;
    })().catch(() => 0);
    globalThis.duedleThemeValue = async () => {
        const saved = await api.storage.local.get(["thememode", "themeDefault"]);
        return saved.thememode ?? saved.themeDefault ?? await globalThis.duedleInitialTheme;
    };
    const ready = document.readyState === "loading"
        ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
        : Promise.resolve();
    globalThis.duedleInitialTheme.then(mode => {
        const apply = () => {
            if (!document.body) return false;
            document.body.classList.toggle("darkmode", mode == 1 || mode == 0 && matchMedia("(prefers-color-scheme: dark)").matches);
            document.body.classList.toggle("honobono", mode == 3);
            return true;
        };
        if (!apply()) {
            const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    });
    Promise.all([ready, globalThis.duedleInitialTheme]).then(() => {
        document.documentElement.style.opacity = "1";
    });
})();
