(() => {
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  const id = document.body.dataset.profileId;
  let available = false, saving = false;
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
    toast.querySelector('p').textContent = text;
    toast.classList.remove('translate-y-10', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-10', 'opacity-0'), 3000);
  }
  async function call(path, method = 'GET', data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(API + path, {method, credentials: 'include', signal: controller.signal,
        ...(data ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {})});
      const text = await response.text(); const result = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(result?.message || 'Could not reach Rizzume. Please retry.');
      return result;
    } finally { clearTimeout(timeout); }
  }
  function set(selector, value, root = document) {
    const element = root.querySelector(selector); if (element) element.textContent = value || '';
  }
  function render(profile) {
    const [hero, about, why, skills, projects, contact] = sections;
    document.title = profile.name + ' | Rizzume';
    set('h1', profile.name, hero);
    const image = hero.querySelector('img'); image.src = imageUrl(profile.image); image.alt = profile.name;
    image.hidden = !profile.image;
    set('.absolute.bottom-4 > span', profile.persona, hero);
    set('.text-xl.font-medium', String(profile.age), hero);
    const badge = hero.querySelector('[data-lucide="badge-check"], .lucide-badge-check');
    if (badge) badge.style.display = profile.verified ? '' : 'none';
    set('.absolute.bottom-4 p', profile.location, hero);
    const summary = hero.querySelector('.p-5');
    if (summary) { set('span:first-child', profile.role, summary); set('span:last-child', profile.matchPercentage, summary); }
    set('h2', 'About ' + profile.name, about);
    const paragraphs = about.querySelectorAll('p');
    paragraphs[0].textContent = profile.bio || ''; paragraphs[1].textContent = profile.details?.fullBio || '';
    why.querySelectorAll('p').forEach(p => p.remove());
    (profile.dealbreakers || []).forEach(text => {
      const p = document.createElement('p'); p.className = 'text-xs text-zinc-700 font-medium'; p.textContent = text; why.appendChild(p);
    });
    const chips = skills.querySelector('div'); chips.replaceChildren();
    (profile.tags || []).forEach(text => {
      const chip = document.createElement('span'); chip.className = 'px-2.5 py-1 rounded-full bg-pink-50 text-tinder-pink text-xs font-bold'; chip.textContent = text; chips.appendChild(chip);
    });
    const cards = projects.querySelector('div'); cards.replaceChildren();
    (profile.details?.projects || []).forEach(project => {
      const card = document.createElement('article'); card.className = 'p-4 bg-zinc-50 border border-zinc-100 rounded-2xl';
      const h = document.createElement('h4'); h.className = 'font-bold text-sm'; h.textContent = project.title || '';
      const p = document.createElement('p'); p.className = 'text-xs mt-1'; p.textContent = project.desc || ''; card.append(h, p); cards.appendChild(card);
    });
    document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
      link.href = 'mailto:' + encodeURIComponent(profile.details?.email || '') + '?subject=Matched%20on%20Rizzume!';
      link.hidden = !profile.details?.email;
    });
    ['github', 'linkedin'].forEach(network => {
      const link = contact.querySelector('a[href*="' + network + '"]');
      if (!link) return;
      const value = imageUrl(profile.details?.[network]); link.hidden = !value; if (value) link.href = value;
    });
  }
  window.likeProfile = async () => {
    if (saving) return;
    if (!available) return notify('Backend unavailable. Reload before saving a match.');
    saving = true;
    try {
      await call('/session', 'POST');
      await call('/me/swipes/' + encodeURIComponent(id), 'PUT', {action: 'like'});
      window.confetti?.({particleCount: 90, spread: 80, origin: {y: .8}});
      notify('Match saved! Open the team page to view your matches.');
    } catch (error) { notify(error.message); }
    finally { saving = false; }
  };
  call('/profiles/' + encodeURIComponent(id)).then(profile => { render(profile); available = true; })
    .catch(error => notify(error.message));
})();
