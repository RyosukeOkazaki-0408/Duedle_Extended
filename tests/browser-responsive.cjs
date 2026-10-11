// Real Chrome extension with synthetic Moodle documents; no Moodle connection.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moodle fixture</title><style>
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
        const chooseTheme = async value => {
            if((await page.locator('#thememode_selection').getAttribute('aria-expanded'))!=='true') await page.locator('#thememode_selection').click();
            await page.locator('#duedle-theme-menu button[data-mode="'+value+'"]').click();
            if(value==='ios-toggle') await page.keyboard.press('Escape');
        };
  const worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id)); assert(worker);
  await worker.evaluate(async () => {
   await chrome.storage.local.set({assign_list:Array.from({length:5},(_,i)=>({group:'assign_list',assignId:i+1,courseId:1,courseName:'回帰テストコース 2026',assignName:'課題 '+(i+1),status:'incomplete',show:true,start:Date.now()-3600000,due:Date.now()+86400000,filenum:1,file:i===0?'長いファイル名'.repeat(20):'report.pdf'}))});
   await chrome.storage.sync.set({selectedShow:'all',selectedType:'all',selectedStatus:'all'});
  });
  await page.reload(); await page.waitForSelector('#display > .assign');
  const openSettings = async () => {
   await page.waitForFunction(()=>Boolean(document.getElementById('duedle-course-settings'))===(innerWidth<=599));
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
  await page.locator('#thememode_selection').click();
  await page.locator('#duedle-theme-menu').waitFor({state:'visible'});
  const menuLayout=await page.locator('#duedle-theme-menu').evaluate(menu=>{
    const rows=[...menu.querySelectorAll('button')];
    const labels=rows.map(row=>row.querySelector('.duedle-theme-menu-label').getBoundingClientRect());
    const marks=rows.map(row=>row.querySelector('.duedle-theme-menu-mark').getBoundingClientRect());
    const bounds=menu.getBoundingClientRect();
    return {aligned:labels.every(label=>Math.abs(label.left-labels[0].left)<1)&&marks.every(mark=>Math.abs(mark.left-marks[0].left)<1),onScreen:bounds.left>=0&&bounds.right<=innerWidth&&bounds.top>=0&&bounds.bottom<=innerHeight,hits:rows.every(row=>row.getBoundingClientRect().height>=44)};
  });
  assert(menuLayout.aligned&&menuLayout.onScreen&&menuLayout.hits,'Grouped menu aligns all labels and check columns with accessible hit targets');
  await page.screenshot({path:'/private/tmp/duedle-display-settings-menu.png'});
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.mode),'1','Arrow keys move through modes');
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#thememode_selection').getAttribute('aria-expanded'),'false','Selecting a color mode closes menu');
  await chooseTheme('2');
  await page.locator('#thememode_selection').click();await page.keyboard.press('Home');for(let i=0;i<4;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.body.classList.contains('iosmode'));
  assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'2','Appearance checkbox does not change color mode');
  assert.equal(await page.locator('#duedle-theme-menu [role="menuitemradio"][aria-checked="true"]').count(),1,'One color selection remains checked');
  await page.keyboard.press('Space');await page.waitForFunction(()=>!document.body.classList.contains('iosmode'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#thememode_selection').getAttribute('aria-expanded'),'false','Escape closes the menu');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'thememode_selection','Escape returns focus to trigger');
  await page.locator('#duedle-theme-menu').evaluate(menu=>menu.removeAttribute('popover'));
  await page.locator('#thememode_selection').click();await page.locator('#duedle-theme-menu').waitFor({state:'visible'});
  await page.locator('header h1').click();
  assert.equal(await page.locator('#thememode_selection').getAttribute('aria-expanded'),'false','Fallback menu closes on outside pointer without cancelling navigation');
  await page.locator('#duedle-theme-menu').evaluate(menu=>menu.setAttribute('popover','auto'));

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
  await chooseTheme('0'); await page.emulateMedia({colorScheme:'dark'}); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.emulateMedia({colorScheme:'light'}); await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  await chooseTheme('1'); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.evaluate(()=>document.querySelector('#display').scrollLeft=100);
  await chooseTheme('2'); await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
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
  await chooseTheme('1');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#native-blue-row')).backgroundColor==='rgb(54, 63, 69)');
  await chooseTheme('2');
  await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#native-blue-row').getAttribute('bgcolor'),'lightblue');
  assert.equal(await page.locator('#native-blue-row').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(173, 216, 230)','Light mode restores native row color');
  assert.equal(await page.locator('#native-blue-row').evaluate(el=>el.style.color),'');
  const hitSizes=await page.locator('#thememode_selection,#scrapebutton,#showSelect,#colorSelect_complete,#duedle-course-settings > summary').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));
  assert(hitSizes.every(r=>r.height>=44&&r.width>=44),'Phone controls retain 44px touch targets');
  const setIos = async on => {
    if((await page.locator('#thememode_selection').getAttribute('data-ios-appearance'))!==String(on)) {
      await chooseTheme('ios-toggle');
    }
    await page.waitForFunction(on=>document.body.classList.contains('iosmode')===on,on);
    await page.waitForFunction(on=>document.querySelector('#thememode_selection')?.dataset.iosAppearance===String(on),on);
    assert.equal(await page.locator('#duedle-theme-menu [role="menuitemcheckbox"][data-mode="ios-toggle"]').getAttribute('aria-checked'),String(on),'Independent checkbox reflects ON/OFF');
    assert.equal(await page.locator('#duedle-theme-menu [role="menuitemcheckbox"][data-mode="ios-toggle"] .duedle-theme-menu-label').innerText(),'iOS風モード','Appearance label stays fixed');
  };
  assert.equal(await page.locator('#duedle-theme-menu [role="menuitemradio"]').count(),4,'Four exclusive color modes');
  assert.equal(await page.locator('#duedle-theme-menu [role="menuitemcheckbox"][data-mode="ios-toggle"]').count(),1,'Independent appearance checkbox');
  assert(await page.locator('#duedle-theme-menu .duedle-theme-menu-label').evaluateAll(options=>options.every(o=>!/[🔄🌙☀🌿]/u.test(o.textContent))),'Theme labels have no emoji');
  assert(await page.locator('#duedle-theme-control').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'Single theme menu stays on screen');
  await worker.evaluate(async()=>{await chrome.storage.local.remove('iosAppearance');await chrome.storage.local.set({thememode:4})});
  await page.reload();await page.waitForSelector('#thememode_selection');
  await page.waitForFunction(()=>document.querySelector('#thememode_selection')?.value==='0'&&document.querySelector('#thememode_selection')?.dataset.iosAppearance==='true');
  const savedStatusColor = await worker.evaluate(async()=> (await chrome.storage.sync.get('colorSelect_light_incomplete')).colorSelect_light_incomplete);
  await worker.evaluate(async()=>await chrome.storage.sync.set({colorSelect_light_incomplete:'#f8e9cf'}));
  await page.emulateMedia({colorScheme:'light'});
  await chooseTheme('0');await setIos(true);
  await page.waitForFunction(()=>document.body.classList.contains('iosmode') && !document.body.classList.contains('darkmode'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#display > .assign')).backgroundColor==='rgb(248, 233, 207)');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(242, 242, 247)');
  await page.screenshot({path:'/private/tmp/duedle-ios-light-phone.png',fullPage:true});
  await page.reload();await page.waitForSelector('#thememode_selection');
  assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'0','System theme survives reload independently');
  assert.equal(await page.locator('#duedle-theme-menu button').count(),5,'Four modes and one iOS action remain available');
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.body.classList.contains('iosmode') && document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  await page.screenshot({path:'/private/tmp/duedle-ios-dark-phone.png',fullPage:true});
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  await chooseTheme('2');await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.body.classList.contains('iosmode')&&!document.body.classList.contains('darkmode'));
  await chooseTheme('1');await page.waitForFunction(()=>document.body.classList.contains('iosmode')&&document.body.classList.contains('darkmode'));
  await chooseTheme('3');await page.waitForFunction(()=>document.body.classList.contains('iosmode')&&document.body.classList.contains('honobono'));
  await setIos(false);
  const palette = () => page.locator('body,#filter,#fieldfilter select,#scrapebutton,#displaybutton,#thememode_selection,#display,#listupdated').evaluateAll(elements=>elements.map(el=>{
    const style=getComputedStyle(el);
    return { id:el.id, background:style.backgroundColor, text:style.color, border:style.borderColor };
  }));
  const originalHonobonoPalette = await palette();
  await setIos(true);
  assert.deepEqual(await palette(),originalHonobonoPalette,'iOS ON/OFF preserves honobono colors across buttons, selects and surfaces');
  assert.equal(await page.locator('#filter').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 246, 225)','iOS honobono retains the warm filter palette');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(242, 245, 246)','iOS honobono retains the original background');
  assert.equal(await page.locator('#duedle-theme-menu button[data-mode="3"] .duedle-theme-menu-label').innerText(),'ほのぼのモード','Current theme has no appearance annotation');
  await page.reload();await page.waitForSelector('#thememode_selection');
  await page.waitForFunction(()=>document.body.classList.contains('iosmode')&&document.body.classList.contains('honobono'));
  assert.equal(await page.locator('#filter').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 246, 225)','Honobono palette survives reload');
  await chooseTheme('1');await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await setIos(false);
  assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'1','Turning iOS off preserves dark theme');
  await page.reload();await page.waitForSelector('#thememode_selection');
  assert.equal(await page.locator('#thememode_selection').getAttribute('data-ios-appearance'),'false','iOS off survives reload');
  await page.emulateMedia({colorScheme:'light'});
  for (const mode of ['0','1','2','3']) {
    await chooseTheme(mode);
    await page.waitForFunction(mode=>!document.body.classList.contains('iosmode') && document.body.classList.contains('darkmode')===(mode==='1') && document.body.classList.contains('honobono')===(mode==='3'),mode);
  }
  await worker.evaluate(async color=>await chrome.storage.sync.set({colorSelect_light_incomplete:color}),savedStatusColor);
  await chooseTheme('0');await setIos(true);await page.waitForFunction(()=>document.body.classList.contains('iosmode'));
  await page.setViewportSize({width:1024,height:900});
  await page.screenshot({path:'/private/tmp/duedle-ios-light-desktop.png',fullPage:true});
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
    for(const id of ['notion']) { const control=document.createElement('div'); control.id=id; control.textContent=id; sidebar.append(control); }
    document.body.append(sidebar);
  });
  await page.waitForFunction(()=>['notion'].every(id=>document.getElementById(id).closest('#duedle-course-settings')));
  await page.locator('#duedle-course-settings > summary').tap();
  await chooseTheme('1'); await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  await page.setViewportSize({width:1024,height:900});
  await page.waitForFunction(()=>!document.getElementById('duedle-course-settings')&&['notion'].every(id=>document.getElementById(id).parentElement.id==='test-sidebar'));
  assert.equal(await page.locator('#thememode_selection').getAttribute('value'),'1','Settings survive moving back to desktop');
  await page.setViewportSize({width:390,height:844});
  await page.waitForSelector('#duedle-course-settings');
  assert.equal(await page.locator('#thememode_selection').count(),1);
  await page.reload(); await page.waitForSelector('#thememode_selection',{state:'attached'}); assert.equal(await page.locator('#thememode_selection').count(),1);
  await chooseTheme('0');await setIos(true);await page.waitForFunction(()=>document.body.classList.contains('iosmode'));
  await page.goto(root+'blocks/syllabus/view.php?id=1');
  await page.waitForFunction(()=>document.body.classList.contains('iosmode'));
  await page.evaluate(()=>{const table=document.createElement('table');table.innerHTML='<tbody><tr><td id="syllabus-cell" bgcolor="lightsteelblue">Syllabus</td></tr></tbody>';document.body.append(table);});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#syllabus-cell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.body.classList.contains('darkmode'));
  assert.equal(await page.locator('#syllabus-cell').getAttribute('bgcolor'),'lightsteelblue','Syllabus attributes stay intact');
  assert.equal(await page.locator('#syllabus-cell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(176, 196, 222)');
  await worker.evaluate(async()=>await chrome.storage.local.set({thememode:2,iosAppearance:false}));
  await page.waitForFunction(()=>!document.body.classList.contains('iosmode'));
  assert.deepEqual(errors,[]); console.log('PASS iOS theme persistence/system appearance/legacy modes/custom status colors/syllabus; selected hide/restore/cancel and native mobile syllabus order; responsive Chrome: 9 widths, card peek/no page overflow/natural height, accessible single theme selector, delayed/replaced/hidden navigation, stored theme, scroll preserved, native task/course touch navigation and reload');
 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
