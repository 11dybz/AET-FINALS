const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../profile.js'),'utf8');

test('profile connection state updates preserve dock icons and update the full button label',async()=>{
  function control(withLabel=false){
    const icon={},label=withLabel?{textContent:'Get In Touch'}:null;
    return {icon,label,attrs:{},setAttribute(name,value){this.attrs[name]=value;},
      querySelector(selector){return selector==='span'?this.label:this.icon;},
      set textContent(value){this.icon=null;this.label=null;this.replacement=value;}};
  }
  const controls=[control(),control(),control(true)];
  const icons=controls.map(control=>control.icon);
  const context=vm.createContext({id:'member',relationship:null,window:{RizzumeAccount:{user:null}},
    document:{querySelectorAll:()=>controls,addEventListener(){}}});
  vm.runInContext(source.slice(source.indexOf('  const accountReady ='),source.indexOf('  const sections =')),context);
  await Promise.resolve();
  for(const [relationship,label] of [
    [null,'Send connection request'],
    [{status:'pending',direction:'outgoing'},'View sent request'],
    [{status:'pending',direction:'incoming'},'Review connection request'],
    [{status:'accepted'},'Message connection']
  ]){
    context.relationship=relationship;vm.runInContext('syncOwnProfileActions()',context);
    controls.forEach((control,index)=>{assert.equal(control.icon,icons[index]);assert.equal(control.attrs['aria-label'],label);assert.equal(control.title,label);assert.equal(control.hidden,false);});
    assert.equal(controls[2].label.textContent,label);
    assert.equal(controls[0].replacement,undefined);assert.equal(controls[1].replacement,undefined);
  }
  context.window.RizzumeAccount.user={profileId:'member'};vm.runInContext('syncOwnProfileActions()',context);
  assert.ok(controls.every(control=>control.hidden));
});
