/* WebRTC media stays in the browser. Spring only relays SDP and ICE between authorized peers. */
(() => {
  const {icon, dialog, toast} = window.RizzumeUI;
  class VideoRoom {
    constructor({request, team = false}) {
      this.request = request; this.team = team; this.run = null;
      this.modal = dialog('videoRoom', `<section class="rz-dialog-panel rz-call-panel">
        <div class="rz-dialog-header"><div><h2>Face to face.</h2><p id="callStatus" role="status" aria-live="polite">Ready to connect</p></div><button data-close class="rz-icon-button" aria-label="Close video call">${icon('close')}</button></div>
        <div class="rz-call-videos"><video id="remoteVideo" class="rz-remote-video" autoplay playsinline></video><div id="callPlaceholder" class="rz-call-placeholder">${icon('video')}<p id="callPlaceholderText">Let’s make a connection.</p></div><video id="localVideo" class="rz-local-video" autoplay muted playsinline></video></div>
        <p id="callError" class="rz-call-error" role="alert"></p>
        <button id="callPlayAudio" class="rz-primary" hidden>Enable call audio</button>
        <div class="rz-call-controls"><button id="callMic" aria-label="Mute microphone" aria-pressed="false">${icon('mic')}<span>Microphone</span></button><button id="callCamera" aria-label="Turn camera off" aria-pressed="false">${icon('video')}<span>Camera</span></button><button id="callHangup" class="rz-end-call" aria-label="End call">${icon('phone')}<span>End call</span></button></div>
        <p class="rz-help">Only share your camera when you’re comfortable. This app does not record calls.</p>
      </section>`, () => this.hangup());
      this.$ = id => this.modal.el.querySelector('#' + id);
      this.$('callMic').onclick = () => this.toggle('audio');
      this.$('callCamera').onclick = () => this.toggle('video');
      this.$('callHangup').onclick = () => this.hangup();
      this.$('callPlayAudio').onclick = () => this.$('remoteVideo').play().then(() => { this.$('callPlayAudio').hidden = true; }).catch(() => toast('Allow audio playback in your browser.'));
      this.onPageHide = () => {
        const r = this.run; if (!r) return;
        this.release(r);
        if (r.id) this.request(this.path(r) + '/action', 'POST', {action: 'end'}, {keepalive: true}).catch(() => {});
      };
      window.addEventListener('pagehide', this.onPageHide);
    }
    get busy() { return !!this.run; }
    path(r) { return (this.team ? '/team/calls/' : '/me/calls/') + encodeURIComponent(r.id); }
    status(text) { this.$('callStatus').textContent = text; this.$('callPlaceholderText').textContent = text; }
    async prepare(name) {
      if (this.run) throw new Error('Finish your current call first.');
      const r = {id: null, pc: null, stream: null, timer: null, cancelled: false, seen: new Set(), queue: [], sending: Promise.resolve(), failures: 0};
      this.run = r; this.$('callError').textContent = ''; this.$('callPlaceholder').hidden = false;
      this.$('callPlayAudio').hidden = true;
      ['callMic', 'callCamera'].forEach(id => { this.$(id).setAttribute('aria-pressed', 'false'); this.$(id).disabled = false; });
      this.modal.open(); this.status('Allow camera & microphone to call ' + name);
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
          throw new Error('Video calling requires HTTPS or localhost and a browser with camera support.');
        const config = await this.request(this.team ? '/team/call-config' : '/me/call-config');
        if (r.cancelled) return null;
        if (config.callingEnabled === false) throw new Error('Video calls are not configured yet. Send a message while the team sets up its workspace.');
        const stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 1280}, height: {ideal: 720}}, audio: true});
        if (r.cancelled) { stream.getTracks().forEach(t => t.stop()); return null; }
        r.stream = stream; this.$('localVideo').srcObject = stream;
        r.pc = new RTCPeerConnection({iceServers: config.iceServers});
        stream.getTracks().forEach(track => r.pc.addTrack(track, stream));
        r.pc.onicecandidate = event => {
          if (!event.candidate || r.cancelled) return;
          r.queue.push(event.candidate.toJSON()); this.flush(r);
        };
        r.pc.ontrack = event => {
          if (r.cancelled) return;
          const remote = this.$('remoteVideo'); remote.srcObject = event.streams[0] || new MediaStream([event.track]);
          this.$('callPlaceholder').hidden = true;
          remote.play().catch(() => { this.$('callPlayAudio').hidden = false; });
        };
        r.pc.onconnectionstatechange = () => {
          if (r.cancelled) return;
          if (r.pc.connectionState === 'connected') this.status('Connected · ' + name);
          if (r.pc.connectionState === 'disconnected') this.status('Connection interrupted. Trying to reconnect…');
          if (r.pc.connectionState === 'failed') this.fail(r, new Error('Could not connect. Try another network. A TURN relay may be needed on restricted networks.'));
        };
        if (!config.relayConfigured) this.$('callError').textContent = 'Some networks may need a relay server to connect.';
        return r;
      } catch (error) { this.fail(r, error); return null; }
    }
    async start(profileId, name) {
      if (this.busy) return toast('Finish your current call first.');
      const r = await this.prepare(name); if (!r) return;
      try {
        await r.pc.setLocalDescription(await r.pc.createOffer()); if (r.cancelled) return;
        const call = await this.request('/me/calls', 'POST', {profileId, offer: r.pc.localDescription.sdp});
        r.id = call.id;
        if (r.cancelled) { await this.request(this.path(r) + '/action', 'POST', {action: 'end'}); return; }
        this.status('Calling ' + name + '… Waiting for them to answer.');
        this.flush(r); this.poll(r);
      } catch (error) { this.fail(r, error); }
    }
    async accept(id, name) {
      if (this.busy) return toast('Finish your current call first.');
      const r = await this.prepare(name); if (!r) return;
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
          this.release(r); this.status(call.state === 'declined' ? 'Call declined. You can send a message instead.' : 'Call ended.'); return;
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
    toggle(kind) {
      const tracks = this.run?.stream?.getTracks().filter(t => t.kind === kind); if (!tracks?.length) return;
      const enabled = !tracks[0].enabled; tracks.forEach(t => { t.enabled = enabled; });
      const button = this.$(kind === 'audio' ? 'callMic' : 'callCamera'); button.setAttribute('aria-pressed', String(!enabled));
      button.setAttribute('aria-label', kind === 'audio' ? (enabled ? 'Mute microphone' : 'Unmute microphone') : (enabled ? 'Turn camera off' : 'Turn camera on'));
    }
    release(r) {
      r.cancelled = true; clearTimeout(r.timer); r.stream?.getTracks().forEach(t => t.stop());
      r.pc?.close();
      if (this.run === r) {
        this.run = null; this.$('localVideo').srcObject = null; this.$('remoteVideo').srcObject = null;
        this.$('callPlaceholder').hidden = false;
        ['callMic', 'callCamera'].forEach(id => { this.$(id).disabled = true; });
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
