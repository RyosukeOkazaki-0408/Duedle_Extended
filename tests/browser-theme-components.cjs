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
            .badge{display:inline-block;padding:8px;border-radius:20px}.alert-success{color:#1e4620;background:#d1e2d2}.alert-danger{color:#721c24;background:#f8d7da}.badge-light{color:#212529;background:#e9ecef}
            .path-mod .automatic-completion-conditions .badge{mix-blend-mode:multiply}
            </style></head><body id="page-mod-quiz-view" class="path-mod-quiz"><main id="region-main"><div class="course-content">
            <div id="course-task" class="activity-item" data-activityname="同じ課題名"><div class="activitytitle modtype_assign"><div class="activityiconcontainer">icon</div><div class="activityname"><a href="/moodle40a/mod/assign/view.php?id=101">同じ課題名</a></div></div><div class="description"><div class="course-description-item"><div class="description-inner"><p><strong id="red" style="color:red">赤い締切</strong></p><table id="authored" style="background:white;color:black!important"><tr><td>教員の表</td></tr></table></div></div><div class="course-description-item availabilityinfo">未達成の利用条件 <a href="#">課題</a></div></div></div>
            <div class="assign"><div id="other-task" class="activity-item" data-activityname="同じ課題名"><div class="activityname"><a href="/moodle40a/mod/assign/view.php?id=102">同じ課題名</a></div><div class="description"><a href="/moodle40a/mod/assign/view.php?id=101">別の課題への参照</a></div></div></div>
            <div id="course-quiz" class="activity-item"><div class="activityname"><a href="/moodle40a/mod/quiz/view.php?id=101">同じ課題名</a></div></div>
            <div id="course-resource" class="activity-item"><div class="activityname"><a href="/moodle40a/mod/resource/view.php?id=101">教材ファイル</a></div></div>
            <div class="contentwithoutlink"><div class="no-overflow"><span id="course-black" style="color:black">課題の説明</span><span id="course-blue" style="color:blue">課題提出について</span><span id="course-yellow" style="color:black;background:yellow">締切の強調</span></div></div><button class="icons-collapse-expand"><i class="icon">▼</i></button></div>
            <div class="activity-header" data-for="page-activity-header" id="quiz-header"><div class="activity-description" id="intro"><p>小テストの案内</p></div></div>
            <div class="activity-header" data-for="page-activity-header" id="assign-header"><div class="activity-information"><div>開始: 2026年4月1日</div><div>期限: 2026年10月12日</div></div><div class="activity-description"><p style="color:red">提出期限の案内</p></div></div><div class="generalbox quizgradefeedback" id="feedback"><h2>あなたの小テスト最終評点は 20.00 / 20.00 です。</h2></div><a class="gradedattempt" href="#">レビュー</a><div class="card">通常カード</div>
            <div id="filter"><div id="fieldfilter"><select class="custom-select"><option>すべて</option><option>完了</option></select></div><div id="fieldcolor"><input type="color" class="form-select" value="#063906"></div></div>
            <div class="event duedle-task-status complete"><div class="activityiconcontainer">icon</div><div class="overflow-auto"><h6><a href="#">直近イベント</a></h6><div class="date">残り3日</div></div></div><div id="display"><div class="assign complete"><div class="title">課題</div><div class="info"><a href="#">リンク</a><ul><li>情報</li></ul></div></div></div>
            <div class="que ddwtos"><div class="formulation"><div class="qtext">問題文 <span class="drop active group1" tabindex="0">ドロップ先</span></div><div class="answercontainer"><span class="draghome group1" tabindex="0">人間力</span><span class="draghome group3" tabindex="0">リーダーシップ</span></div></div></div><div class="warning" id="native-warning">Moodle本来の警告</div></main></body></html>`}));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/view.php?id=1');
        await page.evaluate(() => {
            document.body.classList.add('path-mod');
            const conditions = document.createElement('div');
            conditions.className = 'automatic-completion-conditions';
            conditions.innerHTML = '<span class="badge alert-success"><i class="icon">✔</i> <strong>完了:</strong> 閲覧する</span> <span class="badge alert-success"><i class="icon">✔</i> <strong>完了:</strong> 評定を受ける</span> <span class="badge alert-danger">未合格</span> <span class="badge badge-light">要対応</span>';
            document.querySelector('#quiz-header').prepend(conditions);
            const unrelated = document.createElement('span');
            unrelated.id = 'unrelated-badge';
            unrelated.className = 'badge';
            unrelated.style.mixBlendMode = 'multiply';
            unrelated.textContent = '別のバッジ';
            document.querySelector('#region-main').append(unrelated);
        });
        for (const file of ['theme/dark.css','theme/light.css','theme/ios.css','storage/display/style.css','common/common.css']) await page.addStyleTag({path:'src/'+file});
        await page.addScriptTag({path:'src/theme/state.js'});
        await page.addScriptTag({path:'src/theme/content.js'});
        const filter = fs.readFileSync('src/storage/display/filter.js','utf8');
        await page.addScriptTag({content: 'const colorTypesValue=["complete"];' + filter.slice(filter.indexOf('const applyColor ='),filter.indexOf('const colorDefault_light'))});
        const display = fs.readFileSync('src/storage/display/displaybox.js','utf8');
        await page.addScriptTag({content: display.slice(display.indexOf('const setActivityStatus ='),display.indexOf('let colorReloadVersion'))
            + display.slice(display.indexOf('const transDue ='),display.indexOf('rerender().catch'))});
        await page.evaluate(() => {
            const item = {group:'assign_list',assignId:101,assignName:'同じ課題名'};
            changeActivityColor({...item,status:'expired'});
            changeActivityColor({...item,status:'complete'});
        });
        assert.equal(await page.locator('#course-task.complete:not(.expired)').count(),1,'Modern activity is matched by its own title URL and replaces old status');
        assert.equal(await page.locator('#other-task.duedle-task-status, #course-quiz.duedle-task-status').count(),0,'Identical names, other module types and description links never match');
        await page.evaluate(()=>checkUnvisited());
        assert.equal(await page.locator('#other-task.unvisited, #course-quiz.unvisited').count(),2,'Unvisited tasks receive their own status');
        assert.equal(await page.locator('#course-resource.duedle-task-status').count(),0,'Resources are not tasks');
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
                for (const badge of await page.locator('.automatic-completion-conditions .badge').all()) {
                    assert.equal(await badge.evaluate(el => getComputedStyle(el).mixBlendMode), mode === 1 ? 'normal' : 'multiply', 'Only dark mode disables completion badge blending');
                }
                assert.equal(await page.locator('#unrelated-badge').evaluate(el => getComputedStyle(el).mixBlendMode), 'multiply', 'Other badges keep their blending');
                const complete = await style('.automatic-completion-conditions .alert-success');
                assert.equal(complete.color, mode === 1 ? 'rgb(196, 227, 194)' : 'rgb(30, 70, 32)');
                assert.equal(complete.bg, mode === 1 ? 'rgb(40, 78, 37)' : 'rgb(209, 226, 210)');
                assert.equal((await style('.automatic-completion-conditions .icon')).color, complete.color, 'Completion icons inherit the readable foreground');
                const intro = await style('#intro');
                const course = await style('.activity-item');
                assert.equal(course.bg,(await style('#display > .assign')).bg,'Course activity uses the same status background as the dashboard');
                assert.equal((await style('#course-task .activityname a')).color,(await style('#display a')).color,'Course task link remains readable on its status background');
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
        // Page-owned inline colors can change before or during dark mode.
        // Restoring light mode must use those latest values and priorities.
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => {
            const root = document.createElement('div');
            root.className = 'activity-description';
            root.innerHTML = '<span id="dynamic-author" style="color:red!important;background-color:yellow!important"><span id="dynamic-child">教材</span></span>';
            document.querySelector('#region-main').append(root);
            globalThis.authorMutations = 0;
            new MutationObserver(records => { authorMutations += records.length; }).observe(root, {attributes:true, subtree:true});
        });
        await settle();
        await page.evaluate(() => document.querySelector('#dynamic-author').style.setProperty('color','blue','important'));
        await settle();
        assert.equal((await style('#dynamic-author')).color,'rgb(0, 0, 255)');
        await page.evaluate(() => duedleApplyTheme(1));
        await settle();
        assert.notEqual((await style('#dynamic-author')).color,'rgb(0, 0, 255)','New author color is adapted in dark mode');
        assert.equal((await style('#dynamic-child')).color,(await style('#dynamic-author')).color,'Inherited author colors are read before adaptation');
        await page.evaluate(() => {
            const author = document.querySelector('#dynamic-author');
            author.style.setProperty('color','green','important');
            author.style.setProperty('background-color','white','important');
            author.insertAdjacentHTML('beforeend','<span id="inserted-child">追加</span>');
        });
        await settle();
        assert.equal((await style('#inserted-child')).color,(await style('#dynamic-author')).color,'A new child inherits the latest author color, not a second conversion');
        await page.evaluate(() => duedleApplyTheme(2));
        await settle();
        assert.equal((await style('#dynamic-author')).color,'rgb(0, 128, 0)');
        assert.equal((await style('#dynamic-author')).bg,'rgb(255, 255, 255)');
        assert.equal((await style('#inserted-child')).color,'rgb(0, 128, 0)');
        await page.evaluate(() => {
            const author = document.querySelector('#dynamic-author');
            duedleApplyTheme(1);
            author.style.setProperty('color','purple');
            author.style.removeProperty('background-color');
        });
        await settle();
        await page.evaluate(() => duedleApplyTheme(2));
        await settle();
        assert.equal((await style('#dynamic-author')).color,'rgb(128, 0, 128)');
        assert.deepEqual(await page.locator('#dynamic-author').evaluate(el => ({
            priority:el.style.getPropertyPriority('color'), background:el.style.getPropertyValue('background-color')
        })),{priority:'',background:''},'Page removal of important/background declarations remains intact');
        await page.evaluate(() => document.querySelector('#dynamic-author').style.removeProperty('color'));
        await settle();
        await page.evaluate(() => { duedleApplyTheme(1); duedleApplyTheme(2); });
        await settle();
        assert.equal(await page.locator('#dynamic-author').evaluate(el => el.style.getPropertyValue('color')),'','Removed author color is not resurrected');
        const mutationCount = await page.evaluate(() => authorMutations);
        await settle();
        assert.equal(await page.evaluate(() => authorMutations),mutationCount,'Theme observer reaches a fixed point without a style mutation loop');
        // A custom task color needs readable text in both light and dark modes.
        await page.evaluate(()=>{duedleApplyTheme(2);applyColor('complete','#101010')});
        assert.equal((await style('#display .info')).color,'rgb(255, 255, 255)');
        assert.equal((await style('#display a')).color,'rgb(139, 197, 232)');
        assert.equal((await style('#course-task')).bg,'rgb(16, 16, 16)');
        assert.equal((await style('#course-task')).color,'rgb(255, 255, 255)');
        assert.equal((await style('#course-task > .description > .course-description-item')).color,'rgb(29, 33, 37)','Light description panels retain readable text with dark custom task colors');
        // Slow storage reads from an earlier mode cannot overwrite the newest palette.
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
        await page.evaluate(() => {
            document.querySelector('#authored').style.setProperty('color','blue','important');
            document.querySelector('#authored td').insertAdjacentHTML('beforeend','<span id="initial-dark-child">追加</span>');
        });
        await settle();
        await page.evaluate(() => document.body.classList.remove('darkmode'));
        await settle();
        assert.equal((await style('#authored')).color,'rgb(0, 0, 255)','Direct dark loading restores a subsequent page-owned color change');
        assert.equal((await style('#initial-dark-child')).color,'rgb(0, 0, 255)');
        await page.evaluate(() => document.body.classList.add('darkmode'));
        await settle();
        await page.locator('.drop.active').focus();
        assert.equal((await style('.drop.active')).border,'rgb(139, 197, 232)','Focused drop target has a visible border');
        for (const width of [320,390,1280]) {
            await page.setViewportSize({width,height:900});
            const bounds=await page.locator('#feedback').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:el.scrollWidth,client:el.clientWidth};});
            assert(bounds.left>=0 && bounds.right<=bounds.width && bounds.scroll<=bounds.client,'Final grade does not overflow at '+width);
        }
        await page.screenshot({path:'/private/tmp/duedle-drag-dark.png',fullPage:true});
        // Login uses its own white panel and gradient outside Moodle's card rules.
        await page.setContent(`<!doctype html><html><head><style>
            #page {background:#f8f9fa;background-image:linear-gradient(to right,#f8f9fa,#dee2e6)}
            .login-container {background-color:#fff;padding:3rem}
            .login-identityprovider-btn {color:#212529;border:1px solid #dee2e6}
            .login-container .divider {background-color:#dee2e6;width:1px;height:30px}
            </style></head><body id="page-login-index" class="pagelayout-login"><div id="page"><main id="region-main"><div class="login-wrapper"><div class="login-container">
            <h1>名古屋工業大学 Moodle にログインする</h1><form><input class="form-control" name="username"><input type="password" class="form-control" name="password"><button class="btn btn-primary">ログイン</button></form>
            <h2 class="login-heading">あなたのアカウントを使用してログインします:</h2><a class="btn login-identityprovider-btn" href="#">OpenID Connect</a><div class="divider"></div>
            </div></div></main></div></body></html>`);
        for (const file of ['theme/dark.css','theme/light.css','theme/ios.css']) await page.addStyleTag({path:'src/'+file});
        await page.addScriptTag({path:'src/theme/state.js'});
        for (const ios of [false,true]) {
            await page.evaluate(ios=>duedleApplyTheme(1,ios),ios);
            assert.equal((await style('.login-container')).bg,ios?'rgb(28, 28, 30)':'rgb(38, 53, 65)');
            assert.equal((await style('#page')).image,'none');
            assert.notEqual((await style('.login-heading')).color,'rgb(33, 37, 41)');
            assert.equal((await style('.login-identityprovider-btn')).color,ios?'rgb(242, 242, 247)':'rgb(221, 221, 223)');
            await page.evaluate(ios=>duedleApplyTheme(2,ios),ios);
            assert.equal((await style('.login-container')).bg,'rgb(255, 255, 255)');
            assert.notEqual((await style('#page')).image,'none');
        }
        await page.evaluate(()=>duedleApplyTheme(1,true));
        await page.screenshot({path:'/private/tmp/duedle-login-dark.png',fullPage:true});
        console.log('PASS theme components: course descriptions/restrictions, intro, review, arrows, color wells, scoped status colors, custom text contrast, repeated light/dark/honobono with iOS on/off, async palette race');
    } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
