// Create an isolated browser fixture under the local server's build output.
// The fixture intercepts all API fetches; it cannot change real accounts or messages.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const target = path.resolve(root,'../BACKEND/target/classes/static');
fs.mkdirSync(target,{recursive:true});
for (const name of fs.readdirSync(root)) if (/\.(?:css|js)$/.test(name)) fs.copyFileSync(path.join(root,name),path.join(target,name));
fs.cpSync(path.join(root,'vendor'),path.join(target,'vendor'),{recursive:true});
const html = fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace('<script src="account.js','<script src="workspace-fixture.js"></script><script src="account.js')
  .replace('<title>','<title>Isolated preview — ');
fs.writeFileSync(path.join(target,'workspace.fixture.html'),html);
fs.copyFileSync(path.join(__dirname,'workspace-fixture.js'),path.join(target,'workspace-fixture.js'));
console.log('Preview: http://localhost:8080/workspace.fixture.html?state=empty');
console.log('States: empty, fresh, filled, error, thread-error, loading, inbox-loading. Remove the two generated fixture files after checking.');
