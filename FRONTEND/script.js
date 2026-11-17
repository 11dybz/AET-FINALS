// Use the page's server, including its current port. A separate frontend server
// can set window.PITCHR_API_BASE before loading this script.
const API_BASE = (window.PITCHR_API_BASE || '/api').replace(/\/$/, '');

// Central API transport: JSON bodies are encoded automatically, while FormData is left untouched for multipart uploads.
async function apiCall(path, method = 'GET', data, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { ...(options.headers || {}) };
    if (adminKey && options.admin !== false) headers['X-Admin-Key'] = adminKey;
    const init = { method, credentials: 'include', signal: controller.signal, headers };
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
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Keep external links restricted to HTTP(S)/mailto and permit only the local static/API image paths used by this app.
function safeHref(value) {
  const candidate = String(value || '').trim();
  return /^(https?:\/\/|mailto:)/i.test(candidate) ? candidate : '#';
}
function safeImageUrl(value) {
  const candidate = String(value || '').trim();
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^\/api\/images\/\d+$/.test(candidate)) return candidate;
  if (/^\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(candidate)) return candidate;
  if (/^images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(candidate)) return candidate;
  return '';
}

// Escape every profile-derived value before placing it into an HTML template.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

// Pull the current roster and match snapshots from the API after the session cookie exists.
async function refreshProfilesAndMatches() {
  // Keep the startup contract ordered: roster first, then visitor-specific match snapshots.
  const profiles = await apiCall('/profiles', 'GET', undefined, { admin: false });
  PROFILES = profiles.map(profile => ({
    ...profile,
    // Preserve member-page shortcuts only for the original four manually maintained portfolios.
    page: FALLBACK_PROFILES.find(fallback => fallback.id === profile.id)?.page || null,
    images: Array.isArray(profile.images) ? profile.images : (profile.image ? [{ id: null, url: profile.image }] : [])
  }));
  cardsState = [...PROFILES];
  const matches = await apiCall('/me/matches', 'GET', undefined, { admin: false });
  matchedProfiles = matches;
  backendAvailable = true;
  showBackendNotice(false);
  updateDynamicCounts();
  updateMatchesUI();
  return PROFILES;
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

// ==================== QR CODE SCANNER & DEEP LINKING ====================
function resolveProfileIdFromQr(rawText) {
  const cleaned = (rawText || '').trim();
  if (!cleaned) return null;

  // Case 1: Full URL like https://site.com/?profile=fontelar-dave or /FONTELAR.html
  try {
    const url = new URL(cleaned, window.location.origin);
    const paramId = url.searchParams.get('profile');
    if (paramId && PROFILES.some(p => p.id === paramId)) return paramId;

    const matchedByPage = PROFILES.find(p => url.pathname.toLowerCase().endsWith(p.page.toLowerCase()));
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

  html5QrScanner = new Html5Qrcode('qrReader');
  try {
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
  try { sessionStorage.setItem('pitchrMode', mode); } catch (e) {}
  document.getElementById('homeScreen').classList.add('hidden');

  if (mode === 'swipe') {
    document.getElementById('swipeAppScreen').classList.remove('hidden');
    document.getElementById('directoryScreen').classList.add('hidden');
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
  try { sessionStorage.removeItem('pitchrMode'); } catch (e) {}
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('swipeAppScreen').classList.add('hidden');
  document.getElementById('directoryScreen').classList.add('hidden');
  document.getElementById('directoryScreen').classList.remove('flex');
  closeProfileScreen();
  lucide.createIcons();
}

// RENDER DIRECT DIRECTORY VIEW (NO-SWIPING OPTION)
// Render the directory from the active roster and attach actions without embedding profile data in HTML handlers.
function renderDirectory() {
  const grid = document.getElementById('directoryGrid');
  grid.innerHTML = '';
  PROFILES.forEach(profile => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-3xl p-5 border border-pink-100 shadow-soft flex flex-col justify-between hover:shadow-lg transition-all";
    const image = safeImageUrl(profile.image || profile.images?.[0]?.url);
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-3.5 mb-4">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(profile.name)}" loading="lazy" class="w-16 h-16 rounded-2xl object-cover border-2 border-pink-100" />
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
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(type) {
  if (!audioCtx) return;
  try {
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
  for (let i = cardsState.length - 1; i >= 0; i--) {
    const profile = cardsState[i];
    const isTopCard = i === 0;
    const card = document.createElement('div');
    const scale = 1 - (i * 0.04);
    const translateY = i * 10;
    const zIndex = 30 - i;
    const cover = safeImageUrl(profile.images?.[0]?.url || profile.image);
    const imageCount = Array.isArray(profile.images) ? profile.images.length : (profile.image ? 1 : 0);
    card.className = `swipe-card absolute inset-0 w-full h-full rounded-3xl bg-white border border-pink-100 shadow-soft overflow-hidden flex flex-col justify-between select-none ${isTopCard ? 'cursor-grab active:cursor-grabbing card-transition' : ''}`;
    card.style.transform = `translate3d(0px, ${translateY}px, 0px) scale(${scale})`;
    card.style.zIndex = zIndex;
    card.setAttribute('data-id', profile.id);
    card.innerHTML = `
      <div class="relative w-full h-[54%] overflow-hidden bg-zinc-900 pointer-events-none">
        ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(profile.name)}" loading="lazy" class="w-full h-full object-cover" />` : `<div class="w-full h-full bg-gradient-to-br from-pink-500 to-violet-700 flex items-center justify-center text-white text-5xl font-black">${escapeHtml((profile.name || '?').slice(0, 1).toUpperCase())}</div>`}
        ${imageCount > 1 ? `<span class="absolute top-4 right-4 rounded-full bg-black/65 text-white text-[10px] font-black px-2.5 py-1">▧ ${imageCount}</span>` : ''}
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"></div>
        <div class="stamp-like absolute top-6 left-6 border-4 border-emerald-400 text-emerald-400 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[-15deg] opacity-0 transition-opacity">HIRE / MATCH</div>
        <div class="stamp-nope absolute top-6 right-6 border-4 border-rose-500 text-rose-500 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[15deg] opacity-0 transition-opacity">PASS</div>
        <div class="stamp-super absolute bottom-14 left-1/2 -translate-x-1/2 border-4 border-sky-400 text-sky-400 font-black text-xl uppercase tracking-wider px-3 py-1 rounded-xl opacity-0 transition-opacity">SUPER LIKE ★</div>
        <div class="absolute top-4 left-4 flex items-center gap-2"><span class="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold">Open for Projects</span></div>
        <div class="absolute bottom-3 left-4 right-4 text-white">
          <span class="text-[10px] uppercase font-black tracking-widest text-tinder-orange bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full inline-block mb-1">${escapeHtml(profile.persona)}</span>
          <div class="flex items-center gap-2"><h2 class="text-xl font-black">${escapeHtml(profile.name)}</h2><span class="text-lg font-medium text-zinc-300">${escapeHtml(profile.age)}</span>${profile.verified ? '<i data-lucide="badge-check" class="w-5 h-5 text-sky-400 fill-sky-400"></i>' : ''}</div>
          <p class="text-xs text-zinc-300 font-medium mt-0.5">${escapeHtml(profile.location)}</p>
        </div>
      </div>
      <div class="p-4 flex-1 overflow-y-auto space-y-3 bg-white pointer-events-none">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-2"><span class="text-xs font-bold text-zinc-800">${escapeHtml(profile.role)}</span><span class="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">${escapeHtml(profile.matchPercentage)}</span></div>
        <p class="text-xs text-zinc-600 leading-relaxed font-normal">${escapeHtml(profile.bio)}</p>
        <div class="flex flex-wrap gap-1.5 pt-1">${(profile.tags || []).map(tag => `<span class="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">⚡ ${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="bg-rose-50/50 rounded-2xl p-2.5 border border-rose-100/60 space-y-1"><span class="text-[10px] uppercase font-black text-tinder-pink tracking-wider block">Why You Should Match:</span>${(profile.dealbreakers || []).map(item => `<p class="text-[11px] text-zinc-700 font-medium">${escapeHtml(item)}</p>`).join('')}</div>
        <div class="text-right text-[10px] font-bold text-tinder-pink pt-1">Click card to open full profile →</div>
      </div>`;
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

// Save the decision first. Only after the API confirms it do we animate away the card or show a match.
async function finalizeSwipe(direction) {
  if (!activeCardElem || cardsState.length === 0 || isSwiping) return;
  isSwiping = true;
  hasSwipedOrMoved = true;
  isDragging = false;
  const card = activeCardElem;
  const swipedProfile = cardsState[0];
  const action = direction === 'left' ? 'pass' : direction === 'right' ? 'like' : 'super_like';
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
  else existing.isSuper = Boolean(existing.isSuper || isSuper);
  updateMatchesUI();
  if (typeof confetti === 'function') confetti({
    particleCount: isSuper ? 120 : 70, spread: 80, origin: { y: 0.6 },
    colors: ['#FE3C72', '#FD5564', '#FFD700', '#00D2FF', '#FFFFFF']
  });
  const modal = document.getElementById('matchModal');
  const box = document.getElementById('matchModalBox');
  const subtitle = document.getElementById('matchModalSubtitle');
  const avatar = document.getElementById('matchModalAvatar');
  avatar.src = safeImageUrl(profile.images?.[0]?.url || profile.image);
  avatar.alt = profile.name || 'Matched profile';
  subtitle.textContent = isSuper
    ? `🔥 SUPER LIKE! Priority match unlocked with ${profile.name}!`
    : `You and ${profile.name} matched! Review projects or connect directly.`;
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
    item.className = 'p-3 bg-zinc-50 border border-zinc-100 rounded-xl';
    const title = document.createElement('h4');
    title.className = 'text-xs font-bold text-zinc-900';
    title.textContent = project.title || '';
    const description = document.createElement('p');
    description.className = 'text-[11px] text-zinc-500 mt-0.5 leading-relaxed';
    description.textContent = project.desc || '';
    item.append(title, description);
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
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${profile.name || 'Profile'} image ${index + 1}`;
      image.loading = 'lazy';
      image.className = 'gallery-image image-loading';
      // Keep the slide's shimmer visible until the lazy-loaded image either loads or errors.
      const clearImageSkeleton = () => image.classList.remove('image-loading');
      image.addEventListener('load', clearImageSkeleton, { once: true });
      image.addEventListener('error', clearImageSkeleton, { once: true });
      image.addEventListener('click', () => openLightbox(images, index));
      slide.appendChild(image);
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

// Resize the gallery according to the currently selected image.
function syncGalleryFrameHeight(index = currentGalleryIndex) {
  const track = document.getElementById('profileGalleryTrack');
  if (!track) return;

  const image = track.children[index]?.querySelector('img');

  // Wait until the browser has loaded the image dimensions.
  if (!image || !image.naturalWidth || !image.naturalHeight) return;

  const availableWidth = Math.max(track.clientWidth, 1);
  const maxHeight = Math.max(
    160,
    window.innerHeight * (window.innerWidth <= 640 ? 0.58 : 0.68)
  );

  const naturalHeight =
    availableWidth * (image.naturalHeight / image.naturalWidth);

  const displayHeight = Math.max(
    160,
    Math.min(maxHeight, naturalHeight)
  );

  track.style.height = `${displayHeight}px`;
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
}

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
  const count = matchedProfiles.length;
  document.getElementById('matchBadge').textContent = count;
  const list = document.getElementById('matchesList');
  list.innerHTML = '';
  if (count === 0) {
    list.innerHTML = `<div class="py-16 text-center text-zinc-400"><i data-lucide="heart-crack" class="w-10 h-10 mx-auto mb-2 opacity-50"></i><p class="text-xs font-bold text-zinc-600">No matches yet</p><p class="text-[11px] text-zinc-400 mt-0.5">Swipe right on a developer to match!</p></div>`;
  } else {
    matchedProfiles.forEach(item => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 p-3 bg-zinc-50 hover:bg-pink-50/50 rounded-2xl border border-zinc-100 transition-colors cursor-pointer';
      const image = safeImageUrl(item.images?.[0]?.url || item.image);
      row.innerHTML = `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" class="w-12 h-12 rounded-xl object-cover"><div class="flex-1 min-w-0"><div class="flex items-center gap-1.5"><h4 class="font-extrabold text-xs text-zinc-900 truncate">${escapeHtml(item.name)}</h4>${item.isSuper ? '<span class="text-[9px] bg-sky-100 text-sky-600 px-1.5 py-0.2 rounded font-black">SUPER</span>' : ''}</div><p class="text-[11px] text-zinc-500 truncate">${escapeHtml(item.role)}</p></div>`;
      row.addEventListener('click', () => { toggleMatchesDrawer(false); openProfileScreen(item); });
      const contact = document.createElement('button');
      contact.type = 'button'; contact.className = 'px-3 py-1.5 rounded-xl bg-tinder-pink text-white text-xs font-bold';
      contact.textContent = 'Ping';
      contact.addEventListener('click', event => {
        event.stopPropagation();
        const email = item.details?.email;
        if (email) directContactProfile(email);
      });
      row.appendChild(contact);
      list.appendChild(row);
    });
  }
  lucide.createIcons();
}

// Update roster labels whenever a successful API load changes the number of cards.
function updateDynamicCounts() {
  const count = PROFILES.length;
  ['teamCountHome', 'teamCountButton', 'teamCountFooter', 'directoryCount'].forEach(id => {
    const node = document.getElementById(id);
    if (node) node.textContent = count;
  });
  const emptyTitle = document.getElementById('emptyDeckTitle');
  if (emptyTitle) emptyTitle.textContent = `You've seen all ${count} members!`;
}

// Show a persistent read-only notice when the API is unavailable; hide all management entry points.
function showBackendNotice(show) {
  let notice = document.getElementById('backendNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'backendNotice';
    notice.className = 'backend-notice';
    notice.textContent = 'Backend unavailable — showing a read-only fallback roster. Profile editing is disabled.';
    document.body.prepend(notice);
  }
  notice.classList.toggle('hidden', !show);
  // The controls stay unavailable until the API has loaded successfully; this also covers the brief startup window.
  const readOnly = show || !backendAvailable;
  document.querySelectorAll('[data-requires-backend]').forEach(button => {
    button.disabled = readOnly;
    button.classList.toggle('hidden', readOnly);
  });
}

// Build the editor shell once. Its static markup contains no profile values; those are assigned as DOM properties.
function ensureEditorModal() {
  let modal = document.getElementById('profileEditorModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'profileEditorModal';
  modal.className = 'app-modal hidden';
  modal.innerHTML = `
    <div class="app-modal-panel editor-panel" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
      <div class="flex items-center justify-between gap-3 mb-4"><h2 id="editorTitle" class="text-lg font-black">Add profile</h2><button type="button" data-close class="editor-close" aria-label="Close editor">×</button></div>
      <form id="profileEditorForm" class="space-y-4">
        <div class="editor-grid">
          <label>Name *<input id="editName" required minlength="1" maxlength="100"></label>
          <label>Age *<input id="editAge" type="number" min="16" max="120" required></label>
          <label>Persona<input id="editPersona" maxlength="255"></label>
          <label>Role<input id="editRole" maxlength="255"></label>
          <label>Location<input id="editLocation" maxlength="255"></label>
          <label>Match percentage<input id="editMatchPercentage" maxlength="255" placeholder="New"></label>
        </div>
        <label class="block">Short bio<textarea id="editBio" maxlength="2000" rows="3"></textarea></label>
        <label class="block">Full bio<textarea id="editFullBio" maxlength="4000" rows="4"></textarea></label>
        <label class="inline-flex items-center gap-2 text-sm"><input id="editVerified" type="checkbox"> Verified profile</label>
        <div><div class="editor-section-heading"><span>Tags (max 15)</span><button type="button" data-add="tags">+ Add tag</button></div><div id="editTags" class="repeatable-list"></div></div>
        <div><div class="editor-section-heading"><span>Highlights / Why you should match (max 10)</span><button type="button" data-add="highlights">+ Add highlight</button></div><div id="editHighlights" class="repeatable-list"></div></div>
        <div><div class="editor-section-heading"><span>Projects (max 10)</span><button type="button" data-add="projects">+ Add project</button></div><div id="editProjects" class="repeatable-list"></div></div>
        <div class="editor-grid">
          <label>GitHub URL<input id="editGithub" type="url" placeholder="https://github.com/..."></label>
          <label>LinkedIn URL<input id="editLinkedin" type="url" placeholder="https://linkedin.com/..."></label>
          <label>Email<input id="editEmail" type="email" maxlength="255"></label>
        </div>
        <section class="image-manager">
          <div class="editor-section-heading"><span>Profile pictures (max 8)</span><span id="editorImageCount" class="text-xs text-zinc-400">0/8</span></div>
          <div id="editorImageGrid" class="editor-image-grid"></div>
          <div class="flex flex-wrap gap-2 mt-3"><label class="upload-picker">Add images<input id="editorImageFiles" type="file" accept="image/*" multiple></label><input id="editorImageUrl" type="url" placeholder="https://example.com/photo.jpg" class="editor-url-input"><button id="editorAddUrl" type="button" class="editor-secondary">Add URL</button></div>
          <p id="editorUploadStatus" class="text-xs text-zinc-500 mt-2" aria-live="polite"></p>
        </section>
        <p id="editorError" class="text-sm text-rose-600" role="alert"></p>
        <div class="flex justify-end gap-2 pt-3 border-t"><button type="button" data-close class="editor-secondary">Cancel</button><button id="editorSave" type="submit" class="editor-primary">Save profile</button></div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeProfileEditor));
  modal.querySelector('[data-add="tags"]').addEventListener('click', () => addRepeatableRow('tags'));
  modal.querySelector('[data-add="highlights"]').addEventListener('click', () => addRepeatableRow('highlights'));
  modal.querySelector('[data-add="projects"]').addEventListener('click', () => addRepeatableRow('projects'));
  modal.querySelector('#editorImageFiles').addEventListener('change', event => {
    const selected = Array.from(event.target.files || []);
    if (editorImages.length + selected.length > 8) {
      document.getElementById('editorError').textContent = 'A profile can have at most 8 images.';
      event.target.value = '';
      return;
    }
    selected.forEach(file => editorImages.push({ kind: 'file', file, label: file.name }));
    event.target.value = '';
    markEditorDirty();
    renderEditorImages();
  });
  modal.querySelector('#editorAddUrl').addEventListener('click', () => {
    const input = modal.querySelector('#editorImageUrl');
    const url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      document.getElementById('editorError').textContent = 'Image URLs must start with http:// or https://.';
      return;
    }
    if (editorImages.length >= 8) {
      document.getElementById('editorError').textContent = 'A profile can have at most 8 images.';
      return;
    }
    editorImages.push({ kind: 'url', url, label: url });
    input.value = '';
    markEditorDirty();
    renderEditorImages();
  });
  modal.querySelector('#profileEditorForm').addEventListener('input', markEditorDirty);
  modal.querySelector('#profileEditorForm').addEventListener('submit', saveProfileEditor);
  return modal;
}

// Create repeatable safe text inputs for skills/highlights and paired title/description project fields.
function addRepeatableRow(type, first = '', second = '') {
  const containerId = type === 'tags' ? 'editTags' : type === 'highlights' ? 'editHighlights' : 'editProjects';
  const container = document.getElementById(containerId);
  if (container.children.length >= (type === 'tags' ? 15 : 10)) return;
  const row = document.createElement('div');
  row.className = 'repeatable-row';
  if (type === 'projects') {
    const title = document.createElement('input'); title.maxLength = 255; title.placeholder = 'Project title'; title.value = first;
    const desc = document.createElement('textarea'); desc.maxLength = 2000; desc.placeholder = 'Project description'; desc.value = second; desc.rows = 2;
    row.append(title, desc);
  } else {
    const input = document.createElement('input'); input.maxLength = type === 'tags' ? 50 : 300;
    input.placeholder = type === 'tags' ? 'Skill or technology' : 'Why this person is a strong match';
    input.value = first;
    row.appendChild(input);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.className = 'editor-remove';
  remove.addEventListener('click', () => { row.remove(); markEditorDirty(); });
  row.appendChild(remove);
  row.querySelectorAll('input,textarea').forEach(field => field.addEventListener('input', markEditorDirty));
  container.appendChild(row);
}

// Populate the editor from an existing profile or an empty create model.
function openProfileEditor(profile = null) {
  if (!backendAvailable) return;
  const modal = ensureEditorModal();
  editorOriginalProfile = profile;
  editorDirty = false;
  editorImages = (profile?.images || []).map(image => ({ kind: 'existing', id: image.id, url: image.url, label: image.url }));
  ['editTags', 'editHighlights', 'editProjects'].forEach(id => document.getElementById(id).replaceChildren());
  const value = (id, content) => { document.getElementById(id).value = content ?? ''; };
  value('editName', profile?.name); value('editAge', profile?.age ?? 22);
  value('editPersona', profile?.persona); value('editRole', profile?.role); value('editLocation', profile?.location);
  value('editMatchPercentage', profile?.matchPercentage || 'New'); value('editBio', profile?.bio);
  value('editFullBio', profile?.details?.fullBio); value('editGithub', profile?.details?.github);
  value('editLinkedin', profile?.details?.linkedin); value('editEmail', profile?.details?.email);
  document.getElementById('editVerified').checked = Boolean(profile?.verified);
  (profile?.tags || []).forEach(tag => addRepeatableRow('tags', tag));
  (profile?.dealbreakers || []).forEach(item => addRepeatableRow('highlights', item));
  (profile?.details?.projects || []).forEach(project => addRepeatableRow('projects', project.title, project.desc));
  document.getElementById('editorTitle').textContent = profile ? `Edit ${profile.name}` : 'Add profile';
  document.getElementById('editorSave').textContent = profile ? 'Save changes' : 'Create profile';
  document.getElementById('editorError').textContent = '';
  document.getElementById('editorUploadStatus').textContent = '';
  renderEditorImages();
  modal.classList.remove('hidden');
  document.getElementById('editName').focus();
}

// Track every form/image interaction so closing cannot silently discard unsaved edits.
function markEditorDirty() { editorDirty = true; }
async function closeProfileEditor() {
  const modal = document.getElementById('profileEditorModal');
  if (!modal) return;
  if (editorDirty) {
    const discard = await styledConfirm('Discard unsaved changes?', 'Your profile edits and pending image changes will be lost.');
    if (!discard) return;
  }
  modal.classList.add('hidden');
  editorDirty = false;
}

// Render reorderable image previews with drag/drop and explicit up/down controls for touch devices.
function renderEditorImages() {
  const grid = document.getElementById('editorImageGrid');
  if (!grid) return;
  grid.replaceChildren();
  editorImages.forEach((item, index) => {
    const tile = document.createElement('div');
    tile.className = 'editor-image-tile'; tile.draggable = true; tile.dataset.index = index;
    const image = document.createElement('img');
    image.alt = `Profile image ${index + 1}`;
    image.loading = 'lazy';
    if (item.kind === 'file' && typeof URL !== 'undefined' && URL.createObjectURL) image.src = URL.createObjectURL(item.file);
    else image.src = safeImageUrl(item.url);
    tile.appendChild(image);
    if (index === 0) { const cover = document.createElement('span'); cover.className = 'cover-badge'; cover.textContent = 'Cover'; tile.appendChild(cover); }
    const controls = document.createElement('div'); controls.className = 'editor-image-controls';
    [['↑', -1, 'Move image up'], ['↓', 1, 'Move image down']].forEach(([label, direction, aria]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', aria);
      button.disabled = index + direction < 0 || index + direction >= editorImages.length;
      button.addEventListener('click', () => moveEditorImage(index, direction)); controls.appendChild(button);
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove image');
    remove.addEventListener('click', () => { editorImages.splice(index, 1); markEditorDirty(); renderEditorImages(); });
    controls.appendChild(remove); tile.appendChild(controls);
    tile.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(index)); });
    tile.addEventListener('dragover', event => event.preventDefault());
    tile.addEventListener('drop', event => { event.preventDefault(); moveEditorImage(Number(event.dataTransfer.getData('text/plain')), index, true); });
    grid.appendChild(tile);
  });
  document.getElementById('editorImageCount').textContent = `${editorImages.length}/8`;
}
function moveEditorImage(from, to, absolute = false) {
  const target = absolute ? to : from + to;
  if (target < 0 || target >= editorImages.length || from === target) return;
  const [item] = editorImages.splice(from, 1);
  editorImages.splice(target, 0, item);
  markEditorDirty(); renderEditorImages();
}

// Downscale a browser image to at most 1600 px and JPEG quality 0.85 when Canvas APIs are available.
async function downscaleImage(file) {
  if (!file || typeof createImageBitmap !== 'function' || typeof document.createElement !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (error) { return file; }
}

// Validate client-side limits and save JSON first, then upload gallery items and apply the requested order.
async function saveProfileEditor(event) {
  event.preventDefault();
  const form = document.getElementById('profileEditorForm');
  if (!form.reportValidity()) return;
  if (editorImages.length > 8) { document.getElementById('editorError').textContent = 'A profile can have at most 8 images.'; return; }
  const readRows = (id, paired = false) => Array.from(document.getElementById(id).children).map(row => {
    const fields = row.querySelectorAll('input,textarea');
    return paired ? { title: fields[0].value.trim(), desc: fields[1].value.trim() } : fields[0].value.trim();
  }).filter(row => paired ? row.title || row.desc : row);
  const payload = {
    name: document.getElementById('editName').value.trim(), age: Number(document.getElementById('editAge').value),
    persona: document.getElementById('editPersona').value.trim(), role: document.getElementById('editRole').value.trim(),
    location: document.getElementById('editLocation').value.trim(), matchPercentage: document.getElementById('editMatchPercentage').value.trim() || 'New',
    verified: document.getElementById('editVerified').checked, bio: document.getElementById('editBio').value,
    tags: readRows('editTags'), dealbreakers: readRows('editHighlights'),
    details: { fullBio: document.getElementById('editFullBio').value, projects: readRows('editProjects', true),
      github: document.getElementById('editGithub').value.trim(), linkedin: document.getElementById('editLinkedin').value.trim(),
      email: document.getElementById('editEmail').value.trim() }
  };
  const urlFields = [payload.details.github, payload.details.linkedin].filter(Boolean);
  if (urlFields.some(url => !/^https?:\/\//i.test(url))) {
    document.getElementById('editorError').textContent = 'GitHub and LinkedIn must use http:// or https:// URLs.'; return;
  }
  if (payload.details.projects.length > 10 || payload.tags.length > 15 || payload.dealbreakers.length > 10) {
    document.getElementById('editorError').textContent = 'The maximum number of tags, highlights, or projects was exceeded.'; return;
  }
  const saveButton = document.getElementById('editorSave');
  saveButton.disabled = true; saveButton.textContent = 'Saving…';
  document.getElementById('editorError').textContent = '';
  try {
    const saved = await runAdminAction(() => editorOriginalProfile
      ? apiCall(`/profiles/${encodeURIComponent(editorOriginalProfile.id)}`, 'PUT', payload)
      : apiCall('/profiles', 'POST', payload));
    const profileId = saved.id;
    const originalIds = new Set((editorOriginalProfile?.images || []).map(image => image.id));
    const retainedIds = new Set(editorImages.filter(item => item.kind === 'existing').map(item => item.id));
    for (const imageId of originalIds) if (!retainedIds.has(imageId)) {
      await runAdminAction(() => apiCall(`/profiles/${encodeURIComponent(profileId)}/images/${imageId}`, 'DELETE'));
    }
    const resolvedIds = new Map();
    const failedItems = [];
    let completedUploads = 0;
    for (const item of editorImages) {
      if (item.kind === 'existing') resolvedIds.set(item, item.id);
      else if (item.kind === 'file') {
        try {
          const file = await downscaleImage(item.file);
          const multipart = new FormData(); multipart.append('files', file, file.name || 'profile.jpg');
          // Sequential uploads provide a clear per-file progress count without racing gallery ordering.
          document.getElementById('editorUploadStatus').textContent = `Uploading ${file.name || 'image'} (${completedUploads + 1} pending upload item)…`;
          const result = await runAdminAction(() => apiCall(`/profiles/${encodeURIComponent(profileId)}/images`, 'POST', multipart));
          resolvedIds.set(item, result[0].id);
          completedUploads++;
          document.getElementById('editorUploadStatus').textContent = `Uploaded ${completedUploads} image item(s).`;
        } catch (error) { item.error = error.message; failedItems.push(item); }
      } else if (item.kind === 'url') {
        try {
          document.getElementById('editorUploadStatus').textContent = `Adding image URL (${completedUploads + 1} pending upload item)…`;
          const result = await runAdminAction(() => apiCall(`/profiles/${encodeURIComponent(profileId)}/images`, 'POST', { url: item.url }));
          resolvedIds.set(item, result[0].id);
          completedUploads++;
          document.getElementById('editorUploadStatus').textContent = `Uploaded ${completedUploads} image item(s).`;
        } catch (error) { item.error = error.message; failedItems.push(item); }
      }
    }
    const orderedIds = editorImages.filter(item => resolvedIds.has(item)).map(item => resolvedIds.get(item));
    if (orderedIds.length) await runAdminAction(() => apiCall(`/profiles/${encodeURIComponent(profileId)}/images/order`, 'PUT', { imageIds: orderedIds }));
    await refreshProfilesAndMatches();
    renderDeck(); renderDirectory();
    document.getElementById('profileEditorModal').classList.add('hidden');
    editorDirty = false;
    if (failedItems.length) {
      const updated = PROFILES.find(profile => profile.id === profileId);
      openProfileEditor(updated);
      editorImages.push(...failedItems);
      renderEditorImages();
      document.getElementById('editorUploadStatus').textContent = failedItems.map(item => `${item.label}: ${item.error || 'Upload failed'}`).join(' • ');
      showToast('Profile saved', `${failedItems.length} image upload(s) failed. Retry from the editor.`);
    } else showToast(editorOriginalProfile ? 'Profile updated' : 'Profile created', 'Changes saved to the backend.');
    if (currentlyViewingProfile?.id === profileId) {
      const updated = PROFILES.find(profile => profile.id === profileId);
      if (updated) openProfileScreen(updated);
    }
  } catch (error) {
    document.getElementById('editorError').textContent = error.message || 'Could not save this profile.';
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editorOriginalProfile ? 'Save changes' : 'Create profile';
  }
}

// Retry a protected write once after an optional admin-key modal; key is kept only in this page's memory.
async function runAdminAction(action) {
  try { return await action(); }
  catch (error) {
    if (error.status !== 403) throw error;
    const key = await requestAdminKey();
    if (!key) throw new Error('Admin key entry cancelled.');
    adminKey = key;
    return action();
  }
}
function requestAdminKey() {
  return new Promise(resolve => {
    let modal = document.getElementById('adminKeyModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'adminKeyModal'; modal.className = 'app-modal';
      modal.innerHTML = '<div class="app-modal-panel max-w-sm" role="dialog" aria-modal="true"><h3 class="font-black text-lg mb-2">Admin key required</h3><p class="text-xs text-zinc-500 mb-3">Enter the configured X-Admin-Key. It remains in memory only.</p><input id="adminKeyInput" type="password" autocomplete="off" class="editor-text-input" aria-label="Admin key"><p id="adminKeyError" class="text-xs text-rose-600 mt-2"></p><div class="flex justify-end gap-2 mt-4"><button type="button" data-cancel class="editor-secondary">Cancel</button><button type="button" data-submit class="editor-primary">Retry</button></div></div>';
      document.body.appendChild(modal);
    }
    const input = modal.querySelector('#adminKeyInput'); input.value = '';
    modal.classList.remove('hidden'); input.focus();
    const finish = value => { modal.classList.add('hidden'); modal.querySelector('[data-cancel]').onclick = null; modal.querySelector('[data-submit]').onclick = null; resolve(value); };
    modal.querySelector('[data-cancel]').onclick = () => finish(null);
    modal.querySelector('[data-submit]').onclick = () => finish(input.value.trim() || null);
    input.onkeydown = event => { if (event.key === 'Enter') finish(input.value.trim() || null); };
  });
}

// Styled confirmation modal replaces native confirm() for destructive actions and unsaved changes.
function styledConfirm(title, message) {
  return new Promise(resolve => {
    let modal = document.getElementById('confirmModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'confirmModal'; modal.className = 'app-modal';
      modal.innerHTML = '<div class="app-modal-panel max-w-sm" role="dialog" aria-modal="true"><h3 id="confirmTitle" class="font-black text-lg"></h3><p id="confirmMessage" class="text-sm text-zinc-500 mt-2"></p><div class="flex justify-end gap-2 mt-5"><button type="button" data-cancel class="editor-secondary">Cancel</button><button type="button" data-yes class="editor-danger">Continue</button></div></div>';
      document.body.appendChild(modal);
    }
    modal.querySelector('#confirmTitle').textContent = title;
    modal.querySelector('#confirmMessage').textContent = message;
    modal.classList.remove('hidden');
    const finish = answer => { modal.classList.add('hidden'); modal.querySelector('[data-cancel]').onclick = null; modal.querySelector('[data-yes]').onclick = null; resolve(answer); };
    modal.querySelector('[data-cancel]').onclick = () => finish(false);
    modal.querySelector('[data-yes]').onclick = () => finish(true);
  });
}

// Deletion is intentionally explicit and refreshes the deck, directory, and visitor-specific matches.
async function confirmDeleteProfile(profile) {
  if (!backendAvailable) return;
  if (!await styledConfirm(`Delete ${profile.name}?`, 'This permanently removes the profile, gallery, and related swipe/match records.')) return;
  try {
    await runAdminAction(() => apiCall(`/profiles/${encodeURIComponent(profile.id)}`, 'DELETE'));
    PROFILES = PROFILES.filter(item => item.id !== profile.id);
    cardsState = cardsState.filter(item => item.id !== profile.id);
    if (currentlyViewingProfile?.id === profile.id) closeProfileScreen();
    await refreshProfilesAndMatches();
    renderDeck(); renderDirectory();
    showToast('Profile deleted', `${profile.name} was removed.`);
  } catch (error) { showToast('Delete failed', error.message); }
}

async function resetDeck() {
  if (isSwiping) return;
  try {
    await refreshProfilesAndMatches();
    renderDeck();
    showToast('Deck Reloaded', 'Latest profiles loaded');
  } catch (error) {
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
  window.location.href = safeHref(`mailto:${encodeURIComponent(email)}?subject=Matched%20on%20Team%20Portfolio!`);
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

  // Resolve deep links only after the active roster has been loaded from the API or fallback.
  const urlParams = new URLSearchParams(window.location.search);
  const qrProfileId = urlParams.get('profile');
  if (qrProfileId && PROFILES.some(profile => profile.id === qrProfileId)) openProfileScreenById(qrProfileId);

  // Re-hydrate the last visible application mode after startup data is available.
  let mode = null;
  try { mode = sessionStorage.getItem('pitchrMode'); } catch (error) {}
  if (mode === 'swipe' || mode === 'directory') startMode(mode);
  else {
    renderDeck();
    renderDirectory();
  }
});

// Keyboard controls support gallery navigation, lightbox dismissal, and a basic lightbox focus trap.
document.addEventListener('keydown', event => {
  const lightbox = document.getElementById('profileLightbox');
  if (lightbox && !lightbox.classList.contains('hidden')) {
    if (event.key === 'Escape') { closeLightbox(); event.preventDefault(); }
    else if (event.key === 'ArrowLeft') { moveLightbox(-1); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { moveLightbox(1); event.preventDefault(); }
    else if (event.key === 'Tab') {
      const controls = Array.from(lightbox.querySelectorAll('button:not([hidden])'));
      if (controls.length && event.shiftKey && document.activeElement === controls[0]) {
        controls[controls.length - 1].focus(); event.preventDefault();
      } else if (controls.length && !event.shiftKey && document.activeElement === controls[controls.length - 1]) {
        controls[0].focus(); event.preventDefault();
      }
    }
    return;
  }
  if (event.key === 'Escape') closeProfileScreen();
  if (event.key === 'ArrowLeft' && document.getElementById('fullProfileScreen')?.classList.contains('flex')) moveGallery(-1);
  if (event.key === 'ArrowRight' && document.getElementById('fullProfileScreen')?.classList.contains('flex')) moveGallery(1);
});
