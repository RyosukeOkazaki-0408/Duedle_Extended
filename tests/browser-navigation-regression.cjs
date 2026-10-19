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
 let pauseCourseList = false, pausedCourseRoute = null;
 const visited = [], errors = [];
 try {
  await context.route('**/*', route => {
   const url = new URL(route.request().url());
   if (url.pathname.endsWith('/lib/ajax/service.php')) {
    const [request] = route.request().postDataJSON();
    if (request.methodname === 'core_courseformat_get_state') {
     const id = request.args.courseid;
     visited.push(id);
     return route.fulfill({headers:{Date:new Date().toUTCString()},json:[{data:JSON.stringify({course:{id:String(id)},
      section:id === 1 ? [{id:'100',visible:true,cmlist:['101']}] : [],
      cm:id === 1 ? [{id:'101',sectionid:'100',visible:true,uservisible:true,url:root+'mod/assign/view.php?id=101'}] : []})}]});
    }
    if (request.methodname === 'core_course_get_updates_since') {
     assert(Number.isSafeInteger(request.args.since));
     return route.fulfill({json:[{data:{instances:[],warnings:[]}}]});
    }
    assert.equal(request.methodname,'core_course_get_enrolled_courses_by_timeline_classification');
    if (pauseCourseList) { pausedCourseRoute = route; return; }
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
  assert.deepEqual([...visited].sort((a,b)=>a-b), enrollments.map(c=>c.id));
  assert.equal(new Set(visited).size,14);
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').hasAttribute('data-duedle-timing'));
  const timing = JSON.parse(await page.locator('#collectionstatus').getAttribute('data-duedle-timing'));
  assert.equal(timing.outcome,'success');
  assert.equal(timing.collection.version,'courses-1-v1');
  assert.equal(timing.collection.concurrency,1);
  assert.equal(timing.collection.requests.length,15);
  assert.equal(timing.collection.courses.length,14);
  assert(timing.collection.peakRequests <= 1);
  assert(timing.totalMs >= timing.phases.collectionMs);
  assert(timing.phases.courseListMs >= 0 && timing.phases.renderMs >= 0);
  assert(!JSON.stringify(timing).includes('sesskey'));
  assert((await page.locator('#collectionstatus').innerText()).includes('14コース'));
  // The next normal update still checks every course's availability but reuses
  // unchanged task details. Exercise the real background checkpoint mutation.
  const cacheBeforeDelta = await worker.evaluate(()=>chrome.storage.local.get('assign_list'));
  assert((await worker.evaluate(()=>chrome.storage.local.get('courseAvailability'))).courseAvailability[1].detailsCheckedSince > 0);
  await worker.evaluate(()=>chrome.storage.local.set({scrapeCooldown:null}));
  await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').textContent.includes('クールダウン'));
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').hasAttribute('data-duedle-timing'));
  const delta = JSON.parse(await page.locator('#collectionstatus').getAttribute('data-duedle-timing'));
  assert.equal(delta.outcome,'success');
  assert.equal(delta.collection.skippedTasks,1);
  assert.equal(delta.collection.requests.length,28);
  assert(delta.collection.requests.every(request=>!request.path.includes('/mod/assign/view.php')));
  assert.deepEqual(await worker.evaluate(()=>chrome.storage.local.get('assign_list')),cacheBeforeDelta);
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
  // Reload during a real blocked refresh must show one interruption notice.
  const historyBeforeReload = (await worker.evaluate(()=>chrome.storage.local.get('refreshHistory'))).refreshHistory.fullSweepAt;
  await worker.evaluate(async()=>{
   await chrome.storage.sync.set({scrapeMode:'scrape'});
   await chrome.storage.local.set({scrapeCooldown:null});
  });
  await page.reload();await page.waitForFunction(()=>document.querySelector('#scrapebutton')&&!document.querySelector('#scrapebutton').disabled);
  pauseCourseList = true;
  await page.locator('#scrapebutton').click();
  for(let i=0;i<100&&!pausedCourseRoute;i++) await page.waitForTimeout(20);
  assert(pausedCourseRoute, 'The collection request must be in flight');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus')?.textContent.includes('更新が中断されました'));
  assert(!(await worker.evaluate(()=>chrome.storage.local.get('refreshCoordinator'))).refreshCoordinator.lease);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('refreshHistory'))).refreshHistory.fullSweepAt,historyBeforeReload);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('scrapeCooldown'))).scrapeCooldown,null);
  pauseCourseList = false;
  try { await pausedCourseRoute.abort(); } catch {}
  await page.reload();await page.waitForFunction(()=>Boolean(document.querySelector('#listupdated')?.textContent));
  assert.equal(await page.locator('#collectionstatus').textContent(),'');
  // Unknown deadlines lead both task types and survive every deadline filter.
  await worker.evaluate(async()=>{
   const task=(id,due)=>({group:'assign_list',assignId:id,courseId:4,courseName:'Course',assignName:'Deadline '+id,status:'incomplete',show:true,due});
   await chrome.storage.sync.set({selectedStatus:'all',selectedDue:'all',selectedShow:'normal'});
   await chrome.storage.local.set({
    assign_list:[task(302,'2099-01-01T00:00:00Z'),task(301,null),task(304,'2000-01-01T00:00:00Z')],
    quiz_list:[{group:'quiz_list',quizId:303,courseId:4,courseName:'Course',quizName:'Unknown quiz deadline',status:'incomplete',show:true,due:null}],
    courseAvailability:{4:{complete:true,inventoryComplete:true,items:{'assign:301':true,'assign:302':true,'assign:304':true,'quiz:303':true}}}
   });
  });
  const waitForCards=ids=>page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('#display .taskbox a')].map(a=>Number(new URL(a.href).searchParams.get('id'))))===JSON.stringify(ids),ids);
  await waitForCards([301,303,304,302]);
  for(const [selectedDue,expected] of Object.entries({today:[301,303],week:[301,303],overdue:[301,303,304],dueweek:[301,303],progressing:[301,303,302]})){
   await worker.evaluate(()=>chrome.storage.sync.set({selectedDue:'all'}));
   await waitForCards([301,303,304,302]);
   await worker.evaluate(selectedDue=>chrome.storage.sync.set({selectedDue}),selectedDue);
   await waitForCards(expected);
  }
  // Resume an old user's page after another account becomes active.
  user = 22; const other = await context.newPage(); await other.goto(root+'my/'); await other.waitForSelector('#scrapebutton');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('duedleAccount'))).duedleAccount,'22');
  assert.equal(await page.locator('#display > .assign').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS normal refresh establishes account-scoped server checkpoint; next refresh reuses unchanged details and checks all availability; persisted-page registration; edit forms preserve cache; enrollment and account-switch safety');
 } finally { await context.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
