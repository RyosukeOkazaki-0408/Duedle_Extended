// Audit probe: reproduces the current issue; a successful exit does not mean the bug is fixed.
(async () => {
const copy = x => JSON.parse(JSON.stringify(x));
const root = 'https://cms7.ict.nitech.ac.jp/moodle40a/';
class TestURL {
  constructor(value) {
    const m = /^(https?:)\/\/([^/]+)([^?#]*)(?:\?([^#]*))?/.exec(value);
    if (!m) throw new Error('Invalid URL');
    this.origin = m[1]+'//'+m[2]; this.pathname = m[3]; this.href=value;
    this.searchParams={get(key){const p=(m[4]||'').split('&').find(x=>x.split('=')[0]===key); return p?p.split('=')[1]:null;}};
  }
}
function event() { const listeners=[]; return {addListener(fn){listeners.push(fn);},removeListener(fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);},emit(...args){return [...listeners].map(fn=>fn(...args));}}; }
function prod(path,names,bind={}){ return Function(...Object.keys(bind),readFile(path)+';return {'+names.join(',')+'};')(...Object.values(bind)); }
const shared={duedleAccount:'11',duedleAccountTabs:{1:{accountId:'11',pageId:'owner'}},assign_list:[],quiz_list:[],courseIds:[7]};
const storage={async get(keys){if(typeof keys==='string')keys=[keys];return copy(Object.fromEntries(keys.filter(k=>k in shared).map(k=>[k,shared[k]])));},async set(update){Object.assign(shared,copy(update));}};
const onChanged=event();
let taskMessage;
const extension={storage:{local:storage,onChanged},runtime:{onMessage:event(),onInstalled:event()},tabs:{onUpdated:event(),onRemoved:event(),async create(){return {id:77};},async update(id,{url}){const tab={id,url,status:'complete'};extension.tabs.onUpdated.emit(id,{status:'complete'},tab);return tab;},async remove(){},async sendMessage(id,msg){if(msg.type==='COLLECT_COURSE_ITEMS')return {ok:true,items:[{type:'assign',id:8}]};return new Promise(resolve=>taskMessage(msg,{},resolve));}}};
const globals={};
const {AccountSession}=prod('src/common/account.js',['AccountSession'],{URL:TestURL,globalThis:globals,CustomEvent:class {constructor(type){this.type=type;}},MutationObserver:class {observe(){} disconnect(){}},setTimeout(){return 1;},clearTimeout(){}});
const {StorageUtil}=prod('src/storage/class/StorageUtil.js',['StorageUtil'],{ext:extension});
const {RefreshCoordinator}=prod('src/storage/class/RefreshCoordinator.js',['RefreshCoordinator'],{URL:TestURL});
prod('src/storage/service_worker.js',[],{ext:extension,AccountSession,StorageUtil,RefreshCoordinator,URL:TestURL,importScripts(){},setTimeout(){return 1;},clearTimeout(){},console:{error(){}}});
const originalSender={url:root+'my/',tab:{id:1},frameId:0};
const contentNative={storage:{local:storage,onChanged},runtime:{onMessage:{addListener(fn){taskMessage=fn;}},async sendMessage(msg){throw new Error('Task account identity has not resolved; no content save should proceed');}}};
const delayedDoc={querySelector(){return null;},querySelectorAll(){return [];},documentElement:{},getElementById(){return null;},dispatchEvent(){}};
const contentExt=AccountSession.contentAPI(contentNative,delayedDoc,root+'mod/assign/view.php?id=8');
const contentStorage=prod('src/storage/class/StorageUtil.js',['StorageUtil'],{ext:contentExt}).StorageUtil;
prod('src/storage/cs_scrapeAssign.js',[],{ext:contentExt,StorageUtil:contentStorage,document:delayedDoc,ScrapeAssign:{getData(){return {group:'assign_list',assignId:8,assignName:'B private task',file:'b-private.pdf',status:'complete'};}},console:{error(){}}});
const response=await new Promise(resolve=>extension.runtime.onMessage.emit({type:'TAB_COURSE',accountId:'11',pageId:'owner'},originalSender,resolve));
if(!response.ok || shared.duedleAccount!=='11' || shared.assign_list[0]?.file!=='b-private.pdf')throw new Error('Did not reproduce '+JSON.stringify({response,shared}));
print('REPRO CSE identity not ready: '+JSON.stringify({response,activeAccount:shared.duedleAccount,saved:shared.assign_list}));
})().catch(e=>{print('FAIL '+e.stack);quit(1);});
drainMicrotasks();
