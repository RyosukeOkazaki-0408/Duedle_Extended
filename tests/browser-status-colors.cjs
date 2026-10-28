// Real extension with synthetic Moodle; verifies shared colors without merging states.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const states = ['complete', 'qualify', 'stuck', 'expired'];
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<script>var M={};M.cfg={"sesskey":"abc123test"};</script>
<div id="nav-notification-popover-container" data-userid="1"></div><nav id="usernavigation"></nav>
<header><h1>テストコース</h1></header><main id="region-main"><div class="course-content">
${states.map((s,i)=>`<div class="activity-item" id="activity-${s}"><div class="activityname"><a href="${root}mod/quiz/view.php?id=${i+1}">${s}</a></div></div>`).join('')}
</div>${states.map((s,i)=>`<div class="event" id="event-${s}"><a href="${root}mod/quiz/view.php?id=${i+1}">${s}</a></div>`).join('')}</main></body></html>`;
(async () => {
 const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-colors-')), {
  headless: true, ignoreDefaultArgs: ['--disable-extensions'],
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-extension-debugging']
 });
 try {
  await context.route('https://cms7.ict.nitech.ac.jp/**', route=>route.fulfill({contentType:'text/html',body:fixture}));
  const cdp = await context.browser().newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'my/'); await page.waitForSelector('#colorSelect_complete');
  await page.waitForFunction(()=>document.querySelector('#statusSelect')?.value==='ex-complete');
  const worker = context.serviceWorkers().find(w=>w.url().includes(loaded.id)); assert(worker);
  await worker.evaluate(async states=>{
   await chrome.storage.local.set({thememode:2,quiz_list:states.map((status,i)=>({group:'quiz_list',quizId:i+1,courseId:1,courseName:'テストコース',quizName:status,status,show:true,due:new Date(Date.now()-86400000).toISOString(),point:status==='complete'?10:8,maxp:10,required:6,count:1,maxcount:1}))});
   await chrome.storage.sync.set({selectedType:'all',selectedStatus:'all',selectedShow:'normal',selectedDue:'all',
    colorSelect_light_complete:'#117733',colorSelect_light_qualify:'#abcdef',
    colorSelect_light_expired:'#bb2233',colorSelect_light_stuck:'#fedcba',
    colorSelect_dark_complete:'#225544',colorSelect_dark_qualify:'#aabbcc',
    colorSelect_dark_expired:'#663344',colorSelect_dark_stuck:'#ddeeff'});
  }, states);
  const checkPalette = async (complete,expired,course) => {
   await page.waitForFunction(({complete,expired,course})=>{
    return ['complete','qualify','stuck','expired'].every(state=>{
     const expected=['complete','qualify'].includes(state)?complete:expired;
     const selectors=[`#display > .${state}`,`#event-${state}`,...(course?[`#activity-${state}`]:[])];
     return selectors.every(selector=>document.querySelector(selector)?.style.getPropertyValue('--duedle-status-color')===expected);
    });
   },{complete,expired,course});
  };
  for(const course of [false,true]) {
   await page.goto(root+(course?'course/view.php?id=1':'my/'));
   await page.waitForSelector('#display > .qualify');
   assert.equal(await page.locator('#fieldcolor input[type=color]').count(),6);
   assert.deepEqual(await page.locator('#fieldcolor label').allTextContents(),['完了','未提出','行き詰まり・期限切れ','期限近い','不明','未参照']);
   assert.equal(await page.locator('#colorSelect_qualify,#colorSelect_stuck').count(),0);
   await checkPalette('#117733','#bb2233',course);
   for(const [id,color] of [['complete','#336699'],['expired','#996633']]) {
    await page.locator('#colorSelect_'+id).evaluate((el,color)=>{el.value=color;el.dispatchEvent(new Event('change',{bubbles:true}));},color);
   }
   await checkPalette('#336699','#996633',course);
   await page.reload(); await checkPalette('#336699','#996633',course);
   await worker.evaluate(async()=>chrome.storage.local.set({thememode:1}));
   await checkPalette('#225544','#663344',course);
   await worker.evaluate(async()=>chrome.storage.local.set({thememode:2}));
   await checkPalette('#336699','#996633',course);
   assert.deepEqual(await page.locator('#statusSelect option').allTextContents(),['すべて','完了','完了以外','未提出','行き詰まり・期限切れ','不明']);
   // One filter change must commit once, never clear/repopulate the visible list.
   await page.waitForTimeout(1100);
   await page.evaluate(()=>{
    window.listCommits=[];
    window.listObserver=new MutationObserver(records=>window.listCommits.push({mutations:records.length,count:document.querySelector('#display').children.length}));
    window.listObserver.observe(document.querySelector('#display'),{childList:true});
   });
   for(const [value,expected] of [['complete',['complete','qualify']],['ex-complete',['stuck','expired']],['expired',['stuck','expired']]]) {
    await page.selectOption('#statusSelect',value);
    await page.waitForFunction(expected=>{
     const cards=[...document.querySelectorAll('#display > .quiz')];
     return cards.length===expected.length&&expected.every(state=>cards.some(card=>card.classList.contains(state)));
    },expected);
    if(value==='complete') {
     await page.waitForTimeout(1100);
     assert.deepEqual(await page.evaluate(()=>window.listCommits),[{mutations:1,count:2}], 'Filter change atomically replaces the list once, with no delayed duplicate');
     await page.evaluate(()=>window.listObserver.disconnect());
    }
   }
   for(const [legacy,value,expected] of [['qualify','complete',['complete','qualify']],['stuck','expired',['stuck','expired']]]) {
    await worker.evaluate(async legacy=>chrome.storage.sync.set({selectedStatus:legacy}),legacy);
    await page.reload();
    await page.waitForFunction(({value,expected})=>document.querySelector('#statusSelect')?.value===value
     &&document.querySelectorAll('#display > .quiz').length===expected.length
     &&expected.every(state=>document.querySelector(`#display > .${state}`)),{value,expected});
   }
   await page.selectOption('#statusSelect','complete');
   await page.waitForFunction(()=>document.querySelectorAll('#display > .quiz').length===2&&document.querySelector('#display > .complete')&&document.querySelector('#display > .qualify'));
   assert.deepEqual(await page.locator('#display .liStatus').allTextContents(),['状態: 完了','状態: 完了']);
   await page.selectOption('#statusSelect','all');
   // Restore the initial light palette for the next page; independent old keys remain untouched.
   await worker.evaluate(async()=>chrome.storage.sync.set({colorSelect_light_complete:'#117733',colorSelect_light_expired:'#bb2233'}));
  }
  assert.deepEqual(await worker.evaluate(async()=> (await chrome.storage.local.get('quiz_list')).quiz_list.map(t=>t.status)),states);
  await worker.evaluate(async()=>chrome.storage.sync.set({selectedStatus:'incomplete'}));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#statusSelect')?.value==='incomplete');
  assert.deepEqual(errors,[]);
  console.log('PASS 6 color settings; paired task/course/event colors; existing complete/expired settings; change/reload; separate light/dark; preserved internal states; merged filters including old preferences; unified completion labels.');
 } finally { await context.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
