/* Draw effects into the video track sent over WebRTC, never over the remote video.
   Face landmarks are calculated locally. Only model/runtime assets use the CDN. */
(() => {
  const FILTERS = Object.freeze([
    {id:'none', name:'Original', group:'Looks', badge:'OFF'},
    {id:'glow', name:'Soft glow', group:'Looks', badge:'GLOW'},
    {id:'mono', name:'Black & white', group:'Looks', badge:'B&W'},
    {id:'sepia', name:'Vintage', group:'Looks', badge:'90s'},
    {id:'cyber', name:'Cyberpunk', group:'Looks', badge:'NEON'},
    {id:'golden', name:'Golden hour', group:'Looks', badge:'GOLD'},
    {id:'rose', name:'Rose tint', group:'Looks', badge:'ROSE'},
    {id:'cool', name:'Studio cool', group:'Looks', badge:'STUDIO'},
    {id:'puppy', name:'Puppy', group:'Face lenses', badge:'PUP', face:true},
    {id:'cat', name:'Cat', group:'Face lenses', badge:'MEOW', face:true},
    {id:'hearts', name:'Heart eyes', group:'Face lenses', badge:'LOVE', face:true},
    {id:'shades', name:'Deal with it', group:'Face lenses', badge:'COOL', face:true},
    {id:'crown', name:'Royal crown', group:'Face lenses', badge:'ROYAL', face:true},
    {id:'brain', name:'Big brain', group:'Memes', badge:'IQ+', face:true},
    {id:'fried', name:'Deep fried', group:'Memes', badge:'FRIED'},
    {id:'wasted', name:'Wasted', group:'Memes', badge:'WASTED'},
    {id:'thug', name:'Thug life', group:'Memes', badge:'THUG', face:true},
    {id:'fine', name:'This is fine', group:'Memes', badge:'FINE'},
    {id:'news', name:'Breaking news', group:'Memes', badge:'LIVE'}
  ]);
  const LOOKS = {glow:'brightness(1.08) contrast(.95) saturate(1.18)', mono:'grayscale(1)',
    sepia:'sepia(.85) contrast(.95) saturate(.8)', cyber:'hue-rotate(285deg) saturate(1.8) contrast(1.12)',
    golden:'sepia(.24) saturate(1.28) contrast(1.04) brightness(1.05)',rose:'sepia(.14) hue-rotate(315deg) saturate(1.18) brightness(1.04)',
    cool:'saturate(.82) contrast(1.1) brightness(1.04)',fried:'saturate(5) contrast(2.4) brightness(1.12)', wasted:'grayscale(1) contrast(1.25)', thug:'grayscale(1) contrast(1.2)'};
  const ASSETS = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
  let visionModule;
  const loadVision = () => visionModule ||= import(ASSETS + '/vision_bundle.mjs').catch(error => { visionModule = null; throw error; });

  function faceGeometry(points, width, height) {
    if (!points?.[454]) return null;
    const eye = (a,b) => ({x:(points[a].x+points[b].x)*width/2,y:(points[a].y+points[b].y)*height/2});
    const left=eye(33,133), right=eye(362,263);
    const span=Math.hypot((points[454].x-points[234].x)*width,(points[454].y-points[234].y)*height);
    if (!Number.isFinite(span) || span < 20) return null;
    const x=(left.x+right.x)/2,y=(left.y+right.y)/2,angle=Math.atan2(right.y-left.y,right.x-left.x);
    const local=point=>{const dx=point.x*width-x,dy=point.y*height-y;return{x:(dx*Math.cos(angle)+dy*Math.sin(angle))/span,y:(dy*Math.cos(angle)-dx*Math.sin(angle))/span};};
    return {x,y,size:span,angle,nose:local(points[1]),lips:local(points[13]),leftEye:local({x:left.x/width,y:left.y/height}),rightEye:local({x:right.x/width,y:right.y/height}),
      mouth:Math.min(.3,Math.hypot((points[14].x-points[13].x)*width,(points[14].y-points[13].y)*height)/span)};
  }

  class VideoFilters {
    static get filters() { return FILTERS; }
    static supported() {
      return typeof document !== 'undefined' && typeof document.createElement('canvas').captureStream === 'function';
    }
    static preview(subject,canvas,id) {
      if(!subject?.source || !subject.video || !canvas.getContext)return;
      const ctx=canvas.getContext('2d');if(!ctx)return;
      const renderer=Object.create(VideoFilters.prototype);
      Object.assign(renderer,{source:subject.source,video:subject.video,canvas:{width:subject.canvas?.width || 1280,height:subject.canvas?.height || 720},
        ctx,effect:FILTERS.find(effect=>effect.id===id)||FILTERS[0],strength:.9,enabled:true,stopped:false,tracker:null,
        tracking:'ready',face:subject.face || {x:640,y:288,size:380,angle:0,mouth:0},onStatus:()=>{}});
      if(!subject.face && subject.canvas){renderer.face={x:subject.canvas.width*.5,y:subject.canvas.height*.40,size:subject.canvas.height*.55,angle:0,mouth:0};}
      ctx.save();ctx.setTransform(canvas.width/renderer.canvas.width,0,0,canvas.height/renderer.canvas.height,0,0);
      renderer.draw(performance.now());ctx.restore();
    }
    constructor(stream, {onStatus=()=>{}, onError=()=>{}} = {}) {
      this.source = stream; this.onStatus=onStatus; this.onError=onError; this.effect=FILTERS[0];
      this.stopped=false; this.enabled=true; this.strength=.8;this.face=null;this.targetFace=null; this.tracking='idle'; this.trackingAttempt=0; this.lastDetection=-Infinity;
      this.canvas=document.createElement('canvas'); this.ctx=this.canvas.getContext('2d', {alpha:false});
      if (!this.ctx || typeof this.canvas.captureStream !== 'function') throw new Error('Live filters are not supported in this browser.');
      const settings=stream.getVideoTracks()[0]?.getSettings?.() || {};
      const ratio=(settings.width || 1280)/(settings.height || 720);
      this.canvas.width=Math.min(settings.width || 1280,1280);
      this.canvas.height=Math.max(1,Math.round(this.canvas.width/ratio));
      this.video=document.createElement('video'); this.video.muted=true; this.video.autoplay=true; this.video.playsInline=true;
      this.video.srcObject=stream;
      this.drawBase();
      this.output=this.canvas.captureStream(30);
      this.stream=new MediaStream([...this.output.getVideoTracks(), ...stream.getAudioTracks()]);
      this.timer=null;
    }
    async start() {
      await this.video.play();
      if (this.stopped) throw new Error('The call ended while filters were starting.');
      this.tick(); return this;
    }
    select(id) {
      const effect=FILTERS.find(item=>item.id===id);
      if (!effect) throw new Error('Unknown video filter.');
      this.effect=effect;
      if (effect.face && this.tracking === 'idle') this.loadTracker();
      this.report(); this.draw(performance.now());
    }
    setStrength(value) {this.strength=Math.max(0,Math.min(1,Number.isFinite(value)?value:.8));this.draw(performance.now());}
    async replaceSource(stream) {
      if(this.stopped)throw new Error('The filter is no longer active.');
      this.source=stream;this.video.srcObject=stream;this.face=null;this.targetFace=null;this.lastVideoTime=-1;
      const settings=stream.getVideoTracks()[0]?.getSettings?.()||{};
      const width=Math.min(settings.width||1280,1280),height=Math.round(width*(settings.height||720)/(settings.width||1280));
      this.canvas.width=width;this.canvas.height=Math.max(1,height);
      await this.video.play();if(this.stopped)throw new Error('The call ended while switching camera.');
    }
    report() {
      if (this.stopped) return;
      let message=this.effect.id==='none' ? 'Original camera. No filter applied.' : this.effect.name + ' is visible to the other person.';
      if (!this.enabled) message='Camera is off. Filters resume when you turn it on.';
      else if (this.effect.face) {
        if (this.tracking==='loading') message='Loading face tracking. Your call stays connected.';
        else if (this.tracking==='unavailable') message='Face tracking is unavailable. Retry to use this lens, or choose a look or a frame meme.';
        else if (!this.face) message='Look toward your camera so the lens can find your face.';
      }
      if (message!==this.lastStatus) { this.lastStatus=message; this.onStatus(message); }
    }
    async loadTracker() {
      this.tracking='loading'; this.report();
      // A failed/slow asset download must never block a call or leave a pending UI.
      let expired=false;
      const attempt=++this.trackingAttempt;
      const timeout=setTimeout(()=>{expired=true;if(!this.stopped && attempt===this.trackingAttempt){this.tracking='unavailable';this.report();}},20000);
      this.modelTimeout=timeout;
      try {
        const {FilesetResolver,FaceLandmarker}=await loadVision();
        if (this.stopped || expired || attempt!==this.trackingAttempt) return;
        const vision=await FilesetResolver.forVisionTasks(ASSETS+'/wasm');
        if (this.stopped || expired || attempt!==this.trackingAttempt) return;
        const tracker=await FaceLandmarker.createFromOptions(vision, {
          baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},
          runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minTrackingConfidence:.5
        });
        if (this.stopped || expired || attempt!==this.trackingAttempt) {tracker.close();return;}
        this.tracker=tracker; this.tracking='ready';
      } catch (_) { if (!this.stopped && attempt===this.trackingAttempt) this.tracking='unavailable'; }
      finally {clearTimeout(timeout);this.report();}
    }
    setEnabled(value) {
      this.enabled=value; this.face=null;this.targetFace=null;
      this.output.getVideoTracks().forEach(track=>{track.enabled=value;});
      this.draw(performance.now()); this.report();
    }
    drawBase() {
      const c=this.ctx,w=this.canvas.width,h=this.canvas.height;
      c.save(); c.filter='none'; c.fillStyle='#11151d'; c.fillRect(0,0,w,h); c.restore();
    }
    tick() {
      if (this.stopped) return;
      const started=performance.now();
      try {this.draw(started);}
      catch(error) {this.onError(error);return;}
      // A timer keeps outgoing frames alive when the call is in a background tab.
      this.timer=setTimeout(()=>this.tick(),Math.max(0,1000/30-(performance.now()-started)));
    }
    draw(now) {
      if (this.stopped) return;
      const c=this.ctx,w=this.canvas.width,h=this.canvas.height;
      this.drawBase();
      if (!this.enabled || !this.source.getVideoTracks()[0]?.enabled || this.video.readyState<2) return;
      c.save();c.filter='none';c.drawImage(this.video,0,0,w,h);c.restore();
      if(this.strength===0)return;
      if(LOOKS[this.effect.id]){c.save();c.globalAlpha=this.strength;c.filter=LOOKS[this.effect.id];c.drawImage(this.video,0,0,w,h);c.restore();}
      if(this.effect.id==='glow'){c.save();c.globalCompositeOperation='screen';c.globalAlpha=.12*this.strength;c.filter='blur(3px)';c.drawImage(this.video,0,0,w,h);c.restore();}
      if (this.effect.face) {
        if (this.tracker && now-this.lastDetection>=(this.detectionInterval||75) && this.video.currentTime!==this.lastVideoTime) {
          this.lastDetection=now; this.lastVideoTime=this.video.currentTime;
          try {
            const inferenceStarted=performance.now();
            const points=this.tracker.detectForVideo(this.video,now).faceLandmarks[0];
            this.detectionInterval=Math.max(75,Math.min(250,(performance.now()-inferenceStarted)*3));
            const next=faceGeometry(points,w,h);
            this.targetFace=next;if(!next)this.face=null;
          } catch (_) {this.tracker.close();this.tracker=null;this.face=null;this.targetFace=null;this.tracking='unavailable';}
          this.report();
        }
        if(this.targetFace)this.face=this.smooth(this.targetFace);
        if (this.face){c.save();c.globalAlpha=this.strength;this.drawLens(this.face,now);c.restore();}
      }
      c.save();c.globalAlpha=this.strength;this.drawMeme(now);c.restore();
    }
    smooth(next) {
      if (!this.face) return next;
      const result={...next};
      for (const key of ['x','y','size','angle','mouth']) result[key]=this.face[key]*.55+next[key]*.45;
      for(const key of ['nose','lips','leftEye','rightEye'])if(next[key] && this.face[key])result[key]={x:this.face[key].x*.55+next[key].x*.45,y:this.face[key].y*.55+next[key].y*.45};
      return result;
    }
    drawLens(face,now=0) {
      const c=this.ctx,id=this.effect.id;
      c.save(); c.translate(face.x,face.y); c.rotate(face.angle); c.scale(face.size,face.size);
      c.lineWidth=.014; c.lineCap='round'; c.lineJoin='round';
      const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
      const line=(x,y,a,b,color)=>{c.strokeStyle=color;c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke();};
      const gradient=(x,y,r,light,dark)=>{const value=c.createRadialGradient(x-r*.3,y-r*.4,r*.04,x,y,r);value.addColorStop(0,light);value.addColorStop(1,dark);return value;};
      const nose=face.nose || {x:0,y:.29},lips=face.lips || {x:0,y:.47};
      c.shadowColor='#19102145';c.shadowBlur=face.size*.025;c.shadowOffsetY=face.size*.009;
      if (id==='puppy') {
        for (const sign of [-1,1]) {c.save();c.translate(sign*.42,-.35);c.rotate(sign*(-.28+.05*Math.sin(now/500)));ellipse(0,0,.16,.32,gradient(0,0,.34,'#d79b5b','#6a371f'));ellipse(0,.025,.095,.22,gradient(0,.025,.22,'#f0c6aa','#c58268'));c.restore();}
        c.shadowBlur=0;ellipse(nose.x-.09,nose.y+.065,.13,.09,'#f5e0cabb');ellipse(nose.x+.09,nose.y+.065,.13,.09,'#f5e0cabb');
        ellipse(nose.x,nose.y,.13,.085,gradient(nose.x,nose.y,.13,'#755044','#261914'));ellipse(nose.x-.035,nose.y-.02,.033,.014,'#ffffffa0');
        line(nose.x,nose.y+.08,lips.x,lips.y,'#563529');
        if(face.mouth>.035){ellipse(lips.x,lips.y+.06,.066,.07+face.mouth*.6,gradient(lips.x,lips.y+.06,.14,'#ffb8c8','#e3517d'));line(lips.x,lips.y+.025,lips.x,lips.y+.10+face.mouth*.35,'#cf5572');}
      } else if (id==='cat') {
        for (const sign of [-1,1]) {
          c.fillStyle=gradient(sign*.4,-.45,.35,'#b997c7','#4a3a58');c.beginPath();c.moveTo(sign*.15,-.35);c.quadraticCurveTo(sign*.30,-.55,sign*.48,-.75);c.quadraticCurveTo(sign*.59,-.55,sign*.56,-.26);c.closePath();c.fill();
          c.fillStyle='#f5a6c5';c.beginPath();c.moveTo(sign*.28,-.38);c.lineTo(sign*.45,-.62);c.lineTo(sign*.49,-.32);c.closePath();c.fill();
          c.shadowBlur=0;for(let i=0;i<3;i++)line(nose.x+sign*.12,nose.y+.04+i*.04,nose.x+sign*.48,nose.y-.04+i*.11,'#ffffffdc');
        }
        for(const sign of [-1,1])ellipse(nose.x+sign*.19,nose.y+.1,.1,.055,'#ef97b44d');
        c.fillStyle=gradient(nose.x,nose.y,.08,'#ffd4e3','#d66595');c.beginPath();c.moveTo(nose.x-.065,nose.y-.02);c.quadraticCurveTo(nose.x,nose.y-.06,nose.x+.065,nose.y-.02);c.lineTo(nose.x,nose.y+.055);c.closePath();c.fill();
        line(nose.x,nose.y+.055,lips.x,lips.y,'#4a3a58');
      } else if (id==='hearts') {
        for(const point of [face.leftEye||{x:-.24,y:0},face.rightEye||{x:.24,y:0}]){c.save();c.translate(point.x,point.y);c.scale(.18,.18);c.fillStyle=gradient(0,0,1.4,'#ff9ebc','#e91157');c.beginPath();c.moveTo(0,1);c.bezierCurveTo(-2,-.2,-.9,-1.5,0,-.55);c.bezierCurveTo(.9,-1.5,2,-.2,0,1);c.fill();ellipse(-.5,-.35,.16,.09,'#fff8');c.restore();}
      } else if (id==='shades' || id==='thug') {
        if(id==='shades'){
          c.fillStyle=gradient(0,.05,.55,'#444057','#090b16');
          for(const sign of [-1,1]){c.beginPath();c.roundRect(sign<0?-.46:.05,-.10,.41,.25,.07);c.fill();c.strokeStyle='#c2a678';c.lineWidth=.012;c.stroke();}
          line(-.05,-.02,.05,-.02,'#bda57a');line(-.46,-.04,-.55,-.10,'#bda57a');line(.46,-.04,.55,-.10,'#bda57a');
          c.shadowBlur=0;c.globalAlpha*=.4;c.strokeStyle='#e2e5ff';c.lineWidth=.02;
          line(-.38,.07,-.24,-.06,'#e2e5ff');line(.13,.07,.27,-.06,'#e2e5ff');c.restore();return;
        }
        c.fillStyle='#08090c';c.fillRect(-.50,-.09,1,.075);c.fillRect(-.44,-.04,.36,.20);c.fillRect(.08,-.04,.36,.20);
        c.fillStyle='#fff';for(const x of [-.38,-.29,.14,.23]){c.fillRect(x,-.01,.055,.045);c.fillRect(x+.055,.035,.055,.045);}
      } else if (id==='crown') {
        c.fillStyle=gradient(-.1,-.6,.7,'#fff4b2','#cc8425');c.strokeStyle='#ad6e22';c.beginPath();c.moveTo(-.47,-.42);c.lineTo(-.53,-.78);c.lineTo(-.24,-.60);c.lineTo(0,-.94);c.lineTo(.24,-.60);c.lineTo(.53,-.78);c.lineTo(.47,-.42);c.closePath();c.fill();c.stroke();
        c.fillStyle='#dba644';c.fillRect(-.47,-.46,.94,.09);for(const x of [-.53,0,.53])ellipse(x,x===0?-.94:-.78,.035,.035,'#fff1a0');
        ellipse(0,-.56,.055,.06,gradient(0,-.56,.07,'#ffa5d5','#be185d'));for(const x of [-.26,.26])ellipse(x,-.50,.026,.03,'#b4f4ed');
      } else if (id==='brain') {
        ellipse(0,-.51,.53,.39,gradient(-.15,-.62,.6,'#ffe4ef','#d478ad'));
        c.strokeStyle='#cf6999';c.lineWidth=.022;
        for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(i*.16,-.76);c.bezierCurveTo(i*.16-.16,-.62,i*.16+.16,-.46,i*.16,-.27);c.stroke();}
        line(0,-.85,0,-.19,'#cf6999');
      }
      c.restore();
    }
    text(value,y,{size=.09,color='#fff',stroke=true}={}) {
      const c=this.ctx,w=this.canvas.width;
      c.save();c.font=`900 ${Math.round(w*size)}px Impact, "Arial Black", sans-serif`;c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
      if(stroke){c.lineWidth=Math.max(2,w*.007);c.strokeStyle='#101014';c.strokeText(value,w/2,y,w*.92);}
      c.fillStyle=color;c.fillText(value,w/2,y,w*.92);c.restore();
    }
    drawMeme(now) {
      const c=this.ctx,w=this.canvas.width,h=this.canvas.height,id=this.effect.id;
      if(id==='fried') {c.save();c.globalAlpha=.10;c.fillStyle='#ff4600';c.fillRect(0,0,w,h);c.restore();this.text('CERTIFIED DEEP FRIED',h*.90,{size:.065,color:'#ffe844'});}
      if(id==='wasted') {c.fillStyle='#08080899';c.fillRect(0,h*.38,w,h*.24);this.text('WASTED',h*.50,{size:.15,color:'#df3c48'});}
      if(id==='thug') this.text('THUG LIFE',h*.86,{size:.115});
      if(id==='brain') this.text('BIG BRAIN ENERGY',h*.90,{size:.065,color:'#ffdf73'});
      if(id==='fine') {
        c.save();for(let i=0;i<15;i++){const x=w*i/14,rise=(.07+.05*Math.sin(now/300+i))*h;c.fillStyle=i%2?'#ffb22cdd':'#ff5b30bb';c.beginPath();c.moveTo(x-w*.06,h);c.quadraticCurveTo(x-w*.07,h-rise,x,h-rise*1.9);c.quadraticCurveTo(x+w*.07,h-rise,x+w*.06,h);c.fill();}c.restore();
        this.text('THIS IS FINE.',h*.84,{size:.10});
      }
      if(id==='news') {
        c.fillStyle='#dc234a';c.fillRect(w*.035,h*.055,w*.15,h*.075);c.fillStyle='#fff';c.font=`800 ${Math.round(h*.04)}px sans-serif`;c.fillText('LIVE',w*.058,h*.108);
        c.fillStyle='#dc234a';c.fillRect(0,h*.77,w,h*.10);this.text('BREAKING NEWS',h*.822,{size:.065,stroke:false});
        c.fillStyle='#15253c';c.fillRect(0,h*.87,w,h*.13);this.text('LOCAL LEGEND JOINS THE CALL',h*.936,{size:.04,stroke:false});
      }
    }
    stop() {
      if (this.stopped) return;
      this.stopped=true;clearTimeout(this.timer);clearTimeout(this.modelTimeout);this.tracker?.close();this.tracker=null;
      this.output?.getTracks().forEach(track=>track.stop());this.video.pause();this.video.srcObject=null;this.face=null;
    }
  }
  window.RizzumeVideoFilters=VideoFilters;
})();
