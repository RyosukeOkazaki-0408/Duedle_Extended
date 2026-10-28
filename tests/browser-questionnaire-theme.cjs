// Synthetic Questionnaire pages: no requests or responses are sent to Moodle.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

// Native selectors/structure from MOODLE_400_STABLE styles.css and
// templates/question_container.mustache in PoetOS/moodle-mod_questionnaire.
const nativeCSS = `
    body{margin:16px;background:white;color:#1d2125;font:16px sans-serif}
    fieldset{border:0;margin:0 0 16px;padding:0;min-width:0}
    .generalbox{background:white;padding:12px}label{display:block;margin:8px 0}
    .qn-legend{float:left;font-size:inherit;width:auto}
    .qn-info{float:left;width:auto;padding:7px;background:#eee;font-weight:bold}
    .qn-info h2.qn-number{margin:0;font-size:1.5em;line-height:1.2em}
    .qn-content{margin-bottom:10px;margin-left:55px}
    .qn-question{padding:0.1em 5px;background-color:#e4f1fa}
    .qn-question p{margin-bottom:0.6em;margin-top:0.5em}
    .qn-question,.qn-answer{margin:0 0 0.5em;overflow:auto}
    .unselected{color:gray}.req{color:#ca3120;font-size:x-small}
    .que .info{background:#f8f9fa}.que .formulation{background:#e7f3f5;color:#00242b}
    .que .outcome{background:#fff1dc;color:#996a27}
    table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left}
`;
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/mod/questionnaire/';
const fixture = pageName => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body id="page-mod-questionnaire-${pageName}" class="path-mod-questionnaire"><main id="region-main"><div class="generalbox">
<nav><a href="${root}myreport.php?id=1">あなたの回答</a> <a href="${root}report.php?id=1">全回答の閲覧</a></nav>
<h1>アンケート</h1><form id="questionnaire">
<fieldset><div class="qn-legend"><div class="qn-info"><h2 class="qn-number">1</h2></div><span class="req">*</span></div>
<div class="qn-content"><div class="qn-question"><p>今回の講演について理解することができましたか？</p></div><div class="qn-answer">
${pageName === 'report' ? '<table><thead><tr><th>回答</th><th>平均</th><th>合計</th></tr></thead><tbody><tr><td>よくわかった</td><td><span style="display:inline-block;width:24px;height:10px;background:blue"></span> 50%</td><td>2</td></tr></tbody></table>' :
`<label${pageName === 'myreport' ? ' class="unselected"' : ''}><input type="radio" name="understanding" value="yes"${pageName === 'myreport' ? ' disabled' : ''}>よくわかった</label>
<label><input type="radio" name="understanding" value="some" checked${pageName === 'myreport' ? ' disabled' : ''}>少しわかった</label>`}
</div></div></fieldset>
<fieldset><div class="qn-legend"><div class="qn-info"><h2 class="qn-number">2</h2></div><span class="req">*</span></div>
<div class="qn-content"><div class="qn-question"><p>興味深かった項目を選んでください（複数回答可）。</p></div><div class="qn-answer"><label><input type="checkbox" name="interest" value="activity" checked${pageName === 'myreport' ? ' disabled' : ''}>資格取得後の活動</label></div></div></fieldset>
</form><div id="unrelated"><div class="que"><div class="info">小テスト番号</div><div class="formulation"><div class="qtext">小テスト問題</div></div><div class="outcome">正解です</div></div><div class="card">通常のカード</div><span style="color:#bb0000;background:#ffff00">明示的な配色</span></div>
</div></main></body></html>`;

const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).reduce((sum, v, i) => {
    const s = v / 255;
    return sum + [0.2126, 0.7152, 0.0722][i] * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
}, 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => {
            const name = new URL(route.request().url()).pathname.split('/').pop().replace('.php', '');
            return route.fulfill({contentType:'text/html', body:fixture(name)});
        });
        const install = async () => {
            for (const file of ['dark.css', 'light.css', 'ios.css']) await page.addStyleTag({path:'src/theme/' + file});
            // Native CSS may arrive after the extension at document_start.
            await page.addStyleTag({content:nativeCSS});
            await page.addScriptTag({path:'src/theme/state.js'});
            await page.addScriptTag({path:'src/theme/content.js'});
            await page.waitForSelector('.qtext.duedle-authored-content');
        };
        const styles = selector => page.locator(selector).evaluateAll(nodes => nodes.map(el => {
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return {color:s.color, bg:s.backgroundColor, border:s.borderColor, outline:s.outlineStyle,
                box:[r.x,r.y,r.width,r.height], html:el.innerHTML};
        }));
        const answers = () => page.locator('input').evaluateAll(nodes => nodes.map(el => [el.name,el.value,el.checked,el.disabled]));
        let cases = 0;
        for (const width of [390,1280]) {
            await page.setViewportSize({width,height:900});
            for (const name of ['complete','myreport','report','preview','print']) {
                await page.goto(root + name + '.php?id=1');
                await install();
                const initialAnswers = await answers();
                for (const ios of [false,true]) {
                    for (const mode of [0,1,2,3]) {
                        for (const os of ['light','dark']) {
                            await page.emulateMedia({colorScheme:os});
                            await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios), {mode,ios});
                            const unrelatedBefore = await styles('#unrelated, #unrelated *');
                            const panels = await styles('.qn-question, .qn-info');
                            const dark = mode === 1 || mode === 0 && os === 'dark';
                            for (const panel of panels) {
                                assert(contrast(panel.color,panel.bg) >= 4.5, `${name}/${width}/${mode}/${ios}/${os}: readable panels`);
                            }
                            if (!dark) {
                                assert.equal((await styles('.qn-question'))[0].bg,'rgb(228, 241, 250)');
                                assert.equal((await styles('.qn-info'))[0].bg,'rgb(238, 238, 238)');
                            }
                            // Removing the page scope restores the native question number;
                            // authored question text remains adapted by content.js.
                            await page.evaluate(() => document.body.classList.remove('path-mod-questionnaire'));
                            assert.deepEqual(await styles('#unrelated, #unrelated *'),unrelatedBefore);
                            assert.equal((await styles('.qn-info'))[0].bg,'rgb(238, 238, 238)');
                            const outside = await styles('.qn-question, .qn-info');
                            assert.deepEqual(outside.map(({box,html}) => ({box,html})),panels.map(({box,html}) => ({box,html})));
                            await page.evaluate(() => document.body.classList.add('path-mod-questionnaire'));
                            assert.deepEqual(await answers(),initialAnswers,'Switching themes preserves answers and disabled state');
                            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'No horizontal overflow');
                            cases++;
                        }
                    }
                }
                if (name === 'complete') {
                    await page.evaluate(() => duedleApplyTheme(1,true));
                    await page.locator('input[value="yes"]').check();
                    await page.locator('input[type="checkbox"]').uncheck();
                    assert.deepEqual(await page.locator('form').evaluate(form => [...new FormData(form)]),[['understanding','yes']]);
                    await page.locator('input[value="yes"]').focus();
                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Shift+Tab');
                    assert.equal(await page.locator('input[value="yes"]').evaluate(el => el === document.activeElement),true);
                    assert.equal((await styles('input[value="yes"]'))[0].outline,'solid');
                }
            }
        }
        // A similarly named component on a different Moodle activity is not
        // adapted by the questionnaire-specific CSS or authored-content selector.
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?id=1');
        await page.evaluate(() => document.body.classList.remove('path-mod-questionnaire'));
        await install(); await page.evaluate(() => duedleApplyTheme(1,false));
        assert.equal((await styles('.qn-question'))[0].bg,'rgb(228, 241, 250)');
        assert.equal(await page.locator('.qn-question.duedle-authored-content').count(),0);
        await page.goto(root + 'complete.php?id=1'); await install();
        await page.evaluate(() => duedleApplyTheme(1,false));
        await page.screenshot({path:'/private/tmp/duedle-questionnaire-dark.png',fullPage:true});
        await page.getByRole('link',{name:'あなたの回答',exact:true}).click();
        assert.equal(new URL(page.url()).pathname, '/moodle40a/mod/questionnaire/myreport.php');
        await install(); await page.evaluate(() => duedleApplyTheme(1,false));
        assert(await page.locator('input[value="some"]').isChecked());
        assert(await page.locator('input[value="some"]').isDisabled());
        await page.getByRole('link',{name:'全回答の閲覧',exact:true}).click();
        await install(); await page.evaluate(() => duedleApplyTheme(1,false));
        assert((await page.locator('table').innerText()).includes('50%'));
        await page.screenshot({path:'/private/tmp/duedle-questionnaire-report-dark.png',fullPage:true});
        await page.goBack();
        assert.equal(new URL(page.url()).pathname, '/moodle40a/mod/questionnaire/myreport.php');
        console.log(`PASS Questionnaire: ${cases} page/viewport/theme/iOS/OS cases, contrast >=4.5, scope isolation, unchanged layout/content, radio/checkbox/focus, disabled answers, report links/back`);
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
