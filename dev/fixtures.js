// All remote-shaped URLs are resolved in memory. CSP also blocks network requests.
const debugRequests = [];
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
function fixtureTasks() {
    const scenario = debugClock.scenario;
    const count = scenario === 'empty' ? 0 : scenario === 'pagination' ? 105 : scenario === 'new' ? 4 : 3;
    return Array.from({ length: count }, (_, index) => {
        const id = index + 1;
        return { id, type: id === 3 ? 'quiz' : 'assign', name: id === 3 ? '確認テスト' : `ダミー課題 ${id}`,
            due: debugClock.base + (id === 1 ? 12 : 72) * 3600000 + (scenario === 'deadline' ? 86400000 : 0) };
    });
}
function dateText(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fixtureHTML(url) {
    const tasks = fixtureTasks();
    if (url.includes('/course/')) return `<h1>デバッグコース</h1>` + tasks.map(t => `<a href="${root}mod/${t.type}/view.php?id=${t.id}">${t.name}</a>`).join('');
    const task = tasks.find(t => t.id === Number(new URL(url).searchParams.get('id')));
    if (!task) return '<h1>デバッグコース</h1><div class="errorcode">missing</div>';
    let detail = `<body class="course-1"><h1>デバッグコース</h1><h2>${task.name}</h2><div class="description-inner"><div>開始: ${dateText(debugClock.base - 86400000)}</div><div>期限: ${dateText(task.due)}</div></div>`;
    if (debugClock.scenario === 'submitted') detail += '<div class="submissionstatustable"><div class="fileuploadsubmission"><a>answer.pdf</a></div></div>';
    if (task.type === 'quiz') detail += `<div id="feedback"><h3>評点: ${debugClock.scenario === 'grade' ? 9 : 3} / 10</h3></div><p class="text-left">合格点: 5 / 10</p><table><tr><th>挑戦</th></tr><tr><td>1</td></tr></table>`;
    return detail + '</body>';
}
globalThis.fetch = async (input, options = {}) => {
    await debugReady;
    const url = String(input);
    if (!url.startsWith(root)) throw new Error('デバッグ環境の通信先ではありません');
    await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, 150);
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
    });
    debugRequests.push({ at: Date.now(), path: new URL(url).pathname, scenario: debugClock.scenario });
    if (debugRequests.length > 200) debugRequests.shift();
    const scenario = debugClock.scenario;
    const status = scenario === 'network' ? 503 : scenario === 'rate-limit' ? 429 : 200;
    const response = { ok: status === 200, status, url: scenario === 'login' ? root + 'login/index.php' : url,
        text: async () => url.includes("/lib/ajax/") ? JSON.stringify(await response.json()) : fixtureHTML(url),
        json: async () => {
            const after = JSON.parse(options.body)[0].args.aftereventid;
            const tasks = fixtureTasks().filter(task => task.id > after).slice(0,50);
            return [{ data: { events: tasks.map(task => ({ id: task.id, instance: task.id, modulename: task.type,
                name: task.name, course: { id: 1 }, timesort: task.due / 1000,
                timemodified: (debugClock.base + (scenario === 'normal' ? 0 : 60000)) / 1000 })), lastid: tasks.at(-1)?.id || 0 } }];
        } };
    return response;
};
