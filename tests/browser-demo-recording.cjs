// Replay the read-only HTTP probe through the actual collector/parsers/storage.
// Browser networking is fully intercepted; no credentials or university access.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
(async () => {
    const directory = process.argv[2];
    assert(directory, 'Pass the temporary directory returned by demo-moodle-http-probe.py');
    const recording = JSON.parse(fs.readFileSync(path.join(directory, 'recording.json')));
    const pages = Object.fromEntries(Object.entries(recording.pages).map(([url, file]) =>
        [url, fs.readFileSync(path.join(directory, file), 'utf8')]));
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ timezoneId: 'Asia/Tokyo' });
        await page.route('**/*', route => route.request().isNavigationRequest()
            ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }) : route.abort());
        await page.goto(recording.base + 'my/');
        await page.addScriptTag({ content: 'var M={};M.cfg={"sesskey":"replay12345"};' });
        await page.evaluate(() => {
            const values = {};
            globalThis.replayValues = values;
            globalThis.ext = { storage: { local: {
                async get(keys) {
                    if (typeof keys === 'string') keys = [keys];
                    return structuredClone(Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]])));
                },
                async set(data) { Object.assign(values, structuredClone(data)); }
            } } };
        });
        for (const file of ['common/sites.js', 'common/utils.js', 'storage/class/StorageUtil.js',
            'storage/class/scrape/Scrape.js', 'storage/class/scrape/ScrapeAssign.js',
            'storage/class/scrape/ScrapeQuiz.js', 'storage/class/CourseCollector.js', 'storage/class/AutoRefreshCollector.js']) {
            await page.addScriptTag({ path: path.resolve('src', file) });
        }
        const result = await page.evaluate(async ({ recording, pages }) => {
            StorageUtil.isBackground = true;
            const requests = [];
            const collector = new CourseCollector({ fetch: async (url, options) => {
                const target = new URL(url);
                requests.push(target.pathname);
                const method = target.searchParams.get('info');
                let body;
                if (method) {
                    const args = JSON.parse(options.body)[0].args;
                    const payload = recording.api[method]?.[args.courseid ?? 'enrolled'];
                    if (!payload) throw new Error('Unrecorded API: ' + method);
                    body = JSON.stringify(payload);
                } else {
                    body = pages[url];
                    if (!body) throw new Error('Unrecorded page path: ' + target.pathname);
                }
                return { ok: true, status: 200, url, redirected: false,
                    headers: new Headers({ Date: recording.serverDate }),
                    text: async () => body, json: async () => JSON.parse(body) };
            } });
            const ids = await collector.enrolledCourseIds(document);
            await ext.storage.local.set({ courseIds: ids, enrolledCourseIds: ids });
            const report = await collector.run(ids);
            const tasks = await StorageUtil.getAllData();
            return { report, tasks, requests, root: CourseCollector.baseURL };
        }, { recording, pages });
        assert.equal(result.root, recording.base);
        assert.equal(result.report.failed, 0, JSON.stringify(result.report.errors));
        assert.equal(result.tasks.length, 10);
        assert.equal(result.tasks.filter(task => task.group === 'assign_list').length, 7);
        assert.equal(result.tasks.filter(task => task.group === 'quiz_list').length, 3);
        assert.equal(result.tasks.filter(task => task.start && !isNaN(Date.parse(task.start))).length, 10);
        assert.equal(result.tasks.filter(task => task.due && !isNaN(Date.parse(task.due))).length, 9);
        assert.equal(result.tasks.filter(task => task.status === 'complete').length, 2,
            JSON.stringify(result.tasks.filter(task => task.group === 'quiz_list').map(({ quizName, status, point, maxp, required, count, maxcount }) =>
                ({ quizName, status, point, maxp, required, count, maxcount }))));
        assert.equal(result.tasks.filter(task => task.status === 'stuck').length, 1);
        assert.equal(result.tasks.find(task => task.assignName?.startsWith('提出済み')).filenum, 3);
        assert(result.tasks.every(task => task.courseId && Number.isFinite(task.fetchedAt)));
        console.log(JSON.stringify({ verified: 'actual demo responses replayed through production collector, parsers and storage',
            courses: result.report.courses, tasks: result.tasks.length, knownStarts: 10, knownDeadlines: 9,
            statuses: result.tasks.map(task => ({ name: task.assignName || task.quizName, status: task.status })) }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
