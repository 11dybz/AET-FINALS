const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../call-alerts.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({blocked=false}={}) {
  const timers=new Map(),listeners=new Map(),nodes=[],notifications=[],blockedStates=[];let next=0;
  const audio={state:blocked?'suspended':'running',currentTime:0,destination:{},
    async resume(){if(blocked)throw Error('Gesture required');this.state='running';},async close(){this.closed=true;},
    createOscillator(){const node={frequency:{},connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};nodes.push(node);return node;},
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}};
  function Notification(title,options){this.title=title;this.options=options;this.close=()=>{this.closed=true;};notifications.push(this);}
  Notification.permission='granted';
  const context=vm.createContext({window:{AudioContext:function(){return audio;},Notification,focus(){},addEventListener(){},removeEventListener(){}},
    document:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    setTimeout(fn,delay){timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id),Date});
  vm.runInContext(source,context);
  const alert=new context.window.RizzumeCallAlert({onBlocked:value=>blockedStates.push(value)});
  const call={id:'incoming-1',createdAt:new Date().toISOString()};
  return {alert,audio,nodes,notifications,blockedStates,timers,listeners,call};
}
test('incoming calls ring repeatedly and send only one desktop alert per invitation',()=>{
  const s=setup();s.alert.start(s.call,{name:'Ada',desktop:true});
  assert.equal(s.nodes.length,2);assert.equal(s.notifications.length,1);
  assert.match(s.notifications[0].options.body,/Ada is calling/);
  s.alert.start(s.call,{desktop:true});assert.equal(s.nodes.length,2);assert.equal(s.notifications.length,1);
  [...s.timers.values()].find(timer=>timer.delay===3000).fn();assert.equal(s.nodes.length,4);
  s.alert.stop();assert.ok(s.nodes.every(node=>node.stopped));assert.equal(s.timers.size,0);assert.equal(s.notifications[0].closed,true);
});
test('autoplay denial exposes sound activation without losing the call notification',async()=>{
  const s=setup({blocked:true});s.alert.start(s.call,{desktop:true});await tick();
  assert.equal(s.blockedStates.at(-1),true);assert.equal(s.nodes.length,0);assert.equal(s.notifications.length,1);
  s.audio.state='running';s.alert.unlock();
  [...s.timers.values()].find(timer=>timer.delay===3000).fn();assert.equal(s.nodes.length,2);s.alert.stop();
});
test('expiry silences ringing and closes the desktop notification',()=>{
  const s=setup();s.alert.start(s.call,{desktop:true});
  [...s.timers.values()].find(timer=>timer.delay!==3000).fn();
  assert.equal(s.alert.current,null);assert.equal(s.notifications[0].closed,true);assert.equal(s.timers.size,0);
  s.alert.start({...s.call,id:'old',createdAt:new Date(Date.now()-100000).toISOString()},{desktop:true});
  assert.equal(s.alert.current,null);assert.equal(s.notifications.length,1);
});
test('stopping during audio unlock cannot restart the ringtone',async()=>{
  const s=setup({blocked:true});let resume;
  s.audio.resume=()=>new Promise(resolve=>{resume=()=>{s.audio.state='running';resolve();};});
  s.alert.start(s.call);s.alert.stop();resume();await tick();
  assert.equal(s.nodes.length,0);assert.equal(s.timers.size,0);
});
test('disposing removes gesture listeners and releases the audio context',async()=>{
  const s=setup();s.alert.start(s.call);s.alert.dispose();await tick();
  assert.equal(s.listeners.size,0);assert.equal(s.audio.closed,true);assert.equal(s.timers.size,0);
});

test('call history uses distinct events, duration, direction and message deduplication',async()=>{
  const messagesSource=fs.readFileSync(path.join(__dirname,'../messages.js'),'utf8');
  const poll=messagesSource.slice(messagesSource.indexOf('async function pollChatMessages('),messagesSource.indexOf('function scrollChatToBottom('));
  const elements=new Map();
  function element(){return {children:[],dataset:{},classList:{add(){},remove(){},toggle(){}},append(...children){this.children.push(...children);},
    appendChild(child){this.children.push(child);},querySelector(selector){return this.children.find(child=>'[data-message-id="'+child.dataset?.messageId+'"]'===selector);}};}
  const list=[{id:1,sender:'visitor',body:'Call ended',createdAt:new Date().toISOString(),call:{state:'ended',durationSeconds:65}},
    {id:2,sender:'member',body:'Missed call',createdAt:new Date().toISOString(),call:{state:'missed',durationSeconds:null}},
    {id:3,sender:'member',body:'Call declined',createdAt:new Date().toISOString(),call:{state:'declined'}}];
  const context=vm.createContext({chatOpen:true,chatProfileId:'ada',chatProfileName:'Ada',chatGeneration:1,chatPolls:new Set(),chatAfterId:0,chatThreadReady:true,
    document:{hidden:false,createElement:element},window:{},chatElement:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    apiCall:async path=>path.includes('/read')?null:list,scrollChatToBottom(){},loadConversations(){},syncChatComposer(){},
    setChatThreadState(){throw Error('Unexpected thread failure');}});
  vm.runInContext(poll,context);await context.pollChatMessages(true);await context.pollChatMessages();
  const events=elements.get('messageLog').children.filter(child=>child.className==='ms-call-event');
  assert.equal(events.length,3);assert.equal(events[0].children[0].textContent,'Outgoing call · Call ended · 1:05');
  assert.equal(events[1].children[0].textContent,'Incoming call · Missed call');assert.equal(events[2].children[0].textContent,'Incoming call · Call declined');
  assert.equal(context.chatAfterId,3);
});
