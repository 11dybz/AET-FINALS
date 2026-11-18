// Profile management shares the homepage's API transport and in-memory admin key.
async function adminCall(path, method, body) {
  try { return await apiCall(path, method, body); }
  catch (error) {
    if (error.status !== 403) throw error;
    const key = window.prompt('Enter the admin key to manage Rizzume profiles.');
    if (!key) throw error;
    adminKey = key;
    return apiCall(path, method, body);
  }
}

function openProfileEditor(profile = null) {
  if (!backendAvailable) return showToast('Editing unavailable', 'Connect to the backend and reload.');
  document.getElementById('profileEditor')?.remove();
  editorOriginalProfile = profile;
  editorImages = [...(profile?.images || [])];
  editorDirty = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'profileEditor';
  dialog.className = 'profile-editor';
  dialog.setAttribute('aria-labelledby', 'editorTitle');
  dialog.innerHTML = `<form id="profileEditorForm" class="space-y-4">
    <h2 id="editorTitle" class="text-xl font-black">${profile ? 'Edit profile' : 'Add profile'}</h2>
    <div id="editorFields" class="editor-fields"></div>
    <label class="editor-label"><input name="verified" type="checkbox"> Verified profile</label>
    <label class="editor-label">Projects (one per line: title | description)
      <textarea name="projects" rows="4"></textarea></label>
    <fieldset class="space-y-2"><legend class="font-bold">Images</legend>
      <p class="text-xs text-zinc-500">Up to 8 images, 5 MB each. Save a new profile before managing its gallery.</p>
      <div id="editorGallery" class="space-y-2"></div>
      <label class="editor-label">Image files<input id="editorFiles" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple></label>
      <label class="editor-label">Image URL<input id="editorImageUrl" type="url" placeholder="https://example.com/photo.jpg"></label>
      <button id="editorUpload" type="button" class="editor-secondary">Add images</button>
    </fieldset>
    <p id="editorError" class="text-sm text-red-600" role="alert"></p>
    <div class="flex gap-3"><button id="editorSave" type="submit" class="editor-primary">Save profile</button>
      <button id="editorCancel" type="button" class="editor-secondary">Close</button></div>
  </form>`;
  const fields = [
    ['name', 'Name', 100, true], ['age', 'Age', 3, true, 'number'],
    ['persona', 'Persona', 255], ['role', 'Role', 255], ['location', 'Location', 255],
    ['matchPercentage', 'Match label', 255], ['bio', 'Short bio', 2000],
    ['fullBio', 'Full bio', 4000], ['tags', 'Skills (one per line)', 1000],
    ['dealbreakers', 'Why match (one per line)', 4000],
    ['github', 'GitHub URL', 255, false, 'url'], ['linkedin', 'LinkedIn URL', 255, false, 'url'],
    ['email', 'Email', 255, false, 'email']
  ];
  const form = dialog.querySelector('form');
  fields.forEach(([name, text, max, required, type]) => {
    const label = document.createElement('label'); label.className = 'editor-label'; label.textContent = text;
    const input = document.createElement(max > 1000 || name === 'tags' ? 'textarea' : 'input');
    input.name = name; input.required = Boolean(required);
    if (type) input.type = type;
    if (type === 'number') { input.min = '16'; input.max = '120'; input.step = '1'; }
    else input.maxLength = max;
    const value = profile?.[name] ?? profile?.details?.[name] ?? '';
    input.value = Array.isArray(value) ? value.join('\n') : value;
    label.appendChild(input); dialog.querySelector('#editorFields').appendChild(label);
  });
  form.elements.verified.checked = Boolean(profile?.verified);
  form.elements.projects.value = (profile?.details?.projects || []).map(p => `${p.title || ''} | ${p.desc || ''}`).join('\n');
  form.addEventListener('input', event => { if (event.target.name) editorDirty = true; });
  function close(event) {
    if (dialog.dataset.busy === 'true' || (editorDirty && !window.confirm('Discard unsaved profile changes?'))) {
      event?.preventDefault(); return;
    }
    dialog.close(); dialog.remove();
  }
  dialog.querySelector('#editorCancel').onclick = close;
  dialog.addEventListener('cancel', close);
  form.onsubmit = async event => {
    event.preventDefault();
    if (dialog.dataset.busy === 'true') return;
    const values = new FormData(form);
    const text = name => String(values.get(name) || '').trim();
    const lines = name => text(name).split('\n').map(s => s.trim()).filter(Boolean);
    const payload = {
      name: text('name'), age: Number(text('age')), persona: text('persona'), role: text('role'),
      location: text('location'), matchPercentage: text('matchPercentage'), bio: text('bio'),
      verified: form.elements.verified.checked, tags: lines('tags'), dealbreakers: lines('dealbreakers'),
      details: {fullBio: text('fullBio'), github: text('github'), linkedin: text('linkedin'), email: text('email'),
        projects: lines('projects').map(line => {
          const split = line.indexOf('|');
          return split < 0 ? {title: line, desc: ''} : {title: line.slice(0, split).trim(), desc: line.slice(split + 1).trim()};
        })}
    };
    await editorAction(async () => {
      const saved = await adminCall(profile ? '/profiles/' + encodeURIComponent(profile.id) : '/profiles', profile ? 'PUT' : 'POST', payload);
      // Remember the saved ID even if refreshing the roster fails, so retry cannot create a duplicate.
      profile = saved; editorOriginalProfile = saved; editorDirty = false;
      dialog.querySelector('#editorTitle').textContent = 'Edit profile';
      dialog.querySelector('#editorUpload').disabled = false;
      await refreshProfilesAndMatches(); renderDirectory(); renderDeck();
      if (currentlyViewingProfile?.id === saved.id) openProfileScreen(saved);
      showToast('Profile saved', saved.name);
    });
  };
  async function editorAction(work) {
    if (dialog.dataset.busy === 'true') return;
    dialog.dataset.busy = 'true';
    dialog.querySelector('#editorError').textContent = '';
    try { await work(); }
    catch (error) { dialog.querySelector('#editorError').textContent = error.message; }
    finally { dialog.dataset.busy = 'false'; }
  }
  async function reloadGallery() {
    const fresh = await apiCall('/profiles/' + encodeURIComponent(profile.id), 'GET', undefined, {admin: false});
    editorImages = fresh.images || []; renderGallery();
    await refreshProfilesAndMatches(); renderDirectory(); renderDeck();
    if (currentlyViewingProfile?.id === profile.id) openProfileScreen(fresh);
  }
  function renderGallery() {
    const gallery = dialog.querySelector('#editorGallery'); gallery.replaceChildren();
    editorImages.forEach((image, index) => {
      const row = document.createElement('div'); row.className = 'editor-image-row';
      const img = document.createElement('img'); img.src = safeImageUrl(image.url); img.alt = `Image ${index + 1}`; row.appendChild(img);
      [['Move up', -1], ['Move down', 1], ['Remove', 0]].forEach(([label, direction]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = 'editor-secondary';
        button.disabled = direction ? index + direction < 0 || index + direction >= editorImages.length : false;
        button.onclick = () => editorAction(async () => {
          const base = '/profiles/' + encodeURIComponent(profile.id) + '/images';
          if (!direction) {
            if (!window.confirm('Remove this image?')) return;
            await adminCall(base + '/' + image.id, 'DELETE');
          } else {
            const ids = editorImages.map(image => image.id);
            [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
            await adminCall(base + '/order', 'PUT', {imageIds: ids});
          }
          await reloadGallery();
        }); row.appendChild(button);
      }); gallery.appendChild(row);
    });
  }
  dialog.querySelector('#editorUpload').disabled = !profile;
  dialog.querySelector('#editorUpload').onclick = () => editorAction(async () => {
    const files = dialog.querySelector('#editorFiles'); const url = dialog.querySelector('#editorImageUrl');
    if (!files.files.length && !url.value.trim()) throw new Error('Choose an image file or enter an image URL.');
    if (editorImages.length + files.files.length + (url.value.trim() ? 1 : 0) > 8) throw new Error('A profile can have at most 8 images.');
    const base = '/profiles/' + encodeURIComponent(profile.id) + '/images';
    if (files.files.length) {
      const data = new FormData();
      for (const file of files.files) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Each image must be 5 MB or smaller.');
        data.append('files', file);
      }
      await adminCall(base, 'POST', data); files.value = '';
      await reloadGallery();
    }
    if (url.value.trim()) {
      await adminCall(base, 'POST', {url: url.value.trim()}); url.value = '';
      await reloadGallery();
    }
  });
  document.body.appendChild(dialog); renderGallery(); dialog.showModal();
}

async function confirmDeleteProfile(profile) {
  if (!backendAvailable || !window.confirm(`Delete ${profile.name} and their matches, messages, and images?`)) return;
  try {
    await adminCall('/profiles/' + encodeURIComponent(profile.id), 'DELETE');
    if (currentlyViewingProfile?.id === profile.id) { closeProfileScreen(); currentlyViewingProfile = null; }
    if (chatProfileId === profile.id) closeChat();
    await refreshProfilesAndMatches(); renderDirectory(); renderDeck();
    showToast('Profile deleted', profile.name);
  } catch (error) { showToast('Could not delete profile', error.message); }
}
