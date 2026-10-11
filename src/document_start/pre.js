(() => {
    if (globalThis.duedleInitialTheme) return;
    const api = globalThis.browser ?? globalThis.chrome;
    globalThis.duedleInitialTheme = (async () => {
        try {
            const reply = await api.runtime.sendMessage({ type: "GET_SETTINGS" });
            if (reply?.ok) return globalThis.duedleResolveTheme(reply);
        } catch { /* Existing background versions may not know GET_SETTINGS yet. */ }
        const saved = await api.storage.local.get(["thememode", "themeDefault", "iosAppearance"]);
        return globalThis.duedleResolveTheme(saved);
    })().catch(() => globalThis.duedleResolveTheme());
    globalThis.duedleThemeSettingsValue = async () => {
        const saved = await api.storage.local.get(["thememode", "themeDefault", "iosAppearance"]);
        return Object.keys(saved).length ? globalThis.duedleResolveTheme(saved) : await globalThis.duedleInitialTheme;
    };
    const ready = document.readyState === "loading"
        ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
        : Promise.resolve();
    globalThis.duedleInitialTheme.then(({ mode, iosAppearance }) => {
        const apply = () => globalThis.duedleApplyTheme(mode, iosAppearance);
        if (!apply()) {
            const observer = new MutationObserver(() => { if (apply()) observer.disconnect(); });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    });
    Promise.all([ready, globalThis.duedleInitialTheme]).then(() => {
        document.documentElement.style.opacity = "1";
    });
})();
