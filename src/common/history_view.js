(async () => {
    const column = document.querySelector(".columnleft");
    if (!(column instanceof HTMLElement) || document.getElementById("mybox001")) return;
    const stored = (await ext.storage.local.get("history")).history;
    const history = Array.isArray(stored) ? stored : [];
    const section = document.createElement("section");
    section.id = "mybox001";
    section.classList.add("block_html", "block", "card", "mb-3");
    section.setAttribute("aria-label", "最近開いたページ");
    const details = document.createElement("details");
    details.classList.add("card-body", "p-3", "duedle-history");
    const summary = document.createElement("summary");
    summary.textContent = "最近開いたページ";
    summary.classList.add("duedle-history-title");
    details.appendChild(summary);
    const list = document.createElement("ul");
    list.classList.add("duedle-history-list");
    history.slice().reverse().forEach((entry) => {
        if (!entry || typeof entry.title !== "string" || typeof entry.url !== "string") return;
        let url;
        try {
            url = new URL(entry.url, location.href);
        } catch {
            return;
        }
        if (!["https:", "http:"].includes(url.protocol)) return;
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = url.href;
        link.textContent = entry.title;
        item.appendChild(link);
        list.appendChild(item);
    });
    details.appendChild(list);
    section.appendChild(details);
    column.prepend(section);
    const compact = window.matchMedia("(max-width: 767px)");
    const setLayout = () => { details.open = !compact.matches; };
    setLayout();
    compact.addEventListener("change", setLayout);
})();
