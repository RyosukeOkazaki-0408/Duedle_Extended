// Synthetic syllabus reproduces the observed legacy heading and href-less anchors.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage();
  await page.setContent(`<body><table border="1"><tr><td bgcolor="lightsteelblue" id="label">授業科目名</td><td>線形代数</td></tr><tr><td colspan="2"><div id="method" style="background-color:lightsteelblue;padding:8px;margin-top:20px">成績評価の方法</div><p>中間試験と期末試験による。</p><div id="reference" style="background-color:lightsteelblue;padding:8px;margin-top:20px"><a>参考書</a></div><p><a id="book" href="https://example.invalid/book" target="_blank">参考書のリンク</a><a><br></a></p><div id="office" style="background-color:lightsteelblue;padding:8px;margin-top:20px"><a>オフィスアワー</a></div><p><a id="bodytext"><span>詳細は講義で確認すること。</span></a></p></td></tr></table></body>`);
  const original=await page.locator('table').evaluate(el=>el.outerHTML);
  for(const file of ['syllabus/darkmode.css','theme/ios.css'])await page.addStyleTag({path:'src/'+file});
  await page.addScriptTag({path:'src/theme/state.js'});
  const style=s=>page.locator(s).evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
  for(const width of [390,1280])for(const os of ['light','dark'])for(const ios of [false,true])for(const mode of [1,2,3,0,1,2]){
   await page.setViewportSize({width,height:800});await page.emulateMedia({colorScheme:os});
   await page.evaluate(({mode,ios})=>duedleApplyTheme(mode,ios),{mode,ios});
   const dark=mode===1||mode===0&&os==='dark';
   for(const selector of ['#label','#method','#reference','#office']){
    const actual=await style(selector);
    assert.equal(actual.bg,dark?(ios?'rgb(44, 44, 46)':'rgb(38, 53, 65)'):'rgb(176, 196, 222)');
    assert.notEqual(actual.bg,(await style('body')).bg,'Heading band remains distinct');
   }
   assert.equal((await style('#reference a')).fg,(await style('#reference')).fg);
   assert.equal((await style('#office a')).fg,(await style('#office')).fg);
   assert.equal((await style('#bodytext span')).fg,(await style('body')).fg);
   assert.notEqual((await style('#book')).fg,(await style('#bodytext')).fg,'Real book link remains identifiable');
   assert.equal(await page.locator('table').evaluate(el=>el.outerHTML),original,'No rewriting text, links, attributes or layout');
  }
  console.log('PASS syllabus: heading bands, href-less anchors, real links, 48 mode/OS/iOS/viewport cases and original HTML preserved');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
