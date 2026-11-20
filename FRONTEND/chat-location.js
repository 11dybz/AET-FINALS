/* Temporary location attachments. Coordinates stay out of ordinary message text. */
(() => {
  const {icon, dialog, toast} = window.RizzumeUI;
  const $ = id => document.getElementById(id);
  const request = (path, method = 'GET', body) => apiCall(path, method, body, {admin:false});
  const cards = new Map();
  let timer, generation = 0, point = null, target = null, sending = false;
  function valid(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  function urls(lat, lon) {
    const bounds = [Math.max(-180,lon-.012),Math.max(-90,lat-.012),Math.min(180,lon+.012),Math.min(90,lat+.012)].join(',');
    return {map:`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds)}&layer=mapnik&marker=${lat}%2C${lon}`,
      directions:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat+','+lon)}`};
  }
  function frame(lat, lon, title) {
    const map = document.createElement('iframe'); map.className = 'rz-chat-map'; map.title = title;
    map.loading = 'lazy'; map.referrerPolicy = 'no-referrer'; map.src = urls(lat,lon).map;
    return map;
  }
  const picker = dialog('chatLocationPicker', `<section class="rz-dialog-panel rz-location-picker">
    <div class="rz-dialog-header"><div><div class="rz-eyebrow">Meet somewhere great</div><h2>Share a location</h2><p id="locationRecipient"></p></div><button type="button" data-close class="rz-icon-button" aria-label="Close location sharing">${icon('close')}</button></div>
    <div id="chatLocationPreview" class="rz-location-preview"></div>
    <button id="chatLocate" type="button" class="rz-outline-button">${icon('pin')}Use my location</button>
    <div class="rz-location-fields"><label for="chatLocationName">Place name or label<input id="chatLocationName" maxlength="100" value="My approximate location" placeholder="e.g. Near PLM campus"></label>
    <label for="chatLocationDuration">Share for<select id="chatLocationDuration"><option value="15">15 minutes</option><option value="60">1 hour</option></select></label></div>
    <p class="rz-help">Shares a fixed approximate pin, not live movement. The map disappears from chat when time runs out or you stop sharing. Anyone who has already viewed it may remember or save it. Map previews use OpenStreetMap.</p>
    <p id="chatLocationStatus" class="rz-location-feedback" role="status"></p>
    <div class="rz-dialog-actions"><button type="button" data-close class="rz-outline-button">Cancel</button><button id="chatShareLocation" type="button" class="rz-primary" disabled>${icon('message')}Share location</button></div>
  </section>`, () => { generation++; point = null; target = null; $('chatLocationPreview').replaceChildren(); }, {canClose:() => !sending});

  function chosen(lat, lon) {
    if (!valid(lat,lon)) { $('chatLocationStatus').textContent = 'Could not read a valid location. Try again.'; return; }
    point = {latitude:+lat.toFixed(3), longitude:+lon.toFixed(3)};
    $('chatLocationPreview').replaceChildren(frame(point.latitude,point.longitude,'Preview of your approximate location'));
    $('chatLocationStatus').textContent = 'Preview ready. Your location has not been shared yet.';
    $('chatShareLocation').disabled = false;
  }
  function open(initial) {
    if (!chatOpen || !chatProfileId || !chatThreadReady) return toast('Open a connected conversation before sharing a location.');
    generation++; point = null; target = chatProfileId;
    $('locationRecipient').textContent = 'Only in your conversation with ' + chatProfileName;
    $('chatLocationName').value = 'My approximate location'; $('chatLocationDuration').value = '15';
    $('chatLocationStatus').textContent = ''; $('chatShareLocation').disabled = true; $('chatLocate').disabled = false;
    $('chatLocationPreview').innerHTML = `<span>${icon('pin')}</span><strong>Your next meeting spot</strong><p>Use your device location to preview an approximate pin.</p>`;
    picker.open();
    if (initial && valid(initial.latitude,initial.longitude)) chosen(initial.latitude,initial.longitude);
  }
  $('chatLocate').onclick = () => {
    if (!navigator.geolocation) { $('chatLocationStatus').textContent = 'Location is not supported by this browser.'; return; }
    const version = ++generation; $('chatLocate').disabled = true; point = null; $('chatShareLocation').disabled = true;
    $('chatLocationStatus').textContent = 'Waiting for location permission…';
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== generation || picker.el.hidden) return;
      $('chatLocate').disabled = false; chosen(position.coords.latitude,position.coords.longitude);
    }, error => {
      if (version !== generation || picker.el.hidden) return;
      $('chatLocate').disabled = false;
      $('chatLocationStatus').textContent = error.code === 1 ? 'Location permission was denied. Allow location access in your browser settings, then try again.'
        : error.code === 3 ? 'Finding your location took too long. Please try again.' : 'Your location is unavailable. Please try again.';
    }, {enableHighAccuracy:false, timeout:12000, maximumAge:60000});
  };
  $('chatShareLocation').onclick = async () => {
    if (!point || sending) return;
    if (!chatOpen || chatProfileId !== target || !chatThreadReady) { picker.close(); return toast('Open the conversation again to share your location.'); }
    const name = $('chatLocationName').value.trim();
    if (!name) { $('chatLocationStatus').textContent = 'Add a place name or label.'; $('chatLocationName').focus(); return; }
    const profile = target;
    sending = true; $('chatShareLocation').disabled = true; $('chatLocate').disabled = true;
    $('chatLocationStatus').textContent = 'Sharing your location…';
    try {
      await request(`/me/conversations/${encodeURIComponent(profile)}/locations`, 'POST', {...point,name,minutes:Number($('chatLocationDuration').value)});
      sending = false; picker.close(); toast('Location shared. You can stop sharing from its chat card.');
      if (chatOpen && chatProfileId === profile) await pollChatMessages();
    } catch (error) { $('chatLocationStatus').textContent = error.message || 'Could not share your location. Try again.'; }
    finally { sending = false; $('chatShareLocation').disabled = !point; $('chatLocate').disabled = false; }
  };

  function remaining(card) { return Math.max(0,card.remaining - (performance.now() - card.received)); }
  function tick(card, checkConnected = true) {
    if (checkConnected && !card.element.isConnected) { cards.delete(card.id); return; }
    if (card.state !== 'active') return;
    const seconds = Math.ceil(remaining(card)/1000);
    if (!seconds) { end(card,'expired'); return; }
    card.status.textContent = `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;
  }
  function end(card, state) {
    card.state = state; card.element.dataset.state = state; card.element.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = state === 'expired' ? 'Location sharing expired' : 'Location sharing stopped';
    const help = document.createElement('p'); help.textContent = 'This location is no longer available.';
    card.element.append(heading,help); card.signature = null;
  }
  function apply(card, message) {
    // A delayed poll must never restore a pin after a stop response or local expiry.
    if (card.state === 'stopped' || card.state === 'expired') return;
    const location = message.location;
    if (!location) return;
    if (location.state !== 'active' || !valid(location.latitude,location.longitude)) { end(card,location.state === 'expired' ? 'expired' : 'stopped'); return; }
    card.remaining = Date.parse(location.expiresAt) - Date.parse(location.serverNow);
    card.received = performance.now(); card.state = 'active'; card.element.dataset.state = 'active';
    if (!Number.isFinite(card.remaining) || card.remaining <= 0) { end(card,'expired'); return; }
    const signature = JSON.stringify([location.latitude,location.longitude,location.name,message.sender]);
    if (signature !== card.signature) {
      card.signature = signature; card.element.replaceChildren();
      card.element.appendChild(frame(location.latitude,location.longitude,'Shared location: '+(location.name || 'Approximate area')));
      const copy = document.createElement('div'); copy.className = 'rz-location-card-copy';
      const heading = document.createElement('strong'); heading.textContent = location.name || 'Approximate location';
      const detail = document.createElement('p'); detail.textContent = 'Approximate location · Fixed pin';
      card.status = document.createElement('span'); card.status.className = 'rz-location-countdown';
      const actions = document.createElement('div'); actions.className = 'rz-location-card-actions';
      const directions = document.createElement('a'); directions.href = urls(location.latitude,location.longitude).directions;
      directions.target = '_blank'; directions.rel = 'noopener noreferrer'; directions.textContent = 'Open directions'; actions.appendChild(directions);
      if (message.sender === 'visitor') {
        const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop sharing';
        stop.onclick = async () => {
          stop.disabled = true;
          try {
            const result = await request(`/me/conversations/${encodeURIComponent(card.profile)}/locations/${encodeURIComponent(card.id)}/stop`,'POST');
            if (cards.get(card.id) === card) apply(card,result);
          } catch (error) { toast(error.message || 'Could not stop sharing. Please try again.'); stop.disabled = false; }
        };
        actions.appendChild(stop);
      }
      copy.append(heading,detail,card.status,actions); card.element.appendChild(copy);
    }
    tick(card,false);
  }
  function render(container, message, profile) {
    const element = document.createElement('section'); element.className = 'rz-location-card';
    element.setAttribute('aria-label','Shared location'); container.appendChild(element);
    const card = {id:String(message.id),profile,element,signature:null}; cards.set(card.id,card); apply(card,message);
    if (!timer) timer = setInterval(() => { cards.forEach(tick); if (!cards.size) { clearInterval(timer); timer = null; } },1000);
  }
  async function refresh(profile, threadGeneration) {
    const visible = [...cards.values()].filter(card => card.profile === profile && card.element.isConnected);
    if (!visible.length) return;
    let messages;
    try { messages = await request(`/me/conversations/${encodeURIComponent(profile)}/locations`); }
    catch (error) {
      if (chatOpen && chatProfileId === profile && chatGeneration === threadGeneration && (error.status === 401 || error.status === 403))
        visible.forEach(card => end(card,'stopped'));
      throw error;
    }
    if (!chatOpen || chatProfileId !== profile || chatGeneration !== threadGeneration) return;
    if (!Array.isArray(messages)) throw new Error('Could not refresh location sharing.');
    const byId = new Map(messages.map(message => [String(message.id),message]));
    for (const card of visible) {
      if (cards.get(card.id) !== card) continue;
      const message = byId.get(card.id); if (message) apply(card,message); else end(card,'stopped');
    }
  }
  function reset() {
    cards.forEach(card => card.element.replaceChildren()); cards.clear(); clearInterval(timer); timer = null;
    if (!sending) picker.close();
  }
  window.addEventListener('pagehide',reset);
  window.RizzumeLocations = {open,render,refresh,reset,valid,urls};
})();
