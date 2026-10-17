// Audit probe: reproduces the current issue; a successful exit does not mean the bug is fixed.
(async () => {
  const read = readFile;
  const copy = x => JSON.parse(JSON.stringify(x));
  const assert = (x, msg) => { if (!x) throw new Error(msg); };
  let values = { history: [] };
  const storage = {
    async get(key) { return copy({ [key]: values[key] }); },
    async set(update) { Object.assign(values, copy(update)); }
  };
  const { AccountSession } = Function(read('src/common/account.js') + '; return { AccountSession };')();
  const queue = new AccountSession({storage});
  const ext = { storage: { local: {
    get(key) { return queue.serial(() => storage.get(key)); },
    set(update) { return queue.serial(() => storage.set(update)); }
  } } };
  const historySource = read('src/common/history_update.js').replace('(async () => {', 'return (async () => {');
  const historyUpdate = Function('ext', 'document', 'location', 'globalThis', 'console', historySource);
  await Promise.all([
    historyUpdate(ext, {title:'Course A'}, {href:'https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=1'}, {duedleAccountActive:true}, {log(){},error(e){throw e;}}),
    historyUpdate(ext, {title:'Course B'}, {href:'https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=2'}, {duedleAccountActive:true}, {log(){},error(e){throw e;}})
  ]);
  assert(values.history.length === 1 && values.history[0].title === 'Course B', 'Expected reproducible lost update');
  print('REPRO history race: opening Course A and Course B concurrently leaves ' + JSON.stringify(values.history));

  values = {history:[{title:'User opened course',url:'https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id=99'}],refreshCoordinator:{temporaryTabId:77}};
  for (let id=1;id<=10;id++) await historyUpdate(ext, {title:'Background collected course '+id}, {href:'https://cms7.ict.nitech.ac.jp/moodle40a/course/view.php?id='+id}, {duedleAccountActive:true}, {log(){},error(e){throw e;}});
  assert(values.history.length===10 && !values.history.some(x=>x.title==='User opened course'), 'Expected hidden collection pages to evict recent user history');
  print('REPRO CSE history pollution: 10 collection navigations evicted manually visited course; final history=' + JSON.stringify(values.history.map(x=>x.title)));

  const old = {group:'quiz_list',quizId:7,point:5,maxp:10,required:6,count:1,maxcount:2,status:'incomplete',due:'2026-10-15T00:00:00Z',show:true,fetchedAt:1000};
  values = {quiz_list:[copy(old)]};
  const { StorageUtil } = Function('ext', read('src/storage/class/StorageUtil.js') + '; return { StorageUtil };')({storage:{local:storage}});
  StorageUtil.isBackground = true;
  const { ScrapeQuizReview } = Function('Scrape','document',read('src/storage/class/scrape/ScrapeQuizReview.js') + '; return { ScrapeQuizReview };')(
    class { static statusAt(x) {return x;} },
    {querySelector(s){return {textContent:s === 'h1' ? 'Course' : s === "[aria-current='page']" ? 'Quiz' : '5 / 10'};}}
  );
  const snapshot = copy((await storage.get('quiz_list')).quiz_list[0]);
  const review = ScrapeQuizReview.getData(snapshot);
  await StorageUtil.saveData('quiz_list','quizId',{...old,point:10,count:2,status:'complete',due:'2026-10-20T00:00:00Z',fetchedAt:2000});
  await StorageUtil.saveData('quiz_list','quizId',review);
  assert(values.quiz_list[0].point === 5 && values.quiz_list[0].count === 1 && values.quiz_list[0].due === old.due && values.quiz_list[0].fetchedAt === 2000, 'Expected review rollback');
  print('REPRO quiz review stale write: ' + JSON.stringify(values.quiz_list[0]));
})().catch(e => { print('FAIL ' + e.stack); quit(1); });
drainMicrotasks();
