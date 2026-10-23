// Synthetic detail pages only; exercise the production parsers, storage merge,
// and cards with the clock fixed to the reported incident. No live Moodle data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ timezoneId: 'Asia/Tokyo' });
        await page.clock.install({ time: new Date('2026-10-21T19:33:44+09:00') });
        await page.route('**/*', route => route.abort());
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const file of ['common/utils.js', 'storage/class/scrape/Scrape.js',
            'storage/class/scrape/ScrapeAssign.js', 'storage/class/scrape/ScrapeQuiz.js',
            'storage/class/StorageUtil.js', 'storage/class/task/TaskBox.js', 'storage/class/task/AssignBox.js']) {
            await page.addScriptTag({ path: path.resolve('src', file) });
        }
        const count = await page.evaluate(async () => {
            let checks = 0;
            const equal = (actual, expected, name) => {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
                }
                checks++;
            };
            const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
            const opening = '2026年10月22日(木曜日) 00:00';
            const closing = '2026年10月28日(水曜日) 23:59';
            const startISO = '2026-10-21T15:00:00.000Z';
            const dueISO = '2026-10-28T14:59:00.000Z';
            const block = rows => `<div class="description-inner">${rows.map(text => `<div>${text}</div>`).join('')}</div>`;
            const dates = (rows, nested = false) => nested
                ? `<div class="description-inner"><div class="activity-dates">${rows.map(text => `<div>${text}</div>`).join('')}</div></div>`
                : block(rows);
            const documentFor = (html, status = 'まだ提出されていません。', extra = '') => new DOMParser().parseFromString(
                `<html lang="ja"><body class="course-7"><h1>Course</h1><h2>Task</h2>${html}
                <div class="submissionstatustable"><table><tr><th>提出ステータス</th><td>${status}</td></tr></table>${extra}</div>
                </body></html>`, 'text/html');
            const assign = (html, status, extra) => ScrapeAssign.getData(documentFor(html, status, extra), root + 'mod/assign/view.php?id=102');
            const pair = data => [data.start, data.due];
            const cases = [
                ['scheduled opening only', [`<strong>開始予定:</strong> ${opening}`], startISO, null],
                ['scheduled closing only', [`終了予定： ${closing}`], null, dueISO],
                ['scheduled pair', [`開始予定: ${opening}`, `終了予定: ${closing}`], startISO, dueISO],
                ['opened and closed labels', [`開始済み: ${opening}`, `終了済み: ${closing}`], startISO, dueISO],
                ['opened only', [`開始済み： ${opening}`], startISO, null],
                ['closed only', [`<strong>終了済み:</strong> ${closing}`], null, dueISO],
                ['reversed labels', [`提出期限: ${closing}`, `開始予定: ${opening}`], startISO, dueISO],
                ['ordinary Japanese', [`開始: ${opening}`, `終了: ${closing}`], startISO, dueISO],
                ['datetime labels', [`開始日時: ${opening}`, `終了日時: ${closing}`], startISO, dueISO],
                ['deadline only', [`提出期限: ${closing}`], null, dueISO],
                ['English', ['Opened: Thursday, 22 October 2026, 12:00 AM', 'Due: Wednesday, 28 October 2026, 11:59 PM'], startISO, dueISO],
                ['English opening only', ['Opens: October 22, 2026, 12:00 AM'], startISO, null],
                ['English closing only', ['Closes: October 28, 2026, 11:59 PM'], null, dueISO],
                ['bare Japanese pair', [opening, closing], startISO, dueISO],
                ['bare Japanese deadline', [closing], null, dueISO],
                ['bare English pair', ['Thursday, 22 October 2026, 12:00 AM', 'October 28, 2026, 11:59 PM'], startISO, dueISO],
                ['bare English deadline', ['28 October 2026, 23:59'], null, dueISO],
                ['unknown label', [`公開予定: ${opening}`], null, null],
                ['unknown English label', ['Available after: October 22, 2026, 12:00 AM'], null, null],
                ['unknown label plus bare date', [`公開予定: ${opening}`, closing], null, null],
                ['prose', [`授業日は ${opening} です。`], null, null],
                ['bare date followed by prose', [`${opening} に受付開始`], null, null],
                ['unknown opening with known due', [`公開予定: ${opening}`, `期限: ${closing}`], null, dueISO],
                ['known opening with unknown due', [`開始予定: ${opening}`, `受付終了予定: ${closing}`], startISO, null],
                ['machine timestamp', ['開始予定: <time datetime="2026-10-22T00:00:00+09:00">unreadable</time>'], startISO, null],
                ['plain opening and machine closing', [`開始予定: ${opening}`, `終了予定: <time datetime="2026-10-28T23:59:00+09:00">${closing}</time>`], startISO, dueISO],
                ['plain closing and machine opening reversed', [`終了予定: ${closing}`, `開始予定: <time datetime="2026-10-22T00:00:00+09:00">${opening}</time>`], startISO, dueISO],
                ['missing opening must not borrow closing', ['開始予定: 不明', `終了予定: ${closing}`], null, dueISO],
                ['missing closing must not borrow opening', ['終了予定: 不明', `開始予定: ${opening}`], startISO, null],
                ['invalid opening must not borrow machine closing', ['開始予定: 2026年2月31日 00:00', `終了予定: <time datetime="2026-10-28T23:59:00+09:00">${closing}</time>`], null, dueISO],
                ['two machine timestamps', ['開始予定: <time datetime="2026-10-22T00:00:00+09:00">unreadable</time>', '終了予定: <time datetime="2026-10-28T23:59:00+09:00">unreadable</time>'], startISO, dueISO],
                ['date in child of labelled row', [`<strong>開始予定:</strong><div>${opening}</div>`, `<strong>終了予定:</strong><div><time datetime="2026-10-28T23:59:00+09:00">${closing}</time></div>`], startISO, dueISO],
                ['deeply wrapped labelled rows', [`<div><div>開始予定: ${opening}</div></div>`, `<div><div>終了予定: <time datetime="2026-10-28T23:59:00+09:00">${closing}</time></div></div>`], startISO, dueISO],
                ['bare opening and machine closing', [opening, `<time datetime="2026-10-28T23:59:00+09:00">${closing}</time>`], startISO, dueISO],
                ['invalid machine timestamp uses display', [`終了予定: <time datetime="invalid">${closing}</time>`], null, dueISO],
                ['invalid calendar date', ['終了予定: 2026年2月31日 23:59'], null, null],
                ['invalid time', ['終了予定: 2026年10月28日 25:00'], null, null],
                ['empty date', ['開始予定:'], null, null],
                ['no dates', [], null, null]
            ];
            for (const [name, rows, start, due] of cases) {
                for (const nested of [false, true]) {
                    const html = dates(rows, nested);
                    equal(pair(assign(html)), [start, due], `assignment ${name}, nested=${nested}`);
                    const quiz = ScrapeQuiz.getData(documentFor(html + '<div class="quizattempt"></div>'), root + 'mod/quiz/view.php?id=103');
                    equal(pair(quiz), [start, due], `quiz ${name}, nested=${nested}`);
                }
            }

            // The prose is class-dependent and must not supply a global deadline.
            const reported = dates([`<strong>開始予定:</strong> ${opening}`], true)
                + '<div id="intro">提出期限は各クラスの授業後の１週間内とします。例：10/22授業なら10/28 23:59まで。</div>';
            const fresh = assign(reported);
            equal(pair(fresh), [startISO, null], 'reported task dates');
            equal([fresh.status, fresh.file, fresh.filenum], ['incomplete', '?', 0], 'reported submission');
            equal(assign(reported, '<span class="submissionstatussubmitted">提出済み</span>').status, 'complete', 'submitted stays complete');
            const draft = assign(reported, '<span class="submissionstatusdraft">下書き</span>', '<div class="fileuploadsubmission"><a>report.pdf</a></div>');
            equal([draft.status, draft.file, draft.filenum], ['incomplete', 'report.pdf', 1], 'draft file is not submitted');
            equal(assign(reported, 'unrecognized state').status, 'unknown', 'unknown submission stays unknown');
            for (const [deadline, status] of [['2026年10月21日 19:33', 'expired'], ['2026年10月22日 00:00', 'warning'], [closing, 'incomplete']]) {
                equal(assign(dates([`提出期限: ${deadline}`])).status, status, `deadline status ${status}`);
                equal(assign(dates([`提出期限: ${deadline}`]), '<span class="submissionstatussubmitted">提出済み</span>').status,
                    'complete', `submitted with ${status} deadline`);
            }
            const now = Date.now();
            const past = '2026年10月20日 23:59';
            const closedHTML = dates([`開始済み: 2026年10月19日 00:00`, `終了済み: ${past}`], true);
            const closed = assign(closedHTML);
            equal(closed.status, 'expired', 'closed pending assignment expires');
            equal(closed.due, '2026-10-20T14:59:00.000Z', 'closed deadline is retained');
            equal(assign(closedHTML, '<span class="submissionstatussubmitted">提出済み</span>').status,
                'complete', 'closed submitted assignment stays complete');
            equal(assign(closedHTML, 'unrecognized state').status, 'unknown', 'closure alone cannot prove non-submission');
            const closedQuiz = ScrapeQuiz.getData(documentFor(closedHTML + '<div class="quizattempt"></div>'), root + 'mod/quiz/view.php?id=103');
            equal(closedQuiz.status, 'expired', 'closed unattempted quiz expires');
            const repaired = StorageUtil.mergeTask([{ ...closed, status: 'unknown', due: null, show: false }], 'assignId', closed)[0];
            equal([repaired.status, repaired.due, repaired.show, repaired.needsDetailRetry],
                ['expired', closed.due, false, undefined], 'unknown cache repaired by closed detail');
            const reopened = assign(dates([`開始済み: 2026年10月19日 00:00`, `終了予定: ${closing}`], true));
            equal(StorageUtil.mergeTask([repaired], 'assignId', reopened)[0].status,
                'incomplete', 'extended deadline restores incomplete status');
            for (const [offset, status] of [[-1, 'expired'], [0, 'warning'], [3 * 86400000, 'warning'], [3 * 86400000 + 1, 'incomplete']]) {
                equal(Scrape.statusAt('incomplete', new Date(now + offset), now), status, `warning boundary ${offset}`);
            }
            for (const status of ['complete', 'qualify', 'stuck', 'unknown']) {
                equal(Scrape.statusAt(status, new Date(now - 1), now), status, `preserve ${status}`);
            }

            const old = { ...fresh, start: null, due: startISO, status: 'warning', show: false };
            const unrelated = { ...old, assignId: 999 };
            const merged = StorageUtil.mergeTask([old, unrelated], 'assignId', fresh);
            equal([merged[0].start, merged[0].due, merged[0].status, merged[0].show],
                [startISO, null, 'incomplete', false], 'refresh removes stale deadline and keeps visibility');
            equal(merged[1], unrelated, 'other task remains intact');
            globalThis.ext = { storage: { sync: { get: async () => ({ selectedShow: 'all' }) } } };
            const card = await new AssignBox(merged[0]).getElement();
            equal(card.querySelector('.li2').textContent, '期限: ?', 'unknown deadline rendered');
            equal(card.querySelector('.liRemain').textContent, '残り時間: 不明', 'no countdown to opening time');
            equal(card.querySelector('.liStatus').textContent, '状態: 未完了', 'no spurious warning');
            equal(card.classList.contains('warning'), false, 'warning color removed');
            equal(card.querySelector('.taskbox a').href, root + 'mod/assign/view.php?id=102', 'detail link preserved');
            return checks;
        });
        assert.deepEqual(errors, []);
        console.log(`PASS activity dates: ${count} checks covering assignments, quizzes, saved data, and cards`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
