// Uses an isolated profile and synthetic Moodle responses; never contacts Moodle.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
(async () => {
    const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-prod-')), {
        headless:true, ignoreDefaultArgs:['--disable-extensions'],
        executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args:['--enable-unsafe-extension-debugging'], colorScheme:'dark'
    });
    const errors=[];
    try {
        const cdp=await context.browser().newBrowserCDPSession();
        const loaded=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
        let requests=0;
        await context.route('**/*', route => {
            requests++;
            if (route.request().resourceType()!=='document') return route.abort();
            return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><head><title>Moodle fixture</title></head><body><script>var M={}; M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="1"></div><header><h1>テストコース</h1></header><main id="region-main"></main></body></html>'});
        });
        const page=await context.newPage();
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/my/');
        await page.waitForFunction(()=>document.documentElement.style.opacity==='1');
        await page.evaluate(()=>{
            const navigation=document.createElement('nav');
            navigation.id='usernavigation';
            document.body.prepend(navigation);
        });
        await page.waitForSelector('#thememode_selection');
        const chooseTheme = async value => {
            if((await page.locator('#thememode_selection').getAttribute('aria-expanded'))!=='true') await page.locator('#thememode_selection').click();
            await page.locator('#duedle-theme-menu button[data-mode="'+value+'"]').click();
            if(value==='ios-toggle') await page.keyboard.press('Escape');
        };
        assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'2');
        assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('darkmode')),false);
        assert(await page.locator('#display').isVisible());
        await chooseTheme('1');
        await page.evaluate(()=>{
            const navigation=document.createElement('nav');
            navigation.id='usernavigation';
            document.querySelector('#usernavigation').replaceWith(navigation);
        });
        await page.waitForFunction(()=>document.querySelector('#thememode_selection')?.value==='1');
        await page.locator('#displaybutton').click();
        await page.waitForTimeout(250);
        await page.reload();
        await page.waitForFunction(()=>document.documentElement.style.opacity==='1');
        await page.evaluate(()=>{
            const navigation=document.createElement('nav');
            navigation.id='usernavigation';
            document.body.prepend(navigation);
        });
        await page.waitForSelector('#thememode_selection');
        assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'1');
        await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
        assert.equal(await page.locator('#display').isVisible(),false);
        const worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id));
        assert(worker);
        const permissions=await worker.evaluate(()=>chrome.runtime.getManifest().permissions);
        assert(!permissions.includes('notifications') && !permissions.includes('alarms'));
        assert.equal(requests,2,'Only the two synthetic document navigations occur');
        assert.deepEqual(errors,[]);
        console.log('PASS production browser: new install is light on dark device, explicit dark and OFF survive reload, notification permissions absent, no automatic fetch on empty fixture');
    } finally {await context.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
