(() => {
    const url = globalThis.DuedleSupport.contactFormUrl;
    if (!url) return;
    const link = document.getElementById("contact-link");
    link.href = url;
    link.hidden = false;
    document.getElementById("contact-pending").hidden = true;
})();
