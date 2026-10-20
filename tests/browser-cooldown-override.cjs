// Real extension with synthetic Moodle only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root='https://cms7.ict.nitech.ac.jp/moodle40a/';
(async()=>{
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-cooldown-')),{
  headless:true,ignoreDefaultArgs:['--disable-extensions'],executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--enable-unsafe-extension-debugging'],viewport:{width:390,height:844},hasTouch:true,isMobile:true
 });
 let requests=0;
 const errors=[];
 try {
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.includes('info=core_course_get_enrolled_courses_by_timeline_classification')){
    requests++;return route.fulfill({json:[{data:{courses:[{id:1}],nextoffset:1}}]});
   }
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>var M={};M.cfg={"sesskey":"test123key"};</script><div id="nav-notification-popover-container" data-userid="11"></div><nav id="usernavigation"></nav><header><h1>Fixture</h1></header><main id="region-main"></main></body></html>`});
  });
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'my/');await page.waitForFunction(()=>Boolean(document.querySelector('#listupdated')?.textContent));
  const worker=context.serviceWorkers().find(w=>w.url().includes(id));assert(worker);
  const read=()=>worker.evaluate(()=>chrome.storage.local.get(['manualCooldownDisabled','scrapeCooldown','refreshHistory','refreshCoordinator']));
  await worker.evaluate(()=>chrome.storage.local.set({scrapeCooldown:new Date().toISOString()}));
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  const point=async(target=page)=>{const b=await target.locator('#scrapebutton').boundingBox();return{x:b.x+16,y:b.y+b.height/2};};
  const hold=async(target=page)=>{const p=await point(target);await target.mouse.move(p.x,p.y);await target.mouse.down();await target.waitForTimeout(5100);await target.mouse.up();};
  // A short tap while cooling is inert, even though the parent receives pointers.
  const p=await point();await page.mouse.click(p.x,p.y);assert.equal((await read()).manualCooldownDisabled,undefined);assert.equal(requests,0);
  // The previous 1.5-second gesture must no longer toggle the setting.
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(1800);await page.mouse.up();
  assert.equal((await read()).manualCooldownDisabled,undefined);assert.equal(requests,0);
  // Moving like a scroll cancels the hold.
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y);await page.waitForTimeout(5100);await page.mouse.up();
  assert.equal((await read()).manualCooldownDisabled,undefined);
  // Long holding the disabled button enables repeatable updates without triggering one.
  await hold();await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  assert.equal((await read()).manualCooldownDisabled,true);assert.equal(requests,0);
  assert.equal(await page.locator('#scrapebutton').innerText(),'課題を更新');
  assert(!(await page.locator('body').innerText()).includes('クールダウン無効'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Reload and another tab share the local setting.
  await page.reload();await page.waitForFunction(()=>document.querySelector('#scrapebutton')&&!document.querySelector('#scrapebutton').disabled);
  const second=await context.newPage();await second.goto(root+'my/');await second.waitForSelector('#scrapebutton');
  await second.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  await page.bringToFront();
  for(let run=0;run<2;run++){
   const before=(await read()).refreshHistory?.attempt?.at||0;
   await page.locator('#scrapebutton').click();
   await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('1コース・0件の課題情報を更新しました。'));
   for(let i=0;i<100;i++){const state=await read();if(!state.refreshCoordinator?.lease&&state.refreshHistory?.attempt?.at>before)break;await page.waitForTimeout(20);}
   assert((await read()).refreshHistory.attempt.at>before);
   await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  }
  assert.equal(requests,2);
  const updated=await page.locator('#listupdated').textContent();
  await page.reload();
  await page.waitForFunction(()=>Boolean(document.querySelector('#listupdated')?.textContent));
  assert.equal(await page.locator('#collectionstatus').textContent(),'');
  assert.equal(await page.locator('#listupdated').textContent(),updated);
  // Leaving bypass clears only the previous cooldown.
  await hold();await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  assert.equal((await read()).manualCooldownDisabled,false);
  assert.equal((await read()).scrapeCooldown,null);
  await second.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#scrapebutton')&&!document.querySelector('#scrapebutton').disabled);
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').disabled && document.querySelector('#collectionstatus').textContent.includes('1コース・0件'));
  assert.equal(requests,3);
  assert((await read()).scrapeCooldown);

  await second.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#scrapebutton')?.disabled);
  // Exercise an actual touch hold on the disabled button (including Safari-like hit fallthrough).
  const touch=await context.newCDPSession(page);const t=await point();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x,y:t.y}]});
  await page.waitForTimeout(5100);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  assert.equal((await read()).manualCooldownDisabled,true);assert.equal(requests,3);
  // Cancelled touch is not a mode switch.
  const c=await point();await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:c.x,y:c.y}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.waitForTimeout(5100);assert.equal((await read()).manualCooldownDisabled,true);
  // The override never bypasses a running manual refresh in another tab.
  const claim=await worker.evaluate(async()=>{
   const [tab]=await chrome.tabs.query({url:'https://cms7.ict.nitech.ac.jp/moodle40a/my/'});
   return refreshCoordinator.claim({mode:'manual'},{tab,url:tab.url});
  });assert(claim.granted);
  await page.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  await second.waitForFunction(()=>document.querySelector('#scrapebutton').disabled);
  const busy=await worker.evaluate(async()=>{
   const tabs=await chrome.tabs.query({url:'https://cms7.ict.nitech.ac.jp/moodle40a/my/'});
   return refreshCoordinator.claim({mode:'manual'},{tab:tabs.at(-1),url:tabs.at(-1).url});
  });assert.equal(busy.reason,'busy');
  assert.deepEqual(errors,[]);
  console.log('PASS refresh controls, persistence, and concurrent-run exclusion');
 }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
