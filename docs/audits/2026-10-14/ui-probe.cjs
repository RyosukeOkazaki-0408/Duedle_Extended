// Audit probe: reproduces the current issue; a successful exit does not mean the bug is fixed.
const {chromium}=require('playwright');
const fs=require('node:fs');
const root=require('node:path').resolve(__dirname, '../../..')+'/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const p=await browser.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><section class="section course-section main clearfix"><button class="btn btn-icon mr-1 icons-collapse-expand justify-content-center stretched-link collapsed">open</button><h3 class="sectionname" id="section-1">Section 1</h3><p hidden>Content</p></section><div class="qtext"><span id="dynamic" style="color:red !important">A dynamic teacher message</span></div><div id="display"></div></body></html>'}));
 await p.goto('https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=1#section-1');
 await p.evaluate(()=>localStorage.setItem('hide','false'));
 await p.addScriptTag({path:root+'src/cource/hide_closedTab.js'});
 console.log('initial hash',await p.evaluate(()=>({hash:location.hash,sectionDisplay:getComputedStyle(document.querySelector('section')).display,hiddenContent:document.querySelector('section p').hidden})));
 await p.addStyleTag({path:root+'src/theme/dark.css'});
 await p.addScriptTag({path:root+'src/theme/content.js'});
 await p.evaluate(()=>{document.querySelector('#dynamic').style.setProperty('color','blue','important');});
 console.log('dynamic native update',await p.locator('#dynamic').evaluate(e=>({color:getComputedStyle(e).color,inline:e.style.color})));
 await p.evaluate(()=>document.body.classList.add('darkmode'));
 await p.evaluate(()=>document.body.classList.remove('darkmode'));
 console.log('after theme roundtrip',await p.locator('#dynamic').evaluate(e=>({color:getComputedStyle(e).color,inline:e.style.color})));
 await p.addScriptTag({content:'const ext={storage:{sync:{get:async()=>({selectedShow:"normal"})}}}; const Scrape={statusAt:s=>s}; function formatRemainingTime(){return "?"}'});
 for(const f of ['TaskBox','QuizBox']) await p.addScriptTag({path:root+'src/storage/class/task/'+f+'.js'});
 await p.evaluate(async()=>document.querySelector('#display').append(await new QuizBox({group:'quiz_list',quizId:1,quizName:'Legacy',courseName:'Course',status:'incomplete',show:true}).getElement()));
 console.log('legacy maxcount',await p.locator('.li4').textContent());
 console.log('errors',errors);
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
