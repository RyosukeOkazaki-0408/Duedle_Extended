(() => {
    const column = document.querySelector(".columnright");
    const pageContent = document.querySelector("#page-content");
    if (!column || !pageContent || document.getElementById("notion")) return;
    const nav = document.createElement("nav");
    nav.id = "notion";
    nav.classList.add("card-body", "p-3", "block", "card", "mb-3");
    nav.setAttribute("aria-label", "セクション一覧");
    column.classList.add("has-blocks");
    column.appendChild(nav);
    pageContent.classList.add("blocks-post");
    const details = document.createElement("details");
    details.classList.add("duedle-section-details");
    const summary = document.createElement("summary");
    summary.classList.add("card-title", "duedle-section-title");
    summary.textContent = "セクション一覧";
    details.appendChild(summary);
    const links = document.createElement("div");
    links.classList.add("card-text", "content", "mt-2", "duedle-section-links");
    details.appendChild(links);
    nav.appendChild(details);
    const pageUrl = new URL(location.href);
    pageUrl.hash = "";
    const addLink = (text, id) => {
        const link = document.createElement("a");
        link.classList.add("notionnavlink");
        link.title = text;
        link.textContent = text;
        const target = new URL(pageUrl.href);
        target.hash = id;
        link.href = target.href;
        link.addEventListener("click", event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            globalThis.duedleClosedTabs?.openSection(document.getElementById(id));
        });
        links.appendChild(link);
    };
    addLink("▲トップへ戻る", "page-wrapper");
    Array.from(document.querySelectorAll("h3.sectionname")).forEach((section, index) => {
        if (!section.id) section.id = `duedle-section-${index}`;
        addLink(section.textContent.trim(), section.id);
    });
    const compact = window.matchMedia("(max-width: 767px)");
    const setLayout = () => { details.open = !compact.matches; };
    setLayout();
    compact.addEventListener("change", setLayout);
})();
