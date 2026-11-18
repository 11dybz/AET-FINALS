// Use the page's server, including its current port. A separate frontend server
// can set window.RIZZUME_API_BASE before loading this script.
const API_BASE = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');

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

// Icons are decorative; a failed CDN request must not prevent browsing or API startup.
if (!window.lucide) window.lucide = { createIcons() {} };

// Central API transport: JSON bodies are encoded automatically, while FormData is left untouched for multipart uploads.
async function apiCall(path, method = 'GET', data, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { ...(options.headers || {}) };
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

async function fetchBackendProfiles() {
  try {
    const response = await fetch(`${API_BASE}/profiles`, { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        // Map backend response fields to your UI cards if needed
        console.log("Connected to backend profiles successfully!", data);
      }
    }
  } catch (err) {
    console.error("Failed to connect to backend:", err);
  }
}

async function refreshProfilesAndMatches() {
  const profiles = await apiCall('/profiles', 'GET', undefined, { admin: false });
  if (Array.isArray(profiles)) {
    PROFILES = profiles.map(profile => ({...profile,
      page: FALLBACK_PROFILES.find(member => member.id === profile.id)?.page}));
    cardsState = [...PROFILES];
  }
  const matches = await apiCall('/me/matches', 'GET', undefined, { admin: false });
  matchedProfiles = Array.isArray(matches) ? matches : [];
  backendAvailable = true;
  showBackendNotice(false);
  updateDynamicCounts();
  updateMatchesUI();
  return { profiles: PROFILES, matches: matchedProfiles };
}

function updateDynamicCounts() {
  const matchBadge = document.getElementById('matchBadge');
  if (matchBadge) matchBadge.textContent = String(matchedProfiles.length);
  ['teamCountHome', 'teamCountButton', 'teamCountFooter', 'directoryCount'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = String(PROFILES.length);
  });
  document.querySelectorAll('[data-requires-backend]').forEach(button => { button.disabled = !backendAvailable; });
}

function showBackendNotice(readOnly) {
  const notice = document.getElementById('backendNotice');
  if (!notice) return;
  if (readOnly) notice.classList.remove('hidden');
  else notice.classList.add('hidden');
  notice.textContent = readOnly ? 'Read-only fallback mode: backend unavailable.' : '';
}

// 4 SPECIFIED TEAM MEMBERS DATA MODEL
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
// PROFILES is replaced by the API roster at startup; fallback data remains read-only when the API is unavailable.
let PROFILES = FALLBACK_PROFILES;
let cardsState = [...PROFILES];
let matchedProfiles = [];
let backendAvailable = false;
let adminKey = ''; // In-memory only; never persisted to localStorage, cookies, or sessionStorage.
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

  // Case 1: Full URL like https://site.com/?profile=fontelar-dave or /FONTELAR.html
  try {
    const url = new URL(cleaned, window.location.origin);
    const paramId = url.searchParams.get('profile');
    if (paramId && PROFILES.some(p => p.id === paramId)) return paramId;

    const matchedByPage = PROFILES.find(p => p.page && url.pathname.toLowerCase().endsWith(p.page.toLowerCase()));
    if (matchedByPage) return matchedByPage.id;
  } catch (e) {
    // Not a URL; fall through to raw ID check
  }

  // Case 2: Raw profile ID string (e.g., "fontelar-dave")
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
    console.error('Camera start failed:', err);
    showToast('Camera Unavailable', 'Allow camera permissions or use HTTPS/localhost.');
    closeQrScanner();
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
  window.RizzumeExperience?.navigated(mode);
  try { sessionStorage.setItem('rizzumeMode', mode); } catch (e) {}
  document.getElementById('homeScreen').classList.add('hidden');

  if (mode === 'swipe') {
    document.getElementById('swipeAppScreen').classList.remove('hidden');
    document.getElementById('directoryScreen').classList.add('hidden');
    document.getElementById('directoryScreen').classList.remove('flex');
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
  window.RizzumeExperience?.navigated('home');
  lucide.createIcons();
}

// RENDER DIRECT DIRECTORY VIEW (NO-SWIPING OPTION)
// Render the directory from the active roster and attach actions without embedding profile data in HTML handlers.
function renderDirectory() {
  const grid = document.getElementById('directoryGrid');
  grid.innerHTML = '';
  PROFILES.forEach(profile => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-3xl p-5 border border-pink-100 shadow-soft flex flex-col justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all";
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-3.5 mb-4">
          <img src="${escapeHtml(safeImageUrl(profile.images?.[0]?.url || profile.image))}" alt="${escapeHtml(profile.name)}" class="w-16 h-16 rounded-2xl object-cover border-2 border-pink-100" />
          <div>
            <span class="text-[9px] uppercase font-black text-tinder-orange bg-orange-50 px-2 py-0.5 rounded-full inline-block mb-0.5">${escapeHtml(profile.persona)}</span>
            <h3 class="font-black text-sm text-zinc-900">${escapeHtml(profile.name)}</h3>
            <p class="text-xs text-tinder-pink font-semibold">${escapeHtml(profile.role)}</p>
          </div>
        </div>
        <p class="text-xs text-zinc-600 line-clamp-2 mb-3 leading-relaxed">${escapeHtml(profile.bio)}</p>
        <div class="flex flex-wrap gap-1 mb-4">
          ${(profile.tags || []).slice(0, 3).map(tag => `<span class="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="grid grid-cols-1 ${backendAvailable ? 'sm:grid-cols-3' : ''} gap-2">
        <button type="button" data-action="view" class="directory-view w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold">View Full Profile</button>
        ${backendAvailable ? `<button type="button" data-action="edit" class="w-full py-2.5 rounded-xl bg-pink-50 text-tinder-pink text-xs font-bold">Edit</button><button type="button" data-action="delete" class="w-full py-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">Delete</button>` : ''}
      </div>`;
    // Attach the selected profile through a closure, not an inline onclick attribute.
    card.querySelector('[data-action="view"]').addEventListener('click', () => openProfileScreen(profile));
    if (backendAvailable) {
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

// RENDER PROFILE STACK
// Build the swipe stack using escaped profile fields and the first gallery image as the cover.
function renderDeck() {
  const container = document.getElementById('cardsWrapper');
  const emptyDeck = document.getElementById('emptyDeck');
  container.innerHTML = '';
  activeCardElem = null;
  if (cardsState.length === 0) {
    emptyDeck.classList.remove('hidden');
    return;
  }
  emptyDeck.classList.add('hidden');
  for (let i = Math.min(cardsState.length, 3) - 1; i >= 0; i--) {
    const profile = cardsState[i];
    const isTopCard = i === 0;
    const card = document.createElement('div');
    const scale = 1 - (i * 0.04);
    const translateY = i * 10;
    const zIndex = 30 - i;
    card.className = `swipe-card absolute inset-0 w-full h-full rounded-3xl bg-white border border-pink-100 shadow-soft overflow-hidden flex flex-col justify-between select-none ${isTopCard ? 'cursor-grab active:cursor-grabbing card-transition' : ''}`;
    card.style.transform = `translate3d(0px, ${translateY}px, 0px) scale(${scale})`;
    card.style.zIndex = zIndex;
    card.setAttribute('data-id', profile.id);
    if (isTopCard) {
      card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View profile of ' + profile.name);
    } else card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="relative w-full h-[54%] overflow-hidden bg-zinc-900 pointer-events-none">
        <img src="${escapeHtml(safeImageUrl(profile.images?.[0]?.url || profile.image))}" alt="${escapeHtml(profile.name)}" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"></div>
        <div class="stamp-like absolute top-6 left-6 border-4 border-emerald-400 text-emerald-400 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[-15deg] opacity-0 transition-opacity">HIRE / MATCH</div>
        <div class="stamp-nope absolute top-6 right-6 border-4 border-rose-500 text-rose-500 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[15deg] opacity-0 transition-opacity">PASS</div>
        <div class="stamp-super absolute bottom-14 left-1/2 -translate-x-1/2 border-4 border-sky-400 text-sky-400 font-black text-xl uppercase tracking-wider px-3 py-1 rounded-xl opacity-0 transition-opacity">SUPER LIKE ★</div>
        <div class="absolute top-4 left-4 flex items-center gap-2"><span class="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold">Open for Projects</span></div>
        <div class="absolute bottom-3 left-4 right-4 text-white">
          <span class="text-[10px] uppercase font-black tracking-widest text-tinder-orange bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full inline-block mb-1">
            ${escapeHtml(profile.persona)}
          </span>
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-black">${escapeHtml(profile.name)}</h2>
            <span class="text-lg font-medium text-zinc-300">${escapeHtml(profile.age)}</span>
            ${profile.verified ? `<i data-lucide="badge-check" class="w-5 h-5 text-sky-400 fill-sky-400"></i>` : ''}
          </div>
          <p class="text-xs text-zinc-300 font-medium flex items-center gap-1 mt-0.5">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-tinder-pink"></i> ${escapeHtml(profile.location)}
          </p>
        </div>
      </div>

      <div class="p-4 flex-1 overflow-y-auto space-y-3 bg-white pointer-events-none">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-2">
          <span class="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
            <i data-lucide="briefcase" class="w-3.5 h-3.5 text-tinder-pink"></i> ${escapeHtml(profile.role)}
          </span>
          <span class="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            ${escapeHtml(profile.matchPercentage)}
          </span>
        </div>

        <p class="text-xs text-zinc-600 leading-relaxed font-normal">${escapeHtml(profile.bio)}</p>

        <div class="flex flex-wrap gap-1.5 pt-1">
          ${(profile.tags || []).map(t => `<span class="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">⚡ ${escapeHtml(t)}</span>`).join('')}
        </div>

        <div class="bg-rose-50/50 rounded-2xl p-2.5 border border-rose-100/60 space-y-1">
          <span class="text-[10px] uppercase font-black text-tinder-pink tracking-wider block">Why You Should Match:</span>
          ${(profile.dealbreakers || []).map(d => `<p class="text-[11px] text-zinc-700 font-medium">${escapeHtml(d)}</p>`).join('')}
        </div>

        <div class="text-right text-[10px] font-bold text-tinder-pink pt-1">
          Click card to open full profile &rarr;
        </div>
      </div>
    `;

    container.appendChild(card);
  }
  lucide.createIcons();
  attachTopCardListeners();
}

// Attach window-level pointer listeners once; each render only binds handlers to the current top card.
function attachTopCardListeners() {
  const topCard = document.querySelector('.swipe-card:last-child');
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
  // A click opens details only when the pointer gesture did not cross a drag threshold.
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
  if (cardsState.length === 0 || !activeCardElem) return;
  finalizeSwipe(direction);
}

async function finalizeSwipe(direction) {
  if (!backendAvailable) return showToast('Read-only mode', 'Connect to the backend and reload before saving a swipe.');
  if (!activeCardElem || cardsState.length === 0 || isSwiping) return;
  isSwiping = true;
  hasSwipedOrMoved = true;
  isDragging = false;
  const card = activeCardElem;
  const swipedProfile = cardsState[0];
  const action = direction === 'left' ? 'pass' : direction === 'up' ? 'super_like' : 'like';
  card.classList.add('card-transition');
  try {
    await apiCall(`/me/swipes/${encodeURIComponent(swipedProfile.id)}`, 'PUT', { action }, { admin: false });
  } catch (error) {
    // A 404 means another editor deleted this profile; dropping it avoids a permanently stuck deck.
    if (error.status === 404) {
      cardsState = cardsState.filter(profile => profile.id !== swipedProfile.id);
      PROFILES = PROFILES.filter(profile => profile.id !== swipedProfile.id);
      showToast('Profile removed', 'This card was deleted by another editor.');
      isSwiping = false;
      hasSwipedOrMoved = false;
      try { await refreshProfilesAndMatches(); renderDirectory(); } catch (refreshError) {}
      renderDeck();
      return;
    }
    // Restore the card so the visitor can retry after a transient network or server failure.
    card.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg)';
    card.style.opacity = '1';
    isSwiping = false;
    hasSwipedOrMoved = false;
    showToast('Swipe not saved', `${error.message}. Try again.`);
    return;
  }

  if (direction === 'right') {
    playBeep('like');
    card.style.transform = 'translate3d(600px, 50px, 0px) rotate(25deg)';
    card.style.opacity = '0';
    handleMatchSuccess(swipedProfile, false);
  } else if (direction === 'left') {
    matchedProfiles = matchedProfiles.filter(profile => profile.id !== swipedProfile.id);
    updateMatchesUI();
    playBeep('pass');
    card.style.transform = 'translate3d(-600px, 50px, 0px) rotate(-25deg)';
    card.style.opacity = '0';
    showToast('Passed', 'Swipe saved');
  } else {
    playBeep('super');
    card.style.transform = 'translate3d(0px, -700px, 0px) rotate(0deg)';
    card.style.opacity = '0';
    handleMatchSuccess(swipedProfile, true);
  }
  // Keep the card locked during its exit transition, then remove exactly the acknowledged profile.
  setTimeout(() => {
    cardsState = cardsState.filter(profile => profile.id !== swipedProfile.id);
    isSwiping = false;
    // Reset the gesture guard after the old card is gone so the next card can open on an ordinary click.
    hasSwipedOrMoved = false;
    renderDeck();
  }, 300);
}

// Update local match feedback only after a successful server write; text fields use textContent.
function handleMatchSuccess(profile, isSuper) {
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
  subtitle.innerHTML = isSuper 
    ? `🔥 <strong>SUPER LIKE!</strong> Priority match unlocked with <strong>${escapeHtml(profile.name)}</strong>!`
    : `You and <strong>${escapeHtml(profile.name)}</strong> matched! Review projects or connect directly.`;

  modal.classList.remove('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-90');
  box.classList.add('scale-100');
  showToast(isSuper ? '★ SUPER LIKED!' : '♥ MATCHED!', 'Added to matches list.');
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

// FULL PROFILE SCREEN OVERLAY
// Open every card in the in-page overlay; original team portfolios are linked, never auto-redirected.
function openProfileScreen(profile) {
  if (!profile) return;
  currentlyViewingProfile = profile;
  const hero = document.getElementById('detailHeroImage');
  hero.src = safeImageUrl(profile.images?.[0]?.url || profile.image);
  hero.alt = profile.name || 'Profile';
  hero.classList.toggle('hidden', !hero.src);
  document.getElementById('detailHeroName').textContent = profile.name || '';
  document.getElementById('detailHeroRole').textContent = profile.role || '';
  document.getElementById('detailPersonaBadge').textContent = profile.persona || '';
  document.getElementById('detailFullBio').textContent = profile.details?.fullBio || profile.bio || '';
  document.getElementById('detailGithubLink').href = safeHref(profile.details?.github);
  document.getElementById('detailLinkedinLink').href = safeHref(profile.details?.linkedin);

  // Build project nodes with textContent so profile-controlled strings never become markup.
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
  const skills = document.getElementById('detailSkillsContainer');
  skills.replaceChildren();
  (profile.tags || []).forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'px-2.5 py-1 rounded-full bg-pink-50 text-tinder-pink text-[10px] font-bold';
    pill.textContent = tag;
    skills.appendChild(pill);
  });

  // Add a scroll-snap gallery to the existing overlay without changing the four member pages.
  renderProfileGallery(profile);
  const actions = ensureProfileActions();
  actions.replaceChildren();
  if (profile.page) {
    const pageLink = document.createElement('a');
    pageLink.href = safeHref(new URL(profile.page, window.location.origin + '/').toString());
    pageLink.textContent = 'Open full portfolio page';
    pageLink.className = 'text-xs font-bold text-tinder-pink hover:underline';
    actions.appendChild(pageLink);
  }
  if (backendAvailable) {
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

// Ensure the existing overlay has a dedicated gallery area and profile-management action row.
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

// Render gallery slides, position dots, a counter, and controls only when more than one image exists.
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
  if (!images.length && profile.image) images.push(safeImageUrl(profile.image));
  currentGalleryIndex = 0;
  gallery.replaceChildren();
  const frame = document.createElement('div');
  frame.className = 'relative';
  const track = document.createElement('div');
  track.id = 'profileGalleryTrack';
  track.className = 'gallery-track';
  if (!images.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'h-52 rounded-2xl bg-gradient-to-br from-tinder-pink to-violet-700 flex items-center justify-center text-white text-5xl font-black';
    placeholder.textContent = (profile.name || '?').slice(0, 1).toUpperCase();
    track.appendChild(placeholder);
  } else {
    images.forEach((url, index) => {
      const slide = document.createElement('div');
      slide.className = 'gallery-slide';
      // Blurred copy of the photo fills any gap around a very tall or narrow image.
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
      // Keep the slide's shimmer visible until the image loads or errors, then resize the card to fit it.
      const imageSettled = () => {
        image.classList.remove('image-loading');
        if (index === currentGalleryIndex) fitGalleryHeight(index);
      };
      image.addEventListener('load', imageSettled, { once: true });
      image.addEventListener('error', imageSettled, { once: true });
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
  counter.textContent = images.length ? `1/${images.length}` : '0/0';
  footer.append(dots, counter);
  gallery.appendChild(footer);
  track.addEventListener('scroll', () => {
    if (!images.length) return;
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    if (index !== currentGalleryIndex) updateGalleryIndicators(index, images.length);
  }, { passive: true });
  gallery.dataset.images = JSON.stringify(images);
  updateGalleryIndicators(0, images.length);
}

// Scroll to a selected gallery image and synchronize its current dot/counter state.
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
  if (counter) counter.textContent = count ? `${index + 1}/${count}` : '0/0';
  document.querySelectorAll('#profileGalleryDots .gallery-dot').forEach((dot, dotIndex) => {
    dot.classList.toggle('active', dotIndex === index);
  });
  const previous = document.querySelector('#detailGallery .gallery-prev');
  const next = document.querySelector('#detailGallery .gallery-next');
  if (previous) previous.disabled = index <= 0;
  if (next) next.disabled = index >= count - 1;
  fitGalleryHeight(index);
}

// Resize the gallery to the visible photo so the card follows each image's own proportions.
function fitGalleryHeight(index = currentGalleryIndex) {
  const track = document.getElementById('profileGalleryTrack');
  const slide = track && track.children[index];
  if (slide && slide.offsetHeight) track.style.height = `${slide.offsetHeight}px`;
}
window.addEventListener('resize', () => fitGalleryHeight());

// Create the fullscreen lightbox shell once, with keyboard, touch, backdrop, and focus handling.
function openLightbox(images, index) {
  let modal = document.getElementById('profileLightbox');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'profileLightbox';
    modal.className = 'profile-lightbox hidden';
    modal.innerHTML = '<button type="button" data-close aria-label="Close image viewer" class="lightbox-close">×</button><button type="button" data-prev aria-label="Previous image" class="lightbox-arrow lightbox-prev">‹</button><img id="lightboxImage" alt="Expanded profile image"><button type="button" data-next aria-label="Next image" class="lightbox-arrow lightbox-next">›</button><p id="lightboxCounter" class="lightbox-counter"></p>';
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
  // Warm the cache for the neighbouring photos so arrow/swipe navigation feels instant.
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
  if (cardsState.length > 0) {
    openProfileScreen(cardsState[0]);
  }
}

async function openChat(profileId) {
  if (!backendAvailable) return showToast('Messages unavailable', 'Connect to the backend and reload.');
  if (profileId && !matchedProfiles.some(profile => profile.id === profileId)) {
    return showToast('Match first', 'Like this profile before sending a message.');
  }
  chatLastFocused = document.activeElement;
  chatOpen = true;
  chatProfileId = profileId || null;
  chatGeneration++;
  document.getElementById('threadView').classList.add('hidden');
  document.getElementById('threadView').classList.remove('flex');
  document.getElementById('conversationList').classList.remove('hidden');
  document.getElementById('chatTitle').textContent = 'Messages';
  const sheet = document.getElementById('chatSheet');
  sheet.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
  sheet.classList.add('flex');
  lucide.createIcons();
  await loadConversations();
  if (!chatOpen) return;
  if (chatProfileId) await openChatThread(chatProfileId);
  startChatPolling();
  const composer = document.getElementById('chatComposer');
  if (chatProfileId) composer.focus();
  else document.getElementById('chatBackButton').focus();
}

function closeChat() {
  chatGeneration++;
  chatOpen = false;
  chatProfileId = null;
  stopChatPolling();
  const sheet = document.getElementById('chatSheet');
  sheet.classList.add('hidden', 'opacity-0', 'pointer-events-none');
  sheet.classList.remove('flex');
  if (chatLastFocused && chatLastFocused.focus) chatLastFocused.focus();
}

async function openChatForProfile(profileId) {
  toggleMatchesDrawer(false);
  await openChat(profileId);
}

async function loadConversations() {
  if (!chatOpen) return;
  try {
    const conversations = await apiCall('/me/conversations');
    if (!chatOpen) return;
    const list = document.getElementById('conversationList');
    list.replaceChildren();
    let unreadTotal = 0;
    for (const conversation of conversations) {
      unreadTotal += Number(conversation.unreadCount || 0);
      const profile = conversation.profile;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'w-full min-h-11 flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 bg-zinc-50 text-left focus:outline-none focus:ring-2 focus:ring-tinder-pink';
      row.addEventListener('click', () => openChatThread(profile.id));
      const img = document.createElement('img');
      img.src = safeImageUrl(profile.image);
      img.alt = '';
      img.className = 'w-12 h-12 rounded-xl object-cover';
      const copy = document.createElement('div');
      copy.className = 'flex-1 min-w-0';
      const name = document.createElement('p');
      name.className = 'font-extrabold text-xs text-zinc-900 truncate';
      name.textContent = profile.name;
      const preview = document.createElement('p');
      preview.className = 'text-[11px] text-zinc-500 truncate';
      preview.textContent = conversation.lastMessage ? conversation.lastMessage.body : 'Start a conversation';
      copy.append(name, preview);
      const badge = document.createElement('span');
      badge.className = 'hidden';
      if (conversation.unreadCount > 0) {
        badge.className = 'min-w-5 h-5 px-1.5 rounded-full bg-tinder-pink text-white text-[10px] font-black flex items-center justify-center';
        badge.textContent = String(conversation.unreadCount);
      }
      row.append(img, copy, badge);
      list.appendChild(row);
    }
    const badge = document.getElementById('messagesUnreadBadge');
    badge.textContent = unreadTotal ? String(unreadTotal) : '';
    badge.classList.toggle('hidden', unreadTotal === 0);
  } catch (err) {
    showToast('Messages unavailable', 'Try again in a moment');
  }
}

async function openChatThread(profileId) {
  chatGeneration++;
  chatProfileId = profileId;
  chatAfterId = 0;
  chatFailedPayload = null;
  document.getElementById('chatComposer').value = '';
  document.getElementById('chatError').classList.add('hidden');
  const profile = matchedProfiles.find(p => p.id === profileId) || PROFILES.find(p => p.id === profileId);
  chatProfileName = profile ? profile.name : profileId;
  document.getElementById('chatTitle').textContent = chatProfileName;
  document.getElementById('chatSubtitle').textContent = 'Conversation';
  document.getElementById('conversationList').classList.add('hidden');
  const thread = document.getElementById('threadView');
  thread.classList.remove('hidden');
  thread.classList.add('flex');
  document.getElementById('messageLog').replaceChildren();
  document.getElementById('messageLog').dataset.lastDay = '';
  await pollChatMessages(true);
  try { await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/read`, 'POST'); } catch (e) {}
  await loadConversations();
}

async function pollChatMessages(initial = false) {
  if (!chatOpen || !chatProfileId || document.hidden) return;
  const profileId = chatProfileId, generation = chatGeneration;
  if (chatPolls.has(generation)) return;
  chatPolls.add(generation);
  try {
    const log = document.getElementById('messageLog');
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const messages = await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/messages?afterId=${chatAfterId}`, 'GET', undefined, {admin: false});
    if (!chatOpen || generation !== chatGeneration) return;
    if (messages.length) {
      let lastDay = log.dataset.lastDay || '';
      for (const message of messages) {
        if (log.querySelector(`[data-message-id="${Number(message.id)}"]`)) continue;
        const day = new Date(message.createdAt).toLocaleDateString();
        if (day !== lastDay) {
          const separator = document.createElement('div');
          separator.className = 'text-center text-[10px] font-bold text-zinc-400 my-2';
          separator.textContent = day;
          log.appendChild(separator);
          lastDay = day;
          log.dataset.lastDay = day;
        }
        const bubble = document.createElement('div');
        bubble.className = `max-w-[82%] rounded-2xl px-3 py-2 ${message.sender === 'visitor' ? 'ml-auto text-white bg-gradient-to-r from-tinder-pink to-tinder-orange' : 'mr-auto bg-white border border-zinc-200 text-zinc-900'}`;
        bubble.dataset.messageId = String(message.id);
        const body = document.createElement('p');
        body.className = 'text-sm whitespace-pre-wrap break-words';
        if (window.RizzumeUI?.messageBody) window.RizzumeUI.messageBody(body, message.body);
        else body.textContent = message.body;
        const time = document.createElement('time');
        time.className = 'block mt-1 text-[9px] opacity-70';
        time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        bubble.append(body, time);
        log.appendChild(bubble);
        chatAfterId = Math.max(chatAfterId, Number(message.id));
      }
      if (initial || nearBottom) scrollChatToBottom(true);
      else document.getElementById('newMessagesPill').classList.remove('hidden');
      if (messages.some(message => message.sender === 'member')) {
        await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/read`, 'POST', undefined, {admin: false});
        if (chatOpen && generation === chatGeneration) await loadConversations();
      }
    }
  } catch (err) {
    if (initial && chatOpen && generation === chatGeneration) showToast('Messages unavailable', err.message);
  } finally { chatPolls.delete(generation); }
}

function scrollChatToBottom(force) {
  const log = document.getElementById('messageLog');
  log.scrollTop = log.scrollHeight;
  document.getElementById('newMessagesPill').classList.add('hidden');
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(() => {
    if (chatOpen && !document.hidden) pollChatMessages(false);
  }, 4000);
}
function stopChatPolling() {
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = null;
}
document.addEventListener('visibilitychange', () => {
  if (chatOpen && !document.hidden) pollChatMessages(false);
});

function chatComposerInput() {
  const composer = document.getElementById('chatComposer');
  composer.style.height = 'auto';
  composer.style.height = Math.min(composer.scrollHeight, 128) + 'px';
  document.getElementById('chatCharacterCount').textContent = String(composer.value.length);
}
function chatComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}
async function sendChatMessage() {
  if (!chatProfileId || chatSending) return;
  const composer = document.getElementById('chatComposer');
  const sendButton = document.getElementById('chatSendButton');
  const body = composer.value.trim();
  if (!body) return;
  if (body.length > 1000) return showToast('Message too long', 'Use 1000 characters or fewer.');
  const profileId = chatProfileId, generation = chatGeneration;
  chatSending = true;
  sendButton.disabled = true;
  composer.disabled = true;
  document.getElementById('chatError').classList.add('hidden');
  const optimistic = appendOptimisticMessage(body);
  try {
    await apiCall(`/me/conversations/${encodeURIComponent(profileId)}/messages`, 'POST', { body }, {admin: false});
    optimistic.remove();
    if (generation !== chatGeneration) return;
    chatFailedPayload = null;
    composer.value = '';
    chatComposerInput();
    await pollChatMessages();
  } catch (err) {
    optimistic.remove();
    if (generation !== chatGeneration) return;
    chatFailedPayload = body;
    document.getElementById('chatErrorText').textContent = err.message || 'Could not send message';
    document.getElementById('chatError').classList.remove('hidden');
  } finally {
    chatSending = false;
    sendButton.disabled = false;
    composer.disabled = false;
  }
}
function appendOptimisticMessage(body) {
  const log = document.getElementById('messageLog');
  const bubble = document.createElement('div');
  bubble.className = 'max-w-[82%] ml-auto rounded-2xl px-3 py-2 text-white bg-gradient-to-r from-tinder-pink to-tinder-orange';
  const text = document.createElement('p');
  text.className = 'text-sm whitespace-pre-wrap break-words';
  text.textContent = body;
  bubble.appendChild(text);
  log.appendChild(bubble);
  scrollChatToBottom(true);
  return bubble;
}
async function retryChatSend() {
  if (!chatFailedPayload) return;
  document.getElementById('chatComposer').value = chatFailedPayload;
  await sendChatMessage();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && chatOpen) closeChat();
});

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
}

// Render the visitor's server-backed matches safely and attach click/contact actions without inline data handlers.
function updateMatchesUI() {
  window.RizzumeExperience?.refresh();
  const count = matchedProfiles.length;
  document.getElementById('matchBadge').textContent = count;
  const list = document.getElementById('matchesList');
  list.innerHTML = '';
  if (count === 0) {
    list.innerHTML = `<div class="py-16 text-center text-zinc-400"><i data-lucide="heart-crack" class="w-10 h-10 mx-auto mb-2 opacity-50"></i><p class="text-xs font-bold text-zinc-600">No matches yet</p><p class="text-[11px] text-zinc-400 mt-0.5">Swipe right on a developer to match!</p></div>`;
  } else {
    matchedProfiles.forEach(item => {
      const row = document.createElement('div');
      row.className = "flex items-center gap-3 p-3 bg-zinc-50 hover:bg-pink-50/50 rounded-2xl border border-zinc-100 transition-colors cursor-pointer";
      row.onclick = () => {
        toggleMatchesDrawer(false);
        openProfileScreen(item);
      };
      row.innerHTML = `
        <img src="${escapeHtml(safeImageUrl(item.image))}" class="w-12 h-12 rounded-xl object-cover" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <h4 class="font-extrabold text-xs text-zinc-900 truncate">${escapeHtml(item.name)}</h4>
            ${item.isSuper ? `<span class="text-[9px] bg-sky-100 text-sky-600 px-1.5 py-0.2 rounded font-black">SUPER</span>` : ''}
          </div>
          <p class="text-[11px] text-zinc-500 truncate">${escapeHtml(item.role)}</p>
        </div>
        <button type="button" data-contact class="px-3 py-1.5 rounded-xl bg-tinder-pink text-white text-xs font-bold hover:bg-tinder-coral transition-colors flex items-center gap-1">
          <i data-lucide="mail" class="w-3.5 h-3.5"></i>
          <span>Ping</span>
        </button>
      `;
      row.querySelector('[data-contact]').addEventListener('click', event => {
        event.stopPropagation(); directContactProfile(item.details?.email || '');
      });
      list.appendChild(row);
    });
  }

  lucide.createIcons();
}

async function resetDeck() {
  if (isSwiping) return;
  try {
    await refreshProfilesAndMatches();
    renderDeck();
    showToast('Deck Reloaded', 'Latest profiles loaded');
  } catch (error) {
    backendAvailable = false;
    showBackendNotice(true);
    updateDynamicCounts();
    cardsState = [...PROFILES];
    renderDeck();
    showToast('Backend unavailable', 'Showing the read-only fallback roster');
  }
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

function directContactProfile(email) {
  window.location.href = safeHref(`mailto:${encodeURIComponent(email)}?subject=Matched%20on%20Rizzume!`);
}

function directContactCurrentProfile() {
  if (currentlyViewingProfile) {
    directContactProfile(currentlyViewingProfile.details.email);
  }
}

function copyTeamContact() {
  const email = teamEmail;
  const textarea = document.createElement('textarea');
  textarea.value = email;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);

  showToast("Copied to Clipboard!", email);
}

// Startup is strictly session -> profiles -> matches. The legacy array is only a read-only fallback.
window.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  updateDynamicCounts();
  showBackendNotice(false);
  // Render immediately while the session loads, keeping the discovery screen stable on refresh.
  let initialMode = 'swipe';
  try { if (sessionStorage.getItem('rizzumeMode') === 'directory') initialMode = 'directory'; } catch (_) {}
  startMode(initialMode);

  try {
    await apiCall('/session', 'POST', undefined, { admin: false });
    await refreshProfilesAndMatches();
    try {
      const team = await apiCall('/team', 'GET', undefined, { admin: false });
      if (team?.email) teamEmail = team.email;
    } catch (error) { console.error('Could not load team contact:', error); }
  } catch (error) {
    console.error('Backend initialization failed:', error);
    PROFILES = FALLBACK_PROFILES;
    cardsState = [...FALLBACK_PROFILES];
    matchedProfiles = [];
    backendAvailable = false;
    showBackendNotice(true);
    updateDynamicCounts();
    showToast('Backend unavailable', 'Showing a read-only fallback roster.');
    updateMatchesUI();
  }

  // Check if opened via QR link (e.g., ?profile=fontelar-dave)
  renderDirectory();
  renderDeck();
  window.RizzumeExperience?.ready();
  const urlParams = typeof URLSearchParams === 'undefined'
    ? { get: () => null }
    : new URLSearchParams((window.location && window.location.search) || '');
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

  // Restore the selected browsing mode
  let mode = null;
  try {
    mode = sessionStorage.getItem('rizzumeMode');
  } catch (e) {}

  if (mode === 'swipe' || mode === 'directory') {
    startMode(mode);
  } else {
    startMode('swipe');
  }
});
