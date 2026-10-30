const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const lum=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>.bg-dark{background-color:#343a40!important}.text-light{color:#f8f9fa!important}#page-footer a:not(.btn){color:white}body{background:white;color:#212529}footer{padding:24px}a{display:block}a:focus{background:#d3e8fa;color:#212529}</style><body><main>本文</main><footer id="page-footer" class="bg-dark text-light"><a class="aalink" href="#"><i class="text-light">✉</i>サイトサポートに連絡する</a><a href="#">データ保持概要</a></footer><div id="unrelated" class="bg-dark text-light">元の配色</div></body>`);
  for(const f of ['dark','light','ios'])await page.addStyleTag({path:`src/theme/${f}.css`});
  await page.addScriptTag({path:'src/theme/state.js'});
  for(const width of [390,1280])for(const os of ['light','dark'])for(const ios of [false,true])for(const mode of [1,2,3,0,2]){
   await page.setViewportSize({width,height:800});await page.emulateMedia({colorScheme:os});
   await page.evaluate(({mode,ios})=>duedleApplyTheme(mode,ios),{mode,ios});
   await page.locator('body').click({position:{x:2,y:2}});
   const state=await page.evaluate(()=>{const f=document.querySelector('#page-footer'),s=getComputedStyle(f);return {bg:s.backgroundColor,fg:s.color,link:getComputedStyle(f.querySelector('a')).color,icon:getComputedStyle(f.querySelector('i')).color,other:getComputedStyle(document.querySelector('#unrelated')).backgroundColor};});
   const dark=mode===1||mode===0&&os==='dark';
   assert.equal(state.bg,mode===3?'rgb(52, 58, 64)':dark?(ios?'rgb(28, 28, 30)':'rgb(38, 53, 65)'):(ios?'rgb(255, 255, 255)':'rgb(248, 249, 250)'));
   for(const c of [state.fg,state.link,state.icon])assert(contrast(c,state.bg)>=4.5,JSON.stringify({mode,ios,state}));
   assert.equal(state.other,'rgb(52, 58, 64)');
   if(mode!==3){
    await page.locator('#page-footer a').first().focus();
    const focus=await page.locator('#page-footer a').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
    assert(contrast(focus.fg,focus.bg)>=4.5);
   }
  }
  console.log('PASS footer: 40 theme/iOS/OS/width combinations, contrast, keyboard focus, honobono and unrelated dark surfaces unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
