// Real extension, mocked Moodle event API. Identical titles must not decide state.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root='https://cms7.ict.nitech.ac.jp/moodle40a/';
const eventIds=[101,102,201,202,203,300,400,500,600,700];
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<script>var M={};M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="1"></div>
<nav id="usernavigation"></nav><header><h1>コース</h1></header><main id="region-main">
${eventIds.map(id=>`<div class="event" id="event-${id}"><a data-type="event" data-action="view-event" data-event-id="${id}" href="${root}calendar/view.php?view=day&time=1792076400">${id<200?'「レポート提出」の提出期限':id===300?'学内行事':'本日の授業の要点 の受験可能期間の'+(id===201?'開始':'終了')}</a><div class="date">2026年10月16日, 17:00</div></div>`).join('')}</main></body></html>`;
(async()=>{
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-event-')),{
  headless:true,ignoreDefaultArgs:['--disable-extensions'],executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-extension-debugging']});
 try {
  const requested=[];
  await context.route('https://cms7.ict.nitech.ac.jp/**',async route=>{
   if(route.request().url().includes('lib/ajax/service.php')) {
    const requests=route.request().postDataJSON();
    const responses=requests.map(({methodname,args})=>{
     assert.equal(methodname,'core_calendar_get_calendar_event_by_id');
     const id=args.eventid;requested.push(id);
     if(id===500) return {error:true,exception:{errorcode:'nopermissiontoviewcalendar'}};
     const type=id<200?'assign':'quiz';
     const instance=id===101||id===201||id===202?1:id===400?999:2;
     return {error:false,data:{event:{id:id===600?999:id,modulename:id===300?'':type,instance,
      url:id===700?'https://example.invalid/mod/quiz/view.php?id=2':id===300?'':`${root}mod/${type}/view.php?id=${instance}`}}};
    });
    await route.fulfill({contentType:'application/json',body:JSON.stringify(responses)});return;
   }
   await route.fulfill({contentType:'text/html',body:fixture});
  });
  const cdp=await context.browser().newBrowserCDPSession();
  const loaded=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'my/');await page.waitForSelector('#statusSelect');
  const worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id));assert(worker);
  await worker.evaluate(async()=>{
   const due=new Date(Date.now()+86400000).toISOString();
   await chrome.storage.local.set({
    assign_list:[{group:'assign_list',assignId:1,courseId:1,assignName:'レポート提出',courseName:'コース',status:'complete',due,show:true},
      {group:'assign_list',assignId:2,courseId:2,assignName:'レポート提出',courseName:'別コース',status:'incomplete',due,show:true}],
    quiz_list:[{group:'quiz_list',quizId:1,courseId:1,quizName:'本日の授業の要点',courseName:'コース',status:'incomplete',due,show:true},
      {group:'quiz_list',quizId:2,courseId:2,quizName:'本日の授業の要点',courseName:'別コース',status:'complete',due,show:true}]
   });
  });
  const expected={101:'complete',102:'warning',201:'warning',202:'warning',203:'complete',400:'unvisited',500:'unknown',600:'unknown',700:'unknown'};
  const check=()=>page.waitForFunction(expected=>Object.entries(expected).every(([id,status])=>document.getElementById('event-'+id).classList.contains(status)),expected);
  await check();
  assert.equal(await page.locator('#event-300.duedle-task-status').count(),0,'General events never become unvisited tasks');
  assert.equal(new Set(requested).size,eventIds.length);
  const count=requested.length;
  await page.selectOption('#statusSelect','complete');await page.waitForTimeout(1000);await check();
  assert.equal(requested.length,count,'Filter changes reuse resolved identities and back off failures');
  await page.goto(root+'course/view.php?id=1');await check();
  assert(await page.locator('#event-203.complete').count(),'Other-course events resolve independently of the course task list');
  await worker.evaluate(async()=>{const {assign_list}=await chrome.storage.local.get('assign_list');assign_list[0].status='incomplete';await chrome.storage.local.set({assign_list});});
  await page.waitForSelector('#event-101.warning');
  assert.equal(await page.locator('#event-101.complete').count(),0,'Updates replace stale colors');
  // Existing account-change handling must remove all prior-account event colors.
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('duedle:account-changed')));
  await page.waitForFunction(()=>document.querySelectorAll('.event.duedle-task-status').length===0);
  assert.deepEqual(errors,[]);
  console.log('PASS event IDs: duplicate assignment/quiz names, start/end pair, other-course events, genuine missing detail, general events, permission/malformed/external responses, caching, state updates, account-change cleanup.');
 } finally {await context.close();}
})().catch(e=>{console.error(e);process.exit(1)});
