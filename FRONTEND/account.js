/* Account state stays in memory. Authentication credentials travel only in HttpOnly cookies. */
(() => {
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  let user = null, redirecting = false;
  async function request(path, method = 'GET', body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const endpoint = API + '/auth' + path;
      const headers = window.RizzumeHTTP?.headers(endpoint,body === undefined ? {} : {'Content-Type':'application/json'});
      const response = await fetch(endpoint, {method, credentials:'include', signal:controller.signal,
        ...(headers ? {headers} : body === undefined ? {} : {headers:{'Content-Type':'application/json'}}),
        ...(body === undefined ? {} : {body:JSON.stringify(body)})});
      if (window.RizzumeHTTP) return await window.RizzumeHTTP.accountJson(response);
      const text = await response.text(); let data;
      try { data = text ? JSON.parse(text) : null; } catch (_) { throw new Error('The account service is unavailable. Please try again shortly.'); }
      if (!response.ok) {
        const error = new Error(response.status === 404 ? 'The account service is unavailable. Please try again shortly.' : data?.message || 'Could not complete your request.');
        error.status = response.status; throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The server is taking a little longer. Please try again.');
      if (error instanceof TypeError) throw new Error('Could not reach Rizzume. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function destination(value) {
    try {
      const url = new URL(value || 'index.html', window.location.href);
      if (url.origin !== window.location.origin || !/^\/(?:index\.html|CHEE\.html|DAPOG\.html|FONTELAR\.html|VILLANUEVA\.html)?$/i.test(url.pathname)) return 'index.html';
      return (url.pathname === '/' ? '/index.html' : url.pathname) + url.search + url.hash;
    } catch (_) { return 'index.html'; }
  }
 function signInUrl(nextOverride) {
    const target = destination(nextOverride || 'index.html');
    return 'login.html?next=' + encodeURIComponent(target);
  }
  function expired() {
    if (redirecting) return;
    redirecting = true; user = null; window.RizzumeExperience?.stop(); window.location.replace(signInUrl());
  }
  async function checkOptional() {
    try {
      const account = await request('/me');
      if (account?.authenticated && account.user) {
        user = account.user;
        document.body.classList.remove('auth-pending', 'guest-preview');
        window.RizzumeExperience?.refreshAccount();
        return true;
      }
    } catch (_) {}
    user = null;
    document.body.classList.remove('auth-pending');
    document.body.classList.add('guest-preview');
    return false;
  }
  async function requireLogin() {
    const gate = document.getElementById('accountGate');
    try {
      const account = await request('/me');
      if (!account?.authenticated) { expired(); return false; }
      user = account.user; document.body.classList.remove('auth-pending', 'guest-preview'); if (gate) gate.hidden = true;
      window.RizzumeExperience?.refreshAccount(); return true;
    } catch (error) {
      if (gate) {
        gate.querySelector('[data-gate-title]').textContent = 'Let’s reconnect.';
        gate.querySelector('[data-gate-message]').textContent = error.message;
        gate.querySelector('button').hidden = false;
      }
      return false;
    }
  }
  async function logout() {
    window.RizzumeExperience?.stop();
    try { await request('/logout', 'POST'); }
    catch (error) { window.RizzumeExperience?.resume(); throw error; }
    user = null; window.location.replace('login.html');
  }
  async function refresh() {
    const account = await request('/me');
    if (!account?.authenticated) { expired(); throw new Error('Your session has expired. Please log in again.'); }
    user = account.user; window.RizzumeExperience?.refreshAccount(); return user;
  }
  window.RizzumeAccount = {request, destination, signInUrl, checkOptional, requireLogin, expired, logout, refresh, get user() {return user;}};
  if (document.body.dataset.accountRequired === 'true') {
    const gate = document.createElement('section'); gate.id = 'accountGate'; gate.className = 'account-check';
    gate.setAttribute('role', 'status');
    gate.innerHTML = '<div><span class="account-wordmark">rizzume</span><h1 data-gate-title>Getting things ready.</h1><p data-gate-message>Checking your account…</p><button type="button" hidden>Try again</button></div>';
    gate.querySelector('button').onclick = () => window.location.reload(); document.body.appendChild(gate);
  }
})();
