// Moodle 4.0 TinyMCE 3 structures and native CSS, on local synthetic pages only.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage({viewport:{width:1000,height:900}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({contentType:'text/html',body:'<!doctype html><body>Unrelated frame</body>'}));
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/quiz/attempt.php?attempt=1&cmid=1');
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
            body{background:white;color:#1d2125;font:16px sans-serif}
            #quiz-timer-wrapper #quiz-timer{background-color:#fff;border:1px solid #ca3120;padding:8px}
            .moodleSkin *{color:#000;background:transparent}
            .moodleSkin .mceToolbar td+td{background:#fff;border:1px solid #ccc}
            .moodleSkin table.mceLayout{border:1px solid #bbb;width:100%}
            .moodleSkin .mceIframeContainer{border-top:1px solid #bbb;border-bottom:1px solid #bbb}
            .moodleSkin .mceStatusbar{color:#000}
            .moodleSkin .mceText{color:#000}
            .moodleSkin .mceListBox .mceText{background:#eaf2fb}
            .moodleSkin .mceMenu table{background:#fff}
            .moodleSkin .mceMenu .mceText{color:#000}
            .moodleSkin .mceMenu .mceMenuItemEnabled a:hover{background:#dbecf3}
            .moodleSkin .mceMenuItemDisabled .mceText{color:#888}
            .moodleSkin a.mceButton{display:inline-block;width:32px;height:32px}
            .moodleSkin .mceIcon{display:block;width:24px;height:24px;background-image:linear-gradient(#000,#888)}
            .moodleSkin .mceButtonDisabled .mceIcon{opacity:.3}
            .moodleSkin a.mceButtonEnabled:hover,.moodleSkin a.mceButtonActive{background-image:radial-gradient(#fff 40%,#dfdfdf 100%);background-color:#dfdfdf}
            iframe{width:100%;height:210px;border:0}.que{margin-top:20px}
            </style></head><body id="page-mod-quiz-attempt" class="path-mod-quiz"><main id="region-main">
            <div id="quiz-timer-wrapper"><div id="quiz-timer" class="quiz-timer-inner timeleft35" role="timer">残り時間 <span id="quiz-time-left">0:00:35</span></div></div>
            <form id="responseform"><div class="que essay"><div class="formulation"><div class="qtext">テスト用の問題文</div>
            <div class="answer"><textarea id="answer" hidden></textarea><span class="mceEditor moodleSkin"><table class="mceLayout"><tbody>
            <tr><td><table class="mceToolbar"><tr><td></td><td><a id="bold" href="#" role="button" class="mceButton mceButtonEnabled"><span class="mceIcon">B</span></a></td><td><a id="disabled" href="#" class="mceButton mceButtonDisabled"><span class="mceIcon">×</span></a></td><td><table class="mceListBox mceListBoxEnabled"><tr><td><a id="format-trigger" class="mceText" href="#">段落</a></td></tr></table></td></tr></table></td></tr>
            <tr><td class="mceIframeContainer"><iframe id="answer_ifr" title="解答欄"></iframe></td></tr>
            <tr><td class="mceStatusbar">パス: p</td></tr></tbody></table></span></div></div></div></form>
            <iframe id="unrelated_ifr" title="教材プレビュー"></iframe>
            <div class="mceIframeContainer"><iframe id="foreign_ifr" title="外部フレーム" src="https://other.example.invalid/frame"></iframe></div>
            </main><div class="moodleSkin" id="format-menu" hidden><div class="mceMenu"><table><tbody><tr><td class="mceMenuItemTitle"><a href="#"><span id="format-title" class="mceText">書式</span></a></td></tr><tr><td class="mceMenuItemEnabled"><a id="format-heading" href="#"><span class="mceText">見出し</span></a></td></tr><tr><td class="mceMenuItemDisabled"><a href="#"><span class="mceText">使用不可</span></a></td></tr></tbody></table></div><div class="mceColorSplitMenu"><table><tr><td class="mceMoreColors"><a id="more-colors" class="mceMoreColors" href="#">他の色</a></td><td><a id="color-swatch" style="background:red" href="#"></a></td></tr></table></div></div></body></html>`);
        const answerDocument = `<!doctype html><html><head><style>body,td,pre{color:#000;font:16px sans-serif}body,body.mceForceColors{background:#fff;color:#000}a{color:#006dcc}td.mceSelected,th.mceSelected{background:#39f!important}</style></head><body id="tinymce" class="mceContentBody mceForceColors" contenteditable="true"><p>解答の下書き <strong>太字</strong> <span style="color:red">色付き文字</span><a href="#">リンク</a><img alt="図" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect fill='red' width='10' height='10'/%3E%3C/svg%3E"></p><table><tr><th>見出し</th><td>表の文字</td><td class="mceSelected">選択中</td></tr></table><pre>整形済み文字</pre></body></html>`;
        await page.evaluate(html => {
            globalThis.answerDocument = html;
            document.querySelector('#answer_ifr').srcdoc = html;
            document.querySelector('#unrelated_ifr').srcdoc = html;
        }, answerDocument);
        const frame = page.frameLocator('#answer_ifr');
        await frame.locator('body[contenteditable]').waitFor();
        for (const file of ['dark.css','light.css','ios.css']) await page.addStyleTag({path:'src/theme/'+file});
        // Actual skin selectors loaded after the extension must not win a tie.
        await page.addStyleTag({content:'.moodleSkin .mceMenuItemTitle span.mceText{color:#000}.moodleSkin .mceColorSplitMenu table{background:#fff}.moodleSkin .mceColorSplitMenu a.mceMoreColors{background:#fff}'});
        await page.addScriptTag({path:'src/theme/state.js'});
        await page.addScriptTag({path:'src/theme/content.js'});
        // Mirrors the editor's body-only serialization and formatting operation.
        await page.evaluate(() => {
            const frame = document.querySelector('#answer_ifr');
            globalThis.saveAnswer = () => {
                const html = frame.contentDocument.body.innerHTML;
                document.querySelector('#answer').value = html;
                return html;
            };
            document.querySelector('#bold').addEventListener('mousedown', event => event.preventDefault());
            document.querySelector('#bold').addEventListener('click', event => {
                event.preventDefault();
                frame.contentDocument.execCommand('bold');
                saveAnswer();
            });
            document.querySelector('#format-trigger').addEventListener('mousedown', event => event.preventDefault());
            document.querySelector('#format-trigger').addEventListener('click', event => {event.preventDefault();document.querySelector('#format-menu').hidden=false;});
            document.querySelector('#format-heading').addEventListener('mousedown', event => event.preventDefault());
            document.querySelector('#format-heading').addEventListener('click', event => {
                event.preventDefault();frame.contentDocument.execCommand('formatBlock',false,'h2');
                saveAnswer();document.querySelector('#format-menu').hidden=true;
            });
        });
        const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const style = locator => locator.evaluate(el => {const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,border:s.borderColor,image:s.backgroundImage,filter:s.filter,opacity:s.opacity,scheme:s.colorScheme}});
        const originalAnswer = await frame.locator('body').innerHTML();
        const originalBodyAttributes = await frame.locator('body').evaluate(body => [...body.attributes].map(a=>[a.name,a.value]));
        const nativeSelectors = ['#quiz-timer','.mceLayout','.mceToolbar td+td','.mceText','.mceStatusbar','#bold','#bold .mceIcon','#disabled .mceIcon','#format-menu td','#format-heading .mceText','#format-title','#more-colors'];
        const warnings = Array.from({length:17}, (_,second) => `#quiz-timer-wrapper #quiz-timer.timeleft${second}{background-color:hsl(5,70%,${40+second*3}%);color:${second<8?'white':'black'}}`).join('\n');
        await page.addStyleTag({content:warnings});
        for (const ios of [false,true]) {
            const baselines = {};
            for (const mode of [2,3]) {
                await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios), {mode,ios});
                await settle();
                baselines[mode] = await Promise.all(nativeSelectors.map(selector => style(page.locator(selector).first())));
            }
            for (const mode of [2,1,3,1,2]) {
                await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios), {mode,ios});
                await settle();
                if (mode === 1) {
                    const surface = ios ? 'rgb(28, 28, 30)' : 'rgb(38, 53, 65)';
                    const text = ios ? 'rgb(242, 242, 247)' : 'rgb(221, 221, 223)';
                    for (const locator of [frame.locator('body'),page.locator('#quiz-timer'),page.locator('.mceToolbar td+td').first(),page.locator('.mceStatusbar')]) {
                        assert.equal((await style(locator)).bg,surface);
                        assert.equal((await style(locator)).color,text);
                    }
                    assert.equal((await style(frame.locator('html'))).scheme,'dark');
                    for (const selector of ['td:not(.mceSelected)','th','pre']) assert.equal((await style(frame.locator(selector))).color,text,'Tables and preformatted text inherit the readable editor color');
                    assert.equal((await style(frame.locator('.mceSelected'))).bg,'rgb(60, 78, 92)','Selected cells keep a readable contrasting background');
                    assert.notEqual((await style(page.locator('#bold .mceIcon'))).filter,'none','Sprite icons become readable');
                    assert.equal((await style(page.locator('#disabled .mceIcon'))).opacity,'0.3','Disabled buttons stay visibly disabled');
                    await page.locator('#bold').hover();
                    assert.equal((await style(page.locator('#bold'))).image,'none','Hover does not restore the white gradient');
                    await page.mouse.move(0,0);
                    await page.locator('#bold').evaluate(button => button.classList.add('mceButtonActive'));
                    assert.equal((await style(page.locator('#bold'))).image,'none');
                    await page.locator('#bold').evaluate(button => button.classList.remove('mceButtonActive'));
                    await page.locator('#format-trigger').click();
                    assert.equal((await style(page.locator('#format-menu td').first())).bg,surface,'Format menu has a dark surface');
                    assert.equal((await style(page.locator('#format-heading .mceText'))).color,text,'Format menu labels remain readable');
                    assert.equal((await style(page.locator('#format-title'))).color,text,'Late skin CSS cannot turn menu titles black');
                    assert.equal((await style(page.locator('#more-colors'))).bg,surface,'More colors does not leave a white label');
                    assert.equal((await style(page.locator('#more-colors'))).color,text);
                    await page.locator('#format-heading').hover();
                    assert.notEqual((await style(page.locator('#format-heading'))).bg,'rgb(219, 236, 243)');
                    await page.evaluate(() => document.querySelector('#format-menu').hidden=true);
                    await page.mouse.move(0,0);
                } else {
                    assert.deepEqual(await Promise.all(nativeSelectors.map(selector => style(page.locator(selector).first()))),baselines[mode],'Other modes recover their native timer and toolbar styles');
                    assert.equal((await style(frame.locator('body'))).bg,'rgb(255, 255, 255)');
                    assert.equal((await style(frame.locator('body'))).color,'rgb(0, 0, 0)');
                    assert.equal(await frame.locator('#duedle-editor-theme').count(),0,'Light modes remove the iframe stylesheet');
                    assert.equal(await frame.locator('html').getAttribute('data-duedle-editor-dark'),null);
                }
                assert.equal(await frame.locator('body').innerHTML(),originalAnswer,'Theme toggles never modify answer HTML');
                assert.deepEqual(await frame.locator('body').evaluate(body => [...body.attributes].map(a=>[a.name,a.value])),originalBodyAttributes,'No theme attributes are stored on the answer body');
                assert.equal(await page.evaluate(() => saveAnswer()),originalAnswer,'Saved HTML contains no theme classes or styles');
                assert.equal(await frame.locator('body .duedle-content-colors').count(),0);
                assert.equal(await page.locator('.mceEditor .duedle-content-colors').count(),0,'Editor controls are not teacher-authored content');
                assert.equal(await page.frameLocator('#unrelated_ifr').locator('#duedle-editor-theme').count(),0,'Preview iframes are untouched');
                assert.equal((await style(page.locator('#color-swatch'))).bg,'rgb(255, 0, 0)','Palette swatches retain their real colors');
            }
            // Test every warning class as well as the 17-second boundary.
            for (const second of [100,99,35,17,...Array.from({length:17},(_,i)=>16-i)]) {
                await page.evaluate(second => {document.querySelector('#quiz-timer').className='quiz-timer-inner timeleft'+second;duedleApplyTheme(2);},second);
                const native = await style(page.locator('#quiz-timer'));
                await page.evaluate(ios => duedleApplyTheme(1,ios),ios);
                await settle();
                const dark = await style(page.locator('#quiz-timer'));
                if (second <= 16) assert.deepEqual([dark.bg,dark.color,dark.border],[native.bg,native.color,native.border],'Final-seconds warning colors remain unchanged');
                else assert.notEqual(dark.bg,'rgb(255, 255, 255)','Ordinary countdown classes are dark too');
            }
            await page.evaluate(() => document.querySelector('#quiz-timer').className='quiz-timer-inner timeleft35');
        }
        // Same-origin frame reloads and editors initialized after dark mode.
        await page.evaluate(() => {duedleApplyTheme(1);document.querySelector('#answer_ifr').srcdoc=answerDocument.replace('解答の下書き','再読込した解答');});
        await frame.getByText('再読込した解答', {exact:false}).first().waitFor();
        await frame.locator('html[data-duedle-editor-dark]').waitFor({state:'attached'});
        assert.equal((await style(frame.locator('body'))).bg,'rgb(38, 53, 65)');
        await page.evaluate(() => {
            const wrapper=document.createElement('div');wrapper.className='mceIframeContainer';
            const frame=document.createElement('iframe');frame.id='late_ifr';frame.srcdoc=answerDocument;
            wrapper.append(frame);document.querySelector('#region-main').append(wrapper);
        });
        await page.frameLocator('#late_ifr').locator('html[data-duedle-editor-dark]').waitFor({state:'attached'});
        assert.equal((await style(page.frameLocator('#late_ifr').locator('body'))).bg,'rgb(38, 53, 65)');
        if (process.argv.includes('--css-only')) {
            assert.deepEqual(errors,[]);
            console.log('PASS editor CSS: menus/load order, tables/preformatted text/selection, palette swatches, timer warning colors, dark/light/honobono restoration, iOS on/off, iframe lifecycle');
            return;
        }
        // Typing and rich-text formatting still produce ordinary answer HTML.
        await frame.locator('body').fill('入力した解答');
        await frame.locator('body').evaluate(body => {const r=body.ownerDocument.createRange();r.selectNodeContents(body);const s=body.ownerDocument.getSelection();s.removeAllRanges();s.addRange(r);});
        await page.locator('#bold').click();
        assert.equal(await frame.locator('b,strong').textContent(),'入力した解答');
        await page.locator('#format-trigger').click();
        await page.locator('#format-heading').click();
        assert.equal(await frame.locator('h2').textContent(),'入力した解答','The format menu can still change the selected block');
        const typedAnswer = await page.evaluate(() => saveAnswer());
        assert(!/duedle|<style|data-duedle/.test(typedAnswer),'Typed and formatted answer stays free of theme markup');
        await page.screenshot({path:'/private/tmp/duedle-quiz-editor-dark.png',fullPage:true});
        await page.evaluate(() => duedleApplyTheme(2));await settle();
        assert.equal(await frame.locator('body').innerHTML(),typedAnswer);
        assert.equal(await page.evaluate(() => document.querySelector('#foreign_ifr').contentDocument),null,'Cross-origin editor-like frames stay inaccessible');
        assert.deepEqual(errors,[]);
        console.log('PASS quiz editor theme: iframe dark/light restoration, late init/reload, readable toolbar/disabled states, typing/formatting and answer HTML preserved, all countdown warning classes, iOS on/off, unrelated/cross-origin frames untouched');
    } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
