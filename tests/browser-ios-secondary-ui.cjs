// Isolated fixtures for secondary Moodle surfaces; no requests reach Moodle.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage();
  await page.setContent(`<style>body{color:#212529;background:white}.dropdown-menu{background:white;border:1px solid #ddd}.dropdown-item{display:block;color:#212529;padding:12px}.dropdown-divider{border-top:1px solid #ddd}.page-link{display:inline-block;padding:10px;background:white}.dropdown-item.active,.page-item.active .page-link{background:#006dcc;color:white}.nav-pills .nav-link.active:not(:disabled):not(.disabled).active{background:#6a737b;color:white}.hover-tooltip{background:white;border:1px solid #ddd}.dropdown-item.disabled{color:#777}.dropdown-item:hover{background:#eee}.modal-content,.list-group-item,.form-control{background:white;color:#212529}</style><body id="page-message-notificationpreferences"><div class="hover-tooltip">要設定</div><div class="file-picker"><div class="fp-repo nav-pills"><a class="nav-link active" href="#">ファイルのアップロード</a></div></div><nav><button id="toggle">プロフィール</button><div id="menu" class="dropdown-menu" hidden><a href="#" class="dropdown-item">評定</a><hr class="dropdown-divider"><a href="#" class="dropdown-item active">プリファレンス</a><button class="dropdown-item disabled" disabled>使用不可</button></div></nav><main id="region-main"><ul><li class="page-item"><a href="#" class="page-link">1</a></li><li class="page-item active"><a href="#" class="page-link">2</a></li><li class="page-item disabled"><span class="page-link">次へ</span></li></ul><div class="generalbox">プロフィール</div><div class="list-group-item">設定項目</div><input class="form-control" placeholder="検索"><div class="activity-header">活動</div><div class="que"><div class="info">問題番号</div><div class="formulation">問題</div><div class="outcome">フィードバック</div></div><div class="duedle-authored-content"><div class="dropdown-menu" style="background:rgb(255, 250, 200);color:black">教材内の例</div></div></main></body>`);
  for(const file of ['dark','light','ios']) await page.addStyleTag({path:`src/theme/${file}.css`});
  await page.addScriptTag({path:'src/theme/state.js'});
  await page.evaluate(()=>{document.querySelector('#toggle').onclick=()=>{document.querySelector('#menu').hidden=!document.querySelector('#menu').hidden;};document.querySelectorAll('a').forEach(a=>a.onclick=e=>e.preventDefault());});
  const bg=s=>page.locator(s).first().evaluate(el=>getComputedStyle(el).backgroundColor);
  const color=s=>page.locator(s).first().evaluate(el=>getComputedStyle(el).color);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   for(const mode of [1,2,3,0]) for(const os of ['light','dark']) for(const ios of [true,false,true]){
    await page.emulateMedia({colorScheme:os});
    await page.evaluate(({mode,ios})=>duedleApplyTheme(mode,ios),{mode,ios});
    await page.locator('#toggle').click();
    const dark=await page.locator('body').evaluate(el=>el.classList.contains('darkmode'));
    const neutral=ios&&mode!==3;
    const surface=dark?(ios?'rgb(28, 28, 30)':'rgb(38, 53, 65)'):'rgb(255, 255, 255)';
    assert.equal(await bg('#menu'),surface);
    if(neutral){
     assert.equal(await color('#menu .dropdown-item'),dark?'rgb(242, 242, 247)':'rgb(28, 28, 30)');
     for(const selector of ['#menu .dropdown-item:not(.active,.disabled)', '.page-item:not(.active,.disabled) .page-link']){
      await page.locator(selector).hover();assert.equal(await bg(selector),dark?'rgb(44, 44, 46)':'rgb(233, 233, 239)');
      await page.locator(selector).focus();assert.equal(await bg(selector),dark?'rgb(44, 44, 46)':'rgb(233, 233, 239)');
     }
     for(const selector of ['#menu .active','.page-item.active .page-link']){
      assert.equal(await bg(selector),dark?'rgb(100, 173, 255)':'rgb(0, 104, 217)');
      assert.equal(await color(selector),dark?'rgb(0, 0, 0)':'rgb(242, 242, 247)');
     }
     assert.equal(await bg('#menu .disabled'),surface);
    }
    if(dark&&ios){
     assert.equal(await bg('.hover-tooltip'),surface);
     assert.equal(await bg('.fp-repo .active'),'rgb(58, 58, 60)');
     for(const selector of ['.generalbox','.list-group-item','.form-control','.activity-header','.que .info']) assert.equal(await bg(selector),surface,selector);
     assert.equal(await bg('.que .formulation'),'rgb(44, 44, 46)');
     assert.equal(await bg('.que .outcome'),'rgb(73, 57, 34)','Semantic feedback remains distinct');
     // Modal added only after the user opens a secondary action.
     await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div id="dialog" class="modal-content"><header class="modal-header">確認</header><footer class="modal-footer">キャンセル</footer></div>'));
     for(const s of ['#dialog','.modal-header','.modal-footer']) assert.equal(await bg(s),surface,s);
     await page.locator('#dialog').evaluate(el=>el.remove());
    }
    assert.equal(await bg('.duedle-authored-content .dropdown-menu'),'rgb(255, 250, 200)');
    await page.locator('#toggle').click();
   }
  }
  console.log('PASS secondary UI: 48 mode/OS/viewport/toggle combinations, menus, hover/focus, active/disabled pagination, late modals, quiz panels, authored and semantic colors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
