const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function element() {
  const selectors = new Map();
  return {
    value: '', textContent: '', children: [], className: '', style: {},
    classList: {add() {}, remove() {}},
    appendChild(child) {this.children.push(child);}, append(...children) {this.children.push(...children);},
    replaceChildren(...children) {this.children = children;}, remove() {},
    querySelector(selector) {
      if (!selectors.has(selector)) selectors.set(selector, element());
      return selectors.get(selector);
    },
    querySelectorAll(selector) {return selector === 'p' ? [element(), element()] : [];}
  };
}

function page(file, respond) {
  const elements = new Map(); const sections = Array.from({length: 6}, element); const requests = [];
  const context = vm.createContext({
    window: {location:{pathname:'/CHEE.html'},RizzumeAccount:{user:{profileId:'own-profile'},checkOptional:async()=>true}}, location: {href: 'https://rizzume.example/CHEE.html'}, AbortController,
    URL, setTimeout: () => 1, clearTimeout() {},
    document: {
      title: 'Rizzume', body: {dataset: {profileId: 'chee-reynaldo'}},
      createElement: element,
      addEventListener() {},
      querySelectorAll: selector => selector === 'main > section' ? sections : [],
      getElementById(id) {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);}
    },
    async fetch(url, init) {
      requests.push({url, ...init});
      const response = await respond(url, init);
      return {ok: (response.status || 200) < 400, status: response.status || 200, text: async () => JSON.stringify(response.body)};
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return {context, requests, elements, sections};
}

const profile = {id: 'chee-reynaldo', name: 'Current backend name', age: 25, tags: [], dealbreakers: [], details: {projects: []}};

test('member pages display current profile data and send a request without claiming a match', async () => {
  const state = page('profile.js', async url => ({body: url.includes('/profiles/') ? profile : url.endsWith('/connections') ? [] : {status:'pending',direction:'outgoing'}}));
  await tick();
  assert.match(state.context.document.title, /Current backend name.*Rizzume/);
  await state.context.window.likeProfile();
  const writes=state.requests.filter(request => request.method === 'POST');
  assert.deepEqual(writes.map(request => request.url),['/api/me/connection-requests/chee-reynaldo']);
  assert.equal(writes[0].body, '{"priority":false}');
  assert.match(state.elements.get('toast').querySelector('p').textContent, /request sent.*when they accept/);
});

test('member pages report a failed save without showing a successful match', async () => {
  const state = page('profile.js', async url => url.includes('/profiles/') ? {body: profile} : {status: 503, body: {message: 'Backend is starting'}});
  await tick(); await state.context.window.likeProfile();
  assert.equal(state.requests.filter(request => request.method === 'POST').length, 1);
  assert.equal(state.elements.get('toast').querySelector('p').textContent, 'Backend is starting');
});

test('team inbox selection changes invalidate the old thread and block replies to it', async () => {
  let finish;
  const state = page('team-inbox.js', async url => {
    if (url.endsWith('/profiles')) return {body: [profile]};
    if (url.includes('?profileId=')) return {body: [{sessionId: 'visitor-a', profile}]};
    return new Promise(resolve => {finish = resolve;});
  });
  await tick();
  state.elements.get('teamKey').value = 'team-secret'; state.elements.get('teamProfile').value = profile.id;
  await state.elements.get('loadInbox').onclick();
  const opening = state.elements.get('conversationList').children[0].onclick();
  state.elements.get('teamProfile').value = 'another-profile';
  state.elements.get('teamProfile').onchange();
  finish({body: [{sender: 'member', body: 'Stale response'}]}); await opening;
  state.elements.get('teamReply').value = 'Must not go to the previous profile';
  await state.elements.get('sendReply').onclick();
  assert.equal(state.elements.get('teamMessages').children.length, 0);
  assert.equal(state.requests.some(request => request.method === 'POST'), false);
});
