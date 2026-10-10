// Focused interaction regressions without browser or npm dependencies.
// Run from the repository root: node tests/ui-regression.js or jsc tests/ui-regression.js
// These DOM doubles verify interactions; real Safari layout still needs Moodle access.

const runningInNode = typeof require === "function";
const readSource = runningInNode
    ? (path) => require("fs").readFileSync(path, "utf8")
    : globalThis.readFile;
const log = runningInNode ? console.log.bind(console) : globalThis.print;

class MockNode {
    constructor(tag, text = "") {
        this.tagName = tag;
        this.textContent = text;
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.attributes = {};
        this.captured = new Set();
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => this.classes.add(name)),
            remove: (...names) => names.forEach((name) => this.classes.delete(name))
        };
    }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, before) {
        if (child.parentNode) {
            child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
            // WebKit can clear pointer capture when the captured grip's ancestor moves.
            child.querySelectorAll("button").forEach((grip) => grip.captured.clear());
        }
        const index = before ? this.children.indexOf(before) : this.children.length;
        if (index < 0) throw new Error("Invalid insertBefore");
        this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }
    get firstChild() { return this.children[0] || null; }
    get parentElement() { return this.parentNode; }
    get nextSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
    }
    get className() { return [...this.classes].join(" "); }
    set className(value) { this.classes = new Set(String(value).split(" ").filter(Boolean)); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
    emit(name, data = {}) {
        const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...data };
        (this.listeners[name] || []).forEach((handler) => handler(event));
        return event;
    }
    focus() { document.activeElement = this; }
    scrollIntoView() { this.scrolledIntoView = true; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) {
        this.captured.delete(id);
        this.emit("lostpointercapture", { pointerId: id });
    }
    closest(selector) {
        const names = selector.split(",").map((name) => name.trim());
        for (let node = this; node; node = node.parentNode) if (names.includes(node.tagName)) return node;
        return null;
    }
    matches(selector) {
        if (selector.includes(",")) return selector.split(",").some((part) => this.matches(part.trim()));
        if (selector === "[id]") return !!this.attributes.id;
        if (selector === 'input[type="checkbox"]') return this.tagName === "input" && this.type === "checkbox";
        if (selector.startsWith("input:not")) return this.tagName === "input" && !["checkbox", "radio"].includes(this.type);
        return this.tagName === selector;
    }
    querySelectorAll(selector) {
        const results = [];
        const visit = (node) => node.children.forEach((child) => {
            if (child.matches(selector)) results.push(child);
            visit(child);
        });
        visit(this);
        return results;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
        if (this === scrollContainer) return { top: 20, bottom: 200, left: 20, width: 320, height: 180 };
        if (this.tagName === "tr") {
            const visible = this.parentNode.children.filter((row) => row.style.display !== "none");
            const inset = scrollContainer.style.overflowY === "auto" ? 20 : 0;
            return { top: inset + visible.indexOf(this) * 50 - scrollY - scrollContainer.scrollTop, left: 20, width: 320, height: 50 };
        }
        const row = this.closest("tr");
        const rect = row ? row.getBoundingClientRect() : { top: 0, height: 0 };
        return { ...rect, left: 20, width: this.style.display === "none" ? 0 : 100 };
    }
    cloneNode(deep) {
        const clone = new MockNode(this.tagName, this.textContent);
        clone.style = { ...this.style };
        clone.attributes = { ...this.attributes };
        clone.className = this.className;
        clone.type = this.type;
        if (deep) this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
        return clone;
    }
    remove() {
        if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
        this.parentNode = null;
    }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
let scrollY = 0;
let sequence = 0;
const timers = new Map();
const frames = new Map();
const scrolls = [];
const scrollContainer = new MockNode("div");
scrollContainer.scrollTop = 0;
const table = new MockNode("table");
scrollContainer.appendChild(table);
const container = new MockNode("tbody");
table.appendChild(container);
const header = new MockNode("tr");
header.appendChild(new MockNode("th", "Order"));
container.appendChild(header);
const rows = ["A", "B", "C", "D", "E", "F"].map((name) => {
    const row = new MockNode("tr");
    row.name = name;
    const orderCell = new MockNode("td");
    const input = new MockNode("input");
    input.type = "text";
    input.value = name;
    row.orderInput = input;
    orderCell.appendChild(input);
    const courseCell = new MockNode("td");
    courseCell.appendChild(new MockNode("a", name));
    const visibilityCell = new MockNode("td");
    const checkbox = new MockNode("input");
    checkbox.type = "checkbox";
    checkbox.checked = name === "C";
    row.visibility = checkbox;
    visibilityCell.appendChild(checkbox);
    row.appendChild(orderCell);
    row.appendChild(courseCell);
    row.appendChild(visibilityCell);
    container.appendChild(row);
    return row;
});
const actions = new MockNode("p");
actions.appendChild(new MockNode("button", "Cancel"));
actions.appendChild(new MockNode("input", "Save"));
const documentMock = new MockNode("document");
documentMock.body = new MockNode("body");
documentMock.createElement = (tag) => new MockNode(tag);
documentMock.querySelectorAll = () => [];
documentMock.querySelector = (selector) => {
    if (selector.includes("table > tbody")) return container;
    if (selector === 'p[align="center"]') return actions;
    return null;
};
globalThis.document = documentMock;
globalThis.window = {
    innerHeight: 300,
    listeners: {},
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollBy(_x, amount) { scrolls.push(amount); scrollY = Math.max(0, Math.min(50, scrollY + amount)); },
    getComputedStyle(node) { return { overflowY: node.style.overflowY || "visible", font: "16px sans-serif", color: "rgb(30, 30, 30)", backgroundColor: "rgb(255, 255, 255)" }; }
};
function fireHold() {
    for (const [id, timer] of [...timers]) if (timer.delay === 350) { timers.delete(id); timer.callback(); }
}
function frame() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
}
function order() { return container.children.slice(1).map((row) => row.name).join(); }
function visibleOrder() { return container.children.slice(1).filter((row) => row.style.display !== "none").map((row) => row.name).join(); }
function values() { return rows.map((row) => row.orderInput.value).join(); }
const originalOrder = "A,B,C,D,E,F";
eval(readSource("src/common/change_order_freely.js"));
const grip = (row) => row.querySelector("button");
const point = (type, y, extras = {}) => ({ pointerType: type, pointerId: 7, isPrimary: true, button: 0, clientX: 35, clientY: y, ...extras });
assert(rows[2].style.display === "none", "Hidden courses stay hidden");
assert(rows.every((row) => row.querySelectorAll("button").length === 1), "Each row has one grip, without step buttons");
assert(rows[0].listeners.pointerdown === undefined, "Whole-row touch does not suppress scrolling");
assert(grip(rows[0]).type === "button", "Grip cannot submit the form");
const a = grip(rows[0]);
a.emit("pointerdown", point("touch", 75));
a.emit("pointerup", point("touch", 75));
fireHold();
assert(order() === originalOrder && document.body.children.length === 0, "A short tap never starts a drag");
a.emit("pointerdown", point("touch", 75));
a.emit("pointermove", point("touch", 95));
fireHold();
assert(order() === originalOrder && document.body.children.length === 0 && !a.hasPointerCapture(7), "Moving before the hold cancels the gesture");
a.emit("pointerdown", point("touch", 75));
fireHold();
assert(document.body.children.length === 1 && rows[0].classes.has("duedle-course-placeholder"), "Holding lifts a preview over a real table placeholder");
assert(a.getAttribute("aria-pressed") === "true", "Assistive technology sees an active drag");
a.emit("pointermove", point("touch", 229));
frame();
assert(order() === "B,C,D,E,A,F", "One vertical drag can cross several courses and skip hidden rows");
assert(a.hasPointerCapture(7), "Capture is restored after moving the row in WebKit");
a.emit("lostpointercapture", { pointerId: 7 });
assert(rows[0].classes.has("duedle-course-placeholder"), "Stale lost-capture event does not cancel a recaptured drag");
assert(values() === originalOrder, "Pointer movement does not commit form values before drop");
a.emit("pointerup", point("touch", 229));
assert(rows[0].orderInput.value === "50" && rows[1].orderInput.value === "10", "Drop commits Moodle order values");
assert(document.body.children.length === 0 && frames.size === 0 && !a.hasPointerCapture(7), "Drop removes preview and stops animation/capture");
const committedOrder = order();
const committedValues = values();
scrollY = 0;
const b = grip(rows[1]);
b.emit("pointerdown", point("pen", 75));
fireHold();
b.emit("pointermove", point("pen", 299));
frame();
assert(scrolls.some((amount) => amount > 0), "Dragging near the viewport edge scrolls the page");
b.emit("pointercancel", { pointerId: 7 });
assert(order() === committedOrder && values() === committedValues, "Pointer cancel restores rows without changing committed values");
assert(document.body.children.length === 0 && frames.size === 0, "Cancel cleans up lifted state and animation");
scrollY = 0;
b.emit("pointerdown", point("touch", 75));
fireHold();
b.emit("pointermove", point("touch", 220));
frame();
b.releasePointerCapture(7);
assert(order() === committedOrder && values() === committedValues, "Real capture loss rolls the gesture back");
scrollContainer.style.overflowY = "auto";
scrollContainer.scrollHeight = 350;
scrollContainer.clientHeight = 180;
const windowScrollCount = scrolls.length;
b.emit("pointerdown", point("touch", 95));
fireHold();
b.emit("pointermove", point("touch", 190));
frame();
assert(scrollContainer.scrollTop > 0 && scrolls.length === windowScrollCount, "Nearest Moodle overflow container scrolls instead of the window");
b.emit("pointercancel", { pointerId: 7 });
assert(order() === committedOrder, "Container-scrolled drag also cancels cleanly");
scrollContainer.style.overflowY = "visible";
scrollContainer.scrollTop = 0;
container.emit("dragover", { clientY: 999 });
assert(order() === committedOrder, "External drags do not reorder courses");
let dragText;
b.emit("dragstart", { clientX: 35, clientY: 75, dataTransfer: { setData(_type, text) { dragText = text; }, setDragImage() {} } });
assert(dragText === "B", "Desktop Safari native drag receives data");
container.emit("dragover", { clientY: 999, dataTransfer: {} });
container.emit("drop", { clientY: 999 });
b.emit("dragend");
assert(order().endsWith("B") && rows[1].orderInput.value === "60", "Desktop drop commits an arbitrary destination");
const desktopOrder = order();
b.emit("dragstart", { clientX: 35, clientY: 275, dataTransfer: { setData() {} } });
container.emit("dragover", { clientY: 0 });
b.emit("dragend");
assert(order() === desktopOrder, "Native drag ending outside a valid drop rolls back");
b.focus();
b.emit("keydown", { key: " " });
b.emit("keydown", { key: "Home" });
assert(visibleOrder().startsWith("B"), "Keyboard selection can move directly to the first visible slot");
b.emit("keydown", { key: "Escape" });
assert(order() === desktopOrder && document.activeElement === b, "Escape restores keyboard order and retains focus");
b.emit("keydown", { key: " " });
b.emit("keydown", { key: "Home" });
b.emit("keydown", { key: "Enter" });
assert(visibleOrder().startsWith("B") && rows[1].orderInput.value === String(container.children.indexOf(rows[1]) * 10), "Keyboard confirmation saves order");
b.emit("keydown", { key: "ArrowDown" });
assert(rows[1].orderInput.value === "30" && document.activeElement === b, "Keyboard arrows skip hidden rows and retain grip focus");
actions.querySelectorAll("button")[1].emit("click");
assert(rows[2].style.display === "", "Hidden courses can be revealed after dragging");
log("PASS long-press arbitrary reorder, early/cancel/capture cleanup, page/container auto-scroll, desktop drop, keyboard accessibility, hidden-row order");

class FakeURL {
    constructor(href) {
        const match = String(href).match(/^(https?:|blob:)(?:\/\/([^/]+))?([^?#]*)(?:\?([^#]*))?/);
        if (!match) throw new Error("Invalid URL");
        this.protocol = match[1];
        this.origin = match[2] ? this.protocol + "//" + match[2] : this.protocol;
        this.pathname = match[3] || "/";
        this.params = (match[4] || "").split("&").filter(Boolean);
        this.searchParams = {
            has: (key) => this.params.some((part) => part.split("=")[0] === key),
            delete: (key) => { this.params = this.params.filter((part) => part.split("=")[0] !== key); }
        };
    }
    get href() { return this.origin + this.pathname + (this.params.length ? "?" + this.params.join("&") : ""); }
}
class Element {
    constructor(href) { this.href = href; }
    closest() { return this; }
    hasAttribute() { return false; }
}
globalThis.Element = Element;
globalThis.URL = FakeURL;
const source = readSource("src/qol/assign_files.js");
async function run(options = {}) {
    const log = [];
    const link = new Element("https://example.test/submission_files/report.pdf?forcedownload=1&token=keep");
    let handler;
    const preview = {
        closed: options.closed || false,
        document: { body: {} },
        location: { replace(url) { log.push(["replace", url]); } }
    };
    globalThis.location = { href: "https://example.test/assign", assign(url) { log.push(["assign", url]); } };
    globalThis.document = {
        querySelectorAll() { return [link, new Element("invalid href")]; },
        addEventListener(_name, callback) { handler = callback; }
    };
    globalThis.window = {
        open() { log.push(["open"]); return options.blocked ? null : preview; },
        setTimeout(callback, delay) { log.push(["timer", delay]); callback(); }
    };
    globalThis.fetch = async (url, request) => {
        log.push(["fetch", url, request.credentials]);
        if (options.reject) throw new Error("Network failure");
        return {
            ok: !options.fail,
            redirected: false,
            headers: { get() { return options.type || "application/pdf"; } },
            async blob() { log.push(["blob"]); return {}; }
        };
    };
    FakeURL.createObjectURL = () => { log.push(["create"]); return "blob:preview"; };
    FakeURL.revokeObjectURL = () => { log.push(["revoke"]); };
    globalThis.console = { warn() {} };
    eval(source);
    await handler({
        target: link,
        button: 0,
        ctrlKey: options.modified || false,
        preventDefault() { log.push(["prevent"]); }
    });
    return { log, preview };
}
(async () => {
    let result = await run();
    assert(result.log[0][0] === "open" && result.log[2][0] === "fetch", "Open occurs before fetch");
    assert(result.log[2][1] === "https://example.test/submission_files/report.pdf?token=keep", "Remove forcedownload while preserving remaining query");
    assert(result.log[2][2] === "include", "Fetch uses authenticated credentials");
    assert(result.preview.opener === null, "Preview cannot control opener");
    assert(result.log.some((entry) => entry[0] === "replace" && entry[1] === "blob:preview"), "PDF preview uses Blob");
    assert(result.log.some((entry) => entry[0] === "revoke"), "Blob memory cleanup is scheduled");
    result = await run({ blocked: true });
    assert(result.log.some((entry) => entry[0] === "assign"), "Blocked popup falls back to same tab");
    assert(!result.log.some((entry) => entry[0] === "fetch"), "Blocked popup avoids fetch");
    for (const options of [{ fail: true }, { reject: true }, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, { type: "text/html" }]) {
        result = await run(options);
        assert(result.log.some((entry) => entry[0] === "replace" && entry[1].startsWith("https:")), "Fetch failure or unsupported type falls back to source");
        assert(!result.log.some((entry) => entry[0] === "create"), "Fallback does not create Blob");
    }
    result = await run({ closed: true });
    assert(!result.log.some((entry) => entry[0] === "create"), "Closing preview avoids Blob creation");
    result = await run({ modified: true });
    assert(result.log.length === 0, "Modified click retains native handling");
    log("PASS synchronous popup, authenticated fetch, query preservation, blocked/failure/type fallbacks, memory cleanup, closed tab, modified click");
})().catch((error) => { log(error); throw error; });
