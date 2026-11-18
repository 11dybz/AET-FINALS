(() => {
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  let generation = 0, active = null, sending = false, refreshTimer;
  function status(text) { $('inboxStatus').textContent = text; }
  function reset() {
    clearTimeout(refreshTimer);
    window.RizzumeTeamCalls?.reset();
    generation++; active = null; $('teamThread').classList.add('hidden');
    $('teamMessages').replaceChildren(); $('conversationList').replaceChildren(); $('teamReply').value = '';
    status('Load conversations for the selected profile.');
  }
  async function call(path, key, method = 'GET', body) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API + path, {method, credentials: 'include', signal: controller.signal,
        headers: {'X-Team-Key': key, ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {})});
      const text = await response.text(); const result = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(result?.message || 'Request failed (' + response.status + ')');
      return result;
    } finally { clearTimeout(timeout); }
  }
  $('teamProfile').onchange = reset; $('teamKey').oninput = reset;
  $('loadInbox').onclick = async () => {
    reset(); const version = generation, key = $('teamKey').value, profile = $('teamProfile').value;
    if (!key) return status('Enter the team key.');
    status('Loading conversations...');
    try {
      const items = await call('/team/conversations?profileId=' + encodeURIComponent(profile), key);
      if (version !== generation) return;
      window.RizzumeTeamCalls?.start({profile, key});
      status(items.length ? 'Select a conversation.' : 'No conversations for this profile.');
      items.forEach(item => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'min-h-11 p-3 rounded-xl border bg-white text-left';
        button.textContent = item.profile.name + ' - ' + (item.lastMessage?.body || 'No messages');
        button.onclick = async () => {
          const thread = {session: item.sessionId, profile: item.profile.id, key, version, button};
          active = thread; $('teamReply').value = ''; $('teamMessages').replaceChildren();
          $('teamThread').classList.remove('hidden');
          try { await refresh(thread); } catch (error) { if (active === thread) status(error.message); }
        };
        $('conversationList').appendChild(button);
      });
    } catch (error) { if (version === generation) status(error.message); }
  };
  function path(thread) {
    return '/team/conversations/' + encodeURIComponent(thread.session) + '/' + encodeURIComponent(thread.profile) + '/messages';
  }
  async function refresh(thread) {
    clearTimeout(refreshTimer);
    const messages = await call(path(thread), thread.key);
    if (active !== thread || generation !== thread.version) return;
    const log = $('teamMessages'); log.replaceChildren();
    messages.forEach(message => {
      const p = document.createElement('p'); p.className = 'mb-2 whitespace-pre-wrap break-words';
      if (window.RizzumeUI?.messageBody) window.RizzumeUI.messageBody(p, message.sender + ': ' + message.body);
      else p.textContent = message.sender + ': ' + message.body;
      log.appendChild(p);
    });
    log.scrollTop = log.scrollHeight; status('Conversation loaded.');
    refreshTimer = setTimeout(() => {
      if (active === thread && generation === thread.version && !document.hidden)
        refresh(thread).catch(error => { if (active === thread) status(error.message + ' Reload conversations to retry.'); });
    }, 4000);
  }
  $('sendReply').onclick = async () => {
    if (sending || !active) return;
    const body = $('teamReply').value.trim(); if (!body) return;
    const thread = active; sending = true; $('sendReply').disabled = true;
    try {
      await call(path(thread), thread.key, 'POST', {body});
      if (active !== thread) return;
      $('teamReply').value = ''; status('Reply sent.');
      thread.button.textContent = 'Reply: ' + body;
      // A refresh error must not make a successfully delivered reply look unsent.
      try { await refresh(thread); } catch (_) { status('Reply sent. Reload conversations to refresh the thread.'); }
    } catch (error) { if (active === thread) status(error.message); }
    finally { sending = false; $('sendReply').disabled = false; }
  };
  call('/profiles', '').then(profiles => {
    const select = $('teamProfile'); select.replaceChildren();
    profiles.forEach(profile => {
      const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.name; select.appendChild(option);
    }); reset();
  }).catch(error => status(error.message));
  if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active) refresh(active).catch(error => status(error.message));
  });
  if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
})();
