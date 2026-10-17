// Audit probe: reproduces the current issue; a successful exit does not mean the bug is fixed.
const {chromium} = require('playwright');
const path = require('node:path');
const root=path.resolve(__dirname, '../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage({timezoneId:'Asia/Tokyo'});
  await page.setContent('<h1>Course</h1>');
  for(const f of ['common/utils.js','storage/class/scrape/Scrape.js','storage/class/scrape/ScrapeAssign.js','storage/class/scrape/ScrapeQuiz.js','storage/class/scrape/ScrapeQuizReview.js','storage/class/CourseCollector.js']) await page.addScriptTag({path:path.join(root,'src',f)});
  const result=await page.evaluate(async()=>{
   const old={group:'quiz_list',quizId:101,courseName:'Course',quizName:'Quiz',point:5,maxp:10,required:7,count:2,maxcount:3,status:'incomplete',show:true,start:null,due:null};
   document.body.innerHTML='<h1>Course</h1><span aria-current="page">Quiz</span><table class="quizreviewsummary"><tbody><tr><th>評点</th><td>10.00 / 10.00 (100%)</td></tr><tr><th>フィードバック</th><td>よくできました</td></tr></tbody></table>';
   const feedback=ScrapeQuizReview.getData(old);
   document.body.innerHTML='<h1>Course</h1><span aria-current="page">Quiz</span><table class="quizreviewsummary"><tbody><tr><th>評点</th><td>10.00 / 10.00 (100%)</td></tr></tbody></table>';
   const firstAttemptMethod=ScrapeQuizReview.getData(old);
   const root='https://cms7.ict.nitech.ac.jp/moodle40a/';const req=[];
   globalThis.StorageUtil={saveData:async()=>{}};
   const collector=new CourseCollector({fetch:async url=>{req.push(url);return {ok:true,url,text:async()=>'<h1>Course</h1><a href="'+root+'course/view.php?id=42&section=1">Topic 1: assignment (1)</a>'};}});
   const multipage=await collector.run([42]);
   const english=new DOMParser().parseFromString('<h1>Course</h1><h2>Quiz</h2><div class="description-inner"><div>Opened: Wednesday, 14 October 2026, 10:00 AM</div><div>Closes: Thursday, 15 October 2026, 10:00 AM</div></div><p class="text-left">Grade to pass: 8.00 out of 10.00</p><p class="text-left">Attempts allowed: 2</p><table class="quizattemptsummary"><tbody><tr><td>1</td></tr></tbody></table><div id="feedback"><h3>Grade so far: 7.00 / 10.00</h3></div>','text/html');
   const englishQuiz=ScrapeQuiz.getData(english,root+'mod/quiz/view.php?id=102');
   return {feedback:{actualPoint:feedback.point,actualStatus:feedback.status,expectedPoint:10,expectedStatus:'complete'},firstAttemptMethod:{actualPoint:firstAttemptMethod.point,actualStatus:firstAttemptMethod.status,expectedPoint:5,expectedStatus:'incomplete'},multipage:{result:multipage,requests:req},englishQuiz:{due:englishQuiz.due,start:englishQuiz.start,required:englishQuiz.required,maxcount:englishQuiz.maxcount,status:englishQuiz.status,point:englishQuiz.point}};
  });
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
