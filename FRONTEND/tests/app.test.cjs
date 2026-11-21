const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'editor.js'), 'utf8');
const messagesSource = fs.readFileSync(path.join(__dirname, '..', 'messages.js'), 'utf8');

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
      textContent: '', value: '', appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; }, remove() {}, focus() {},
      querySelector: () => element(), querySelectorAll: () => [],
      setAttribute() {}, removeAttribute() {}, addEventListener() {} };
  }
  const context = vm.createContext({
    window: { RIZZUME_API_BASE: options.base, PITCHR_API_BASE: options.legacyBase, location: {href: 'http://localhost/', origin: 'http://localhost'}, scrollTo() {}, AudioContext: function () {},
      addEventListener(name, callback) { listeners[name] = callback; } },
    document: {
      body: {classList:{add(){},remove(){}}},
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
    Image: function () {},
    FormData,
    URL,
    URLSearchParams,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 100; }, clearInterval() {},
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
  vm.runInContext(messagesSource, context);
  vm.runInContext(editorSource, context);
  return { context, listeners, windowListeners, requests, timers, elements, document: context.document };
}

const sampleProfile = {
  id: 'ada-lovelace', name: 'Ada Lovelace', age: 28, persona: 'Engineer', location: 'London', role: 'Developer',
  image: '/images/ada.jpg', images: [{ id: 1, url: '/images/ada.jpg' }], verified: true,
  matchPercentage: 'New', bio: 'Builds systems', tags: ['Java'], dealbreakers: ['Writes tests'],
  details: { fullBio: 'A profile', projects: [], github: 'https://github.com/ada', linkedin: '', email: 'ada@example.com' }
};

test('removing a match waits for persistence, blocks duplicate requests and updates only that connection', async () => {
  let complete;
  const state = app({fetch:() => new Promise(resolve => { complete = resolve; })});
  vm.runInContext(`backendAvailable=true; PROFILES=[${JSON.stringify(sampleProfile)}]; cardsState=[...PROFILES];
    matchedProfiles=[PROFILES[0],{...PROFILES[0],id:'other'}];
    chatConversations=[{profile:PROFILES[0],unreadCount:2},{profile:{id:'other'},unreadCount:1}];
    chatProfileId=PROFILES[0].id; chatThreadReady=true;`,state.context);
  const removal = vm.runInContext("removeSavedMatch('ada-lovelace')",state.context);
  assert.equal(vm.runInContext('matchedProfiles.length',state.context),2);
  assert.equal(await vm.runInContext("removeSavedMatch('ada-lovelace')",state.context),false);
  assert.equal(state.requests.length,1);
  assert.equal(state.requests[0].url,'/api/me/swipes/ada-lovelace');
  assert.equal(state.requests[0].method,'PUT');
  assert.deepEqual(JSON.parse(state.requests[0].body),{action:'pass'});
  complete({ok:true,status:200,text:async () => '{"matched":false}'});
  assert.equal(await removal,true);
  assert.deepEqual(Array.from(vm.runInContext('matchedProfiles.map(p=>p.id)',state.context)),['other']);
  assert.deepEqual(Array.from(vm.runInContext('chatConversations.map(c=>c.profile.id)',state.context)),['other']);
  assert.equal(vm.runInContext('chatProfileId',state.context),null);
  assert.equal(vm.runInContext('chatThreadReady',state.context),false);
  assert.equal(vm.runInContext('cardsState.length',state.context),1);
  assert.equal(state.elements.get('sidebarMessageCount').textContent,'1');
});

test('a failed match removal leaves the saved match and conversation available for retry', async () => {
  const state = app({status:503,errorMessage:'Please try again.'});
  vm.runInContext(`backendAvailable=true; matchedProfiles=[${JSON.stringify(sampleProfile)}];
    chatConversations=[{profile:matchedProfiles[0],unreadCount:2}];`,state.context);
  await assert.rejects(vm.runInContext("removeSavedMatch('ada-lovelace')",state.context),/Please try again/);
  assert.equal(vm.runInContext('matchedProfiles.length',state.context),1);
  assert.equal(vm.runInContext('chatConversations.length',state.context),1);
  assert.equal(vm.runInContext('matchRemovalPending',state.context),false);
});

test('a match can be removed only after explicit confirmation, and cancelling sends no request', async () => {
  const state=app();let modal;
  state.context.window.RizzumeUI={icon:()=>'',dialog(id,html,onClose,options){
    modal={el:{hidden:true,querySelectorAll:()=>[],setAttribute(){},removeAttribute(){}},
      open(){this.el.hidden=false;},close(){if(options.canClose()){this.el.hidden=true;onClose();}}};return modal;
  }};
  vm.runInContext(`backendAvailable=true;matchedProfiles=[${JSON.stringify(sampleProfile)}];askToRemoveMatch('ada-lovelace');`,state.context);
  assert.equal(modal.el.hidden,false);assert.equal(state.requests.length,0);
  assert.equal(state.elements.get('removeMatchName').textContent,'Ada Lovelace');
  modal.close();await state.elements.get('confirmRemoveMatch').onclick();
  assert.equal(state.requests.length,0);
  vm.runInContext("askToRemoveMatch('ada-lovelace')",state.context);
  await state.elements.get('confirmRemoveMatch').onclick();
  assert.equal(state.requests.length,1);assert.equal(modal.el.hidden,true);
  assert.equal(vm.runInContext('matchedProfiles.length',state.context),0);
});

test('guest startup establishes a session before requesting workspace data', async () => {
  const state = app({ profiles: [sampleProfile], matches: [] });
  await state.listeners.DOMContentLoaded();
  assert.deepEqual(state.requests.slice(0, 4).map(request => [request.url, request.method]), [
    ['/api/session', 'POST'], ['/api/profiles', 'GET'], ['/api/me/matches', 'GET'], ['/api/team', 'GET']
  ]);
  assert.equal(vm.runInContext('PROFILES[0].id', state.context), 'ada-lovelace');
  assert.equal(vm.runInContext('teamEmail', state.context), 'team@example.com');
  assert.equal(state.requests.filter(request => request.url.endsWith('/session')).length, 1);
});

test('signed-in startup uses the validated account session without another session round trip', async () => {
  const state = app({profiles:[sampleProfile]});
  vm.runInContext("window.RizzumeAccount = {user:{profileId:'ada-lovelace'},requireLogin:async () => true}",state.context);
  await state.listeners.DOMContentLoaded();
  assert.deepEqual(state.requests.map(r => r.url),['/api/profiles','/api/me/matches','/api/team']);
});

test('roster and matches are requested concurrently rather than waiting for the roster response', async () => {
  const pending = new Map();
  const state = app({fetch:(url) => new Promise(resolve => pending.set(url,resolve))});
  const loading = vm.runInContext('refreshProfilesAndMatches()',state.context);
  assert.deepEqual([...pending.keys()],['/api/profiles','/api/me/matches']);
  pending.get('/api/profiles')({ok:true,status:200,text:async () => JSON.stringify([sampleProfile])});
  pending.get('/api/me/matches')({ok:true,status:200,text:async () => '[]'});
  await loading;
  assert.equal(vm.runInContext('PROFILES[0].name',state.context),'Ada Lovelace');
});

test('saving a card patches its cached data without resetting already swiped cards or match flags', () => {
  const state = app();
  vm.runInContext(`PROFILES=[${JSON.stringify(sampleProfile)}, {...${JSON.stringify(sampleProfile)},id:'another'}];
    cardsState=[PROFILES[1]]; matchedProfiles=[{...PROFILES[0],isSuper:true}];
    cacheEditedProfile({...PROFILES[0],name:'Updated name'});`,state.context);
  assert.equal(vm.runInContext('PROFILES[0].name',state.context),'Updated name');
  assert.deepEqual(Array.from(vm.runInContext('cardsState.map(p => p.id)',state.context)),['another']);
  assert.equal(vm.runInContext('matchedProfiles[0].name',state.context),'Updated name');
  assert.equal(vm.runInContext('matchedProfiles[0].isSuper',state.context),true);
  assert.equal(state.requests.length,0);
});

test('structured project editing preserves pipes and paragraphs and validates list limits', () => {
  const state = app();
  const payload = vm.runInContext(String.raw`(() => {
    const values={name:' Ada ',age:'28',verified:{checked:true},tags:' Java\n\n Design ',dealbreakers:' Helpful\nCurious ',fullBio:' My story ',email:'ada@example.com'};
    const projects=[{title:'Search | discover',desc:'First paragraph.\nSecond paragraph.'},{title:'',desc:''}];
    const form={elements:{namedItem(name){return name==='verified' ? values.verified : {value:values[name] || ''}}},
      querySelectorAll(){return projects.map(p => ({querySelector(selector){return {value:selector==='[data-project-title]' ? p.title : p.desc}}}))}};
    return profileEditorPayload(form);
  })()`,state.context);
  assert.equal(payload.name,'Ada');
  assert.deepEqual(Array.from(payload.tags),['Java','Design']);
  assert.equal(payload.details.projects.length,1);
  assert.equal(payload.details.projects[0].title,'Search | discover');
  assert.equal(payload.details.projects[0].desc,'First paragraph.\nSecond paragraph.');
  state.context.payload = payload;
  assert.equal(vm.runInContext('profileEditorValidation(payload)',state.context),'');
  assert.match(vm.runInContext("profileEditorValidation({...payload,tags:Array(16).fill('Java')})",state.context),/15 skills/);
  assert.match(vm.runInContext("profileEditorValidation({...payload,dealbreakers:['x'.repeat(301)]})",state.context),/300 characters/);
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

test('discovery shows one profile picture while the opened gallery contains all eight photos', () => {
  const state = app();
  const profile = {...sampleProfile, images: Array.from({length:8}, (_,i) => ({id:i+1,url:`/api/images/${i+1}`}))};
  vm.runInContext(`PROFILES=[${JSON.stringify(profile)}]; cardsState=[...PROFILES]; renderDeck();`, state.context);
  const card = state.elements.get('cardsWrapper').children[0];
  assert.match(card.innerHTML, /src="\/api\/images\/1"/);
  assert.doesNotMatch(card.innerHTML, /src="\/api\/images\/[2-8]"/);
  vm.runInContext('renderProfileGallery(PROFILES[0])', state.context);
  assert.deepEqual(JSON.parse(state.elements.get('detailGallery').dataset.images), profile.images.map(photo => photo.url));
  assert.equal(state.elements.get('detailCover').hidden, true);
});

test('main profile cards open all photos before navigating to their full portfolio', () => {
  for (const [id, page] of [['chee-reynaldo', 'CHEE.html'], ['dapog-john', 'DAPOG.html'], ['fontelar-dave', 'FONTELAR.html'], ['villanueva-justin', 'VILLANUEVA.html']]) {
    const state = app();
    state.context.window.RizzumeAccount = {user: {profileId: 'another-member'}};
    const profile = {...sampleProfile, id, page, images: Array.from({length:8}, (_,i) => ({id:i+1,url:`/api/images/${i+1}`}))};
    vm.runInContext(`openProfileScreen(${JSON.stringify(profile)})`, state.context);
    assert.equal(state.context.window.location.href, 'http://localhost/');
    assert.deepEqual(JSON.parse(state.elements.get('detailGallery').dataset.images), profile.images.map(photo => photo.url));
    const link = state.elements.get('detailManagementActions').children[0];
    assert.equal(link.textContent, 'View full portfolio');
    assert.equal(link.href, `http://localhost/${page}`);
    assert.equal(state.elements.get('fullProfileScreen').scrollTop, 0);
  }
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
    chatOpen = true; chatThreadReady = true;
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

test('an empty inbox renders guidance rather than a blank conversation list', async () => {
  const state=app({fetch:async()=>({ok:true,status:200,text:async()=>'[]'})});
  vm.runInContext('chatOpen=true',state.context);
  await vm.runInContext('loadConversations()',state.context);
  assert.equal(vm.runInContext('chatListLoaded',state.context),true);
  assert.equal(state.elements.get('conversationList').children[0].children[1].textContent,'A fresh start');
  assert.match(state.elements.get('inboxWelcomeTitle').textContent,/conversation/);
});

test('inbox errors show a retry state and do not report an empty successful load', async () => {
  const state=app({failure:true});
  vm.runInContext('chatOpen=true',state.context);
  await vm.runInContext('loadConversations()',state.context);
  assert.equal(vm.runInContext('chatListLoaded',state.context),false);
  assert.match(state.elements.get('conversationList').children[0].children[1].textContent,/reconnect/);
});

test('search and unread filters keep the inbox layout and distinguish no results', () => {
  const state=app();
  vm.runInContext(`chatListLoaded=true; chatConversations=[{profile:${JSON.stringify(sampleProfile)},unreadCount:2}]; renderConversations()`,state.context);
  assert.equal(state.elements.get('conversationList').children.length,1);
  state.elements.get('conversationSearch').value='nonexistent';
  vm.runInContext('filterConversations()',state.context);
  assert.equal(state.elements.get('conversationList').children[0].children[1].textContent,'No conversations found');
  state.elements.get('conversationSearch').value='';
  vm.runInContext('chatConversations[0].unreadCount=0; filterConversations("unread")',state.context);
  assert.match(state.elements.get('conversationList').children[0].children[1].textContent,/caught up/);
});

test('closing and reopening the inbox ignores an old request', async () => {
  const responses=[];
  const state=app({fetch:()=>new Promise(resolve=>responses.push(resolve))});
  vm.runInContext('chatOpen=true',state.context);
  const old=vm.runInContext('loadConversations()',state.context);
  vm.runInContext('closeChat(); chatOpen=true',state.context);
  const current=vm.runInContext('loadConversations()',state.context);
  responses[1]({ok:true,status:200,text:async()=>'[]'}); await current;
  responses[0]({ok:true,status:200,text:async()=>JSON.stringify([{profile:sampleProfile,unreadCount:4}])}); await old;
  assert.equal(vm.runInContext('chatConversations.length',state.context),0);
});

test('switching conversations preserves a separate in-memory draft for each connection', async () => {
  const state=app({fetch:async()=>({ok:true,status:200,text:async()=>'[]'})});
  vm.runInContext(`chatOpen=true; chatProfileId='first'; document.getElementById('chatComposer').value='First draft';`,state.context);
  await vm.runInContext("openChatThread('second')",state.context);
  state.elements.get('chatComposer').value='Second draft';
  await vm.runInContext("openChatThread('first')",state.context);
  assert.equal(state.elements.get('chatComposer').value,'First draft');
  assert.equal(vm.runInContext("chatDrafts.get('second')",state.context),'Second draft');
});

test('a failed first thread load disables sending and provides retry without losing the draft', async () => {
  const state=app({failure:true});
  vm.runInContext("chatOpen=true;chatDrafts.set('first','Keep this draft');",state.context);
  await vm.runInContext("openChatThread('first')",state.context);
  assert.equal(state.elements.get('chatComposer').value,'Keep this draft');
  assert.equal(state.elements.get('chatComposer').disabled,true);
  assert.equal(state.elements.get('chatSendButton').disabled,true);
  assert.equal(state.elements.get('threadLoadRetry').hidden,false);
});

test('a confirmed send clears its old draft when that thread was reopened during the request', async () => {
  let complete;
  const state=app({fetch:async (url,init)=> {
    if (init.method==='POST' && url.endsWith('/messages')) return new Promise(resolve=>{complete=resolve});
    return {ok:true,status:200,text:async()=>'[]'};
  }});
  vm.runInContext("chatOpen=true;chatProfileId='first';chatThreadReady=true;document.getElementById('chatComposer').value='Send this once'",state.context);
  const sending=vm.runInContext('sendChatMessage()',state.context);
  await vm.runInContext("openChatThread('second')",state.context);
  await vm.runInContext("openChatThread('first')",state.context);
  assert.equal(state.elements.get('chatComposer').value,'Send this once');
  complete({ok:true,status:200,text:async()=>'{}'}); await sending;
  assert.equal(state.elements.get('chatComposer').value,'');
  assert.equal(vm.runInContext("chatDrafts.has('first')",state.context),false);
});

test('profile permission failures cannot fall back to browser admin-key overrides', async () => {
  const state = app({fetch: async (url, init) => {
    const allowed = init.headers['X-Admin-Key'] === 'entered-key';
    return {ok: allowed, status: allowed ? 201 : 403, text: async () => '{}', json: async () => ({message: 'Admin key required'})};
  }});
  vm.runInContext("window.prompt = () => {throw new Error('Must not prompt');}; adminKey = 'entered-key';", state.context);
  await assert.rejects(vm.runInContext("adminCall('/profiles', 'POST', {name: 'Test', age: 25})", state.context), error => error.status === 403);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].headers['X-Admin-Key'], undefined);
});

test('editing controls render for the owned profile only', () => {
  const state = app();
  vm.runInContext("backendAvailable = true; window.RizzumeAccount = {user:{profileId:'ada-lovelace'}};", state.context);
  assert.equal(vm.runInContext("canEditProfile('ada-lovelace')", state.context),true);
  assert.equal(vm.runInContext("canEditProfile('chee-reynaldo')", state.context),false);
  vm.runInContext("window.RizzumeAccount.user = null", state.context);
  assert.equal(vm.runInContext("canEditProfile('ada-lovelace')", state.context),false);
});

test('opening a foreign profile editor does not create an editor dialog', () => {
  const state = app();
  vm.runInContext("backendAvailable = true; window.RizzumeAccount = {user:{profileId:'mine'}};", state.context);
  vm.runInContext(`openProfileEditor(${JSON.stringify(sampleProfile)})`,state.context);
  assert.equal(vm.runInContext('editorOriginalProfile',state.context),null);
  assert.equal(state.elements.has('profileEditor'),false);
  assert.equal(state.requests.length,0);
});

test('the directory exposes edit and delete actions only on the owned card', () => {
  const state=app();
  vm.runInContext(`PROFILES = [${JSON.stringify(sampleProfile)}, {...${JSON.stringify(sampleProfile)},id:'foreign'}];
    backendAvailable = true; window.RizzumeAccount = {user:{profileId:'ada-lovelace'}}; renderDirectory();`,state.context);
  const cards=state.elements.get('directoryGrid').children;
  assert.match(cards[0].innerHTML,/data-action="edit"/);assert.match(cards[0].innerHTML,/data-action="delete"/);
  assert.doesNotMatch(cards[1].innerHTML,/data-action="edit"|data-action="delete"/);
});

test('multipart uploads keep their FormData body and let the browser set its boundary', async () => {
  const state = app();
  await vm.runInContext("apiCall('/profiles/ada/images', 'POST', new FormData())", state.context);
  assert.ok(state.requests[0].body instanceof FormData);
  assert.equal(state.requests[0].headers['Content-Type'], undefined);
});
