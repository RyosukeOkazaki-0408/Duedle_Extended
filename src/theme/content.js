// Adapt rich-text color pairs without changing light mode, images or layout.
(() => {
    const selector = ".qtext, .que .answer, .generalfeedback, .specificfeedback, .rightanswer, .quizgradefeedback, .quizteacherfeedback, .activity-description, .activity-altcontent, .mod_introbox, .onlinetextsubmission, .course-content .summary, .course-content .contentafterlink, .description .description-inner"
        + ", .que.ddwtos .answercontainer, .course-content .contentwithoutlink, .course-content .summarytext, .course-content .no-overflow"
        + (/\/mod\/(?:assign|quiz)\//.test(location.pathname) ? ", #intro" : "");
    const sources = new WeakMap();
    const important = new Map();
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
    const applyImportant = (node, original) => {
        const dark = document.body.classList.contains("darkmode");
        const source = sources.get(node);
        for (const [property, value] of Object.entries(original)) {
            node.style.setProperty(property, dark
                ? property === "color" ? foreground(source.color) : background(source.background)
                : value, "important");
        }
    };
    const adapt = root => {
        const nodes = [root, ...root.querySelectorAll("*")]
            .filter(node => node.style && !node.matches("img, svg, svg *, canvas, video, iframe, picture, source"));
        // Read all original colors before applying classes to avoid inheriting
        // a parent's converted color while inspecting a child.
        for (const node of nodes) {
            if (sources.has(node)) continue;
            const style = getComputedStyle(node);
            sources.set(node, { color: rgb(style.color), background: rgb(style.backgroundColor) });
            const original = Object.fromEntries(["color", "background-color"]
                .filter(property => node.style.getPropertyPriority(property) === "important")
                .map(property => [property, node.style.getPropertyValue(property)]));
            if (Object.keys(original).length) important.set(node, original);
        }
        root.classList.add("duedle-authored-content");
        for (const node of nodes) {
            const source = sources.get(node);
            node.style.setProperty("--duedle-content-color", foreground(source.color));
            node.style.setProperty("--duedle-content-background", background(source.background));
            node.classList.add("duedle-content-colors");
            if (important.has(node)) applyImportant(node, important.get(node));
        }
    };
    const mark = root => {
        if (root?.nodeType !== 1) return;
        const parent = root.closest(".duedle-authored-content");
        if (parent) adapt(parent);
        else if (root.matches(selector)) adapt(root);
        root.querySelectorAll(selector).forEach(adapt);
    };
    mark(document.body);
    new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes" && record.target === document.body) {
                for (const [node, original] of important) {
                    if (node.isConnected) applyImportant(node, original);
                    else important.delete(node);
                }
            }
            for (const node of record.addedNodes) mark(node);
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
