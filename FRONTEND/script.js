// Use the page's server, including its current port. A separate frontend server
// can set window.RIZZUME_API_BASE before loading this script.
const API_BASE = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');

// Preload Spooderman image for instant hover
(function preloadSpooderman() {
  const img = new Image();
  img.src = 'images/spooderman.webp';
  img.decoding = 'async';
})();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function safeImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const base = window.location?.href || 'http://localhost/';
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (value.startsWith('/api/images/')) return API_BASE + value.slice(4);
    if (value.startsWith('/images/')) return new URL(value, new URL(API_BASE, base)).href;
    return url.href;
  } catch (_) { return ''; }
}

function safeHref(value) {
  if (!value || typeof value !== 'string') return '#';
  try {
    const url = new URL(value, window.location?.href || 'http://localhost/');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '#';
  } catch (_) { return '#'; }
}

if (!window.lucide) window.lucide = { createIcons() {} };

function isGuestUser() {
  return !window.RizzumeAccount?.user;
}

function handleGuardedClick(action, nextUrl = 'index.html') {
  if (isGuestUser()) {
    openSubscriptionHook(nextUrl);
    return;
  }
  action();
}

function openSubscriptionHook() {
  const modal = document.getElementById('subscriptionHookModal');
  const box = document.getElementById('subscriptionHookBox');
  const step1 = document.getElementById('paywallStepOne');
  const step2 = document.getElementById('paywallStepTwo');
  const loginLink = document.getElementById('prankLoginLink');
  if (!modal || !box) return;

  try { sessionStorage.setItem('rizzumeMode', 'swipe'); } catch (_) {}
  step1.classList.remove('hidden');
  step2.classList.add('hidden');
  if (loginLink) {
    loginLink.href = window.RizzumeAccount?.signInUrl ? window.RizzumeAccount.signInUrl('index.html') : 'login.html?next=%2Findex.html';
  }

  modal.classList.remove('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-90');
  box.classList.add('scale-100');
  lucide.createIcons();
}

function revealPaywallPrank(choice) {
  const step1 = document.getElementById('paywallStepOne');
  const step2 = document.getElementById('paywallStepTwo');
  const badge = document.getElementById('prankReactionBadge');
  if (!step1 || !step2) return;

  if (badge) {
    badge.textContent = choice === 'pay' ? 'Grabe galante! Pero joke lang!' : 'Smart choice! Joke lang po!';
  }
  step1.classList.add('hidden');
  step2.classList.remove('hidden');
  lucide.createIcons();
}

function closeSubscriptionHook() {
  const modal = document.getElementById('subscriptionHookModal');
  const box = document.getElementById('subscriptionHookBox');
  if (!modal || !box) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-100');
  box.classList.add('scale-90');
}

async function apiCall(path, method = 'GET', data, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = window.RizzumeHTTP?.headers(`${API_BASE}${path}`,options.headers || {}) || {...(options.headers || {})};
    if (adminKey && options.admin !== false) headers['X-Admin-Key'] = adminKey;
    const init = { method, credentials: 'include', signal: controller.signal, headers, ...(options.keepalive ? {keepalive:true} : {}) };
    if (data !== undefined) {
      if (typeof FormData !== 'undefined' && data instanceof FormData) init.body = data;
      else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(data);
      }
    }
    const response = await fetch(`${API_BASE}${path}`, init);
    if (!response.ok) {
      let message = `Backend request failed (${response.status})`;
      try { message = (await response.json()).message || message; } catch (e) {}
      const error = new Error(message);
      error.status = response.status;
      if (response.status === 401 && window.RizzumeAccount?.user) window.RizzumeAccount.expired();
      throw error;
    }
    if (response.status === 204) return null;
    if (response.headers?.get('content-length') === '0') return null;
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshProfilesAndMatches() {
  const profiles = await apiCall('/profiles', 'GET', undefined, { admin: false });
  if (Array.isArray(profiles)) {
    PROFILES = profiles.map(profile => ({...profile,
      page: FALLBACK_PROFILES.find(member => member.id === profile.id)?.page}));
    cardsState = matchableProfiles();
    swipeHistory = [];
  }
  if (!isGuestUser()) {
    if (window.RizzumeConnections) await window.RizzumeConnections.refresh();
    else {
      const matches = await apiCall('/me/matches', 'GET', undefined, { admin: false });
      matchedProfiles = Array.isArray(matches) ? matchableProfiles(matches) : [];
    }
  } else {
    matchedProfiles = [];
  }
  backendAvailable = true;
  showBackendNotice(false);
  updateDynamicCounts();
  updateMatchesUI();
  return { profiles: PROFILES, matches: matchedProfiles };
}

function updateDynamicCounts() {
  const matchBadge = document.getElementById('matchBadge');
  if (matchBadge) matchBadge.textContent = String(matchedProfiles.length);
  document.querySelectorAll('[data-requires-backend]').forEach(button => {
    button.disabled = !backendAvailable;
    button.hidden = !window.RizzumeAccount?.user || !!window.RizzumeAccount.user.profileId;
    button.textContent = 'Create my profile';
  });
}

function canEditProfile(profileId) {
  return backendAvailable && !!window.RizzumeAccount?.user?.profileId && window.RizzumeAccount.user.profileId === profileId;
}

function isOwnProfile(profileId) {
  return !!profileId && window.RizzumeAccount?.user?.profileId === profileId;
}

function matchableProfiles(profiles = PROFILES) {
  return profiles.filter(profile => !isOwnProfile(profile.id));
}

function showBackendNotice(readOnly) {
  const notice = document.getElementById('backendNotice');
  if (!notice) return;
  if (readOnly) notice.classList.remove('hidden');
  else notice.classList.add('hidden');
  notice.textContent = readOnly ? 'Read-only fallback mode: backend unavailable.' : '';
}

// Seed portfolios used when the member service is unavailable.
const FALLBACK_PROFILES = [
  {
    id: "chee-reynaldo",
    page: "CHEE.html",
    persona: "The Architectural Craftsman",
    name: "CHEE, Reynaldo Joseph",
    age: 22,
    location: "Manila, Philippines",
    role: "Full Stack Developer",
    image: "images/chee.jpg",
    verified: true,
    matchPercentage: "99% Match",
    bio: "Specializes in end-to-end architectures, robust Spring Boot services, and high-performance reactive interfaces.",
    tags: ["Java", "Spring Boot", "React", "PostgreSQL", "System Architecture"],
    dealbreakers: [
      "✅ Never leaves unfinished merge conflicts",
      "✅ Strictly adheres to clean layer separation",
      "✅ Builds seamless API payloads"
    ],
    details: {
      fullBio: "Full-stack engineer dedicated to microservices, database normalization, and reactive UI component design. Focused on architecting scalable web applications that stand the test of traffic spikes.",
      projects: [
        { title: "E-Commerce Microservices Engine", desc: "A decomposed transactional Spring Boot microservice suite with resilient event dispatching." },
        { title: "Classroom Web Portal", desc: "Interactive student-teacher submission hub with real-time grade calculations." }
      ],
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      email: "chee.reynaldo@example.com"
    }
  },
  {
    id: "dapog-john-greg",
    page: "DAPOG.html",
    persona: "The Data & Backend Guardian",
    name: "DAPOG, John Greg",
    age: 22,
    location: "Manila, Philippines",
    role: "Backend Engineer",
    image: "images/greg.jpg",
    verified: true,
    matchPercentage: "97% Match",
    bio: "Obsessed with low-latency queries, transaction rollback strategies, and secure relational schema design.",
    tags: ["Java", "MySQL", "REST APIs", "Docker", "Database Tuning"],
    dealbreakers: [
      "✅ Writes airtight BEGIN TRANSACTION & ROLLBACK logic",
      "✅ Indexes columns before your query can even lag",
      "✅ Restful endpoints documented to perfection"
    ],
    details: {
      fullBio: "Backend developer specializing in schema normalization, query execution plans, and rock-solid REST endpoints. Believes that the backend should be as indestructible as it is performant.",
      projects: [
        { title: "Inventory Management System", desc: "High-throughput warehouse tracking service featuring ACID-compliant transactions." },
        { title: "Auth Microservice Gateway", desc: "Centralized JWT validation proxy handling stateless session routing." }
      ],
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      email: "dapog.johngreg@example.com"
    }
  },
  {
    id: "fontelar-dave",
    page: "FONTELAR.html",
    persona: "The Full-Stack & ML Specialist",
    name: "FONTELAR, Dave",
    age: 22,
    location: "Manila, Philippines",
    role: "Full-Stack & Systems Developer",
    image: "images/dave.jpg",
    verified: true,
    matchPercentage: "98% Match",
    bio: "Builds intelligent full-stack applications with React & FastAPI, data engineering pipelines, and retro terminal web tools.",
    tags: ["React", "Node.js", "Python", "FastAPI", "MongoDB", "Data Pipelines"],
    dealbreakers: [
      "✅ Thoroughly preprocesses datasets before running models",
      "✅ Keeps terminal UI retro and lightning snappy",
      "✅ Clean Git commits and organized repos"
    ],
    details: {
      fullBio: "Full-stack engineer focusing on end-to-end applications, machine learning integration, and responsive frontend systems. Experienced in Python FastAPI microservices, data cleaning workflows, and modern reactive layouts.",
      projects: [
        { title: "Retainify Platform", desc: "Predictive student academic attrition risk classification tool powered by FastAPI and Random Forest models." },
        { title: "CRT Terminal Cyberdeck", desc: "Retro web calculator featuring animated CRT phosphor styling and tactile keyboard logic." }
      ],
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      email: "fontelar.dave@example.com"
    }
  },
  {
    id: "villanueva-justin",
    page: "VILLANUEVA.html",
    persona: "The Interaction & UX Sculptor",
    name: "VILLANUEVA, Justin",
    age: 22,
    location: "Manila, Philippines",
    role: "Frontend & UI/UX Developer",
    image: "images/justin.jpg",
    verified: true,
    matchPercentage: "96% Match",
    bio: "Translates complex workflows into fluid swipe decks, intuitive layouts, and mobile-responsive animations.",
    tags: ["React", "CSS / Tailwind", "JavaScript", "Figma", "Motion Physics"],
    dealbreakers: [
      "✅ Obsessed with 60 FPS mobile touch physics",
      "✅ Never ships an unstyled form element",
      "✅ Pixel-precise design parity"
    ],
    details: {
      fullBio: "Frontend engineer and user interface designer passionate about interactive UI models, gesture-driven navigation, and accessible design principles.",
      projects: [
        { title: "Swipe Deck Component Library", desc: "Touch-first carousel interface supporting dynamic physics thresholds." },
        { title: "Accessible Design Tokens", desc: "Cross-platform design token system for dark/light contrast adherence." }
      ],
      github: "https://github.com",
      linkedin: "https://linkedin.com",
      email: "villanueva.justin@example.com"
    }
  }
];

// STATE VARIABLES
let PROFILES = FALLBACK_PROFILES;
let cardsState = [...PROFILES];
let swipeHistory = [];
let matchedProfiles = [];
let matchRemovalPending = false, matchRemovalTarget = null, matchRemovalDialog;
let backendAvailable = false;
let adminKey = '';
let teamEmail = 'team.leads@example.com';
let globalDragListenersRegistered = false;
let currentGalleryIndex = 0;
let lightboxIndex = 0;
let editorDirty = false;
let editorImages = [];
let editorPendingFiles = [];
let editorPendingUrls = [];
let editorOriginalProfile = null;
let lightboxTouchStartX = 0;
let isDragging = false;
let isSwiping = false;
let hasSwipedOrMoved = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let activeCardElem = null;
let currentlyViewingProfile = null;
let html5QrScanner = null;
let chatOpen = false;
let chatProfileId = null;
let chatProfileName = '';
let chatAfterId = 0;
let chatPollTimer = null;
let chatLastFocused = null;
let chatFailedPayload = null;
let chatGeneration = 0;
let chatSending = false;
const chatPolls = new Set();

// ==================== QR CODE SCANNER & DEEP LINKING ====================
function resolveProfileIdFromQr(rawText) {
  const cleaned = (rawText || '').trim();
  if (!cleaned) return null;

  try {
    const url = new URL(cleaned, window.location.origin);
    const paramId = url.searchParams.get('profile');
    if (paramId && PROFILES.some(p => p.id === paramId)) return paramId;

    const matchedByPage = PROFILES.find(p => p.page && url.pathname.toLowerCase().endsWith(p.page.toLowerCase()));
    if (matchedByPage) return matchedByPage.id;
  } catch (e) {}

  const matchedById = PROFILES.find(p => p.id.toLowerCase() === cleaned.toLowerCase());
  return matchedById ? matchedById.id : null;
}

async function openQrScanner() {
  const modal = document.getElementById('qrScannerModal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
  lucide.createIcons();

  if (html5QrScanner) return;

  try {
    if (typeof Html5Qrcode !== 'function') throw new Error('Scanner unavailable');
    html5QrScanner = new Html5Qrcode('qrReader');
    await html5QrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async (decodedText) => {
        const profileId = resolveProfileIdFromQr(decodedText);
        if (profileId) {
          playBeep('super');
          await closeQrScanner();
          openProfileScreenById(profileId);
        } else {
          showToast('Invalid QR Code', 'No matching team profile found.');
        }
      },
      () => {}
    );
  } catch (err) {
    console.warn('Camera unavailable; image upload remains available:', err);
    showToast('Camera Unavailable', 'Upload a QR or Digital ID image below instead.');
  }
}

async function scanQrFromFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    if (typeof Html5Qrcode !== 'function') throw new Error('QR library unavailable');
    if (html5QrScanner?.isScanning) {
      await html5QrScanner.stop();
    }
    const fileScanner = new Html5Qrcode('qrReader');
    const decodedText = await fileScanner.scanFile(file, true);
    fileScanner.clear();
    const profileId = resolveProfileIdFromQr(decodedText);
    if (profileId) {
      playBeep('super');
      await closeQrScanner();
      openProfileScreenById(profileId);
    } else {
      showToast('No Profile Found', 'That image did not contain a valid Rizzume QR.');
    }
  } catch (_) {
    showToast('Could Not Read QR', 'Try a clearer screenshot of the QR code.');
  } finally {
    input.value = '';
  }
}

async function closeQrScanner() {
  const modal = document.getElementById('qrScannerModal');
  modal.classList.add('opacity-0', 'pointer-events-none');

  if (html5QrScanner) {
    try {
      if (html5QrScanner.isScanning) {
        await html5QrScanner.stop();
      }
      html5QrScanner.clear();
    } catch (e) {}
    html5QrScanner = null;
  }
}

// ROUTING / MODE SELECTION
function startMode(mode) {
  if (mode !== 'swipe' && mode !== 'directory') return;
  if (!isGuestUser()) window.RizzumeExperience?.navigated(mode);
  try { sessionStorage.setItem('rizzumeMode', mode); } catch (e) {}
  document.getElementById('homeScreen').classList.add('hidden');

  if (mode === 'swipe') {
    document.getElementById('swipeAppScreen').classList.remove('hidden');
    document.getElementById('directoryScreen').classList.add('hidden');
    document.getElementById('directoryScreen').classList.remove('flex');
    if (!cardsState.length && PROFILES.length) cardsState = [...PROFILES];
    renderDeck();
  } else if (mode === 'directory') {
    document.getElementById('directoryScreen').classList.remove('hidden');
    document.getElementById('directoryScreen').classList.add('flex');
    document.getElementById('swipeAppScreen').classList.add('hidden');
    renderDirectory();
  }
  lucide.createIcons();
}

function goToHome() {
  try { sessionStorage.removeItem('rizzumeMode'); } catch (e) {}
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('swipeAppScreen').classList.add('hidden');
  document.getElementById('directoryScreen').classList.add('hidden');
  document.getElementById('directoryScreen').classList.remove('flex');
  closeProfileScreen();
  if (!isGuestUser()) window.RizzumeExperience?.navigated('home');
  lucide.createIcons();
}

// RENDER DIRECT DIRECTORY VIEW (BLURRED FOR GUESTS)
function profileInitials(name) {
  return String(name || 'Member').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => Array.from(part)[0]).join('').toUpperCase() || 'M';
}

function setProfilePhoto(image, url) {
  image.hidden = !url;
  image.onerror = () => { image.hidden = true; };
  if (url) image.src = url;
  else image.removeAttribute('src');
}

function renderDirectory() {
  const grid = document.getElementById('directoryGrid');
  grid.innerHTML = '';
  const guest = isGuestUser();
  PROFILES.forEach(profile => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-3xl p-5 border border-pink-100 shadow-soft flex flex-col justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all";
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-3.5 mb-4">
          <div class="member-avatar ${guest ? 'blur-[2px]' : ''}"><span aria-hidden="true">${escapeHtml(profileInitials(profile.name))}</span><img data-profile-photo alt="${escapeHtml(profile.name)}" hidden /></div>
          <div>
            <span class="text-[9px] uppercase font-black text-tinder-orange bg-orange-50 px-2 py-0.5 rounded-full inline-block mb-0.5">${escapeHtml(profile.persona)}</span>
            <h3 class="font-black text-sm text-zinc-900 ${guest ? 'blur-[4px] select-none' : ''}">${escapeHtml(profile.name)}</h3>
            <p class="text-xs text-tinder-pink font-semibold ${guest ? 'blur-[4px] select-none' : ''}">${escapeHtml(profile.role)}</p>
          </div>
        </div>
        <p class="text-xs text-zinc-600 line-clamp-2 mb-3 leading-relaxed ${guest ? 'blur-[5px] select-none' : ''}">${escapeHtml(profile.bio)}</p>
        <div class="flex flex-wrap gap-1 mb-4 ${guest ? 'blur-[4px] select-none' : ''}">
          ${(profile.tags || []).slice(0, 3).map(tag => `<span class="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="grid grid-cols-1 ${canEditProfile(profile.id) ? 'sm:grid-cols-3' : ''} gap-2">
        <button type="button" data-action="view" class="directory-view w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5">
          ${guest ? '<i data-lucide="lock" class="w-3.5 h-3.5 text-tinder-pink"></i><span>Unlock Full Profile</span>' : '<span>View Full Profile</span>'}
        </button>
        ${canEditProfile(profile.id) ? `<button type="button" data-action="edit" class="w-full py-2.5 rounded-xl bg-pink-50 text-tinder-pink text-xs font-bold">Edit my profile</button><button type="button" data-action="delete" class="w-full py-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">Delete</button>` : ''}
      </div>`;
    setProfilePhoto(card.querySelector('[data-profile-photo]'), safeImageUrl(profile.images?.[0]?.url || profile.image));
    card.querySelector('[data-action="view"]').addEventListener('click', () => openProfileScreen(profile));
    if (canEditProfile(profile.id)) {
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openProfileEditor(profile));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDeleteProfile(profile));
    }
    grid.appendChild(card);
  });
  lucide.createIcons();
}

function openProfileScreenById(id) {
  const profile = PROFILES.find(p => p.id === id);
  if (profile) openProfileScreen(profile);
}

// SOUND SYNTHESIS
let audioCtx = null;
function playBeep(type) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioCtx ||= new Audio();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'like') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'super') {
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      osc.frequency.setValueAtTime(1174.66, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (e) {}
}

// RENDER PROFILE STACK (CONTINUOUS LOOP + BLURRED TEASER FOR GUESTS)
function renderDeck() {
  cardsState = matchableProfiles(cardsState);
  if (window.RizzumeConnections) cardsState = cardsState.filter(p => window.RizzumeConnections.discoverable(p.id));
  const container = document.getElementById('cardsWrapper');
  const emptyDeck = document.getElementById('emptyDeck');
  container.innerHTML = '';
  activeCardElem = null;
  if (cardsState.length === 0) {
    emptyDeck.classList.remove('hidden');
    return;
  }
  emptyDeck.classList.add('hidden');
  const guest = isGuestUser();

  for (let i = Math.min(cardsState.length, 3) - 1; i >= 0; i--) {
    const profile = cardsState[i];
    const isTopCard = i === 0;
    const scale = 1 - (i * 0.04);
    const translateY = i * 10;
    const zIndex = 30 - i;
    const card = document.createElement('div');
    card.className = `swipe-card absolute inset-0 w-full h-full rounded-3xl bg-white border border-pink-100 shadow-soft overflow-hidden flex flex-col justify-between select-none ${isTopCard ? 'cursor-grab active:cursor-grabbing card-transition' : ''}`;
    card.style.transform = `translate3d(0px, ${translateY}px, 0px) scale(${scale})`;
    card.style.zIndex = zIndex;
    card.setAttribute('data-id', profile.id);
    if (isTopCard) {
      card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Open full portfolio of ' + profile.name);
    } else card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="relative w-full h-[54%] overflow-hidden bg-zinc-900 pointer-events-none">
        <img src="${escapeHtml(safeImageUrl(profile.images?.[0]?.url || profile.image))}" alt="${escapeHtml(profile.name)}" class="w-full h-full object-cover spooderman-original ${guest ? 'blur-[3px] scale-105' : ''}" />
        <img src="images/spooderman.webp" alt="" class="spooderman-hover absolute inset-0 w-full h-full object-contain opacity-0 transition-opacity duration-200 ease-out pointer-events-none" aria-hidden="true" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"></div>
        <div class="stamp-like absolute top-6 left-6 border-4 border-emerald-400 text-emerald-400 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[-15deg] opacity-0 transition-opacity">HIRE / MATCH</div>
        <div class="stamp-nope absolute top-6 right-6 border-4 border-rose-500 text-rose-500 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[15deg] opacity-0 transition-opacity">PASS</div>
        <div class="stamp-super absolute bottom-14 left-1/2 -translate-x-1/2 border-4 border-sky-400 text-sky-400 font-black text-xl uppercase tracking-wider px-3 py-1 rounded-xl opacity-0 transition-opacity">SUPER LIKE ★</div>
        <div class="absolute top-4 left-4 flex items-center gap-2"><span class="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold">${guest ? '🔒 Locked Profile' : 'Open for Projects'}</span></div>
        <div class="absolute bottom-3 left-4 right-4 text-white">
          <span class="text-[10px] uppercase font-black tracking-widest text-tinder-orange bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full inline-block mb-1">
            ${escapeHtml(profile.persona)}
          </span>
          <div class="flex items-center gap-2 ${guest ? 'blur-[5px] select-none' : ''}">
            <h2 class="text-xl font-black">${escapeHtml(profile.name)}</h2>
            <span class="text-lg font-medium text-zinc-300">${escapeHtml(profile.age)}</span>
            ${profile.verified ? `<i data-lucide="badge-check" class="w-5 h-5 text-sky-400 fill-sky-400"></i>` : ''}
          </div>
          <p class="text-xs text-zinc-300 font-medium flex items-center gap-1 mt-0.5 ${guest ? 'blur-[4px] select-none' : ''}">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-tinder-pink"></i> ${escapeHtml(profile.location)}
          </p>
        </div>
      </div>

      <div class="p-4 flex-1 overflow-y-auto space-y-3 bg-white pointer-events-none relative">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-2 ${guest ? 'blur-[4px] select-none' : ''}">
          <span class="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
            <i data-lucide="briefcase" class="w-3.5 h-3.5 text-tinder-pink"></i> ${escapeHtml(profile.role)}
          </span>
          <span class="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            ${escapeHtml(profile.matchPercentage)}
          </span>
        </div>

        <p class="text-xs text-zinc-600 leading-relaxed font-normal ${guest ? 'blur-[5px] select-none' : ''}">${escapeHtml(profile.bio)}</p>

        <div class="flex flex-wrap gap-1.5 pt-1 ${guest ? 'blur-[4px] select-none' : ''}">
          ${(profile.tags || []).map(t => `<span class="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">⚡ ${escapeHtml(t)}</span>`).join('')}
        </div>

        <div class="bg-rose-50/50 rounded-2xl p-2.5 border border-rose-100/60 space-y-1 ${guest ? 'blur-[5px] select-none' : ''}">
          <span class="text-[10px] uppercase font-black text-tinder-pink tracking-wider block">Why You Should Match:</span>
          ${(profile.dealbreakers || []).map(d => `<p class="text-[11px] text-zinc-700 font-medium">${escapeHtml(d)}</p>`).join('')}
        </div>

        <div class="text-right text-[10px] font-bold text-tinder-pink pt-1">
          ${guest ? '🔒 Tap card to unlock full profile &rarr;' : 'Click card to open full portfolio &rarr;'}
        </div>
      </div>
    `;

    container.appendChild(card);
  }
  lucide.createIcons();
  attachTopCardListeners();
}

function attachTopCardListeners() {
  const topCard = document.querySelector('#cardsWrapper .swipe-card:last-child');
  if (!globalDragListenersRegistered) {
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    globalDragListenersRegistered = true;
  }
  if (!topCard) return;
  activeCardElem = topCard;
  topCard.addEventListener('mousedown', onDragStart);
  topCard.addEventListener('touchstart', onDragStart, { passive: true });
  topCard.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && !isSwiping) {
      event.preventDefault();
      const profile = PROFILES.find(item => item.id === topCard.getAttribute('data-id'));
      if (profile) openProfileScreen(profile);
    }
  });
  topCard.addEventListener('click', event => {
    if (hasSwipedOrMoved || isSwiping) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const profile = PROFILES.find(item => item.id === topCard.getAttribute('data-id'));
    if (profile) openProfileScreen(profile);
  });
}

function onDragStart(e) {
  if (!activeCardElem || isSwiping) return;
  isDragging = true;
  hasSwipedOrMoved = false;
  activeCardElem.classList.remove('card-transition');

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  startX = clientX;
  startY = clientY;
}

function onDragMove(e) {
  if (!isDragging || !activeCardElem) return;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  currentX = clientX - startX;
  currentY = clientY - startY;

  if (Math.abs(currentX) > 6 || Math.abs(currentY) > 6) {
    hasSwipedOrMoved = true;
  }

  const rotate = currentX * 0.08;
  activeCardElem.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px) rotate(${rotate}deg)`;

  const stampLike = activeCardElem.querySelector('.stamp-like');
  const stampNope = activeCardElem.querySelector('.stamp-nope');
  const stampSuper = activeCardElem.querySelector('.stamp-super');

  if (currentX > 30) {
    stampLike.style.opacity = Math.min((currentX - 30) / 70, 1);
    stampNope.style.opacity = 0;
    stampSuper.style.opacity = 0;
  } else if (currentX < -30) {
    stampNope.style.opacity = Math.min((-currentX - 30) / 70, 1);
    stampLike.style.opacity = 0;
    stampSuper.style.opacity = 0;
  } else if (currentY < -40) {
    stampSuper.style.opacity = Math.min((-currentY - 40) / 60, 1);
    stampLike.style.opacity = 0;
    stampNope.style.opacity = 0;
  } else {
    stampLike.style.opacity = 0;
    stampNope.style.opacity = 0;
    stampSuper.style.opacity = 0;
  }
}

function onDragEnd() {
  if (!isDragging || !activeCardElem) return;
  isDragging = false;

  const threshold = 110;
  const superThreshold = -120;

  if (currentX > threshold) {
    finalizeSwipe('right');
  } else if (currentX < -threshold) {
    finalizeSwipe('left');
  } else if (currentY < superThreshold) {
    finalizeSwipe('up');
  } else {
    activeCardElem.classList.add('card-transition');
    activeCardElem.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg)';
    const stamps = activeCardElem.querySelectorAll('.stamp-like, .stamp-nope, .stamp-super');
    stamps.forEach(s => s.style.opacity = 0);
  }

  currentX = 0;
  currentY = 0;
}

function triggerSwipeAction(direction) {
  if (!cardsState.length && PROFILES.length) {
    cardsState = [...PROFILES];
    renderDeck();
  }
  const topCard = document.querySelector('#cardsWrapper .swipe-card:last-child');
  if (!topCard || cardsState.length === 0) return;
  activeCardElem = topCard;
  finalizeSwipe(direction);
}

async function finalizeSwipe(direction) {
  if (cardsState.length === 0 || isSwiping || matchRemovalPending) return;
  if (!isGuestUser() && !backendAvailable) return showToast('Connect to Rizzume','Reconnect before sending a request.');
  if (isOwnProfile(cardsState[0].id)) { renderDeck(); return; }
  const card = activeCardElem || document.querySelector('#cardsWrapper .swipe-card:last-child');
  if (!card) return;

  if (isGuestUser()) {
    card.classList.add('card-transition');
    card.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg)';
    card.querySelectorAll('.stamp-like, .stamp-nope, .stamp-super').forEach(s => s.style.opacity = 0);
    const targetPage = cardsState[0]?.page || 'index.html';
    openSubscriptionHook(targetPage);
    return;
  }

  isSwiping = true;
  hasSwipedOrMoved = true;
  isDragging = false;
  const swipedProfile = cardsState[0];
  const action = direction === 'left' ? 'pass' : direction === 'up' ? 'super_like' : 'like';
  card.classList.add('card-transition');

  if (backendAvailable) {
    try {
      if (action === 'pass') await apiCall(`/me/swipes/${encodeURIComponent(swipedProfile.id)}`, 'PUT', { action }, { admin: false });
      else {
        const result=await window.RizzumeConnections.send(swipedProfile,action === 'super_like');
        if (!result) { isSwiping=false; hasSwipedOrMoved=false; renderDeck(); return; }
      }
    } catch (error) {
      if (error.status === 404) {
        cardsState = cardsState.filter(profile => profile.id !== swipedProfile.id);
        PROFILES = PROFILES.filter(profile => profile.id !== swipedProfile.id);
        showToast('Profile removed', 'This card was deleted by another editor.');
        isSwiping = false;
        hasSwipedOrMoved = false;
        try { await refreshProfilesAndMatches(); renderDirectory(); } catch (_) {}
        renderDeck();
        return;
      }
      card.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg)';
      card.style.opacity = '1';
      isSwiping = false;
      hasSwipedOrMoved = false;
      showToast('Swipe not saved', `${error.message}. Try again.`);
      return;
    }
  }

  swipeHistory.push({ profile: swipedProfile, direction });

  if (direction === 'right') {
    playBeep('like');
    card.style.transform = 'translate3d(600px, 50px, 0px) rotate(25deg)';
    card.style.opacity = '0';
  } else if (direction === 'left') {
    playBeep('pass');
    card.style.transform = 'translate3d(-600px, 50px, 0px) rotate(-25deg)';
    card.style.opacity = '0';
    showToast('Passed', `${swipedProfile.name} moved to back of deck`);
  } else {
    playBeep('super');
    card.style.transform = 'translate3d(0px, -700px, 0px) rotate(0deg)';
    card.style.opacity = '0';
  }

  setTimeout(() => {
    cardsState = [...cardsState.filter(profile => profile.id !== swipedProfile.id), swipedProfile];
    isSwiping = false;
    hasSwipedOrMoved = false;
    renderDeck();
  }, 300);
}

async function rewindLastSwipe() {
  if (isSwiping || matchRemovalPending) return;
  if (!swipeHistory.length) {
    return showToast('Nothing to Rewind', 'Swipe a card first to bring it back.');
  }
  const last = swipeHistory.at(-1);
  if (last.direction !== 'left') {
    const state=window.RizzumeConnections?.state(last.profile.id);
    if (state?.status !== 'pending' || state.direction !== 'outgoing')
      return showToast('Request already changed','Review the latest status in Connections.');
    try { await window.RizzumeConnections.action(last.profile.id,'cancel'); }
    catch (error) { return showToast('Could not rewind',error.message); }
  }
  swipeHistory.pop();
  cardsState = [last.profile, ...cardsState.filter(p => p.id !== last.profile.id)];
  renderDeck();
  showToast('Rewound!', `${last.profile.name} is back on top.`);
}

function handleMatchSuccess(profile, isSuper) {
  if (isOwnProfile(profile.id)) return;
  if (window.RizzumeConnections?.state(profile.id)?.status !== 'accepted') return;
  currentlyViewingProfile = profile;
  const existing = matchedProfiles.find(item => item.id === profile.id);
  if (!existing) matchedProfiles.push({ ...profile, isSuper });
  else existing.isSuper = Boolean(isSuper);
  updateMatchesUI();
  if (typeof confetti === 'function') confetti({
    particleCount: isSuper ? 120 : 70, spread: 80, origin: { y: 0.6 },
    colors: ['#FE3C72', '#FD5564', '#FFD700', '#00D2FF', '#FFFFFF']
  });
  const modal = document.getElementById('matchModal');
  const box = document.getElementById('matchModalBox');
  const subtitle = document.getElementById('matchModalSubtitle');
  const avatar = document.getElementById('matchModalAvatar');

  avatar.src = safeImageUrl(profile.image);
  subtitle.innerHTML = `You and <strong>${escapeHtml(profile.name)}</strong> are now connected. Say hello and build something together.`;

  modal.classList.remove('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-90');
  box.classList.add('scale-100');
  showToast('Connection accepted', 'You can now message and call each other.');
}

function closeMatchModal() {
  const modal = document.getElementById('matchModal');
  const box = document.getElementById('matchModalBox');
  modal.classList.add('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-100');
  box.classList.add('scale-90');
}

function openDetailFromMatch() {
  closeMatchModal();
  if (currentlyViewingProfile) {
    openProfileScreen(currentlyViewingProfile);
  }
}

function openChatFromMatch() {
  const target = currentlyViewingProfile;
  closeMatchModal();
  if (target) openChat(target.id);
}

async function messageCurrentProfile() {
  if (!currentlyViewingProfile) return;
  const profile = currentlyViewingProfile;
  if (isOwnProfile(profile.id)) return showToast('Your profile', 'You cannot match or message yourself.');
  if (!backendAvailable) {
    return showToast('Connect to Rizzume','Reconnect before sending a request.');
  }
  if (!matchedProfiles.some(p => p.id === profile.id)) {
    try {
      const result=await window.RizzumeConnections.send(profile);
      if (result?.status === 'pending') window.RizzumeConnections.open(result.direction);
      return;
    } catch (error) {
      return showToast('Could not connect', error.message);
    }
  }
  closeProfileScreen();
  await openChat(profile.id);
}

async function copyCurrentProfileEmail() {
  const email = currentlyViewingProfile?.details?.email;
  if (!email) return showToast('No Email Listed', 'This developer has not listed a public email.');
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(email);
    showToast('Email Copied!', email);
  } catch (_) {
    showToast('Contact Email', email);
  }
}

async function pingMatchedProfile(profile) {
  if (!profile) return;
  if (!backendAvailable) {
    const email = profile.details?.email;
    if (email && navigator.clipboard?.writeText) await navigator.clipboard.writeText(email).catch(() => {});
    return showToast('Pinged (Offline)', email ? `Copied ${email}` : profile.name);
  }
  try {
    await apiCall(`/me/conversations/${encodeURIComponent(profile.id)}/messages`, 'POST', {
      body: `👋 Hey ${profile.name.split(',')[0]}! Just pinged you from Rizzume — let's connect!`
    }, { admin: false });
    playBeep('like');
    showToast('Ping Sent! ⚡', `Opening chat with ${profile.name}`);
    toggleMatchesDrawer(false);
    await openChat(profile.id);
  } catch (error) {
    toggleMatchesDrawer(false);
    await openChat(profile.id);
  }
}

// REDIRECT DIRECTLY TO MAIN FULL PORTFOLIO PAGE (OR TRIGGER PRANK PAYWALL FOR GUESTS)
function openProfileScreen(profile) {
  if (!profile) return;
  currentlyViewingProfile = profile;
  const targetPage = profile.page || FALLBACK_PROFILES.find(m => m.id === profile.id)?.page;

  if (isGuestUser()) {
    openSubscriptionHook(targetPage || 'index.html');
    return;
  }

  if (targetPage) {
    window.location.href = targetPage;
    return;
  }

  const hero = document.getElementById('detailHeroImage');
  setProfilePhoto(hero, safeImageUrl(profile.images?.[0]?.url || profile.image));
  hero.alt = profile.name || 'Profile';
  document.getElementById('detailHeroInitials').textContent = profileInitials(profile.name);
  document.getElementById('detailHeroName').textContent = profile.name || '';
  document.getElementById('detailHeroRole').textContent = profile.role || 'Portfolio member';
  const persona = document.getElementById('detailPersonaBadge');
  persona.textContent = profile.persona || '';
  persona.hidden = !profile.persona;
  const location = document.getElementById('detailHeroLocation');
  location.textContent = profile.location || '';
  location.hidden = !profile.location;
  const bio = document.getElementById('detailFullBio');
  bio.textContent = profile.details?.fullBio || profile.bio || "This member hasn't added an introduction yet.";
  bio.classList.toggle('detail-empty', !profile.details?.fullBio && !profile.bio);

  const ghLink = document.getElementById('detailGithubLink');
  const liLink = document.getElementById('detailLinkedinLink');
  const copyEmailBtn = document.getElementById('detailCopyEmailBtn');
  const ghUrl = safeHref(profile.details?.github);
  const liUrl = safeHref(profile.details?.linkedin);
  ghLink.href = ghUrl;
  ghLink.hidden = ghUrl === '#';
  liLink.href = liUrl;
  liLink.hidden = liUrl === '#';
  if (copyEmailBtn) copyEmailBtn.hidden = !profile.details?.email;

  const projectContainer = document.getElementById('detailProjectItems');
  projectContainer.replaceChildren();
  (profile.details?.projects || []).forEach(project => {
    const item = document.createElement('div');
    item.className = "p-3 bg-zinc-50 border border-zinc-100 rounded-xl";
    item.innerHTML = `
      <h4 class="text-xs font-bold text-zinc-900">${escapeHtml(project.title)}</h4>
      <p class="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">${escapeHtml(project.desc)}</p>
    `;
    projectContainer.appendChild(item);
  });
  if (!projectContainer.children.length) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty-panel';
    empty.textContent = 'No projects shared yet.';
    projectContainer.appendChild(empty);
  }
  const skills = document.getElementById('detailSkillsContainer');
  skills.replaceChildren();
  (profile.tags || []).forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'px-2.5 py-1 rounded-full bg-pink-50 text-tinder-pink text-[10px] font-bold';
    pill.textContent = tag;
    skills.appendChild(pill);
  });
  if (!skills.children.length) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = 'Skills will appear here when added.';
    skills.appendChild(empty);
  }

  renderProfileGallery(profile);
  const contactButton = document.getElementById('detailGetInTouchBtn');
  if (contactButton) contactButton.hidden = isOwnProfile(profile.id);
  if (contactButton && !isOwnProfile(profile.id)) {
    const state=window.RizzumeConnections?.state(profile.id);
    contactButton.textContent=state?.status === 'accepted' ? 'Message' : state?.status === 'pending' ? 'View request' : 'Send connection request';
  }
  const actions = ensureProfileActions();
  actions.replaceChildren();
  if (canEditProfile(profile.id)) {
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = 'Edit';
    edit.className = 'px-3 py-2 rounded-xl bg-pink-50 text-tinder-pink text-xs font-bold';
    edit.addEventListener('click', () => openProfileEditor(profile));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Delete';
    remove.className = 'px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold';
    remove.addEventListener('click', () => confirmDeleteProfile(profile));
    actions.append(edit, remove);
  }
  const screen = document.getElementById('fullProfileScreen');
  screen.classList.remove('hidden');
  screen.classList.add('flex');
  window.scrollTo(0, 0);
  lucide.createIcons();
}

function ensureProfileActions() {
  const screen = document.getElementById('fullProfileScreen');
  let actions = document.getElementById('detailManagementActions');
  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'detailManagementActions';
    actions.className = 'flex items-center gap-2 mt-4 flex-wrap';
    const content = screen.querySelector('.w-full.max-w-xl');
    content.insertBefore(actions, content.children[1]);
  }
  return actions;
}

function renderProfileGallery(profile) {
  const screen = document.getElementById('fullProfileScreen');
  let gallery = document.getElementById('detailGallery');
  if (!gallery) {
    gallery = document.createElement('section');
    gallery.id = 'detailGallery';
    gallery.className = 'mt-4';
    const content = screen.querySelector('.w-full.max-w-xl');
    content.insertBefore(gallery, content.children[1]);
  }
  const images = (profile.images || []).map(image => safeImageUrl(image.url)).filter(Boolean);
  const mainPhoto = safeImageUrl(profile.image);
  if (!images.length && mainPhoto) images.push(mainPhoto);
  currentGalleryIndex = 0;
  gallery.replaceChildren();
  gallery.dataset.images = JSON.stringify(images);
  gallery.hidden = !images.length;
  document.getElementById('detailCover').hidden = !!images.length;
  if (!images.length) return;
  const frame = document.createElement('div');
  frame.className = 'relative';
  const track = document.createElement('div');
  track.id = 'profileGalleryTrack';
  track.className = 'gallery-track';
  {
    images.forEach((url, index) => {
      const slide = document.createElement('div');
      slide.className = 'gallery-slide';
      const backdrop = document.createElement('img');
      backdrop.className = 'gallery-backdrop';
      backdrop.src = url;
      backdrop.alt = '';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.decoding = 'async';
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${profile.name || 'Profile'} image ${index + 1}`;
      image.loading = index === 0 ? 'eager' : 'lazy';
      image.className = 'gallery-image image-loading';
      const imageSettled = () => {
        image.classList.remove('image-loading');
        if (index === currentGalleryIndex) fitGalleryHeight(index);
      };
      image.addEventListener('load', imageSettled, { once: true });
      image.addEventListener('error', () => {
        const fallback = document.createElement('div');
        fallback.className = 'gallery-photo-fallback';
        fallback.textContent = 'Photo unavailable';
        slide.replaceChildren(fallback);
        imageSettled();
      }, { once: true });
      image.addEventListener('click', () => openLightbox(images, index));
      slide.append(backdrop, image);
      track.appendChild(slide);
    });
  }
  frame.appendChild(track);
  if (images.length > 1) {
    const previous = document.createElement('button');
    previous.type = 'button'; previous.textContent = '‹'; previous.setAttribute('aria-label', 'Previous image');
    previous.className = 'gallery-arrow gallery-prev';
    previous.addEventListener('click', () => moveGallery(-1));
    const next = document.createElement('button');
    next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'Next image');
    next.className = 'gallery-arrow gallery-next';
    next.addEventListener('click', () => moveGallery(1));
    frame.append(previous, next);
  }
  if (images.length) {
    const expand = document.createElement('button');
    expand.type = 'button'; expand.textContent = '⤢'; expand.setAttribute('aria-label', 'View image full screen');
    expand.className = 'gallery-expand';
    expand.addEventListener('click', () => openLightbox(images, currentGalleryIndex));
    frame.appendChild(expand);
  }
  gallery.appendChild(frame);
  const footer = document.createElement('div');
  footer.className = 'flex items-center justify-between mt-2';
  const dots = document.createElement('div');
  dots.className = 'flex gap-1.5';
  dots.id = 'profileGalleryDots';
  if (images.length > 1) images.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'gallery-dot';
    dot.setAttribute('aria-label', `Show image ${index + 1}`);
    dot.addEventListener('click', () => setGalleryIndex(index));
    dots.appendChild(dot);
  });
  const counter = document.createElement('span');
  counter.id = 'profileGalleryCounter';
  counter.className = 'text-[10px] font-bold text-zinc-400';
  counter.textContent = `1/${images.length}`;
  footer.append(dots, counter);
  footer.hidden = images.length < 2;
  gallery.appendChild(footer);
  track.addEventListener('scroll', () => {
    if (!images.length) return;
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    if (index !== currentGalleryIndex) updateGalleryIndicators(index, images.length);
  }, { passive: true });
  gallery.dataset.images = JSON.stringify(images);
  updateGalleryIndicators(0, images.length);
}

function setGalleryIndex(index) {
  const track = document.getElementById('profileGalleryTrack');
  const images = JSON.parse(document.getElementById('detailGallery')?.dataset.images || '[]');
  if (!track || !images.length) return;
  currentGalleryIndex = Math.max(0, Math.min(images.length - 1, index));
  track.scrollTo({ left: currentGalleryIndex * track.clientWidth, behavior: 'smooth' });
  updateGalleryIndicators(currentGalleryIndex, images.length);
}
function moveGallery(direction) { setGalleryIndex(currentGalleryIndex + direction); }
function updateGalleryIndicators(index, count) {
  currentGalleryIndex = index;
  const counter = document.getElementById('profileGalleryCounter');
  if (counter) counter.textContent = count ? `${index + 1}/${count}` : '';
  document.querySelectorAll('#profileGalleryDots .gallery-dot').forEach((dot, dotIndex) => {
    dot.classList.toggle('active', dotIndex === index);
  });
  const previous = document.querySelector('#detailGallery .gallery-prev');
  const next = document.querySelector('#detailGallery .gallery-next');
  if (previous) previous.disabled = index <= 0;
  if (next) next.disabled = index >= count - 1;
  fitGalleryHeight(index);
}

function fitGalleryHeight(index = currentGalleryIndex) {
  const track = document.getElementById('profileGalleryTrack');
  const slide = track && track.children[index];
  if (slide && slide.offsetHeight) track.style.height = `${slide.offsetHeight}px`;
}
window.addEventListener('resize', () => fitGalleryHeight());

function openLightbox(images, index) {
  let modal = document.getElementById('profileLightbox');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'profileLightbox';
    modal.className = 'profile-lightbox hidden';
    modal.innerHTML = '<button type="button" data-close aria-label="Close image viewer" class="lightbox-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12 M6 18 18 6"/></svg></button><button type="button" data-prev aria-label="Previous image" class="lightbox-arrow lightbox-prev">‹</button><img id="lightboxImage" alt="Expanded profile image"><button type="button" data-next aria-label="Next image" class="lightbox-arrow lightbox-next">›</button><p id="lightboxCounter" class="lightbox-counter"></p>';
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-close]')) closeLightbox(); });
    modal.querySelector('[data-prev]').addEventListener('click', () => moveLightbox(-1));
    modal.querySelector('[data-next]').addEventListener('click', () => moveLightbox(1));
    modal.addEventListener('touchstart', event => { lightboxTouchStartX = event.touches[0].clientX; }, { passive: true });
    modal.addEventListener('touchend', event => {
      const delta = event.changedTouches[0].clientX - lightboxTouchStartX;
      if (Math.abs(delta) > 45) moveLightbox(delta < 0 ? 1 : -1);
    }, { passive: true });
    document.body.appendChild(modal);
  }
  modal.dataset.images = JSON.stringify(images);
  lightboxIndex = index;
  modal.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
  showLightboxImage();
  modal.querySelector('[data-close]').focus();
}
function showLightboxImage() {
  const modal = document.getElementById('profileLightbox');
  const images = JSON.parse(modal.dataset.images || '[]');
  if (!images.length) return;
  lightboxIndex = (lightboxIndex + images.length) % images.length;
  const image = document.getElementById('lightboxImage');
  image.classList.add('loading');
  image.onload = () => image.classList.remove('loading');
  image.src = images[lightboxIndex];
  document.getElementById('lightboxCounter').textContent = `${lightboxIndex + 1}/${images.length}`;
  [lightboxIndex - 1, lightboxIndex + 1].forEach(neighbour => {
    const url = images[(neighbour + images.length) % images.length];
    if (url && images.length > 1) new Image().src = url;
  });
  modal.querySelector('[data-prev]').hidden = images.length <= 1;
  modal.querySelector('[data-next]').hidden = images.length <= 1;
}
function moveLightbox(direction) { lightboxIndex += direction; showLightboxImage(); }
function closeLightbox() {
  const modal = document.getElementById('profileLightbox');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('lightbox-open');
}

function closeProfileScreen() {
  closeLightbox();
  const screen = document.getElementById('fullProfileScreen');
  screen.classList.add('hidden');
  screen.classList.remove('flex');
}

function openTopMemberDetail() {
  if (!cardsState.length && PROFILES.length) {
    cardsState = [...PROFILES];
    renderDeck();
  }
  if (cardsState.length > 0) {
    openProfileScreen(cardsState[0]);
  }
}

// MATCHES DRAWER
function toggleMatchesDrawer(show) {
  const drawer = document.getElementById('matchesDrawer');
  const backdrop = document.getElementById('matchesDrawerBackdrop');

  if (show) {
    backdrop.classList.remove('opacity-0', 'pointer-events-none');
    drawer.classList.remove('translate-x-full');
  } else {
    backdrop.classList.add('opacity-0', 'pointer-events-none');
    drawer.classList.add('translate-x-full');
  }
  window.RizzumeConnections?.drawerState(show);
}

async function removeSavedMatch(profileId) {
  if (matchRemovalPending) return false;
  if (!backendAvailable) throw new Error('Connect to Rizzume and try again.');
  if (isSwiping) throw new Error('Wait for your current swipe to finish, then try again.');
  if (!matchedProfiles.some(profile => profile.id === profileId)) return false;
  matchRemovalPending = true;
  try {
    await window.RizzumeConnections.action(profileId,'remove');
    matchedProfiles = matchedProfiles.filter(profile => profile.id !== profileId);
    if (typeof syncRemovedMatch === 'function') syncRemovedMatch(profileId);
    updateMatchesUI();
    return true;
  } finally { matchRemovalPending = false; }
}

function askToRemoveMatch(profileId) {
  if (matchRemovalPending || (matchRemovalDialog && !matchRemovalDialog.el.hidden)) return;
  const profile = matchedProfiles.find(item => item.id === profileId);
  if (!profile) return;
  if (!matchRemovalDialog) {
    const {dialog, icon} = window.RizzumeUI;
    matchRemovalDialog = dialog('removeMatchConfirmation', `<section class="rz-dialog-panel rz-remove-match-panel" aria-describedby="removeMatchDescription">
      <div class="rz-dialog-header"><h2>Remove this connection?</h2><button type="button" data-close class="rz-icon-button" aria-label="Close remove match confirmation">${icon('close')}</button></div>
      <p id="removeMatchDescription" class="rz-remove-match-description">Remove <strong id="removeMatchName"></strong> from your connections?</p>
      <p class="rz-help">Messaging and calls will close for both people. Existing messages stay saved. Reconnecting requires a new request and acceptance.</p>
      <p id="removeMatchError" class="rz-remove-match-error" role="alert" tabindex="-1" hidden></p>
      <div class="rz-dialog-actions"><button id="cancelRemoveMatch" type="button" data-close class="rz-outline-button">Cancel</button><button id="confirmRemoveMatch" type="button" class="rz-primary">Remove connection</button></div>
    </section>`, () => { matchRemovalTarget = null; },
      {initialFocus:'#cancelRemoveMatch', canClose:() => !matchRemovalPending});
    document.getElementById('confirmRemoveMatch').onclick = async () => {
      if (matchRemovalPending || !matchRemovalTarget) return;
      const target = matchRemovalTarget, confirm = document.getElementById('confirmRemoveMatch');
      const error = document.getElementById('removeMatchError'); error.hidden = true;
      const buttons = [...matchRemovalDialog.el.querySelectorAll('button')];
      buttons.forEach(button => { button.disabled = true; });
      matchRemovalDialog.el.setAttribute('aria-busy','true'); confirm.textContent = 'Removing…';
      try {
        const removed = await removeSavedMatch(target.id);
        matchRemovalDialog.close();
        if (removed) showToast('Connection removed', 'Send a new request to reconnect after one minute.');
        (document.querySelector('#matchesList [data-view]') || document.querySelector('#matchesDrawer button'))?.focus();
      } catch (failure) {
        error.textContent = failure.message || 'Could not remove this match. Please try again.';
        error.hidden = false; error.focus();
      } finally {
        buttons.forEach(button => { button.disabled = false; });
        matchRemovalDialog.el.removeAttribute('aria-busy'); confirm.textContent = 'Remove connection';
      }
    };
  }
  matchRemovalTarget = profile;
  document.getElementById('removeMatchName').textContent = profile.name;
  document.getElementById('removeMatchError').hidden = true;
  matchRemovalDialog.open();
}

function updateMatchesUI() {
  matchedProfiles = matchableProfiles(matchedProfiles);
  window.RizzumeExperience?.refresh();
  const count = matchedProfiles.length;
  document.getElementById('matchBadge').textContent = count;
  const list = document.getElementById('matchesList');
  if (window.RizzumeConnections) { window.RizzumeConnections.render(); return; }
  list.innerHTML = '';
  if (count === 0) {
    list.innerHTML = `<div class="py-16 text-center text-zinc-400"><i data-lucide="heart-crack" class="w-10 h-10 mx-auto mb-2 opacity-50"></i><p class="text-xs font-bold text-zinc-600">No matches yet</p><p class="text-[11px] text-zinc-400 mt-0.5">Swipe right on a developer to match!</p></div>`;
  } else {
    matchedProfiles.forEach(item => {
      const row = document.createElement('div');
      row.className = 'rz-match-row';
      row.innerHTML = `
        <button type="button" data-view class="rz-match-open" aria-label="View ${escapeHtml(item.name)}">
          <span class="member-avatar" aria-hidden="true"><span>${escapeHtml(profileInitials(item.name))}</span><img data-profile-photo alt="" hidden /></span>
          <span class="rz-match-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.role)}</span>
          ${item.isSuper ? '<span class="rz-match-super">Super liked</span>' : ''}</span>
        </button>
        <div class="rz-match-actions">
          <button type="button" data-contact class="rz-match-contact" title="Send instant ping & open chat"><i data-lucide="zap" aria-hidden="true"></i>Ping</button>
          <button type="button" data-remove class="rz-match-remove" aria-label="Remove ${escapeHtml(item.name)} from matches"><i data-lucide="heart-off" aria-hidden="true"></i>Remove</button>
        </div>
      `;
      setProfilePhoto(row.querySelector('[data-profile-photo]'), safeImageUrl(item.images?.[0]?.url || item.image));
      row.querySelector('[data-view]').addEventListener('click', () => {
        toggleMatchesDrawer(false); openProfileScreen(item);
      });
      row.querySelector('[data-contact]').addEventListener('click', event => {
        event.stopPropagation(); pingMatchedProfile(item);
      });
      row.querySelector('[data-remove]').addEventListener('click', () => askToRemoveMatch(item.id));
      list.appendChild(row);
    });
  }

  lucide.createIcons();
}

function showToast(title, subtitle) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = `${title} • ${subtitle}`;

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2000);
}

function toggleInfoModal() {
  const modal = document.getElementById('infoModal');
  const isOpen = !modal.classList.contains('pointer-events-none');
  if (isOpen) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  } else {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
}

async function copyTeamContact() {
  const email = teamEmail;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(email);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = email;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast("Copied to Clipboard!", email);
  } catch (_) {
    showToast("Team Email", email);
  }
}

// Check login optionally: guests land on the clean Welcome page and see blurred teaser cards when exploring
window.addEventListener('DOMContentLoaded', async () => {
  document.body?.classList.add('workspace-loading');
  let savedMode = null;
  try { savedMode = sessionStorage.getItem('rizzumeMode'); } catch (_) {}
  if (savedMode === 'swipe' || savedMode === 'directory') {
    startMode(savedMode);
  }

  const loggedIn = window.RizzumeAccount ? await window.RizzumeAccount.checkOptional() : false;
  PROFILES = []; cardsState = [];
  lucide.createIcons();
  updateDynamicCounts();
  showBackendNotice(false);

  try {
    await Promise.all([
      refreshProfilesAndMatches(),
      apiCall('/team', 'GET', undefined, { admin: false }).then(team => {
        if (team?.email) teamEmail = team.email;
      }).catch(() => {})
    ]);
  } catch (error) {
    PROFILES = FALLBACK_PROFILES;
    cardsState = [...FALLBACK_PROFILES];
    matchedProfiles = [];
    backendAvailable = false;
    if (loggedIn) {
      showBackendNotice(true);
      showToast('Backend unavailable', 'Showing a read-only fallback roster.');
    }
    updateDynamicCounts();
    updateMatchesUI();
  }

  renderDirectory();
  renderDeck();
  document.body?.classList.remove('workspace-loading');

  if (loggedIn) {
    window.RizzumeExperience?.ready();
    const urlParams = new URLSearchParams(window.location.search || '');
    const connectionsTab=urlParams.get('connections');
    if (['incoming','outgoing','accepted'].includes(connectionsTab)) window.RizzumeConnections?.open(connectionsTab);
    const qrProfileId = urlParams.get('profile');
    if (qrProfileId && PROFILES.some(p => p.id === qrProfileId)) {
      openProfileScreenById(qrProfileId);
      return;
    }

    const chatId = urlParams.get('chat');
    if (chatId && backendAvailable && PROFILES.some(profile => profile.id === chatId)) {
      await openChat(chatId);
      return;
    }

    let mode = null;
    try { mode = sessionStorage.getItem('rizzumeMode'); } catch (e) {}
    if (mode === 'swipe' || mode === 'directory') startMode(mode);
    else startMode('swipe');
  } else {
    // Guests start on the clean Welcome screen; clicking Discover or Skip Swiping reveals the blurred teaser cards
    goToHome();
  }
});
