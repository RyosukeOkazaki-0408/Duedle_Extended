// Adapt rich-text color pairs without changing light mode, images or layout.
(() => {
    const selector = ".qtext, .que .answer, .generalfeedback, .specificfeedback, .rightanswer, .quizgradefeedback, .quizteacherfeedback, .activity-description, .activity-altcontent, .mod_introbox, .onlinetextsubmission, .course-content .summary, .course-content .contentafterlink, .description .description-inner"
        + ", .que.ddwtos .answercontainer, .course-content .contentwithoutlink, .course-content .summarytext, .course-content .no-overflow"
        + (/\/mod\/(?:assign|quiz)\//.test(location.pathname) ? ", #intro" : "");
    const sources = new WeakMap();
    const originals = new WeakMap();
    const applied = new WeakMap();
    const properties = ["color", "background-color"];
    const inlineColors = node => properties.map(property => ({
        value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority(property)
    }));
    const same = (a, b) => a.value === b.value && a.priority === b.priority;
    const setStyle = (node, property, value, priority = "") => {
        if (node.style.getPropertyValue(property) !== value || node.style.getPropertyPriority(property) !== priority) {
            if (value) node.style.setProperty(property, value, priority);
            else node.style.removeProperty(property);
        }
    };
    const rgb = value => {
        const wide = /^color\((?:srgb|display-p3)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(value);
        if (wide) return [...wide.slice(1, 4).map(channel => Math.min(255, Number(channel) * 255)), Number(wide[4] ?? 1)];
        if (!/^rgba?\(/.test(value)) return null;
        const values = value.match(/[\d.]+/g)?.map(Number);
        return values?.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : null;
    };
    const luminance = color => color.slice(0, 3).reduce((sum, value, index) => {
        const s = value / 255;
        return sum + [0.2126, 0.7152, 0.0722][index] * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
    }, 0);
    const css = color => `rgba(${color.slice(0, 3).map(Math.round).join(", ")}, ${color[3] ?? 1})`;
    const background = color => {
        if (!color || color[3] < 0.01) return "transparent";
        if (Math.max(...color.slice(0, 3)) <= 70) return css(color);
        if (Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) < 15) return css([38, 53, 65, color[3]]);
        return css([...color.slice(0, 3).map((value, index) => [20, 24, 28][index] + value * 0.15), color[3]]);
    };
    const foreground = color => {
        if (!color) return "#dddddf";
        if (color[3] < 0.01) return "transparent";
        // Use the brightest adapted background as the contrast baseline.
        const base = luminance([70, 70, 70]);
        if (Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) < 50 && (luminance(color) + 0.05) / (base + 0.05) < 4.5) return "#dddddf";
        let result = color.slice(0, 3);
        for (let mix = 0; (luminance(result) + 0.05) / (base + 0.05) < 4.5 && mix <= 1; mix += 0.05) {
            result = color.slice(0, 3).map(value => value + (255 - value) * mix);
        }
        return css([...result, 1]);
    };
    const applyImportant = node => {
        const dark = document.body.classList.contains("darkmode");
        const source = sources.get(node);
        originals.get(node)?.forEach((original, index) => {
            if (original.priority !== "important") return;
            const property = properties[index];
            setStyle(node, property, dark
                ? property === "color" ? foreground(source.color) : background(source.background)
                : original.value, original.priority);
        });
        applied.set(node, inlineColors(node));
    };
    const adapt = root => {
        const nodes = [root, ...root.querySelectorAll("*")]
            .filter(node => node.style && !node.matches("img, svg, svg *, canvas, video, iframe, picture, source"));
        // Remember page edits, but never adopt our own adapted inline values.
        for (const node of nodes) {
            const current = inlineColors(node), previous = applied.get(node);
            const original = originals.get(node);
            originals.set(node, current.map((value, index) => previous && same(value, previous[index])
                ? original[index] : value));
        }
        root.classList.add("duedle-authored-content");
        // Restore the entire author subtree before reading it. New descendants
        // and inherited colors must not capture an already converted parent.
        for (const node of nodes) {
            node.classList.remove("duedle-content-colors");
            originals.get(node).forEach((original, index) =>
                setStyle(node, properties[index], original.value, original.priority));
        }
        for (const node of nodes) {
            const style = getComputedStyle(node);
            sources.set(node, { color: rgb(style.color), background: rgb(style.backgroundColor) });
        }
        for (const node of nodes) {
            const source = sources.get(node);
            setStyle(node, "--duedle-content-color", foreground(source.color));
            setStyle(node, "--duedle-content-background", background(source.background));
            node.classList.add("duedle-content-colors");
            applyImportant(node);
        }
    };
    const collectRoots = (root, roots) => {
        if (root?.nodeType !== 1 || !root.isConnected) return;
        // Nested Moodle content selectors share one author-color read.
        let parent = root.closest(".duedle-authored-content");
        while (parent?.parentElement?.closest(".duedle-authored-content")) {
            parent = parent.parentElement.closest(".duedle-authored-content");
        }
        if (parent) roots.add(parent);
        else if (root.matches(selector)) roots.add(root);
        root.querySelectorAll(selector).forEach(node => roots.add(node));
    };
    const adaptRoots = roots => {
        for (const root of roots) {
            if (![...roots].some(other => other !== root && other.contains(root))) adapt(root);
        }
    };
    const initial = new Set();
    collectRoots(document.body, initial);
    adaptRoots(initial);
    new MutationObserver(records => {
        const roots = new Set();
        let themeChanged = false;
        for (const record of records) {
            if (record.type === "attributes") {
                if (record.target === document.body && record.attributeName === "class") themeChanged = true;
                if (record.attributeName === "style" && applied.has(record.target)) {
                    const previous = applied.get(record.target);
                    if (inlineColors(record.target).some((value, index) => !same(value, previous[index]))) {
                        collectRoots(record.target, roots);
                    }
                }
            }
            for (const node of record.addedNodes) collectRoots(node, roots);
        }
        adaptRoots(roots);
        if (themeChanged) {
            // Weak maps never retain detached teaching content. Only connected,
            // already adapted nodes need restoration when the mode changes.
            document.querySelectorAll(".duedle-content-colors").forEach(node => {
                if (sources.has(node)) applyImportant(node);
            });
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
})();
