const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDFLib = require('../vendor/pdf-lib.min.js');
const source = fs.readFileSync(path.join(__dirname,'../resume.js'),'utf8');
const profile = {
  id:'jose',name:'José Muñoz',role:'Full Stack Developer',location:'Manila, Philippines',
  bio:'I build useful tools for people.',tags:['Java','JavaScript','SQL'],
  dealbreakers:['✅ Accessible interfaces','Clear documentation'],
  details:{fullBio:'Working student with an interest in thoughtful software.',email:'jose@example.com',
    github:'https://github.com/jose',linkedin:'https://linkedin.com/in/jose',
    projects:[{title:'Student Portal',desc:'Designed a responsive workspace with secure account access.'}]},
  accountEmail:'private-login@example.com',age:23,matchPercentage:'98%'
};
function setup(options = {}) {
  const requests=[],links=[],urls=[],timers=[];
  const user={id:'account-jose',profileId:'jose'};
  class BrowserURL extends URL {
    static createObjectURL(blob){urls.push(blob);return 'blob:resume-test';}
    static revokeObjectURL(){}
  }
  const window={PDFLib,RizzumeAccount:{user,expired(){window.expired=true;}}};
  const context={window,URL:BrowserURL,AbortController,Blob,
    setTimeout(callback){timers.push(callback);return timers.length;},clearTimeout(){},
    document:{baseURI:'http://localhost:8080/index.html',head:{appendChild(){}},body:{appendChild(){}},
      createElement(tag){const el={tag,click(){this.clicked=true;},remove(){this.removed=true;}};if(tag==='a')links.push(el);return el;}},
    async fetch(url,init){requests.push({url,...init});if(options.fetch)return options.fetch(url,init);
      return {ok:!options.status,status:options.status || 200,json:async()=>options.status?{message:'Export unavailable'}:profile};}
  };
  new Function(...Object.keys(context),source)(...Object.values(context));
  return {resume:window.RizzumeResume,window,requests,links,urls,timers};
}
function textFromPdf(pdf) {
  let result='';
  for(const page of pdf.getPages()) {
    const contents=page.node.lookup(PDFLib.PDFName.of('Contents'));
    const streams=contents instanceof PDFLib.PDFArray ? contents.asArray().map(ref=>pdf.context.lookup(ref)) : [contents];
    for(const stream of streams) {
      const operators=Buffer.from(PDFLib.decodePDFRawStream(stream).decode()).toString('latin1');
      for(const match of operators.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))result+=Buffer.from(match[1],'hex').toString('latin1')+'\n';
    }
  }
  return result;
}

test('resume is an A4 PDF with real saved content, accented names, links and no private account fields',async()=>{
  const {resume}=setup(),result=await resume.create(profile);
  assert.equal(Buffer.from(result.bytes).subarray(0,5).toString(),'%PDF-');
  const pdf=await PDFLib.PDFDocument.load(result.bytes),text=textFromPdf(pdf);
  assert.equal(pdf.getPageCount(),1);assert.equal(result.pageCount,1);
  assert.ok(Math.abs(pdf.getPage(0).getWidth()-595.28)<.01);
  assert.match(text,/José Muñoz/);assert.match(text,/JavaScript/);assert.match(text,/Student Portal/);
  assert.match(text,/jose@example.com/);assert.match(text,/Working student/);
  assert.match(text,/- Accessible interfaces/);
  assert.doesNotMatch(text,/private-login|98%|undefined|NaN/);
  assert.equal(pdf.getPage(0).node.lookup(PDFLib.PDFName.of('Annots')).size(),2);
  assert.equal(pdf.getTitle(),'José Muñoz - Resume');
});

test('a minimal profile omits empty sections and keeps a useful filename',async()=>{
  const {resume}=setup(),result=await resume.create({name:'Ada / Lovelace'});
  const text=textFromPdf(await PDFLib.PDFDocument.load(result.bytes));
  assert.match(text,/Ada \/ Lovelace/);assert.doesNotMatch(text,/SKILLS|PROJECTS|HIGHLIGHTS|LINKS|undefined/);
  assert.equal(result.filename,'Ada_Lovelace_Resume.pdf');
  assert.equal(resume.filename(' . '),'My_Portfolio_Resume.pdf');
  await assert.rejects(resume.create({name:'  '}),/Add your name/);
});

test('long projects paginate without dropping the final content or creating invalid page dimensions',async()=>{
  const {resume}=setup();
  const long={...profile,details:{...profile.details,projects:Array.from({length:10},(_,i)=>({title:'Project '+(i+1),desc:('Detailed contribution to a practical software project. '.repeat(30))+'END-'+(i+1)}))}};
  const result=await resume.create(long),pdf=await PDFLib.PDFDocument.load(result.bytes),text=textFromPdf(pdf);
  assert.ok(pdf.getPageCount()>2);assert.match(text,/END-10/);assert.match(text,/Project 10/);
  for(const page of pdf.getPages()){assert.equal(page.getWidth(),595.28);assert.equal(page.getHeight(),841.89);}
});

test('unsafe link protocols are excluded and very long web addresses are wrapped',async()=>{
  const {resume}=setup();
  const result=await resume.create({...profile,details:{github:'javascript:alert(1)',linkedin:'https://example.com/'+('a'.repeat(500))}});
  const pdf=await PDFLib.PDFDocument.load(result.bytes),text=textFromPdf(pdf);
  assert.doesNotMatch(text,/javascript:|alert\(1\)/);
  const annotations=pdf.getPages().reduce((count,page)=>count+(page.node.lookup(PDFLib.PDFName.of('Annots'))?.size() || 0),0);
  assert.ok(annotations>1);
});

function button(){return {textContent:'Download PDF',disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
test('download fetches the owned saved profile and creates a named PDF attachment',async()=>{
  const s=setup(),control=button();
  assert.equal(await s.resume.download(control),true);
  assert.equal(s.requests[0].url,'/api/me/profile');assert.equal(s.requests[0].credentials,'include');
  assert.equal(s.urls[0].type,'application/pdf');assert.ok(s.urls[0].size>100);
  assert.equal(s.links[0].download,'José_Muñoz_Resume.pdf');assert.equal(s.links[0].clicked,true);
  assert.equal(control.disabled,false);assert.equal(control.textContent,'Download PDF');
});

test('duplicate downloads are blocked and failures restore the download button without creating a file',async()=>{
  let fail;const s=setup({fetch:()=>new Promise((_,reject)=>{fail=reject;})}),control=button();
  const pending=s.resume.download(control);assert.equal(control.disabled,true);
  assert.equal(await s.resume.download(control),false);assert.equal(s.requests.length,1);
  fail(new Error('Connection failed'));await assert.rejects(pending,/Connection failed/);
  assert.equal(control.disabled,false);assert.equal(control.textContent,'Download PDF');assert.equal(s.links.length,0);
});

test('missing profiles and account changes never produce a PDF download',async()=>{
  const missing=setup();missing.window.RizzumeAccount.user.profileId=null;
  await assert.rejects(missing.resume.download(button()),/Create and save/);assert.equal(missing.requests.length,0);
  const changed=setup({fetch:async()=>({ok:true,status:200,json:async()=>({...profile,id:'another-profile'})})});
  await assert.rejects(changed.resume.download(button()),/account changed/);assert.equal(changed.links.length,0);
  const unauthorized=setup({status:401});await assert.rejects(unauthorized.resume.download(button()),/Export unavailable/);
  assert.equal(unauthorized.window.expired,true);assert.equal(unauthorized.links.length,0);
});
