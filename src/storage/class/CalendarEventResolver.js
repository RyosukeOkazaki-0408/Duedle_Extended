// Resolve the IDs used by Moodle's upcoming block via its read-only event API.
// https://github.com/moodle/moodle/blob/MOODLE_400_STABLE/calendar/externallib.php
class CalendarEventResolver {
    constructor() {
        this.cache = new Map();
        this.pending = null;
        this.controller = null;
        this.retryAt = 0;
    }
    clear() {
        this.controller?.abort();
        this.cache.clear();
        this.retryAt = 0;
    }
    async resolve(doc, known = {}) {
        if (this.pending) return this.pending;
        this.pending = this.read(doc, known).finally(() => { this.pending = null; });
        return this.pending;
    }
    async read(doc, known) {
        const ids = new Set();
        for (const link of doc.querySelectorAll('.event a[data-type="event"][data-action="view-event"][data-event-id]')) {
            try {
                const url = new URL(link.getAttribute('href'), location.href);
                const id = AutoRefreshCollector.positiveId(link.dataset.eventId);
                if (id && url.origin === (globalThis.DuedleSites?.origin() ?? "https://cms7.ict.nitech.ac.jp")
                    && url.pathname === '/moodle40a/calendar/view.php') ids.add(id);
            } catch { /* Ignore unrelated links. */ }
        }
        const refs = new Map();
        const missing = [];
        for (const id of ids) {
            const cached = this.cache.get(id);
            const entry = known?.[id];
            const key = /^(assign|quiz):([1-9]\d*)$/.exec(entry?.key || '');
            if (cached && Date.now() - cached.at < 30 * 60000) refs.set(id, cached.ref);
            else if (key && entry.seenAt <= Date.now() && entry.seenAt > Date.now() - 30 * 86400000) {
                const ref = AutoRefreshCollector.taskRef(key[1], key[2]);
                if (ref) refs.set(id, ref);
                else missing.push(id);
            } else missing.push(id);
        }
        if (!missing.length || Date.now() < this.retryAt || globalThis.duedleAccountActive === false) return refs;
        const sesskey = AutoRefreshCollector.findSesskey(doc);
        if (!sesskey) return refs;
        const controller = new AbortController();
        this.controller = controller;
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            // Bound requests and response sizes; no title matching or arbitrary methods.
            for (let start = 0; start < Math.min(missing.length, 100); start += 20) {
                if (controller.signal.aborted || globalThis.duedleAccountActive === false) break;
                const batch = missing.slice(start, start + 20);
                const method = 'core_calendar_get_calendar_event_by_id';
                const response = await fetch(AutoRefreshCollector.baseURL + 'lib/ajax/service.php?sesskey='
                    + encodeURIComponent(sesskey) + '&info=' + method + '&nosessionupdate=true', {
                    method: 'POST', credentials: 'include', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch.map((eventid, index) => ({ index, methodname: method, args: { eventid } })))
                });
                if (!response.ok || response.redirected) throw new Error('Event lookup failed');
                const payload = await response.json();
                if (!Array.isArray(payload) || payload.length !== batch.length) throw new Error('Invalid event response');
                if (controller.signal.aborted || globalThis.duedleAccountActive === false) break;
                payload.forEach((entry, index) => {
                    const event = entry?.data?.event;
                    if (entry?.error || entry?.exception || Number(event?.id) !== batch[index]) {
                        this.retryAt = Date.now() + 60000;
                        return;
                    }
                    const ref = AutoRefreshCollector.eventRef(event);
                    if (!ref && ['assign', 'quiz'].includes(event.modulename)) {
                        this.retryAt = Date.now() + 60000;
                        return;
                    }
                    // null means a confirmed non-task event, never an unvisited task.
                    refs.set(batch[index], ref);
                    this.cache.set(batch[index], { ref, at: Date.now() });
                });
            }
        } catch {
            this.retryAt = Date.now() + 60000;
        } finally {
            clearTimeout(timer);
            if (this.controller === controller) this.controller = null;
        }
        return refs;
    }
}
