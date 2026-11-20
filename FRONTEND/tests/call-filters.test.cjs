const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../call-filters.js'),'utf8');
function setup(){
  const draws=[],timers=new Map(),statuses=[];let nextId=0;
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get(target,key){if(key in target)return target[key];return (...args)=>draws.push([key,...args]);},set(target,key,value){target[key]=value;draws.push(['set',key,value]);return true;}});
  const camera={kind:'video',enabled:true,getSettings:()=>({width:1280,height:720})},audio={kind:'audio',enabled:true};
  const track={kind:'video',enabled:true,stopped:false,stop(){this.stopped=true;}};
  const output={getVideoTracks:()=>[track],getTracks:()=>[track]};
  const video={readyState:4,currentTime:1,async play(){},pause(){this.paused=true;}};
  const canvas={width:0,height:0,getContext:()=>ctx,captureStream:()=>output};
  const context=vm.createContext({window:{},document:{createElement:tag=>tag==='canvas'?canvas:video},
    MediaStream:function(tracks){this.getVideoTracks=()=>tracks.filter(t=>t.kind==='video');this.getAudioTracks=()=>tracks.filter(t=>t.kind==='audio');},
    performance:{now:()=>100},setTimeout(fn){timers.set(++nextId,fn);return nextId;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(source,context);
  const pipeline=new context.window.RizzumeVideoFilters({getVideoTracks:()=>[camera],getAudioTracks:()=>[audio]}, {onStatus:text=>statuses.push(text)});
  return {pipeline,canvas,ctx,draws,camera,audio,track,timers,statuses,video,Filters:context.window.RizzumeVideoFilters};
}
test('the captured stream preserves the original microphone and caps processing resolution',async()=>{
  const s=setup();await s.pipeline.start();
  assert.equal(s.pipeline.stream.getAudioTracks()[0],s.audio);assert.equal(s.pipeline.stream.getVideoTracks()[0],s.track);
  assert.equal(s.canvas.width,1280);assert.equal(s.canvas.height,720);s.pipeline.stop();
});
test('every advertised look, face lens, and meme draws into the outgoing canvas',()=>{
  const s=setup();s.pipeline.tracking='ready';s.pipeline.face={x:640,y:288,size:380,angle:0,mouth:.1};
  for(const filter of s.Filters.filters){s.draws.length=0;s.pipeline.select(filter.id);
    assert.ok(s.draws.some(d=>d[0]==='drawImage'),filter.id+' draws camera');
    if(filter.face)assert.ok(s.draws.some(d=>d[0]==='translate'),filter.id+' draws the lens');
    if(['fried','wasted','thug','fine','news','brain'].includes(filter.id))assert.ok(s.draws.some(d=>d[0]==='fillText'),filter.id+' draws meme caption');
    if(['mono','sepia','glow','cyber','fried'].includes(filter.id))assert.ok(s.draws.some(d=>d[0]==='set'&&d[1]==='filter'&&d[2]!=='none'),filter.id+' applies look');
  }s.pipeline.stop();
});
test('camera off clears the frame and draws no face, camera image, or meme',()=>{
  const s=setup();s.pipeline.tracking='unavailable';s.pipeline.select('thug');
  s.draws.length=0;s.camera.enabled=false;s.pipeline.setEnabled(false);
  assert.equal(s.track.enabled,false);assert.ok(s.draws.some(d=>d[0]==='fillRect'));
  assert.equal(s.draws.some(d=>['drawImage','fillText','translate'].includes(d[0])),false);
  s.camera.enabled=true;s.pipeline.setEnabled(true);assert.equal(s.track.enabled,true);s.pipeline.stop();
});
test('face lenses use detected geometry and clear overlays when a face leaves the camera',()=>{
  const s=setup(),points=Array.from({length:478},()=>({x:.5,y:.5}));
  for(const i of [33,133])points[i]={x:.4,y:.4};for(const i of [362,263])points[i]={x:.6,y:.4};
  points[234]={x:.25,y:.5};points[454]={x:.75,y:.5};
  let face=points;s.pipeline.tracking='ready';s.pipeline.tracker={detectForVideo:()=>({faceLandmarks:face?[face]:[]}),close(){}};
  s.pipeline.select('puppy');assert.equal(s.pipeline.face.x,640);assert.equal(s.pipeline.face.size,640);
  face=null;s.video.currentTime++;s.draws.length=0;s.pipeline.draw(300);
  assert.equal(s.pipeline.face,null);assert.equal(s.draws.some(d=>d[0]==='translate'),false);s.pipeline.stop();
});
test('effect strength zero sends the original frame without a color pass, lens, or caption',()=>{
  const s=setup();s.pipeline.tracking='ready';s.pipeline.face={x:640,y:288,size:380,angle:0,mouth:0};s.pipeline.select('thug');
  s.draws.length=0;s.pipeline.setStrength(0);
  assert.equal(s.draws.filter(d=>d[0]==='drawImage').length,1);assert.equal(s.draws.some(d=>['translate','fillText'].includes(d[0])),false);s.pipeline.stop();
});
test('unavailable face tracking never sends a lens pinned to the frame',()=>{
  const s=setup();s.pipeline.tracking='unavailable';s.pipeline.select('puppy');
  assert.equal(s.draws.some(d=>d[0]==='translate'),false);assert.match(s.statuses.at(-1),/Retry/);s.pipeline.stop();
});
test('a tracker error removes previous landmarks and never leaves the last lens on screen',()=>{
  const s=setup();s.pipeline.tracking='ready';s.pipeline.face={x:640,y:288,size:380,angle:0,mouth:0};s.pipeline.targetFace=s.pipeline.face;
  s.pipeline.tracker={detectForVideo(){throw Error('Tracker lost');},close(){}};s.pipeline.select('puppy');
  assert.equal(s.pipeline.face,null);assert.equal(s.pipeline.targetFace,null);assert.equal(s.draws.some(d=>d[0]==='translate'),false);s.pipeline.stop();
});
test('stopping releases captured tracks and timers while leaving the microphone for the call to own',async()=>{
  const s=setup();await s.pipeline.start();assert.ok(s.timers.size);
  s.pipeline.stop();s.pipeline.stop();assert.equal(s.track.stopped,true);assert.equal(s.timers.size,0);
  assert.equal(s.video.srcObject,null);assert.equal(s.video.paused,true);assert.equal(s.audio.enabled,true);
});
