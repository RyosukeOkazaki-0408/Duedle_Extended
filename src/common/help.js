(() => {
    const url = globalThis.DuedleSupport.contactFormUrl;
    if (!url) return;
    const link = document.getElementById("contact-link");
    link.href = url;
    link.hidden = false;
    document.getElementById("contact-pending").hidden = true;
})();

// A link to an item inside a disclosure must reveal the destination.
(() => {
    if (!document.querySelectorAll) return;
    const reveal = () => {
        let id;
        try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
        const target = document.getElementById(id);
        if (!target) return;
        for (let node = target; node; node = node.parentElement) {
            if (node.tagName === "DETAILS") node.open = true;
        }
        target.scrollIntoView({ block: "start" });
    };
    addEventListener("hashchange", reveal);
    reveal();
})();
