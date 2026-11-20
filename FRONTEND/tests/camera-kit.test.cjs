const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(options={}) {
  const track=()=>({kind:'video',enabled:true,stopped:false,stop(){this.stopped=true;},clone(){return track();},getSettings:()=>({facingMode:'user'})});
  const original=track(),output=track(),inputs=[],events={};let destroyed=0,muted=0;
  const stream=tracks=>({getTracks:()=>tracks,getVideoTracks:()=>tracks});
  const session={output:{capture:{captureStream:()=>stream([output])}},events:{addEventListener:(name,fn)=>events[name]=fn},mute(){muted++;},async setFPSLimit(n){assert.equal(n,30);},async setSource(input){inputs.push(input);if(options.setSource)await options.setSource(input);},async play(target){assert.equal(target,'capture');},async applyLens(){return options.applied!==false;},async destroy(){destroyed++;if(options.destroy)await options.destroy();}};
  const context=vm.createContext({window:{},MediaStream:function(tracks){return stream(tracks);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../camera-kit.js'),'utf8'),context);
  const processor=new context.window.RizzumeSnapFilters(stream([original]),{onError:options.onError,load:async()=>({kit:{createSession:async()=>options.create?options.create(session):session},sdk:{createMediaStreamSource:(s,config)=>({stream:s,config})}})});
  return {processor,original,output,inputs,events,session,track,stream,get destroyed(){return destroyed;},get muted(){return muted;}};
}
test('Snap captures the sharing canvas, mutes lens sound and clones the camera input',async()=>{
  const s=fixture();await s.processor.start();assert.equal(s.processor.stream.getVideoTracks()[0],s.output);assert.equal(s.muted,1);
  assert.notEqual(s.inputs[0].stream.getVideoTracks()[0],s.original);assert.equal(s.inputs[0].config.cameraType,'user');
  s.processor.setEnabled(false);assert.equal(s.output.enabled,false);assert.equal(s.processor.inputTrack.enabled,false);assert.equal(s.original.enabled,true);
  await s.processor.stop();assert.equal(s.output.stopped,true);assert.equal(s.original.stopped,false);assert.equal(s.destroyed,1);
});
test('Snap camera replacement releases the old clone only after a successful source switch',async()=>{
  const s=fixture();await s.processor.start();const previous=s.processor.inputTrack,newCamera=s.track();
  await s.processor.replaceSource(s.stream([newCamera]));assert.equal(previous.stopped,true);assert.equal(newCamera.stopped,false);s.processor.stop();
});
test('failed Snap camera replacement retains the current source',async()=>{
  let fail=false;const s=fixture({setSource:()=>{if(fail)throw Error('device error');}});await s.processor.start();const previous=s.processor.inputTrack;fail=true;
  await assert.rejects(s.processor.replaceSource(s.stream([s.track()])));assert.equal(previous.stopped,false);assert.equal(s.processor.inputTrack,previous);s.processor.stop();
});
test('hanging up before Snap creates a session destroys the late session',async()=>{
  let resolve;const s=fixture({create:session=>new Promise(done=>{resolve=()=>done(session);})});const pending=s.processor.start();await new Promise(done=>setImmediate(done));s.processor.stop();resolve();await pending;
  assert.equal(s.destroyed,1);assert.equal(s.inputs.length,0);assert.equal(s.original.stopped,false);
});
test('lens interruption and rendering errors cannot report a working Snap effect',async()=>{
  let errors=0;const s=fixture({applied:false,onError:()=>errors++});await s.processor.start();await assert.rejects(s.processor.select({id:'lens'}));
  s.events.error();assert.equal(errors,1);assert.equal(s.processor.failed,true);await assert.rejects(s.processor.select({id:'lens'}));s.processor.stop();s.events.error();assert.equal(errors,1);
});
test('a new Snap renderer waits for the preceding session teardown',async()=>{
  let finish;const s=fixture({destroy:()=>new Promise(resolve=>finish=resolve)});await s.processor.start();const stopped=s.processor.stop();
  let created=false;
  const second=new s.processor.constructor(s.stream([s.original]),{load:async()=>({kit:{createSession:async()=>{created=true;return {...s.session,destroy:async()=>{}};}},sdk:{createMediaStreamSource:stream=>({stream})}})});
  const starting=second.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(created,false);finish();await stopped;await starting;assert.equal(created,true);await second.stop();
});
