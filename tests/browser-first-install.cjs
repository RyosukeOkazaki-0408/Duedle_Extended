// Exercise late injection on an already loaded page and delayed first-run settings.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const idle = manifest.content_scripts.find(entry => entry.js?.includes('./theme/main.js'));
const setupScripts = idle.js.filter(file => /(?:theme\/(?:state|main)|document_start\/pre|common\/support-config)\.js$/.test(file));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    for (const early of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('https://cms7.ict.nitech.ac.jp/**', route => route.fulfill({ contentType: 'text/html',
        body: '<html><body><nav id="usernavigation"></nav><header>Moodle</header><main id="region-main"></main></body></html>' }));
      await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/my/');
      await page.evaluate(() => {
        const listeners = [];
        let saved = {};
        let resolveSettings;
        const reply = new Promise(resolve => { resolveSettings = resolve; });
        globalThis.chrome = globalThis.ext = {
          runtime: { sendMessage: () => reply, getURL: file => `https://example.invalid/${file}` },
          storage: { local: { get: async () => ({ ...saved }), set: async values => Object.assign(saved, values) },
            onChanged: { addListener: listener => listeners.push(listener) } }
        };
        globalThis.finishSettings = () => {
          saved = { themeDefault: 2, iosAppearance: true };
          resolveSettings({ ok: true, ...saved });
          listeners.forEach(listener => listener({ themeDefault: { newValue: 2 } }, 'local'));
        };
      });
      if (early) {
        for (const file of ['src/theme/state.js', 'src/document_start/pre.js']) await page.addScriptTag({ path: path.resolve(file) });
      }
      for (const file of setupScripts) await page.addScriptTag({ path: path.resolve('src', file) });
      // The dashboard can arrive after the theme scripts, as in the real manifest.
      await page.evaluate(() => document.querySelector('main').insertAdjacentHTML('beforeend',
        '<div id="ext_dashboard"><div id="filter"><select><option>すべて</option></select></div><div id="display">課題一覧</div></div>'));
      await page.locator('#thememode_selection').waitFor({ state: 'visible', timeout: 3000 });
      const settings = page.locator('#duedle-course-settings');
      await settings.waitFor({ state: 'visible', timeout: 3000 });
      assert.equal(await settings.evaluate(node => node.open), false, 'First task settings must be collapsed');
      assert.equal(await page.locator('#filter').isVisible(), false);
      assert(await page.locator('#display').isVisible());
      await page.locator('#thememode_selection').click();
      assert.equal(await page.locator('#thememode_selection').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      await settings.locator('summary').click();
      assert(await page.locator('#filter').isVisible());
      await page.evaluate(() => finishSettings());
      await page.waitForFunction(() => document.querySelector('#thememode_selection')?.value === '2');
      await page.waitForFunction(() => document.body.classList.contains('iosmode') &&
        document.querySelector('#thememode_selection')?.dataset.iosAppearance === 'true');
      assert.equal(await settings.evaluate(node => node.open), true, 'Async settings must not reset a user-opened panel');
      await page.setViewportSize({ width: 1024, height: 844 });
      await page.waitForFunction(() => !document.querySelector('#duedle-course-settings'));
      assert(await page.locator('#filter').isVisible());
      await page.setViewportSize({ width: 390, height: 844 });
      await settings.waitFor({ state: 'visible' });
      assert.equal(await settings.evaluate(node => node.open), false);
      assert.equal(await page.locator('#thememode_selection').count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS first-run settings UI: document_start=${early}, pending background, late dashboard, menus and responsive layout`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
