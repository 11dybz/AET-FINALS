/* Incoming calls ring locally; no microphone access or sound download is needed. */
(() => {
  class CallAlert {
    constructor({onBlocked=()=>{}}={}) {
      this.onBlocked=onBlocked; this.nodes=new Set(); this.current=null;
      this.gesture=()=>this.unlock();
      document.addEventListener('pointerdown',this.gesture,{passive:true});
      document.addEventListener('keydown',this.gesture);
      this.pagehide=()=>this.stop(); window.addEventListener('pagehide',this.pagehide);
    }
    unlock() {
      try {
        const Context=window.AudioContext || window.webkitAudioContext;
        if (!Context) { this.onBlocked(true); return; }
        this.audio ||= new Context();
        if (this.audio.state !== 'running') this.audio.resume().then(()=>{
          this.onBlocked(this.audio.state !== 'running');
          if (this.current && this.audio.state === 'running') this.ring();
        }).catch(()=>this.onBlocked(true));
        else this.onBlocked(false);
      } catch (_) { this.onBlocked(true); }
    }
    start(call,{name='Your connection',desktop=false,onOpen=()=>{}}={}) {
      if (this.current?.id === call.id) return;
      this.stop();
      this.current={id:call.id};
      const remaining=Date.parse(call.createdAt)+90000-Date.now();
      if (Number.isFinite(remaining) && remaining<=0) { this.stop(); return; }
      this.expiry=setTimeout(()=>this.stop(),Number.isFinite(remaining)?remaining:90000);
      if (desktop && window.Notification?.permission === 'granted') {
        try {
          this.notification=new window.Notification('Incoming Rizzume call',{body:name+' is calling you.',tag:'rizzume-call-'+call.id,requireInteraction:true});
          this.notification.onclick=()=>{ window.focus(); onOpen(); this.notification?.close(); };
        } catch (_) {}
      }
      this.unlock(); this.ring();
    }
    ring() {
      clearTimeout(this.timer);
      if (!this.current) return;
      if (this.audio?.state === 'running') {
        try {
          // A quiet double ring every three seconds, with fades to avoid clicks.
          for (const offset of [0,.4]) {
            const oscillator=this.audio.createOscillator(), gain=this.audio.createGain(), start=this.audio.currentTime+offset;
            oscillator.type='sine'; oscillator.frequency.value=660;
            gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.12,start+.025);
            gain.gain.setValueAtTime(.12,start+.22); gain.gain.linearRampToValueAtTime(0,start+.3);
            oscillator.connect(gain); gain.connect(this.audio.destination);
            this.nodes.add(oscillator);
            oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.nodes.delete(oscillator);};
            oscillator.start(start); oscillator.stop(start+.32);
          }
          this.onBlocked(false);
        } catch (_) { this.onBlocked(true); }
      } else this.onBlocked(true);
      this.timer=setTimeout(()=>this.ring(),3000);
    }
    stop() {
      this.current=null; clearTimeout(this.timer); clearTimeout(this.expiry);
      for (const node of this.nodes) { try {node.stop();} catch (_) {} }
      this.nodes.clear(); this.notification?.close(); this.notification=null; this.onBlocked(false);
    }
    dispose() {
      this.stop(); document.removeEventListener('pointerdown',this.gesture); document.removeEventListener('keydown',this.gesture);
      window.removeEventListener('pagehide',this.pagehide); this.audio?.close().catch(()=>{});
    }
  }
  window.RizzumeCallAlert=CallAlert;
})();
