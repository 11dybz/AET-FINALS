const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function el(id='') {
  return {id, value:'', hidden:false, type:'password', disabled:false, textContent:'', attrs:{}, listeners:{}, dataset:{}, validity:{valid:true},
    classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k];},
    addEventListener(k,v){this.listeners[k]=v;},focus(){this.focused=true;}};
}
function accountPage(response={authenticated:false}, options={}) {
  const redirects=[],requests=[],gate=el(),parts=new Map();
  gate.querySelector=selector=>{if(!parts.has(selector))parts.set(selector,el());return parts.get(selector);};
  const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,
    window:{location:{href:'http://localhost/index.html?chat=ada',origin:'http://localhost',replace:value=>redirects.push(value)},RizzumeExperience:{refreshAccount(){},stop(){},resume(){}}},
    document:{body:{dataset:{},classList:{remove(){}}},getElementById:()=>gate},
    async fetch(url,init){requests.push({url,...init});if(options.fetch)return options.fetch(url,init);
      return {ok:!options.status,status:options.status||200,text:async()=>JSON.stringify(response)};}
  });
  vm.runInContext(source('account.js'),context);
  return {account:context.window.RizzumeAccount,redirects,requests,gate,parts};
}
test('account redirect destinations reject external URLs and sign-in loops',()=>{
  const s=accountPage();
  assert.equal(s.account.destination('https://attacker.example/'), 'index.html');
  assert.equal(s.account.destination('//attacker.example/'), 'index.html');
  assert.equal(s.account.destination('javascript:alert(1)'), 'index.html');
  assert.equal(s.account.destination('/login.html'), 'index.html');
  assert.equal(s.account.destination('/index.html?chat=ada'), '/index.html?chat=ada');
});
test('signed-out discovery redirects to login with the intended conversation preserved',async()=>{
  const s=accountPage(); assert.equal(await s.account.requireLogin(),false);
  assert.equal(s.redirects[0],'login.html?next=%2Findex.html%3Fchat%3Dada');
});
test('a failed account check stays on a retry screen instead of redirecting in a loop',async()=>{
  const s=accountPage({message:'Service unavailable'},{status:503});
  assert.equal(await s.account.requireLogin(),false); assert.equal(s.redirects.length,0);
  assert.equal(s.parts.get('button').hidden,false); assert.match(s.parts.get('[data-gate-message]').textContent,/unavailable/);
});
test('a valid account check keeps user state in memory and uses cookie credentials',async()=>{
  const s=accountPage({authenticated:true,user:{name:'Ada',email:'ada@example.com'}});
  assert.equal(await s.account.requireLogin(),true); assert.equal(s.account.user.name,'Ada');
  assert.equal(s.requests[0].credentials,'include');assert.equal(s.requests[0].headers,undefined);
});
test('logout does not claim success when the server rejects it',async()=>{
  const s=accountPage({message:'Offline'},{status:503}); await assert.rejects(s.account.logout());
  assert.equal(s.redirects.length,0);
});

function formPage({register=false, respond}={}) {
  const elements=new Map(),requests=[],redirects=[];
  const get=id=>{if(!elements.has(id))elements.set(id,el(id));return elements.get(id);};
  const button=get('authSubmit'); button.querySelector=()=>get('submitText');
  const form=get('authForm'); form.querySelector=()=>[...elements.values()].find(e=>e.attrs['aria-invalid']==='true');
  const toggle=el();toggle.dataset.togglePassword='password';
  const context=vm.createContext({URL,URLSearchParams,
    window:{location:{href:'http://localhost/'+(register?'register':'login')+'.html',search:'',replace:value=>redirects.push(value)},addEventListener(){},
      RizzumeAccount:{destination:()=>'/index.html',async request(route,method,body){
        if(route==='/me')return {authenticated:false}; requests.push({route,method,body}); return respond?respond(route,body):{authenticated:true};
      }}},
    document:{body:{dataset:{authMode:register?'register':'login'}},getElementById:get,
      querySelectorAll:selector=>selector==='[data-toggle-password]'?[toggle]:[]}
  });
  vm.runInContext(source('auth-page.js'),context);
  return {get,requests,redirects,toggle,submit:()=>form.listeners.submit({preventDefault(){}})};
}
test('registration validates password confirmation before making any request',async()=>{
  const s=formPage({register:true});s.get('name').value='Ada';s.get('email').value='ada@example.com';
  s.get('password').value='a long password';s.get('confirmPassword').value='different password';await s.submit();
  assert.equal(s.requests.length,0);assert.match(s.get('confirmPasswordError').textContent,/do not match/);
});
test('registration rejects short passwords and trims identity fields only',async()=>{
  const s=formPage({register:true});s.get('name').value=' Ada ';s.get('email').value=' ada@example.com ';
  s.get('password').value='short';s.get('confirmPassword').value='short';await s.submit();assert.equal(s.requests.length,0);
  const password='  intentional spaces  ';s.get('password').value=password;s.get('confirmPassword').value=password;await s.submit();
  assert.equal(s.requests[0].body.name,'Ada');assert.equal(s.requests[0].body.email,'ada@example.com');
  assert.equal(s.requests[0].body.password,password);assert.equal(s.get('password').value,'');assert.equal(s.redirects[0],'/index.html');
});
test('pending login blocks duplicate requests and preserves input after a failure',async()=>{
  let finish;const s=formPage({respond:()=>new Promise((resolve,reject)=>{finish=reject;})});
  s.get('email').value='ada@example.com';s.get('password').value='test password';
  const pending=s.submit();await s.submit();assert.equal(s.requests.length,1);assert.equal(s.get('authSubmit').disabled,true);
  finish(new Error('Email or password is incorrect.'));await pending;
  assert.equal(s.get('authSubmit').disabled,false);assert.equal(s.get('password').value,'test password');
  assert.equal(s.get('authFeedback').textContent,'Email or password is incorrect.');assert.equal(s.redirects.length,0);
});
test('server error messages use text and duplicate emails identify the field',async()=>{
  const s=formPage({respond:async()=>{throw Object.assign(new Error('<img src=x onerror=alert(1)>'),{status:409});}});
  s.get('email').value='ada@example.com';s.get('password').value='test password';await s.submit();
  assert.equal(s.get('authFeedback').textContent,'<img src=x onerror=alert(1)>');
  assert.match(s.get('emailError').textContent,/already registered/);
});
test('password visibility toggles preserve the password value and label the action',()=>{
  const s=formPage();s.get('password').value='test password';s.toggle.listeners.click();
  assert.equal(s.get('password').type,'text');assert.equal(s.toggle.attrs['aria-label'],'Hide password');
  assert.equal(s.get('password').value,'test password');s.toggle.listeners.click();assert.equal(s.get('password').type,'password');
});
test('login and registration pages omit recovery controls and identify password autocomplete',()=>{
  const login=source('login.html'),register=source('register.html');
  assert.doesNotMatch(login+register,/forgot|reset.password/i);
  assert.match(login,/autocomplete="current-password"/);assert.match(register,/autocomplete="new-password"/);
});
