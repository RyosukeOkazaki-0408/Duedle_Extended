// Real DOM and extension verification with synthetic pages; no Moodle requests.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
(async () => {
    const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-review-fixes-')), {
        headless: true, ignoreDefaultArgs: ['--disable-extensions'],
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--enable-unsafe-extension-debugging'], viewport: { width: 390, height: 844 }
    });
    let user = 11;
    let delayedIdentity = false;
    const errors = [];
    try {
        await context.route('**/*', route => {
            const requested = route.request().url();
            const courseFetch = requested.startsWith(root + 'course/view.php');
            const taskFetch = requested.startsWith(root + 'mod/assign/view.php');
            if (route.request().resourceType() !== 'document' && !courseFetch && !taskFetch) return route.abort();
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
                body{margin:0;color:#1d2125;background:white}main{padding:12px}.que .info{background:#f8f9fa}.que .formulation{background:#e7f3f5;color:#00242b}.que .outcome{background:#fff1dc;color:#996a27}
                </style></head><body>${user ? `<script>var M={};M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="${delayedIdentity ? "" : user}"></div>` : ''}<nav id="usernavigation"></nav><header><h1>Course</h1></header><main id="region-main">
                ${courseFetch ? `<a href="${root}mod/assign/view.php?id=1">課題</a>` : ''}
                ${taskFetch ? `<h2>取得した課題</h2><div class="submissionstatustable"><div class="submissionstatussubmitted">提出済み</div><div class="fileuploadsubmission"><a>${user === 11 ? 'a-private.pdf' : 'b-private.pdf'}</a></div></div>` : ''}
                <div class="que"><div class="info">問題 1<br>正解 5/5</div><div class="formulation"><div class="qtext"><p>問題文 <span style="color:#c00000">赤い強調</span></p><table style="background:white;color:black!important"><tr><td>教員の表</td></tr></table></div><div class="answer"><label><input type="checkbox" checked disabled>選択肢</label><i class="icon text-success">✓</i></div></div><div class="outcome"><div class="generalfeedback">正解です。</div></div></div>
                <div id="intro" class="generalbox"><span style="background:#ffff00;color:#000000">教員の説明</span></div>
                </main>${delayedIdentity ? `<script>setTimeout(()=>document.getElementById("nav-notification-popover-container").setAttribute("data-userid","${user}"),500);</script>` : ""}</body></html>` });
        });
        // Run the scrapers and list renderer against a real DOM, outside extension URLs.
        const probe = await context.newPage();
        await probe.goto('https://example.invalid/');
        for (const file of ['common/utils.js', 'storage/class/scrape/Scrape.js', 'storage/class/scrape/ScrapeAssign.js', 'storage/class/scrape/ScrapeQuiz.js', 'storage/class/task/TaskBox.js', 'storage/class/task/AssignBox.js', 'storage/class/task/QuizBox.js']) {
            await probe.addScriptTag({ path: path.resolve('src', file) });
        }
        const scrape = await probe.evaluate(root => {
            const doc = html => new DOMParser().parseFromString('<h1>Course</h1><h2>Task</h2>' + html, 'text/html');
            const status = (html, id = 1) => ScrapeAssign.getData(doc(html), root + 'mod/assign/view.php?id=' + id).status;
            const draft = status('<table class="submissionstatustable"><tr><td class="submissionstatusdraft">下書き</td></tr><tr><td class="fileuploadsubmission"><a>draft.pdf</a></td></tr></table>');
            const online = status('<table class="submissionstatustable"><tr><td class="submissionstatussubmitted">提出済み</td></tr><tr><td class="onlinetextsubmission">本文</td></tr></table>');
            const initial = status('<div class="submissionstatustable"><table><tr><td>提出ステータス</td><td>まだ提出されていません。</td></tr></table></div>');
            const offline = status('<div class="submissionstatustable"><table><tr><td>Submission status</td><td>This assignment does not require you to submit anything online</td></tr></table></div>');
            const unknown = status('<div class="submissionstatustable"><div class="fileuploadsubmission"><a>unconfirmed.pdf</a></div></div>');
            const quizDoc = doc('<div class="activity-description"><table><tr><td>説明</td></tr><tr><td>説明2</td></tr></table></div><p class="text-left">受験可能回数: 1</p>');
            const quiz = ScrapeQuiz.getData(quizDoc, root + 'mod/quiz/view.php?id=1');
            quizDoc.body.insertAdjacentHTML('beforeend', '<table class="quizattemptsummary"><thead><tr><th>回数</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>');
            const attempted = ScrapeQuiz.getData(quizDoc, root + 'mod/quiz/view.php?id=1');
            const now = Date.now();
            return { draft, online, initial, offline, unknown, count: quiz.count, attempted: attempted.count,
                overdue: Scrape.statusAt('incomplete', now - 1, now), warning: Scrape.statusAt('incomplete', now + 3600000, now),
                complete: Scrape.statusAt('complete', now - 1, now), undated: Scrape.statusAt('expired', null, now) };
        }, root);
        assert.deepEqual(scrape, { draft: 'incomplete', online: 'complete', initial: 'incomplete', offline: 'unknown', unknown: 'unknown', count: 0, attempted: 2, overdue: 'expired', warning: 'warning', complete: 'complete', undated: 'incomplete' });
        await probe.evaluate(() => {
            globalThis.settings = { selectedShow: 'all', selectedStatus: 'all' };
            globalThis.ext = { storage: { sync: { get: async () => settings } } };
            globalThis.colorTypesValue = []; globalThis.rerender = async () => {};
            document.body.innerHTML = '<div id="display"></div>';
        });
        await probe.addScriptTag({ path: path.resolve('src/storage/display/displaybox.js') });
        const list = await probe.evaluate(async root => {
            const task = { group: 'assign_list', assignId: 1, courseName: 'Course', assignName: '第1回課題', show: true, status: 'incomplete', due: Date.now() + 3600000 };
            settings.selectedStatus = 'incomplete'; const warning = await displaybox([task]);
            settings.selectedStatus = 'expired'; const overdue = await displaybox([{ ...task, due: Date.now() - 3600000 }]);
            document.body.insertAdjacentHTML('beforeend', '<div class="event"><a href="' + root + 'mod/assign/view.php?id=101">第1回課題</a></div>');
            const event = document.querySelector('.event'); const before = event.querySelector('a').href;
            changeAct({ ...task, assignId: 202, status: 'complete' });
            const wrongColored = event.classList.contains('complete');
            changeAct({ ...task, assignId: 101, status: 'complete' });
            return { warning, overdue, before, after: event.querySelector('a').href, wrongColored, correctColored: event.classList.contains('complete') };
        }, root);
        assert.equal(list.warning, 1); assert.equal(list.overdue, 1);
        assert.equal(list.before, list.after); assert(!list.wrongColored && list.correctColored);
        const calendar = await probe.evaluate(root => {
            const task = {group:'assign_list',assignId:101,assignName:'レポート提出',status:'complete'};
            const quiz = {group:'quiz_list',quizId:202,quizName:'宿題 : Grammar [2]',status:'qualify'};
            document.body.innerHTML = `<div class="event" id="calendar-assign"><a data-type="event" data-action="view-event" href="${root}calendar/view.php?view=day#event_1">「レポート提出」の提出期限</a></div><div class="event" id="calendar-quiz"><a data-type="event" data-action="view-event" href="${root}calendar/view.php?view=day#event_2">宿題 : Grammar [2] の受験可能期間の終了</a></div>`;
            const event = document.querySelector('#calendar-assign');
            const url = event.querySelector('a').href;
            changeAct(task,[task,{...task,assignId:999}]);
            const ambiguous = event.classList.contains('complete');
            changeAct({...task,assignId:999,assignName:'レポート'},[task]);
            const partial = event.classList.contains('complete');
            changeAct(task,[task,quiz]); changeAct(quiz,[task,quiz]);
            return {ambiguous,partial,complete:event.classList.contains('complete'),qualify:document.querySelector('#calendar-quiz').classList.contains('qualify'),sameLink:url===event.querySelector('a').href};
        },root);
        assert.deepEqual(calendar,{ambiguous:false,partial:false,complete:true,qualify:true,sameLink:true});
        await probe.close();

        const cdp = await context.browser().newBrowserCDPSession();
        const loaded = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('src') });
        const a = await context.newPage(); a.on('pageerror', e => errors.push(e.message));
        await a.goto(root + 'my/'); await a.waitForSelector('#scrapebutton');
        const worker = context.serviceWorkers().find(worker => worker.url().includes(loaded.id)); assert(worker);
        await worker.evaluate(() => chrome.storage.local.set({ assign_list: [{ group: 'assign_list', assignId: 1, courseName: 'Course A', assignName: 'A private task', file: 'a-private.pdf', filenum: 1, status: 'complete', show: true }], courseIds: [7], history: [{ title: 'Private A', url: 'https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=1' }] }));
        await a.waitForSelector('#display > .assign');
        await a.locator('#scrapebutton').click();
        await a.waitForFunction(() => document.querySelector('#display').textContent.includes('取得した課題'), null, {timeout:10000}).catch(async error => {
            console.error('Manual refresh state:', await a.locator('#collectionstatus').innerText(), await worker.evaluate(()=>chrome.storage.local.get(['assign_list','refreshHistory'])));
            throw error;
        });
        assert((await a.locator('#display').innerText()).includes('a-private.pdf'));
        assert(await worker.evaluate(async () => {
            const stored = await chrome.storage.local.get(['assign_list', 'refreshHistory']);
            return stored.assign_list[0].fetchedAt > 0 && stored.refreshHistory.fullSweepAt > 0;
        }), 'Manual refresh reads and saves pages with standard Moodle notification identity');
        user = 22;
        const b = await context.newPage(); b.on('pageerror', e => errors.push(e.message));
        await b.goto(root + 'my/'); await b.waitForSelector('#scrapebutton');
        await a.waitForFunction(() => !document.querySelector('#display > .assign'));
        assert(await a.locator('#scrapebutton').isDisabled());
        assert(!(await b.locator('body').innerText()).includes('a-private.pdf'));
        assert.equal(await b.locator('#display > .assign').count(), 0);
        await worker.evaluate(() => chrome.storage.local.set({ assign_list: [{ group: 'assign_list', assignId: 1, courseName: 'Course B', assignName: 'B private task', status: 'complete', show: true }], thememode: 1 }));
        await b.waitForSelector('#display > .assign');
        assert(!(await a.locator('body').innerText()).includes('B private task'), 'Inactive pages cannot receive the new account cache');
        user = 11;
        await a.reload(); await a.waitForSelector('#display > .assign');
        assert((await a.locator('#display').innerText()).includes('a-private.pdf'));
        assert(!(await a.locator('#display').innerText()).includes('B private task'));

        await a.goto(root + 'mod/quiz/review.php?attempt=1&cmid=9');
        await a.waitForSelector('.qtext.duedle-authored-content');
        await a.waitForFunction(() => document.body.classList.contains('darkmode'));
        const colors = await a.evaluate(() => Object.fromEntries(['.info', '.formulation', '.outcome', '.qtext', '.answer', '#intro', '.qtext span', '.qtext table'].map(selector => {
            const style = getComputedStyle(document.querySelector(selector)); return [selector, [style.backgroundColor, style.color]];
        })));
        assert.deepEqual(colors['.info'], ['rgb(38, 53, 65)', 'rgb(221, 221, 223)']);
        assert.deepEqual(colors['.formulation'], ['rgb(36, 60, 70)', 'rgb(221, 221, 223)']);
        assert.equal(colors['.qtext'][0], 'rgba(0, 0, 0, 0)');
        assert.equal(colors['.qtext'][1], 'rgb(221, 221, 223)');
        assert.deepEqual(colors['.answer'], colors['.qtext']); assert.deepEqual(colors['#intro'], colors['.qtext']);
        assert.notEqual(colors['.qtext span'][1], 'rgb(192, 0, 0)', 'Dark red is brightened for dark backgrounds');
        assert.deepEqual(colors['.qtext table'], ['rgb(38, 53, 65)', 'rgb(221, 221, 223)']);
        await a.evaluate(() => {
            const dynamic = document.createElement('div'); dynamic.className = 'qtext'; dynamic.id = 'late-question';
            dynamic.textContent = '後から追加された問題文'; document.querySelector('.formulation').append(dynamic);
        });
        await a.waitForSelector('#late-question.duedle-authored-content');
        await a.screenshot({ path: '/private/tmp/duedle-quiz-dark-fixed.png', fullPage: true });
        await a.locator('#thememode_selection').click();
        assert.equal(await a.locator('[data-mode="page-original"]').count(),0);
        await a.locator('[data-mode="2"]').click();
        await a.waitForFunction(() => !document.body.classList.contains('darkmode'));
        await a.waitForFunction(() => getComputedStyle(document.querySelector('.qtext table')).color === 'rgb(0, 0, 0)');
        assert.equal(await a.locator('.qtext table').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)', 'Light mode restores inline colors');
        await worker.evaluate(() => chrome.storage.local.set({thememode:1,originalPages:['/moodle40a/mod/quiz/view.php?id=1','/moodle40a/mod/quiz/review.php']}));
        await a.reload(); await a.waitForSelector('#thememode_selection');
        assert.equal(await a.locator('[data-mode="page-original"]').count(),0,'Removed page theme exception is absent');
        await a.waitForFunction(() => document.body.classList.contains('darkmode'));
        await a.goto(root + 'my/'); await a.waitForFunction(() => document.body.classList.contains('darkmode'));
        assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('thememode')).thememode),1,'Old page exceptions do not override the selected theme');
        user = null;
        await b.reload(); await b.waitForSelector('#scrapebutton');
        await b.waitForFunction(() => document.querySelector('#scrapebutton').disabled);
        assert.equal(await b.locator('#display > .assign').count(), 0, 'No identity means no personal data');
        assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('duedleAccount')).duedleAccount), '11', 'Unknown markup does not clear the active cache');
        await b.goto(root + 'login/index.php');
        await a.waitForFunction(() => !document.querySelector('#display > .assign'));
        user = 11; delayedIdentity = true;
        await a.reload(); await a.waitForSelector('#display > .assign');
        assert((await a.locator('#display').innerText()).includes('a-private.pdf'), 'Late navigation identity restores the account before reads');
        assert.deepEqual(errors, []);
        console.log('PASS review fixes: draft/online/initial submission; exact deadlines and filters; quiz table count; stable links; account isolation; paired dark panels, author colors and dynamic content; removed page theme exception and ignored legacy preferences');
    } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
