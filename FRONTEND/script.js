// 4 SPECIFIED TEAM MEMBERS DATA MODEL
const PROFILES = [
  {
    id: "chee-reynaldo",
    persona: "The Architectural Craftsman",
    name: "CHEE, Reynaldo Joseph",
    age: 22,
    location: "Manila, Philippines",
    role: "Full Stack Developer",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
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
    persona: "The Data & Backend Guardian",
    name: "DAPOG, John Greg",
    age: 22,
    location: "Manila, Philippines",
    role: "Backend Engineer",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80",
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
    persona: "The Full-Stack & ML Specialist",
    name: "FONTELAR, Dave",
    age: 22,
    location: "Manila, Philippines",
    role: "Full-Stack & Systems Developer",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80",
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
    persona: "The Interaction & UX Sculptor",
    name: "VILLANUEVA, Justin",
    age: 22,
    location: "Manila, Philippines",
    role: "Frontend & UI/UX Developer",
    image: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80",
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
let cardsState = [...PROFILES];
let matchedProfiles = [];
let isDragging = false;
let hasSwipedOrMoved = false; // Prevents swipe gesture from triggering click
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let activeCardElem = null;
let currentlyViewingProfile = null;

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

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  renderDeck();
});

// RENDER PROFILE STACK
function renderDeck() {
  const container = document.getElementById('cardsWrapper');
  const emptyDeck = document.getElementById('emptyDeck');
  container.innerHTML = '';

  if (cardsState.length === 0) {
    emptyDeck.classList.remove('hidden');
    return;
  }
  emptyDeck.classList.add('hidden');

  for (let i = cardsState.length - 1; i >= 0; i--) {
    const profile = cardsState[i];
    const isTopCard = (i === 0);
    const card = document.createElement('div');
    
    const scale = 1 - (i * 0.04);
    const translateY = i * 10;
    const zIndex = 30 - i;

    card.className = `swipe-card absolute inset-0 w-full h-full rounded-3xl bg-white border border-pink-100 shadow-soft overflow-hidden flex flex-col justify-between select-none ${isTopCard ? 'cursor-grab active:cursor-grabbing card-transition' : ''}`;
    card.style.transform = `translate3d(0px, ${translateY}px, 0px) scale(${scale})`;
    card.style.zIndex = zIndex;
    card.setAttribute('data-id', profile.id);

    card.innerHTML = `
      <!-- HERO IMAGE -->
      <div class="relative w-full h-[54%] overflow-hidden bg-zinc-900 pointer-events-none">
        <img src="${profile.image}" alt="${profile.name}" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"></div>

        <!-- STAMPS -->
        <div class="stamp-like absolute top-6 left-6 border-4 border-emerald-400 text-emerald-400 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[-15deg] opacity-0 transition-opacity">
          HIRE / MATCH
        </div>
        <div class="stamp-nope absolute top-6 right-6 border-4 border-rose-500 text-rose-500 font-black text-2xl uppercase tracking-widest px-3 py-1 rounded-xl rotate-[15deg] opacity-0 transition-opacity">
          PASS
        </div>
        <div class="stamp-super absolute bottom-14 left-1/2 -translate-x-1/2 border-4 border-sky-400 text-sky-400 font-black text-xl uppercase tracking-wider px-3 py-1 rounded-xl opacity-0 transition-opacity">
          SUPER LIKE ★
        </div>

        <!-- Top Pill -->
        <div class="absolute top-4 left-4 flex items-center gap-2">
          <span class="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Open for Projects
          </span>
        </div>

        <!-- Identity Details -->
        <div class="absolute bottom-3 left-4 right-4 text-white">
          <span class="text-[10px] uppercase font-black tracking-widest text-tinder-orange bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full inline-block mb-1">
            ${profile.persona}
          </span>
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-black">${profile.name}</h2>
            <span class="text-lg font-medium text-zinc-300">${profile.age}</span>
            ${profile.verified ? `<i data-lucide="badge-check" class="w-5 h-5 text-sky-400 fill-sky-400"></i>` : ''}
          </div>
          <p class="text-xs text-zinc-300 font-medium flex items-center gap-1 mt-0.5">
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-tinder-pink"></i> ${profile.location}
          </p>
        </div>
      </div>

      <!-- CARD BODY -->
      <div class="p-4 flex-1 overflow-y-auto space-y-3 bg-white pointer-events-none">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-2">
          <span class="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
            <i data-lucide="briefcase" class="w-3.5 h-3.5 text-tinder-pink"></i> ${profile.role}
          </span>
          <span class="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            ${profile.matchPercentage}
          </span>
        </div>

        <p class="text-xs text-zinc-600 leading-relaxed font-normal">
          ${profile.bio}
        </p>

        <div class="flex flex-wrap gap-1.5 pt-1">
          ${profile.tags.map(t => `<span class="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">⚡ ${t}</span>`).join('')}
        </div>

        <div class="bg-rose-50/50 rounded-2xl p-2.5 border border-rose-100/60 space-y-1">
          <span class="text-[10px] uppercase font-black text-tinder-pink tracking-wider block">Why You Should Match:</span>
          ${profile.dealbreakers.map(d => `<p class="text-[11px] text-zinc-700 font-medium">${d}</p>`).join('')}
        </div>

        <div class="text-right text-[10px] font-bold text-tinder-pink pt-1">
          Click card (without dragging) to view full portfolio &rarr;
        </div>
      </div>
    `;

    container.appendChild(card);
  }

  lucide.createIcons();
  attachTopCardListeners();
}

// DRAG & SWIPE EVENT LISTENERS
function attachTopCardListeners() {
  const topCard = document.querySelector('.swipe-card:last-child');
  if (!topCard) return;

  activeCardElem = topCard;

  topCard.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);

  topCard.addEventListener('touchstart', onDragStart, { passive: true });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);

  // Pure click handler: ONLY triggers if user did not move or swipe
  topCard.addEventListener('click', (e) => {
    if (hasSwipedOrMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    openProfileScreen(cardsState[0]);
  });
}

function onDragStart(e) {
  if (!activeCardElem) return;
  isDragging = true;
  hasSwipedOrMoved = false; // Reset gesture flag
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

  // Flag movement if moved beyond a 6px threshold
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
    // Snap back
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

function finalizeSwipe(direction) {
  if (!activeCardElem) return;

  const card = activeCardElem;
  const swipedProfile = cardsState[0];
  card.classList.add('card-transition');

  if (direction === 'right') {
    playBeep('like');
    card.style.transform = 'translate3d(600px, 50px, 0px) rotate(25deg)';
    card.style.opacity = '0';
    handleMatchSuccess(swipedProfile, false);
  } else if (direction === 'left') {
    playBeep('pass');
    card.style.transform = 'translate3d(-600px, 50px, 0px) rotate(-25deg)';
    card.style.opacity = '0';
    showToast("Passed", "Swiped left");
  } else if (direction === 'up') {
    playBeep('super');
    card.style.transform = 'translate3d(0px, -700px, 0px) rotate(0deg)';
    card.style.opacity = '0';
    handleMatchSuccess(swipedProfile, true);
  }

  setTimeout(() => {
    cardsState.shift();
    renderDeck();
  }, 300);
}

function handleMatchSuccess(profile, isSuper) {
  currentlyViewingProfile = profile;
  if (!matchedProfiles.some(p => p.id === profile.id)) {
    matchedProfiles.push({ ...profile, isSuper });
    updateMatchesUI();
  }

  confetti({
    particleCount: isSuper ? 120 : 70,
    spread: 80,
    origin: { y: 0.6 },
    colors: ['#FE3C72', '#FD5564', '#FFD700', '#00D2FF', '#FFFFFF']
  });

  const modal = document.getElementById('matchModal');
  const box = document.getElementById('matchModalBox');
  const subtitle = document.getElementById('matchModalSubtitle');
  const avatar = document.getElementById('matchModalAvatar');

  avatar.src = profile.image;
  subtitle.innerHTML = isSuper 
    ? `🔥 <strong>SUPER LIKE!</strong> You matched directly with <strong>${profile.name}</strong>!`
    : `You and <strong>${profile.name}</strong> matched! Review projects or connect directly.`;

  modal.classList.remove('opacity-0', 'pointer-events-none');
  box.classList.remove('scale-90');
  box.classList.add('scale-100');

  showToast(isSuper ? "★ SUPER LIKED!" : "♥ MATCHED!", `Added to matches list.`);
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
function openProfileScreen(profile) {
  currentlyViewingProfile = profile;
  document.getElementById('detailHeroImage').src = profile.image;
  document.getElementById('detailHeroName').textContent = profile.name;
  document.getElementById('detailHeroRole').textContent = profile.role;
  document.getElementById('detailPersonaBadge').textContent = profile.persona;
  document.getElementById('detailFullBio').textContent = profile.details.fullBio;
  document.getElementById('detailGithubLink').href = profile.details.github;
  document.getElementById('detailLinkedinLink').href = profile.details.linkedin;

  const projectContainer = document.getElementById('detailProjectItems');
  projectContainer.innerHTML = '';
  profile.details.projects.forEach(proj => {
    const item = document.createElement('div');
    item.className = "p-3 bg-zinc-50 border border-zinc-100 rounded-xl";
    item.innerHTML = `
      <h4 class="text-xs font-bold text-zinc-900">${proj.title}</h4>
      <p class="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">${proj.desc}</p>
    `;
    projectContainer.appendChild(item);
  });

  const skillsContainer = document.getElementById('detailSkillsContainer');
  skillsContainer.innerHTML = '';
  profile.tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = "px-2.5 py-1 rounded-full bg-pink-50 text-tinder-pink text-[10px] font-bold";
    pill.textContent = tag;
    skillsContainer.appendChild(pill);
  });

  const screen = document.getElementById('fullProfileScreen');
  screen.classList.remove('hidden');
  screen.classList.add('flex');
  window.scrollTo(0, 0);
  lucide.createIcons();
}

function closeProfileScreen() {
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

function updateMatchesUI() {
  const count = matchedProfiles.length;
  document.getElementById('matchBadge').textContent = count;
  
  const list = document.getElementById('matchesList');
  list.innerHTML = '';

  if (count === 0) {
    list.innerHTML = `
      <div class="py-16 text-center text-zinc-400">
        <i data-lucide="heart-crack" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
        <p class="text-xs font-bold text-zinc-600">No matches yet</p>
        <p class="text-[11px] text-zinc-400 mt-0.5">Swipe right on a developer to match!</p>
      </div>
    `;
  } else {
    matchedProfiles.forEach(item => {
      const row = document.createElement('div');
      row.className = "flex items-center gap-3 p-3 bg-zinc-50 hover:bg-pink-50/50 rounded-2xl border border-zinc-100 transition-colors cursor-pointer";
      row.onclick = () => {
        toggleMatchesDrawer(false);
        openProfileScreen(item);
      };
      row.innerHTML = `
        <img src="${item.image}" class="w-12 h-12 rounded-xl object-cover" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <h4 class="font-extrabold text-xs text-zinc-900 truncate">${item.name}</h4>
            ${item.isSuper ? `<span class="text-[9px] bg-sky-100 text-sky-600 px-1.5 py-0.2 rounded font-black">SUPER</span>` : ''}
          </div>
          <p class="text-[11px] text-zinc-500 truncate">${item.role}</p>
        </div>
        <button onclick="event.stopPropagation(); directContactProfile('${item.details.email}')" class="px-3 py-1.5 rounded-xl bg-tinder-pink text-white text-xs font-bold hover:bg-tinder-coral transition-colors flex items-center gap-1">
          <i data-lucide="mail" class="w-3.5 h-3.5"></i>
          <span>Ping</span>
        </button>
      `;
      list.appendChild(row);
    });
  }

  lucide.createIcons();
}

function resetDeck() {
  cardsState = [...PROFILES];
  renderDeck();
  showToast("Deck Reloaded", "Start swiping fresh!");
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
  window.location.href = `mailto:${email}?subject=Matched on Team Portfolio!`;
}

function directContactCurrentProfile() {
  if (currentlyViewingProfile) {
    directContactProfile(currentlyViewingProfile.details.email);
  }
}

function copyTeamContact() {
  const email = "team.leads@example.com";
  const textarea = document.createElement('textarea');
  textarea.value = email;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);

  showToast("Copied to Clipboard!", email);
}