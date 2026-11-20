/* WebRTC media stays in the browser. Spring only relays SDP and ICE between authorized peers. */
(() => {
  const {icon, dialog, toast} = window.RizzumeUI;
  class VideoRoom {
    constructor({request, team = false}) {
      this.request = request; this.team = team; this.run = null;
      this.modal = dialog('videoRoom', `<section class="rz-dialog-panel rz-call-panel">
        <div class="rz-dialog-header"><div><span class="rz-call-eyebrow">RIZZUME CALL</span><h2><span id="callPeerName">Face to face.</span></h2><p id="callStatus" role="status" aria-live="polite">Ready to connect</p></div><div class="rz-call-header-actions"><span id="callDuration" class="rz-call-duration" hidden>00:00</span><button id="callFullscreen" type="button" class="rz-icon-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button><button data-close class="rz-icon-button" aria-label="Close and end call">${icon('close')}</button></div></div>
        <div class="rz-call-videos"><video id="remoteVideo" class="rz-remote-video" autoplay playsinline></video><span id="callRemoteMuted" class="rz-remote-muted" hidden>${icon('mic-off')}Microphone muted</span><div id="callPlaceholder" class="rz-call-placeholder"><span id="callPeerInitials" class="rz-call-person"></span><p id="callPlaceholderText">Let's make a connection.</p></div><div class="rz-self-preview"><video id="localVideo" class="rz-local-video" autoplay muted playsinline></video><div id="callLocalOff" class="rz-local-off" hidden>${icon('video-off')}<span>Camera off</span></div><span id="callLocalStatus" class="rz-local-label">You</span></div></div>
        <p id="callError" class="rz-call-error" role="alert"></p>
        <button id="callPlayAudio" class="rz-primary" hidden>Enable call audio</button>
        <div class="rz-call-controls" role="group" aria-label="Call controls"><button id="callMic" type="button" aria-label="Mute microphone" aria-pressed="false">${icon('mic')}<span>Mute</span></button><button id="callCamera" type="button" aria-label="Turn camera off" aria-pressed="false">${icon('video')}<span>Camera</span></button><button id="callSpeaker" type="button" aria-label="Mute speaker" aria-pressed="false">${icon('volume')}<span>Sound on</span></button><button id="callFilters" type="button" aria-label="Show video filters" aria-expanded="false" aria-controls="callFilterPicker" disabled>${icon('spark')}<span>Effects</span></button><button id="callSettings" type="button" aria-label="Choose camera and microphone" aria-expanded="false" aria-controls="callDevicePicker">${icon('settings')}<span>Devices</span></button><button id="callHangup" type="button" class="rz-end-call" aria-label="End call">${icon('phone')}<span>End call</span></button></div>
        <section id="callDevicePicker" class="rz-call-device-picker" aria-label="Audio and video devices" hidden><div class="rz-filter-heading"><div><h3>Audio & video</h3><p>Choose the devices for this call.</p></div></div><div class="rz-call-device-grid"><label>Microphone<select id="callMicrophoneDevice" aria-label="Microphone device"></select></label><label>Camera<select id="callCameraDevice" aria-label="Camera device"></select></label><label>Speaker<select id="callSpeakerDevice" aria-label="Speaker device"></select></label></div><p id="callDeviceStatus" class="rz-filter-status" role="status"></p></section>
        <section id="callFilterPicker" class="rz-call-filter-picker" aria-label="Video filters" hidden>
          <div class="rz-filter-heading"><div><h3>Pick your vibe</h3><p>Live effects that the other person sees too.</p></div><button id="callFilterReset" type="button">Remove filter</button></div>
          <div class="rz-filter-categories" role="group" aria-label="Filter categories">${['Looks','Face lenses','Memes','Snap Lenses'].map(group=>`<button type="button" data-call-filter-category="${group}" aria-pressed="${group==='Looks'}">${group}</button>`).join('')}</div>
          ${['Looks','Face lenses','Memes'].map(group=>`<div class="rz-filter-group" data-call-filter-section="${group}" ${group==='Looks'?'':'hidden'}><h4>${group}</h4><div class="rz-filter-options">${(window.RizzumeVideoFilters?.filters || []).filter(effect=>effect.group===group).map(effect=>`<button type="button" data-call-filter="${effect.id}" aria-pressed="${effect.id==='none'}"><span class="rz-filter-swatch rz-filter-${effect.id}" aria-hidden="true">${effect.badge}</span><span>${effect.name}</span></button>`).join('')}</div></div>`).join('')}
          <div class="rz-filter-group" data-call-filter-section="Snap Lenses" hidden><p class="rz-snap-notice">Snap Lenses use Snap Camera Kit. By enabling them, you agree to <a href="https://www.snap.com/terms" target="_blank" rel="noopener noreferrer">Snap's Terms</a> and acknowledge its <a href="https://www.snap.com/privacy/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p><button id="callSnapLoad" type="button" class="rz-filter-retry">Enable Snap Lenses</button><div id="callSnapOptions" class="rz-filter-options"></div><p id="callSnapStatus" class="rz-filter-status" role="status" aria-live="polite"></p></div>
          <p id="callFilterStatus" class="rz-filter-status" role="status" aria-live="polite">Choose a filter while your camera is on.</p>
          <label class="rz-filter-strength" for="callFilterStrength"><span>Effect strength <output id="callFilterStrengthValue">80%</output></span><input id="callFilterStrength" type="range" min="0" max="100" value="80" step="1"></label>
          <button id="callFilterRetry" class="rz-filter-retry" type="button" hidden>Retry face tracking</button>
        </section>
        <p class="rz-help">Only share your camera when you’re comfortable. This app does not record calls.</p>
      </section>`, () => this.hangup());
      this.$ = id => this.modal.el.querySelector('#' + id);
      this.$('callMic').onclick = () => this.toggle('audio');
      this.$('callCamera').onclick = () => this.toggle('video');
      this.$('callSpeaker').onclick=()=>this.toggleSpeaker();
      this.$('callSettings').onclick=()=>this.openDevices();
      this.$('callMicrophoneDevice').onchange=event=>this.switchDevice('audio',event.target.value);
      this.$('callCameraDevice').onchange=event=>this.switchDevice('video',event.target.value);
      this.$('callSpeakerDevice').onchange=event=>this.switchSpeaker(event.target.value);
      this.$('callFullscreen').onclick=()=>this.toggleFullscreen();
      this.$('callFilterStrength').oninput=event=>{
        this.$('callFilterStrengthValue').textContent=event.target.value+'%';
        this.run?.filters?.setStrength?.(Number(event.target.value)/100);
      };
      this.$('callHangup').onclick = () => this.hangup();
      this.$('callFilters').onclick = () => {
        const picker=this.$('callFilterPicker');picker.hidden=!picker.hidden;
        this.$('callFilters').setAttribute('aria-expanded',String(!picker.hidden));
        if(!picker.hidden){this.$('callDevicePicker').hidden=true;this.$('callSettings').setAttribute('aria-expanded','false');this.refreshFilterPreviews();}
      };
      this.$('callFilterReset').onclick = () => this.selectFilter('none');
      this.$('callSnapLoad').onclick = () => this.loadSnapLenses();
      this.$('callFilterRetry').onclick=()=>{
        const processor=this.run?.filters;
        if(processor?.tracking==='unavailable'){processor.tracking='idle';processor.select(processor.effect.id);}
      };
      this.modal.el.querySelectorAll?.('[data-call-filter]').forEach(button=>{
        button.onclick=()=>this.selectFilter(button.dataset.callFilter);
      });
      this.modal.el.querySelectorAll?.('[data-call-filter-category]').forEach(button=>{
        button.onclick=()=>this.selectFilterCategory(button.dataset.callFilterCategory);
      });
      this.$('callPlayAudio').onclick = () => this.$('remoteVideo').play().then(() => { this.$('callPlayAudio').hidden = true; }).catch(() => toast('Allow audio playback in your browser.'));
      this.onPageHide = () => {
        const r = this.run; if (!r) return;
        this.release(r);
        if (r.id) this.request(this.path(r) + '/action', 'POST', {action: 'end'}, {keepalive: true}).catch(() => {});
      };
      window.addEventListener('pagehide', this.onPageHide);
      this.deviceListener=()=>{if(this.run && !this.$('callDevicePicker').hidden)this.loadDevices();};
      navigator.mediaDevices?.addEventListener?.('devicechange',this.deviceListener);
      this.fullscreenListener=()=>{
        const active=typeof document!=='undefined' && document.fullscreenElement===this.modal.el;
        this.$('callFullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
        this.control('callFullscreen',active?'shrink':'expand',active?'Exit fullscreen':'Fullscreen',active);
      };
      if(typeof document!=='undefined')document.addEventListener?.('fullscreenchange',this.fullscreenListener);
    }
    get busy() { return !!this.run; }
    path(r) { return (this.team ? '/team/calls/' : '/me/calls/') + encodeURIComponent(r.id); }
    status(text) { this.$('callStatus').textContent = text; this.$('callPlaceholderText').textContent = text; }
    async prepare(name, {video=true}={}) {
      if (this.run) throw new Error('Finish your current call first.');
      const r = {id: null, pc: null, stream: null, timer: null, cancelled: false, seen: new Set(), queue: [], sending: Promise.resolve(), failures: 0};
      this.run = r; this.$('callError').textContent = ''; this.$('callPlaceholder').hidden = false;
      r.name=name;this.$('callPeerName').textContent=name;this.$('callPeerName').title=name;
      this.$('callPeerInitials').textContent=String(name||'?').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]).join('').toUpperCase();
      this.$('callRemoteMuted').hidden=true;this.$('callDuration').hidden=true;this.$('callDevicePicker').hidden=true;this.$('callSettings').setAttribute('aria-expanded','false');
      this.$('remoteVideo').muted=false;this.$('callFilterStrength').value='80';this.$('callFilterStrengthValue').textContent='80%';
      this.$('callFilterPicker').hidden=true;this.$('callFilters').disabled=true;
      this.$('callFilterRetry').hidden=true;
      this.$('callSnapLoad').hidden=false;this.$('callSnapLoad').disabled=false;this.$('callSnapOptions').replaceChildren();this.$('callSnapStatus').textContent='';
      this.$('callFilters').setAttribute('aria-expanded','false');this.syncFilterSelection('none');
      this.selectFilterCategory('Looks');
      this.modal.el.querySelectorAll?.('[data-call-filter], #callFilterReset').forEach(button=>{button.disabled=false;});
      this.$('callPlayAudio').hidden = true;
      ['callMic', 'callCamera','callSettings','callSpeaker'].forEach(id => { this.$(id).disabled = true; });
      this.modal.open(); this.status('Allow '+(video?'camera & microphone':'microphone')+' to call ' + name);
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
          throw new Error('Video calling requires HTTPS or localhost and a browser with camera support.');
        const config = await this.request(this.team ? '/team/call-config' : '/me/call-config');
        if (r.cancelled) return null;
        if (config.callingEnabled === false) throw new Error('Video calls are not configured yet. Send a message while the team sets up its workspace.');
        let stream;
        try {stream = await navigator.mediaDevices.getUserMedia({video:video?{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}
        catch(error){
          if(!video || error.name!=='NotFoundError' || r.cancelled)throw error;
          stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
          this.$('callError').textContent='No camera found. You can continue with a voice call.';
        }
        if (r.cancelled) { stream.getTracks().forEach(t => t.stop()); return null; }
        r.stream = stream; this.$('localVideo').srcObject = stream;
        r.pc = new RTCPeerConnection({iceServers: config.iceServers});
        stream.getTracks().forEach(track => {
          const sender=r.pc.addTrack(track, stream);if(track.kind==='video')r.videoSender=sender;else if(track.kind==='audio')r.audioSender=sender;
          this.watchTrack(r,track);
        });
        if(!r.videoSender && !stream.getTracks().some(track=>track.kind==='video') && r.pc.addTransceiver)
          r.videoSender=r.pc.addTransceiver('video',{direction:'sendrecv',streams:[stream]}).sender;
        const filterSupport=!!window.RizzumeVideoFilters?.supported() && !!r.videoSender?.replaceTrack;
        this.$('callFilters').disabled=!filterSupport;
        this.$('callFilters').title=filterSupport?'Choose a live video filter':'This browser does not support live video filters.';
        this.$('callFilterStatus').textContent=filterSupport?'Original camera. No filter applied.':'Live filters are unavailable in this browser. Your camera still works.';
        this.syncControls(r);
        this.$('localVideo').play().catch(()=>{});
        r.pc.ondatachannel=event=>{if(event.channel.label==='rizzume-state')this.bindMediaState(r,event.channel);};
        r.pc.onicecandidate = event => {
          if (!event.candidate || r.cancelled) return;
          r.queue.push(event.candidate.toJSON()); this.flush(r);
        };
        r.pc.ontrack = event => {
          if (r.cancelled) return;
          const remote = this.$('remoteVideo');
          if(event.streams?.[0])remote.srcObject=event.streams[0];
          else {r.remoteStream ||= new MediaStream();r.remoteStream.addTrack(event.track);remote.srcObject=r.remoteStream;}
          this.$('callPlaceholder').hidden = true;
          remote.play().catch(() => { this.$('callPlayAudio').hidden = false; });
          const videoTrack=(remote.srcObject.getVideoTracks?.()||[])[0];
          if(videoTrack){const update=()=>{if(!r.cancelled)this.$('callPlaceholder').hidden=r.remoteMedia?.camera!==false && !videoTrack.muted;};videoTrack.addEventListener?.('mute',update);videoTrack.addEventListener?.('unmute',update);update();}
          else this.$('callPlaceholder').hidden=false;
        };
        r.pc.onconnectionstatechange = () => {
          if (r.cancelled) return;
          if (r.pc.connectionState === 'connected') {this.startDuration(r);this.status('Connected · ' + name);}
          if (r.pc.connectionState === 'disconnected') this.status('Connection interrupted. Trying to reconnect…');
          if (r.pc.connectionState === 'failed') this.fail(r, new Error('Could not connect. Try another network. A TURN relay may be needed on restricted networks.'));
        };
        if (!config.relayConfigured && !this.$('callError').textContent) this.$('callError').textContent = 'Some networks may need a relay server to connect.';
        return r;
      } catch (error) { this.fail(r, error); return null; }
    }
    async start(profileId, name, options) {
      if (this.busy) return toast('Finish your current call first.');
      const r = await this.prepare(name,options); if (!r) return;
      try {
        if(r.pc.createDataChannel)this.bindMediaState(r,r.pc.createDataChannel('rizzume-state'));
        await r.pc.setLocalDescription(await r.pc.createOffer()); if (r.cancelled) return;
        const call = await this.request('/me/calls', 'POST', {profileId, offer: r.pc.localDescription.sdp});
        r.id = call.id;
        if (r.cancelled) { await this.request(this.path(r) + '/action', 'POST', {action: 'end'}); return; }
        this.status('Calling ' + name + '… Waiting for them to answer.');
        this.flush(r); this.poll(r);
      } catch (error) { this.fail(r, error); }
    }
    async accept(id, name, options) {
      if (this.busy) return toast('Finish your current call first.');
      const r = await this.prepare(name,options); if (!r) return;
      r.id = id;
      try {
        const call = await this.request(this.path(r)); if (r.cancelled) return;
        if (call.state !== 'ringing') throw new Error('This invitation has already ended or was answered in another tab.');
        await r.pc.setRemoteDescription({type: 'offer', sdp: call.offer}); if (r.cancelled) return;
        await r.pc.setLocalDescription(await r.pc.createAnswer()); if (r.cancelled) return;
        await this.request(this.path(r) + '/action', 'POST', {action: 'accept', answer: r.pc.localDescription.sdp});
        if (r.cancelled) return;
        this.status('Connecting…'); this.flush(r); this.poll(r);
      } catch (error) { this.fail(r, error); }
    }
    flush(r) {
      if (!r.id || r.cancelled) return;
      for (const candidate of r.queue.splice(0)) {
        r.sending = r.sending.then(async () => {
          if (!r.cancelled) await this.request(this.path(r) + '/candidates', 'POST', {payload: JSON.stringify(candidate)});
        }).catch(error => { if (!r.cancelled) this.fail(r, error); });
      }
    }
    async poll(r) {
      if (r.cancelled) return;
      try {
        const call = await this.request(this.path(r)); if (r.cancelled) return;
        if (!['ringing', 'accepted'].includes(call.state)) {
          this.release(r); this.status(call.state === 'declined' ? 'Call declined. You can send a message instead.' : call.state === 'missed' ? 'No answer. Missed call saved in your conversation.' : 'Call ended.'); return;
        }
        if (call.answer && !r.pc.remoteDescription) { await r.pc.setRemoteDescription({type: 'answer', sdp: call.answer}); this.status('Connecting…'); }
        if (r.cancelled) return;
        if (r.pc.remoteDescription) for (const signal of call.signals) {
          if (r.cancelled) return;
          if (!r.seen.has(signal.id)) { await r.pc.addIceCandidate(JSON.parse(signal.payload)); r.seen.add(signal.id); }
        }
        if (call.state === 'accepted') {
          r.connectStarted ||= Date.now();
          if (r.pc.connectionState !== 'connected' && Date.now() - r.connectStarted > 45000)
            throw Object.assign(new Error('The media connection timed out. Try another network or ask the team to configure a relay server.'), {status:408});
        }
        r.failures = 0;
      } catch (error) {
        if (r.cancelled) return;
        if (++r.failures >= 3 || [401,403,404,408].includes(error.status)) return this.fail(r, error);
        this.status('Reconnecting to the call service…');
      }
      if (!r.cancelled) r.timer = setTimeout(() => this.poll(r), 1500);
    }
    selectFilterCategory(group) {
      this.modal.el.querySelectorAll?.('[data-call-filter-category]').forEach(button=>{
        button.setAttribute('aria-pressed',String(button.dataset.callFilterCategory===group));
      });
      this.refreshFilterPreviews();
      this.modal.el.querySelectorAll?.('[data-call-filter-section]').forEach(section=>{
        section.hidden=section.dataset.callFilterSection!==group;
      });
    }
    async loadSnapLenses() {
      const r=this.run;if(!r || r.cancelled || r.loadingSnap)return;
      r.loadingSnap=true;this.$('callSnapLoad').disabled=true;
      this.$('callSnapStatus').textContent='Loading Snap lenses...';
      try {
        const lenses=await window.RizzumeSnapFilters.loadLenses();
        if(r.cancelled || this.run!==r)return;
        r.snapLenses=lenses;this.$('callSnapOptions').replaceChildren();
        lenses.forEach((lens,index)=>{
          const button=document.createElement('button');button.type='button';button.dataset.callFilter='snap:'+index;
          button.setAttribute('aria-pressed','false');
          if(lens.iconUrl && /^https:\/\//i.test(lens.iconUrl)){
            const image=document.createElement('img');image.src=lens.iconUrl;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';button.appendChild(image);
          }
          const label=document.createElement('span');label.textContent=lens.name || 'Snap Lens '+(index+1);button.appendChild(label);
          button.onclick=()=>this.selectFilter('snap:'+index);this.$('callSnapOptions').appendChild(button);
        });
        this.$('callSnapLoad').hidden=true;
        this.$('callSnapStatus').textContent='Choose a Snap Lens. The other caller sees the effect too.';
      }catch(error){if(!r.cancelled)this.$('callSnapStatus').textContent='Snap lenses could not load. Check your connection and try again. Other effects and your camera still work.';}
      finally{r.loadingSnap=false;if(this.run===r)this.$('callSnapLoad').disabled=false;}
    }
    syncFilterSelection(id) {
      this.modal.el.querySelectorAll?.('[data-call-filter]').forEach(button=>{
        button.setAttribute('aria-pressed',String(button.dataset.callFilter===id));
      });
      this.$('localVideo').setAttribute('data-filtered',String(id!=='none'));
      this.$('callFilters').setAttribute('aria-label',id==='none'?'Show video filters':'Show video filters, filter active');
      this.$('callFilters').setAttribute('data-active',String(id!=='none'));
      this.$('callFilterStrength').disabled=id==='none' || id.startsWith('snap:');
    }
    async selectFilter(id) {
      const r=this.run;
      if (!r || r.cancelled || r.deviceChanging || r.filterSwitching || r.recoveringFilter || !r.videoSender?.replaceTrack) return false;
      if(!r.stream?.getTracks().some(track=>track.kind==='video' && track.readyState!=='ended'))return false;
      const snapLens=id.startsWith('snap:')?r.snapLenses?.[Number(id.slice(5))]:null;
      if (!snapLens && !window.RizzumeVideoFilters?.filters.some(effect=>effect.id===id)) return false;
      r.filterSwitching=true;
      const controls=this.modal.el.querySelectorAll?.('[data-call-filter], #callFilterReset') || [];
      controls.forEach(button=>{button.disabled=true;});
      try {
        const camera=r.stream.getTracks().find(track=>track.kind==='video');
        if (id==='none') {
          await r.videoSender.replaceTrack(camera);
          if (r.cancelled) return false;
          r.filters?.stop();r.filters=null;r.filterId='none';
          this.$('localVideo').srcObject=r.stream;this.$('callFilterStatus').textContent='Original camera. No filter applied.';this.$('callFilterRetry').hidden=true;
        } else {
          if (snapLens && r.filters?.provider==='snap') {
            await r.filters.select(snapLens);
            if(r.cancelled)return false;
          } else if (snapLens || r.filters?.provider==='snap') {
            const previous=r.filters;
            let next;
            const onError=()=>{next.failed=true;if(r.filters===next)this.recoverFilter(r);};
            next=snapLens?new window.RizzumeSnapFilters(r.stream,{onError}):new window.RizzumeVideoFilters(r.stream,{onStatus:text=>{if(!r.cancelled)this.$('callFilterStatus').textContent=text;},onError});
            r.pendingFilter=next;this.$('callFilterStatus').textContent=snapLens?'Starting Snap Lens...':'Starting live filters...';
            await next.start();if(r.cancelled){next.stop();return false;}
            await next.select(snapLens || id);if(r.cancelled){next.stop();return false;}
            if(next.failed)throw new Error('The lens could not render.');
            next.setEnabled(camera.enabled);
            await r.videoSender.replaceTrack(next.stream.getVideoTracks()[0]);
            if(r.cancelled){next.stop();return false;}
            if(next.failed)throw new Error('The lens could not render.');
            previous?.stop();r.filters=next;r.pendingFilter=null;
          } else if (!r.filters) {
            this.$('callFilterStatus').textContent='Starting live filters...';
            r.filters=new window.RizzumeVideoFilters(r.stream,{
              onStatus:text=>{if(!r.cancelled){this.$('callFilterStatus').textContent=text;
                this.$('callFilterRetry').hidden=!(r.filters?.effect?.face && r.filters.tracking==='unavailable');}},
              onError:()=>this.recoverFilter(r)
            });
            await r.filters.start();
            if (r.cancelled) return false;
            await r.videoSender.replaceTrack(r.filters.stream.getVideoTracks()[0]);
            if (r.cancelled) return false;
          }
          r.filters.setEnabled(camera.enabled);if(!snapLens)r.filters.select(id);r.filterId=id;
          r.filters.setStrength?.(Number(this.$('callFilterStrength').value)/100);
          this.$('localVideo').srcObject=r.filters.stream;
          if(snapLens){this.$('callFilterStatus').textContent=(snapLens.name || 'Snap Lens')+' active. Powered by Snap Camera Kit.';this.$('callFilterRetry').hidden=true;}
        }
        this.syncFilterSelection(id);
        this.$('localVideo').play().catch(()=>{});
        return true;
      } catch (error) {
        r.pendingFilter?.stop();r.pendingFilter=null;
        if (!r.cancelled) await this.recoverFilter(r);
        return false;
      } finally {r.filterSwitching=false;if(this.run===r)controls.forEach(button=>{button.disabled=r.cancelled;});}
    }
    async recoverFilter(r) {
      if(r.cancelled || r.recoveringFilter)return;
      r.recoveringFilter=true;
      try {
        await r.videoSender.replaceTrack(r.stream.getTracks().find(track=>track.kind==='video'));
        r.filters?.stop();r.filters=null;r.filterId='none';
        if(!r.cancelled){this.$('localVideo').srcObject=r.stream;this.syncFilterSelection('none');
          this.$('callFilterRetry').hidden=true;
          this.$('callFilterStatus').textContent='The effect could not run. Your original camera has been restored. Try another filter.';}
      } catch (error) {this.fail(r,new Error('The camera could not recover from a video filter. Please restart the call.'));}
      finally{r.recoveringFilter=false;}
    }
    control(id, symbol, label, pressed=false) {
      const button=this.$(id);button.innerHTML=icon(symbol)+'<span>'+label+'</span>';
      button.setAttribute('aria-pressed',String(pressed));button.title=button.getAttribute?.('aria-label') || label;
    }
    bindMediaState(r,channel) {
      if(r.cancelled){channel.close();return;}r.stateChannel=channel;
      channel.onopen=()=>this.publishMediaState(r);
      channel.onmessage=event=>{
        if(r.cancelled || typeof event.data!=='string' || event.data.length>256)return;
        try{const state=JSON.parse(event.data);if(typeof state.camera!=='boolean' || typeof state.microphone!=='boolean')return;
          r.remoteMedia=state;this.$('callPlaceholder').hidden=state.camera;
          this.$('callRemoteMuted').hidden=state.microphone;
          if(!state.camera)this.$('callPlaceholderText').textContent='Camera off. You can still talk here.';
        }catch(_){}
      };
    }
    publishMediaState(r) {
      if(r.cancelled || r.stateChannel?.readyState!=='open')return;
      const active=kind=>r.stream?.getTracks().some(track=>track.kind===kind && track.enabled && track.readyState!=='ended');
      const state=JSON.stringify({camera:!!active('video'),microphone:!!active('audio')});
      if(state!==r.lastMediaState)try{r.stateChannel.send(state);r.lastMediaState=state;}catch(_){}
    }
    syncControls(r=this.run) {
      if(!r || r.cancelled)return;
      const audio=r.stream?.getTracks().find(track=>track.kind==='audio');
      const video=r.stream?.getTracks().find(track=>track.kind==='video');
      const micOn=!!audio?.enabled && audio.readyState!=='ended',cameraOn=!!video?.enabled && video.readyState!=='ended';
      this.$('callMic').setAttribute('aria-label',micOn?'Mute microphone':'Unmute microphone');
      this.control('callMic',micOn?'mic':'mic-off',micOn?'Mute':'Unmute',!micOn);
      this.$('callCamera').setAttribute('aria-label',cameraOn?'Turn camera off':'Turn camera on');
      this.control('callCamera',cameraOn?'video':'video-off',cameraOn?'Stop video':'Start video',!cameraOn);
      this.$('callMic').disabled=!!r.deviceChanging || !audio;
      this.$('callCamera').disabled=!!r.deviceChanging || (!video && !r.videoSender?.replaceTrack);
      this.$('callSpeaker').disabled=false;
      this.$('callSpeaker').setAttribute('aria-label',this.$('remoteVideo').muted?'Unmute speaker':'Mute speaker');
      this.control('callSpeaker',this.$('remoteVideo').muted?'volume-off':'volume',this.$('remoteVideo').muted?'Sound off':'Sound on',this.$('remoteVideo').muted);
      this.$('callLocalOff').hidden=cameraOn;
      this.$('callLocalStatus').textContent=micOn?'You':'You · mic muted';
      this.$('callSettings').disabled=!!r.deviceChanging || !navigator.mediaDevices?.enumerateDevices;
      this.$('callMicrophoneDevice').disabled=!!r.deviceChanging;this.$('callCameraDevice').disabled=!!r.deviceChanging;
      this.$('callSpeakerDevice').disabled=!!r.deviceChanging || !this.$('remoteVideo').setSinkId;
      this.$('callFullscreen').disabled=!this.modal.el.requestFullscreen;
      this.$('callFilters').disabled=!cameraOn || !!r.deviceChanging || !window.RizzumeVideoFilters?.supported() || !r.videoSender?.replaceTrack;
      this.publishMediaState(r);
    }
    watchTrack(r,track) {
      track.addEventListener?.('ended',()=>{if(!r.cancelled){this.syncControls(r);this.$('callDeviceStatus').textContent='A device disconnected. Choose another device or turn it on again.';}});
    }
    toggleSpeaker() {
      if(!this.run)return;
      const remote=this.$('remoteVideo');remote.muted=!remote.muted;
      if(!remote.muted)remote.play().catch(()=>{this.$('callPlayAudio').hidden=false;});
      this.syncControls();
    }
    async openDevices() {
      if(!this.run)return;
      const picker=this.$('callDevicePicker');picker.hidden=!picker.hidden;
      this.$('callSettings').setAttribute('aria-expanded',String(!picker.hidden));
      if(!picker.hidden){this.$('callFilterPicker').hidden=true;this.$('callFilters').setAttribute('aria-expanded','false');await this.loadDevices();}
    }
    async loadDevices({preserveStatus=false}={}) {
      const r=this.run;if(!r || !navigator.mediaDevices?.enumerateDevices)return;
      try {
        const devices=await navigator.mediaDevices.enumerateDevices();if(r.cancelled || this.run!==r)return;
        for(const [id,kind,trackKind] of [['callMicrophoneDevice','audioinput','audio'],['callCameraDevice','videoinput','video'],['callSpeakerDevice','audiooutput','']]) {
          const select=this.$(id),active=trackKind?r.stream.getTracks().find(track=>track.kind===trackKind)?.getSettings?.().deviceId:this.$('remoteVideo').sinkId;
          const choices=devices.filter(device=>device.kind===kind);select.replaceChildren();
          const defaultOption=document.createElement('option');defaultOption.value='';defaultOption.textContent='System default';select.appendChild(defaultOption);
          choices.forEach((device,index)=>{const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label || (kind==='videoinput'?'Camera ':kind==='audioinput'?'Microphone ':'Speaker ')+(index+1);select.appendChild(option);});
          select.value=active || '';select.disabled=!!r.deviceChanging || (kind==='audiooutput' && !this.$('remoteVideo').setSinkId);
        }
        if(!preserveStatus)this.$('callDeviceStatus').textContent=this.$('remoteVideo').setSinkId?'Changes apply to this call.':'Speaker selection is managed by your browser. Microphone and camera changes apply to this call.';
      }catch(error){if(!r.cancelled)this.$('callDeviceStatus').textContent='Devices could not be listed. Check browser permissions and try again.';}
    }
    async switchDevice(kind,id) {
      const r=this.run,sender=kind==='video'?r?.videoSender:r?.audioSender;
      if(!r || r.cancelled || r.deviceChanging || r.filterSwitching || r.recoveringFilter || !sender?.replaceTrack)return false;
      r.deviceChanging=true;this.syncControls(r);this.$('callDeviceStatus').textContent='Switching '+(kind==='video'?'camera':'microphone')+'...';
      let acquired,committed=false;
      const old=r.stream.getTracks().find(track=>track.kind===kind);
      try {
        const constraints=kind==='video'?{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}:{echoCancellation:true,noiseSuppression:true,autoGainControl:true};
        if(id)constraints.deviceId={exact:id};
        acquired=await navigator.mediaDevices.getUserMedia({video:kind==='video'?constraints:false,audio:kind==='audio'?constraints:false});
        if(r.cancelled)return false;
        const track=acquired.getTracks().find(value=>value.kind===kind);if(!track)throw new Error('No device track returned');
        track.enabled=old && old.readyState!=='ended'?old.enabled:true;
        const next=new MediaStream([...r.stream.getTracks().filter(value=>value.kind!==kind),track]);
        if(kind==='video' && r.filters)await r.filters.replaceSource(next);
        else await sender.replaceTrack(track);
        if(r.cancelled)return false;
        r.stream=next;committed=true;this.watchTrack(r,track);
        if(r.filters){r.filters.source=next;r.filters.setEnabled(next.getVideoTracks()[0]?.enabled!==false);}
        this.$('localVideo').srcObject=r.filters?.stream || next;this.$('localVideo').play().catch(()=>{});
        old?.stop();this.$('callDeviceStatus').textContent=(kind==='video'?'Camera':'Microphone')+' updated.';
        return true;
      }catch(error){
        if(!r.cancelled){if(kind==='video' && r.filters)await r.filters.replaceSource(r.stream).catch(()=>{});
          this.$('callDeviceStatus').textContent='Could not switch '+(kind==='video'?'camera':'microphone')+'. Your previous device is still selected.';}
        return false;
      }finally{
        if(!committed)acquired?.getTracks().forEach(track=>track.stop());
        r.deviceChanging=false;if(!r.cancelled){this.syncControls(r);if(!this.$('callDevicePicker').hidden)this.loadDevices({preserveStatus:true});}
      }
    }
    async switchSpeaker(id) {
      const r=this.run,remote=this.$('remoteVideo');if(!r || !remote.setSinkId)return false;
      try{await remote.setSinkId(id);if(!r.cancelled)this.$('callDeviceStatus').textContent='Speaker updated.';return true;}
      catch(error){if(!r.cancelled){this.$('callDeviceStatus').textContent='Could not change speaker. Check browser permissions.';this.$('callSpeakerDevice').value=remote.sinkId || '';}return false;}
    }
    async toggleFullscreen() {
      if(typeof document==='undefined')return;
      try{if(document.fullscreenElement===this.modal.el)await document.exitFullscreen();else await this.modal.el.requestFullscreen();}
      catch(error){toast('Fullscreen is unavailable in this browser.');}
    }
    startDuration(r) {
      if(r.connectedAt)return;r.connectedAt=Date.now();
      const update=()=>{if(r.cancelled)return;const seconds=Math.floor((Date.now()-r.connectedAt)/1000);
        this.$('callDuration').hidden=false;this.$('callDuration').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
        r.durationTimer=setTimeout(update,1000);};update();
    }
    refreshFilterPreviews() {
      const r=this.run;if(!r || this.$('callFilterPicker').hidden || !window.RizzumeVideoFilters?.preview)return;
      const subject=r.filters?.provider==='snap'?{source:r.stream,video:this.$('localVideo')}:(r.filters || {source:r.stream,video:this.$('localVideo')});
      if(subject.video.readyState<2){subject.video.addEventListener?.('loadeddata',()=>{if(this.run===r)this.refreshFilterPreviews();},{once:true});return;}
      this.modal.el.querySelectorAll?.('[data-call-filter]').forEach(button=>{
        if(button.dataset.callFilter.startsWith('snap:'))return;
        let canvas=button.querySelector('canvas');
        if(!canvas){canvas=document.createElement('canvas');canvas.width=144;canvas.height=96;canvas.setAttribute('aria-hidden','true');button.querySelector('.rz-filter-swatch').replaceChildren(canvas);}
        window.RizzumeVideoFilters.preview(subject,canvas,button.dataset.callFilter);
      });
    }
    toggle(kind) {
      const r=this.run;if(!r || r.cancelled || r.deviceChanging)return;
      const tracks = this.run?.stream?.getTracks().filter(t => t.kind === kind);
      if (!tracks?.length){if(kind==='video')return this.switchDevice('video','');return;}
      if(tracks[0].readyState==='ended')return this.switchDevice(kind,'');
      const enabled = !tracks[0].enabled; tracks.forEach(t => { t.enabled = enabled; });
      if(kind==='video')this.run.filters?.setEnabled(enabled);
      const button = this.$(kind === 'audio' ? 'callMic' : 'callCamera'); button.setAttribute('aria-pressed', String(!enabled));
      button.setAttribute('aria-label', kind === 'audio' ? (enabled ? 'Mute microphone' : 'Unmute microphone') : (enabled ? 'Turn camera off' : 'Turn camera on'));
      this.syncControls(r);
    }
    release(r) {
      r.cancelled = true; clearTimeout(r.timer);clearTimeout(r.durationTimer);r.pendingFilter?.stop();r.pendingFilter=null; r.filters?.stop();r.filters=null; r.stream?.getTracks().forEach(t => t.stop());
      r.stateChannel?.close();r.pc?.close();
      if (this.run === r) {
        this.run = null; this.$('localVideo').srcObject = null; this.$('remoteVideo').srcObject = null;
        this.$('callPlaceholder').hidden = false;
        ['callMic', 'callCamera'].forEach(id => { this.$(id).disabled = true; });
        this.$('callFilters').disabled=true;this.$('callFilterPicker').hidden=true;
        this.$('callFilters').setAttribute('aria-expanded','false');this.syncFilterSelection('none');
        ['callSpeaker','callSettings'].forEach(id=>{this.$(id).disabled=true;});this.$('callDevicePicker').hidden=true;
        if(typeof document!=='undefined' && document.fullscreenElement===this.modal.el)document.exitFullscreen?.().catch(()=>{});
      }
    }
    hangup() {
      const r = this.run; if (!r) return;
      this.release(r); this.status('Call ended.');
      if (r.id) this.request(this.path(r) + '/action', 'POST', {action: 'end'}).catch(() => {});
    }
    dispose() {
      this.hangup(); this.modal.close(); this.modal.el.remove();
      window.removeEventListener('pagehide', this.onPageHide);
      navigator.mediaDevices?.removeEventListener?.('devicechange',this.deviceListener);
      if(typeof document!=='undefined')document.removeEventListener?.('fullscreenchange',this.fullscreenListener);
    }
    fail(r, error) {
      if (r.cancelled) return;
      this.release(r); this.status('Call could not continue.');
      const errors = {NotAllowedError: 'Camera or microphone permission was denied. Enable access in your browser and try again.',
        NotFoundError: 'No camera or microphone was found. Connect a device and try again.', NotReadableError: 'Your camera or microphone is busy. Close other apps using it and try again.'};
      this.$('callError').textContent = errors[error.name] || error.message || 'Please try again.';
      if (r.id) this.request(this.path(r) + '/action', 'POST', {action: 'end'}).catch(() => {});
    }
  }
  window.RizzumeVideoRoom = VideoRoom;
})();
