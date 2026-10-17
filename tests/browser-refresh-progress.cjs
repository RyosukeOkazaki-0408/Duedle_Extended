// Real extension, isolated synthetic Moodle pages; no Moodle traffic.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root='https://cms7.ict.nitech.ac.jp/moodle40a/';
const fixture='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>var M={}; M.cfg={"sesskey":"abc123test"};</script><div id="nav-notification-popover-container" data-userid="1"></div><nav id="usernavigation"></nav><main id="region-main"><h1>Fixture</h1></main></body></html>';
(async()=>{
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-progress-')),{
  headless:true,ignoreDefaultArgs:['--disable-extensions'],executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-extension-debugging']});
 let release;
 try {
  await context.route('**/*',async route=>{
   if (route.request().url().includes('info=core_course_get_enrolled_courses_by_timeline_classification')) {
                return route.fulfill({ json: [{ data: { courses: [1].map(id => ({ id })), nextoffset: [1].length } }] });
            }
            if(route.request().resourceType()==='document') return route.fulfill({contentType:'text/html',body:fixture});
   if(route.request().url().includes('course/view.php')) { await new Promise(resolve=>release=resolve); return route.fulfill({contentType:'text/html',body:fixture}).catch(()=>{}); }
   return route.abort();
  });
  const cdp=await context.browser().newBrowserCDPSession();
  const loaded=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  const owner=await context.newPage(); await owner.goto(root+'my/'); await owner.waitForSelector('#scrapebutton');
  const worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id)); assert(worker);
  await worker.evaluate(()=>chrome.storage.local.set({courseIds:[1]}));
  await owner.locator('#scrapebutton').click();
  await owner.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('0/1コース'));
  const viewer=await context.newPage(); await viewer.goto(root+'my/');
  await viewer.waitForFunction(()=>document.querySelector('#collectionstatus')?.textContent.includes('0/1コース'));
  assert(await viewer.locator('#scrapebutton').isDisabled());
  await viewer.reload(); await viewer.waitForFunction(()=>document.querySelector('#collectionstatus')?.textContent.includes('0/1コース'));
  await owner.reload();
  await viewer.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('中断'));
  await viewer.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
  await owner.waitForFunction(()=>document.querySelector('#scrapebutton') && !document.querySelector('#scrapebutton').disabled);
  assert.equal(await owner.locator('#collectionstatus').textContent(),'','Reloading the owner does not replay its saved cancellation');
  release?.(); release=null;
  assert(!(await worker.evaluate(async()=> (await chrome.storage.local.get('scrapeCooldown')).scrapeCooldown)));
  for (const progress of [null,{phase:'courses',completed:3,total:14,saved:8,at:Date.now()-90001}]) {
   await worker.evaluate(async progress=>{
    const stored=await chrome.storage.local.get('refreshCoordinator');
    await chrome.storage.local.set({refreshCoordinator:{...stored.refreshCoordinator,lease:{token:'stalled',tabId:999,mode:'manual',pageId:'old',startedAt:Date.now()-30001,progress,expiresAt:Date.now()+90000}}});
   },progress);
   await viewer.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('応答が途絶え'));
   await viewer.waitForFunction(()=>!document.querySelector('#scrapebutton').disabled);
   assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('refreshCoordinator')).refreshCoordinator.lease),null);
  }
  await worker.evaluate(async()=>{
   const stored=await chrome.storage.local.get('refreshCoordinator');
   await chrome.storage.local.set({refreshCoordinator:{...stored.refreshCoordinator,lease:{token:'observed-success',tabId:999,mode:'manual',pageId:'viewer-test',startedAt:Date.now(),progress:{phase:'courses',completed:1,total:1,saved:2,at:Date.now()},expiresAt:Date.now()+90000}}});
  });
  await viewer.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('1/1コース'));
  await worker.evaluate(async()=>{
   const stored=await chrome.storage.local.get(['refreshCoordinator','refreshHistory']);
   await chrome.storage.local.set({refreshCoordinator:{...stored.refreshCoordinator,lease:null},refreshHistory:{...stored.refreshHistory,fullSweepAt:Date.now(),attempt:{at:Date.now(),mode:'manual',outcome:'success',summary:{courses:1,saved:2,failed:0,message:''}}}});
  });
  await viewer.waitForFunction(()=>document.querySelector('#collectionstatus').textContent==='1コース・2件の課題情報を更新しました。');
  await viewer.reload();
  await viewer.waitForFunction(()=>document.querySelector('#listupdated')?.textContent.includes('最終更新：') && !document.querySelector('#scrapebutton').disabled);
  assert.equal(await viewer.locator('#collectionstatus').textContent(),'','Reloading never replays a saved success notice');
  console.log('PASS browser progress: counters survive viewer reload; owner reload cancels without cooldown; preparation and stalled counts expire and allow retry; observed success is transient and reload never replays outcomes');
 } finally {release?.();await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
