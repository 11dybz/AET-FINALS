const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const own={id:'chee-reynaldo',name:'Reynaldo Chee',role:'Developer',tags:[],details:{}};
const other={id:'another-developer',name:'Another Developer',role:'Developer',tags:[],details:{}};
function app(){
  const elements=new Map(),requests=[];
  function element(){return {children:[],dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},
    appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
    querySelector:()=>element(),querySelectorAll:()=>[],setAttribute(){},removeAttribute(){},addEventListener(){},focus(){}};}
  const context=vm.createContext({window:{RizzumeAccount:{user:{id:'owner-account',profileId:own.id}},location:{href:'http://localhost/',origin:'http://localhost'},addEventListener(){},scrollTo(){}},
    document:{body:{classList:{add(){},remove(){}}},addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
      createElement:element,querySelector:()=>null,querySelectorAll:()=>[]},
    Image:function(){},lucide:{createIcons(){}},sessionStorage:{getItem:()=>null},AbortController,FormData,URL,URLSearchParams,
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console,
    async fetch(url,init){requests.push({url,...init});return {ok:true,status:200,text:async()=>JSON.stringify(url.endsWith('/profiles')?[own,other]:url.endsWith('/me/matches')?[own,other]:{})};}});
  vm.runInContext(source,context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../messages.js'),'utf8'),context);
  return {context,requests,elements};
}
test('discovery and saved matches exclude the owned profile while the directory retains it',async()=>{
  const s=app();await vm.runInContext('refreshProfilesAndMatches()',s.context);
  assert.deepEqual(Array.from(vm.runInContext('cardsState.map(p=>p.id)',s.context)),[other.id]);
  assert.deepEqual(Array.from(vm.runInContext('matchedProfiles.map(p=>p.id)',s.context)),[other.id]);
  assert.deepEqual(Array.from(vm.runInContext('PROFILES.map(p=>p.id)',s.context)),[own.id,other.id]);
});
test('stale self-cards and cached match callbacks cannot create a self-match',async()=>{
  const s=app();s.context.own=own;
  vm.runInContext('backendAvailable=true;cardsState=[own];activeCardElem={};',s.context);
  await vm.runInContext("finalizeSwipe('right')",s.context);
  assert.equal(s.requests.length,0);assert.equal(vm.runInContext('cardsState.length',s.context),0);
  vm.runInContext('handleMatchSuccess(own,true)',s.context);
  assert.equal(vm.runInContext('matchedProfiles.length',s.context),0);
});
test('own-profile contact and conversation shortcuts send no requests',async()=>{
  const s=app();s.context.own=own;
  vm.runInContext('currentlyViewingProfile=own;',s.context);
  await vm.runInContext('messageCurrentProfile()',s.context);
  await vm.runInContext("openChat('chee-reynaldo')",s.context);
  await vm.runInContext("openChatThread('chee-reynaldo')",s.context);
  assert.equal(s.requests.length,0);assert.equal(vm.runInContext('chatProfileId',s.context),null);
});
test('public profile actions wait for account identity and reject both self-match and self-message',async()=>{
  const publicSource=fs.readFileSync(path.join(__dirname,'../profile.js'),'utf8');
  let ready;const user={id:'account',profileId:own.id},requests=[],controls=[{}];
  const window={location:{},RizzumeAccount:{user:null,checkOptional:()=>new Promise(resolve=>{ready=()=>{window.RizzumeAccount.user=user;resolve(true);};})}};
  const context=vm.createContext({window,document:{querySelectorAll:()=>controls},id:own.id,available:true,saving:false,
    notify(){},async call(...args){requests.push(args);}});
  vm.runInContext(publicSource.slice(publicSource.indexOf('  const accountReady ='),publicSource.indexOf('  const sections =')),context);
  vm.runInContext(publicSource.slice(publicSource.indexOf('  window.likeProfile ='),publicSource.lastIndexOf('  if (id) {')),context);
  vm.runInContext(publicSource.slice(publicSource.indexOf('  async function openDirectMessage('),publicSource.indexOf('  function render(')),context);
  const pending=context.window.likeProfile();assert.equal(requests.length,0);ready();await pending;
  await context.openDirectMessage({preventDefault(){}});
  assert.equal(requests.length,0);assert.equal(controls[0].hidden,true);
  user.profileId=other.id;await context.window.likeProfile();assert.equal(requests.length,1);
});
