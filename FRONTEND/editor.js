// Every mutation uses the signed-in cookie; ownership is enforced by the server.
async function adminCall(path, method, body) {
  return apiCall(path, method, body, {admin:false});
}

// Update one profile without resetting the swipe stack or downloading the roster again.
function cacheEditedProfile(saved) {
  const previous = PROFILES.find(p => p.id === saved.id), fresh = {...saved, page:previous?.page};
  const replace = list => list.map(p => p.id === fresh.id ? {...fresh, isSuper:p.isSuper} : p);
  PROFILES = previous ? replace(PROFILES) : [...PROFILES,fresh];
  cardsState = previous ? replace(cardsState) : [...cardsState,fresh];
  matchedProfiles = replace(matchedProfiles);
  if (currentlyViewingProfile?.id === fresh.id) openProfileScreen(fresh);
  renderDirectory(); renderDeck(); updateDynamicCounts(); updateMatchesUI();
  window.RizzumeExperience?.refresh();
  return fresh;
}

function profileEditorPayload(form) {
  const value = name => String(form.elements.namedItem(name)?.value || '').trim();
  const lines = name => value(name).split('\n').map(v => v.trim()).filter(Boolean);
  const projects = Array.from(form.querySelectorAll('[data-project]')).map(row => ({
    title:row.querySelector('[data-project-title]').value.trim(), desc:row.querySelector('[data-project-desc]').value.trim()
  })).filter(p => p.title || p.desc);
  return {name:value('name'), age:Number(value('age')), persona:value('persona'), role:value('role'),
    location:value('location'), matchPercentage:value('matchPercentage'), bio:value('bio'),
    verified:form.elements.namedItem('verified').checked, tags:lines('tags'), dealbreakers:lines('dealbreakers'),
    details:{fullBio:value('fullBio'),github:value('github'),linkedin:value('linkedin'),email:value('email'),projects}};
}

function profileEditorValidation(payload) {
  if (payload.tags.length > 15 || payload.tags.some(v => v.length > 50)) return 'Use up to 15 skills, with 50 characters per skill.';
  if (payload.dealbreakers.length > 10 || payload.dealbreakers.some(v => v.length > 300)) return 'Use up to 10 highlights, with 300 characters per highlight.';
  if (payload.details.projects.length > 10) return 'You can add up to 10 projects.';
  return '';
}

function openProfileEditor(profile = null) {
  if (!backendAvailable) return showToast('Editing unavailable','Connect to the backend and reload.');
  const user = window.RizzumeAccount?.user;
  if (!user) return showToast('Log in first','Log in to manage your profile.');
  if (!profile && user.profileId) profile = PROFILES.find(p => p.id === user.profileId);
  if ((profile && !canEditProfile(profile.id)) || (!profile && user.profileId))
    return showToast('Editing unavailable','You can only edit your own profile.');
  const existing = document.getElementById('profileEditor');
  if (existing) { existing.focus(); return; }
  editorOriginalProfile = profile; editorImages = [...(profile?.images || [])]; editorDirty = false;
  const dialog = document.createElement('dialog'); dialog.id = 'profileEditor'; dialog.className = 'profile-editor pe-workspace';
  dialog.setAttribute('aria-labelledby','editorTitle');
  dialog.innerHTML = `<form id="profileEditorForm" novalidate>
    <header class="pe-header"><div><span class="pe-eyebrow">YOUR NEXT CONNECTION STARTS HERE</span><h2 id="editorTitle">My profile<span>.</span></h2><p>Make your first impression count.</p></div><div class="pe-header-actions"><button type="button" id="editorPreviewToggle" class="pe-preview-toggle" aria-pressed="false">Preview card</button><button type="button" id="editorCancel" class="pe-close" aria-label="Close profile editor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12 M6 18 18 6"/></svg></button></div></header>
    <div class="pe-layout"><div class="pe-main"><nav class="pe-tabs" aria-label="Profile sections"></nav><fieldset id="editorControls" class="pe-controls">
    <section data-section="card"><div class="pe-section-heading"><span class="pe-step">01 / THE FIRST IMPRESSION</span><h3>Edit your card</h3><p>The essentials people see as they discover you.</p></div><div class="pe-fields" id="editorCardFields"></div><label class="pe-check"><input name="verified" type="checkbox"> Show verified badge</label></section>
    <section data-section="about" hidden><div class="pe-section-heading"><span class="pe-step">02 / A LITTLE MORE YOU</span><h3>Beyond the card</h3><p>Share your story, strengths, and what you bring to a team.</p></div><div class="pe-fields" id="editorAboutFields"></div></section>
    <section data-section="projects" hidden><div class="pe-section-heading"><span class="pe-step">03 / SHOW YOUR WORK</span><h3>Projects with personality</h3><p>Add up to 10 projects. Tell people what you built and why it matters.</p></div><div id="editorProjects" class="pe-projects"></div><button type="button" id="editorAddProject" class="pe-secondary">+ Add project</button></section>
    <section data-section="photos" hidden><div class="pe-section-heading"><span class="pe-step">04 / PUT A FACE TO THE NAME</span><h3>Your photo lineup</h3><p>Your first photo is your card cover. Add up to 8 photos, 5 MB each.</p></div><p id="editorPhotoHint" class="pe-note"></p><div id="editorGallery" class="pe-gallery"></div><div class="pe-upload"><label for="editorFiles">Choose photos<span>JPG, PNG, GIF or WebP</span></label><input id="editorFiles" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple><label class="pe-label" for="editorImageUrl">Or add an image link</label><input id="editorImageUrl" type="url" placeholder="https://example.com/photo.jpg"><button id="editorUpload" type="button" class="pe-secondary">Add photos</button></div></section>
    <section data-section="links" hidden><div class="pe-section-heading"><span class="pe-step">05 / KEEP THE CONVERSATION GOING</span><h3>Links & contact</h3><p>These details appear on your public profile. Your sign-in email stays separate.</p></div><div class="pe-fields" id="editorLinkFields"></div><div class="pe-account-note"><span>Signed in as</span><strong id="editorAccountEmail"></strong></div></section>
    </fieldset><p id="editorError" class="pe-error" role="alert" tabindex="-1"></p></div>
    <aside class="pe-preview"><div class="pe-preview-heading"><span class="pe-eyebrow">THE DISCOVERY VIEW</span><h3>Your card, reimagined.</h3><p>Live preview as you edit.</p></div><article class="pe-card"><img id="editorPreviewPhoto" alt="Profile card cover"><div class="pe-card-shade"></div><div class="pe-photo-bars" id="editorPreviewBars"></div><span class="pe-card-label" id="editorPreviewPersona"></span><div class="pe-card-copy"><span class="pe-card-match" id="editorPreviewMatch"></span><h4><span id="editorPreviewName"></span><span id="editorPreviewAge"></span><span id="editorPreviewVerified" aria-label="Verified">&#10003;</span></h4><p id="editorPreviewRole"></p><p id="editorPreviewLocation" class="pe-card-location"></p><p id="editorPreviewBio" class="pe-card-bio"></p><div id="editorPreviewTags" class="pe-card-tags"></div></div></article><div class="pe-preview-caption"><span aria-hidden="true">&#10022;</span> A little personality goes a long way.</div><div class="pe-completeness"><div><strong>Profile essentials</strong><span id="editorProgressText"></span></div><progress id="editorProgress" max="6" value="0" aria-label="Completed profile essentials"></progress><p id="editorProgressHint"></p></div></aside></div>
    <footer class="pe-footer"><p id="editorStatus" role="status" aria-live="polite"></p><div><button type="button" id="editorView" class="pe-secondary">View profile</button><button type="button" id="editorResume" class="pe-secondary" title="Download a resume using your saved profile details">Download PDF</button><button type="submit" id="editorSave" class="pe-primary">Save changes</button></div></footer>
  </form>`;
  const $ = selector => dialog.querySelector(selector), form = $('form');
  let previewOnly = false;
  function setPreview(value) { previewOnly = value; dialog.classList.toggle('pe-preview-only',value); $('#editorPreviewToggle').setAttribute('aria-pressed',String(value)); $('#editorPreviewToggle').textContent = value ? 'Edit details' : 'Preview card'; }
  $('#editorPreviewToggle').onclick = () => setPreview(!previewOnly);
  function selectSection(key) {
    setPreview(false);
    dialog.querySelectorAll('[data-section]').forEach(section => { section.hidden = section.dataset.section !== key; });
    dialog.querySelectorAll('[data-tab]').forEach(button => {
      if (button.dataset.tab === key) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    $('#editorError').textContent = '';
  }
  [['card','My card'],['about','About me'],['projects','Projects'],['photos','Photos'],['links','Links']].forEach(([key,label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.tab = key;
    button.textContent = label; button.onclick = () => selectSection(key); $('.pe-tabs').appendChild(button);
  });
  const fields = [
    ['card','name','Your name',100,'text',true,'How should people know you?'], ['card','age','Age',3,'number',true,'16–120'],
    ['card','role','Role / headline',255,'text',false,'e.g. Frontend developer'], ['card','persona','Your persona',255,'text',false,'e.g. The creative problem solver'],
    ['card','location','Location',255,'text',false,'City, country'], ['card','matchPercentage','Card label',255,'text',false,'e.g. Open to collaborate'],
    ['card','bio','A short introduction',2000,'textarea',false,'Give someone a reason to say hello.'],
    ['about','fullBio','Your story',4000,'textarea',false,'Your background, interests, and what comes next.'],
    ['about','tags','Skills',764,'textarea',false,'JavaScript\nUI design\nProblem solving'], ['about','dealbreakers','Why connect with you?',3009,'textarea',false,'A strength, achievement, or reason to team up.'],
    ['links','github','GitHub',255,'url',false,'https://github.com/yourname'], ['links','linkedin','LinkedIn',255,'url',false,'https://www.linkedin.com/in/yourname'], ['links','email','Public contact email',255,'email',false,'hello@example.com']
  ];
  fields.forEach(([section,name,labelText,max,type,required,placeholder]) => {
    const label = document.createElement('label'); label.className = 'pe-label';
    if (type === 'textarea') label.classList.add('pe-wide');
    const heading = document.createElement('span'); heading.textContent = labelText + (required ? ' *' : '');
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.name = name; input.required = required; input.placeholder = placeholder;
    if (type !== 'textarea') input.type = type;
    if (type === 'number') { input.min = '16'; input.max = '120'; input.step = '1'; } else input.maxLength = max;
    if (type === 'url') input.pattern = 'https?://.+';
    if (type === 'textarea') input.rows = name === 'fullBio' ? 6 : 3;
    const value = profile?.[name] ?? profile?.details?.[name] ?? (name === 'name' ? user.name : name === 'email' ? user.email : '');
    input.value = Array.isArray(value) ? value.join('\n') : value; label.append(heading,input);
    if (['bio','fullBio','tags','dealbreakers'].includes(name)) { const hint = document.createElement('small'); hint.dataset.countFor = name; label.appendChild(hint); }
    $(`#editor${section === 'card' ? 'Card' : section === 'about' ? 'About' : 'Link'}Fields`).appendChild(label);
  });
  form.elements.namedItem('verified').checked = Boolean(profile?.verified); $('#editorAccountEmail').textContent = user.email;
  function addProject(project = {}) {
    if ($('#editorProjects').children.length >= 10) return;
    const row = document.createElement('div'); row.className = 'pe-project'; row.dataset.project = '';
    row.innerHTML = '<div class="pe-project-top"><strong>Project</strong><button type="button" class="pe-text-button" aria-label="Remove project">Remove</button></div><label class="pe-label">Project name<input data-project-title maxlength="255" placeholder="What did you build?"></label><label class="pe-label">Description<textarea data-project-desc maxlength="2000" rows="3" placeholder="Your contribution, the tools, the impact."></textarea></label>';
    row.querySelector('[data-project-title]').value = project.title || ''; row.querySelector('[data-project-desc]').value = project.desc || '';
    row.querySelector('button').onclick = () => { row.remove(); updateDraft(); }; $('#editorProjects').appendChild(row);
  }
  (profile?.details?.projects || []).forEach(addProject);
  $('#editorAddProject').onclick = () => { addProject(); updateDraft(); $('#editorProjects').lastElementChild?.querySelector('input').focus(); };
  let baseline = JSON.stringify(profileEditorPayload(form)), busy = false;
  const pendingPhotos = () => Boolean($('#editorFiles').files.length || $('#editorImageUrl').value.trim());
  function updateDraft() {
    const draft = profileEditorPayload(form); editorDirty = JSON.stringify(draft) !== baseline;
    $('#editorStatus').textContent = busy ? 'Saving. Please keep this window open…' : editorDirty ? 'Unsaved changes — make them yours, then save.' : pendingPhotos() ? 'Photos selected. Choose Add photos to upload them.' : profile ? 'All profile details are saved.' : 'Create your profile, then add photos to your card.';
    $('#editorPreviewName').textContent = draft.name || 'Your name'; $('#editorPreviewAge').textContent = draft.age ? ', '+draft.age : '';
    $('#editorPreviewRole').textContent = draft.role || 'Your next chapter starts here'; $('#editorPreviewPersona').textContent = draft.persona || 'One of a kind';
    $('#editorPreviewMatch').textContent = draft.matchPercentage || 'Open to connect'; $('#editorPreviewLocation').textContent = draft.location ? '⌖ '+draft.location : '';
    $('#editorPreviewBio').textContent = draft.bio; $('#editorPreviewVerified').hidden = !draft.verified;
    $('#editorPreviewTags').replaceChildren(); draft.tags.slice(0,4).forEach(tag => { const chip = document.createElement('span'); chip.textContent = tag; $('#editorPreviewTags').appendChild(chip); });
    const image = safeImageUrl(editorImages[0]?.url || profile?.image), photo = $('#editorPreviewPhoto');
    if (photo.getAttribute('src') !== image) { if (image) photo.src = image; else photo.removeAttribute('src'); }
    photo.hidden = !image; photo.onerror = () => { photo.hidden = true; };
    $('#editorPreviewBars').replaceChildren();
    Array.from({length:Math.max(1,editorImages.length)},(_,i) => { const bar = document.createElement('span'); bar.className = i === 0 ? 'active' : ''; $('#editorPreviewBars').appendChild(bar); });
    const essentials = [[draft.name && draft.age,'name and age'],[draft.role,'role'],[draft.bio,'short introduction'],[draft.tags.length,'skills'],[draft.details.projects.length,'project'],[image,'cover photo']];
    const complete = essentials.filter(([value]) => value).length; $('#editorProgress').value = complete; $('#editorProgressText').textContent = complete+' / 6';
    $('#editorProgressHint').textContent = complete === 6 ? 'Looking good. Your essentials are all here.' : 'Next up: add your '+essentials.find(([value]) => !value)[1]+'.';
    dialog.querySelectorAll('[data-count-for]').forEach(hint => {
      const name = hint.dataset.countFor, input = form.elements.namedItem(name);
      hint.textContent = name === 'tags' ? draft.tags.length+' / 15 skills · one per line, up to 50 characters each' : name === 'dealbreakers' ? draft.dealbreakers.length+' / 10 highlights · one per line, up to 300 characters each' : input.value.length+' / '+input.maxLength;
    });
    $('#editorAddProject').disabled = $('#editorProjects').children.length >= 10;
    $('#editorView').hidden = !profile; $('#editorUpload').disabled = !profile;
    $('#editorResume').disabled = busy || !profile;
    $('#editorPhotoHint').textContent = profile ? 'Photo changes save immediately. Other profile details save with Save changes.' : 'Save your profile first, then add your photos here.';
  }
  form.addEventListener('input',updateDraft); form.addEventListener('change',updateDraft);
  function beforeUnload(event) { if (editorDirty || pendingPhotos() || busy) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload',beforeUnload);
  function close(event) {
    event?.preventDefault();
    if (busy || ((editorDirty || pendingPhotos()) && !window.confirm('Discard unsaved profile changes and selected photos?'))) return false;
    window.removeEventListener('beforeunload',beforeUnload); dialog.close(); dialog.remove(); editorDirty = false; return true;
  }
  $('#editorCancel').onclick = close; dialog.addEventListener('cancel',close);
  $('#editorView').onclick = () => { const saved = profile; if (close()) openProfileScreen(saved); };
  $('#editorResume').onclick = async () => {
    $('#editorError').textContent = '';
    try {
      const downloaded = await window.RizzumeResume.download($('#editorResume'));
      if (downloaded) $('#editorStatus').textContent = editorDirty ? 'PDF downloaded using saved details. Save changes to include your edits.' : 'Your resume PDF has been downloaded.';
    } catch (error) { $('#editorError').textContent = error.message; $('#editorError').focus(); }
  };
  async function editorAction(work) {
    if (busy) return;
    busy = true; dialog.dataset.busy = 'true'; dialog.setAttribute('aria-busy','true');
    $('#editorControls').disabled = true; $('#editorSave').disabled = true; $('#editorView').disabled = true; $('#editorResume').disabled = true;
    $('#editorSave').textContent = 'Saving…'; $('#editorError').textContent = ''; updateDraft();
    try { await work(); } catch (error) { $('#editorError').textContent = error.message; $('#editorError').focus(); }
    finally {
      busy = false; dialog.dataset.busy = 'false'; dialog.removeAttribute('aria-busy'); $('#editorControls').disabled = false;
      $('#editorSave').disabled = false; $('#editorView').disabled = false; $('#editorSave').textContent = profile ? 'Save changes' : 'Create profile'; updateDraft();
    }
  }
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    // A fieldset also matches :invalid when a child is invalid; target the actual control.
    const invalid = form.querySelector('input:invalid, textarea:invalid, select:invalid');
    if (invalid) { const section = invalid.closest('[data-section]'); if (section) selectSection(section.dataset.section); invalid.reportValidity(); invalid.focus(); return; }
    const payload = profileEditorPayload(form), error = profileEditorValidation(payload);
    if (error) { selectSection('about'); $('#editorError').textContent = error; $('#editorError').focus(); return; }
    await editorAction(async () => {
      const creating = !profile;
      const saved = await adminCall(creating ? '/profiles' : '/profiles/'+encodeURIComponent(profile.id),creating ? 'POST' : 'PUT',payload);
      profile = saved; editorOriginalProfile = saved; editorImages = saved.images || [];
      baseline = JSON.stringify(profileEditorPayload(form)); editorDirty = false;
      // The authenticated create response confirms ownership; no second account request is needed.
      if (creating) { window.RizzumeAccount.user.profileId = saved.id; window.RizzumeExperience?.refreshAccount(); }
      cacheEditedProfile(saved); renderGallery(); showToast('Profile saved','Your updated card is ready to discover.');
    });
  };
  async function reloadGallery() {
    const fresh = await apiCall('/profiles/'+encodeURIComponent(profile.id),'GET',undefined,{admin:false});
    // Never replace unsaved text fields after a photo operation.
    profile = fresh; editorImages = fresh.images || []; editorOriginalProfile = fresh;
    cacheEditedProfile(fresh); renderGallery(); updateDraft();
  }
  function renderGallery() {
    const gallery = $('#editorGallery'); gallery.replaceChildren();
    if (!editorImages.length) { const empty = document.createElement('p'); empty.className = 'pe-empty'; empty.textContent = 'A great photo makes a great hello. Add your first one below.'; gallery.appendChild(empty); }
    editorImages.forEach((image,index) => {
      const tile = document.createElement('div'); tile.className = 'pe-photo';
      const img = document.createElement('img'); img.src = safeImageUrl(image.url); img.alt = 'Profile photo '+(index+1); img.loading = 'lazy'; tile.appendChild(img);
      const badge = document.createElement('span'); badge.className = 'pe-photo-number'; badge.textContent = index === 0 ? 'Cover' : String(index+1); tile.appendChild(badge);
      const actions = document.createElement('div'); actions.className = 'pe-photo-actions';
      [['Make cover','cover'],['←','left'],['→','right'],['Remove','remove']].forEach(([label,action]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.setAttribute('aria-label',(action === 'left' ? 'Move photo left' : action === 'right' ? 'Move photo right' : label)+', photo '+(index+1));
        button.disabled = (action === 'cover' || action === 'left') && index === 0 || action === 'right' && index === editorImages.length-1;
        button.onclick = () => editorAction(async () => {
          const base = '/profiles/'+encodeURIComponent(profile.id)+'/images';
          if (action === 'remove') { if (!window.confirm('Remove this photo?')) return; await adminCall(base+'/'+image.id,'DELETE'); }
          else {
            const ids = editorImages.map(v => v.id);
            if (action === 'cover') { ids.splice(index,1); ids.unshift(image.id); }
            else { const next = index+(action === 'left' ? -1 : 1); [ids[index],ids[next]] = [ids[next],ids[index]]; }
            await adminCall(base+'/order','PUT',{imageIds:ids});
          }
          await reloadGallery();
        }); actions.appendChild(button);
      }); tile.appendChild(actions); gallery.appendChild(tile);
    });
  }
  $('#editorUpload').onclick = () => editorAction(async () => {
    const files = $('#editorFiles'), url = $('#editorImageUrl'), selected = Array.from(files.files);
    if (!selected.length && !url.value.trim()) throw new Error('Choose photos or enter an image link.');
    if (editorImages.length+selected.length+(url.value.trim() ? 1 : 0) > 8) throw new Error('A profile can have at most 8 photos.');
    if (url.value.trim() && (!url.checkValidity() || !/^https?:\/\//i.test(url.value.trim()))) throw new Error('Use a valid http(s) image link.');
    for (const file of selected) {
      if (file.size > 5*1024*1024) throw new Error('Each photo must be 5 MB or smaller.');
      if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)) throw new Error('Use JPG, PNG, GIF or WebP photos.');
    }
    const base = '/profiles/'+encodeURIComponent(profile.id)+'/images';
    if (selected.length) { const data = new FormData(); selected.forEach(file => data.append('files',file)); await adminCall(base,'POST',data); files.value = ''; await reloadGallery(); }
    if (url.value.trim()) { await adminCall(base,'POST',{url:url.value.trim()}); url.value = ''; await reloadGallery(); }
    showToast('Photos saved','Your first photo is your card cover.');
  });
  $('#editorSave').textContent = profile ? 'Save changes' : 'Create profile';
  document.body.appendChild(dialog); selectSection('card'); renderGallery(); updateDraft(); dialog.showModal();
}

async function confirmDeleteProfile(profile) {
  if (!canEditProfile(profile.id)) return showToast('Delete unavailable','You can only delete your own profile.');
  if (!backendAvailable || !window.confirm(`Delete ${profile.name} and their matches, messages, and images?`)) return;
  try {
    await adminCall('/profiles/'+encodeURIComponent(profile.id),'DELETE'); await window.RizzumeAccount.refresh();
    if (currentlyViewingProfile?.id === profile.id) { closeProfileScreen(); currentlyViewingProfile = null; }
    if (chatProfileId === profile.id) closeChat();
    PROFILES = PROFILES.filter(p => p.id !== profile.id); cardsState = cardsState.filter(p => p.id !== profile.id); matchedProfiles = matchedProfiles.filter(p => p.id !== profile.id);
    renderDirectory(); renderDeck(); updateDynamicCounts(); updateMatchesUI(); window.RizzumeExperience?.refresh(); showToast('Profile deleted',profile.name);
  } catch (error) { showToast('Could not delete profile',error.message); }
}
