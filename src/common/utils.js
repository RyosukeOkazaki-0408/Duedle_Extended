// Parse Moodle's Japanese/English dates explicitly; browser Date.parse differs
// across Chrome and Safari for localized display strings.
function extractDate(text) {
    if (typeof text !== "string") return null;
    const normalized = text.replace(/\u00a0/g, " ").trim();
    let parts = normalized.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.*?(\d{1,2}):(\d{2})/);
    let year, month, day, hour, minute, meridiem;
    if (parts) {
        [, year, month, day, hour, minute] = parts;
    } else {
        const months = ["january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december"];
        const monthPattern = "(" + months.map(value => value.slice(0, 3) + "(?:" + value.slice(3) + ")?").join("|") + ")";
        parts = normalized.match(new RegExp("(\\d{1,2})\\s+" + monthPattern
            + "\\s+(\\d{4}),?\\s+(\\d{1,2}):(\\d{2})(?:\\s*([ap]m))?", "i"));
        if (parts) {
            [, day, month, year, hour, minute, meridiem] = parts;
        } else {
            parts = normalized.match(new RegExp(monthPattern + "\\s+(\\d{1,2}),?\\s+(\\d{4}),?\\s+"
                + "(\\d{1,2}):(\\d{2})(?:\\s*([ap]m))?", "i"));
            if (!parts) return null;
            [, month, day, year, hour, minute, meridiem] = parts;
        }
        month = months.findIndex(value => value.startsWith(month.toLowerCase())) + 1;
    }
    [year, month, day, hour, minute] = [year, month, day, hour, minute].map(Number);
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (meridiem.toLowerCase() === "pm" ? 12 : 0);
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    const date = new Date(year, month - 1, day, hour, minute);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        && date.getHours() === hour && date.getMinutes() === minute ? date : null;
}

//残り時間の出力
function formatRemainingTime(due) {
    const now = new Date();
    const diff = due - now;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (days > 0) {
        return `残り${days}日${hours}時間`;
    } else if (hours > 0) {
        return `残り${hours}時間${minutes}分`;
    } else if (minutes > 0) {
        return `残り${minutes}分${seconds}秒`;
    } else if (seconds >= 0) {
        return `残り${seconds}秒`;
    } else {
        return "終了";
    }
}