const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const elements = new Map(), timers = new Map(), requests = [];
  let now = 0, timerId = 0, positionCallback, errorCallback, respond;
  function element() {
    return {children:[],dataset:{},textContent:'',hidden:false,disabled:false,value:'',isConnected:true,
      append(...children){this.children.push(...children);},appendChild(child){this.children.push(child);},
      replaceChildren(...children){this.children=children;},setAttribute(){},focus(){}};
  }
  function get(id) { if (!elements.has(id)) elements.set(id,element()); return elements.get(id); }
  const context = vm.createContext({
    window:{RizzumeUI:{icon:()=>'',toast:()=>{},dialog(id,html,onClose,options){return {el:{hidden:true},open(){this.el.hidden=false;},close(){if(options.canClose()){this.el.hidden=true;onClose();}}};}},addEventListener(){}},
    document:{getElementById:get,createElement:element},
    performance:{now:()=>now}, navigator:{geolocation:{getCurrentPosition(success,error){positionCallback=success;errorCallback=error;}}},
    chatOpen:true,chatProfileId:'bob',chatProfileName:'Bob',chatThreadReady:true,chatGeneration:1,
    apiCall:async(url,method,body)=>{requests.push({url,method,body});return respond?.(url,method,body);},pollChatMessages:async()=>{},
    setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../chat-location.js'),'utf8'),context);
  const message=(id=1,state='active',sender='visitor')=>({id,sender,location:{state,latitude:14.6,longitude:120.984,name:'Campus',serverNow:'2026-11-20T00:00:00Z',expiresAt:'2026-11-20T00:15:00Z'}});
  return {context,api:context.window.RizzumeLocations,get,element,requests,message,timers,
    advance(ms){now+=ms;[...timers.values()].forEach(fn=>fn());},
    position(){positionCallback({coords:{latitude:14.599512,longitude:120.984223}});},
    denied(){errorCallback({code:1});},respond(fn){respond=fn;}};
}
function all(node){return [node,...(node.children||[]).flatMap(all)];}

test('location card contains a named map, directions and a sender-only stop control',()=>{
  const s=setup(), container=s.element();s.api.render(container,s.message(),'bob');
  assert.ok(all(container).some(el=>el.title==='Shared location: Campus'));
  const directions=all(container).find(el=>el.textContent==='Open directions');
  assert.equal(new URL(directions.href).searchParams.get('destination'),'14.6,120.984');
  assert.equal(directions.rel,'noopener noreferrer');
  assert.ok(all(container).some(el=>el.textContent==='Stop sharing'));
  assert.ok(all(container).some(el=>el.textContent==='15:00 remaining'));
  const incoming=s.element();s.api.render(incoming,s.message(2,'active','member'),'bob');
  assert.equal(all(incoming).some(el=>el.textContent==='Stop sharing'),false);
});

test('countdown removes the iframe, place name and directions at expiry without another request',()=>{
  const s=setup(),container=s.element();s.api.render(container,s.message(),'bob');
  s.advance(1000);assert.ok(all(container).some(el=>el.textContent==='14:59 remaining'));
  s.advance(899000);
  assert.ok(all(container).some(el=>el.textContent==='Location sharing expired'));
  assert.equal(all(container).some(el=>el.src||el.href||el.textContent==='Campus'),false);
  assert.equal(s.requests.length,0);
});

test('stop sharing persists to the originating thread and replaces the card',async()=>{
  const s=setup(),container=s.element();s.api.render(container,s.message(),'bob');
  s.respond(()=>s.message(1,'stopped'));
  await all(container).find(el=>el.textContent==='Stop sharing').onclick();
  assert.equal(s.requests[0].url,'/me/conversations/bob/locations/1/stop');
  assert.ok(all(container).some(el=>el.textContent==='Location sharing stopped'));
  assert.equal(all(container).some(el=>el.src||el.href),false);
});

test('polling applies a remote stop and ignores a response after switching threads',async()=>{
  const s=setup(),container=s.element();s.api.render(container,s.message(),'bob');
  s.respond(()=>[s.message(1,'stopped')]);await s.api.refresh('bob',1);
  assert.ok(all(container).some(el=>el.textContent==='Location sharing stopped'));
  const next=s.element();s.api.render(next,s.message(2),'bob');
  let finish;s.respond(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=s.api.refresh('bob',1);s.context.chatGeneration=2;s.context.chatProfileId='alice';
  finish([s.message(2,'stopped')]);await pending;
  assert.ok(all(next).some(el=>el.textContent==='Open directions'));
});

test('permission denial stays retryable, and a late position cannot enable a closed picker',()=>{
  const s=setup();s.api.open();s.get('chatLocate').onclick();s.denied();
  assert.equal(s.get('chatShareLocation').disabled,true);assert.match(s.get('chatLocationStatus').textContent,/denied/);
  assert.equal(s.get('chatLocate').disabled,false);
  s.get('chatLocate').onclick();s.api.reset();s.position();
  assert.equal(s.get('chatShareLocation').disabled,true);
});

test('a delayed active response cannot restore a stopped location',async()=>{
  const s=setup(),container=s.element();s.api.render(container,s.message(),'bob');
  let finish;s.respond((url)=>url.endsWith('/stop')?s.message(1,'stopped'):new Promise(resolve=>{finish=resolve;}));
  const refresh=s.api.refresh('bob',1);
  await all(container).find(el=>el.textContent==='Stop sharing').onclick();
  finish([s.message()]);await refresh;
  assert.ok(all(container).some(el=>el.textContent==='Location sharing stopped'));
  assert.equal(all(container).some(el=>el.src||el.href),false);
});

test('sharing rounds coordinates, supports one hour and targets the selected chat',async()=>{
  const s=setup();s.api.open();s.get('chatLocate').onclick();s.position();
  s.get('chatLocationName').value='Near campus';s.get('chatLocationDuration').value='60';
  s.respond(()=>s.message());await s.get('chatShareLocation').onclick();
  assert.equal(s.requests[0].url,'/me/conversations/bob/locations');
  assert.deepEqual(JSON.parse(JSON.stringify(s.requests[0].body)),{latitude:14.6,longitude:120.984,name:'Near campus',minutes:60});
  assert.equal(s.api.valid(NaN,121),false);assert.equal(s.api.valid(91,121),false);assert.equal(s.api.valid(14,181),false);
});

test('sidebar omits Location and Notifications while preserving the header bell',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../experience.js'),'utf8');
  const sidebar=source.slice(source.indexOf('<aside class="rz-sidebar"'),source.indexOf('</aside>'));
  assert.doesNotMatch(sidebar,/data-nav="(?:location|notifications)"/);
  assert.match(source,/id="topNotifications"/);
});
