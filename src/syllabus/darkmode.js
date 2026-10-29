(() => {
  // Theme preferences are shared, not account data. Never wait for Moodle's
  // user identity on a standalone syllabus (which has no user navigation).
  const api = globalThis.browser ?? globalThis.chrome;
  const bodyReady = document.body ? Promise.resolve() : new Promise(resolve => {
    const observer = new MutationObserver(() => {
      if (document.body) { observer.disconnect(); resolve(); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  const apply = async () => {
    const saved = await api.storage.local.get(["thememode", "themeDefault", "iosAppearance"]);
    const { mode, iosAppearance } = globalThis.duedleResolveTheme(saved);
    await bodyReady;
    globalThis.duedleApplyTheme(mode, iosAppearance);
  };
  // pre.js handles the first paint at document_start; later changes use the
  // native API too, so absent account markup cannot delay theme updates.
  globalThis.duedleInitialTheme.catch(console.error);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => apply().catch(console.error));
  api.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && (changes.thememode || changes.themeDefault || changes.iosAppearance)) apply().catch(console.error);
  });
})();
