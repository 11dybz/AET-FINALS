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
  const peer = {closed:false, added:[], remoteDescription:null, localDescription:null, addTrack(track) {return track.kind==='video' ? options.videoSender : options.audioSender;}, addTransceiver(){return {sender:options.videoSender};}, close() {this.closed=true;},
    async createOffer() {return {type:'offer',sdp:'v=0\r\n'};}, async createAnswer() {return {type:'answer',sdp:'v=0\r\nanswer'};},
    async setLocalDescription(value) {this.localDescription=value;}, async setRemoteDescription(value) {this.remoteDescription=value;},
    async addIceCandidate(value) {this.added.push(value);}};
  function element() {return {textContent:'', hidden:false, disabled:false, srcObject:null, attrs:{},dataset:{},children:[],setAttribute(k,v) {this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);},async play() {}};}
  const context = vm.createContext({
    window:{isSecureContext: options.secure !== false, RTCPeerConnection:true, RizzumeVideoFilters:options.filters, addEventListener() {},
      RizzumeUI:{icon:() => '', toast() {}, dialog(id, html, onClose) {return {el:{querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector,element()); return elements.get(selector);
      },querySelectorAll:()=>[]}, open() {}, close() {onClose();}};}}},
    navigator:{mediaDevices:{getUserMedia:options.media || (async () => stream),enumerateDevices:options.enumerate}},
    document:{createElement:()=>element(),addEventListener(){},removeEventListener(){}},
    RTCPeerConnection:function() {return peer;},
    setTimeout(fn) {timers.set(++nextTimer,fn);return nextTimer;}, clearTimeout(id) {timers.delete(id);},
    MediaStream: function(tracks=[]) {this.getTracks=()=>tracks;this.getVideoTracks=()=>tracks.filter(t=>t.kind==='video');this.getAudioTracks=()=>tracks.filter(t=>t.kind==='audio');this.addTrack=track=>tracks.push(track);},
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
  return {room, elements, requests, peer, tracks, timers, stream,context,setCall(value) {call={...call,...value};}};
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

function filtersFixture(options={}) {
  const replacements=[],created=[];
  class Filters {
    static filters=[{id:'none'},{id:'puppy'},{id:'wasted'}];
    static supported=()=>true;
    constructor(source,callbacks){this.source=source;this.callbacks=callbacks;this.track={kind:'video',enabled:true,stopped:false};this.stream={getVideoTracks:()=>[this.track]};created.push(this);}
    async start(){if(options.start)await options.start();return this;}
    select(id){this.id=id;this.callbacks.onStatus(id+' is visible to the other person.');}
    setEnabled(value){this.track.enabled=value;}
    stop(){this.stopped=true;this.track.stopped=true;}
  }
  const sender={async replaceTrack(track){if(options.replace)await options.replace(track);replacements.push(track);}};
  return {...setup({filters:Filters,videoSender:sender}),replacements,created};
}

test('filters replace the outgoing video track and reset restores the original camera without ending audio',async()=>{
  const s=filtersFixture();await s.room.start('ada','Ada');
  assert.equal(s.elements.get('#callFilters').disabled,false);
  assert.equal(await s.room.selectFilter('puppy'),true);
  assert.equal(s.replacements[0],s.created[0].track);
  assert.equal(s.elements.get('#localVideo').srcObject,s.created[0].stream);
  assert.equal(s.tracks[0].enabled,true);assert.equal(s.tracks[0].stopped,false);
  assert.equal(await s.room.selectFilter('wasted'),true);
  assert.equal(s.created.length,1);assert.equal(s.created[0].id,'wasted');
  assert.equal(await s.room.selectFilter('none'),true);
  assert.equal(s.replacements.at(-1),s.tracks[1]);assert.equal(s.created[0].stopped,true);
  assert.equal(s.tracks[1].stopped,false);assert.equal(s.elements.get('#localVideo').srcObject,s.stream);
  s.room.hangup();
});

test('camera mute disables both original and filtered video, and hangup stops the filter output',async()=>{
  const s=filtersFixture();await s.room.start('ada','Ada');await s.room.selectFilter('puppy');
  s.room.toggle('video');assert.equal(s.tracks[1].enabled,false);assert.equal(s.created[0].track.enabled,false);
  assert.equal(s.tracks[0].enabled,true);
  s.room.toggle('video');assert.equal(s.created[0].track.enabled,true);
  s.room.hangup();assert.equal(s.created[0].stopped,true);assert.ok(s.tracks.every(t=>t.stopped));
});

test('hanging up while a filter starts cannot attach a late track or reopen the preview',async()=>{
  let finish;const s=filtersFixture({start:()=>new Promise(resolve=>{finish=resolve;})});
  await s.room.start('ada','Ada');const pending=s.room.selectFilter('puppy');
  assert.equal(await s.room.selectFilter('wasted'),false);
  s.room.hangup();finish();assert.equal(await pending,false);
  assert.equal(s.created[0].stopped,true);assert.equal(s.replacements.length,0);
  assert.equal(s.elements.get('#localVideo').srcObject,null);
});

test('a rejected filtered track restores the raw camera and leaves the call connected',async()=>{
  const s=filtersFixture({replace:track=>{if(!track.stop)throw new Error('Encoding limit');}});
  await s.room.start('ada','Ada');assert.equal(await s.room.selectFilter('puppy'),false);
  assert.equal(s.room.busy,true);assert.equal(s.created[0].stopped,true);
  assert.equal(s.replacements.at(-1),s.tracks[1]);assert.match(s.elements.get('#callFilterStatus').textContent,/restored/);
  s.room.hangup();
});

function deviceTrack(kind,id){return {kind,enabled:true,readyState:'live',stopped:false,getSettings:()=>({deviceId:id}),stop(){this.stopped=true;this.readyState='ended';}};}
function mediaStream(...tracks){return {getTracks:()=>tracks,getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),getAudioTracks:()=>tracks.filter(t=>t.kind==='audio')};}
test('voice calling requests no camera and can turn on video without a second offer',async()=>{
  const audio=deviceTrack('audio','mic'),camera=deviceTrack('video','cam'),constraints=[],replaced=[];
  const s=setup({videoSender:{async replaceTrack(track){replaced.push(track);}},media:async value=>{constraints.push(value);return value.audio?mediaStream(audio):mediaStream(camera);}});
  await s.room.start('ada','Ada',{video:false});assert.equal(constraints[0].video,false);
  assert.equal(s.elements.get('#callCamera').attrs['aria-label'],'Turn camera on');assert.equal(s.elements.get('#callLocalOff').hidden,false);
  await s.room.toggle('video');assert.equal(replaced.at(-1),camera);assert.equal(s.elements.get('#callLocalOff').hidden,true);
  assert.equal(s.requests.filter(r=>r.url==='/me/calls'&&r.method==='POST').length,1);assert.equal(audio.stopped,false);s.room.hangup();
});
test('microphone switching preserves mute and leaves the camera running',async()=>{
  const audio=deviceTrack('audio','old'),camera=deviceTrack('video','cam'),next=deviceTrack('audio','new'),replaced=[];let first=true;
  const s=setup({audioSender:{async replaceTrack(track){replaced.push(track);}},media:async()=>{if(first){first=false;return mediaStream(audio,camera);}return mediaStream(next);}});
  await s.room.start('ada','Ada');s.room.toggle('audio');assert.equal(await s.room.switchDevice('audio','new'),true);
  assert.equal(replaced[0],next);assert.equal(next.enabled,false);assert.equal(audio.stopped,true);assert.equal(camera.stopped,false);
  assert.equal(s.elements.get('#callMic').attrs['aria-label'],'Unmute microphone');s.room.hangup();
});
test('a failed device replacement keeps the old device and releases the acquired one',async()=>{
  const audio=deviceTrack('audio','old'),camera=deviceTrack('video','cam'),next=deviceTrack('video','new');let first=true;
  const s=setup({videoSender:{async replaceTrack(){throw Error('Busy');}},media:async()=>{if(first){first=false;return mediaStream(audio,camera);}return mediaStream(next);}});
  await s.room.start('ada','Ada');assert.equal(await s.room.switchDevice('video','new'),false);
  assert.equal(camera.stopped,false);assert.equal(next.stopped,true);assert.equal(s.room.run.stream.getVideoTracks()[0],camera);s.room.hangup();
});
test('device changes block duplicates and release late tracks after hangup',async()=>{
  const audio=deviceTrack('audio','mic'),camera=deviceTrack('video','cam'),next=deviceTrack('video','next'),replaced=[];let first=true,finish;
  const s=setup({videoSender:{async replaceTrack(track){replaced.push(track);}},media:async()=>{if(first){first=false;return mediaStream(audio,camera);}return new Promise(resolve=>{finish=resolve;});}});
  await s.room.start('ada','Ada');const pending=s.room.switchDevice('video','next');assert.equal(await s.room.switchDevice('video','other'),false);
  s.room.hangup();finish(mediaStream(next));assert.equal(await pending,false);assert.equal(next.stopped,true);assert.equal(replaced.length,0);
});
test('speaker mute is local playback only and updates its control label',async()=>{
  const s=setup();await s.room.start('ada','Ada');s.room.toggleSpeaker();
  assert.equal(s.elements.get('#remoteVideo').muted,true);assert.equal(s.elements.get('#callSpeaker').attrs['aria-label'],'Unmute speaker');
  assert.ok(s.tracks.every(track=>track.enabled));s.room.toggleSpeaker();assert.equal(s.elements.get('#remoteVideo').muted,false);s.room.hangup();
});
test('device enumeration uses current selections and speaker changes retain errors',async()=>{
  const audio=deviceTrack('audio','mic-a'),camera=deviceTrack('video','cam-a');
  const s=setup({media:async()=>mediaStream(audio,camera),enumerate:async()=>[{kind:'audioinput',deviceId:'mic-a',label:'USB microphone'},{kind:'videoinput',deviceId:'cam-a',label:'Webcam'}]});
  await s.room.start('ada','Ada');await s.room.openDevices();assert.equal(s.elements.get('#callMicrophoneDevice').value,'mic-a');assert.equal(s.elements.get('#callCameraDevice').children.length,2);
  s.elements.get('#remoteVideo').setSinkId=async()=>{throw Error('Denied');};s.elements.get('#remoteVideo').sinkId='previous';
  assert.equal(await s.room.switchSpeaker('another'),false);assert.equal(s.elements.get('#callSpeakerDevice').value,'previous');s.room.hangup();
});
test('a missing camera falls back to audio without blocking the call',async()=>{
  const audio=deviceTrack('audio','mic');let requested=0;
  const s=setup({videoSender:{async replaceTrack(){}},media:async constraints=>{requested++;if(constraints.video)throw Object.assign(Error('No webcam'),{name:'NotFoundError'});return mediaStream(audio);}});
  await s.room.start('ada','Ada');assert.equal(s.room.busy,true);assert.equal(requested,2);assert.match(s.elements.get('#callError').textContent,/voice call/);s.room.hangup();
});
test('the connected timer starts once and is cleared on hangup',async()=>{
  const s=setup();await s.room.start('ada','Ada');const r=s.room.run;s.room.startDuration(r);const timer=r.durationTimer;
  s.room.startDuration(r);assert.equal(r.durationTimer,timer);assert.equal(s.elements.get('#callDuration').hidden,false);
  s.room.hangup();assert.equal(s.timers.has(timer),false);
});
test('fullscreen toggles the call modal and updates its accessible state',async()=>{
  const s=setup();await s.room.start('ada','Ada');const document=s.context.document;
  s.room.modal.el.requestFullscreen=async()=>{document.fullscreenElement=s.room.modal.el;};document.exitFullscreen=async()=>{document.fullscreenElement=null;};
  await s.room.toggleFullscreen();s.room.fullscreenListener();assert.equal(document.fullscreenElement,s.room.modal.el);assert.equal(s.elements.get('#callFullscreen').attrs['aria-label'],'Exit fullscreen');
  await s.room.toggleFullscreen();s.room.fullscreenListener();assert.equal(document.fullscreenElement,null);assert.equal(s.elements.get('#callFullscreen').attrs['aria-label'],'Enter fullscreen');s.room.hangup();
});
test('media state messages reflect camera and microphone controls and update peer indicators',async()=>{
  const s=setup(),sent=[];await s.room.start('ada','Ada');
  const channel={readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){this.closed=true;}};
  s.room.bindMediaState(s.room.run,channel);channel.onopen();s.room.toggle('video');s.room.toggle('audio');
  assert.deepEqual(sent.at(-1),{camera:false,microphone:false});
  channel.onmessage({data:'{"camera":false,"microphone":false}'});assert.equal(s.elements.get('#callPlaceholder').hidden,false);assert.equal(s.elements.get('#callRemoteMuted').hidden,false);
  channel.onmessage({data:'{"camera":true,"microphone":true}'});assert.equal(s.elements.get('#callRemoteMuted').hidden,true);
  channel.onmessage({data:'<script>bad</script>'});assert.equal(s.room.busy,true);s.room.hangup();assert.equal(channel.closed,true);
});

test('Snap lenses replace outgoing video, preserve mute, and switch back to custom filters',async()=>{
 const s=filtersFixture();const snap=[];
 class Snap {
  constructor(source,callbacks){this.source=source;this.provider='snap';this.callbacks=callbacks;this.track={kind:'video',enabled:true};this.stream={getVideoTracks:()=>[this.track]};snap.push(this);}
  async start(){} async select(lens){this.lens=lens;} setEnabled(value){this.track.enabled=value;} stop(){this.stopped=true;}
 }
 s.context.window.RizzumeSnapFilters=Snap;await s.room.start('ada','Ada');s.room.run.snapLenses=[{id:'lens',name:'Hair Color'}];
 await s.room.selectFilter('puppy');assert.equal(await s.room.selectFilter('snap:0'),true);assert.equal(s.created[0].stopped,true);assert.equal(s.replacements.at(-1),snap[0].track);
 assert.equal(await s.room.selectFilter('snap:0'),true);assert.equal(snap.length,1);
 assert.equal(s.elements.get('#callFilterStrength').disabled,true);s.room.toggle('video');assert.equal(snap[0].track.enabled,false);assert.equal(s.tracks[0].enabled,true);
 s.room.toggle('video');assert.equal(await s.room.selectFilter('wasted'),true);assert.equal(snap[0].stopped,true);assert.equal(s.room.run.filters,s.created[1]);s.room.hangup();
});

test('hanging up during Snap startup stops its pending session without attaching it',async()=>{
 const s=filtersFixture();let finish,stopped=false;
 s.context.window.RizzumeSnapFilters=class{constructor(){this.provider='snap';}start(){return new Promise(resolve=>finish=resolve);}stop(){stopped=true;}};
 await s.room.start('ada','Ada');s.room.run.snapLenses=[{id:'lens'}];const pending=s.room.selectFilter('snap:0');s.room.hangup();assert.equal(stopped,true);finish();assert.equal(await pending,false);assert.equal(s.replacements.length,0);
});

test('Snap lens metadata is displayed as text and a failed load is retryable',async()=>{
 const s=filtersFixture();let fail=true;
 s.context.window.RizzumeSnapFilters={loadLenses:async()=>{if(fail)throw Error('network');return [{id:'<unsafe>',name:'<img onerror=alert(1)>',iconUrl:'javascript:alert(1)'}];}};
 await s.room.start('ada','Ada');await s.room.loadSnapLenses();assert.equal(s.elements.get('#callSnapLoad').disabled,false);assert.match(s.elements.get('#callSnapStatus').textContent,/could not load/);
 fail=false;await s.room.loadSnapLenses();const button=s.elements.get('#callSnapOptions').children[0];assert.equal(button.children.length,1);assert.equal(button.children[0].textContent,'<img onerror=alert(1)>');assert.equal(button.dataset.callFilter,'snap:0');s.room.hangup();
});
