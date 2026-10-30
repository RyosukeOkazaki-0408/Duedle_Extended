// Exercise the legacy Moodle course search result table in all theme modes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const lum=s=>{const a=s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage();await page.setContent(`<style>body{background:white;color:#212529}a{color:#006dcc}a:focus{color:#212529;background:#d3e8fa}</style><body id="page-course-course_search"><main id="region-main"><table bgcolor="lightgrey"><tr bgcolor="lightblue"><th>授業</th></tr><tr><td><font size="2"><a id="course" href="#course">線形代数Ⅰ</a></font></td><td><a id="syllabus" href="#syllabus">日本語</a></td></tr></table><a id="other" href="#other">ほかのリンク</a></main></body>`);
for(const f of ['dark','light','ios'])await page.addStyleTag({path:`src/theme/${f}.css`});await page.addScriptTag({path:'src/theme/state.js'});
for(const ios of [false,true])for(const mode of [1,2,0,3])for(const os of ['light','dark']){
await page.emulateMedia({colorScheme:os});await page.evaluate(({mode,ios})=>duedleApplyTheme(mode,ios),{mode,ios});const dark=mode===1||mode===0&&os==='dark';
if(mode!==3){for(const s of ['#course','#syllabus']){const v=await page.locator(s).evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e.closest('td')).backgroundColor,table:getComputedStyle(e.closest('table')).backgroundColor}));let bg=v.bg==='rgba(0, 0, 0, 0)'?v.table:v.bg;assert(contrast(v.color,bg)>=4.5,JSON.stringify({ios,mode,os,v}));}}
await page.locator('#course').focus();const focus=await page.locator('#course').evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));assert(contrast(focus.fg,focus.bg)>=4.5);await page.locator('body').click({position:{x:2,y:2}});
}
console.log('PASS course search legacy table: link contrast and focus across modes and iOS settings');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
