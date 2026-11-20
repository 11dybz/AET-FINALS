/* Snap owns AR rendering; VideoRoom owns the microphone and original camera. */
(() => {
  let kitPromise, sessionOwner, sessionCleanup = Promise.resolve();
  async function loadKit() {
    if (!kitPromise) kitPromise = (async () => {
      const {default: config} = await import('./camera-kit-config.js');
      if (!config.apiToken || !config.lensGroupIds?.length) throw new Error('Snap lenses are not configured.');
      const sdk = await import('./vendor/camera-kit-1.14.0.js');
      const kit = await sdk.bootstrapCameraKit({apiToken: config.apiToken});
      return {kit, sdk, config};
    })().catch(error => { kitPromise = null; throw error; });
    return kitPromise;
  }
  class SnapFilters {
    static async loadLenses() {
      const {kit, config} = await loadKit();
      const {lenses} = await kit.lensRepository.loadLensGroups(config.lensGroupIds);
      if (!lenses.length) throw new Error('No Snap lenses are available yet.');
      return lenses.slice(0, 50);
    }
    constructor(source, {onError = () => {}, load = loadKit} = {}) {
      this.provider = 'snap'; this.source = source; this.onError = onError; this.closed = false;
      this.load = load;
    }
    async start() {
      const {kit, sdk} = await this.load();
      await sessionCleanup;
      if (this.closed) return;
      if (sessionOwner) throw new Error('Snap camera is already in use.');
      sessionOwner = this;
      this.sdk = sdk;
      this.creating = Promise.resolve().then(() => kit.createSession());
      const session = await this.creating;
      if (this.closed) return;
      this.session = session;
      // Lens audio must never bypass the call's microphone controls.
      session.mute();
      session.events.addEventListener('error', () => { if (!this.closed) {this.failed=true;this.onError();} });
      await session.setFPSLimit(30);
      if (this.closed) return;
      await this.replaceSource(this.source);
      if (this.closed) return;
      await session.play('capture');
      if (this.closed) return;
      this.stream = session.output.capture.captureStream(30);
      this.setEnabled(this.source.getVideoTracks()[0]?.enabled !== false);
    }
    async select(lens) {
      if (this.closed || this.failed || !this.session) throw new Error('Snap session ended.');
      if (!await this.session.applyLens(lens)) throw new Error('Lens could not be applied.');
    }
    async replaceSource(stream) {
      if (this.closed) return;
      const original = stream.getVideoTracks()[0];
      if (!original) throw new Error('A camera is required for Snap lenses.');
      const clone = original.clone();
      this.pendingInput = clone;
      try {
        const input = this.sdk.createMediaStreamSource(new MediaStream([clone]), {cameraType: original.getSettings?.().facingMode==='environment'?'environment':'user'});
        await this.session.setSource(input);
        if (this.closed) { clone.stop(); return; }
        this.inputTrack?.stop(); this.inputTrack = clone; this.source = stream;
      } catch (error) { clone.stop(); throw error; }
      finally { if(this.pendingInput===clone)this.pendingInput=null; }
    }
    setEnabled(enabled) {
      if (this.inputTrack) this.inputTrack.enabled = enabled;
      this.stream?.getVideoTracks().forEach(track => { track.enabled = enabled; });
    }
    stop() {
      if (this.closed) return this.stopping;
      this.closed = true; this.setEnabled(false);
      this.stream?.getTracks().forEach(track => track.stop());
      this.inputTrack?.stop();
      this.pendingInput?.stop();
      if (this.creating) {
        this.stopping = this.creating.then(session => session.destroy()).catch(() => {}).finally(() => {
          if (sessionOwner===this) sessionOwner=null;
        });
        sessionCleanup = this.stopping;
      }
      return this.stopping;
    }
  }
  window.RizzumeSnapFilters = SnapFilters;
})();
