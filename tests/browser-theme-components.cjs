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
        // Moodle 4.0 YUI dialogs live outside #region-main. Native rules mirror
        // theme/boost/scss/moodle/{core,filemanager}.scss; see core templates
        // filemanager_{modal_generallayout,uploadform,fileselect,chooselicense}.
        await page.addStyleTag({content:`
            .moodle-dialogue-base .moodle-dialogue-wrap{background:#fff;border:1px solid #ccc}
            .moodle-dialogue-base .moodle-dialogue-wrap .moodle-dialogue-hd{border-bottom:1px solid #dee2e6}
            .moodle-dialogue-base .moodle-dialogue-wrap .moodle-dialogue-hd.yui3-widget-hd{color:initial;background:initial}
            .moodle-dialogue-base .moodle-dialogue .moodle-dialogue-content .moodle-dialogue-ft.yui3-widget-ft{background:initial}
            .moodle-dialogue-base .closebutton{color:#000;background:transparent}
            .file-picker .fp-content{background:#fff}
            .nav-pills .nav-link.active{background:#0f6cbf;color:#fff}
            .btn-secondary{background:#ced4da;color:#1d2125;border:1px solid #ced4da}
            .fp-viewbar:not(.disabled) a.checked{background:#b1bbc4;color:#1d2125}
            .form-control{background:#fff;color:#495057;border:1px solid #8f959e}
            .fp-select .fp-thumbnail{background:#fff;border:1px solid #ddd;box-shadow:inset 0 0 10px #ccc}
            .fp-iconview .fp-filename-field .fp-filename{background:#fff}
            .fp-iconview .fp-thumbnail{border:1px solid #fff}
            .fp-iconview .fp-thumbnail:hover{background:#fff;border:1px solid #ddd;box-shadow:inset 0 0 10px #ccc}
            .fp-iconview .fp-thumbnail img{border:1px solid #ddd;box-shadow:1px 1px 2px #ccc}
            .aalink:focus,.aalink.focus,.arrow_link:focus,.arrow_link.focus,a:not([class]):focus,.activityinstance>a:focus{outline:2px solid transparent;color:#212529;background-color:#d3e8fa;box-shadow:0 -2px #d3e8fa,0 2px #343a40}
            .yui3-skin-sam .yui3-datatable-header{background:#fff;color:#000;text-shadow:0 1px 1px #fff}
            .yui3-skin-sam .yui3-datatable-even .yui3-datatable-cell{background-color:#fff}
            .yui3-skin-sam .yui3-datatable-odd .yui3-datatable-cell{background-color:#edf5ff}
            .filemanager .yui3-datatable-header{background:#fff!important;color:#555!important;border-bottom:1px solid #ccc!important}
            .filemanager .yui3-datatable-even .yui3-datatable-cell{background-color:#fff!important}
            .filemanager .yui3-datatable-odd .yui3-datatable-cell{background-color:#f6f6f6!important}
            .filepicker-filelist .dndupload-target,.filemanager-container .dndupload-target{background:#fff;border:2px dashed #fb7979;box-shadow:0 0 0 10px #fff}
            .filepicker-filelist.dndupload-over .dndupload-target,.filemanager-container.dndupload-over .dndupload-target{background:#fff;border:2px dashed #6c8cd3}
        `});
        await page.evaluate(() => {
            const dialogs = document.createElement('div');
            dialogs.className = 'moodle-dialogue-base';
            const frame = (id, content) => `<section id="${id}" class="moodle-dialogue"><div class="moodle-dialogue-content moodle-dialogue-wrap"><header class="moodle-dialogue-hd yui3-widget-hd"><h5>ファイル</h5><button class="closebutton">×</button></header><div class="moodle-dialogue-bd">${content}</div><footer class="moodle-dialogue-ft yui3-widget-ft"></footer></div></section>`;
            dialogs.innerHTML = frame('upload-dialog', `<div class="file-picker fp-generallayout"><div class="fp-repo-area nav nav-pills"><div class="fp-repo"><a href="#" class="nav-link">最近のファイル</a></div><div class="fp-repo"><a href="#" class="nav-link active">ファイルのアップロード</a></div></div><div class="fp-navbar card"><div class="fp-viewbar"><a href="#" class="btn btn-secondary checked">一覧</a></div></div><div class="fp-content card"><form class="fp-upload-form"><label>添付<input type="file"></label><label>名前<input class="form-control" value="提出.pdf"></label><div class="fp-setlicense"><label>ライセンス<select class="form-control"><option value="allrightsreserved">ライセンス未指定</option></select></label></div></form><button class="btn btn-primary">アップロード</button></div></div>`)
                + frame('file-dialog', `<div class="filemanager fp-select"><button class="btn btn-secondary">ダウンロード</button><form><label>名称<input class="form-control" value="提出.pdf"></label><div class="fp-license"><label>ライセンス<select class="form-control"><option value="allrightsreserved">ライセンス未指定</option></select></label></div><div class="fp-path"><select class="form-control custom-select"><option>/</option></select></div><button type="button" class="btn btn-secondary">キャンセル</button></form><div class="fp-info"><hr><p class="fp-thumbnail">PDF</p><div class="fp-fileinfo">最終更新日時 <span>2026年10月22日</span></div></div></div>`);
            document.body.append(dialogs);
            const files = document.createElement('div');
            files.id = 'submission-files';
            files.className = 'filemanager';
            files.innerHTML = '<div class="filemanager-toolbar"><button class="btn btn-secondary">フォルダ作成</button></div><div class="fp-iconview"><div class="fp-file"><a class="fp-thumbnail" href="#"><img width="64" height="64" alt="PDF" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\'%3E%3Crect fill=\'white\' width=\'64\' height=\'64\'/%3E%3C/svg%3E"></a><div class="fp-filename-field"><a class="fp-filename" href="#">提出.pdf</a></div></div></div>';
            document.querySelector('#region-main').append(files);
            document.body.classList.add('yui3-skin-sam');
            const detailTable = '<table><thead><tr><th class="yui3-datatable-header">名称</th></tr></thead><tbody><tr class="yui3-datatable-even"><td class="yui3-datatable-cell">提出.pdf</td></tr><tr class="yui3-datatable-odd"><td class="yui3-datatable-cell">画像.png</td></tr></tbody></table>';
            files.insertAdjacentHTML('beforeend', detailTable + '<div class="filemanager-container"><div id="drop-ready" class="dndupload-target">ドロップしてアップロード</div></div><div class="filemanager-container dndupload-over"><div id="drop-over" class="dndupload-target">ドロップしてアップロード</div></div>');
            document.querySelector('#upload-dialog .fp-content').insertAdjacentHTML('beforeend', detailTable);
            document.body.insertAdjacentHTML('beforeend', '<div class="filepicker-filelist dndupload-over"><div id="picker-drop" class="dndupload-target">ドロップしてアップロード</div></div><div id="focus-links"><button id="focus-start">開始</button><a id="focus-course" class="aalink coursename" href="#">コース名</a><a id="focus-plain" href="#">通常リンク</a><a id="focus-arrow" class="arrow_link" href="#">次へ</a><div class="activityinstance"><a id="focus-activity" href="#">活動</a></div><a id="focus-class" class="aalink focus" href="#">フォーカスクラス</a></div>');
            document.querySelector('#focus-links').addEventListener('click', event => event.preventDefault());
        });
        const darkStyles = await page.addStyleTag({path:'src/theme/dark.css'});
        for (const file of ['theme/light.css','theme/ios.css','storage/display/style.css','common/common.css']) await page.addStyleTag({path:'src/'+file});
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
        const fileSelectors = ['#submission-files .fp-filename', '#submission-files .fp-thumbnail', '#submission-files .fp-thumbnail img', '#submission-files .btn-secondary'];
        const fileImage = await page.locator('#submission-files img').getAttribute('src');
        const tableSelectors = ['#submission-files .yui3-datatable-header', '#submission-files .yui3-datatable-even td', '#submission-files .yui3-datatable-odd td', '#upload-dialog .yui3-datatable-header', '#upload-dialog .yui3-datatable-even td', '#upload-dialog .yui3-datatable-odd td'];
        const dropSelectors = ['#drop-ready', '#drop-over', '#picker-drop'];
        const dialogSelectors = ['.moodle-dialogue-wrap', '.moodle-dialogue-hd', '.moodle-dialogue-bd', '.moodle-dialogue-ft', '.closebutton', '.fp-repo-area', '.fp-repo .nav-link', '.fp-repo .active', '.fp-content', '.fp-viewbar .checked', '#file-dialog .btn-secondary', '.fp-setlicense select', '.fp-license select', '.fp-path select', '#file-dialog .fp-thumbnail', '.fp-fileinfo', ...fileSelectors];
        for (const ios of [false,true]) {
            const nativeDialogs = {};
            for (const mode of [2,3]) {
                await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios), {mode,ios});
                nativeDialogs[mode] = await Promise.all(dialogSelectors.map(style));
            }
            const nativeExtra = {};
            for (const mode of [2,3]) {
                await page.evaluate(({mode,ios}) => duedleApplyTheme(mode,ios), {mode,ios});
                nativeExtra[mode] = await Promise.all([...tableSelectors, ...dropSelectors, '#focus-class'].map(style));
            }
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
                if (mode === 1) {
                    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).colorScheme), 'dark', 'Dashboard styles must not let OS light override explicit dark controls');
                    const surface = ios ? 'rgb(28, 28, 30)' : 'rgb(38, 53, 65)';
                    const text = ios ? 'rgb(242, 242, 247)' : 'rgb(221, 221, 223)';
                    for (const selector of ['.moodle-dialogue-wrap', '.moodle-dialogue-hd', '.moodle-dialogue-bd', '.fp-repo-area', '.fp-content', '#file-dialog .fp-thumbnail']) {
                        assert.equal((await style(selector)).bg, surface, selector + ' has a dark surface outside #region-main');
                        assert.equal((await style(selector)).color, text);
                    }
                    assert.equal((await style('.fp-fileinfo')).color, text, 'File metadata remains readable');
                    assert.equal((await style('#submission-files .fp-filename')).bg, surface, 'Submission filename tile has no white background');
                    assert.equal((await style('#submission-files .fp-filename')).color, 'rgb(139, 197, 232)', 'Filename remains recognizable as a link');
                    for (const selector of ['#submission-files .fp-thumbnail', '#submission-files img']) {
                        assert.equal((await style(selector)).border, ios ? 'rgb(72, 72, 74)' : 'rgb(82, 97, 109)', 'Thumbnail frames use the dark separator');
                        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).boxShadow), 'none');
                    }
                    await page.locator('#submission-files .fp-thumbnail').hover();
                    assert.equal((await style('#submission-files .fp-thumbnail')).bg, ios ? 'rgb(44, 44, 46)' : 'rgb(60, 78, 92)', 'Hover highlights the thumbnail on a dark surface');
                    assert.equal((await style('#submission-files .fp-thumbnail')).border, ios ? 'rgb(100, 173, 255)' : 'rgb(139, 197, 232)', 'Hover has an accent border');
                    await page.mouse.move(0, 0);
                    assert.equal((await style('#submission-files .fp-thumbnail')).bg, surface, 'Leaving the thumbnail restores its resting surface');
                    for (const selector of tableSelectors) {
                        assert.equal((await style(selector)).bg, selector.includes('odd') ? ios ? 'rgb(44, 44, 46)' : 'rgb(46, 62, 74)' : surface, 'YUI detail tables use dark alternating rows');
                        assert.equal((await style(selector)).color, text, 'YUI headers and cells have readable text');
                    }
                    for (const selector of dropSelectors) {
                        assert.equal((await style(selector)).bg, surface, 'Ready and active drop targets stay dark');
                        assert.equal((await style(selector)).color, text);
                        assert(!await page.locator(selector).evaluate(el => getComputedStyle(el).boxShadow.includes('255, 255, 255')), 'Drop targets do not leave a white outer shadow');
                    }
                    assert.equal((await style('#submission-files .btn-secondary')).bg, ios ? 'rgb(44, 44, 46)' : 'rgb(46, 62, 74)', 'Submission toolbar buttons are dark outside dialogs');
                    assert.equal((await style('.fp-select label')).color, text, 'File properties labels remain readable');
                    for (const selector of ['.fp-setlicense select', '.fp-license select', '.fp-path select']) {
                        assert.equal((await style(selector)).bg, 'rgb(38, 53, 65)', 'Plain form-control selects are dark too');
                        assert.equal((await style(selector)).color, 'rgb(221, 221, 223)');
                    }
                    assert.notEqual((await style('.fp-repo .nav-link')).bg, (await style('.fp-repo .active')).bg, 'Selected repository is distinct');
                    assert.notEqual((await style('.fp-viewbar .checked')).bg, (await style('#file-dialog .btn-secondary')).bg, 'Selected file view is distinct');
                    // Reopening a dynamically created dialog must not require a theme toggle.
                    await page.evaluate(() => {
                        const dialog = document.querySelector('#file-dialog');
                        dialog.replaceWith(dialog.cloneNode(true));
                    });
                    assert.equal((await style('#file-dialog .moodle-dialogue-wrap')).bg, surface);
                } else {
                    assert.deepEqual(await Promise.all(dialogSelectors.map(style)), nativeDialogs[mode], 'Light and honobono restore their file dialog colors');
                    assert.deepEqual(await Promise.all([...tableSelectors, ...dropSelectors, '#focus-class'].map(style)), nativeExtra[mode], 'Detail tables, drop targets and focus restore their light palettes');
                }
                // Mouse clicks must stay readable, while Tab focus remains visible.
                for (const selector of ['#focus-course', '#focus-plain', '#focus-arrow', '#focus-activity']) {
                    await page.locator(selector).click();
                    assert.equal((await style(selector)).bg, mode === 1 ? 'rgb(60, 78, 92)' : 'rgb(211, 232, 250)', 'Focused links use the current theme background');
                    assert.equal((await style(selector)).color, mode === 1 ? 'rgb(255, 255, 255)' : 'rgb(33, 37, 41)', 'Focused link text remains readable');
                    if (mode === 1) assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
                }
                await page.locator('#focus-start').focus();
                await page.keyboard.press('Tab');
                assert(await page.locator('#focus-course').evaluate(el => el === document.activeElement && el.matches(':focus-visible')), 'Tab focus is preserved');
                if (mode === 1) {
                    assert.equal((await style('#focus-class')).bg, 'rgb(60, 78, 92)', 'Moodle focus classes match actual focus');
                    await page.locator('#submission-files .fp-thumbnail').focus();
                    assert.equal((await style('#submission-files .fp-thumbnail')).bg, ios ? 'rgb(44, 44, 46)' : 'rgb(60, 78, 92)', 'Keyboard focus highlights thumbnails too');
                }
                await page.locator('#focus-start').focus();
                assert.equal(await page.locator('.fp-license select').inputValue(), 'allrightsreserved');
                assert.equal(await page.locator('#file-dialog input').inputValue(), '提出.pdf');
                assert.equal(await page.locator('#submission-files img').getAttribute('src'), fileImage, 'File icon image stays intact');
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
                assert.equal(await page.locator('#fieldfilter select').inputValue(),'すべて');
                assert.equal(await page.locator('input[type=color]').inputValue(),'#063906');
            }
        }
        // Compare every computed property, including pseudo-elements, rather than
        // assuming that a light baseline with dark.css loaded is unaffected.
        // Keep large snapshots in the browser and transfer only differences.
        const snapshot = () => page.evaluate(() => {
            globalThis.isolationSnapshots ??= new Map();
            globalThis.isolationSnapshotId = (globalThis.isolationSnapshotId || 0) + 1;
            isolationSnapshots.set(isolationSnapshotId, [...document.querySelectorAll('*')]
                .filter(node => !node.matches('script, style, meta, head, title'))
                .flatMap((node, index) => [null, '::before', '::after'].map(pseudo => {
                    const style = getComputedStyle(node, pseudo);
                    return {node:node.tagName + '#' + (node.id || index) + (pseudo || ''),
                        values:Object.fromEntries([...style].map(property => [property, style.getPropertyValue(property)]))};
                })));
            return isolationSnapshotId;
        });
        const differences = (beforeId, afterId) => page.evaluate(({beforeId,afterId}) => {
            const before = isolationSnapshots.get(beforeId), after = isolationSnapshots.get(afterId);
            isolationSnapshots.delete(beforeId);
            isolationSnapshots.delete(afterId);
            return before.flatMap((entry, index) => Object.entries(entry.values).flatMap(([property, value]) =>
                value === after[index]?.values[property] ? [] : [{node:entry.node, property, before:value, after:after[index]?.values[property]}])).slice(0, 5);
        }, {beforeId,afterId});
        let isolationCases = 0;
        for (const width of [390,1280]) {
            await page.setViewportSize({width,height:900});
            for (const ios of [false,true]) {
                const applyMode = async mode => {
                    await page.evaluate(({mode,ios}) => {
                        duedleApplyTheme(mode,ios);
                        applyColor('complete', document.body.classList.contains('darkmode') ? '#063906' : '#90ee90');
                    }, {mode,ios});
                    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
                };
                for (const mode of [2,3,0]) {
                    await page.emulateMedia({colorScheme:'light'});
                    await applyMode(mode);
                    await page.mouse.move(0,0);
                    await page.locator('#focus-start').focus();
                    const baseline = await snapshot();
                    await applyMode(1);
                    await applyMode(mode);
                    assert.deepEqual(await differences(baseline, await snapshot()), [], `Dark round-trip preserves every computed property: mode=${mode}, ios=${ios}, width=${width}`);
                    for (const state of ['rest','click','hover','keyboard']) {
                        await page.mouse.move(0,0);
                        await page.locator('#focus-start').focus();
                        if (state === 'click') await page.locator('#focus-course').click();
                        if (state === 'hover') await page.locator('#submission-files .fp-thumbnail').hover();
                        if (state === 'keyboard') { await page.locator('#focus-start').focus(); await page.keyboard.press('Tab'); }
                        // Scrolling to a focused control must settle before the
                        // comparison so it cannot invalidate the previous hover.
                        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                        const enabled = await snapshot();
                        await darkStyles.evaluate(node => { node.sheet.disabled = true; });
                        try {
                            assert.deepEqual(await differences(enabled, await snapshot()), [], `dark.css has no effect outside dark mode: mode=${mode}, ios=${ios}, width=${width}, state=${state}`);
                        } finally { await darkStyles.evaluate(node => { node.sheet.disabled = false; }); }
                        isolationCases++;
                    }
                }
                // System appearance only controls mode 0; explicit modes remain fixed.
                for (const scheme of ['dark','light','dark','light']) {
                    await page.emulateMedia({colorScheme:scheme});
                    for (const mode of [0,1,2,3]) {
                        await applyMode(mode);
                        const classes = await page.locator('body').evaluate(node => ({dark:node.classList.contains('darkmode'),honobono:node.classList.contains('honobono')}));
                        assert.deepEqual(classes, {dark:mode === 1 || mode === 0 && scheme === 'dark', honobono:mode === 3}, 'System appearance respects explicit theme choices');
                    }
                }
            }
        }
        console.log(`PASS theme isolation: ${isolationCases} stylesheet comparisons, full computed styles/pseudo-elements, dark round-trips, explicit/system modes, iOS on/off, 390/1280px`);
        await page.setViewportSize({width:1280,height:900});
        await page.emulateMedia({colorScheme:'light'});
        await page.evaluate(() => { duedleApplyTheme(2); applyColor('complete','#90ee90'); });
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
        console.log('PASS theme components: file upload/properties dialogs, course descriptions/restrictions, intro, review, arrows, color wells, scoped status colors, custom text contrast, repeated light/dark/honobono with iOS on/off, async palette race');
    } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
