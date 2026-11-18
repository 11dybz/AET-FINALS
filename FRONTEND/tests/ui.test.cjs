const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const context=vm.createContext({window:{},document:{
    createElement:()=>({textContent:'',children:[],appendChild(child){this.children.push(child);}}),
    createTextNode:text=>({textContent:text})
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8'),context);
  return {ui:context.window.RizzumeUI, element:{textContent:'',children:[],appendChild(child){this.children.push(child);}}};
}
test('shared map messages have a safe clickable map link',()=>{
  const {ui,element}=setup();
  ui.messageBody(element,'My approximate location: https://www.openstreetmap.org/?mlat=14.600&mlon=120.984#map=15/14.600/120.984');
  assert.equal(element.textContent,'My approximate location: ');
  assert.equal(element.children[0].target,'_blank');
  assert.equal(element.children[0].rel,'noopener noreferrer');
  assert.match(element.children[0].href,/^https:\/\/www.openstreetmap.org\//);
});
test('message HTML and non-map URLs stay plain text',()=>{
  const {ui,element}=setup();
  const input='<img src=x onerror=alert(1)> javascript:alert(1) https://untrusted.example';
  ui.messageBody(element,input); assert.equal(element.textContent,input); assert.equal(element.children.length,0);
});
test('coordinates in the southern and western hemispheres are preserved',()=>{
  const {ui,element}=setup();
  ui.messageBody(element,'https://www.openstreetmap.org/?mlat=-33.448&mlon=-70.669#map=15/-33.448/-70.669');
  assert.match(element.children[0].href,/-33.448/); assert.match(element.children[0].href,/-70.669/);
});
