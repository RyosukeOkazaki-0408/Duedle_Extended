// Synthetic Moodle content and Atto editing surface; all network requests intercepted.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const native = `body{background:white;color:#111} .generalbox{background:white}
 .qn-question{background:#e4f1fa} .qn-info{background:#eee} .nav-tabs{background:#e9ecef}
 .nav-link{background:white;color:#0068d9} .nav-link.active{background:#6c757d;color:white}
 .editor_atto_content{background:white;color:black}`;
const html = kind => `<!doctype html><html><head><meta charset="utf-8"><style>${native}</style></head>
<body class="${kind === 'questionnaire' ? 'path-mod-questionnaire' : ''}"><main id="region-main">
${kind === 'questionnaire' ? `<ul class="nav-tabs"><li><a class="nav-link" href="#other">あなたの回答</a></li><li><a class="nav-link active" href="#current">全回答の閲覧</a></li></ul>
 <div class="qn-info">1</div><div class="qn-question">設問 <span id="black" style="color:black">明示的な黒文字</span></div>` : ''}
${kind === 'page' ? '<div class="generalbox center clearfix"><div class="no-overflow"><p><span id="black" style="color:black!important">教材本文</span></p></div></div>' : ''}
${kind === 'quiz' ? `<div class="que"><div class="formulation"><div class="qtext">
 <h2 id="heading" style="color:#c00000">教員の赤い見出し</h2><div id="card" class="card" style="background:yellow;color:black">黄色の注意事項</div></div>
 <div class="answer"><div class="editor_atto_wrap"><div class="editor_atto_content" contenteditable="true" id="editor"><p><br></p></div></div></div></div></div>` : ''}
</main></body></html>`;
const contrast = (a,b) => {
    const lum = color => color.match(/[\d.]+/g).slice(0,3).map(Number).reduce((sum,v,i) => {
        const s = v / 255; return sum + [0.2126,0.7152,0.0722][i] * (s <= .04045 ? s / 12.92 : ((s+.055)/1.055)**2.4);
    },0);
    const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage();
        let kind = 'questionnaire';
        await page.route('**/*', route => route.fulfill({contentType:'text/html',body:html(kind)}));
        const load = async path => {
            await page.goto(root + path);
            for (const file of ['dark.css','light.css','ios.css']) await page.addStyleTag({path:'src/theme/'+file});
            await page.addScriptTag({path:'src/theme/state.js'});
            await page.addScriptTag({path:'src/theme/content.js'});
        };
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const style = selector => page.locator(selector).evaluate(el => {const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor};});
        await load('mod/questionnaire/report.php');
        for (const ios of [false,true]) {
            await page.evaluate(ios => duedleApplyTheme(1,ios),ios); await settle();
            const question=await style('.qn-question'), black=await style('#black'), tab=await style('.nav-link:not(.active)');
            assert(contrast(black.color,question.bg)>=4.5,'Explicit black question text must be readable');
            assert(contrast(tab.color,tab.bg)>=4.5,'Inactive report tab must be readable');
            const active=await style('.nav-link.active');
            assert(contrast(active.color,active.bg)>=4.5,'Active report tab must be readable');
            await page.evaluate(ios => duedleApplyTheme(2,ios),ios); await settle();
            assert.equal((await style('#black')).color,'rgb(0, 0, 0)');
            assert.equal((await style('.nav-link:not(.active)')).bg,'rgb(255, 255, 255)');
        }
        kind='page'; await load('mod/page/view.php?id=1');
        for (const ios of [false,true]) {
            await page.evaluate(ios => duedleApplyTheme(1,ios),ios); await settle();
            const black=await style('#black'), panel=await style('.generalbox');
            assert.notEqual(black.color,'rgb(0, 0, 0)','Important black text is adapted');
            assert.equal(black.bg,'rgba(0, 0, 0, 0)');
            assert(contrast(black.color,panel.bg)>=4.5,'Explicit page text must contrast with its panel');
            await page.evaluate(ios => duedleApplyTheme(2,ios),ios); await settle();
            assert.equal((await style('#black')).color,'rgb(0, 0, 0)');
            assert.equal(await page.locator('#black').evaluate(el=>el.style.getPropertyPriority('color')),'important');
        }
        kind='quiz'; await load('mod/quiz/attempt.php?attempt=1');
        const editor = page.locator('#editor');
        const pristine = await editor.innerHTML();
        for (const ios of [false,true]) for (const mode of [1,2,3,0]) {
            await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios),{mode,ios}); await settle();
            assert.equal(await editor.innerHTML(),pristine,'Theme changes do not add markup to empty answers');
            assert.equal(await editor.locator('.duedle-content-colors').count(),0);
            if (mode === 2) {
                assert.equal((await style('#heading')).color,'rgb(192, 0, 0)','iOS must preserve authored emphasis');
                assert.equal((await style('#card')).bg,'rgb(255, 255, 0)','iOS must preserve authored background');
            }
        }
        await editor.fill('学生の解答'); await settle();
        const answer=await editor.innerHTML();
        await page.evaluate(() => duedleApplyTheme(1,true)); await settle();
        assert.equal(await editor.innerHTML(),answer,'Existing answer HTML survives dark mode');
        assert.equal(await editor.locator('[style], [class]').count(),0,'No Duedle attributes in editable answer');
        await editor.evaluate(el=>{el.innerHTML='<p>動的に入力した <span style="color:red">解答</span></p>';});
        const formatted = await editor.innerHTML(); await settle();
        assert.equal(await editor.innerHTML(),formatted,'Editing markup added later is never decorated');
        assert.equal(await editor.locator('.duedle-content-colors').count(),0);
        await page.evaluate(() => duedleApplyTheme(2,true)); await settle();
        assert.equal(await editor.innerHTML(),formatted);
        console.log('PASS authored content: questionnaire/report contrast, page colors, iOS emphasis, unchanged Atto empty and edited answers across modes');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
