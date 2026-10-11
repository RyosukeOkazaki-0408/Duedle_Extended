// Synthetic Moodle only; verifies settings-menu integration and the bundled help page.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-support-')), {
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-unsafe-extension-debugging']
  });
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const extension = await cdp.send('Extensions.loadUnpacked', { path: path.resolve('src') });
    await context.route('https://cms7.ict.nitech.ac.jp/**', route => route.fulfill({ contentType: 'text/html', body:
      '<!doctype html><html><head><title>Moodle fixture</title></head><body><header></header><main id="region-main"></main></body></html>' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/my/');
    await page.evaluate(() => {
      const footer = document.createElement('footer'); footer.id = 'page-footer';
      footer.innerHTML = '<div class="container footer-dark-inner" style="margin-inline:80px"><a href="mailto:support@example.invalid">サイトサポートに連絡する</a></div>';
      document.body.append(footer);
    });
    await page.waitForSelector('#thememode_selection');
    assert.equal(await page.locator('#thememode_selection').innerText(), 'Duedle設定');
    assert.equal(await page.locator('#page-footer a').count(), 1);
    assert.equal(await page.locator('#page-footer .footer-dark-inner > a').getAttribute('href'), 'mailto:support@example.invalid');
    assert.equal(await page.locator('#duedle-support-links').count(), 0);
    await page.locator('#thememode_selection').click();
    assert.equal(await page.locator('#duedle-theme-menu a[role="menuitem"]').count(), 3);
    assert.equal(await page.locator('#duedle-theme-menu a[aria-checked]').count(), 0);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'お問い合わせ');
    const config = {};
    vm.runInNewContext(fs.readFileSync('src/common/support-config.js', 'utf8'), config);
    const contactUrl = config.DuedleSupport.contactFormUrl;
    const helpUrl = `chrome-extension://${extension.id}/common/help.html`;
    assert.equal(await page.getByRole('menuitem', { name: 'お問い合わせ', exact: true }).getAttribute('href'), contactUrl || `${helpUrl}#contact`);
    const [help] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('menuitem', { name: '使い方', exact: true }).click()
    ]);
    await help.waitForLoadState();
    assert.equal(help.url(), helpUrl);
    assert.equal(await help.locator('#contact-pending').isVisible(), !contactUrl);
    assert.equal(await help.locator('#contact-link').isVisible(), Boolean(contactUrl));
    if (contactUrl) assert.equal(await help.locator('#contact-link').getAttribute('href'), contactUrl);
    for (const width of [320, 390, 768, 1440]) {
      await help.setViewportSize({ width, height: 900 });
      assert(await help.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `help overflow at ${width}px`);
    }
    await help.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await help.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(28, 28, 30)');
    await page.evaluate(() => document.querySelector('footer').replaceWith(document.createElement('footer')));
    assert.equal(await page.locator('#duedle-support-links').count(), 0);
    assert.equal(await page.locator('#duedle-theme-menu').count(), 1);
    assert.equal(await page.locator('#thememode_selection').getAttribute('aria-expanded'), 'false');
    const elements = { 'contact-link': { hidden: true }, 'contact-pending': { hidden: false } };
    vm.runInNewContext(fs.readFileSync('src/common/help.js', 'utf8'), {
      DuedleSupport: { contactFormUrl: 'https://forms.gle/example' },
      document: { getElementById: id => elements[id] }
    });
    assert.equal(elements['contact-link'].href, 'https://forms.gle/example');
    assert.equal(elements['contact-link'].hidden, false);
    assert.equal(elements['contact-pending'].hidden, true);
    await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=123');
    await page.waitForSelector('#thememode_selection');
    await page.evaluate(() => {
      const section = document.createElement('section');
      section.id = 'test-closed-section';
      section.className = 'section course-section main clearfix';
      section.innerHTML = '<button class="btn btn-icon mr-1 icons-collapse-expand justify-content-center stretched-link collapsed">Closed section</button>';
      document.querySelector('#region-main').append(section);
    });
    await page.locator('#thememode_selection').click();
    const closedTabs = page.locator('#duedle-theme-menu button[data-mode="closed-tabs"]');
    assert.equal(await closedTabs.getAttribute('aria-checked'), 'true');
    await closedTabs.click();
    await page.waitForFunction(() => localStorage.getItem('hide') === 'false');
    assert.equal(await closedTabs.getAttribute('aria-checked'), 'false');
    assert.equal(await page.locator('#test-closed-section').isVisible(), false);
    assert.equal(await page.locator('#thememode_selection').getAttribute('value'), '2');
    await page.reload();
    await page.waitForSelector('#thememode_selection');
    await page.locator('#thememode_selection').click();
    assert.equal(await closedTabs.getAttribute('aria-checked'), 'false');
    await closedTabs.click();
    await page.waitForFunction(() => localStorage.getItem('hide') === 'true');
    assert.equal(await closedTabs.getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#toggle_visible_form').count(), 0);
    const reorder = page.getByRole('menuitem', { name: 'コースの並び替え', exact: true });
    const reorderUrl = 'https://cms7.ict.nitech.ac.jp/moodle40a/course/mycourse_config/reorder.php';
    assert.equal(await reorder.getAttribute('href'), reorderUrl);
    assert.equal(await reorder.getAttribute('target'), null);
    const pageCount = context.pages().length;
    await reorder.click();
    await page.waitForURL(reorderUrl);
    assert.equal(context.pages().length, pageCount, 'course ordering opens in the same tab');
    await page.waitForSelector('#thememode_selection');
    assert.equal(await page.locator('#duedle-theme-menu button[data-mode="closed-tabs"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS settings: fixed trigger label, keyboard help access, university support retained, no footer links, native bundled-page navigation; help: pending/configured contact, dark mode, 4 widths without overflow');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exit(1); });
