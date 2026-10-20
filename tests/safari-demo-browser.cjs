const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
    const directory = path.resolve(process.argv[2] || 'safari/build/DerivedData/Build/Products/Debug/Duedle.app/Contents/Resources');
    const browser = await chromium.launch({ headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage();
        const errors = [], network = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
        await page.goto('file://' + path.join(directory, 'Base.lproj/Main.html'));
        await page.evaluate(() => show('mac'));
        assert.equal(await page.getByRole('link', { name: 'デモを試す / Try demo' }).count(), 0);
        // Browser-only tests use the retained iOS entry; safari-demo-menu.swift tests the native Mac menu.
        await page.evaluate(() => { document.body.classList.remove('platform-mac'); show('ios'); });
        await page.getByRole('link', { name: 'デモを試す / Try demo' }).click();
        await page.waitForSelector('#display > .assign');
        const cards = page.locator('#display > .assign, #display > .quiz');
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 4);
        await page.selectOption('#statusSelect', 'all');
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 6);
        await page.selectOption('#typeSelect', 'quiz_list');
        await page.waitForFunction(() => document.querySelectorAll('#display > .quiz').length === 2);
        assert.equal(await page.locator('#display > .assign').count(), 0);
        await page.selectOption('#typeSelect', 'all');
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 6);
        await page.locator('.coursemenubtn').first().click();
        await page.locator('.showbutton:visible').first().click();
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 5);
        await page.selectOption('#showSelect', 'deleted');
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 1);
        await page.locator('.coursemenubtn').click();
        await page.locator('.showbutton:visible').click();
        await page.selectOption('#showSelect', 'normal');
        await page.waitForFunction(() => document.querySelectorAll('#display > .assign, #display > .quiz').length === 6);
        const chooseTheme = async mode => {
            if (await page.locator('#thememode_selection').getAttribute('aria-expanded') !== 'true') {
                await page.locator('#thememode_selection').click();
            }
            await page.locator(`#duedle-theme-menu button[data-mode="${mode}"]`).click();
        };
        // The demo starts with iOS appearance enabled. Check that default, then
        // start the toggle checks below from an explicit OFF state.
        await page.waitForFunction(() => document.body.classList.contains('iosmode'));
        await chooseTheme('ios-toggle');
        await page.waitForFunction(() => !document.body.classList.contains('iosmode'));
        await page.keyboard.press('Escape');
        for (const width of [425, 1000]) {
            await page.setViewportSize({ width, height: 760 });
            await chooseTheme('3');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('main.card')).backgroundColor === 'rgb(219, 239, 247)');
            assert.equal(await page.locator('header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(249, 255, 202)');
            if (width === 1000) await page.screenshot({ path: path.resolve('safari/build/demo-honobono.png'), fullPage: true });
            await chooseTheme('ios-toggle');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#display > .assign')).borderRadius === '16px');
            assert.equal(await page.locator('main.card').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(219, 239, 247)');
            await chooseTheme('2');
            await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(242, 242, 247)');
            assert.equal(await page.locator('#display').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
            await page.keyboard.press('Escape');
            if (width === 1000) await page.screenshot({ path: path.resolve('safari/build/demo-ios.png'), fullPage: true });
            await chooseTheme('ios-toggle');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#display > .assign')).borderRadius === '5px');
            await page.keyboard.press('Escape');
        }
        await page.locator('#thememode_selection').click();
        await page.locator('#duedle-theme-menu button[data-mode="1"]').click();
        await page.waitForFunction(() => document.body.classList.contains('darkmode'));
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '最初の状態に戻す / Reset demo' }).click();
        await page.waitForSelector('#display > .assign');
        assert.equal(await page.locator('#statusSelect').inputValue(), 'ex-complete');
        assert.equal(await page.locator('body').evaluate(body => body.classList.contains('darkmode')), false);
        await page.locator('#display a').first().click();
        await page.getByText('デモの課題です。', { exact: false }).waitFor();
        assert.equal(network.length, 0);
        assert.deepEqual(errors, []);
        for (const width of [390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}px`);
        }
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({ path: path.resolve('safari/build/demo-preview.png'), fullPage: true });
        await page.getByRole('link', { name: '← Duedleに戻る / Back' }).click();
        await page.evaluate(() => show('mac'));
        assert.equal(await page.getByRole('link', { name: 'デモを試す / Try demo' }).count(), 0);
        await page.evaluate(() => { document.body.classList.remove('platform-mac'); show('ios'); });
        await page.getByRole('link', { name: 'デモを試す / Try demo' }).waitFor();
        console.log('PASS: entry/back, real task UI, filters, hide/restore, honobono/iOS rendering at 425/1000px, theme restoration, reset, zero network requests/errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
