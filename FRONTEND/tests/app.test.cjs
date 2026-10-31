const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

function app(options = {}) {
  const listeners = {};
  const requests = [];
  const timers = new Map();
  const elements = new Map();
  let timerId = 0;
  function element() {
    return { classList: { add() {}, remove() {} }, style: {}, innerHTML: '',
      textContent: '', appendChild() {}, setAttribute() {}, addEventListener() {} };
  }
  const context = vm.createContext({
    window: { PITCHR_API_BASE: options.base, AudioContext: function () {},
      addEventListener(name, callback) { listeners[name] = callback; } },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      querySelector: () => null
    },
    sessionStorage: { getItem: () => null },
    lucide: { createIcons() {} },
    console: { log() {}, error() {} },
    AbortController,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, init) {
      requests.push({ url, ...init });
      if (options.failure) throw new Error('Network unavailable');
      return { ok: options.status === undefined || options.status === 200,
        status: options.status || 200, json: async () => ({ expiresAt: 'later' }) };
    }
  });
  vm.runInContext(source, context);
  return { context, listeners, requests, timers, elements };
}

test('startup creates a visitor session on the page server and renders the empty matches state', async () => {
  const state = app();
  await state.listeners.DOMContentLoaded();
  assert.equal(state.requests[0].url, '/api/session');
  assert.equal(state.requests[0].method, 'POST');
  assert.equal(state.requests[0].credentials, 'include');
  assert.match(state.elements.get('matchesList').innerHTML, /No matches yet/);
});

test('a separately hosted frontend can configure the API port', async () => {
  const state = app({ base: 'http://localhost:8081/api/' });
  await vm.runInContext("apiCall('/session', 'POST')", state.context);
  assert.equal(state.requests[0].url, 'http://localhost:8081/api/session');
  assert.equal(state.timers.size, 0);
});

test('an HTTP error rejects the request instead of reporting a connected backend', async () => {
  const state = app({ status: 404 });
  await assert.rejects(vm.runInContext("apiCall('/session', 'POST')", state.context), /404/);
  assert.equal(state.timers.size, 0);
});

test('startup displays a useful message when the backend is unavailable', async () => {
  const state = app({ failure: true });
  await state.listeners.DOMContentLoaded();
  assert.match(state.elements.get('toastMessage').textContent, /Backend unavailable/);
});

test('rapid swipe input and rewind cannot remove more than one card during an animation', () => {
  const state = app();
  vm.runInContext(`
    playBeep = () => {};
    showToast = () => {};
    renderDeck = () => { activeCardElem = null; };
    activeCardElem = { classList: { add() {} }, style: {} };
    finalizeSwipe('left');
    finalizeSwipe('left');
    resetDeck();
  `, state.context);
  const animations = [...state.timers.values()].filter(timer => timer.delay === 300);
  assert.equal(animations.length, 1);
  animations[0].callback();
  assert.equal(vm.runInContext('cardsState.length', state.context), 3);
});

test('an empty deck clears the stale active card', () => {
  const state = app();
  vm.runInContext('activeCardElem = {}; cardsState = []; renderDeck();', state.context);
  assert.equal(vm.runInContext('activeCardElem', state.context), null);
});
