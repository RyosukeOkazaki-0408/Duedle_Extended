const syncDarkmode = async () => {
  //0:sync
  //1:darkmode, 2:light, 3:honobono
  let thememode = await duedleThemeValue();
  let shouldBeDarkmode =
    (thememode == 0 && isBrowserDarkMode()) || thememode == 1;
  if (shouldBeDarkmode) {
    console.log("darkmode power on");
    document.body.classList.add("darkmode");
    document.body.classList.remove("honobono");
    const colored_tr = document.querySelectorAll('tr[bgcolor="lightblue"]');
    console.log(colored_tr);
    colored_tr.forEach((e) => {
      e.setAttribute("bgcolor", "#363f45");
      e.style.color = "white";
    });
  } else if (thememode == 3) {
    try {
      document.body.classList.remove("darkmode");
      document.body.classList.add("honobono");
    } catch (_) {
      //エラー無視
    }
  } else {
    try {
      document.body.classList.remove("darkmode");
      document.body.classList.remove("honobono");
    } catch (_) {
      //エラー無視
    }
  }
  try { colorReload(); } catch (_) {
    //ignore
  }
  // ext.storage.local.set({ history });
};
syncDarkmode();
(async () => {
  currentThemeMode = await duedleThemeValue();
  const usernavigationObserver = new MutationObserver(() => {
    installThemeSelector();
  });
  usernavigationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  installThemeSelector();
})();

let currentThemeMode = 0;

function installThemeSelector() {
  const usernavigation = document.getElementById("usernavigation");
  if (!usernavigation || document.getElementById("thememode_selection")) return;

  usernavigation.insertAdjacentHTML(
    "beforeend",
    `
      <select title="テーマの設定" id="thememode_selection" class="btn btn-outline-secondary dropdown-toggle icon-no-margin">
        <option value="0" ${currentThemeMode === 0 ? "selected" : ""}>🔄ブラウザと同期</option>
        <option value="1" ${currentThemeMode === 1 ? "selected" : ""}>🌙ダークモード</option>
        <option value="2" ${currentThemeMode === 2 ? "selected" : ""}>☀ライトモード</option>
        <option value="3" ${currentThemeMode === 3 ? "selected" : ""}>ほのぼのモード</option>
      </select>
    `,
  );
  document
    .getElementById("thememode_selection")
    .addEventListener("change", async (e) => {
      currentThemeMode = Number(e.target.value);
      await ext.storage.local.set({ thememode: currentThemeMode });
      await syncDarkmode();
    });
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncDarkmode);

function isBrowserDarkMode() {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}
