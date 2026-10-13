const syncDarkmode = async () => {
  const { mode, iosAppearance } = await duedleThemeSettingsValue();
  globalThis.duedleApplyTheme(mode, iosAppearance);
  try { colorReload(); } catch (_) {
    //ignore
  }
  // ext.storage.local.set({ history });
};
// Keep one control when Moodle replaces navigation or changes its responsive layout.
let currentThemeMode = 0;
let currentIosAppearance = false;
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
      settings.dataset.taskSettings = "true";
      const summary = document.createElement("summary");
      summary.textContent = "課題の設定";
      settings.appendChild(summary);
      const content = document.createElement("div");
      content.className = "duedle-course-settings-content";
      content.id = "duedle-settings-content";
      settings.appendChild(content);
      const display = document.getElementById("display");
      if (display) display.before(settings);
      else {
        const header = document.querySelector("header");
        if (header) header.after(settings);
        else document.body.prepend(settings);
      }
    }
    const settingsContent = settings.querySelector(".duedle-course-settings-content");
    const controls = [
      document.getElementById("notion"),
      document.getElementById("filter"),
    ];
    for (const node of controls) {
      if (!node) continue;
      const dashboard = node.id === "notion" && document.getElementById("ext_dashboard");
      if (node.id === "notion" && !dashboard) continue;
      const destination = dashboard || settingsContent;
      if (node.parentElement === destination) continue;
      if (!compactSettingsControls.has(node)) {
        const anchor = document.createComment("Duedle original control position");
        node.before(anchor);
        compactSettingsControls.set(node, anchor);
      }
      if (dashboard) dashboard.prepend(node);
      else destination.appendChild(node);
    }
    const hideSettings = !Array.from(settingsContent.children).some(node => !node.hidden);
    if (settings.hidden !== hideSettings) settings.hidden = hideSettings;
  }
  let trigger = document.getElementById("thememode_selection");
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "thememode_selection";
    trigger.className = "btn btn-outline-secondary";
    trigger.title = "Duedle設定";
    trigger.setAttribute("aria-label", "Duedle設定");
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-controls", "duedle-theme-menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => {
      if (themeMenuOpen()) closeThemeMenu();
      else openThemeMenu(trigger);
    });
    trigger.addEventListener("keydown", event => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openThemeMenu(trigger, event.key === "ArrowUp");
      }
    });
  }
  installThemeMenu();
  updateThemeMenu(trigger);
  let control = document.getElementById("duedle-theme-control");
  if (!control) {
    control = document.createElement("span");
    control.id = "duedle-theme-control";
  }
  if (trigger.parentElement !== control) control.appendChild(trigger);
  if (control.parentElement !== host) {
    closeThemeMenu();
    host.appendChild(control);
  }
  if (!phoneSettings && settings) settings.remove();
  if (useNavigation && toolbar) toolbar.remove();
}

const themeModeNames = ["ブラウザと同期", "ダークモード", "ライトモード", "ほのぼのモード"];

function installThemeMenu() {
  if (document.getElementById("duedle-theme-menu")) return;
  const menu = document.createElement("div");
  menu.id = "duedle-theme-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Duedle設定");
  menu.hidden = true;
  // Outside taps are handled below. Native auto-dismiss can close the menu
  // before the trigger's click on iOS, causing that click to reopen it.
  if (typeof menu.showPopover === "function") menu.setAttribute("popover", "manual");
  const modes = document.createElement("div");
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "カラーモード");
  const heading = document.createElement("div");
  heading.className = "duedle-theme-menu-heading";
  heading.textContent = "カラーモード";
  modes.appendChild(heading);
  const createItem = (value, label, role) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duedle-theme-menu-item";
    button.dataset.mode = value;
    button.setAttribute("role", role);
    button.tabIndex = -1;
    const mark = document.createElement("span");
    mark.className = "duedle-theme-menu-mark";
    mark.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "duedle-theme-menu-label";
    text.textContent = label;
    button.append(mark, text);
    button.addEventListener("click", async () => {
      if (value === "closed-tabs") {
        const control = globalThis.duedleClosedTabs;
        if (control) control.setVisible(!control.getVisible());
        updateThemeMenu(document.getElementById("thememode_selection"));
        return;
      }
      if (value === "ios-toggle") currentIosAppearance = !currentIosAppearance;
      else currentThemeMode = Number(value);
      updateThemeMenu(document.getElementById("thememode_selection"));
      if (value !== "ios-toggle") closeThemeMenu(true);
      try {
        await ext.storage.local.set({ thememode: currentThemeMode, iosAppearance: currentIosAppearance });
        await syncDarkmode();
      } catch (error) {
        await reloadThemeSettings();
        console.error(error);
      }
      scheduleThemeSelector();
    });
    return button;
  };
  themeModeNames.forEach((name, mode) => modes.appendChild(createItem(String(mode), name, "menuitemradio")));
  const appearance = document.createElement("div");
  appearance.className = "duedle-theme-menu-appearance";
  appearance.setAttribute("role", "group");
  appearance.setAttribute("aria-label", "表示スタイル");
  const caption = document.createElement("div");
  caption.className = "duedle-theme-menu-heading";
  caption.textContent = "表示スタイル";
  const toggle = createItem("ios-toggle", "iOS風モード", "menuitemcheckbox");
  const state = document.createElement("span");
  state.className = "duedle-theme-menu-state";
  state.setAttribute("aria-hidden", "true");
  toggle.appendChild(state);
  appearance.append(caption, toggle);
  const help = document.createElement("div");
  help.className = "duedle-theme-menu-appearance";
  help.setAttribute("role", "group");
  help.setAttribute("aria-label", "ヘルプ");
  const helpHeading = document.createElement("div");
  helpHeading.className = "duedle-theme-menu-heading";
  helpHeading.textContent = "ヘルプ";
  help.appendChild(helpHeading);
  const helpUrl = ext.runtime.getURL("common/help.html");
  const createLink = (label, url, newTab = false) => {
    const link = document.createElement("a");
    link.className = "duedle-theme-menu-item duedle-theme-menu-link";
    link.setAttribute("role", "menuitem");
    link.tabIndex = -1;
    link.href = url;
    if (newTab) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    const text = document.createElement("span");
    text.className = "duedle-theme-menu-label";
    text.textContent = label;
    link.appendChild(text);
    link.addEventListener("click", () => closeThemeMenu(true));
    link.addEventListener("keydown", event => {
      if (event.key === " ") {
        event.preventDefault();
        link.click();
      }
    });
    return link;
  };
  for (const [label, url] of [
    ["使い方", helpUrl],
    ["お問い合わせ", globalThis.DuedleSupport.contactFormUrl || `${helpUrl}#contact`]
  ]) help.appendChild(createLink(label, url, true));
  menu.append(modes, appearance);
  {
    const course = document.createElement("div");
    course.className = "duedle-theme-menu-appearance";
    course.setAttribute("role", "group");
    course.setAttribute("aria-label", "コース");
    const heading = document.createElement("div");
    heading.className = "duedle-theme-menu-heading";
    heading.textContent = "コース";
    course.append(heading, createLink("コースの並び替え", new URL("/moodle40a/course/mycourse_config/reorder.php", location.origin).href));
    if (location.pathname.endsWith("/course/view.php")) {
      const closedTabs = createItem("closed-tabs", "閉じたタブの表示", "menuitemcheckbox");
      const state = document.createElement("span");
      state.className = "duedle-theme-menu-state";
      state.setAttribute("aria-hidden", "true");
      closedTabs.appendChild(state);
      course.appendChild(closedTabs);
    }
    menu.appendChild(course);
  }
  menu.appendChild(help);
  document.body.appendChild(menu);
  menu.addEventListener("toggle", event => {
    if (event.newState === "closed" && !menu.matches(":popover-open")) {
      menu.hidden = true;
      document.getElementById("thememode_selection")?.setAttribute("aria-expanded", "false");
    }
  });
  menu.addEventListener("keydown", event => {
    const items = [...menu.querySelectorAll('button, a[role="menuitem"]')];
    let index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeThemeMenu(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = items.length - 1;
      else index = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[index].focus();
    } else if (event.key === "Tab") closeThemeMenu(true);
  });
  document.addEventListener("pointerdown", event => {
    if (themeMenuOpen() && !menu.contains(event.target)
      && !document.getElementById("thememode_selection")?.contains(event.target)) closeThemeMenu();
  });
  window.addEventListener("resize", () => closeThemeMenu());
  window.addEventListener("scroll", () => {
    const trigger = document.getElementById("thememode_selection");
    if (themeMenuOpen() && trigger && Math.abs(trigger.getBoundingClientRect().top - Number(menu.dataset.anchorTop)) > 1) closeThemeMenu();
  }, { passive: true });
  window.visualViewport?.addEventListener("resize", () => closeThemeMenu());
}

function themeMenuOpen() {
  const menu = document.getElementById("duedle-theme-menu");
  return Boolean(menu && !menu.hidden);
}

function closeThemeMenu(restoreFocus = false) {
  const menu = document.getElementById("duedle-theme-menu");
  if (!menu || menu.hidden) return;
  if (menu.hasAttribute("popover") && menu.matches(":popover-open")) menu.hidePopover();
  menu.hidden = true;
  const trigger = document.getElementById("thememode_selection");
  trigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger?.focus({ preventScroll: true });
}

function openThemeMenu(trigger, last = false) {
  const menu = document.getElementById("duedle-theme-menu");
  menu.hidden = false;
  if (menu.hasAttribute("popover")) menu.showPopover();
  const rect = trigger.getBoundingClientRect();
  menu.dataset.anchorTop = String(rect.top);
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const right = left + (viewport?.width || innerWidth), bottom = top + (viewport?.height || innerHeight);
  menu.style.maxWidth = `${Math.max(0, right - left - 16)}px`;
  menu.style.maxHeight = `${Math.max(0, bottom - top - 16)}px`;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(left + 8, Math.min(rect.right - bounds.width, right - bounds.width - 8))}px`;
  const below = rect.bottom + 6;
  menu.style.top = `${Math.max(top + 8, Math.min(below + bounds.height <= bottom - 8 ? below : rect.top - bounds.height - 6, bottom - bounds.height - 8))}px`;
  trigger.setAttribute("aria-expanded", "true");
  const items = menu.querySelectorAll('button, a[role="menuitem"]');
  (last ? items[items.length - 1] : menu.querySelector('[role="menuitemradio"][aria-checked="true"]') || items[0]).focus({ preventScroll: true });
}

function updateThemeMenu(trigger) {
  if (!trigger) return;
  const label = "Duedle設定";
  if (trigger.textContent !== label) trigger.textContent = label;
  trigger.value = String(currentThemeMode);
  const appearance = String(currentIosAppearance);
  if (trigger.dataset.iosAppearance !== appearance) trigger.dataset.iosAppearance = appearance;
  document.querySelectorAll("#duedle-theme-menu button").forEach(item => {
    const closedTabs = item.dataset.mode === "closed-tabs";
    if (closedTabs) item.disabled = !globalThis.duedleClosedTabs;
    const checked = closedTabs ? globalThis.duedleClosedTabs?.getVisible() === true
      : item.dataset.mode === "ios-toggle" ? currentIosAppearance : Number(item.dataset.mode) === currentThemeMode;
    if (item.getAttribute("aria-checked") !== String(checked)) item.setAttribute("aria-checked", String(checked));
    const state = item.querySelector(".duedle-theme-menu-state");
    if (state) {
      const text = checked ? "ON" : "OFF";
      if (state.textContent !== text) state.textContent = text;
    }
  });
}

function scheduleThemeSelector() {
  if (themeSelectorFrame) return;
  themeSelectorFrame = window.requestAnimationFrame(() => {
    themeSelectorFrame = 0;
    installThemeSelector();
  });
}

async function reloadThemeSettings() {
  const { mode, iosAppearance } = await duedleThemeSettingsValue();
  currentThemeMode = Number(mode);
  currentIosAppearance = iosAppearance === true;
  const select = document.getElementById("thememode_selection");
  if (select) updateThemeMenu(select);
  await syncDarkmode();
}

(async () => {
  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  await reloadThemeSettings();
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
    if (area !== "local" || (!changes.thememode && !changes.themeDefault && !changes.iosAppearance)) return;
    reloadThemeSettings().then(scheduleThemeSelector).catch(console.error);
  });
})().catch(console.error);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncDarkmode);

function isBrowserDarkMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
