// Real card code in a synthetic page; no Moodle connection.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage();
        await page.setContent(`<!doctype html><html><head><style>
            [hidden]{display:none!important}.dropdown-menu{display:none}.dropdown-menu.show{display:block}
        </style></head><body><div id="display"></div></body></html>`);
        await page.evaluate(() => {
            globalThis.settings = {selectedShow:'all',selectedStatus:'all'};
            globalThis.ext = {storage:{sync:{get:async () => settings}}};
            globalThis.changes = [];
            globalThis.StorageUtil = {editData:async (...args) => changes.push(args)};
            document.addEventListener('click', event => {
                const button = event.target.closest('[data-toggle="dropdown"]');
                if (button) button.parentElement.querySelector('.dropdown-menu').classList.toggle('show');
            });
        });
        for (const file of ['common/utils.js','storage/class/scrape/Scrape.js','storage/class/task/TaskBox.js',
            'storage/class/task/AssignBox.js','storage/class/task/QuizBox.js','storage/display/displaybox.js']) {
            await page.addScriptTag({path:'src/' + file});
        }
        await page.evaluate(async () => {
            const base = {show:true,status:'incomplete',due:null};
            const tasks = [
                { ...base,group:'assign_list',assignId:1,courseName:'英語 1 前期',assignName:'提出課題' },
                { ...base,group:'quiz_list',quizId:2,courseName:'英語 2 前期',quizName:'小テスト',count:0,maxcount:0 },
                { ...base,group:'quiz_list',quizId:3,courseName:'数学 3 後期',quizName:'旧データ',count:null,maxcount:null }
            ];
            for (const task of tasks) {
                const card = task.group === 'assign_list' ? new AssignBox(task) : new QuizBox(task);
                document.querySelector('#display').append(await card.getElement());
            }
        });
        const cards = page.locator('#display > div');
        assert.deepEqual(await page.locator('.title').allTextContents(),['英語 1 前期','英語 2 前期','数学 3 後期']);
        assert.equal(await cards.nth(0).locator('.li4').textContent(),'提出ファイル数: ?');
        assert.equal(await cards.nth(1).locator('.li4').textContent(),'受験回数: 0 / ∞');
        assert.equal(await cards.nth(2).locator('.li4').textContent(),'受験回数: ? / ?');
        for (const index of [0,1]) {
            const card = cards.nth(index), toggle = card.locator('.coursemenubtn'), menu = card.locator('.dropdown-menu');
            await toggle.click(); assert(await menu.isVisible(),'All view must open the card menu');
            await menu.locator('.showbutton').click();
            await page.waitForFunction(index => changes.length >= 2 * index + 1,index);
            assert.equal(await card.count(),1,'An item stays visible when all items are shown');
            assert.equal(await menu.locator('.showbutton').textContent(),'一覧に戻す');
            await menu.locator('.showbutton').click();
            await page.waitForFunction(index => changes.length >= 2 * index + 2,index);
            assert.equal(await menu.locator('.showbutton').textContent(),'一覧から削除する');
        }
        assert.deepEqual(await page.evaluate(() => changes.map(x => [x[0],x[1],x[2],x[3],x[4]])),[
            ['assign_list','assignId',1,'show',false],['assign_list','assignId',1,'show',true],
            ['quiz_list','quizId',2,'show',false],['quiz_list','quizId',2,'show',true]
        ]);
        await page.evaluate(() => settings.selectedShow = 'normal');
        await cards.nth(0).locator('.showbutton').click();
        await page.waitForFunction(() => !document.querySelector('#display > .assign'));
        await page.evaluate(async () => {
            settings.selectedShow = 'deleted';
            document.querySelector('#display').append(await new AssignBox({group:'assign_list',assignId:4,courseName:'Course',assignName:'Hidden',status:'incomplete',show:false,filenum:0}).getElement());
        });
        const hidden = page.locator('#display > .assign');
        assert.equal(await hidden.locator('.li4').textContent(),'提出ファイル数: 0');
        await hidden.locator('.coursemenubtn').click();
        await hidden.locator('.showbutton').click();
        await page.waitForFunction(() => !document.querySelector('#display > .assign'));
        await page.evaluate(async () => {
            Object.assign(settings,{selectedShow:'all',selectedStatus:'unknown'});
            const target = document.createElement('div'); target.id='filtered'; document.body.append(target);
            await displaybox([
                {group:'assign_list',assignId:5,courseName:'Course',assignName:'不明課題',status:'unknown',show:true},
                {group:'quiz_list',quizId:6,courseName:'Course',quizName:'不明テスト',status:'unknown',show:true},
                {group:'quiz_list',quizId:7,courseName:'Course',quizName:'完了テスト',status:'complete',show:true}
            ],target);
        });
        assert.equal(await page.locator('#filtered > .assign.unknown').count(),1);
        assert.equal(await page.locator('#filtered > .quiz.unknown').count(),1);
        assert.equal(await page.locator('#filtered > div').count(),2);
        console.log('PASS task cards: full course names; missing and zero values; all/normal/hidden menu actions; unknown filter for both task types');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
