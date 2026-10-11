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
// Keep one control when Moodle replaces navigation or changes its responsive layout.
let currentThemeMode = 0;
let themeSelectorReady = false;
let themeSelectorFrame = 0;
const compactSettingsControls = new Map();

function restoreSettingsControls() {
  for (const [node, anchor] of compactSettingsControls) {
    if (anchor.parentNode) anchor.replaceWith(node);
  }
  compactSettingsControls.clear();
}

function installThemeSelector() {
  if (!themeSelectorReady || !document.body) return;
  const phoneSettings = window.matchMedia("(max-width: 599px)").matches &&
    (location.pathname.endsWith("/course/view.php") || Boolean(document.getElementById("ext_dashboard")));
  if (!phoneSettings) restoreSettingsControls();
  const navigation = document.getElementById("usernavigation");
  const useNavigation = !window.matchMedia("(max-width: 599px)").matches && navigation &&
    navigation.getClientRects().length > 0 &&
    window.getComputedStyle(navigation).visibility !== "hidden";
  let toolbar = document.getElementById("duedle-theme-toolbar");
  let host = useNavigation ? navigation : toolbar;
  if (!host) {
    toolbar = document.createElement("div");
    toolbar.id = "duedle-theme-toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Duedleのテーマ");
    // Normal document flow avoids covering links or fighting Safari's toolbars.
    host = toolbar;
  }
  if (!useNavigation) {
    const dashboard = document.getElementById("ext_dashboard");
    const header = document.querySelector("header");
    const main = document.querySelector("#region-main");
    if (header) {
      if (header.previousElementSibling !== toolbar) header.before(toolbar);
    } else if (dashboard) {
      if (toolbar.nextElementSibling !== dashboard) dashboard.before(toolbar);
    } else if (main) {
      if (main.firstElementChild !== toolbar) main.prepend(toolbar);
    } else if (document.body.firstElementChild !== toolbar) {
      document.body.prepend(toolbar);
    }
  }
  let settings = document.getElementById("duedle-course-settings");
  if (phoneSettings) {
    if (!settings) {
      settings = document.createElement("details");
      settings.id = "duedle-course-settings";
      settings.dataset.taskSettings = String(!location.pathname.endsWith("/course/view.php"));
      const summary = document.createElement("summary");
      summary.textContent = location.pathname.endsWith("/course/view.php") ? "コースの設定" : "課題の設定";
      const content = document.createElement("div");
      content.className = "duedle-course-settings-content";
      content.id = "duedle-settings-content";
      settings.append(summary, content);
      const display = document.getElementById("display");
      if (display) display.before(settings);
      else {
        const header = document.querySelector("header");
        if (header) header.after(settings);
        else document.body.prepend(settings);
      }
    }
    const hideSettings = settings.dataset.taskSettings === "true" && document.getElementById("display")?.hidden === true;
    if (settings.hidden !== hideSettings) settings.hidden = hideSettings;
    const settingsContent = settings.querySelector(".duedle-course-settings-content");
    const controls = [
      document.getElementById("toggle_visible_form"),
      document.getElementById("notion"),
      document.getElementById("filter"),
    ];
    for (const node of controls) {
      if (!node || node.parentElement === settingsContent) continue;
      const anchor = document.createComment("Duedle original control position");
      node.before(anchor);
      compactSettingsControls.set(node, anchor);
      settingsContent.appendChild(node);
    }
  }
  let select = document.getElementById("thememode_selection");
  if (!select) {
    select = document.createElement("select");
    select.id = "thememode_selection";
    select.className = "btn btn-outline-secondary dropdown-toggle icon-no-margin";
    select.title = "テーマの設定";
    select.setAttribute("aria-label", "テーマの設定");
    ["🔄ブラウザと同期", "🌙ダークモード", "☀ライトモード", "ほのぼのモード"].forEach((text, value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = String(currentThemeMode);
    select.addEventListener("change", async (event) => {
      currentThemeMode = Number(event.target.value);
      await ext.storage.local.set({ thememode: currentThemeMode });
      await syncDarkmode();
      scheduleThemeSelector();
    });
  }
  let control = document.getElementById("duedle-theme-control");
  if (!control) {
    control = document.createElement("span");
    control.id = "duedle-theme-control";
    const icon = document.createElement("span");
    icon.className = "duedle-theme-icon";
    icon.setAttribute("aria-hidden", "true");
    control.appendChild(icon);
  }
  if (select.parentElement !== control) control.appendChild(select);
  if (control.parentElement !== host) host.appendChild(control);
  const themeIcon = control.querySelector(".duedle-theme-icon");
  const iconText = ["🔄", "🌙", "☀️", "🌿"][currentThemeMode] || "🔄";
  if (themeIcon.textContent !== iconText) themeIcon.textContent = iconText;
  if (!phoneSettings && settings) settings.remove();
  if (useNavigation && toolbar) toolbar.remove();
}

function scheduleThemeSelector() {
  if (themeSelectorFrame) return;
  themeSelectorFrame = window.requestAnimationFrame(() => {
    themeSelectorFrame = 0;
    installThemeSelector();
  });
}

(async () => {
  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  currentThemeMode = Number(await duedleThemeValue());
  themeSelectorReady = true;
  await syncDarkmode();
  const observer = new MutationObserver(scheduleThemeSelector);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });
  installThemeSelector();
  window.addEventListener("resize", scheduleThemeSelector);
  window.addEventListener("pageshow", scheduleThemeSelector);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes.thememode && !changes.themeDefault)) return;
    duedleThemeValue().then(async (mode) => {
      currentThemeMode = Number(mode);
      const select = document.getElementById("thememode_selection");
      if (select) select.value = String(currentThemeMode);
      await syncDarkmode();
      scheduleThemeSelector();
    }).catch(console.error);
  });
})().catch(console.error);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncDarkmode);

function isBrowserDarkMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
