(() => {
  const apply = async () => {
    const saved = await ext.storage.local.get(["thememode", "themeDefault", "iosAppearance"]);
    const { mode, iosAppearance } = globalThis.duedleResolveTheme(saved);
    globalThis.duedleApplyTheme(mode, iosAppearance);
  };
  apply().catch(console.error);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => apply().catch(console.error));
  ext.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && (changes.thememode || changes.themeDefault || changes.iosAppearance)) apply().catch(console.error);
  });
})();
