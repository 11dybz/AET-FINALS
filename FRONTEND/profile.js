(() => {
  const API = (window.PITCHR_API_BASE || '/api').replace(/\/$/, '');
  const fallback = {
    'chee-reynaldo': {name:'CHEE, Reynaldo Joseph', persona:'The Architectural Craftsman', age:22, location:'Manila, Philippines', role:'Full Stack Developer', image:'images/chee.jpg', matchPercentage:'99% Match', bio:'Specializes in end-to-end architectures, robust Spring Boot services, and high-performance reactive interfaces.', tags:['Java','Spring Boot','React','PostgreSQL','System Architecture'], dealbreakers:['Never leaves unfinished merge conflicts','Strictly adheres to clean layer separation','Builds seamless API payloads'], details:{fullBio:'Full-stack engineer dedicated to microservices, database normalization, and reactive UI component design.',projects:[{title:'E-Commerce Microservices Engine',desc:'A decomposed transactional Spring Boot microservice suite.'},{title:'Classroom Web Portal',desc:'Interactive student-teacher submission hub.'}],github:'',linkedin:'',email:'chee.reynaldo@example.com'}},
    'dapog-john-greg': {name:'DAPOG, John Greg', persona:'The Data & Backend Guardian', age:22, location:'Manila, Philippines', role:'Backend Engineer', image:'images/greg.jpg', matchPercentage:'97% Match', bio:'Obsessed with low-latency queries, transaction rollback strategies, and secure relational schema design.', tags:['Java','MySQL','REST APIs','Docker','Database Tuning'], dealbreakers:['Writes airtight transaction logic','Indexes columns before queries lag','REST endpoints documented to perfection'], details:{fullBio:'Backend developer specializing in schema normalization and rock-solid REST endpoints.',projects:[{title:'Inventory Management System',desc:'High-throughput warehouse tracking service.'},{title:'Auth Microservice Gateway',desc:'Centralized JWT validation proxy.'}],github:'',linkedin:'',email:'dapog.johngreg@example.com'}},
    'fontelar-dave': {name:'FONTELAR, Dave', persona:'The Full-Stack & ML Specialist', age:22, location:'Manila, Philippines', role:'Full-Stack & Systems Developer', image:'images/dave.jpg', matchPercentage:'98% Match', bio:'Builds intelligent full-stack applications with React and FastAPI.', tags:['React','Node.js','Python','FastAPI','MongoDB','Data Pipelines'], dealbreakers:['Preprocesses datasets thoroughly','Keeps terminal UI retro and fast','Clean Git commits'], details:{fullBio:'Full-stack engineer focusing on applications, machine learning, and responsive systems.',projects:[{title:'Retainify Platform',desc:'Predictive academic attrition risk tool.'},{title:'CRT Terminal Cyberdeck',desc:'Retro terminal web calculator.'}],github:'',linkedin:'',email:'fontelar.dave@example.com'}},
    'villanueva-justin': {name:'VILLANUEVA, Justin', persona:'The Interaction & UX Sculptor', age:22, location:'Manila, Philippines', role:'Frontend & UI/UX Developer', image:'images/justin.jpg', matchPercentage:'96% Match', bio:'Turns complex workflows into fluid, accessible mobile experiences.', tags:['React','CSS / Tailwind','JavaScript','Figma','Motion Physics'], dealbreakers:['Obsessed with 60 FPS touch physics','Never ships an unstyled form','Pixel-precise design parity'], details:{fullBio:'Frontend engineer passionate about gesture navigation and accessible design.',projects:[{title:'Swipe Deck Component Library',desc:'Touch-first carousel interface.'},{title:'Accessible Design Tokens',desc:'Cross-platform design token system.'}],github:'',linkedin:'',email:'villanueva.justin@example.com'}}
  };
  const id = document.body.dataset.profileId;
  function safeUrl(value) {
    if (typeof value !== 'string') return '';
    try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; }
  }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value == null ? '' : value; }
  async function load() {
    let profile = fallback[id];
    try {
      await fetch(API + '/session', {method:'POST', credentials:'include'});
      const response = await fetch(API + '/profiles/' + encodeURIComponent(id), {credentials:'include'});
      if (response.ok) profile = await response.json();
    } catch (_) {}
    render(profile);
  }
  function render(profile) {
    setText('profileName', profile.name); setText('profileNameHero', profile.name); setText('profileRole', profile.role); setText('profilePersona', profile.persona);
    setText('profileAge', profile.age); setText('profileLocation', profile.location); setText('profileBio', profile.bio); setText('profileFullBio', profile.details.fullBio);
    setText('profileMatch', profile.matchPercentage);
    const image = document.getElementById('profileImage'); image.src = profile.image || fallback[id].image; image.alt = profile.name;
    const skills = document.getElementById('profileSkills'); skills.replaceChildren();
    (profile.tags || []).forEach(tag => { const chip=document.createElement('span'); chip.className='skill-chip'; chip.textContent=tag; skills.appendChild(chip); });
    const why=document.getElementById('profileWhy'); why.replaceChildren();
    (profile.dealbreakers || []).forEach(text=>{const p=document.createElement('p');p.textContent=text;why.appendChild(p);});
    const projects=document.getElementById('profileProjects'); projects.replaceChildren();
    (profile.details.projects || []).forEach(project=>{const card=document.createElement('article');card.className='project-card';const h=document.createElement('h3');h.textContent=project.title;const p=document.createElement('p');p.textContent=project.desc;card.append(h,p);projects.appendChild(card);});
    const github=safeUrl(profile.details.github), linkedin=safeUrl(profile.details.linkedin);
    ['githubLink','linkedinLink'].forEach(linkId=>{const el=document.getElementById(linkId);if(!el)return;if(linkId==='githubLink'&&!github){el.classList.add('hidden');}else if(linkId==='linkedinLink'&&!linkedin){el.classList.add('hidden');}else el.href=linkId==='githubLink'?github:linkedin;});
    const email=document.getElementById('emailLink'); email.href='mailto:'+(profile.details.email||'');
    document.querySelectorAll('[data-profile-action]').forEach(button=>button.addEventListener('click',()=>swipe(button.dataset.profileAction)));
    document.querySelectorAll('[data-profile-message]').forEach(button=>button.addEventListener('click',()=>{window.location.href='index.html?chat='+encodeURIComponent(id);}));
    document.getElementById('profileSkeleton').classList.add('hidden');
  }
  async function swipe(action) {
    try {
      await fetch(API+'/session',{method:'POST',credentials:'include'});
      const response=await fetch(API+'/me/swipes/'+encodeURIComponent(id),{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
      if(!response.ok)throw new Error();
      if(action!=='pass' && window.confetti) window.confetti({particleCount:action==='super_like'?120:70,spread:80,origin:{y:.8}});
      const toast=document.getElementById('profileToast');toast.textContent=action==='pass'?'Passed':action==='super_like'?'Super liked!':'It is a match!';
      toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200);
    } catch (_) { alert('Could not save your action. Please retry.'); }
  }
  document.getElementById('shareProfile').addEventListener('click',async()=>{
    const shareData={title:document.title,text:'Check out this RizzUme profile',url:window.location.href};
    try{if(navigator.share)await navigator.share(shareData);else{await navigator.clipboard.writeText(window.location.href);}}catch(_){}
  });
  window.addEventListener('scroll',()=>document.getElementById('miniHeader').classList.toggle('show',window.scrollY>220),{passive:true});
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    }), { threshold: 0.12 });
    document.querySelectorAll('.reveal-section').forEach(section => observer.observe(section));
  } else {
    document.querySelectorAll('.reveal-section').forEach(section => section.classList.add('visible'));
  }
  load();
})();
