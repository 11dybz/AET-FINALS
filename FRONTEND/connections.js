/* Requests and connections are server-owned; a like never creates a local match. */
(() => {
  let items = [], loaded = false, error = '', tab = 'accepted', revision = 0, loading = null;
  let drawerOpen = false, returnFocus = null;
  const backgroundInert = new Map();
  const busy = new Set(), $ = id => document.getElementById(id);
  const request = (path,method='GET',data) => apiCall(path,method,data,{admin:false});
  const state = id => items.find(item => item.profile.id === id);
  const active = item => item && ['pending','accepted'].includes(item.status);
  const group = value => items.filter(item => value === 'accepted' ? item.status === 'accepted'
    : item.status === 'pending' && item.direction === value);
  function replace(next) {
    const previous=items; items=next;
    for (const item of previous) if (active(item) && !active(state(item.profile.id))
      && !cardsState.some(p => p.id === item.profile.id)) {
      const profile=PROFILES.find(p => p.id === item.profile.id);
      if (profile) cardsState.push(profile);
    }
  }

  function sync() {
    const previous = matchedProfiles;
    matchedProfiles = group('accepted').map(item => item.profile);
    for (const profile of previous) if (!matchedProfiles.some(p => p.id === profile.id)) {
      if (typeof syncRemovedMatch === 'function') syncRemovedMatch(profile.id);
    }
    cardsState = cardsState.filter(p => !active(state(p.id)));
    updateMatchesUI();
    if (!isSwiping) renderDeck();
    window.RizzumeExperience?.refresh();
    if (typeof chatOpen !== 'undefined' && chatOpen && typeof loadConversations === 'function') loadConversations();
  }
  async function refresh() {
    if (!window.RizzumeAccount?.user) { items=[]; loaded=true; render(); return []; }
    if (loading) return loading;
    const version = revision;
    loading = (async () => {
      try {
        const result = await request('/me/connections');
        if (!Array.isArray(result)) throw new Error('Could not load your connections.');
        if (version !== revision) return items;
        const changed = JSON.stringify(items) !== JSON.stringify(result);
        replace(result); loaded=true; error='';
        if (changed) sync(); else render();
        return items;
      } catch (failure) { error=failure.message; render(); throw failure; }
      finally { loading=null; render(); }
    })();
    return loading;
  }
  async function mutate(profileId,path,data) {
    if (busy.has(profileId)) return null;
    busy.add(profileId); revision++; render();
    try {
      const result=await request(path,'POST',data);
      revision++; replace([result,...items.filter(item => item.profile.id !== profileId)]); loaded=true; error=''; sync();
      return result;
    } catch (failure) {
      // A request may have changed in another tab, or completed while the response was lost.
      loading=null;
      await refresh().catch(() => {});
      throw failure;
    } finally { busy.delete(profileId); render(); }
  }
  async function send(profile,priority=false) {
    if (!profile || isOwnProfile(profile.id)) throw new Error('You cannot connect with yourself.');
    if (!window.RizzumeAccount?.user) { window.location.href='login.html'; return null; }
    if (!window.RizzumeAccount.user.profileId) {
      showToast('Create your profile','Add your profile before sending connection requests.');
      if (typeof openProfileEditor === 'function') openProfileEditor();
      return null;
    }
    const current=state(profile.id);
    if (current?.status === 'accepted') return current;
    if (current?.status === 'pending') {
      if (current.direction === 'incoming') { tab='incoming'; toggleMatchesDrawer(true); }
      else showToast('Request pending','You can cancel it from Connections → Sent.');
      return current;
    }
    const result=await mutate(profile.id,'/me/connection-requests/'+encodeURIComponent(profile.id),{priority});
    if (result?.status === 'pending') showToast(result.ownerAvailable === false ? 'Request saved' : 'Request sent',
      result.ownerAvailable === false ? 'Waiting for this profile’s owner to activate their account.' : 'They can accept or decline. Chat opens after acceptance.');
    return result;
  }
  async function action(id,value) {
    const result=await mutate(id,'/me/connections/'+encodeURIComponent(id)+'/action',{action:value});
    if (!result) return null;
    if (value === 'accept') { toggleMatchesDrawer(false); handleMatchSuccess(result.profile,result.priority); }
    else showToast(value === 'remove' ? 'Connection removed' : value === 'cancel' ? 'Request cancelled' : 'Request declined',
      value === 'remove' ? 'Messaging and calls are closed for both people.' : 'Your connections are up to date.');
    return result;
  }
  function render() {
    if (!$('matchesList')) return;
    for (const name of ['accepted','incoming','outgoing']) {
      const button=document.querySelector('[data-connection-tab="'+name+'"]');
      if (button) { button.setAttribute('aria-pressed',String(tab === name)); button.querySelector('span').textContent=String(group(name).length); }
    }
    const status=$('connectionStatus');
    status.textContent=error ? 'Could not refresh. '+error : !loaded ? 'Loading your connections…' : '';
    $('refreshConnections').disabled=!!loading;
    const list=$('matchesList'), rows=group(tab), focused=document.activeElement;
    const focusId=focused?.dataset?.focusId, focusAction=focused?.dataset?.focusAction;
    list.replaceChildren(); list.setAttribute('aria-busy',String(!loaded && !!loading));
    if (!window.RizzumeAccount?.user?.profileId) {
      const box=document.createElement('div'); box.className='rz-connections-empty';
      box.innerHTML='<strong>Let people know who you are.</strong><p>Create your profile to send and receive connection requests.</p>';
      const button=document.createElement('button'); button.type='button'; button.className='rz-primary'; button.textContent='Create my profile';
      button.onclick=() => { toggleMatchesDrawer(false); openProfileEditor(); }; box.appendChild(button); list.appendChild(box);
    } else if (loaded && !rows.length) {
      const box=document.createElement('div'); box.className='rz-connections-empty';
      const titles={accepted:'Your next collaboration starts here.',incoming:'No incoming requests.',outgoing:'No pending requests sent.'};
      const descriptions={accepted:'Send a request from a profile. Once they accept, you can message and call each other.',
        incoming:'Requests from other people will appear here for you to accept or decline.',outgoing:'Requests you send stay here until they are accepted, declined, or cancelled.'};
      const strong=document.createElement('strong'); strong.textContent=titles[tab]; const p=document.createElement('p'); p.textContent=descriptions[tab]; box.append(strong,p); list.appendChild(box);
    }
    for (const item of rows) {
      const p=item.profile, row=document.createElement('article'); row.className='rz-connection-row';
      const info=document.createElement('button'); info.type='button'; info.className='rz-match-open';
      info.dataset.focusId=p.id; info.dataset.focusAction='view';
      info.innerHTML=`<span class="member-avatar" aria-hidden="true"><span>${escapeHtml(profileInitials(p.name))}</span><img data-profile-photo alt="" hidden></span><span class="rz-match-copy"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.role || 'Open to collaborate')}</span></span>`;
      setProfilePhoto(info.querySelector('[data-profile-photo]'), safeImageUrl(p.images?.[0]?.url || p.image));
      info.onclick=() => { toggleMatchesDrawer(false); openProfileScreen(p); }; row.appendChild(info);
      const meta=document.createElement('p'); meta.className='rz-connection-meta';
      meta.textContent=(item.priority ? 'Priority request · ' : '')+(tab === 'accepted' ? 'Connected' : tab === 'incoming' ? 'Wants to connect with you' : 'Waiting for a reply');
      if (tab === 'outgoing' && item.ownerAvailable === false) meta.textContent='Waiting for this profile’s owner to activate their account.';
      row.appendChild(meta);
      const actions=document.createElement('div'); actions.className='rz-connection-actions';
      const controls=tab === 'accepted' ? [['message','Message'],['remove','Remove']]
        : tab === 'incoming' ? [['accept','Accept'],['decline','Decline']] : [['cancel','Cancel request']];
      for (const [value,label] of controls) {
        const button=document.createElement('button'); button.type='button'; button.textContent=busy.has(p.id) ? 'Please wait…' : label;
        button.dataset.focusId=p.id; button.dataset.focusAction=value; button.disabled=busy.has(p.id);
        button.className=['accept','message'].includes(value) ? 'rz-primary' : 'rz-outline-button';
        button.setAttribute('aria-label',label+' '+p.name);
        button.onclick=async () => {
          if (value === 'message') { toggleMatchesDrawer(false); return openChat(p.id); }
          if (value === 'remove') return askToRemoveMatch(p.id);
          try { await action(p.id,value); } catch (failure) { showToast('Could not update request',failure.message); }
        };
        actions.appendChild(button);
      }
      row.appendChild(actions); list.appendChild(row);
    }
    if (focusId && drawerOpen) {
      const replacement=[...list.querySelectorAll('button')].find(b => b.dataset.focusId === focusId && b.dataset.focusAction === focusAction);
      (replacement || document.querySelector('[data-connection-tab="'+tab+'"]'))?.focus();
    }
  }
  function drawerState(show) {
    const wasOpen=drawerOpen;
    drawerOpen=show; const drawer=$('matchesDrawer'); drawer.inert=!show; drawer.setAttribute('aria-hidden',String(!show));
    if (show) {
      if (!wasOpen) {
        returnFocus=document.activeElement;
        for (const element of document.body.children) {
          if (element === drawer || element.id === 'matchesDrawerBackdrop' || element.matches('script,style,link,.rz-dialog')) continue;
          backgroundInert.set(element,element.inert); element.inert=true;
        }
      }
      render(); drawer.querySelector('[data-close-connections]').focus(); refresh().catch(() => {});
    } else {
      for (const [element,value] of backgroundInert) element.inert=value;
      backgroundInert.clear(); returnFocus?.focus?.();
    }
  }
  function open(value='accepted') { tab=value; toggleMatchesDrawer(true); }
  document.querySelectorAll('[data-connection-tab]').forEach(button => button.onclick=() => { tab=button.dataset.connectionTab; render(); });
  $('refreshConnections').onclick=() => refresh().catch(() => {});
  $('matchesDrawer').inert=true;
  document.addEventListener('keydown',event => {
    if (!drawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); toggleMatchesDrawer(false); }
    if (event.key === 'Tab') {
      const controls=[...$('matchesDrawer').querySelectorAll('button,a[href],input')].filter(el => !el.disabled && !el.hidden);
      const first=controls[0], last=controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.RizzumeConnections={refresh,send,action,render,drawerState,open,state,
    discoverable:id => !active(state(id)), get items() {return items;}};
})();
