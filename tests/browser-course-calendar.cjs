// Synthetic Moodle controls and a virtual clock; no connection to Moodle.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage({viewport: {width: 390, height: 844}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const section = id => `<section class="section course-section main clearfix"><button class="btn btn-icon mr-1 icons-collapse-expand justify-content-center stretched-link collapsed" aria-expanded="false">開閉</button><h3 class="sectionname" id="section-${id}">第${id}回</h3><p hidden>授業内容</p></section>`;
        await page.route('**/*', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="page-wrapper"><div id="page-content"><main class="course-content">${section(1)}${section(2)}</main><aside class="columnright"></aside></div><div class="event complete"><span class="date">明日, 0:30</span></div></div></body></html>`}));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=1');
        await page.evaluate(() => {
            localStorage.setItem('hide', 'false');
            // Stand in for Moodle's native collapse handler, including keyboard activation.
            document.querySelectorAll('.icons-collapse-expand').forEach(button => button.addEventListener('click', () => {
                const collapsed = button.classList.toggle('collapsed');
                button.setAttribute('aria-expanded', String(!collapsed));
                button.parentElement.querySelector('p').hidden = collapsed;
            }));
        });
        await page.addScriptTag({path: path.resolve('src/cource/hide_closedTab.js')});
        await page.addScriptTag({path: path.resolve('src/notionnav/navigation.js')});
        assert.equal(await page.locator('#section-1').isVisible(), false);
        await page.locator('#notion summary').click();
        const firstLink = page.locator('#notion a').nth(1);
        await firstLink.focus();
        await page.keyboard.press('Enter');
        assert.equal(new URL(page.url()).hash, '#section-1');
        assert(await page.locator('#section-1').isVisible());
        assert(await page.locator('section p').first().isVisible());
        assert.equal(await page.locator('#section-2').isVisible(), false, 'Other closed sections stay hidden');
        assert.equal(await page.evaluate(() => localStorage.getItem('hide')), 'false', 'Navigation does not change the visibility preference');
        await firstLink.click();
        assert(await page.locator('section p').first().isVisible(), 'Revisiting an open section does not close it');
        await page.locator('.icons-collapse-expand').first().click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('section')).display === 'none');
        await page.evaluate(() => duedleClosedTabs.setVisible(true));
        assert(await page.locator('#section-1').isVisible());
        assert(await page.locator('#section-2').isVisible());

        await page.clock.install({time: new Date('2030-01-01T23:00:00')});
        await page.addScriptTag({path: path.resolve('src/common/utils.js')});
        await page.addScriptTag({content: 'async function rerender() {}'});
        await page.addScriptTag({path: path.resolve('src/storage/display/displaybox.js')});
        await page.evaluate(() => checkUnvisited());
        const first = await page.locator('.date').innerText();
        await page.clock.fastForward(3600000);
        await page.evaluate(() => checkUnvisited());
        const later = await page.locator('.date').innerText();
        assert.notEqual(later, first, 'Countdown advances even without any saved tasks');
        assert.equal(later, await page.evaluate(() => formatRemainingTime(new Date('2030-01-02T00:30:00'))), 'Tomorrow keeps its absolute deadline after midnight');
        await page.evaluate(() => {
            document.querySelector('.date').textContent = '2030年1月3日, 14:00';
            changeAct({group: 'assign_list', assignId: 1});
        });
        assert.equal(await page.locator('.date').innerText(), await page.evaluate(() => formatRemainingTime(new Date('2030-01-03T14:00:00'))), 'Moodle can update the deadline on the same element');
        await page.evaluate(() => {
            document.querySelector('.date').outerHTML = '<span class="date">本日, 1:00</span>';
            checkUnvisited();
        });
        assert.equal(await page.locator('.date').innerText(), await page.evaluate(() => formatRemainingTime(new Date('2030-01-02T01:00:00'))), 'A replacement element gets its own deadline');
        await page.clock.fastForward(3600000);
        await page.evaluate(() => checkUnvisited());
        assert.equal(await page.locator('.date').innerText(), '終了');
        await page.evaluate(() => { document.querySelector('.date').textContent = '日時未定'; checkUnvisited(); });
        assert.equal(await page.locator('.date').innerText(), '日時未定');
        assert.deepEqual(errors, []);
        console.log('PASS hidden section navigation and reopen/collapse; calendar countdown across midnight, native updates, replacement elements and expiry');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
