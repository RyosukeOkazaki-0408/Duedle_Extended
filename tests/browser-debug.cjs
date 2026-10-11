// Optional integration check: NODE_PATH=<playwright modules> node tests/browser-debug.cjs
// Uses only a temporary Chrome profile and the offline developer build.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-browser-'));
    const context = await chromium.launchPersistentContext(profile, {
        headless: true, ignoreDefaultArgs: ['--disable-extensions'],
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--enable-unsafe-extension-debugging']
    });
    const errors = [];
    const requests = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    context.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    try {
        const cdp = await context.browser().newBrowserCDPSession();
        const {id} = await cdp.send('Extensions.loadUnpacked', {path: path.resolve('build/debug')});
        const url = `chrome-extension://${id}/dev/index.html`;
        const page = await context.newPage();
        await page.goto(url);
        const saved = () => page.evaluate(() => ext.storage.local.get(null));
        const control = (action, value) => page.evaluate(async ({action,value}) => {
            const reply = await chrome.runtime.sendMessage({type:'DEBUG_CONTROL',action,value});
            if (!reply.ok) throw new Error(reply.error);
        }, {action,value});
        const waitFinish = async since => {
            for (let attempt=0; attempt<300; attempt++) {
                const state = await saved();
                if (state.refreshHistory?.attempt?.at > since && !state.refreshCoordinator?.lease) return;
                await page.waitForTimeout(100);
            }
            throw new Error('Refresh did not finish: '+JSON.stringify(await saved()));
        };
        const manual = async () => {
            const before = (await saved()).refreshHistory?.attempt?.at || 0;
            await page.locator('#manual-now').click(); await waitFinish(before);
            await page.waitForTimeout(900);
        };
        await page.waitForFunction(() => document.querySelector('#display')?.textContent.includes('課題情報が取得されていません'));
        assert(await page.locator('#display').isVisible());
        await manual();
        assert.equal(await page.locator('#display > div').count(), 3);
        const successful = (await saved()).refreshHistory.fullSweepAt;
        assert(successful > 0);
        assert(await page.locator('#scrapebutton').isDisabled());
        // Explicit OFF persists after reload and across tabs.
        await page.locator('#displaybutton').click(); await page.reload();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#display').isVisible(), false);
        const second = await context.newPage(); await second.goto(url); await second.waitForTimeout(500);
        assert.equal(await second.locator('#display').isVisible(), false);
        await page.locator('#displaybutton').click();
        await second.waitForFunction(() => !document.querySelector('#display').hidden);
        await second.close(); await page.bringToFront();
        // Filter changes do not initiate Moodle-shaped requests.
        const beforeRequests = await page.evaluate(() => debugRequests.length);
        await page.selectOption('#statusSelect', 'complete'); await page.waitForTimeout(400);
        assert.match(await page.locator('#display').innerText(), /条件に一致/);
        assert.equal(await page.evaluate(() => debugRequests.length), beforeRequests);
        await page.selectOption('#statusSelect', 'all');
        // A failed save retains both prior details and completed timestamp.
        const oldTasks = JSON.stringify((await saved()).assign_list);
        await control('scenario','save-failure'); await manual();
        assert.equal((await saved()).refreshHistory.fullSweepAt,successful);
        assert.equal(JSON.stringify((await saved()).assign_list),oldTasks);
        assert.match(await page.locator('#collectionstatus').innerText(), /失敗/);
        await control('scenario','login'); await manual();
        assert.match(await page.locator('#collectionstatus').innerText(), /ログイン/);
        // Successful zero remains distinguishable from never fetched.
        await control('reset'); await page.reload(); await page.waitForTimeout(500);
        await control('scenario','empty'); await manual();
        await page.waitForFunction(() => document.querySelector('#display').textContent.includes('条件に一致する課題はありません'));
        assert.match(await page.locator('#display').innerText(), /条件に一致する課題はありません/);
        // Real scheduler claim/collector path with the wait alone bypassed.
        await control('reset'); await page.reload(); await page.waitForTimeout(500);
        await page.locator('#auto-now').click(); await waitFinish(0);
        await page.waitForTimeout(900);
        assert((await saved()).refreshHistory.calendarAt > 0);
        assert.equal(await page.locator('#display > div').count(),3);
        assert.match(await page.locator('#listupdated').innerText(),/最終更新：/);
        assert.equal(requests.length,0,'No HTTP request may escape the developer extension');
        assert.deepEqual(errors,[]);
        if (process.env.SCREENSHOT_PATH) await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
        console.log('PASS browser: first use, manual refresh, cooldown, OFF persistence, multi-tab settings, filters, save failure, login expiry, zero result, automatic refresh, network isolation');
    } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
