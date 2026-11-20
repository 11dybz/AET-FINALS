(() => {
  const {icon, dialog, toast} = window.RizzumeUI;
  const $ = id => document.getElementById(id);
  const request = (path, method = 'GET', data, options = {}) => apiCall(path, method, data, {...options, admin: false});
  let mode = 'swipe', feed = [], unread = 0, latestId = null, pollTimer, polling = false, ready = false;
  let feedLoaded = false, feedError = false;
  let notifyBrowser = false, filter = 'all', location = null;
  try { notifyBrowser = localStorage.getItem('rzBrowserNotifications') === 'true'; } catch (_) {}

  const qrSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/></svg>`;

  const shell = document.createElement('div');
  shell.innerHTML = `
    <aside class="rz-sidebar" aria-label="Main navigation">
      <div class="rz-sidebar-head"><a class="rz-logo" href="index.html" aria-label="Rizzume home">${icon('flame')}rizzume<small>PORTFOLIO</small></a><p>A little spark. Your next big project.</p></div>
      <div class="rz-sidebar-scroll"><nav class="rz-nav">
        <button data-nav="swipe" aria-current="page">${icon('discover')}Discover</button>
        <button data-nav="directory">${icon('grid')}Explore all members</button>
        <button data-nav="matches">${icon('heart')}Connections<span id="sidebarMatchCount" class="rz-pill">0</span></button>
        <button data-nav="messages">${icon('message')}Messages<span id="sidebarMessageCount" class="rz-pill" hidden>0</span></button>
      </nav>
      <div class="rz-sidebar-label">Your connections <span>Made for building</span></div>
      <div id="sidebarMatches" class="rz-match-preview"></div>
      <div id="sidebarEmpty" class="rz-sidebar-empty">Good projects start with a hello.<br>Send a request to connect.</div></div>
      <div class="rz-sidebar-footer"><div id="sidebarAccount" class="rz-account-summary"></div><button id="sidebarLogout" type="button" class="rz-account-logout">Log out</button><a href="team-inbox.html">${icon('lock')}Team workspace ${icon('arrow')}</a><p>Find your people. Build something great.<br>Rizzume · Online portfolio showcase</p></div>
    </aside>
    <header class="rz-topbar"><div class="rz-breadcrumb">Your workspace <span>/</span> <strong id="rzBreadcrumb">Discover</strong></div>
      <div class="rz-top-actions"><button id="topLocation" class="rz-location-button">${icon('pin')}<span id="topLocationLabel">Explore locations</span></button><button id="topNotifications" class="rz-icon-button" aria-label="Open notifications">${icon('bell')}<span id="topNotificationBadge" class="rz-badge" hidden></span></button><button id="topQr" class="rz-icon-button" aria-label="Scan QR Code" title="Scan Member QR Code">${qrSvg}</button><button id="topHelp" class="rz-icon-button" aria-label="How Rizzume works">${icon('spark')}</button><button id="accountMenuButton" class="rz-avatar" type="button" aria-label="Your account">You</button></div>
    </header>
    <div class="rz-heading" id="discoveryHeading"><div><div class="rz-eyebrow">Great people. Greater possibilities.</div><h2>Find your next connection<span style="color:#fe3c72">.</span></h2><p>Meet the minds behind the code. See who clicks.</p></div><button id="discoveryFilters" class="rz-outline-button">${icon('settings')}Preferences</button></div>
    <aside id="discoveryTip" class="rz-tip"><div class="rz-tip-art">${icon('spark')}</div><h3>Great things start<br>with a right swipe.</h3><p>Find a skill that clicks.<br>Send a request. Say hello.<br>Build something together.</p><hr><div class="rz-status">Open for collaboration</div><small>Profiles are saved to your matches.<br>A saved profile isn’t a mutual match.</small></aside>
    <nav class="rz-mobile-nav" aria-label="Mobile navigation"><button data-nav="swipe" aria-current="page">${icon('discover')}Discover</button><button data-nav="directory">${icon('grid')}Explore</button><button data-nav="matches">${icon('heart')}Matches</button><button data-nav="messages">${icon('message')}Messages</button><button data-nav="location">${icon('map')}Map</button></nav>`;
  document.body.classList.add('rizzume-app');
  while (shell.firstChild) document.body.insertBefore(shell.firstChild, $('homeScreen'));
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $('topLocation').onclick = () => openMap();
  $('topNotifications').onclick = () => openNotifications();
  $('topQr').onclick = () => openQrScanner();
  $('topHelp').onclick = () => toggleInfoModal();

  const accountMenu = dialog('accountMenu', `<section class="rz-dialog-panel">
    <div class="rz-dialog-header"><div><h2>Your account</h2><p id="accountEmail"></p></div><button data-close class="rz-icon-button" aria-label="Close account menu">${icon('close')}</button></div>
    <p id="accountName" style="font-weight:800"></p>
    <div id="accountSetupPrompt" class="rounded-2xl p-3.5 bg-pink-50 border border-pink-200 text-xs text-zinc-700 space-y-2 my-2" hidden>
      <p class="font-extrabold text-tinder-pink">Your developer card isn't set up yet!</p>
      <p class="leading-relaxed">Click the <strong>+</strong> button in the lower-right corner of the Discover screen (or tap below) to customize your profile and join the deck.</p>
    </div>
    <p id="accountStandardHelp" class="rz-help">Your profile, matches, and conversations are saved to this account.</p>
    <div class="rz-dialog-actions">
      <button id="accountProfile" type="button" class="rz-primary">Customize my profile</button>
      <button id="accountResume" type="button" class="rz-outline-button" title="Export your saved profile">Download resume PDF</button>
    </div>
  </section>`);

  function syncFloatingProfileButton() {
    const wrap = $('floatingProfileWrap');
    const hint = $('floatingProfileHint');
    if (!wrap) return;
    const user = window.RizzumeAccount?.user;
    if (!user || mode !== 'swipe') {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const hasProfile = Boolean(user.profileId);
    if (hint) {
      hint.textContent = hasProfile ? 'Edit my card' : 'Customize profile';
      hint.classList.toggle('animate-bounce', !hasProfile);
    }
  }

  function refreshAccount() {
    const user = window.RizzumeAccount?.user; if (!user) return;
    const hasProfile = Boolean(user.profileId);
    $('accountName').textContent = user.name;
    $('accountEmail').textContent = user.email;
    $('accountResume').disabled = !hasProfile;
    $('accountResume').hidden = !hasProfile;
    $('accountSetupPrompt').hidden = hasProfile;
    $('accountStandardHelp').hidden = !hasProfile;
    $('accountProfile').textContent = hasProfile ? 'Edit my profile' : 'Create my profile';
    $('accountMenuButton').textContent = user.name.trim().split(/\s+/).slice(0,2).map(part => Array.from(part)[0]).join('').toUpperCase();
    $('accountMenuButton').title = hasProfile ? `${user.name} • Edit Profile` : `${user.name} • Profile not set up yet`;
    $('sidebarAccount').replaceChildren();
    const name = document.createElement('strong'); name.textContent = user.name;
    const email = document.createElement('span'); email.textContent = user.email; $('sidebarAccount').append(name,email);
    syncFloatingProfileButton();
  }

  $('accountMenuButton').onclick = () => {
    refreshAccount();
    const user = window.RizzumeAccount?.user;
    if (user && !user.profileId) {
      startMode('swipe');
      const fab = $('floatingProfileBtn');
      if (fab) {
        fab.classList.add('ring-4', 'ring-tinder-pink/40', 'scale-110');
        setTimeout(() => fab.classList.remove('ring-4', 'ring-tinder-pink/40', 'scale-110'), 1800);
      }
      toast('Input your details first! Tap the + button in the lower right to customize your profile.');
    }
    accountMenu.open();
  };

  async function openOwnProfile() {
    accountMenu.close();
    if (!backendAvailable) return toast('Connect to Rizzume before managing your profile.');
    try {
      const user = window.RizzumeAccount.user;
      if (!user.profileId) return openProfileEditor();
      const cached = PROFILES.find(p => p.id === user.profileId);
      if (cached) return openProfileEditor(cached);
      const profile = await request('/me/profile');
      openProfileEditor(profile);
    } catch (error) { toast(error.message); }
  }
  $('accountProfile').onclick = openOwnProfile;
  if ($('floatingProfileBtn')) $('floatingProfileBtn').onclick = openOwnProfile;

  $('accountResume').onclick = async () => {
    try { if (await window.RizzumeResume.download($('accountResume'))) toast('Your resume PDF has been downloaded.'); }
    catch (error) { toast(error.message); }
  };
  let loggingOut = false;
  const logoutConfirmation = dialog('logoutConfirmation', `<section class="rz-dialog-panel rz-logout-panel" aria-describedby="logoutDescription">
    <div class="rz-dialog-header"><h2>Log out?</h2><button type="button" data-close class="rz-icon-button" aria-label="Close logout confirmation">${icon('close')}</button></div>
    <p id="logoutDescription" class="rz-logout-description">Are you sure you want to log out?</p>
    <p class="rz-help">Your profile, matches, and conversations will be here when you return.</p>
    <p id="logoutError" class="rz-logout-error" role="alert" tabindex="-1" hidden></p>
    <div class="rz-dialog-actions"><button id="cancelLogout" type="button" data-close class="rz-outline-button">Cancel</button><button id="confirmLogout" type="button" class="rz-primary">Log out</button></div>
  </section>`, () => { $('logoutError').hidden = true; $('logoutError').textContent = ''; },
    {initialFocus:'#cancelLogout', canClose:() => !loggingOut});
  function askToLogout() {
    if (loggingOut || !logoutConfirmation.el.hidden) return;
    accountMenu.close();
    logoutConfirmation.open();
  }
  $('confirmLogout').onclick = async () => {
    if (loggingOut) return;
    loggingOut = true;
    $('logoutError').hidden = true;
    logoutConfirmation.el.setAttribute('aria-busy', 'true');
    const buttons = [...logoutConfirmation.el.querySelectorAll('button'), $('sidebarLogout')].filter(Boolean);
    buttons.forEach(button => { button.disabled = true; });
    $('confirmLogout').textContent = 'Logging out…';
    try { await window.RizzumeAccount.logout(); }
    catch (error) {
      $('logoutError').textContent = error.message || 'Could not log out. Please try again.';
      $('logoutError').hidden = false;
      $('logoutError').focus();
    } finally {
      loggingOut = false;
      logoutConfirmation.el.removeAttribute('aria-busy');
      buttons.forEach(button => { button.disabled = false; });
      $('confirmLogout').textContent = 'Log out';
    }
  };
  $('sidebarLogout').onclick = askToLogout;

  const notices = dialog('notificationCenter', `<section class="rz-dialog-panel"><div class="rz-dialog-header"><div><div class="rz-eyebrow">Stay in the loop</div><h2>Your notifications</h2><p>Matches, replies, and video call updates.</p></div><button data-close class="rz-icon-button" aria-label="Close notifications">${icon('close')}</button></div>
    <div class="rz-notice-toolbar"><label for="noticeFilter">Show<select id="noticeFilter"><option value="all">All activity</option><option value="match">Connections</option><option value="request">Connection requests</option><option value="message">Messages</option><option value="call">Video calls</option></select></label><button id="readNotices" type="button" class="rz-outline-button">Mark all read</button></div>
    <div id="noticeStatus" class="rz-help" role="status"></div><div id="noticeList"></div>
    <div class="rz-dialog-actions"><button id="browserNotices" class="rz-outline-button">${icon('bell')}Enable browser alerts</button><button id="refreshNotices" class="rz-outline-button">Refresh</button></div><p class="rz-help">Browser alerts are optional and work while Rizzume is open. You can disable them here anytime.</p></section>`);
  $('noticeFilter').onchange = event => { filter = event.target.value; renderNotices(); };
  $('refreshNotices').onclick = async () => {
    if (!backendAvailable) {
      $('refreshNotices').disabled = true;
      try {
        await request('/session', 'POST'); await refreshProfilesAndMatches();
        renderDeck(); renderDirectory();
      } catch (error) { $('noticeStatus').textContent = 'Could not connect. ' + error.message; }
      finally { $('refreshNotices').disabled = false; }
    }
    await poll();
  };
  $('readNotices').onclick = async () => {
    if (!feed.length || !unread) return;
    const throughId = Math.max(...feed.map(n => n.id)); $('readNotices').disabled = true;
    try { await request('/me/notifications/read', 'POST', {throughId}); await poll(); }
    catch (error) { $('noticeStatus').textContent = error.message; }
    finally { $('readNotices').disabled = false; }
  };
  $('browserNotices').onclick = async () => {
    if (!('Notification' in window)) return toast('This browser does not support desktop notifications. In-app alerts still work.');
    if (notifyBrowser) { notifyBrowser = false; }
    else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return toast('Browser alerts are blocked. In-app notifications remain available.');
      notifyBrowser = true;
    }
    try { localStorage.setItem('rzBrowserNotifications', String(notifyBrowser)); } catch (_) {}
    updateBrowserButton();
  };
  function updateBrowserButton() { $('browserNotices').innerHTML = icon('bell') + (notifyBrowser ? 'Disable browser alerts' : 'Enable browser alerts'); }
  function openNotifications() { notices.open(); renderNotices(); poll(); }
  function renderNotices() {
    const list = $('noticeList'); list.replaceChildren();
    const items = feed.filter(n => filter === 'all' || n.kind === filter);
    if (!items.length) {
      const message = !backendAvailable ? 'Connect to the backend to load your activity.'
        : feedError ? 'Activity could not be loaded. Use Refresh to try again.'
        : !feedLoaded ? 'Loading your activity…' : 'You’re all caught up. New activity will appear here.';
      list.innerHTML = `<div class="rz-state">${icon('bell')}<p>${message}</p></div>`; return;
    }
    items.forEach(n => {
      const profile = PROFILES.find(p => p.id === n.profileId);
      const row = document.createElement('button'); row.className = 'rz-notice' + (n.readAt ? '' : ' unread'); row.type = 'button';
      row.innerHTML = `<span class="rz-notice-icon">${icon(n.kind === 'match' ? 'heart' : n.kind === 'call' ? 'video' : 'message')}</span><span><strong>${escapeHtml(profile?.name || 'Rizzume')}</strong><p>${escapeHtml(n.body)}</p><time datetime="${escapeHtml(n.createdAt)}">${escapeHtml(new Date(n.createdAt).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}))}</time></span>`;
      row.onclick = () => {
        notices.close();
        if (n.kind === 'message') openChat(n.profileId);
        else if (n.kind === 'request' || n.kind === 'match') window.RizzumeConnections?.open(n.kind === 'match' ? 'accepted' : 'incoming');
        else openProfileScreenById(n.profileId);
      };
      list.appendChild(row);
    });
  }
  async function poll() {
    clearTimeout(pollTimer);
    if (!backendAvailable) { $('noticeStatus').textContent = 'Backend unavailable. Use Refresh to try reconnecting.'; return; }
    if (polling) return;
    polling = true;
    try {
      const [result] = await Promise.all([request('/me/notifications'),
        window.RizzumeConnections?.refresh().catch(() => {})]);
      if (!Array.isArray(result.items)) throw new Error('Unexpected notification response.');
      feed = result.items; unread = result.unreadCount;
      feedLoaded = true; feedError = false;
      if (latestId !== null) for (const n of feed.filter(n => n.id > latestId).reverse()) {
        if (n.kind !== 'call' && !n.readAt && document.hidden && notifyBrowser && window.Notification?.permission === 'granted') {
          try { const desktop = new Notification('Rizzume · ' + n.kind, {body:n.body, tag:'rizzume-' + n.id}); desktop.onclick = () => { window.focus(); openNotifications(); desktop.close(); }; } catch (_) {}
        }
      }
      latestId = Math.max(latestId || 0, ...feed.map(n => n.id));
      $('noticeStatus').textContent = unread ? `${unread} unread update${unread === 1 ? '' : 's'}` : '';
      ['topNotificationBadge'].forEach(id => { $(id).hidden = !unread; $(id).textContent = unread > 99 ? '99+' : unread; });
      const unreadMessages = feed.filter(n => n.kind === 'message' && !n.readAt).length;
      $('sidebarMessageCount').hidden = !unreadMessages; $('sidebarMessageCount').textContent = unreadMessages;
      if (!notices.el.hidden) renderNotices();
      refreshSidebar();
    } catch (error) {
      feedError = true;
      $('noticeStatus').textContent = error.status === 404 ? 'Activity is temporarily unavailable. Please try again shortly.' : 'Could not refresh activity. ' + error.message;
      if (!notices.el.hidden) renderNotices();
    }
    finally { polling = false; pollTimer = setTimeout(() => { if (!document.hidden || notifyBrowser) poll(); else pollTimer = null; }, document.hidden ? 15000 : 8000); }
  }

  const cities = [
    {name:'Manila, Philippines', match:'manila', lat:14.5995, lon:120.9842},
    {name:'Quezon City, Philippines', match:'quezon', lat:14.6760, lon:121.0437},
    {name:'Makati, Philippines', match:'makati', lat:14.5547, lon:121.0244},
    {name:'Pasig, Philippines', match:'pasig', lat:14.5764, lon:121.0851},
    {name:'Taguig, Philippines', match:'taguig', lat:14.5176, lon:121.0509}
  ];
  const maps = dialog('locationExplorer', `<section class="rz-dialog-panel"><div class="rz-dialog-header"><div><div class="rz-eyebrow">A world of possibility</div><h2>Make a local connection</h2><p>Explore profile locations or choose your own.</p></div><button data-close class="rz-icon-button" aria-label="Close location map">${icon('close')}</button></div>
    <label for="mapCity">Explore a city<select id="mapCity">${cities.map((c,i) => `<option value="${i}">${c.name}</option>`).join('')}<option value="mine" hidden>Your current area</option></select></label>
    <iframe id="locationMap" class="rz-location-map" title="OpenStreetMap location explorer" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>
    <p id="locationStatus" role="status" class="rz-help"></p><div class="rz-dialog-actions"><button id="useLocation" class="rz-primary">${icon('pin')}Use my location</button><button id="clearLocation" class="rz-outline-button" hidden>Clear my location</button><a id="externalMap" target="_blank" rel="noopener noreferrer" class="rz-outline-button">Open full map ${icon('arrow')}</a></div>
    <p class="rz-help">Profile pins show a city center, not an exact position. Device location is used by OpenStreetMap to display this map. Only 'Share in this chat' sends it to a conversation.</p>
    <button id="shareLocation" class="rz-outline-button" style="margin-top:12px" hidden>${icon('message')}Share in this chat</button><div id="mapProfiles" style="margin-top:16px"></div></section>`);
  let locationGeneration = 0;
  function showMap(point, own = false) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return;
    const lat = +point.lat.toFixed(3), lon = +point.lon.toFixed(3), delta = own ? .015 : .045;
    const bounds = [Math.max(-180,lon-delta),Math.max(-90,lat-delta),Math.min(180,lon+delta),Math.min(90,lat+delta)].join(',');
    $('locationMap').src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds)}&layer=mapnik&marker=${lat}%2C${lon}`;
    $('externalMap').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
    $('locationStatus').textContent = own ? 'Your approximate area. It has not been shared with anyone.' : `Exploring ${point.name}. City-level location only.`;
    $('shareLocation').hidden = !own || !chatOpen || !chatProfileId;
    const list = $('mapProfiles'); list.replaceChildren();
    PROFILES.filter(p => !own && p.location?.toLowerCase().includes(point.match)).forEach(p => {
      const row = document.createElement('div'); row.className = 'rz-location-profile';
      row.innerHTML = `<img src="${escapeHtml(safeImageUrl(p.image))}" alt=""><div><strong>${escapeHtml(p.name)}</strong><p>${escapeHtml(p.location)}</p></div><button type="button">View profile</button>`;
      row.querySelector('button').onclick = () => { maps.close(); openProfileScreenById(p.id); }; list.appendChild(row);
    });
  }
  function openMap(profile) {
    const place = profile?.location?.toLowerCase() || '';
    const index = cities.findIndex(city => place.includes(city.match));
    maps.open();
    if (profile && index < 0) {
      $('locationMap').removeAttribute('src'); $('mapProfiles').replaceChildren(); $('shareLocation').hidden = true;
      $('locationStatus').textContent = `${profile.location || 'This profile'} has no mapped city yet. Choose a city above or search the full map.`;
      $('externalMap').href = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(profile.location || ''); return;
    }
    $('mapCity').value = String(index < 0 ? 0 : index);
    showMap(cities[index < 0 ? 0 : index]);
  }
  $('mapCity').onchange = () => { locationGeneration++; const value = $('mapCity').value; showMap(value === 'mine' && location ? location : cities[Number(value)], value === 'mine'); };
  $('useLocation').onclick = () => {
    if (!navigator.geolocation) return toast('Your browser does not support location. Choose a city instead.');
    const version = ++locationGeneration; $('useLocation').disabled = true; $('locationStatus').textContent = 'Waiting for location permission…';
    navigator.geolocation.getCurrentPosition(position => {
      $('useLocation').disabled = false; if (version !== locationGeneration) return;
      location = {lat:position.coords.latitude, lon:position.coords.longitude, name:'Your area'};
      $('mapCity').querySelector('[value="mine"]').hidden = false; $('mapCity').value = 'mine';
      $('clearLocation').hidden = false; $('topLocationLabel').textContent = 'Location set'; showMap(location, true);
    }, error => {
      $('useLocation').disabled = false; if (version !== locationGeneration) return;
      $('locationStatus').textContent = error.code === 1 ? 'Location access was denied. You can still choose a city.' : 'Could not find your location. Choose a city or try again.';
    }, {enableHighAccuracy:false, timeout:12000, maximumAge:60000});
  };
  $('clearLocation').onclick = () => {
    locationGeneration++; location = null; $('clearLocation').hidden = true; $('shareLocation').hidden = true;
    $('mapCity').querySelector('[value="mine"]').hidden = true; $('mapCity').value = '0'; $('topLocationLabel').textContent = 'Explore locations'; showMap(cities[0]);
  };
  $('shareLocation').onclick = async () => {
    if (!location || !chatOpen || !chatProfileId) return toast('Open a matched conversation before sharing your location.');
    const initial = {latitude:location.lat,longitude:location.lon};
    maps.close(); window.RizzumeLocations.open(initial);
  };

  const preferences = dialog('discoveryPreferences', `<section class="rz-dialog-panel"><div class="rz-dialog-header"><div><h2>Your kind of connection</h2><p>Filter by skills, role, name, or city.</p></div><button data-close class="rz-icon-button" aria-label="Close preferences">${icon('close')}</button></div><form id="discoveryForm"><label for="discoverySearch">What are you looking for?<input id="discoverySearch" maxlength="100" placeholder="Try React, backend, or Manila" autocomplete="off"></label><div class="rz-dialog-actions"><button class="rz-primary" type="submit">Apply preferences</button><button class="rz-outline-button" id="clearPreferences" type="button">Reset</button></div></form><p class="rz-help">Preferences filter this discovery deck. Your saved matches stay available.</p></section>`);
  $('discoveryFilters').onclick = () => preferences.open();
  function applyPreferences() {
    const query = $('discoverySearch').value.trim().toLowerCase();
    cardsState = matchableProfiles().filter(p => !window.RizzumeConnections || window.RizzumeConnections.discoverable(p.id)).filter(p => [p.name,p.role,p.location,...(p.tags || [])].some(value => String(value || '').toLowerCase().includes(query)));
    renderDeck();
    if (!cardsState.length) $('emptyDeckTitle').textContent = 'No profiles match your preferences.';
    else $('emptyDeckTitle').textContent = 'No profiles match your filter';
    preferences.close(); startMode('swipe');
    toast(query ? `${cardsState.length} profile${cardsState.length === 1 ? '' : 's'} match your preferences.` : 'Showing the full team.');
  }
  $('discoveryForm').onsubmit = event => { event.preventDefault(); applyPreferences(); };
  $('clearPreferences').onclick = () => { $('discoverySearch').value = ''; applyPreferences(); };

  const room = new RizzumeVideoRoom({request});
  const incomingCard=document.createElement('section'); incomingCard.className='rz-incoming-call'; incomingCard.hidden=true;
  incomingCard.setAttribute('aria-label','Incoming call'); incomingCard.setAttribute('aria-live','assertive');
  document.body.appendChild(incomingCard);
  const callAlert=new window.RizzumeCallAlert({onBlocked:blocked=>{
    const button=incomingCard.querySelector('[data-enable-ring]'); if (button) button.hidden=!blocked;
  }});
  let callPollTimer, callPolling=false, callsEnabled=false, callPollVersion=0;
  function clearIncomingCall() { incomingCard.hidden=true; incomingCard.dataset.id=''; callAlert.stop(); }
  function stopCallPolling() { callsEnabled=false;callPollVersion++;clearTimeout(callPollTimer);clearIncomingCall(); }
  function startCallPolling() { callsEnabled=true;pollIncomingCalls(); }
  async function pollIncomingCalls() {
    clearTimeout(callPollTimer);
    if (!callsEnabled || callPolling) return;
    callPolling=true; const version=callPollVersion;
    try {
    if (!window.RizzumeAccount?.user?.profileId || room.busy) { clearIncomingCall(); return; }
    const calls=await request('/me/calls');
    if (!callsEnabled || version !== callPollVersion || room.busy) return;
    const call=calls.find(c => c.incoming && c.state === 'ringing');
    if (!call) { clearIncomingCall(); return; }
    if (incomingCard.dataset.id === call.id && !incomingCard.hidden) return;
    incomingCard.dataset.id=call.id;
    const profile=PROFILES.find(p => p.id === call.profileId), name=profile?.name || 'Your connection';
    incomingCard.innerHTML=`<strong>${escapeHtml(name)}</strong><p>Incoming call</p><button type="button" class="rz-ring-enable" data-enable-ring hidden>Enable ringing sound</button><div><button type="button" class="rz-primary" data-answer>Answer with video</button><button type="button" class="rz-outline-button" data-answer-audio>Answer with voice</button><button type="button" class="rz-outline-button" data-decline>Decline</button></div>`;
    incomingCard.hidden=false;
    incomingCard.querySelector('[data-enable-ring]').onclick=()=>callAlert.unlock();
    callAlert.start(call,{name,desktop:notifyBrowser,onOpen:()=>incomingCard.querySelector('[data-answer]')?.focus()});
    incomingCard.querySelector('[data-answer]').onclick=async () => {
      clearIncomingCall(); await room.accept(call.id,name); pollIncomingCalls();
    };
    incomingCard.querySelector('[data-answer-audio]').onclick=async()=>{
      clearIncomingCall();await room.accept(call.id,name,{video:false});pollIncomingCalls();
    };
    incomingCard.querySelector('[data-decline]').onclick=async event => {
      const button=event.currentTarget; button.disabled=true;callAlert.stop();
      try { await request('/me/calls/'+encodeURIComponent(call.id)+'/action','POST',{action:'decline'}); clearIncomingCall(); }
      catch (error) { toast(error.message); button.disabled=false;callAlert.start(call,{name}); }
    };
    } catch (_) { /* A transient refresh failure must not dismiss a ringing invitation. */ }
    finally {
      callPolling=false;
      if (callsEnabled) callPollTimer=setTimeout(()=>pollIncomingCalls(),document.hidden?4000:2500);
    }
  }
  $('chatVideoButton').onclick = () => {
    if (chatProfileId && matchedProfiles.some(p => p.id === chatProfileId)) room.start(chatProfileId, chatProfileName);
    else toast('Open a matched conversation to start a call.');
  };
  if($('chatAudioButton'))$('chatAudioButton').onclick=()=>{
    if(chatProfileId && matchedProfiles.some(p=>p.id===chatProfileId))room.start(chatProfileId,chatProfileName,{video:false});
    else toast('Open a connected conversation to start a voice call.');
  };
  $('chatMapButton').onclick = () => window.RizzumeLocations.open();
  $('chatListButton').onclick = () => showConversationList();
  function refreshSidebar() {
    $('sidebarMatchCount').textContent = matchedProfiles.length;
    $('sidebarEmpty').hidden = !!matchedProfiles.length;
    const list = $('sidebarMatches'); list.replaceChildren();
    matchedProfiles.slice(0,6).forEach(p => {
      const button = document.createElement('button'); button.className = 'rz-mini-match'; button.type = 'button'; button.setAttribute('aria-label', 'Message ' + p.name);
      button.innerHTML = `<span class="rz-mini-initials" aria-hidden="true">${escapeHtml(profileInitials(p.name))}</span><img data-profile-photo alt="" hidden><span class="rz-mini-name">${escapeHtml((p.name || 'Member').split(',')[0])}</span>`;
      setProfilePhoto(button.querySelector('[data-profile-photo]'), safeImageUrl(p.images?.[0]?.url || p.image));
      button.onclick = () => openChatForProfile(p.id); list.appendChild(button);
    });
  }
  function navigate(target) {
    if (chatOpen && target !== 'messages') closeChat();
    if (target === 'swipe' || target === 'directory') startMode(target);
    if (target === 'matches') toggleMatchesDrawer(true);
    if (target === 'messages') openChat();
    if (target === 'location') openMap();
    if (target === 'notifications') openNotifications();
  }
  window.RizzumeExperience = {
    refreshAccount,
    stop() { clearTimeout(pollTimer); stopCallPolling(); room.hangup(); },
    resume() { if (backendAvailable) {if (!polling) poll();startCallPolling();} },
    ready() { if (ready) return; ready = true; refreshSidebar(); syncFloatingProfileButton(); if (backendAvailable) {poll();startCallPolling();} },
    navigated(value) {
      mode = value; $('rzBreadcrumb').textContent = ({directory:'Explore all members',home:'Welcome',messages:'Messages'})[value] || 'Discover';
      $('discoveryHeading').hidden = value !== 'swipe'; $('discoveryTip').hidden = value !== 'swipe';
      document.querySelectorAll('[data-nav]').forEach(button => { if (button.dataset.nav === mode) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
      syncFloatingProfileButton();
    },
    refresh: refreshSidebar, openMap
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready && !polling) poll(); });
  window.addEventListener('pagehide', () => {clearTimeout(pollTimer);stopCallPolling();});
  updateBrowserButton();
})();
