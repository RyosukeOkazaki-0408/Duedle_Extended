// Moodle 4 component CSS and repeated mode changes, on synthetic pages only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage({viewport:{width:1280,height:900}});
        await page.route('**/*', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><style>
            body{color:#1d2125;background:white} a{color:#006dcc}.activity-item{border:1px solid #ddd;padding:16px}
            .description .course-description-item{background:#f8f9fa;padding:16px}.icons-collapse-expand{color:#212529}
            .activity-header{background:#f8f9fa;padding:16px;border-radius:8px}.card{background:white}.custom-select{background:white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E") no-repeat right center;color:#212529}
            #page-mod-quiz-view .generalbox#feedback{width:70%;margin-left:auto;margin-right:auto;padding-bottom:15px} #page-mod-quiz-view .generalbox#feedback h2{margin:0}
            body.path-mod-quiz .gradedattempt{background:#d9edf7}input[type=color]{width:50px;height:27px}
            .que.ddwtos .draghome{display:inline-block;border:1px solid black;cursor:move}.que.ddwtos .drop.active{display:inline-block;border:1px solid black}.que.ddwtos .group1{background:white}.que.ddwtos .group3{background:lightsteelblue}.que.ddwtos .drop:focus{border-color:#0a0;box-shadow:0 0 5px 5px rgba(255,255,150,1)}
            .activityiconcontainer{background:#e65ca5;color:white;width:50px}
            </style></head><body id="page-mod-quiz-view" class="path-mod-quiz"><main id="region-main"><div class="course-content">
            <div class="activity-item duedle-task-status complete"><div class="activityiconcontainer">icon</div><a href="#">課題のリンク</a><div class="description"><div class="course-description-item"><div class="description-inner"><p><strong id="red" style="color:red">赤い締切</strong></p><table id="authored" style="background:white;color:black!important"><tr><td>教員の表</td></tr></table></div></div><div class="course-description-item availabilityinfo">未達成の利用条件 <a href="#">課題</a></div></div></div>
            <div class="contentwithoutlink"><div class="no-overflow"><span id="course-black" style="color:black">課題の説明</span><span id="course-blue" style="color:blue">課題提出について</span><span id="course-yellow" style="color:black;background:yellow">締切の強調</span></div></div><button class="icons-collapse-expand"><i class="icon">▼</i></button></div>
            <div class="activity-header" data-for="page-activity-header" id="quiz-header"><div class="activity-description" id="intro"><p>小テストの案内</p></div></div>
            <div class="activity-header" data-for="page-activity-header" id="assign-header"><div class="activity-information"><div>開始: 2026年4月1日</div><div>期限: 2026年10月12日</div></div><div class="activity-description"><p style="color:red">提出期限の案内</p></div></div><div class="generalbox quizgradefeedback" id="feedback"><h2>あなたの小テスト最終評点は 20.00 / 20.00 です。</h2></div><a class="gradedattempt" href="#">レビュー</a><div class="card">通常カード</div>
            <div id="filter"><div id="fieldfilter"><select class="custom-select"><option>すべて</option><option>完了</option></select></div><div id="fieldcolor"><input type="color" class="form-select" value="#063906"></div></div>
            <div class="event duedle-task-status complete"><div class="activityiconcontainer">icon</div><div class="overflow-auto"><h6><a href="#">直近イベント</a></h6><div class="date">残り3日</div></div></div><div id="display"><div class="assign complete"><div class="title">課題</div><div class="info"><a href="#">リンク</a><ul><li>情報</li></ul></div></div></div>
            <div class="que ddwtos"><div class="formulation"><div class="qtext">問題文 <span class="drop active group1" tabindex="0">ドロップ先</span></div><div class="answercontainer"><span class="draghome group1" tabindex="0">人間力</span><span class="draghome group3" tabindex="0">リーダーシップ</span></div></div></div><div class="warning" id="native-warning">Moodle本来の警告</div></main></body></html>`}));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?id=1');
        for (const file of ['theme/dark.css','theme/light.css','theme/ios.css','storage/display/style.css','common/common.css']) await page.addStyleTag({path:'src/'+file});
        await page.addScriptTag({path:'src/theme/state.js'});
        await page.addScriptTag({path:'src/theme/content.js'});
        const filter = fs.readFileSync('src/storage/display/filter.js','utf8');
        await page.addScriptTag({content: 'const colorTypesValue=["complete"];' + filter.slice(filter.indexOf('const applyColor ='),filter.indexOf('const colorDefault_light'))});
        const style = async selector => page.locator(selector).first().evaluate(el => {const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,border:s.borderLeftColor,image:s.backgroundImage}});
        const native = await style('#native-warning');
        const author = await style('#authored');
        const icon = await style('.activityiconcontainer');
        for (const ios of [false,true]) {
            for (const mode of [2,1,3,1,2,3,2]) {
                await page.evaluate(({mode,ios}) => {duedleApplyTheme(mode,ios);applyColor('complete',mode===1?'#063906':'#90ee90')}, {mode,ios});
                // MutationObserver restores author !important values after the class change.
                await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(resolve)));
                const feedbackLayout = await page.locator('#feedback').evaluate(el=>{
                    const rect=el.getBoundingClientRect(),main=document.querySelector('#region-main').getBoundingClientRect(),heading=el.querySelector('h2').getBoundingClientRect();
                    return {left:rect.left-main.left,width:rect.width-main.width,padding:heading.left-rect.left};
                });
                assert(Math.abs(feedbackLayout.left)<1 && Math.abs(feedbackLayout.width)<1 && feedbackLayout.padding>=16,'Final grade aligns with the main content and has inner padding');
                const description = await style('.availabilityinfo');
                const intro = await style('#intro');
                const course = await style('.activity-item');
                assert.equal(course.bg,'rgba(0, 0, 0, 0)','Course status never paints the entire activity');
                assert.equal((await style('#native-warning')).bg,native.bg,'Moodle status classes are unaffected');
                assert.equal((await style('.activityiconcontainer')).bg,icon.bg,'File icons retain their background');
                const eventStyle = await style('.event');
                assert.equal(eventStyle.border,eventStyle.bg,'Upcoming event left edge uses the same status color as its background');
                if (mode===1) {
                    assert.equal(description.bg,'rgb(38, 53, 65)');
                    assert.equal((await style('.draghome.group1')).bg,'rgb(38, 53, 65)');
                    assert.equal((await style('.draghome.group1')).color,'rgb(221, 221, 223)');
                    assert.notEqual((await style('.draghome.group3')).bg,(await style('.draghome.group1')).bg,'Drag groups keep different colors');
                    assert.equal((await style('.drop.active')).border,'rgb(120, 138, 153)');
                    assert.equal((await style('#course-black')).color,'rgb(221, 221, 223)');
                    assert.notEqual((await style('#course-blue')).color,'rgb(0, 0, 255)');
                    assert.notEqual((await style('#course-yellow')).bg,'rgb(255, 255, 0)');
                    assert.equal((await style('.event')).bg,'rgb(6, 57, 6)');
                    assert.equal((await style('.event a')).color,'rgb(139, 197, 232)');
                    assert.equal(description.color,'rgb(221, 221, 223)');
                    assert.equal(intro.bg,'rgba(0, 0, 0, 0)');
                    for (const selector of ['#quiz-header', '#assign-header']) {
                        assert.equal((await style(selector)).bg,'rgb(38, 53, 65)','The outer activity header, including padding, must be dark');
                        assert.equal((await style(selector)).color,'rgb(221, 221, 223)');
                    }
                    assert.equal((await style('.gradedattempt')).bg,'rgb(36, 60, 70)');
                    assert.equal((await style('.icons-collapse-expand .icon')).color,'rgb(221, 221, 223)');
                    assert((await style('.custom-select')).image.includes('b6c1cb'));
                    assert.notEqual((await style('#fieldcolor input')).bg,'rgb(255, 255, 255)');
                    assert.equal((await style('#fieldcolor input')).image,'none','Select arrows never appear on color inputs');
                    assert.equal((await style('#authored')).color,'rgb(221, 221, 223)');
                } else {
                    assert.equal(description.bg,'rgb(248, 249, 250)');
                    assert.equal((await style('.draghome.group1')).bg,'rgb(255, 255, 255)');
                    assert.equal((await style('.draghome.group3')).bg,'rgb(176, 196, 222)');
                    assert.equal((await style('.drop.active')).border,'rgb(0, 0, 0)');
                    assert.equal((await style('#course-black')).color,'rgb(0, 0, 0)');
                    assert.equal((await style('#course-blue')).color,'rgb(0, 0, 255)');
                    assert.equal((await style('#course-yellow')).bg,'rgb(255, 255, 0)');
                    assert.equal((await style('.event')).bg,'rgb(144, 238, 144)');
                    assert.equal(intro.bg,'rgba(0, 0, 0, 0)');
                    for (const selector of ['#quiz-header', '#assign-header']) assert.equal((await style(selector)).bg,'rgb(248, 249, 250)','Light themes restore the native activity header');
                    assert.deepEqual(await style('#authored'),author,'Teacher inline styles return exactly');
                    assert.equal((await style('#red')).color,'rgb(255, 0, 0)');
                }
                for (const selector of ['.event a', '#display a']) {
                    const linkColor = (await style(selector)).color;
                    assert.notEqual(linkColor,(await style(selector === '.event a' ? '.event' : '#display > .assign')).color,'Links remain distinct from body text');
                    assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).textDecorationLine),'underline');
                }
                if (!ios && [1,3].includes(mode)) await page.screenshot({path:`/private/tmp/duedle-components-mode-${mode}.png`,fullPage:true});
                assert.equal(await page.locator('select').inputValue(),'すべて');
                assert.equal(await page.locator('input[type=color]').inputValue(),'#063906');
            }
        }
        // A custom task color needs readable text in both light and dark modes.
        await page.evaluate(()=>{duedleApplyTheme(2);applyColor('complete','#101010')});
        assert.equal((await style('#display .info')).color,'rgb(255, 255, 255)');
        assert.equal((await style('#display a')).color,'rgb(139, 197, 232)');
        // Slow storage reads from an earlier mode cannot overwrite the newest palette.
        const display = fs.readFileSync('src/storage/display/displaybox.js','utf8');
        await page.addScriptTag({content:'const colorDefault_light=["#90ee90"],colorDefault_dark=["#063906"]; let pending=[]; const ext={storage:{sync:{get:key=>new Promise(resolve=>pending.push({key,resolve}))}}};'+display.slice(display.indexOf('let colorReloadVersion'),display.indexOf('const transDue'))});
        await page.evaluate(()=>{document.querySelector('#fieldcolor input').id='colorSelect_complete';duedleApplyTheme(1);colorReload();duedleApplyTheme(2);colorReload();pending[1].resolve({});pending[0].resolve({});});
        assert.equal((await style('#display > .assign')).bg,'rgb(144, 238, 144)');
        // Also load directly into dark mode, as Safari's early theme does.
        await page.reload();
        await page.addStyleTag({path:'src/theme/dark.css'});
        await page.addStyleTag({path:'src/common/common.css'});
        await page.evaluate(()=>document.body.classList.add('darkmode'));
        await page.addScriptTag({path:'src/theme/content.js'});
        assert.equal((await style('.draghome.group1')).bg,'rgb(38, 53, 65)');
        assert.notEqual((await style('.draghome.group3')).bg,(await style('.draghome.group1')).bg,'Initial dark loading preserves drag group hues');
        await page.locator('.drop.active').focus();
        assert.equal((await style('.drop.active')).border,'rgb(139, 197, 232)','Focused drop target has a visible border');
        for (const width of [320,390,1280]) {
            await page.setViewportSize({width,height:900});
            const bounds=await page.locator('#feedback').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:el.scrollWidth,client:el.clientWidth};});
            assert(bounds.left>=0 && bounds.right<=bounds.width && bounds.scroll<=bounds.client,'Final grade does not overflow at '+width);
        }
        await page.screenshot({path:'/private/tmp/duedle-drag-dark.png',fullPage:true});
        console.log('PASS theme components: course descriptions/restrictions, intro, review, arrows, color wells, scoped status colors, custom text contrast, repeated light/dark/honobono with iOS on/off, async palette race');
    } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
