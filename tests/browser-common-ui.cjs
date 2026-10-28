// Synthetic Moodle pages only; do not contact the university.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.pathname.includes('/submission_files/')) {
                return route.fulfill({ status:200, contentType:'text/plain', body:'Test submission' });
            }
            const dashboard = url.pathname.endsWith('/my/');
            return route.fulfill({ contentType:'text/html; charset=utf-8', body:`<!doctype html><html><body id="${dashboard ? 'page-my-index' : 'page-mod-assign-view'}">
                <header><span class="usertext">架空 利用者</span></header>
                <nav><ol class="breadcrumb"><li class="breadcrumb-item" id="my-courses"><a href="/moodle40a/my/courses.php">マイコース</a></li><li class="breadcrumb-item" id="course-index"><a href="/moodle40a/course/index.php">コース</a></li><li class="breadcrumb-item" id="category"><a href="/moodle40a/course/index.php?categoryid=2">コースカテゴリ</a></li><li class="breadcrumb-item" id="real-course"><a href="/moodle40a/course/view.php?id=3">情報リテラシーコース</a></li><li class="breadcrumb-item" id="activity"><a href="/moodle40a/mod/assign/view.php?id=4">コースの提出課題</a></li></ol></nav>
                <main id="region-main"><h2 class="mb-3 mt-3" id="teacher-heading">講義の注意事項</h2>${dashboard ? '<h2 class="mb-3 mt-3" id="greeting">こんにちは、架空 利用者さん</h2>' : ''}<ul class="list-unstyled pt-3" id="teacher-list"><li><a href="#teaching">講義資料</a></li></ul><div class="logininfo" id="teacher-logininfo">講義内容</div><div class="pb-3" id="teacher-icon"><i class="fa-envelope-o"></i></div>
                <a id="preview" target="_blank" href="/moodle40a/pluginfile.php/1/assignsubmission_file/submission_files/2/test.txt?forcedownload=1">提出ファイル</a></main>
                <footer><ul class="list-unstyled pt-3" id="footer-list"><li>言語選択</li></ul><div class="logininfo" id="footer-logininfo">ユーザー情報</div><div class="pb-3" id="footer-icon"><i class="fa-envelope-o"></i></div></footer></body></html>` });
        });
        for (const route of ['mod/assign/view.php?id=4', 'my/']) {
            await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/' + route);
            for (const file of ['title.js','hide_username.js','delete_underLink.js']) await page.addScriptTag({path:'src/common/' + file});
            assert.equal(await page.locator('#my-courses,#course-index').count(),0,'Only global course-list breadcrumbs are removed');
            assert.equal(await page.locator('#category,#real-course,#activity').count(),3,'Named courses, activities and course categories remain');
            assert.equal(await page.locator('#teacher-heading').innerText(),'講義の注意事項');
            assert.equal(await page.locator('#teacher-list,#teacher-logininfo').count(),2,'Authored content is not treated as footer');
            assert.equal(await page.locator('#teacher-icon').evaluate(el=>el.style.height),'');
            assert.equal(await page.locator('#footer-list,#footer-logininfo').count(),0,'Footer controls still follow existing behavior');
            assert.equal(await page.locator('#footer-icon').evaluate(el=>el.style.height),'22.06px');
            assert.equal(await page.locator('.usertext').innerText(),'');
            if (route === 'my/') assert.equal(await page.locator('#greeting').innerText(),'おかえりなさい！👋');
        }
        await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=4');
        await page.addScriptTag({path:'src/qol/assign_files.js'});
        const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#preview').click()]);
        await popup.waitForURL(url => url.protocol === 'blob:', {timeout:5000});
        assert.equal(await popup.locator('body').innerText(),'Test submission');
        assert(page.url().includes('/mod/assign/view.php'),'Original assignment stays open');
        await popup.close();
        await page.close();
        console.log('PASS course breadcrumbs, dashboard greeting, authored content, scoped footer and separate-tab submitted-file preview');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
