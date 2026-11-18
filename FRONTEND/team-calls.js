(() => {
  const {icon, toast} = window.RizzumeUI;
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  let current = null, timer, version = 0;
  const $ = id => document.getElementById(id);
  async function request(path, method = 'GET', body, options = {}, key = current?.key) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(API + path, {method, signal:controller.signal, credentials:'include', keepalive:!!options.keepalive,
        headers:{'X-Team-Key':key || '', ...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
      const text = await response.text(), data = text ? JSON.parse(text) : null;
      if (!response.ok) { const error = new Error(data?.message || 'Call request failed.'); error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timeout); }
  }
  // A room captures its original key so changing inbox credentials cannot end a different user's call.
  let room = null;
  async function poll(snapshot, run) {
    if (!current || run !== version) return;
    try {
      const calls = await request('/team/calls?profileId=' + encodeURIComponent(snapshot.profile), 'GET', undefined, {}, snapshot.key);
      if (run !== version) return;
      $('incomingCalls').replaceChildren();
      const incoming = calls.filter(c => c.state === 'ringing');
      $('teamCallStatus').textContent = incoming.length ? `${incoming.length} incoming video call${incoming.length === 1 ? '' : 's'}.` : 'Listening for video calls while this workspace is open.';
      for (const c of incoming) {
        const row = document.createElement('div'); row.className = 'rz-team-incoming';
        row.innerHTML = `<div><strong>Someone wants to connect.</strong><p>Incoming video call · ${new Date(c.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><button class="rz-primary" type="button" data-accept>${icon('video')}Answer</button><button class="rz-outline-button" type="button" data-decline>Decline</button>`;
        row.querySelector('[data-accept]').onclick = async () => {
          if (run !== version) return;
          if (room?.busy) return toast('Finish your current call before answering another.');
          const button = row.querySelector('[data-accept]'); button.disabled = true;
          room ||= new RizzumeVideoRoom({team:true, request:(path, method, body, options) => request(path, method, body, options, snapshot.key)});
          await room.accept(c.id, 'your visitor');
          if (run === version) { clearTimeout(timer); poll(snapshot, run); }
        };
        row.querySelector('[data-decline]').onclick = async () => {
          const button = row.querySelector('[data-decline]'); button.disabled = true;
          try { await request('/team/calls/' + encodeURIComponent(c.id) + '/action', 'POST', {action:'decline'}, {}, snapshot.key); row.remove(); }
          catch (error) { toast(error.message); button.disabled = false; }
        };
        $('incomingCalls').appendChild(row);
      }
    } catch (error) { if (run === version) $('teamCallStatus').textContent = 'Call updates unavailable. ' + error.message; }
    if (run === version) timer = setTimeout(() => poll(snapshot, run), 4000);
  }
  window.RizzumeTeamCalls = {
    reset() {
      version++; current = null; clearTimeout(timer); room?.hangup();
      // Keep one modal; a new request closure is installed for the next selected profile.
      if (room) { room.dispose(); room = null; }
      $('incomingCalls').replaceChildren(); $('teamCallStatus').textContent = '';
    },
    start(snapshot) { this.reset(); current = snapshot; poll(snapshot, version); }
  };
})();
