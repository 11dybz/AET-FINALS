/* Test-only fetch replacement. This script is never included in the packaged application. */
(() => {
  const mode = new URLSearchParams(location.search).get('state') || 'empty';
  let roster;
  const profiles = () => roster ||= structuredClone(FALLBACK_PROFILES).map((p,i) => ({...p,images:[{id:i+1,url:p.image}]}));
  const populated = ['filled','thread-error'].includes(mode);
  const threads = new Map();
  function messages(id) {
    if (!threads.has(id)) threads.set(id,id === profiles()[0].id ? [{id:1,body:'Hey! I saw your portfolio. Would love to build something together.',sender:'member',createdAt:new Date().toISOString()}] : []);
    return threads.get(id);
  }
  window.fetch = async (resource,init = {}) => {
    const url = new URL(resource,location.href), pathname = url.pathname.replace(/^\/api/,'');
    if (!url.pathname.startsWith('/api/')) throw new Error('The isolated fixture only supports mock API requests.');
    let body = null, status = 200;
    if (pathname === '/auth/me') body = {authenticated:true,user:{id:'fixture-account',name:'Alex Rivera',email:'alex@example.com',profileId:mode === 'fresh' ? null : profiles()[0].id},expiresAt:new Date(Date.now()+86400000).toISOString()};
    else if (pathname === '/profiles' && (init.method || 'GET') === 'GET') { if (mode === 'loading') return new Promise(()=>{}); body = profiles(); }
    else if (pathname === '/me/matches') body = populated ? profiles().slice(0,2) : [];
    else if (pathname === '/me/profile') body = profiles()[0];
    else if (pathname === '/team') body = {email:'team@example.com'};
    else if (pathname === '/me/notifications') body = {items:[],unreadCount:0};
    else if (pathname === '/me/conversations') {
      if (mode === 'inbox-loading') return new Promise(()=>{});
      if (mode === 'error') { status=503; body={message:'Fixture connection unavailable'}; }
      else body = populated ? profiles().slice(0,2).map((profile,i) => ({profile,lastMessage:messages(profile.id).at(-1)||null,unreadCount:i === 0 ? 1 : 0})) : [];
    } else if (/\/me\/conversations\/[^/]+\/messages$/.test(pathname)) {
      const id = pathname.split('/')[3];
      if (mode === 'thread-error') { status=503; body={message:'Fixture conversation unavailable'}; }
      else if (init.method === 'POST') { const payload=JSON.parse(init.body); const message={id:Date.now(),body:payload.body,sender:'visitor',createdAt:new Date().toISOString()};messages(id).push(message);body=message; }
      else body=messages(id).filter(m=>m.id>Number(url.searchParams.get('afterId')||0));
    } else if (pathname.startsWith('/profiles/') && init.method === 'PUT') {
      const id = pathname.split('/')[2], payload=JSON.parse(init.body); const i=profiles().findIndex(p=>p.id===id);roster[i]={...roster[i],...payload};body=roster[i];
    } else if (pathname.startsWith('/profiles/')) body=profiles().find(p=>p.id===pathname.split('/')[2]);
    else body = {};
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
})();
