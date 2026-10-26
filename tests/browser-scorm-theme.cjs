// Synthetic SCORM wrapper only; never connects to university or teaching services.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const wrapper = `<!doctype html><html><head><style>html,body{background:#fff;color:#000}body{margin:16px}#media{width:100%;height:160px;border:0}#panel{background:#fff;color:#000;padding:10px}</style></head><body><h1>SCORM wrapper</h1><iframe id="media" src="https://teaching.example.invalid/blocked"></iframe><div id="panel">Authored panel</div><img alt="Diagram" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E%3Crect width='30' height='30' fill='red'/%3E%3C/svg%3E"></body></html>`;
(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = route.request().url();
            if (url === root + 'mod/scorm/player.php') return route.fulfill({ contentType: 'text/html', body:
                `<!doctype html><html><head><style>body{background:white}iframe{width:90%;height:500px}</style></head><body id="page-mod-scorm-player"><div id="scorm_content"><iframe id="scorm_object" src="${root}mod/scorm/loadSCO.php?id=1"></iframe></div><iframe id="unrelated" src="${root}mod/scorm/loadSCO.php?id=2"></iframe></body></html>` });
            if (url.startsWith(root + 'mod/scorm/loadSCO.php')) return route.fulfill({ contentType: 'text/html', body: wrapper });
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="background:white">Foreign teaching content</body></html>' });
        });
        await page.goto(root + 'mod/scorm/player.php');
        await page.frameLocator('#scorm_object').locator('h1').waitFor();
        for (const file of ['dark.css', 'light.css', 'ios.css']) await page.addStyleTag({ path: 'src/theme/' + file });
        await page.addScriptTag({ path: 'src/theme/state.js' });
        const source = fs.readFileSync('src/theme/scorm.js', 'utf8');
        // Start in dark mode, as when a new SCORM popup opens from a dark Moodle tab.
        await page.evaluate(() => duedleApplyTheme(1));
        const original = await page.frameLocator('#scorm_object').locator('body').innerHTML();
        await page.addScriptTag({ content: source });
        const canvas = page.frameLocator('#scorm_object');
        const colors = locator => locator.evaluate(element => {
            const css = getComputedStyle(element);
            return { bg: css.backgroundColor, color: css.color };
        });
        const waitBackground = expected => canvas.locator('body').evaluate((element, expected) =>
            new Promise((resolve, reject) => {
                let remaining = 100;
                const check = () => getComputedStyle(element).backgroundColor === expected ? resolve()
                    : --remaining ? requestAnimationFrame(check) : reject(new Error('Unexpected canvas background'));
                check();
            }), expected);
        for (const ios of [false, true, false]) {
            await page.evaluate(ios => duedleApplyTheme(1, ios), ios);
            await waitBackground(ios ? 'rgb(0, 0, 0)' : 'rgb(29, 40, 49)');
            assert.equal((await colors(canvas.locator('html'))).bg, ios ? 'rgb(0, 0, 0)' : 'rgb(29, 40, 49)');
            assert.equal((await colors(canvas.locator('body'))).color, ios ? 'rgb(242, 242, 247)' : 'rgb(221, 221, 223)');
            assert.deepEqual(await colors(canvas.locator('#panel')), { bg: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' });
            assert.equal(await canvas.locator('body').innerHTML(), original, 'Teaching content is unchanged');
            assert.equal((await colors(page.frameLocator('#unrelated').locator('body'))).bg, 'rgb(255, 255, 255)');
            assert.equal(await canvas.frameLocator('#media').locator('#duedle-scorm-canvas-theme').count(), 0, 'No style is injected into the foreign iframe');
            for (const mode of [2, 3]) {
                await page.evaluate(({ mode, ios }) => duedleApplyTheme(mode, ios), { mode, ios });
                await waitBackground('rgb(255, 255, 255)');
                assert.equal(await canvas.locator('#duedle-scorm-canvas-theme').count(), 0);
                assert.equal((await colors(canvas.locator('body'))).color, 'rgb(0, 0, 0)');
            }
        }
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.evaluate(() => duedleApplyTheme(0));
        await waitBackground('rgb(29, 40, 49)');
        // Player changes the source and replaces the whole iframe on SCO navigation.
        await page.evaluate(root => document.querySelector('#scorm_object').src = root + 'mod/scorm/loadSCO.php?id=3', root);
        await waitBackground('rgb(29, 40, 49)');
        await page.evaluate(root => {
            const next = document.createElement('iframe'); next.id = 'scorm_object';
            next.src = root + 'mod/scorm/loadSCO.php?id=4';
            document.querySelector('#scorm_object').replaceWith(next);
        }, root);
        await canvas.locator('h1').waitFor();
        await waitBackground('rgb(29, 40, 49)');
        // Authored full-page background images and colors keep their original appearance.
        await canvas.locator('body').evaluate(element => element.style.backgroundImage = 'linear-gradient(red, blue)');
        await page.evaluate(() => { duedleApplyTheme(2); duedleApplyTheme(1); });
        await waitBackground('rgb(255, 255, 255)');
        assert.equal(await canvas.locator('#duedle-scorm-canvas-theme').count(), 0);
        await canvas.locator('body').evaluate(element => { element.style.backgroundImage = ''; element.style.backgroundColor = 'rgb(20, 100, 180)'; });
        await page.evaluate(() => { duedleApplyTheme(2); duedleApplyTheme(1); });
        await waitBackground('rgb(20, 100, 180)');
        await page.evaluate(root => document.querySelector('#scorm_object').src = 'https://teaching.example.invalid/full', root);
        await canvas.locator('body').waitFor();
        assert.equal(await canvas.locator('#duedle-scorm-canvas-theme').count(), 0);
        assert.deepEqual(errors, []);
        const manifest = JSON.parse(fs.readFileSync('src/manifest.json'));
        const entry = manifest.content_scripts.find(entry => entry.js?.includes('./theme/scorm.js'));
        assert(entry && entry.matches.every(pattern => pattern.endsWith('/mod/scorm/player.php*')));
        assert(!entry.all_frames, 'No broader iframe injection permission');
        console.log('PASS SCORM canvas: initial/system dark, iOS, light/honobono restore, iframe navigation/replacement, original content/images/panels and cross-origin isolation');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
