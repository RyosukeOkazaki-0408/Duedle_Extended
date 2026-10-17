// Synthetic Moodle overview/review pages. No live Moodle requests or data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const files = ['common/utils.js', 'storage/class/scrape/Scrape.js', 'storage/class/scrape/ScrapeQuiz.js',
    'storage/class/scrape/ScrapeQuizReview.js', 'storage/class/StorageUtil.js', 'storage/class/CourseCollector.js',
    'storage/class/task/TaskBox.js', 'storage/class/task/QuizBox.js'];
(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ timezoneId: 'Asia/Tokyo' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ja"><body></body></html>' }));
        await page.goto(root + 'mod/quiz/review.php?attempt=999&cmid=101');
        for (const file of files) await page.addScriptTag({ path: path.resolve('src', file) });
        const parsed = await page.evaluate(async root => {
            const documentFor = (html, lang = 'en') => new DOMParser().parseFromString(
                `<!doctype html><html lang="${lang}"><body class="course-7"><h1>Course</h1><h2>Quiz</h2>${html}</body></html>`, 'text/html');
            const base = '<div class="quizattempt"></div><table class="quizattemptsummary"><tbody><tr><td>1</td></tr></tbody></table>';
            const grade = '<div id="feedback"><h3>Grade so far: 7.00 / 10.00</h3></div>';
            const setting = '<p class="text-left">Grade to pass: 8.00 out of 10.00</p><p class="text-left">Attempts allowed: 2</p>';
            const scrape = (html, lang) => ScrapeQuiz.getData(documentFor(base + html, lang), root + 'mod/quiz/view.php?id=101');
            const english = scrape(grade + setting + '<div class="description-inner"><div>Opened: Wednesday, 14 October 2099, 10:00 AM</div><div>Closes: Thursday, 15 October 2099, 10:00 PM</div></div>');
            const japanese = scrape('<div id="feedback"><h3>評点: 7.00 / 10.00</h3></div><p class="text-left">合格点: 8.00 / 10.00</p><p class="text-left">受験可能回数: 2</p><div class="description-inner"><div>開始: 2099年10月14日(水曜日) 10:00</div><div>終了: 2099年10月15日(木曜日) 22:00</div></div>', 'ja');
            const noThreshold = scrape(grade);
            const unknownThreshold = scrape(grade + '<p class="text-left">Grade to pass: unavailable</p>');
            const malformedThreshold = scrape(grade + '<p class="text-left">Grade to pass 8</p>');
            const unknownLanguage = scrape(grade, 'fr');
            const hidden = scrape(setting);
            const exhausted = scrape(grade + setting.replace('allowed: 2', 'allowed: 1'));
            const openingOnly = scrape('<div class="description-inner"><div>Opens: 14 October 2099, 12:00 AM</div></div>');
            const japaneseOpeningOnly = scrape('<div class="description-inner"><div>開始日時: 2099年10月14日 10:00</div></div>', 'ja');
            const closingOnly = scrape('<div class="description-inner"><div>Closes: October 15, 2099, 12:00 PM</div></div>');
            const machineDate = scrape('<div class="description-inner"><div>Closes: <time datetime="2099-10-15T22:00:00+09:00">unknown display</time></div></div>');
            const unlimited = scrape('<p class="text-left">Attempts allowed: Unlimited</p>');
            const unreadableLimit = scrape('<p class="text-left">Attempts allowed: unreadable</p>');
            const invalidDates = ['2099年2月31日 10:00', '2099年10月15日 25:00', '14 October 2099, 13:00 PM', 'date missing'].map(value => extractDate(value));
            const reviewPage = documentFor('<table class="quizreviewsummary"><tr><th>Marks</th><td>99 / 100</td></tr><tr><th>Grade</th><td>10.00 out of 10.00</td></tr><tr><th>Feedback</th><td>Try again (1 / 100)</td></tr></table><table><tr><td>0 / 10</td></tr></table>');
            const review = ScrapeQuizReview.getData(reviewPage, root + 'mod/quiz/review.php?attempt=999&cmid=101');
            reviewPage.querySelector('table.quizreviewsummary').innerHTML = '<tr><th>評点</th><td>8 / 10</td></tr><tr><th>フィードバック</th><td>よくできました。</td></tr>';
            const japaneseReview = ScrapeQuizReview.getData(reviewPage, root + 'mod/quiz/review.php?attempt=999&cmid=101');
            reviewPage.querySelector('table.quizreviewsummary').remove();
            const hiddenReview = ScrapeQuizReview.getData(reviewPage, root + 'mod/quiz/review.php?attempt=999&cmid=101');
            reviewPage.body.insertAdjacentHTML('beforeend', `<nav id="page-navbar"><a href="${root}mod/quiz/view.php?id=101">Quiz</a></nav>`);
            const breadcrumbReview = ScrapeQuizReview.getData(reviewPage, root + 'mod/quiz/review.php?attempt=999');
            const conflictingId = ScrapeQuizReview.getData(reviewPage, root + 'mod/quiz/review.php?attempt=999&cmid=102');
            globalThis.ext = { storage: { sync: { async get() { return {}; } } } };
            const rendered = [];
            for (const maxcount of [undefined, null, 0, 2]) {
                const box = await new QuizBox({ ...english, maxcount }).getElement();
                rendered.push(box.querySelector('.li4').textContent);
            }
            return { english, japanese, noThreshold, unknownThreshold, malformedThreshold, unknownLanguage, hidden, exhausted,
                openingOnly, japaneseOpeningOnly, closingOnly, machineDate, unlimited, unreadableLimit, invalidDates,
                review, japaneseReview, hiddenReview, breadcrumbReview, conflictingId, rendered };
        }, root);
        for (const item of [parsed.english, parsed.japanese]) {
            assert.equal(item.start, '2099-10-14T01:00:00.000Z');
            assert.equal(item.due, '2099-10-15T13:00:00.000Z');
            assert.equal(item.required, 8);
            assert.equal(item.requiredState, 'known');
            assert.equal(item.maxcount, 2);
            assert.equal(item.point, 7);
            assert.equal(item.count, 1);
            assert.equal(item.status, 'incomplete');
        }
        assert.equal(parsed.noThreshold.requiredState, 'none');
        assert.equal(parsed.noThreshold.status, 'qualify');
        assert.equal(parsed.noThreshold.maxcount, 0);
        for (const item of [parsed.unknownThreshold, parsed.malformedThreshold, parsed.unknownLanguage]) {
            assert.equal(item.requiredState, 'unknown');
            assert.equal(item.status, 'unknown');
        }
        assert.equal(parsed.hidden.status, 'unknown');
        assert.equal(parsed.exhausted.status, 'stuck');
        assert.equal(parsed.openingOnly.start, '2099-10-13T15:00:00.000Z');
        assert.equal(parsed.openingOnly.due, null);
        assert.equal(parsed.japaneseOpeningOnly.start, '2099-10-14T01:00:00.000Z');
        assert.equal(parsed.japaneseOpeningOnly.due, null);
        assert.equal(parsed.closingOnly.start, null);
        assert.equal(parsed.closingOnly.due, '2099-10-15T03:00:00.000Z');
        assert.equal(parsed.machineDate.due, '2099-10-15T13:00:00.000Z');
        assert.equal(parsed.unlimited.maxcount, 0);
        assert.equal(parsed.unreadableLimit.maxcount, null);
        assert.deepEqual(parsed.invalidDates, [null, null, null, null]);
        assert.deepEqual(parsed.review, { quizId: 101, attemptPoint: 10, attemptMaxp: 10 });
        assert.deepEqual(parsed.japaneseReview, { quizId: 101, attemptPoint: 8, attemptMaxp: 10 });
        assert.deepEqual(parsed.hiddenReview, { quizId: 101, attemptPoint: null, attemptMaxp: null });
        assert.equal(parsed.breadcrumbReview.quizId, 101);
        assert.equal(parsed.conflictingId, null);
        assert.deepEqual(parsed.rendered, ['受験回数: 1 / ?', '受験回数: 1 / ?', '受験回数: 1 / ∞', '受験回数: 1 / 2']);

        // Use the production content script, collector, parsers, and storage queue
        // to verify review refreshes and a newer overview arriving during a fetch.
        for (const scenario of [
            { name: 'highest', point: 10, expected: 'complete' },
            { name: 'first', point: 5, expected: 'incomplete' },
            { name: 'last', point: 5, expected: 'incomplete' },
            { name: 'average', point: 7.5, expected: 'qualify' },
            { name: 'race', point: 5 },
            { name: 'failure', point: 5 },
            { name: 'wrong-account', point: 5 },
            { name: 'inactive', point: 5 }
        ]) {
            await page.evaluate(scenario => {
                document.body.innerHTML = '<h1>Course</h1><table class="quizreviewsummary"><tr><th>Grade</th><td>10 / 10</td></tr><tr><th>Feedback</th><td>Excellent</td></tr></table>';
                globalThis.probe = { fetches: 0, finished: false, saved: false };
                const old = { group: 'quiz_list', quizId: 101, courseId: 7, courseName: 'Old course', quizName: 'Old quiz',
                    point: 5, required: 7, maxp: 10, count: 1, maxcount: 3, status: 'incomplete', show: false,
                    start: null, due: '2099-10-15T00:00:00.000Z', fetchedAt: 100 };
                probe.old = structuredClone(old);
                probe.state = { quiz_list: [old] };
                globalThis.ext = { storage: { local: {
                    async get() { return structuredClone(probe.state); },
                    async set(values) { Object.assign(probe.state, structuredClone(values)); probe.saved = true; probe.finished = true; }
                } } };
                StorageUtil.isBackground = true;
                globalThis.duedlePageReady = Promise.resolve();
                globalThis.duedleAccountActive = scenario.name !== 'inactive';
                globalThis.duedleAssertAccountDocument = () => {
                    if (scenario.name === 'wrong-account') { probe.finished = true; throw new Error('Account changed'); }
                };
                globalThis.fetch = async url => {
                    probe.fetches++;
                    probe.url = url;
                    if (scenario.name === 'failure') { probe.finished = true; throw new Error('Offline'); }
                    if (scenario.name === 'race') {
                        await StorageUtil.saveData('quiz_list', 'quizId', { ...old, point: 10, count: 2,
                            due: '2099-10-20T00:00:00.000Z', status: 'complete', fetchedAt: 200 });
                        probe.saved = false;
                        probe.finished = false;
                    }
                    return { ok: true, url, async text() {
                        return `<html lang="en"><body class="course-7"><h1>Course</h1><h2>Quiz</h2><div class="quizattempt"></div>
                        <p class="text-left">Grade to pass: 7 / 10</p><p class="text-left">Attempts allowed: 3</p>
                        <table class="quizattemptsummary"><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>
                        <div id="feedback"><h3>Grade (${scenario.name}): ${scenario.point} / 10</h3></div></body></html>`;
                    } };
                };
            }, scenario);
            await page.addScriptTag({ path: path.resolve('src/storage/cs_scrapeQuizReview.js') });
            if (scenario.name !== 'inactive') await page.waitForFunction(() => probe.finished);
            const result = await page.evaluate(() => ({ ...probe, stored: probe.state.quiz_list[0] }));
            if (['failure', 'wrong-account', 'inactive'].includes(scenario.name)) {
                assert.deepEqual(result.stored, result.old, scenario.name + ' preserves all cached data and freshness');
                assert.equal(result.saved, false);
                assert.equal(result.fetches, scenario.name === 'inactive' ? 0 : 1);
            } else if (scenario.name === 'race') {
                assert.equal(result.stored.point, 10);
                assert.equal(result.stored.count, 2);
                assert.equal(result.stored.due, '2099-10-20T00:00:00.000Z');
                assert.equal(result.stored.fetchedAt, 200);
            } else {
                assert.equal(result.fetches, 1);
                assert.equal(result.url, root + 'mod/quiz/view.php?id=101');
                assert.equal(result.stored.point, scenario.point, scenario.name + ' uses the overview aggregate');
                assert.equal(result.stored.status, scenario.expected, scenario.name);
                assert.equal(result.stored.count, 2);
                assert.equal(result.stored.show, false);
                assert(result.stored.fetchedAt > 100, 'Actual overview fetch updates freshness');
            }
        }
        assert.deepEqual(errors, []);
        console.log('PASS quiz parsing: Japanese/English dates, unknown settings, limits, scoped review grades, four grading methods, concurrent refresh, and failures');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
