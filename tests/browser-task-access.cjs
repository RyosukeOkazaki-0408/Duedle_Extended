// Moodle's common access-denied pages, using arbitrary task IDs and synthetic data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
        await page.goto(root + 'course/view.php?id=42');
        for (const file of ['common/utils.js', 'storage/class/scrape/Scrape.js', 'storage/class/scrape/ScrapeAssign.js',
            'storage/class/scrape/ScrapeQuiz.js', 'storage/class/scrape/ScrapeQuizReview.js', 'storage/class/StorageUtil.js',
            'storage/class/CourseCollector.js', 'storage/class/AutoRefreshCollector.js']) {
            await page.addScriptTag({ path: path.resolve('src', file) });
        }
        await page.evaluate(async root => {
            const check = (value, message) => { if (!value) throw new Error(message); };
            const html = (content, bodyClass = 'course-42') => `<!doctype html><html lang="ja"><body class="${bodyClass}"><h1>Course</h1><h2>Task</h2><main id="region-main">${content}</main></body></html>`;
            const parse = content => new DOMParser().parseFromString(content, 'text/html');
            const japanese = '<div class="alert alert-danger" role="alert">申し訳ございません、この活動は現在非表示にされています。</div>';
            const english = '<div class="alert alert-danger">Sorry, this activity is currently hidden</div>';
            const coded = '<div class="errorbox" data-errorcode="activitynotavailable">Localized message</div>';
            for (const [type, id, message] of [['quiz', 501, japanese], ['quiz', 502, english], ['assign', 401, coded], ['assign', 9017, japanese]]) {
                const doc = parse(html(message));
                const url = root + `mod/${type}/view.php?id=${id}`;
                check(Scrape.unavailableTask(doc, url)?.id === id, 'Common denial detection must use the URL ID, not a specific task');
                check((type === 'quiz' ? ScrapeQuiz : ScrapeAssign).getData(doc, url) === null, 'Denied pages must not become incomplete task snapshots');
            }
            for (const container of ['<div id="display">', '<div id="intro">', '<div class="que">']) {
                const doc = parse(html(container + japanese + '</div>'));
                check(!Scrape.unavailableTask(doc, root + 'mod/quiz/view.php?id=503'), 'Duedle cards and teaching content cannot deny an activity');
                check(ScrapeQuiz.getData(doc, root + 'mod/quiz/view.php?id=503'), 'Ordinary quiz data remains readable');
            }
            check(!Scrape.unavailableTask(parse(html(japanese)), root + 'mod/assign/view.php?id=401&action=grading'), 'A grading/action failure does not deny the student overview');
            check(!Scrape.unavailableTask(parse(html('<div class="alert alert-danger">一時的な通信エラー</div>')), root + 'mod/quiz/view.php?id=503'), 'Generic failures are not visibility decisions');
            const task = (type, id, extra = {}) => ({ group: type + '_list', [type === 'assign' ? 'assignId' : 'quizId']: id,
                courseId: 42, fetchedAt: 1, status: 'incomplete', show: true, ...extra });
            const memory = { assign_list: [task('assign', 401, { show: false, status: 'complete' })],
                quiz_list: [task('quiz', 501), task('quiz', 502), task('quiz', 503), task('quiz', 601, { courseId: 43 })] };
            globalThis.ext = { storage: { local: {
                get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => key in memory).map(key => [key, structuredClone(memory[key])])),
                set: async values => Object.assign(memory, structuredClone(values))
            } }, runtime: { onMessage: { addListener(handler) { globalThis.taskCollectionHandler = handler; } } } };
            StorageUtil.isBackground = true;
            const requests = [];
            const fetch = async url => {
                requests.push(url);
                const address = new URL(url), id = Number(address.searchParams.get('id'));
                let status = 200, content;
                if (address.pathname.endsWith('/course/view.php')) content = html('<div class="course-content">'
                    + [['quiz', 501], ['quiz', 502], ['assign', 401], ['quiz', 503]]
                        .map(([type, id]) => `<a href="${root}mod/${type}/view.php?id=${id}">Task</a>`).join('') + '</div>');
                else if (id === 501) content = html(japanese);
                else if (id === 502) { status = 403; content = html(english, ''); }
                else if (id === 401) { status = 404; content = html(coded); }
                else if (id === 503) content = html('<div class="quizattempt"></div>');
                else { status = 503; content = html('<div class="alert alert-danger">Temporary server error</div>'); }
                return { ok: status < 400, status, url, text: async () => content };
            };
            const collector = new CourseCollector({ fetch });
            const result = await collector.run([42]);
            check(result.saved === 1 && result.failed === 0 && result.courses === 1, 'Manual refresh handles explicit denials only for linked course tasks');
            check((await StorageUtil.getAllData()).map(item => item.quizId).sort().join(',') === '503,601', 'Only denied tasks disappear, while normal and other-course tasks remain');
            check(memory.assign_list[0].show === false && memory.assign_list[0].status === 'complete', 'Denials preserve cached preferences and completion');
            check(memory.quiz_list.length === 4 && memory.assign_list.length === 1, 'No stored task records are deleted');
            check(memory.courseAvailability[42].items['quiz:501'] === false, 'The end-of-course snapshot cannot undo a task denial');
            check(memory.courseAvailability[42].items['quiz:502'] === false, 'A missing course ID on the error page uses the cached task association');
            try { await collector.fetchDocument(root + 'mod/assign/view.php?id=402'); throw new Error('Expected HTTP failure'); }
            catch (error) { check(error.status === 503, 'Unrecognized HTTP failures retain their original error'); }
            check(!('assign:402' in memory.courseAvailability[42].items), 'A server failure cannot record a denial');
            memory.courseAvailability = { 42: { items: {}, complete: true } };
            for (const item of [...memory.quiz_list, ...memory.assign_list]) item.fetchedAt = 1;
            requests.length = 0;
            const now = Date.now();
            const automatic = await new AutoRefreshCollector({ fetch, now: () => now, pause: async () => {} }).run({
                state: { courses: { 42: { seenAt: now, discoveredAt: now } } }
            });
            check(automatic.failed === 0 && automatic.saved === 1, 'Automatic refresh handles the same 200/403/404 task denials');
            check((await StorageUtil.getAllData()).length === 2, 'Automatic refresh removes only denied tasks from view');
            await StorageUtil.setCourseAvailability(42, [{ type: 'quiz', id: 501, available: true }]);
            history.replaceState(null, '', root + 'mod/quiz/view.php?id=501');
            document.body.className = 'course-42';
            document.body.innerHTML = '<h1>Course</h1><h2>Task</h2><div id="display"><h2>Cached task card</h2></div>' + japanese;
            globalThis.duedleCollectAccountContext = async () => ({ accountId: 'fixture', pageId: 'fixture-task' });
            globalThis.accessFixture = { memory, japanese, coded, root };
        }, root);
        await page.addScriptTag({ path: path.resolve('src/storage/cs_scrapeQuiz.js') });
        await page.waitForFunction(async () => (await StorageUtil.getCourseAvailability())[42]?.items['quiz:501'] === false);
        const deniedQuiz = await page.evaluate(() => new Promise(resolve => taskCollectionHandler({ type: 'COLLECT_TASK' }, {}, resolve)));
        assert(deniedQuiz.ok && deniedQuiz.unavailable.type === 'quiz' && deniedQuiz.unavailable.id === 501 && !deniedQuiz.data);
        await page.evaluate(async () => {
            await StorageUtil.setCourseAvailability(42, [{ type: 'assign', id: 401, available: true }]);
            history.replaceState(null, '', accessFixture.root + 'mod/assign/view.php?id=401');
            document.body.innerHTML = '<h1>Course</h1><h2>Task</h2>' + accessFixture.coded;
        });
        await page.addScriptTag({ path: path.resolve('src/storage/cs_scrapeAssign.js') });
        await page.waitForFunction(async () => (await StorageUtil.getCourseAvailability())[42]?.items['assign:401'] === false);
        const deniedAssign = await page.evaluate(() => new Promise(resolve => taskCollectionHandler({ type: 'COLLECT_TASK' }, {}, resolve)));
        assert(deniedAssign.ok && deniedAssign.unavailable.type === 'assign' && deniedAssign.unavailable.id === 401 && !deniedAssign.data);
        assert.deepEqual(errors, []);
        console.log('PASS common task denials: arbitrary IDs, both module types, manual/automatic refresh, direct pages, HTTP status handling, and cache preservation');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
