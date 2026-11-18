(() => {
  const register = document.body.dataset.authMode === 'register', $ = id => document.getElementById(id);
  const account = window.RizzumeAccount, form = $('authForm'), feedback = $('authFeedback'), submit = $('authSubmit');
  const next = account.destination(new URLSearchParams(window.location.search).get('next'));
  let submitting = false;
  const fields = register ? ['name','email','password','confirmPassword'] : ['email','password'];
  document.querySelectorAll('[data-auth-switch]').forEach(link => {
    const target = new URL(link.getAttribute('href'), window.location.href); target.searchParams.set('next', next); link.href = target.href;
  });
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = $(button.dataset.togglePassword), show = input.type === 'password';
      input.type = show ? 'text' : 'password'; button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', (show ? 'Hide ' : 'Show ') + (input.id === 'confirmPassword' ? 'confirm password' : 'password'));
    });
  });
  function error(id, message) {
    const input = $(id), hint = $(id + 'Error'); input.setAttribute('aria-invalid','true');
    hint.textContent = message; hint.hidden = false;
    input.setAttribute('aria-describedby', (id === 'password' && register ? 'passwordHint ' : '') + hint.id);
  }
  function clear(id) {
    $(id).removeAttribute('aria-invalid'); $(id + 'Error').hidden = true;
    if (id === 'password' && register) $(id).setAttribute('aria-describedby','passwordHint'); else $(id).removeAttribute('aria-describedby');
  }
  fields.forEach(id => $(id).addEventListener('input', () => clear(id)));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submitting) return;
    fields.forEach(clear); feedback.hidden = true; feedback.classList.remove('success');
    const payload = {email:$('email').value.trim(), password:$('password').value};
    if (register) { payload.name = $('name').value.trim(); payload.confirmPassword = $('confirmPassword').value; }
    let invalid = false;
    if (register && !payload.name) { error('name','Enter your name.'); invalid = true; }
    if (!payload.email || !$('email').validity.valid) { error('email','Enter a valid email address.'); invalid = true; }
    if (!payload.password || (register && payload.password.length < 10) || payload.password.length > 128) {
      error('password', register ? 'Use a password with 10–128 characters.' : 'Enter your password.'); invalid = true;
    }
    if (register && (!payload.confirmPassword || payload.password !== payload.confirmPassword)) {
      error('confirmPassword','Your passwords do not match.'); invalid = true;
    }
    if (invalid) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    submitting = true; submit.disabled = true; form.setAttribute('aria-busy','true');
    submit.querySelector('span').textContent = register ? 'Creating your account…' : 'Logging you in…';
    try {
      const result = await account.request(register ? '/register' : '/login', 'POST', payload);
      if (!result?.authenticated) throw new Error('Your account could not be confirmed. Please try again.');
      fields.filter(id => id.toLowerCase().includes('password')).forEach(id => { $(id).value = ''; });
      feedback.textContent = register ? 'You’re in. Opening your workspace…' : 'Welcome back. Opening your workspace…';
      feedback.hidden = false; feedback.classList.add('success'); window.location.replace(next);
    } catch (failure) {
      feedback.textContent = failure.message || 'Could not complete your request. Please try again.'; feedback.hidden = false;
      if (failure.status === 409) error('email','This email is already registered. Log in instead.');
    } finally {
      submitting = false; submit.disabled = false; form.removeAttribute('aria-busy');
      submit.querySelector('span').textContent = register ? 'Create account' : 'Log in';
    }
  });
  // Already signed-in users return to the intended page without re-entering credentials.
  account.request('/me').then(result => { if (result?.authenticated && !submitting) window.location.replace(next); }).catch(() => {});
  window.addEventListener('pageshow', event => { if (event.persisted) { form.reset(); account.request('/me').then(result => { if (result?.authenticated) window.location.replace(next); }).catch(() => {}); } });
})();
