// An optional compatibility probe, separate from Moodle 4.0 regressions.
// A failing check is reported honestly; do not turn a known mismatch into a pass.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ timezoneId: 'UTC' });
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html',
            body: fs.readFileSync(path.join(root, 'tests/fixtures/moodle-playground-44-reopened.html'), 'utf8') }));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=1');
        for (const file of ['common/utils.js', 'storage/class/scrape/Scrape.js', 'storage/class/scrape/ScrapeAssign.js']) {
            await page.addScriptTag({ path: path.join(root, 'src', file) });
        }
        const actual = await page.evaluate(() => ScrapeAssign.getData(document, location.href));
        const checks = [
            { name: 'student course identity', expected: 'Duedle verification course', actual: actual?.courseName },
            { name: 'task identity', expected: 'Assignment A', actual: actual?.assignName },
            { name: 'reopened submission needs work', expected: ['incomplete', 'warning', 'expired'], actual: actual?.status },
            { name: 'deadline shown by actual Moodle page', expected: '2026-10-18T08:56:00.000Z', actual: actual?.due }
        ].map(check => ({ ...check, passed: Array.isArray(check.expected) ? check.expected.includes(check.actual) : check.actual === check.expected }));
        console.log(JSON.stringify({ scope: 'Moodle 4.4 Classic, extracted actual student HTML; URL adapted only in test', checks }, null, 2));
        if (checks.some(check => !check.passed)) process.exitCode = 1;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
