// Keep this allowlist aligned with manifest.json. Never accept an arbitrary host
// from page content: background messages must pass the same allowlist.
globalThis.DuedleSites = {
    production: "https://cms7.ict.nitech.ac.jp",
    origins: ["https://cms7.ict.nitech.ac.jp", "https://duedle-35-184-191-167.sslip.io"],
    allowed(value) {
        try {
            const url = new URL(value);
            return this.origins.includes(url.origin) && url.pathname.startsWith("/moodle40a/");
        } catch { return false; }
    },
    origin(value = globalThis.location?.href) {
        return this.allowed(value) ? new URL(value).origin : this.production;
    },
    root(value = globalThis.location?.href) {
        return this.origin(value) + "/moodle40a/";
    },
    accountKey(user, value) {
        if (!user) return null;
        const origin = this.origin(value);
        // Preserve university users' existing cache/archive keys.
        return origin === this.production ? user : origin + ":" + user;
    }
};
