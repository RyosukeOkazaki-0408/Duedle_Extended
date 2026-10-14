// Real extension with synthetic Moodle responses only. A persisted pageshow
// simulates BFCache restoration, which automation can otherwise disable.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
(async () => {
 const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'duedle-navigation-')), {
  headless:true, ignoreDefaultArgs:['--disable-extensions'], executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--enable-unsafe-extension-debugging']
 });
 let user = 11, failCourses = false, enrollments = Array.from({length:14}, (_,i)=>({id:i+1}));
 const visited = [], errors = [];
 try {
  await context.route('**/*', route => {
   const url = new URL(route.request().url());
   if (url.pathname.endsWith('/lib/ajax/service.php')) {
    const [request] = route.request().postDataJSON();
    assert.equal(request.methodname,'core_course_get_enrolled_courses_by_timeline_classification');
    assert.deepEqual(request.args,{classification:'all',limit:0,offset:0});
    return route.fulfill({json:failCourses ? [{error:true,exception:{errorcode:'invalidsesskey'}}] : [{data:{courses:enrollments,nextoffset:enrollments.length}}]});
   }
   let content = '';
   if (url.pathname.endsWith('/course/view.php')) {
    visited.push(Number(url.searchParams.get('id')));
   }
   if (url.pathname.endsWith('/mod/assign/view.php')) {
    content = '<h2>データサイエンス課題</h2>' + (url.searchParams.has('action')
     ? '<form><input name="action" value="editsubmission"><div class="filemanager">提出物をアップロード・入力する</div></form>'
     : '<div class="submissionstatustable"><table><tr><td>提出ステータス</td><td>まだ提出されていません。</td></tr></table></div>');
   }
   if (url.pathname.endsWith('/my/')) content = `<div class="event"><a href="${root}mod/assign/view.php?id=101">データサイエンス課題</a></div><li class="course-listitem" data-course-id="999"></li>`;
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><script>var M={};M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="${user}"></div><nav id="usernavigation"></nav><header><h1>データサイエンス</h1></header><main id="region-main">${content}</main></body></html>`});
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'my/'); await page.waitForSelector('#scrapebutton');
  const worker = context.serviceWorkers().find(w=>w.url().includes(loaded.id));
  await worker.evaluate(()=>chrome.storage.local.set({assign_list:[{group:'assign_list',assignId:101,courseName:'データサイエンス',assignName:'データサイエンス課題',status:'warning',due:new Date(Date.now()+86400000).toISOString(),file:'?',filenum:0,fetchedAt:123,show:true}],courseIds:Array.from({length:16},(_,i)=>i+1)}));
  await page.waitForSelector('.event.warning');
  // Poison only this tab's registration to reproduce the stale BFCache page.
  const original = await worker.evaluate(async()=>{
   const data = await chrome.storage.local.get('duedleAccountTabs');
   const [id, registration] = Object.entries(data.duedleAccountTabs)[0];
   await chrome.storage.local.set({duedleAccountTabs:{...data.duedleAccountTabs,[id]:{...registration,pageId:'intervening-page'}}});
   return {id,registration};
  });
  await page.evaluate(()=>{
   document.querySelector('.event').className='event unvisited';
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await page.waitForSelector('.event.warning');
  assert.equal(await worker.evaluate(async id=>(await chrome.storage.local.get('duedleAccountTabs')).duedleAccountTabs[id].pageId, original.id), original.registration.pageId);
  // Opening the edit form must not overwrite status, files or freshness.
  const before = await worker.evaluate(()=>chrome.storage.local.get('assign_list'));
  await page.goto(root+'mod/assign/view.php?id=101&action=editsubmission');
  await page.waitForSelector('.filemanager');
  await page.goto(root+'my/'); await page.waitForSelector('.event.warning');
  assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get('assign_list')),before);
  // A normal details page still repairs an existing unknown status.
  await worker.evaluate(async()=>{
   const {assign_list} = await chrome.storage.local.get('assign_list');
   assign_list[0].status='unknown'; await chrome.storage.local.set({assign_list});
  });
  await page.goto(root+'mod/assign/view.php?id=101');
  await page.waitForFunction(()=>document.querySelector('.submissionstatustable'));
  await page.goto(root+'my/'); await page.waitForSelector('.event.incomplete');
  // API failure must preserve the old snapshot and avoid a successful cooldown.
  failCourses = true;
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('登録コースを確認できませんでした'));
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('courseIds'))).courseIds.length,16);
  assert.equal(visited.length,0);
  failCourses = false;
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').textContent.includes('クールダウン'));
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('courseIds'))).courseIds, enrollments.map(c=>c.id));
  assert.deepEqual(visited, enrollments.map(c=>c.id));
  assert((await page.locator('#collectionstatus').innerText()).includes('14コース'));
  // Visiting another course after synchronization cannot inflate the next sweep.
  await page.goto(root+'course/view.php?id=999'); await page.waitForSelector('#scrapebutton');
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('courseIds'))).courseIds.length,14);
  // The separate-tab mode must use the same new snapshot and remove old IDs.
  enrollments = [{id:4},{id:5}]; visited.length = 0;
  await page.goto(root+'my/'); await page.waitForSelector('#scrapebutton');
  await worker.evaluate(async()=>{
   await chrome.storage.sync.set({scrapeMode:'tab'});
   await chrome.storage.local.set({scrapeCooldown:null});
  });
  await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').textContent.includes('クールダウン'));
  assert.deepEqual(visited,[4,5]);
  assert.deepEqual((await worker.evaluate(()=>chrome.storage.local.get('courseIds'))).courseIds,[4,5]);
  // Resume an old user's page after another account becomes active.
  user = 22; const other = await context.newPage(); await other.goto(root+'my/'); await other.waitForSelector('#scrapebutton');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('duedleAccount'))).duedleAccount,'22');
  assert.equal(await page.locator('#display > .assign').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS persisted-page re-registration and recoloring; edit form preserves cached status; canonical detail repairs unknown; failed enrollment read preserves cache; stale 16 IDs replaced with 14; unregistered visits ignored; account-switch resume denied');
 } finally { await context.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
