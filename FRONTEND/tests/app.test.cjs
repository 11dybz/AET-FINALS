const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'editor.js'), 'utf8');

// Minimal browser-like objects let startup, state transitions, and pure editor helpers run without a real DOM.
function app(options = {}) {
  const listeners = {};
  const windowListeners = [];
  const requests = [];
  const timers = new Map();
  const elements = new Map();
  let timerId = 0;
  function element() {
    return { classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, innerHTML: '', children: [],
      textContent: '', appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; }, remove() {}, focus() {},
      querySelector: () => element(), querySelectorAll: () => [],
      setAttribute() {}, addEventListener() {} };
  }
  const context = vm.createContext({
    window: { RIZZUME_API_BASE: options.base, PITCHR_API_BASE: options.legacyBase, location: {href: 'http://localhost/', origin: 'http://localhost'}, scrollTo() {}, AudioContext: function () {},
      addEventListener(name, callback) { listeners[name] = callback; } },
    document: {
      addEventListener() {},
      hidden: false,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    sessionStorage: { getItem: () => null },
    lucide: { createIcons() {} },
    console: { log() {}, error() {} },
    AbortController,
    FormData,
    URL,
    URLSearchParams,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    URLSearchParams,
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
      if (options.fetch) return options.fetch(url, init);
      return { ok: status >= 200 && status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
  });
  vm.runInContext(source, context);
  vm.runInContext(editorSource, context);
  return { context, listeners, windowListeners, requests, timers, elements, document: context.document };
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
  assert.equal(state.requests.filter(request => request.url.endsWith('/session')).length, 1);
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

test('rapid swipe input and rewind cannot remove more than one card during an animation', () => {
  const state = app();
  vm.runInContext(`
    editorImages = [{id:3},{id:1},{id:2}];
    playBeep = () => {};
    showToast = () => {};
    renderDeck = () => { activeCardElem = null; };
    activeCardElem = { classList: { add() {} }, style: {} };
    finalizeSwipe('left');
    finalizeSwipe('left');
    resetDeck();
  `, state.context);
  assert.deepEqual(Array.from(vm.runInContext('editorImages.map(image => image.id)', state.context)), [3, 1, 2]);
});

test('gallery navigation clamps indexes and updates the image counter', () => {
  const state = app();
  let scrollLeft = 0;
  const track = {
    clientWidth: 320,
    children: [{ style: {} }, { style: {} }, { style: {} }],
    scrollTo(options) { scrollLeft = options.left; }
  };
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
    backendAvailable = true;
    playBeep = () => {}; showToast = () => {}; handleMatchSuccess = () => {};
    activeCardElem = { classList: { add() {} }, style: {} };
    renderDeck = () => { activeCardElem = null; };
  `, state.context);
  await vm.runInContext("finalizeSwipe('left')", state.context);
  await vm.runInContext("finalizeSwipe('left')", state.context);
  assert.equal(state.requests.filter(request => request.url.includes('/me/swipes/')).length, 1);
});

test('swipe persistence rejects failure and keeps the card retryable', async () => {
  const state = app({ status: 500 });
  await vm.runInContext(`
    playBeep = () => {};
    activeCardElem = { classList: { add() {} }, style: {} };
    isSwiping = false;
    backendAvailable = true;
    cardsState = [{ id: 'chee-reynaldo' }];
    finalizeSwipe('right');
  `, state.context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('isSwiping', state.context), false);
  assert.equal(state.requests.some(request => request.url === '/api/me/swipes/chee-reynaldo' && request.method === 'PUT'), true);
});

test('message send failure exposes retry state without losing the draft', async () => {
  const state = app({ failure: true });
  await vm.runInContext(`
    chatProfileId = 'chee-reynaldo';
    document.getElementById('chatComposer').value = 'Hello team';
    sendChatMessage();
  `, state.context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('chatFailedPayload', state.context), 'Hello team');
});

test('image helpers reject executable URLs and resolve images against a separate API server', () => {
  const state = app({ base: 'https://api.example.com/api/' });
  assert.equal(vm.runInContext("safeImageUrl('/api/images/4')", state.context), 'https://api.example.com/api/images/4');
  assert.equal(vm.runInContext("safeImageUrl('/images/chee.jpg')", state.context), 'https://api.example.com/images/chee.jpg');
  assert.equal(vm.runInContext("safeImageUrl('javascript:alert(1)')", state.context), '');
  assert.equal(vm.runInContext("safeHref('javascript:alert(1)')", state.context), '#');
  assert.equal(vm.runInContext("escapeHtml('<b>\"&')", state.context), '&lt;b&gt;&quot;&amp;');
});

test('the previous API configuration remains compatible', async () => {
  const state = app({ legacyBase: 'https://legacy.example.com/api' });
  await vm.runInContext("apiCall('/team')", state.context);
  assert.equal(state.requests[0].url, 'https://legacy.example.com/api/team');
});

test('successful empty 200 responses do not become JSON parsing errors', async () => {
  const state = app({ fetch: async () => ({ok: true, status: 200, text: async () => ''}) });
  assert.equal(await vm.runInContext("apiCall('/me/conversations/ada/read', 'POST')", state.context), null);
});

test('offline mode never writes swipes', async () => {
  const state = app();
  await vm.runInContext("finalizeSwipe('right')", state.context);
  assert.equal(state.requests.length, 0);
});

test('all homepage HTML event handlers have implementations', () => {
  const state = app();
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/on(?:click|input|keydown)="([a-zA-Z]\w*)\(/g)) {
    assert.equal(vm.runInContext(`typeof ${match[1]}`, state.context), 'function', match[1]);
  }
});

test('profile overlay renders project data without undefined names or executable HTML', () => {
  const state = app();
  const profile = {...sampleProfile, details: {...sampleProfile.details, projects: [{title: '<script>alert(1)</script>', desc: 'Works & tests'}]}};
  vm.runInContext('renderProfileGallery = () => {}; ensureProfileActions = () => ({replaceChildren() {}});', state.context);
  vm.runInContext(`openProfileScreen(${JSON.stringify(profile)})`, state.context);
  const html = state.elements.get('detailProjectItems').children[0].innerHTML;
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Works &amp; tests/);
});

test('backend profiles retain the individual portfolio page for QR scans', async () => {
  const state = app({ profiles: [{...sampleProfile, id: 'chee-reynaldo'}] });
  await state.listeners.DOMContentLoaded();
  assert.equal(vm.runInContext("resolveProfileIdFromQr('http://localhost/CHEE.html')", state.context), 'chee-reynaldo');
  assert.equal(state.elements.get('teamCountHome').textContent, '1');
});

test('passing a previously liked profile removes it from the local match drawer', async () => {
  const state = app();
  vm.runInContext(`backendAvailable = true; cardsState = [${JSON.stringify(sampleProfile)}]; matchedProfiles = [...cardsState];
    activeCardElem = {classList: {add() {}}, style: {}}; playBeep = () => {};`, state.context);
  await vm.runInContext("finalizeSwipe('left')", state.context);
  assert.equal(vm.runInContext('matchedProfiles.length', state.context), 0);
});

test('late message responses cannot populate a different conversation', async () => {
  let finish;
  const state = app({ fetch: () => new Promise(resolve => {finish = resolve;}) });
  vm.runInContext("chatOpen = true; chatProfileId = 'ada-lovelace'; chatGeneration = 1;", state.context);
  const pending = vm.runInContext('pollChatMessages()', state.context);
  vm.runInContext("chatProfileId = 'other'; chatGeneration = 2;", state.context);
  finish({ok: true, status: 200, text: async () => JSON.stringify([{id: 1, body: 'Wrong thread', sender: 'member'}])});
  await pending;
  assert.equal(state.elements.get('messageLog').children.length, 0);
});

test('admin writes prompt after a 403 and retry using the in-memory key', async () => {
  const state = app({fetch: async (url, init) => {
    const allowed = init.headers['X-Admin-Key'] === 'entered-key';
    return {ok: allowed, status: allowed ? 201 : 403, text: async () => '{}', json: async () => ({message: 'Admin key required'})};
  }});
  vm.runInContext("window.prompt = () => 'entered-key'", state.context);
  await vm.runInContext("adminCall('/profiles', 'POST', {name: 'Test', age: 25})", state.context);
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].headers['X-Admin-Key'], 'entered-key');
});

test('multipart uploads keep their FormData body and let the browser set its boundary', async () => {
  const state = app();
  await vm.runInContext("apiCall('/profiles/ada/images', 'POST', new FormData())", state.context);
  assert.ok(state.requests[0].body instanceof FormData);
  assert.equal(state.requests[0].headers['Content-Type'], undefined);
});
