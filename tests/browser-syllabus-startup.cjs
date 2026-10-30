// Exercise the real manifest at document_start, without Moodle account markup.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'duedle-syllabus-')),{headless:true,ignoreDefaultArgs:['--disable-extensions'],executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-extension-debugging']});
 try{
  await context.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.visibleFrames=[];function inspect(){if(document.body&&getComputedStyle(document.documentElement).opacity==='1'){visibleFrames.push({at:performance.now(),dark:document.body.classList.contains('darkmode'),bg:getComputedStyle(document.body).backgroundColor});}requestAnimationFrame(inspect);}requestAnimationFrame(inspect);</script><table><tr><td><div style="background-color:lightsteelblue">見出し</div><p><a>本文</a></p></td></tr></table></body></html>`}):r.abort());
  const cdp=await context.browser().newBrowserCDPSession();const loaded=await cdp.send('Extensions.loadUnpacked',{path:path.resolve('src')});
  let worker=context.serviceWorkers().find(w=>w.url().includes(loaded.id));if(!worker)worker=await context.waitForEvent('serviceworker');
  const page=await context.newPage();
  const errors=[];
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  page.on('pageerror',e=>errors.push(e.message));
  const manifest=JSON.parse(fs.readFileSync('src/manifest.json','utf8'));
  const common=manifest.content_scripts.find(s=>s.js?.includes('./common/account.js'));
  for(const host of ['cms7.ict.nitech.ac.jp','duedle-35-184-191-167.sslip.io']) {
   assert(common.exclude_matches.includes(`https://${host}/moodle40a/blocks/syllabus/*`),'Standalone syllabus must not load account registration');
  }
  await worker.evaluate(()=>chrome.storage.local.set({duedleAccount:'fixture-account'}));
  for(const ios of [false,true])for(const mode of [1,2,0])for(const osMode of ['light','dark']){
   await worker.evaluate(async({mode,ios})=>chrome.storage.local.set({thememode:mode,iosAppearance:ios}),{mode,ios});
   await page.emulateMedia({colorScheme:osMode});
   await page.goto('https://cms7.ict.nitech.ac.jp/moodle40a/blocks/syllabus/view7.php?id=1');
   await page.waitForFunction(()=>window.visibleFrames?.length>=5);
   const frames=await page.evaluate(()=>visibleFrames);
   assert(frames[0].at<1500,'Theme does not wait for the 2-second account identity timeout');
   assert(frames.every(f=>f.dark===(mode===1||mode===0&&osMode==='dark')),'Every visible frame already has the selected theme');
  }
  // Wait past the former account-identification timeout to catch delayed warnings.
  await page.waitForTimeout(2200);
  assert.deepEqual(errors,[]);
  assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('duedleAccount')).duedleAccount),'fixture-account');
  console.log('PASS no account warnings or account changes; real extension syllabus startup: 12 combinations, no account markup, selected theme on first visible frame, no 2-second identity wait');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
