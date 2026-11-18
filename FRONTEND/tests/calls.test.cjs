const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(options = {}) {
  const elements = new Map(), requests = [], timers = new Map(); let nextTimer = 0;
  const tracks = ['audio','video'].map(kind => ({kind, enabled:true, stopped:false, stop() {this.stopped=true;}}));
  const stream = {getTracks:() => tracks};
  const peer = {closed:false, added:[], remoteDescription:null, localDescription:null, addTrack() {}, close() {this.closed=true;},
    async createOffer() {return {type:'offer',sdp:'v=0\r\n'};}, async createAnswer() {return {type:'answer',sdp:'v=0\r\nanswer'};},
    async setLocalDescription(value) {this.localDescription=value;}, async setRemoteDescription(value) {this.remoteDescription=value;},
    async addIceCandidate(value) {this.added.push(value);}};
  function element() {return {textContent:'', hidden:false, disabled:false, srcObject:null, attrs:{}, setAttribute(k,v) {this.attrs[k]=v;}, async play() {}};}
  const context = vm.createContext({
    window:{isSecureContext: options.secure !== false, RTCPeerConnection:true, addEventListener() {},
      RizzumeUI:{icon:() => '', toast() {}, dialog(id, html, onClose) {return {el:{querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector,element()); return elements.get(selector);
      }}, open() {}, close() {onClose();}};}}},
    navigator:{mediaDevices:{getUserMedia:options.media || (async () => stream)}},
    RTCPeerConnection:function() {return peer;},
    setTimeout(fn) {timers.set(++nextTimer,fn);return nextTimer;}, clearTimeout(id) {timers.delete(id);},
    MediaStream: function() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../calls.js'),'utf8'),context);
  let call = {id:'call-a',profileId:'ada',state:'ringing',offer:'v=0\r\n',answer:null,signals:[]};
  async function request(url, method='GET', body) {
    requests.push({url,method,body}); if (options.request) return options.request(url,method,body);
    if (url.endsWith('call-config')) return {iceServers:[],relayConfigured:true};
    if (url === '/me/calls' && method === 'POST') return {...call};
    if (url.endsWith('/action')) {call.state = body.action === 'accept' ? 'accepted' : 'ended';return {...call};}
    return {...call};
  }
  const room = new context.window.RizzumeVideoRoom({request,team:!!options.team});
  return {room, elements, requests, peer, tracks, timers, stream, setCall(value) {call={...call,...value};}};
}

test('call starts with an offer and releases all devices on hangup', async () => {
  const s=setup(); await s.room.start('ada','Ada'); await tick();
  assert.equal(s.room.busy,true); assert.equal(s.requests.find(r=>r.url==='/me/calls').body.offer,'v=0\r\n');
  s.room.hangup(); await tick();
  assert.equal(s.room.busy,false); assert.ok(s.tracks.every(t=>t.stopped)); assert.equal(s.peer.closed,true);
  assert.equal(s.elements.get('#localVideo').srcObject,null);
  assert.ok(s.requests.some(r=>r.url==='/me/calls/call-a/action' && r.body.action==='end'));
});

test('camera permission denial never creates a remote call', async () => {
  const s=setup({media:async()=>{throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});}});
  await s.room.start('ada','Ada');
  assert.equal(s.room.busy,false); assert.equal(s.requests.some(r=>r.url==='/me/calls'),false);
  assert.match(s.elements.get('#callError').textContent,/permission was denied/);
});

test('closing during camera permission stops a late stream', async () => {
  let finish; const s=setup({media:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=s.room.start('ada','Ada'); await tick(); s.room.hangup(); finish(s.stream); await pending;
  assert.ok(s.tracks.every(t=>t.stopped)); assert.equal(s.requests.some(r=>r.url==='/me/calls'),false);
});

test('a call created after cancellation is immediately ended on the server', async () => {
  let finish; const s=setup({request:async(url,method)=> {
    if (url.endsWith('call-config')) return {iceServers:[],relayConfigured:true};
    if (url==='/me/calls' && method==='POST') return new Promise(resolve=>{finish=resolve;});
    return {};
  }});
  const pending=s.room.start('ada','Ada'); await tick(); s.room.hangup(); finish({id:'late'}); await pending;
  assert.ok(s.requests.some(r=>r.url==='/me/calls/late/action' && r.body.action==='end'));
});

test('remote ICE waits for an answer and is applied only once', async () => {
  const s=setup(); await s.room.start('ada','Ada'); await tick();
  const r=s.room.run; s.setCall({signals:[{id:1,payload:'{"candidate":"candidate:test"}'}]});
  await s.room.poll(r); assert.equal(s.peer.added.length,0);
  s.setCall({state:'accepted',answer:'v=0\r\nanswer'}); await s.room.poll(r); await s.room.poll(r);
  assert.equal(s.peer.added.length,1); assert.equal(s.peer.remoteDescription.type,'answer'); s.room.hangup();
});

test('declined calls stop media and do not continue polling', async () => {
  const s=setup(); await s.room.start('ada','Ada'); await tick();
  s.setCall({state:'declined'}); await s.room.poll(s.room.run);
  assert.equal(s.room.busy,false); assert.ok(s.tracks.every(t=>t.stopped));
  assert.match(s.elements.get('#callStatus').textContent,/declined/);
});

test('team acceptance exchanges the correct answer through team routes', async () => {
  const s=setup({team:true}); await s.room.accept('call-a','Visitor'); await tick();
  const action=s.requests.find(r=>r.url==='/team/calls/call-a/action');
  assert.equal(action.body.action,'accept'); assert.equal(action.body.answer,'v=0\r\nanswer');
  assert.equal(s.peer.remoteDescription.type,'offer'); s.room.hangup();
});

test('microphone and camera controls toggle only their own tracks', async () => {
  const s=setup(); await s.room.start('ada','Ada');
  s.room.toggle('audio'); assert.equal(s.tracks[0].enabled,false); assert.equal(s.tracks[1].enabled,true);
  s.room.toggle('video'); assert.equal(s.tracks[1].enabled,false); s.room.toggle('audio');
  assert.equal(s.tracks[0].enabled,true); s.room.hangup();
});

test('an insecure context explains the requirement before using devices', async () => {
  const s=setup({secure:false}); await s.room.start('ada','Ada');
  assert.equal(s.requests.length,0); assert.equal(s.room.busy,false);
  assert.match(s.elements.get('#callError').textContent,/HTTPS or localhost/);
});

test('disabled team calling never requests camera access', async () => {
  let accessed=false;
  const s=setup({media:async()=>{accessed=true;throw new Error('Unexpected device access');},
    request:async()=>({callingEnabled:false,iceServers:[]})});
  await s.room.start('ada','Ada'); assert.equal(accessed,false); assert.equal(s.room.busy,false);
  assert.match(s.elements.get('#callError').textContent,/not configured/);
});

test('repeated signaling failures release the camera and end the server call', async () => {
  let fails=false; const s=setup({request:async(url,method)=>{
    if (url.endsWith('call-config')) return {iceServers:[],relayConfigured:true};
    if (url==='/me/calls') return {id:'a'};
    if (fails && method==='GET') throw new Error('Offline');
    return {state:'ringing',signals:[]};
  }});
  await s.room.start('ada','Ada'); await tick(); const r=s.room.run; fails=true;
  await s.room.poll(r); await s.room.poll(r); await s.room.poll(r);
  assert.equal(s.room.busy,false); assert.ok(s.tracks.every(t=>t.stopped));
});
