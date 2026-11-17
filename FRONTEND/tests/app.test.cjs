const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

// Minimal browser-like objects let startup, state transitions, and pure editor helpers run without a real DOM.
function app(options = {}) {
  const listeners = {};
  const windowListeners = [];
  const requests = [];
  const timers = new Map();
  const elements = new Map();
  let timerId = 0;
  function element() {
    const children = [];
    return {
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      style: {}, innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
      children, dataset: {},
      appendChild(child) { children.push(child); }, append(...items) { children.push(...items); },
      replaceChildren(...items) { children.splice(0, children.length, ...items); },
      setAttribute() {}, addEventListener() {}, removeEventListener() {}, focus() {}, select() {},
      querySelector() { return element(); }, querySelectorAll() { return []; },
      getAttribute() { return null; }, scrollTo() {}, reportValidity() { return true; }
    };
  }
  const body = element();
  body.prepend = child => body.appendChild(child);
  const document = {
    body,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const context = vm.createContext({
    window: { PITCHR_API_BASE: options.base, AudioContext: function () {}, location: { origin: 'http://localhost', href: 'http://localhost/', search: '' },
      addEventListener(name, callback) { listeners[name] = callback; windowListeners.push(name); }, scrollTo() {} },
    document,
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    lucide: { createIcons() {} },
    console: { log() {}, error() {} },
    AbortController,
    URL,
    URLSearchParams,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, init) {
      requests.push({ url, ...init });
      if (options.failure) throw new Error('Network unavailable');
      const status = options.status === undefined ? 200 : options.status;
      let payload = {};
      if (url.endsWith('/profiles')) payload = options.profiles || [];
      else if (url.endsWith('/me/matches')) payload = options.matches || [];
      else if (url.endsWith('/team')) payload = { email: 'team@example.com' };
      else if (url.endsWith('/session')) payload = { expiresAt: 'later' };
      else if (options.errorMessage) payload = { message: options.errorMessage };
      return { ok: status >= 200 && status < 300, status, json: async () => payload };
    }
  });
  vm.runInContext(source, context);
  return { context, listeners, windowListeners, requests, timers, elements, document };
}

const sampleProfile = {
  id: 'ada-lovelace', name: 'Ada Lovelace', age: 28, persona: 'Engineer', location: 'London', role: 'Developer',
  image: '/images/ada.jpg', images: [{ id: 1, url: '/images/ada.jpg' }], verified: true,
  matchPercentage: 'New', bio: 'Builds systems', tags: ['Java'], dealbreakers: ['Writes tests'],
  details: { fullBio: 'A profile', projects: [], github: 'https://github.com/ada', linkedin: '', email: 'ada@example.com' }
};

test('startup orders session, profile loading, matches loading, and dynamic team contact', async () => {
  const state = app({ profiles: [sampleProfile], matches: [] });
  await state.listeners.DOMContentLoaded();
  assert.deepEqual(state.requests.slice(0, 4).map(request => [request.url, request.method]), [
    ['/api/session', 'POST'], ['/api/profiles', 'GET'], ['/api/me/matches', 'GET'], ['/api/team', 'GET']
  ]);
  assert.equal(vm.runInContext('PROFILES[0].id', state.context), 'ada-lovelace');
  assert.equal(vm.runInContext('teamEmail', state.context), 'team@example.com');
});

test('a separately hosted frontend can configure the API port', async () => {
  const state = app({ base: 'http://localhost:8081/api/' });
  await vm.runInContext("apiCall('/session', 'POST', undefined, { admin: false })", state.context);
  assert.equal(state.requests[0].url, 'http://localhost:8081/api/session');
  assert.equal(state.timers.size, 0);
});

test('an HTTP error rejects with its status for 403 prompts and 404 swipe handling', async () => {
  const state = app({ status: 404, errorMessage: 'Profile not found' });
  await assert.rejects(vm.runInContext("apiCall('/profiles/missing')", state.context), error => error.status === 404);
  assert.equal(state.timers.size, 0);
});

test('startup displays a read-only fallback notice when the backend is unavailable', async () => {
  const state = app({ failure: true });
  await state.listeners.DOMContentLoaded();
  assert.match(state.elements.get('toastMessage').textContent, /Backend unavailable/);
  assert.equal(vm.runInContext('backendAvailable', state.context), false);
  assert.equal(vm.runInContext('PROFILES.length', state.context), 4);
});

test('escapeHtml neutralizes profile-controlled HTML characters', () => {
  const state = app();
  const escaped = vm.runInContext(`escapeHtml("<img src=x onerror='alert(1)'>&")`, state.context);
  assert.equal(escaped, '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('safe links and image sources reject executable and data schemes', () => {
  const state = app();
  assert.equal(vm.runInContext("safeHref('javascript:alert(1)')", state.context), '#');
  assert.equal(vm.runInContext("safeHref('https://example.com')", state.context), 'https://example.com');
  assert.equal(vm.runInContext("safeHref('mailto:test@example.com')", state.context), 'mailto:test@example.com');
  assert.equal(vm.runInContext("safeImageUrl('data:image/svg+xml,<svg/>')", state.context), '');
  assert.equal(vm.runInContext("safeImageUrl('/api/images/42')", state.context), '/api/images/42');
});

test('swipe directions map to pass, like, and super_like through the API before deck removal', async () => {
  for (const [direction, action] of [['left', 'pass'], ['right', 'like'], ['up', 'super_like']]) {
    const state = app();
    await vm.runInContext(`
      PROFILES = [${JSON.stringify(sampleProfile)}];
      cardsState = [...PROFILES];
      activeCardElem = { classList: { add() {} }, style: {} };
      playBeep = () => {}; handleMatchSuccess = () => {}; showToast = () => {};
      renderDeck = () => {};
    `, state.context);
    await vm.runInContext(`finalizeSwipe('${direction}')`, state.context);
    const swipe = state.requests.find(request => request.url.endsWith('/me/swipes/ada-lovelace'));
    assert.ok(swipe, `expected swipe request for ${direction}`);
    assert.equal(swipe.method, 'PUT');
    assert.deepEqual(JSON.parse(swipe.body), { action });
    assert.equal(vm.runInContext('cardsState.length', state.context), 1, 'card remains until the exit animation finishes');
  }
});

test('window drag listeners are registered once across repeated deck renders', () => {
  const state = app();
  vm.runInContext('attachTopCardListeners(); attachTopCardListeners();', state.context);
  assert.equal(state.windowListeners.filter(name => name === 'mousemove').length, 1);
  assert.equal(state.windowListeners.filter(name => name === 'mouseup').length, 1);
  assert.equal(state.windowListeners.filter(name => name === 'touchmove').length, 1);
  assert.equal(state.windowListeners.filter(name => name === 'touchend').length, 1);
});

test('headless image-manager reordering preserves the selected image order', () => {
  const state = app();
  vm.runInContext(`
    editorImages = [{id: 1}, {id: 2}, {id: 3}];
    renderEditorImages = () => {};
    moveEditorImage(2, -2);
  `, state.context);
  assert.deepEqual(Array.from(vm.runInContext('editorImages.map(image => image.id)', state.context)), [3, 1, 2]);
});

test('gallery navigation clamps indexes and updates the image counter', () => {
  const state = app();
  let scrollLeft = 0;
  const track = { clientWidth: 320, scrollTo(options) { scrollLeft = options.left; } };
  const gallery = { dataset: { images: JSON.stringify(['/api/images/1', '/api/images/2', '/api/images/3']) } };
  const counter = { textContent: '' };
  state.document.getElementById = id => ({
    profileGalleryTrack: track,
    detailGallery: gallery,
    profileGalleryCounter: counter
  })[id] || null;
  vm.runInContext('setGalleryIndex(99)', state.context);
  assert.equal(scrollLeft, 640, 'the selected index is clamped to the final slide');
  assert.equal(counter.textContent, '3/3');
  vm.runInContext('setGalleryIndex(-5)', state.context);
  assert.equal(scrollLeft, 0, 'negative navigation is clamped to the first slide');
  assert.equal(counter.textContent, '1/3');
});

test('rapid swipe input cannot start a second swipe while a request is pending', async () => {
  const state = app();
  vm.runInContext(`
    PROFILES = [${JSON.stringify(sampleProfile)}]; cardsState = [...PROFILES];
    playBeep = () => {}; showToast = () => {}; handleMatchSuccess = () => {};
    activeCardElem = { classList: { add() {} }, style: {} };
    renderDeck = () => { activeCardElem = null; };
  `, state.context);
  await vm.runInContext("finalizeSwipe('left')", state.context);
  await vm.runInContext("finalizeSwipe('left')", state.context);
  assert.equal(state.requests.filter(request => request.url.includes('/me/swipes/')).length, 1);
});
