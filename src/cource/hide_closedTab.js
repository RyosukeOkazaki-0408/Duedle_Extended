function hide_tabs() {
  const tabs = document.querySelectorAll(
    ".btn.btn-icon.mr-1.icons-collapse-expand.justify-content-center.stretched-link",
  );
  tabs.forEach((el) => {
    const tab = el.closest(".section.course-section.main.clearfix");
    if (tab) {
      if (show_closed_tabs || !el.classList.contains("collapsed")) {
        tab.style.display = "";
      } else {
        tab.style.display = "none";
      }
    }
  });
}

function save() {
  localStorage.setItem("hide", show_closed_tabs);
}

let show_closed_tabs = localStorage.getItem("hide") !== "false";
globalThis.duedleClosedTabs = Object.freeze({
  getVisible: () => show_closed_tabs,
  openSection(heading) {
    const section = heading?.closest(".section.course-section.main.clearfix");
    if (!section) return;
    section.style.display = "";
    // Let Moodle update the content, accessibility state and saved collapse state.
    section.querySelector(".icons-collapse-expand.collapsed")?.click();
  },
  setVisible(value) {
    show_closed_tabs = value === true;
    save();
    hide_tabs();
    if (typeof scheduleThemeSelector === "function") scheduleThemeSelector();
  }
});
if (typeof scheduleThemeSelector === "function") scheduleThemeSelector();
hide_tabs();

const tabs = document.querySelectorAll(
  ".btn.btn-icon.mr-1.icons-collapse-expand.justify-content-center.stretched-link",
);
tabs.forEach((el) => {
  el.addEventListener("click", () => {
    setTimeout(hide_tabs, 0);
  });
});
