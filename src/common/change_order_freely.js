(() => {
    // Moodle's display order is saved by the existing form submission.
    const settingTitle = Array.from(document.querySelectorAll("h5"))
        .find((heading) => heading.textContent.trim() === "マイコース表示設定");
    if (settingTitle) settingTitle.textContent = "コース概要の表示順設定";

    const breadcrumb = document.querySelector("#page-navbar > nav > ol > li:nth-child(2) > span");
    const pageTitle = document.querySelector("#region-main > div > h2 > center");
    [breadcrumb, pageTitle].forEach((element) => {
        if (element?.textContent === "Myコースの表示設定") {
            element.textContent = "コース概要の表示順設定";
        }
    });

    const settingsLink = document.querySelector("#inst67416 > div > div > div > p > span > a");
    if (settingsLink) settingsLink.style.fontWeight = "bold";
    const orderOption = document.querySelector('.dropdown-item[data-value="ul.displayorder asc"]');
    if (orderOption) orderOption.textContent = "設定した表示順";
    const sortingDropdown = document.querySelector("#sortingdropdown");
    if (sortingDropdown && orderOption?.getAttribute("aria-current") === "true") {
        sortingDropdown.textContent = "設定した表示順";
    }

    const courseContainer = document.querySelector("#region-main > div > form > center > table > tbody");
    if (!courseContainer || courseContainer.dataset.duedleOrderReady) return;
    courseContainer.dataset.duedleOrderReady = "true";
    courseContainer.closest("table")?.classList.add("duedle-course-order");

    const rows = Array.from(courseContainer.querySelectorAll("tr"));
    const headerRow = rows[0];
    const orderInputs = new Map();
    let drag = null;
    let hide = true;
    const HOLD_MS = 350;
    const courseRows = () => Array.from(courseContainer.querySelectorAll("tr"))
        .filter((row) => row !== headerRow && orderInputs.has(row));
    const visibleRows = () => courseRows().filter((row) => row.style.display !== "none" && !row.hidden);
    const saveOrder = () => {
        courseRows().forEach((row, index) => {
            const input = orderInputs.get(row);
            if (input) input.value = String((index + 1) * 10);
        });
    };
    const moveBefore = (row, before) => {
        if (before === row || row.nextSibling === before) return;
        courseContainer.insertBefore(row, before);
        // Moving the captured element's row can clear capture in WebKit.
        if (drag?.type === "pointer" && drag.active) drag.grip.setPointerCapture(drag.pointerId);
    };
    const reorderAt = (row, clientY) => {
        const next = visibleRows().find((other) => {
            if (other === row) return false;
            const rect = other.getBoundingClientRect();
            return clientY < rect.top + rect.height / 2;
        });
        moveBefore(row, next || null);
    };
    const findScrollParent = (row) => {
        for (let parent = row.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
            const overflow = window.getComputedStyle(parent).overflowY;
            if (/(auto|scroll|overlay)/.test(overflow) && parent.scrollHeight > parent.clientHeight + 1) return parent;
        }
        return null;
    };

    const finishDrag = (commit) => {
        const current = drag;
        if (!current) return;
        // Clear state before releasing capture: that can fire lostpointercapture synchronously.
        drag = null;
        window.clearTimeout(current.timer);
        window.cancelAnimationFrame(current.frame);
        current.ghost?.remove();
        current.row.classList.remove("duedle-course-placeholder", "duedle-course-keyboard-active");
        current.grip.classList.remove("duedle-course-holding");
        current.grip.setAttribute("aria-pressed", "false");
        current.grip.draggable = true;
        courseContainer.classList.remove("duedle-course-dragging");
        if (current.grip.hasPointerCapture?.(current.pointerId)) {
            current.grip.releasePointerCapture(current.pointerId);
        }
        if (current.active) {
            if (commit) saveOrder();
            else current.originalOrder.forEach((row) => courseContainer.appendChild(row));
        }
    };

    const createGhost = (current) => {
        const rect = current.row.getBoundingClientRect();
        const ghost = document.createElement("div");
        ghost.classList.add("duedle-course-drag-preview");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        const previewTable = document.createElement("table");
        previewTable.className = courseContainer.closest("table").className;
        const rowStyle = window.getComputedStyle(current.row);
        previewTable.style.font = rowStyle.font;
        previewTable.style.color = rowStyle.color;
        previewTable.style.backgroundColor = rowStyle.backgroundColor;
        const body = document.createElement("tbody");
        const clone = current.row.cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        clone.querySelectorAll("input, button, select").forEach((node) => { node.disabled = true; });
        Array.from(clone.children).forEach((cell, index) => {
            const original = current.row.children[index];
            const width = original.getBoundingClientRect().width;
            const style = window.getComputedStyle(original);
            cell.style.width = `${width}px`;
            cell.style.font = style.font;
            cell.style.color = style.color;
            cell.style.backgroundColor = style.backgroundColor;
        });
        const originalLinks = current.row.querySelectorAll("a");
        clone.querySelectorAll("a").forEach((link, index) => {
            link.style.color = window.getComputedStyle(originalLinks[index]).color;
        });
        body.appendChild(clone);
        previewTable.appendChild(body);
        ghost.appendChild(previewTable);
        ghost.style.left = `${rect.left}px`;
        ghost.style.width = `${rect.width}px`;
        current.offsetY = current.clientY - rect.top;
        current.ghost = ghost;
        document.body.appendChild(ghost);
    };

    const pointerFrame = () => {
        const current = drag;
        if (!current || current.type !== "pointer" || !current.active) return;
        // Only the preview follows the pointer; the real row keeps the table's drop slot.
        current.ghost.style.top = `${current.clientY - current.offsetY}px`;
        const scrollRect = current.scrollParent?.getBoundingClientRect();
        const top = Math.max(0, scrollRect?.top || 0);
        const bottom = Math.min(window.innerHeight, scrollRect?.bottom ?? window.innerHeight);
        const edge = Math.min(56, Math.max(20, (bottom - top) / 4));
        const distance = current.clientY < top + edge ? current.clientY - (top + edge)
            : current.clientY > bottom - edge ? current.clientY - (bottom - edge) : 0;
        if (distance) {
            const amount = Math.max(-16, Math.min(16, distance / edge * 16));
            if (current.scrollParent) current.scrollParent.scrollTop += amount;
            else window.scrollBy(0, amount);
        }
        reorderAt(current.row, current.clientY);
        current.frame = window.requestAnimationFrame(pointerFrame);
    };
    const startPointerDrag = (current) => {
        if (drag !== current) return;
        current.active = true;
        current.scrollParent = findScrollParent(current.row);
        current.grip.classList.remove("duedle-course-holding");
        current.grip.setAttribute("aria-pressed", "true");
        createGhost(current);
        current.row.classList.add("duedle-course-placeholder");
        courseContainer.classList.add("duedle-course-dragging");
        pointerFrame();
    };
    const moveByKeyboard = (row, key) => {
        const visible = visibleRows();
        const index = visible.indexOf(row);
        if (key === "Home") moveBefore(row, visible[0]);
        else if (key === "End") {
            const last = visible[visible.length - 1];
            if (last !== row) moveBefore(row, last.nextSibling);
        } else {
            const direction = key === "ArrowUp" ? -1 : 1;
            const neighbor = visible[index + direction];
            if (neighbor) moveBefore(row, direction < 0 ? neighbor : neighbor.nextSibling);
        }
    };

    rows.forEach((row, index) => {
        const originalCell = row.querySelector("td, th");
        const orderInput = originalCell?.querySelector("input") || row.querySelector('input:not([type="checkbox"]):not([type="radio"])');
        if (originalCell) originalCell.style.display = "none";
        row.style.border = "2px solid #ccc";
        const controlsCell = document.createElement(index === 0 ? "th" : "td");
        controlsCell.classList.add("duedle-course-order-controls");
        row.insertBefore(controlsCell, row.firstChild);
        if (index === 0) {
            controlsCell.scope = "col";
            controlsCell.textContent = "表示順";
            return;
        }
        orderInputs.set(row, orderInput);
        row.draggable = false;
        row.querySelectorAll("td").forEach((cell) => {
            cell.style.height = "50px";
            cell.style.padding = "0 8px";
            cell.style.boxSizing = "border-box";
        });
        const courseName = row.querySelector("a")?.textContent.trim() || `コース ${index}`;
        const grip = document.createElement("button");
        grip.type = "button";
        grip.draggable = true;
        grip.classList.add("duedle-course-grip");
        grip.setAttribute("aria-label", `${courseName}の表示順を変更`);
        grip.setAttribute("aria-pressed", "false");
        grip.setAttribute("aria-keyshortcuts", "Space Enter Escape ArrowUp ArrowDown Home End");
        const icon = document.createElement("span");
        icon.classList.add("duedle-course-grip-icon");
        icon.setAttribute("aria-hidden", "true");
        grip.appendChild(icon);
        controlsCell.appendChild(grip);

        grip.addEventListener("pointerdown", (event) => {
            if (!["touch", "pen"].includes(event.pointerType) || event.isPrimary === false || event.button !== 0) return;
            event.preventDefault();
            finishDrag(false);
            const current = {
                type: "pointer", row, grip, pointerId: event.pointerId, active: false,
                startX: event.clientX, startY: event.clientY, clientY: event.clientY,
                originalOrder: courseRows()
            };
            drag = current;
            // Disable Safari's native touch drag while the Pointer Events gesture owns the grip.
            grip.draggable = false;
            grip.classList.add("duedle-course-holding");
            grip.setPointerCapture(event.pointerId);
            current.timer = window.setTimeout(() => startPointerDrag(current), HOLD_MS);
        });
        grip.addEventListener("pointermove", (event) => {
            if (drag?.type !== "pointer" || drag.pointerId !== event.pointerId) return;
            if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 10) {
                finishDrag(false);
                return;
            }
            drag.clientY = event.clientY;
            if (drag.active) event.preventDefault();
        });
        grip.addEventListener("pointerup", (event) => {
            if (drag?.type !== "pointer" || drag.pointerId !== event.pointerId) return;
            if (drag.active) {
                drag.clientY = event.clientY;
                reorderAt(row, event.clientY);
                event.preventDefault();
            }
            finishDrag(true);
        });
        grip.addEventListener("pointercancel", (event) => {
            if (drag?.type === "pointer" && drag.pointerId === event.pointerId) finishDrag(false);
        });
        grip.addEventListener("lostpointercapture", (event) => {
            if (drag?.type === "pointer" && drag.pointerId === event.pointerId && !grip.hasPointerCapture(event.pointerId)) finishDrag(false);
        });
        grip.addEventListener("contextmenu", (event) => event.preventDefault());
        grip.addEventListener("click", (event) => event.preventDefault());

        grip.addEventListener("keydown", (event) => {
            const key = event.key;
            if (![" ", "Enter", "Escape", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
            event.preventDefault();
            if (key === "Escape") { finishDrag(false); return; }
            if (key === " " || key === "Enter") {
                if (drag?.type === "keyboard" && drag.row === row) finishDrag(true);
                else {
                    finishDrag(false);
                    drag = { type: "keyboard", row, grip, active: true, originalOrder: courseRows() };
                    grip.setAttribute("aria-pressed", "true");
                    row.classList.add("duedle-course-keyboard-active");
                }
                return;
            }
            if (drag && (drag.type !== "keyboard" || drag.row !== row)) finishDrag(false);
            moveByKeyboard(row, key);
            if (!drag) saveOrder();
            grip.focus({ preventScroll: true });
            row.scrollIntoView({ block: "nearest", behavior: "auto" });
        });
        grip.addEventListener("blur", () => {
            // A DOM move may briefly blur the grip before keydown restores focus.
            window.setTimeout(() => {
                if (drag?.type === "keyboard" && drag.row === row && document.activeElement !== grip) finishDrag(true);
            }, 0);
        });
        grip.addEventListener("dragstart", (event) => {
            if (drag?.type === "pointer") { event.preventDefault(); return; }
            finishDrag(false);
            drag = { type: "native", row, grip, active: true, originalOrder: courseRows() };
            grip.setAttribute("aria-pressed", "true");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", courseName);
                const rect = row.getBoundingClientRect();
                event.dataTransfer.setDragImage?.(row, event.clientX - rect.left, event.clientY - rect.top);
            }
            row.classList.add("duedle-course-placeholder");
        });
        grip.addEventListener("dragend", () => {
            if (drag?.type === "native" && drag.row === row) finishDrag(false);
        });
    });

    courseContainer.addEventListener("dragover", (event) => {
        if (drag?.type !== "native") return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        reorderAt(drag.row, event.clientY);
    });
    courseContainer.addEventListener("drop", (event) => {
        if (drag?.type !== "native") return;
        event.preventDefault();
        reorderAt(drag.row, event.clientY);
        finishDrag(true);
    });
    window.addEventListener("blur", () => finishDrag(false));
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) finishDrag(false);
    });
    courseContainer.closest("form")?.addEventListener("submit", () => finishDrag(true));

    const checkboxes = Array.from(courseContainer.querySelectorAll('input[type="checkbox"]'));
    const refreshHiddenRows = () => {
        finishDrag(false);
        checkboxes.forEach((checkbox) => {
            const row = checkbox.closest("tr");
            if (row) row.style.display = hide && checkbox.checked ? "none" : "";
        });
    };
    checkboxes.forEach((checkbox) => checkbox.addEventListener("change", refreshHiddenRows));
    refreshHiddenRows();

    const actions = document.querySelector('p[align="center"]');
    if (actions) {
        actions.classList.add("duedle-course-order-actions");
        const cancelButton = actions.querySelector("button");
        if (cancelButton) {
            cancelButton.type = "button";
            cancelButton.classList.add("btn", "btn-secondary", "ml-1", "mr-5");
            cancelButton.addEventListener("click", (event) => {
                const dashboardLink = document.querySelector("#page-navbar > nav > ol > li:nth-child(1) > a");
                if (dashboardLink) {
                    event.preventDefault();
                    dashboardLink.click();
                }
            });
        }
        if (checkboxes.length) {
            const visibilityButton = document.createElement("button");
            visibilityButton.type = "button";
            visibilityButton.classList.add("btn", "btn-outline-secondary");
            visibilityButton.textContent = "非表示の項目を表示する";
            visibilityButton.addEventListener("click", () => {
                hide = !hide;
                visibilityButton.textContent = hide ? "非表示の項目を表示する" : "非表示の項目を隠す";
                refreshHiddenRows();
            });
            actions.appendChild(visibilityButton);
        }
    }
})();
