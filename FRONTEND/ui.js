/* Small shared primitives; no framework or icon CDN is required for the new screens. */
(() => {
  const paths = {
    flame: 'M12 3c2 5 7 6 7 12a7 7 0 0 1-14 0c0-3 1-5 3-7 0 3 1 4 2 4 2-2 3-5 2-9Z',
    discover: 'm16 8-3 5-5 3 3-5 5-3Z M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
    map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z M9 3v15 M15 6v15',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
    grid: 'M3 3h7v7H3V3Z M14 3h7v7h-7V3Z M3 14h7v7H3v-7Z M14 14h7v7h-7v-7Z',
    settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    video: 'm16 8 6-4v16l-6-4 M2 6h14v12H2V6Z',
    mic: 'M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',
    close: 'm6 6 12 12 M6 18 18 6',
    arrow: 'M5 12h14 m-5-5 5 5-5 5',
    phone: 'M3 15c5-7 13-7 18 0l-3 3-4-3v-2h-4v2l-4 3-3-3Z',
    check: 'm5 12 4 4L19 6',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    lock: 'M5 10h14v11H5V10Z M8 10V6a4 4 0 0 1 8 0v4'
  };
  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
  }
  let toastTimer;
  function toast(message) {
    let el = document.getElementById('rzToast');
    if (!el) { el = document.createElement('div'); el.id = 'rzToast'; el.className = 'rz-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = message; el.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }
  // Every modal has a focus trap, Escape handling and focus restoration.
  function dialog(id, html, onClose) {
    const el = document.createElement('div'); el.id = id; el.className = 'rz-dialog'; el.hidden = true;
    el.innerHTML = html; const panel = el.firstElementChild;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const title = panel.querySelector('h2'); if (title) { title.id = id + 'Title'; panel.setAttribute('aria-labelledby', title.id); }
    let previousFocus;
    const api = {
      el,
      open() { previousFocus = document.activeElement; el.hidden = false; el.querySelector('button, input, select')?.focus(); },
      close() { if (el.hidden) return; el.hidden = true; onClose?.(); previousFocus?.focus?.(); }
    };
    el.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => api.close(); });
    el.addEventListener('click', event => { if (event.target === el) api.close(); });
    el.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); api.close(); }
      if (event.key !== 'Tab') return;
      const focusable = [...el.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, video[controls]')].filter(e => !e.hidden && e.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    document.body.appendChild(el); return api;
  }
  function messageBody(element, text) {
    // Only shared map links become clickable; arbitrary message markup remains plain text.
    const value = String(text || '');
    const match = value.match(/https:\/\/www\.openstreetmap\.org\/\?mlat=-?\d+(?:\.\d+)?&mlon=-?\d+(?:\.\d+)?#map=\d+\/-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?/);
    if (!match) { element.textContent = value; return; }
    element.textContent = value.slice(0, match.index);
    const link = document.createElement('a'); link.href = match[0]; link.textContent = 'Open shared location';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'rz-shared-map';
    element.appendChild(link); element.appendChild(document.createTextNode(value.slice(match.index + match[0].length)));
  }
  window.RizzumeUI = {icon, toast, dialog, messageBody};
})();
