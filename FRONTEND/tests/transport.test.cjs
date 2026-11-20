const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const transport=fs.readFileSync(path.join(__dirname,'../transport.js'),'utf8');
function setup(href='http://localhost:8081/login.html') {
  const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,
    window:{location:{href,origin:new URL(href).origin}},document:{body:{dataset:{}}}});
  vm.runInContext(transport,context);return {context,http:context.window.RizzumeHTTP};
}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>typeof body==='string'?body:JSON.stringify(body)});

test('bundled member photos resolve old gallery JPGs and current PNGs to the updated assets',()=>{
  const {http}=setup();
  for(const name of ['chee','greg','dave','justin']){
    const current=http.profileImage('/images/'+name+'.png');
    assert.match(current,new RegExp('^/images/'+name+'\\.png\\?v=[a-f0-9]{12}$'));
    assert.equal(http.profileImage('/images/'+name+'.jpg'),current);
    assert.equal(http.profileImage('/images/'+name+'.jpg?v=old'),current);
    assert.equal(http.profileImage('images/'+name+'.jpg'),current.slice(1));
  }
});

test('member photo compatibility leaves uploaded photos and external URLs unchanged',()=>{
  const {http}=setup();
  for(const value of ['/api/images/123','https://example.com/images/chee.jpg','/images/another-member.jpg','',null])
    assert.equal(http.profileImage(value),value);
});
test('ngrok page API requests get the warning header and JSON negotiation',()=>{
  for(const host of ['demo.ngrok-free.dev','demo.ngrok-free.app','demo.ngrok.io','demo.ngrok.app']) {
    const {http}=setup('https://'+host+'/login.html');
    const headers=http.headers('/api/auth/login',{'Content-Type':'application/json'});
    assert.equal(headers['ngrok-skip-browser-warning'],'1');assert.equal(headers.Accept,'application/json');
    assert.equal(headers['Content-Type'],'application/json');
  }
});
test('a separately configured ngrok API is detected without adding tunnel headers to unrelated hosts',()=>{
  const {http}=setup();
  assert.equal(http.headers('https://api.ngrok-free.dev/api/auth/me')['ngrok-skip-browser-warning'],'1');
  assert.equal(http.headers('/api/auth/me')['ngrok-skip-browser-warning'],undefined);
  assert.equal(http.headers('https://ngrok-free.dev.attacker.example/api')['ngrok-skip-browser-warning'],undefined);
  assert.equal(http.headers('/api/team',{'X-Team-Key':'test-key'})['X-Team-Key'],'test-key');
});
test('warning pages, unreachable backends and missing API routes receive useful diagnostics',async()=>{
  const {http}=setup();
  await assert.rejects(http.accountJson(response('<html>ERR_NGROK_6024 You are about to visit</html>')),/Visit Site/);
  await assert.rejects(http.accountJson(response('<html>ERR_NGROK_8012</html>',502)),/cannot reach Spring Boot/);
  await assert.rejects(http.accountJson(response('<html>Not Found</html>',404)),/Spring Boot port/);
  await assert.rejects(http.accountJson(response({message:'Not found'},404)),error=>error.status===404&&/account API/.test(error.message));
});
test('real authentication results and password errors are preserved',async()=>{
  const {http}=setup();
  const signedIn=await http.accountJson(response({authenticated:true,user:{id:'user'}}));assert.equal(signedIn.user.id,'user');
  assert.equal((await http.accountJson(response({authenticated:false}))).authenticated,false);
  await assert.rejects(http.accountJson(response({message:'Email or password is incorrect.'},401)),error=>error.status===401&&error.message==='Email or password is incorrect.');
});
test('login sends its warning bypass header, JSON body and session cookies through the shared transport',async()=>{
  const {context}=setup('https://demo.ngrok-free.dev/login.html');const requests=[];
  context.fetch=async(url,init)=>{requests.push({url,...init});return response(init.headers['ngrok-skip-browser-warning']==='1'?{authenticated:true,user:{id:'user'}}:'<html>ERR_NGROK_6024</html>');};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../account.js'),'utf8'),context);
  const result=await context.window.RizzumeAccount.request('/login','POST',{email:'test@example.com',password:'test password'});
  assert.equal(result.authenticated,true);assert.equal(requests[0].url,'/api/auth/login');
  assert.equal(requests[0].credentials,'include');assert.equal(requests[0].headers['Content-Type'],'application/json');
  assert.equal(JSON.parse(requests[0].body).email,'test@example.com');
});
test('every application page loads the transport before account or collaboration scripts',()=>{
  for(const name of ['index.html','login.html','register.html','CHEE.html','DAPOG.html','FONTELAR.html','VILLANUEVA.html','team-inbox.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
    const index=html.indexOf('src="transport.js');assert.ok(index>=0,name);
    const consumer=html.indexOf('src="account.js')>=0?html.indexOf('src="account.js'):html.indexOf('src="team-inbox.js');
    assert.ok(index<consumer,name);
  }
});
