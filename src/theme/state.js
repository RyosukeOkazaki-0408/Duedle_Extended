// Shared by the early page theme, normal Moodle pages, and the syllabus.
(() => {
    if (globalThis.duedleApplyTheme) return;
    globalThis.duedleResolveTheme = (saved = {}) => {
        const value = Number(saved.thememode ?? saved.themeDefault ?? 0);
        return {
            mode: value === 4 ? 0 : value,
            iosAppearance: saved.iosAppearance ?? (value === 4),
        };
    };
    globalThis.duedleApplyTheme = (value, iosAppearance = false) => {
        if (!document.body) return false;
        const { mode } = globalThis.duedleResolveTheme({ thememode: value });
        const dark = mode === 1 || mode === 0 && matchMedia("(prefers-color-scheme: dark)").matches;
        document.body.classList.toggle("darkmode", dark);
        document.body.classList.toggle("honobono", mode === 3);
        document.body.classList.toggle("iosmode", iosAppearance === true);
        return true;
    };
})();
