(() => {
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  const id = document.body.dataset.profileId;
  let available = false, saving = false, relationship = null;
  const accountReady = window.RizzumeAccount?.checkOptional ? window.RizzumeAccount.checkOptional().catch(() => false) : Promise.resolve(false);
  const isOwnProfile = () => !!id && window.RizzumeAccount?.user?.profileId === id;
  function syncOwnProfileActions() {
    document.querySelectorAll('[onclick="likeProfile()"], [data-profile-connect]').forEach(control => {
      control.hidden = isOwnProfile();
      if (!isOwnProfile()) control.textContent=relationship?.status === 'accepted' ? 'Message connection'
        : relationship?.status === 'pending' ? (relationship.direction === 'incoming' ? 'Review connection request' : 'View sent request') : 'Send connection request';
    });
  }
  async function refreshRelationship() {
    if (window.RizzumeAccount?.user && !isOwnProfile()) {
      try { relationship=(await call('/me/connections')).find(item => item.profile.id === id) || null; } catch (_) {}
    }
    syncOwnProfileActions();
  }
  accountReady.then(refreshRelationship);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) refreshRelationship(); });
  const sections = document.querySelectorAll('main > section');

  function imageUrl(value) {
    if (!value) return '';
    try {
      if (value.startsWith('/api/images/')) value = API + value.slice(4);
      else if (value.startsWith('/images/')) value = new URL(value, new URL(API, location.href)).href;
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function notify(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.querySelector('p').textContent = text;
    toast.classList.remove('translate-y-10', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-10', 'opacity-0'), 3000);
  }

  async function call(path, method = 'GET', data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API + path, {
        method,
        credentials: 'include',
        signal: controller.signal,
        ...(window.RizzumeHTTP ? {headers:window.RizzumeHTTP.headers(API + path,data ? {'Content-Type':'application/json'} : {})} : data ? {headers:{'Content-Type':'application/json'}} : {}),
        ...(data ? {body:JSON.stringify(data)} : {})
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const err = new Error(result?.message || 'Could not reach Rizzume. Please retry.');
        err.status = response.status;
        throw err;
      }
      return result;
    } finally { clearTimeout(timeout); }
  }

  function set(selector, value, root = document) {
    const element = root.querySelector(selector);
    if (element) element.textContent = value || '';
  }

  async function openDirectMessage(event) {
    if (!available || !id) return;
    event.preventDefault();
    await accountReady;
    if (isOwnProfile()) return notify('You cannot message your own profile.');
    return window.likeProfile();
  }

  function render(profile) {
    const [hero, about, why, skills, projects, contact] = sections;
    document.title = profile.name + ' • Rizzume';
    set('h1', profile.name, hero);
    const heroImg = hero?.querySelector('img');
    const resolvedPhoto = imageUrl(profile.images?.[0]?.url || profile.image);
    if (heroImg && resolvedPhoto) {
      heroImg.src = resolvedPhoto;
      heroImg.alt = profile.name;
      heroImg.hidden = false;
    }
    set('.absolute.bottom-4 > span', profile.persona, hero);
    set('.text-xl.font-medium', String(profile.age), hero);
    const badge = hero?.querySelector('[data-lucide="badge-check"], .lucide-badge-check');
    if (badge) badge.style.display = profile.verified ? '' : 'none';
    set('.absolute.bottom-4 p', profile.location, hero);
    const summary = hero?.querySelector('.p-5');
    if (summary) {
      set('span:first-child', profile.role, summary);
      set('span:last-child', profile.matchPercentage, summary);
    }

    if (about) {
      set('h2', 'About ' + profile.name, about);
      const paragraphs = about.querySelectorAll('p');
      if (paragraphs[0]) paragraphs[0].textContent = profile.bio || '';
      if (paragraphs[1]) paragraphs[1].textContent = profile.details?.fullBio || '';
    }

    if (why) {
      why.querySelectorAll('p').forEach(p => p.remove());
      (profile.dealbreakers || []).forEach(text => {
        const p = document.createElement('p');
        p.className = 'text-xs text-zinc-700 font-medium';
        p.textContent = text;
        why.appendChild(p);
      });
    }

    if (skills) {
      const chips = skills.querySelector('div');
      if (chips) {
        chips.replaceChildren();
        (profile.tags || []).forEach(text => {
          const chip = document.createElement('span');
          chip.className = 'px-2.5 py-1 rounded-full bg-pink-50 text-tinder-pink text-[11px] font-bold';
          chip.textContent = '⚡ ' + text;
          chips.appendChild(chip);
        });
      }
    }

    if (projects) {
      const cards = projects.querySelector('div');
      if (cards) {
        cards.replaceChildren();
        (profile.details?.projects || []).forEach(project => {
          const card = document.createElement('article');
          card.className = 'p-4 bg-zinc-50 border border-zinc-100 rounded-2xl';
          const h = document.createElement('h4');
          h.className = 'font-bold text-sm text-zinc-900';
          h.textContent = project.title || '';
          const p = document.createElement('p');
          p.className = 'text-xs text-zinc-500 mt-1 leading-relaxed';
          p.textContent = project.desc || '';
          card.append(h, p);
          cards.appendChild(card);
        });
      }
    }

    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      link.setAttribute('data-profile-connect','');
      link.href = 'index.html?chat=' + encodeURIComponent(id);
      link.hidden = isOwnProfile();
      link.onclick = openDirectMessage;
    });

    if (contact) {
      ['github', 'linkedin'].forEach(network => {
        const link = contact.querySelector('a[href*="' + network + '"]');
        if (!link) return;
        const value = imageUrl(profile.details?.[network]);
        link.hidden = !value;
        if (value) link.href = value;
      });
    }

    const idFront = document.getElementById('idCardFront');
    const idBack = document.getElementById('idCardBack');
    if (idFront) {
      const idPhoto = idFront.querySelector('img');
      if (idPhoto && resolvedPhoto) idPhoto.src = resolvedPhoto;
      set('h3', profile.name, idFront);
      set('p.text-sky-300', profile.role, idFront);
      const personaPill = idFront.querySelector('span.rounded-full');
      if (personaPill) personaPill.textContent = profile.persona || '';
      const stackRow = idFront.querySelector('.flex-wrap');
      if (stackRow && Array.isArray(profile.tags)) {
        stackRow.replaceChildren();
        profile.tags.slice(0, 4).forEach(tag => {
          const pill = document.createElement('span');
          pill.className = 'text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-zinc-200';
          pill.textContent = tag;
          stackRow.appendChild(pill);
        });
      }
    }
    if (idBack) {
      const strongName = idBack.querySelector('strong');
      if (strongName) strongName.textContent = profile.name;
      const mailLine = idBack.querySelector('.font-mono p:first-child');
      if (mailLine && profile.details?.email) mailLine.textContent = 'MAIL: ' + profile.details.email;
      const baseLine = idBack.querySelector('.font-mono p:last-child');
      if (baseLine && profile.location) baseLine.textContent = 'BASE: ' + profile.location;
    }
  }

  window.likeProfile = async () => {
    await accountReady;
    if (isOwnProfile()) return notify('You cannot match with your own profile.');
    if (saving) return;
    if (!window.RizzumeAccount?.user) {
      window.location.href='login.html?next='+encodeURIComponent(window.location.pathname); return;
    }
    if (!available) return notify('Reconnect to Rizzume before sending a request.');
    saving=true;
    try {
      await refreshRelationship();
      if (relationship?.status === 'accepted') {
        window.location.href='index.html?chat='+encodeURIComponent(id); return;
      }
      if (relationship?.status === 'pending') {
        window.location.href='index.html?connections='+relationship.direction; return;
      }
      relationship=await call('/me/connection-requests/'+encodeURIComponent(id),'POST',{priority:false});
      syncOwnProfileActions();
      notify(relationship.ownerAvailable === false ? 'Request saved. This profile’s owner needs to activate their account before replying.'
        : relationship.status === 'accepted' ? 'You are already connected. Open Messages to say hello.'
        : relationship.direction === 'incoming' ? 'This person sent you a request. Review it in Connections.'
        : 'Connection request sent. Messaging opens when they accept.');
    } catch (error) {
      if (error.status === 401) window.location.href='login.html?next='+encodeURIComponent(window.location.pathname);
      else notify(error.message);
    } finally { saving=false; }
  };

  if (id) {
    call('/profiles/' + encodeURIComponent(id))
      .then(profile => { render(profile); available = true; syncOwnProfileActions(); })
      .catch(() => { available = false; });
  }
})();
