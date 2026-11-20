const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../connections.js'),'utf8');
const profile={id:'other',name:'Other Developer',role:'Backend engineer'};
const relation=(status='pending',direction='outgoing')=>({profile,status,direction,priority:false});
function setup(handler) {
  const requests=[],removed=[],celebrations=[],toasts=[],drawers=[],elements={refreshConnections:{},matchesDrawer:{}};
  const context=vm.createContext({console,Set,Map,JSON,Promise,encodeURIComponent,
    window:{RizzumeAccount:{user:{profileId:'self'}},location:{}},
    document:{getElementById:id=>elements[id]||null,querySelectorAll:()=>[],addEventListener(){}},
    PROFILES:[{id:'self'},profile],cardsState:[profile],matchedProfiles:[],isSwiping:false,chatOpen:false,
    isOwnProfile:id=>id==='self',renderDeck(){},updateMatchesUI(){},syncRemovedMatch:id=>removed.push(id),
    showToast:(...args)=>toasts.push(args),handleMatchSuccess:(...args)=>celebrations.push(args),
    toggleMatchesDrawer:show=>drawers.push(show),openProfileEditor:()=>{context.editorOpened=true;},
    apiCall:async(...args)=>{requests.push(args);return handler(...args);}});
  vm.runInContext(source,context);
  return {context,api:context.window.RizzumeConnections,requests,removed,celebrations,toasts,drawers};
}
test('sending a request waits for the server and never fabricates a match',async()=>{
  let complete;
  const {context,api,requests}=setup(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=api.send(profile,true);
  assert.equal(context.matchedProfiles.length,0);assert.equal(api.state(profile.id),undefined);
  const duplicate=await api.send(profile,true);assert.equal(duplicate,null);assert.equal(requests.length,1);
  complete({...relation(),priority:true});await pending;
  assert.equal(api.state(profile.id).status,'pending');assert.equal(context.matchedProfiles.length,0);
  assert.equal(api.discoverable(profile.id),false);
  assert.equal(requests[0][0],'/me/connection-requests/other');assert.equal(requests[0][2].priority,true);
});
test('crossed requests lead to review rather than an automatic match or another POST',async()=>{
  const {api,context,requests,drawers}=setup(()=>[relation('pending','incoming')]);
  await api.refresh();const result=await api.send(profile);
  assert.equal(result.direction,'incoming');assert.equal(context.matchedProfiles.length,0);
  assert.equal(requests.length,1);assert.equal(drawers.at(-1),true);
});
test('only a confirmed acceptance unlocks a connection and celebration',async()=>{
  const {api,context,celebrations}=setup(path=>path.endsWith('/action')?relation('accepted','incoming'):[relation('pending','incoming')]);
  await api.refresh();await api.action(profile.id,'accept');
  assert.equal(context.matchedProfiles[0].id,profile.id);assert.equal(celebrations.length,1);
});
test('a failed cancellation preserves the pending request and restores retry availability',async()=>{
  let attempts=0;
  const {api,context}=setup(path=>{if(path.endsWith('/action')) {attempts++;throw new Error('Offline');}return [relation()];});
  await api.refresh();await assert.rejects(api.action(profile.id,'cancel'),/Offline/);
  await assert.rejects(api.action(profile.id,'cancel'),/Offline/);
  assert.equal(attempts,2);assert.equal(api.state(profile.id).status,'pending');assert.equal(context.matchedProfiles.length,0);
});
test('a stale refresh cannot overwrite a request that completed after it started',async()=>{
  let complete;
  const {api}=setup(path=>path==='/me/connections'?new Promise(resolve=>{complete=resolve;}):relation());
  const refresh=api.refresh();await api.send(profile);complete([]);await refresh;
  assert.equal(api.state(profile.id).status,'pending');
});
test('remote removal closes local conversation access and restores the discovery card',async()=>{
  let remote=[relation('accepted')];
  const {api,context,removed}=setup(()=>remote);
  await api.refresh();assert.equal(context.matchedProfiles.length,1);assert.equal(context.cardsState.length,0);
  remote=[relation('removed')];await api.refresh();
  assert.equal(context.matchedProfiles.length,0);assert.deepEqual(removed,[profile.id]);
  assert.equal(context.cardsState[0].id,profile.id);assert.equal(api.discoverable(profile.id),true);
});
test('an account needs its own profile and can never request itself',async()=>{
  const {api,context,requests}=setup(()=>{throw new Error('Unexpected request');});
  await assert.rejects(api.send({id:'self'}),/yourself/);
  context.window.RizzumeAccount.user.profileId=null;
  assert.equal(await api.send(profile),null);assert.equal(context.editorOpened,true);assert.equal(requests.length,0);
});
