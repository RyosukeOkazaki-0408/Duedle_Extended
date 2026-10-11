// Real Chrome extension with synthetic Moodle documents; no Moodle connection.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moodle fixture</title><style>
body{margin:0} #region-main{min-width:0} #usernavigation{display:flex;min-height:40px} #ext_dashboard{padding:16px;box-sizing:border-box} @media(max-width:767px){#usernavigation{display:none}}
</style></head><body><nav id="usernavigation"></nav><header><h1>コース</h1></header><main id="region-main"><a id="course-link" href="${root}course/view.php?id=1">コースへ</a></main></body></html>`;
(async () => {
 const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-responsive-')),{
  headless:true,ignoreDefaultArgs:['--disable-extensions'],executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--enable-unsafe-extension-debugging'],hasTouch:true
 });
 try {
  await context.route('**/*', route => route.request().resourceType()==='document' ? route.fulfill({contentType:'text/html',body:fixture}) : route.abort());
  const existing = await context.newPage();
  await existing.goto(root+'my/');
  assert.equal(await existing.locator('#thememode_selection').count(),0,'Disabled extension leaves native Moodle alone');
  await existing.locator('#course-link').tap(); await existing.waitForURL(root+'course/view.php?id=1');
  const cdp = await context.browser().newBrowserCDPSession();
  const loaded = await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  await existing.reload(); await existing.waitForSelector('#thememode_selection',{state:'attached'}); await existing.close();
  const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'my/'); await page.waitForSelector('#thememode_selection',{state:'attached'});
  const worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id)); assert(worker);
  await worker.evaluate(async () => {
   await chrome.storage.local.set({assign_list:Array.from({length:5},(_,i)=>({group:'assign_list',assignId:i+1,courseId:1,courseName:'回帰テストコース 2026',assignName:'課題 '+(i+1),status:'incomplete',show:true,start:Date.now()-3600000,due:Date.now()+86400000,filenum:1,file:i===0?'長いファイル名'.repeat(20):'report.pdf'}))});
   await chrome.storage.sync.set({selectedShow:'all',selectedType:'all',selectedStatus:'all'});
  });
  await page.reload(); await page.waitForSelector('#display > .assign');
  const openSettings = async () => {
   const settings=page.locator('#duedle-course-settings');
   if(await settings.count() && !(await settings.evaluate(el=>el.open))) await settings.locator('summary').first().tap();
  };
  for(const width of [320,375,390,600,767,768,820,1024,1440]) {
   await page.setViewportSize({width,height:900});
   await page.waitForFunction(w=> document.querySelector('#duedle-theme-control')?.parentElement.id===(w<=767?'duedle-theme-toolbar':'usernavigation'),width);
   if(width===320) {
    assert.equal(await page.locator('#duedle-course-settings').evaluate(el=>el.open),false);
    assert(await page.locator('#scrapebutton').isVisible(),'Update remains directly accessible');
    assert(await page.locator('#display > .assign').first().isVisible(),'Cards stay visible with settings collapsed');
   }
   await openSettings();
   const buttons=await page.locator('.duedle-dashboard-actions > button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,width:r.width}}));
   assert.equal(buttons.length,3);
   assert(buttons.every(button=>Math.abs(button.top-buttons[0].top)<1&&button.width>0&&button.left>=0&&button.right<=width),'All three actions stay in one row at '+width);
   const result=await page.evaluate(()=>{
    const display=document.querySelector('#display'),cards=[...display.querySelectorAll('.assign')],rect=display.getBoundingClientRect(),first=cards[0].getBoundingClientRect(),second=cards[1].getBoundingClientRect(),select=document.querySelector('#thememode_selection').getBoundingClientRect();
    return {pageOverflow:document.documentElement.scrollWidth>innerWidth,scrollable:display.scrollWidth>display.clientWidth,sameRow:Math.abs(first.top-second.top)<2,firstWidth:first.width,peek:second.left<rect.right&&second.right>rect.right,selectVisible:select.width>0&&select.height>=(innerWidth<=599?32:44)&&select.left>=0&&select.right<=innerWidth,count:document.querySelectorAll('#thememode_selection').length,height:cards[0].scrollHeight<=cards[0].clientHeight+1};
   });
   assert(!result.pageOverflow,JSON.stringify({width,result})); assert(result.scrollable&&result.sameRow&&result.selectVisible&&result.count===1&&result.height,JSON.stringify({width,result}));
   if(width<=390) assert(result.peek,JSON.stringify({width,result}));
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('#duedle-theme-control')?.parentElement.id==='duedle-theme-toolbar');
  await openSettings();
  assert(await page.evaluate(()=>document.querySelector('#duedle-theme-toolbar').getBoundingClientRect().bottom<=document.querySelector('#ext_dashboard').getBoundingClientRect().top),'Theme selector is above dashboard');
  await page.locator('#duedle-course-settings > summary').tap();
  assert.equal(await page.locator('#duedle-course-settings').evaluate(el=>el.open),false);
  assert(await page.locator('#scrapebutton').isVisible() && await page.locator('#selecttasksbutton').isVisible(),'Actions remain outside collapsed filters');
  await page.locator('#displaybutton').tap(); assert.equal(await page.locator('#display').isVisible(),false);
  assert.equal(await page.locator('#listupdated').isVisible(),false,'Timestamp hides with the task menu');
  assert.equal(await page.locator('#duedle-course-settings').isVisible(),false,'Task settings hide with the task menu');
  assert.equal(await page.locator('#displaybutton').innerText(),'一覧を表示');
  await page.reload(); await page.waitForSelector('#displaybutton');
  assert.equal(await page.locator('#listupdated').isVisible(),false,'OFF timestamp stays hidden after reload');
  await page.waitForFunction(()=>document.querySelector('#duedle-course-settings')?.hidden===true);

  await page.locator('#displaybutton').tap(); assert(await page.locator('#display').isVisible(),'Display toggle works without opening settings');
  assert(await page.locator('#duedle-course-settings').isVisible(),'Task settings return with the task menu');
  assert.equal(await page.locator('#displaybutton').innerText(),'一覧を隠す');
  await page.evaluate(()=>document.getElementById('usernavigation').style.display='flex');
  await page.waitForFunction(()=>document.getElementById('duedle-theme-control').parentElement.id==='duedle-theme-toolbar');
  assert.equal(await page.locator('#thememode_selection').evaluate(el=>getComputedStyle(el).opacity),'1','Native theme dropdown must not be transparent');
  const themeRect=await page.locator('#thememode_selection').boundingBox();
  assert(themeRect.x>=0 && themeRect.x+themeRect.width<=390,'Visible theme dropdown fits the top-right toolbar');
  await page.selectOption('#thememode_selection','0'); await page.emulateMedia({colorScheme:'dark'}); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.emulateMedia({colorScheme:'light'}); await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  await page.selectOption('#thememode_selection','1'); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.evaluate(()=>document.querySelector('#display').scrollLeft=100);
  await page.selectOption('#thememode_selection','2'); await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#display').evaluate(el=>el.scrollLeft),100,'Theme must preserve horizontal scroll position');
  await page.locator('#display').evaluate(el=>el.scrollLeft=0);
  await page.locator('#selecttasksbutton').tap();
  const taskCheck = id => page.locator(`[data-duedle-task-key="assign_list:${id}"] input[type="checkbox"]`);
  await taskCheck(1).check();
  await page.locator('#canceltaskselection').tap();
  assert.equal(await page.locator('#taskselectionbar').isVisible(),false);
  assert(await worker.evaluate(async()=> (await chrome.storage.local.get('assign_list')).assign_list.every(t=>t.show)), 'Cancel does not change storage');
  await page.locator('#selecttasksbutton').tap();
  await taskCheck(1).check(); await taskCheck(2).check();
  assert.equal(await page.locator('#taskselectioncount').innerText(),'2件を選択');
  await page.locator('#hideselectedtasks').tap();
  await page.waitForFunction(()=>document.querySelector('#taskselectionbar').hidden);
  assert.deepEqual(await worker.evaluate(async()=> (await chrome.storage.local.get('assign_list')).assign_list.map(t=>t.show)),[false,false,true,true,true], 'Only checked tasks hide');
  await openSettings(); await page.selectOption('#showSelect','normal');
  await page.waitForFunction(()=>document.querySelectorAll('#display > .assign').length===3);
  await page.selectOption('#showSelect','deleted');
  await page.waitForFunction(()=>document.querySelectorAll('#display > .assign').length===2);
  await page.locator('#selecttasksbutton').tap(); await taskCheck(1).check();
  await page.locator('#restoreselectedtasks').tap();
  await page.waitForFunction(()=>document.querySelectorAll('#display > .assign').length===1 && document.querySelector('#taskselectionbar').hidden);
  assert.deepEqual(await worker.evaluate(async()=> (await chrome.storage.local.get('assign_list')).assign_list.map(t=>t.show)),[true,false,true,true,true], 'Only checked hidden task restores');
  await worker.evaluate(async()=> {const {assign_list}=await chrome.storage.local.get('assign_list');await chrome.storage.local.set({assign_list:assign_list.map(t=>({...t,show:true}))});});
  await page.selectOption('#showSelect','all');
  await page.waitForFunction(()=>document.querySelectorAll('#display > .assign').length===5);
  await worker.evaluate(async()=> {await chrome.storage.local.set({quiz_list:[{group:'quiz_list',quizId:1,courseId:1,courseName:'回帰テストコース 2026',quizName:'小テスト 1',status:'incomplete',show:true,due:Date.now()+86400000}]});});
  await page.waitForSelector('[data-duedle-task-key="quiz_list:1"]');
  await page.locator('#selecttasksbutton').tap();
  await page.locator('[data-duedle-task-key="quiz_list:1"] input[type="checkbox"]').check();
  await page.locator('#hideselectedtasks').tap();
  await page.waitForFunction(()=>document.querySelector('#taskselectionbar').hidden);
  assert(await worker.evaluate(async()=> {const data=await chrome.storage.local.get(['assign_list','quiz_list']);return data.assign_list[0].show && !data.quiz_list[0].show;}),'Same numeric assignment and quiz IDs stay independent');
  await worker.evaluate(async()=>await chrome.storage.local.set({quiz_list:[]}));
  await page.waitForFunction(()=>!document.querySelector('[data-duedle-task-key="quiz_list:1"]'));
  await page.selectOption('#showSelect','normal');
  await worker.evaluate(async()=>{const {assign_list}=await chrome.storage.local.get('assign_list');assign_list[0].show=false;await chrome.storage.local.set({assign_list});await chrome.storage.sync.set({selectedShow:'deleted'});});
  await page.waitForFunction(()=>document.querySelector('#showSelect').value==='deleted' && document.querySelectorAll('#display > .assign').length===1);
  await worker.evaluate(async()=>{const {assign_list}=await chrome.storage.local.get('assign_list');assign_list[0].show=true;await chrome.storage.local.set({assign_list});await chrome.storage.sync.set({selectedShow:'all'});});
  await page.waitForFunction(()=>document.querySelector('#showSelect').value==='all' && document.querySelectorAll('#display > .assign').length===5);
  await page.locator('#selecttasksbutton').tap();
  await taskCheck(5).check();
  await page.evaluate(()=>{const display=document.querySelector('#display');const observer=new MutationObserver(()=>{if(display.children.length>0 && display.children.length<5){observer.disconnect();document.querySelector('#hideselectedtasks').click();window.clickedDuringRender=true;}});observer.observe(display,{childList:true});});
  await worker.evaluate(async()=>{const {assign_list}=await chrome.storage.local.get('assign_list');assign_list[0].file='Updated by background refresh';await chrome.storage.local.set({assign_list});});
  await page.waitForFunction(()=>window.clickedDuringRender && document.querySelector('#taskselectionbar').hidden);
  assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('assign_list')).assign_list[4].show),false,'Hide during an asynchronous render preserves the selected task');
  await page.evaluate(()=>{const table=document.createElement('table');table.innerHTML='<tbody><tr bgcolor="lightblue" id="native-blue-row"><td>Course</td></tr></tbody>';document.body.append(table);});
  await page.selectOption('#thememode_selection','1');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#native-blue-row')).backgroundColor==='rgb(54, 63, 69)');
  await page.selectOption('#thememode_selection','2');
  await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#native-blue-row').getAttribute('bgcolor'),'lightblue');
  assert.equal(await page.locator('#native-blue-row').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(173, 216, 230)','Light mode restores native row color');
  assert.equal(await page.locator('#native-blue-row').evaluate(el=>el.style.color),'');
  const hitSizes=await page.locator('#thememode_selection,#scrapebutton,#showSelect,#colorSelect_complete,#duedle-course-settings > summary').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));
  assert(hitSizes.every(r=>r.height>=44&&r.width>=44),'Phone controls retain 44px touch targets');
  await page.setViewportSize({width:1024,height:900}); await page.waitForFunction(()=>document.querySelector('#duedle-theme-control')?.parentElement.id==='usernavigation');
  await page.evaluate(()=>document.querySelector('#usernavigation').remove()); await page.waitForFunction(()=>document.querySelector('#duedle-theme-control')?.parentElement.id==='duedle-theme-toolbar');
  await page.evaluate(()=>{const nav=document.createElement('nav');nav.id='usernavigation';document.body.prepend(nav)}); await page.waitForFunction(()=>document.querySelector('#duedle-theme-control')?.parentElement.id==='usernavigation');
  await page.evaluate(()=>document.querySelector('#usernavigation').style.display='none'); await page.waitForFunction(()=>document.querySelector('#duedle-theme-control')?.parentElement.id==='duedle-theme-toolbar');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#display').evaluate(el=>el.scrollLeft=0);
  await page.locator('#display .taskbox a').first().tap(); await page.waitForURL(root+'mod/assign/view.php?id=1'); await page.waitForSelector('#thememode_selection',{state:'attached'});
  await page.locator('#course-link').tap(); await page.waitForURL(root+'course/view.php?id=1'); await page.waitForSelector('#thememode_selection',{state:'attached'});
  await page.evaluate(()=>{const content=document.createElement('div');content.id='page-content';content.className='blocks-post';content.style.cssText='display:flex;flex-direction:column';const main=document.createElement('div');main.id='native-course-content';main.textContent='Course sections';const column=document.createElement('aside');column.className='columnright';const link=document.createElement('a');link.id='native-syllabus-link';link.href='/moodle40a/blocks/syllabus/view.php';link.textContent='シラバスを表示';column.append(link);content.append(main,column);document.body.append(content)});
  assert(await page.evaluate(()=>document.getElementById('native-syllabus-link').getBoundingClientRect().top>=document.getElementById('native-course-content').getBoundingClientRect().bottom),'Native syllabus sidebar stays below course content on phone');
  await page.waitForSelector('#duedle-course-settings');
  assert.equal(await page.locator('#duedle-course-settings').evaluate(el=>el.open),false,'Phone course settings start collapsed');
  assert(await page.locator('#thememode_selection').isVisible(),'Theme stays accessible outside task settings');
  await page.evaluate(()=>{
    const sidebar=document.createElement('aside'); sidebar.id='test-sidebar';
    for(const id of ['toggle_visible_form','notion']) { const control=document.createElement('div'); control.id=id; control.textContent=id; sidebar.append(control); }
    document.body.append(sidebar);
  });
  await page.waitForFunction(()=>['toggle_visible_form','notion'].every(id=>document.getElementById(id).closest('#duedle-course-settings')));
  await page.locator('#duedle-course-settings > summary').tap();
  await page.selectOption('#thememode_selection','1'); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.setViewportSize({width:1024,height:900});
  await page.waitForFunction(()=>!document.getElementById('duedle-course-settings')&&['toggle_visible_form','notion'].every(id=>document.getElementById(id).parentElement.id==='test-sidebar'));
  assert.equal(await page.locator('#thememode_selection').inputValue(),'1','Settings survive moving back to desktop');
  await page.setViewportSize({width:390,height:844});
  await page.waitForSelector('#duedle-course-settings');
  assert.equal(await page.locator('#thememode_selection').count(),1);
  await page.reload(); await page.waitForSelector('#thememode_selection',{state:'attached'}); assert.equal(await page.locator('#thememode_selection').count(),1);
  assert.deepEqual(errors,[]); console.log('PASS selected hide/restore/cancel and native mobile syllabus order; responsive Chrome: 9 widths, card peek/no page overflow/natural height, accessible single theme selector, delayed/replaced/hidden navigation, stored theme, scroll preserved, native task/course touch navigation and reload');
 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
