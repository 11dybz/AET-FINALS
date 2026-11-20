const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../profile.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('  const passSexLabels ='),source.indexOf('  const accountReady =')),context);
test('Bastos Pass uses the requested labels for the four members and the saved profile age',()=>{
  for(const [id,sex] of Object.entries({'chee-reynaldo':'bawal pa','dapog-john-greg':'pag gabi pa','fontelar-dave':'sige sige','villanueva-justin':'chocolates nalang'})){
    const info=context.passDemographics({id,age:24,sex:'Male'});assert.equal(info.sex,sex);assert.equal(info.age,'24');
  }
});
test('other passes use supplied sex information without guessing missing values',()=>{
  assert.equal(context.passDemographics({id:'another',age:25,sex:'Female'}).sex,'Female');
  assert.equal(context.passDemographics({id:'another',age:25,details:{sex:'Male'}}).sex,'Male');
  assert.equal(context.passDemographics({id:'another'}).sex,'Not specified');
  assert.equal(context.passDemographics({id:'another',age:-1}).age,'Not specified');
});
