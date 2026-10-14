// Production UI/collectors/coordinator with an in-memory extension adapter.
// Suppressed and delayed storage notifications reproduce completion races.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page = await browser.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><header><h1>Course</h1></header><input name="sesskey" value="fixture123"><main></main></body></html>'}));
  await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/my/');
  await page.addScriptTag({path:path.resolve('src/storage/class/RefreshCoordinator.js')});
  await page.evaluate(()=>{
   const root='https://cms7.ict.nitech.ac.jp/moodle40a/';
   const clone=x=>JSON.parse(JSON.stringify(x));
   const data={}; const prefs={}; const listeners=[];
   globalThis.testState={data,prefs,listeners,notify:false,scenario:'success',statuses:[],hintHidden:[],finishFailure:false};
   const area=(target,area)=>({
    async get(keys){const names=keys==null?Object.keys(target):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return clone(Object.fromEntries(names.filter(k=>k in target).map(k=>[k,target[k]])));},
    async set(values){const changes=Object.fromEntries(Object.keys(values).map(k=>[k,{oldValue:target[k],newValue:clone(values[k])}]));Object.assign(target,clone(values));if(testState.notify) listeners.forEach(fn=>fn(changes,area));}
   });
   const local=area(data,'local');
   const coordinator=new RefreshCoordinator({storage:local});
   const sender={tab:{id:1,url:root+'my/'},url:root+'my/'};
   globalThis.ext={storage:{local,sync:area(prefs,'sync'),onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{async sendMessage(message){
    const methods={REFRESH_CLAIM:'claim',REFRESH_STATUS:'status',REFRESH_FINISH:'finish',REFRESH_PROGRESS:'progress'};
    if(message.type==='REFRESH_HEARTBEAT') return coordinator.heartbeat(message.token,sender);
    if(message.type==='REFRESH_FINISH'){
     testState.lastLease=clone(data.refreshCoordinator.lease);
     if(testState.finishFailure) return {ok:false,error:'保存処理を確認できませんでした'};
    }
    if(message.type==='REFRESH_STATUS') return coordinator.status(sender);
    return coordinator[methods[message.type]](message,sender);
   }}};
   globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('lib/ajax/service.php'))return{ok:true,json:async()=>[{data:{courses:[{id:1},{id:2}],nextoffset:2}}]};
    await new Promise(resolve=>setTimeout(resolve,30));
    const partial=testState.scenario==='partial'&&String(url).includes('id=102');
    const body=String(url).includes('course/view.php')
     ? '<h1>Course</h1><a href="'+root+'mod/assign/view.php?id='+ (new URL(url).searchParams.get('id')==='1'?101:102)+'">Task</a>'
     : '<h1>Course</h1><h2>Task</h2><form method="get" action="view.php"><input type="hidden" name="id" value="101"><input type="hidden" name="action" value="editsubmission"><button>提出を編集する</button></form><div class="submissionstatustable"><div class="submissionstatusnew">未提出</div></div>';
    return{ok:!partial,status:partial?503:200,url:String(url),text:async()=>body};
   };
  });
  for(const file of ['common/utils.js','storage/class/StorageUtil.js','storage/class/scrape/Scrape.js','storage/class/scrape/ScrapeAssign.js','storage/class/scrape/ScrapeQuiz.js','storage/class/CourseCollector.js','storage/class/AutoRefreshCollector.js','storage/class/TaskListState.js','storage/class/CalendarEventResolver.js','storage/class/task/TaskBox.js','storage/class/task/AssignBox.js','storage/class/task/QuizBox.js','storage/class/filter/FilterSelect.js']) await page.addScriptTag({path:path.resolve('src',file)});
  await page.evaluate(()=>{StorageUtil.isBackground=true;globalThis.duedleAccountActive=true;});
  // Navigation forms on a details page are not submission editors.
  const parsed = await page.evaluate(() => {
   const url = 'https://cms7.ict.nitech.ac.jp/moodle40a/mod/assign/view.php?id=101';
   const read = (html, pageURL=url) => ScrapeAssign.getData(new DOMParser().parseFromString('<h1>Course</h1><h2>Task</h2>'+html,'text/html'),pageURL);
   const button = '<form method="get"><input type="hidden" name="action" value="editsubmission"><button>提出を追加する</button></form>';
   return {
    initial: read(button+'<div class="submissionstatustable"><table><tr><td>提出ステータス</td><td>まだ提出されていません。</td></tr></table></div>')?.status,
    submitted: read(button+'<div class="submissionstatustable"><div class="submissionstatussubmitted">提出済み</div></div>')?.status,
    fileEditor: read('<form><div class="filemanager"></div></form>'),
    textEditor: read('<form><textarea name="onlinetext_editor[text]"></textarea></form>'),
    editURL: read(button,url+'&action=editsubmission'),
    confirmation: read(button,url+'&action=submit')
   };
  });
  assert.deepEqual(parsed,{initial:'incomplete',submitted:'complete',fileEditor:null,textEditor:null,editURL:null,confirmation:null});
  await page.addScriptTag({path:path.resolve('src/storage/display/filter.js')});
  await page.addScriptTag({path:path.resolve('src/storage/display/displaybox.js')});
  await page.waitForSelector('#scrapebutton');
  await page.evaluate(()=>{
   new MutationObserver(()=>testState.statuses.push(document.querySelector('#collectionstatus').textContent)).observe(document.querySelector('#collectionstatus'),{childList:true,subtree:true,characterData:true});
   new MutationObserver(()=>testState.hintHidden.push(document.querySelector('#collectionhint').hidden)).observe(document.querySelector('#collectionhint'),{attributes:true,attributeFilter:['hidden']});
  });
  // A successful finish must render even when storage.onChanged never fires.
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent==='2コース・2件の課題情報を更新しました。');
  assert((await page.locator('#scrapebutton').textContent()).includes('クールダウン'));
  assert.deepEqual(await page.evaluate(()=>testState.hintHidden),[false,true]);
  assert(!(await page.evaluate(()=>testState.statuses)).some(s=>s.includes('このページを開いたまま')));
  await page.evaluate(async()=>{
   await rerender();
   testState.listeners.forEach(fn=>fn({refreshCoordinator:{newValue:{...testState.data.refreshCoordinator,lease:testState.lastLease}}},'local'));
  });
  assert.equal(await page.locator('#collectionstatus').textContent(),'2コース・2件の課題情報を更新しました。');
  // Completion is transient, even if saved history remains unchanged.
  const updatedLabel = await page.locator('#listupdated').textContent();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent==='');
  await page.evaluate(()=>rerender());
  assert.equal(await page.locator('#collectionstatus').textContent(),'');
  assert.equal(await page.locator('#listupdated').textContent(),updatedLabel);
  // A partial parse failure (rather than an HTTP/auth stop) retains saved count and reason.
  await page.evaluate(async()=>{
   testState.notify=true; testState.hintHidden=[]; testState.statuses=[];
   testState.data.scrapeCooldown=null; await updateCooldownButton();
   const original=ScrapeAssign.getData;
   ScrapeAssign.getData=function(doc,url){return url.includes('id=102')?null:original.call(this,doc,url);};
   testState.originalScraper=original;
  });
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('1件を更新しました。1件を取得できませんでした。課題の情報を読み取れませんでした'));
  assert(await page.locator('#scrapebutton').isEnabled());
  assert.deepEqual(await page.evaluate(()=>testState.hintHidden),[false,true]);
  assert.equal(await page.evaluate(()=>testState.data.scrapeCooldown),null);
  await page.evaluate(async()=>{
   await rerender();
   testState.listeners.forEach(fn=>fn({refreshCoordinator:{newValue:{...testState.data.refreshCoordinator,lease:testState.lastLease}}},'local'));
  });
  assert((await page.locator('#collectionstatus').textContent()).includes('課題の情報を読み取れませんでした'));
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent==='');
  await page.evaluate(()=>rerender());
  assert.equal(await page.locator('#collectionstatus').textContent(),'');
  // Saving the completion itself can fail; the specific error must survive rerenders.
  await page.evaluate(()=>{ScrapeAssign.getData=testState.originalScraper;testState.finishFailure=true;});
  await page.locator('#scrapebutton').click();
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent.includes('保存処理を確認できませんでした'));
  await page.evaluate(()=>rerender());
  assert((await page.locator('#collectionstatus').textContent()).includes('保存処理を確認できませんでした'));
  await page.waitForFunction(()=>document.querySelector('#collectionstatus').textContent==='');
  await page.evaluate(()=>rerender());
  assert.equal(await page.locator('#collectionstatus').textContent(),'');
  console.log('PASS transient success/partial/save failure; timestamp preserved; no-notification completion; stable hint; same progress format; late progress ignored; partial outcome with reason persists; finish failure persists');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
