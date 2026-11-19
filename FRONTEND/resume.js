/* Local PDF generation. Only the signed-in user's saved public profile is exported. */
(() => {
  let libraryPromise, downloading = false;
  const API = (window.RIZZUME_API_BASE || window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  const clean = value => String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();

  function filename(name) {
    const base = clean(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 100);
    return (base || 'My_Portfolio') + '_Resume.pdf';
  }

  function loadLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = new URL('vendor/pdf-lib.min.js', document.baseURI).href;
      script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('The PDF exporter could not load. Please try again.'));
      script.onerror = () => { script.remove(); reject(new Error('The PDF exporter could not load. Please try again.')); };
      document.head.appendChild(script);
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }

  // Standard PDF fonts cover English and Filipino accents. Other scripts and emoji
  // use the browser's font fallback for those runs, preserving their visual content.
  function runs(text, font) {
    const result = [];
    for (const character of text) {
      let supported = true;
      try { font.encodeText(character); } catch (_) { supported = false; }
      const previous = result.at(-1);
      if (previous?.supported === supported) previous.text += character;
      else result.push({text:character, supported});
    }
    return result;
  }

  async function create(profile, lib = window.PDFLib) {
    if (!lib) throw new Error('The PDF exporter is not ready. Please try again.');
    const name = clean(profile?.name);
    if (!name) throw new Error('Add your name and save your profile before exporting.');
    const {PDFDocument, StandardFonts, rgb, PDFName, PDFString} = lib;
    const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.setTitle(name + ' - Resume'); pdf.setAuthor(name); pdf.setCreator('Rizzume'); pdf.setSubject('Portfolio resume');
    const width = 595.28, height = 841.89, margin = 48, bottom = 58, contentWidth = width - margin * 2;
    const ink = rgb(.12,.15,.19), muted = rgb(.39,.43,.49), accent = rgb(.83,.13,.34), pale = rgb(.88,.89,.91);
    const glyphCache = new Map(); let page, y;
    function canvasRun(text, size, strong) {
      const key = `${size}:${strong}:${text}`;
      if (glyphCache.has(key)) return glyphCache.get(key);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not render this profile. Try another browser.');
      const scale = 3, font = `${strong ? '700' : '400'} ${size * scale}px Arial, sans-serif`;
      context.font = font;
      const measured = context.measureText(text), advance = measured.width / scale;
      const ascent = Math.max(size, (measured.actualBoundingBoxAscent || size * scale) / scale);
      const descent = Math.max(size * .25, (measured.actualBoundingBoxDescent || 0) / scale);
      canvas.width = Math.ceil(advance * scale + 6); canvas.height = Math.ceil((ascent + descent) * scale + 6);
      context.font = font; context.fillStyle = '#202630'; context.textBaseline = 'alphabetic';
      context.fillText(text, 3, 3 + ascent * scale);
      const value = {advance, descent, width:canvas.width / scale, height:canvas.height / scale, png:canvas.toDataURL('image/png')};
      glyphCache.set(key,value); return value;
    }
    function measure(text, size, font) {
      try { return font.widthOfTextAtSize(text,size); }
      catch (_) { return runs(text,font).reduce((total, run) => total + (run.supported ? font.widthOfTextAtSize(run.text,size) : canvasRun(run.text,size,font === bold).advance),0); }
    }
    function wrap(text, size, font, available = contentWidth) {
      const lines = [];
      for (const paragraph of clean(text).split('\n')) {
        if (!paragraph.trim()) { lines.push(''); continue; }
        let line = '';
        for (const word of paragraph.trim().split(/\s+/)) {
          if (measure(line ? line + ' ' + word : word,size,font) <= available) { line = line ? line + ' ' + word : word; continue; }
          if (line) { lines.push(line); line = ''; }
          for (const character of word) {
            if (line && measure(line + character,size,font) > available) { lines.push(line); line = ''; }
            line += character;
          }
        }
        if (line) lines.push(line);
      }
      return lines;
    }
    async function draw(text, x, baseline, size, font = regular, color = ink, target = page) {
      let cursor = x;
      for (const run of runs(text,font)) {
        if (run.supported) { target.drawText(run.text,{x:cursor,y:baseline,size,font,color}); cursor += measure(run.text,size,font); }
        else {
          const glyph = canvasRun(run.text,size,font === bold);
          if (!glyph.image) glyph.image = await pdf.embedPng(glyph.png);
          target.drawImage(glyph.image,{x:cursor - 1,y:baseline - glyph.descent - 1,width:glyph.width,height:glyph.height});
          cursor += glyph.advance;
        }
      }
    }
    async function newPage() {
      page = pdf.addPage([width,height]); y = height - margin;
      if (pdf.getPageCount() > 1) {
        const label = wrap(name,9,bold)[0];
        await draw(label,margin,y - 8,9,bold,muted); y -= 27;
        page.drawLine({start:{x:margin,y},end:{x:width-margin,y},thickness:.6,color:pale}); y -= 24;
      }
    }
    async function ensure(space) { if (y - space < bottom) await newPage(); }
    async function paragraph(text, {size = 10.5, leading = 15.5, font = regular, color = ink, indent = 0, after = 8} = {}) {
      for (const line of wrap(text,size,font,contentWidth-indent)) {
        await ensure(leading); await draw(line,margin+indent,y-size,size,font,color); y -= leading;
      }
      y -= after;
    }
    async function section(title, keep = 40) {
      await ensure(41 + keep); y -= 13;
      await draw(title.toUpperCase(),margin,y-9,9,bold,accent); y -= 20;
      page.drawLine({start:{x:margin,y:y+3},end:{x:width-margin,y:y+3},thickness:.6,color:pale}); y -= 8;
    }
    await newPage();
    page.drawRectangle({x:margin,y:y-4,width:38,height:3,color:accent}); y -= 24;
    await paragraph(name,{size:27,leading:32,font:bold,after:5});
    if (clean(profile.role)) await paragraph(profile.role,{size:12,leading:17,color:muted,after:8});
    const details = profile.details || {};
    const contact = [clean(profile.location),clean(details.email)].filter(Boolean);
    if (contact.length) await paragraph(contact.join('  |  '),{size:9.5,leading:14,color:muted,after:2});
    const bio = clean(profile.bio), fullBio = clean(details.fullBio);
    if (bio || fullBio) {
      await section('Profile');
      if (bio) await paragraph(bio);
      if (fullBio && fullBio !== bio) await paragraph(fullBio);
    }
    const skills = (profile.tags || []).map(clean).filter(Boolean);
    if (skills.length) { await section('Skills'); await paragraph(skills.join('  /  ')); }
    const projects = (details.projects || []).filter(project => clean(project.title) || clean(project.desc));
    if (projects.length) {
      const projectSpace = project => (clean(project.title) ? wrap(project.title,11,bold).length * 16 + 4 : 0) + (clean(project.desc) ? 31 : 0) + 12;
      await section('Projects',projectSpace(projects[0]));
      for (const project of projects) {
        const title = clean(project.title), description = clean(project.desc);
        await ensure(projectSpace(project));
        if (title) await paragraph(title,{size:11,leading:16,font:bold,after:4});
        if (description) await paragraph(description,{after:12});
      }
    }
    const highlights = (profile.dealbreakers || []).map(value => clean(value).replace(/^[\u2705\u2713\u2714\u2611\u2022\uFE0F\s]+/u,'')).filter(Boolean);
    if (highlights.length) {
      await section('Highlights');
      for (const highlight of highlights) await paragraph('- ' + highlight,{after:5});
    }
    const links = [['GitHub',details.github],['LinkedIn',details.linkedin]].flatMap(([label,value]) => {
      try { const url = new URL(clean(value)); return ['http:','https:'].includes(url.protocol) ? [{label,url:url.href,text:clean(value)}] : []; }
      catch (_) { return []; }
    });
    if (links.length) {
      await section('Links');
      for (const link of links) {
        await ensure(45); await paragraph(link.label,{size:9.5,leading:14,font:bold,after:2});
        for (const line of wrap(link.text,9.5,regular)) {
          await ensure(14); await draw(line,margin,y-9.5,9.5,regular,muted);
          const annotation = pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[margin,y-12,margin+measure(line,9.5,regular),y+2],Border:[0,0,0],
            A:{Type:'Action',S:'URI',URI:PDFString.of(link.url)}});
          const ref = pdf.context.register(annotation);
          let annotations = page.node.lookup(PDFName.of('Annots'));
          if (!annotations) { annotations = pdf.context.obj([]); page.node.set(PDFName.of('Annots'),annotations); }
          annotations.push(ref); y -= 14;
        }
        y -= 8;
      }
    }
    const pages = pdf.getPages();
    for (let i = 0; i < pages.length; i++) {
      const target = pages[i];
      target.drawLine({start:{x:margin,y:43},end:{x:width-margin,y:43},thickness:.6,color:pale});
      await draw('Portfolio resume | Rizzume',margin,29,8,regular,muted,target);
      const number = `${i+1} / ${pages.length}`; await draw(number,width-margin-measure(number,8,regular),29,8,regular,muted,target);
    }
    return {bytes:await pdf.save(),filename:filename(name),pageCount:pages.length};
  }

  async function savedProfile() {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetch(API + '/me/profile',{credentials:'include',signal:controller.signal,
        ...(window.RizzumeHTTP ? {headers:window.RizzumeHTTP.headers(API + '/me/profile')} : {})});
      const profile = await response.json();
      if (!response.ok) {
        if (response.status === 401) window.RizzumeAccount?.expired();
        throw new Error(response.status === 404 ? 'Create and save your profile before exporting a PDF.' : profile?.message || 'Your saved profile could not load. Please try again.');
      }
      return profile;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Loading your profile took too long. Please try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function download(button) {
    if (downloading) return false;
    const user = window.RizzumeAccount?.user;
    if (!user?.profileId) throw new Error('Create and save your profile before exporting a PDF.');
    downloading = true;
    const label = button?.textContent, wasDisabled = button?.disabled;
    if (button) { button.disabled = true; button.textContent = 'Preparing PDF…'; button.setAttribute('aria-busy','true'); }
    try {
      const [profile,lib] = await Promise.all([savedProfile(),loadLibrary()]);
      if (profile.id !== user.profileId || window.RizzumeAccount?.user?.id !== user.id) throw new Error('Your account changed. Reload before exporting your profile.');
      const result = await create(profile,lib);
      if (window.RizzumeAccount?.user?.id !== user.id) throw new Error('Your account changed. Reload before exporting your profile.');
      const url = URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
      const link = document.createElement('a'); link.href = url; link.download = result.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      return true;
    } finally {
      downloading = false;
      if (button) { button.disabled = wasDisabled; button.textContent = label; button.removeAttribute('aria-busy'); }
    }
  }
  window.RizzumeResume = {create,download,filename};
})();
