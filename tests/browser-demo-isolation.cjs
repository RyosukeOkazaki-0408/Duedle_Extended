// Real extension/background/content scripts; both Moodle sites are synthetic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const university = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const demo = 'https://duedle-35-184-191-167.sslip.io/moodle40a/';
(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-demo-isolation-'));
    const context = await chromium.launchPersistentContext(profile, {
        headless: true, ignoreDefaultArgs: ['--disable-extensions'],
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: ['--enable-unsafe-extension-debugging']
    });
    try {
        await context.route('**/*', route => route.request().resourceType() === 'document'
            ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script>var M={};M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="5"></div><nav id="usernavigation"></nav><header><h1>Course</h1></header><main id="region-main"></main></body></html>' })
            : route.abort());
        const cdp = await context.browser().newBrowserCDPSession();
        const loaded = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('src') });
        const page = await context.newPage();
        await page.goto(university + 'my/');
        await page.waitForSelector('#startSelect', { state: 'attached' });
        const worker = context.serviceWorkers().find(worker => worker.url().includes(loaded.id));
        assert(worker);
        const waitAccount = account => worker.evaluate(account => new Promise((resolve, reject) => {
            let attempts = 100;
            const check = async () => {
                const state = await chrome.storage.local.get('duedleAccount');
                if (state.duedleAccount === account) resolve();
                else if (--attempts) setTimeout(check, 25);
                else reject(new Error('Account was not registered'));
            }; check();
        }), account);
        const save = name => worker.evaluate(name => chrome.storage.local.set({ assign_list: [{
            group: 'assign_list', assignId: 18, courseId: 6, courseName: 'Course',
            assignName: name, show: true, status: 'incomplete', start: null, due: null,
        }] }), name);
        await waitAccount('5');
        await save('University-only task');
        await page.getByText('University-only task', { exact: true }).waitFor();
        const demoPage = await context.newPage();
        await demoPage.goto(demo + 'my/');
        await demoPage.waitForSelector('#startSelect', { state: 'attached' });
        await waitAccount(new URL(demo).origin + ':5');
        assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('assign_list')).assign_list), []);
        await save('Demo-only task');
        await demoPage.getByText('Demo-only task', { exact: true }).waitFor();
        assert.equal(await demoPage.getByText('University-only task', { exact: true }).count(), 0);
        await demoPage.locator('#startSelect').selectOption('week');
        await demoPage.reload();
        await demoPage.waitForFunction(() => document.querySelector('#startSelect')?.value === 'week');
        await page.reload();
        await waitAccount('5');
        await page.getByText('University-only task', { exact: true }).waitFor();
        assert.equal(await page.getByText('Demo-only task', { exact: true }).count(), 0);
        await demoPage.reload();
        await waitAccount(new URL(demo).origin + ':5');
        await demoPage.getByText('Demo-only task', { exact: true }).waitFor();
        console.log('PASS Chrome extension: explicit demo host injection, same-user/same-task-ID isolation, both site caches restored, start filter persisted on reload');
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
