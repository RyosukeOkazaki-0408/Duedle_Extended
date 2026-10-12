// Real Chrome permissions and collection tabs; all web responses are synthetic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';

(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-permissions-'));
    const context = await chromium.launchPersistentContext(profile, {
        headless: true, ignoreDefaultArgs: ['--disable-extensions'],
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--enable-unsafe-extension-debugging']
    });
    let redirect = null;
    try {
        await context.route('**/*', route => {
            const url = route.request().url();
            if (route.request().resourceType() !== 'document') return route.abort();
            if (url === root + 'course/view.php?id=1' && redirect) {
                return route.fulfill({ status: 302, headers: { location: redirect }, body: '' });
            }
            const content = url.includes('/course/view.php')
                ? '<a href="' + root + 'mod/assign/view.php?id=10">課題</a><a href="' + root + 'mod/quiz/view.php?id=20">小テスト</a>'
                : '<h2>テスト活動</h2><div class="submissionstatustable"><div class="submissionstatussubmitted">提出済み</div></div>';
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Fixture</title></head><body class="course-1"><div id="nav-notification-popover-container" data-userid="1"></div><nav id="usernavigation"></nav><main id="region-main"><h1>テストコース</h1>' + content + '</main></body></html>' });
        });
        const cdp = await context.browser().newBrowserCDPSession();
        const loaded = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('src') });
        const owner = await context.newPage();
        await owner.goto(root + 'my/');
        await owner.waitForSelector('#scrapebutton');
        const worker = context.serviceWorkers().find(w => w.url().includes(loaded.id));
        assert(worker);
        assert.deepEqual(await worker.evaluate(() => chrome.runtime.getManifest().permissions), ['storage']);

        // The host grant exposes Moodle URLs, but not unrelated browsing metadata.
        const outside = await context.newPage();
        await outside.goto('https://example.invalid/private');
        const outsideTab = await worker.evaluate(async () => {
            const tabs = await chrome.tabs.query({});
            return tabs.filter(tab => !tab.url && !tab.pendingUrl).map(tab => ({ id: tab.id, title: tab.title, url: tab.url }));
        });
        assert(outsideTab.length > 0 && outsideTab.every(tab => tab.title === undefined && tab.url === undefined), 'Unrelated tab titles and URLs stay hidden');
        await outside.close();

        const collect = async () => worker.evaluate(async () => {
            await chrome.storage.local.set({ courseIds: [1], scrapeCooldown: null });
            const [tab] = await chrome.tabs.query({ url: 'https://cms7.ict.nitech.ac.jp/moodle40a/my/' });
            const saved = await chrome.storage.local.get('duedleAccountTabs');
            const account = saved.duedleAccountTabs[tab.id];
            const sender = { tab, url: tab.url, frameId: 0, documentId: account.documentId };
            try {
                return await collectTabWithLease({ accountId: account.accountId, pageId: account.pageId }, sender);
            } catch (error) {
                return { ok: false, error: error.message };
            }
        });
        const initialCount = await worker.evaluate(async () => (await chrome.tabs.query({})).length);
        const result = await collect();
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.result.saved, 2, JSON.stringify(result));
        assert.equal(result.result.failed, 0, JSON.stringify(result));
        assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({})).length), initialCount, 'Successful collection closes its tab');
        const stored = await worker.evaluate(() => chrome.storage.local.get(['assign_list', 'quiz_list']));
        assert.equal(stored.assign_list[0].assignId, 10);
        assert.equal(stored.quiz_list[0].quizId, 20);

        for (const destination of [root + 'login/index.php', 'https://example.invalid/login']) {
            // A Moodle login page correctly invalidates the signed-in projection.
            await owner.reload();
            await owner.waitForSelector('#scrapebutton');
            redirect = destination;
            const failure = await collect();
            assert.equal(failure.ok, false, JSON.stringify(failure));
            assert.match(failure.error, /ログイン/, destination);
            assert.equal(await worker.evaluate(async () => (await chrome.tabs.query({})).length), initialCount, 'Redirect failure closes its collection tab');
        }
        console.log('PASS restricted permissions: unrelated tab metadata hidden; assignment/quiz tab collection and login/external redirect cleanup');
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
