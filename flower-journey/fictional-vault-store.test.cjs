'use strict';
// Run with Node.js and Playwright Chromium installed. All requests are fulfilled locally.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const artifacts=process.env.TEST_ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'flower-fictional-storage-tests');fs.mkdirSync(artifacts,{recursive:true});
const PASS='fictional storage passphrase only',WRONG='wrong fictional storage passphrase';
test('dedicated fictional IndexedDB integration',async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];let requests=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.forbidden=[];window.dbNames=[];
  for(const name of ['localStorage','sessionStorage','fetch','XMLHttpRequest','WebSocket','EventSource'])Object.defineProperty(window,name,{get(){forbidden.push(name);throw Error('Forbidden API')}});
  const factory=indexedDB,nativeOpen=factory.open.bind(factory),allowed='flower-journey-fictional-only-stage8-67c291de-92ac-4ec1-a837-18e81a43f992';
  factory.open=(name,...args)=>{dbNames.push(name);if(name!==allowed)throw Error('Forbidden DB');return nativeOpen(name,...args)};
  factory.deleteDatabase=()=>{throw Error('Database deletion prohibited')};factory.databases=()=>{throw Error('Database discovery prohibited')};
 });
 await page.route('**/*',route=>{
  requests++;const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!/^[\w.-]+$/.test(name))throw Error('Unexpected request');
  return route.fulfill({contentType:name.endsWith('.html')?'text/html':'application/javascript',body:fs.readFileSync(path.join(__dirname,name))});
 });
 await page.goto('https://fictional-storage.test/fictional-storage-lab.html');
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('準備できました'));
 const initialRequests=requests;
 await page.evaluate(async pass=>{
  window.labTest={};const x=labTest;x.boundary=FlowerClassDataBoundary.createBoundary();x.scope={classId:'tanpopo',schoolYear:2026,baseYear:2026};x.session=x.boundary.createSession({...x.scope,mode:'demo'});
  x.crypt=FlowerFictionalRosterCrypto.createDemoCrypto(x.boundary,x.session,x.scope);x.store=FlowerFictionalVaultStore.createStore(x.boundary,x.session,x.scope);
  x.records=FlowerFictionalRoster.make(x.scope);const input=JSON.stringify({format:FlowerFictionalRosterReadonlyAdapter.FORMAT,source:'fictional-json',...x.scope,storageKey:FlowerFriendRosterViewAdapter.legacyRosterKey(x.scope),rosterJSON:JSON.stringify(x.records)});
  x.a=(await x.crypt.encrypt(input,pass)).envelopeJSON;x.b=(await x.crypt.encrypt(input,pass)).envelopeJSON;
  x.raw=async(fn)=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open(FlowerFictionalVaultStore.DB_NAME,1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(Error())});try{return await new Promise((res,rej)=>{const tx=db.transaction('encrypted-packages','readwrite');let value;fn(tx.objectStore('encrypted-packages'),v=>{value=v});tx.oncomplete=()=>res(value);tx.onabort=()=>rej(Error())})}finally{db.close()}};
 },PASS);
 await t.test('save commits and readback contains only the exact encrypted package',async()=>{
  assert(await page.evaluate(async pass=>{const x=labTest;await x.store.save(x.a,pass);return await x.store.readEncrypted()===x.a},PASS));
  assert(await page.evaluate(async()=>{const rows=await labTest.raw((s,done)=>{const q=s.getAll();q.onsuccess=()=>done(q.result)});return rows.length===1&&rows[0]===labTest.a&&!rows[0].includes('架空 はな')&&!rows[0].includes('FJREC1-')}));
 });
 await t.test('wrong password and damaged ciphertext refuse save without replacing good data',async()=>{
  assert(await page.evaluate(async({pass,wrong})=>{const x=labTest;let count=0;for(const [text,pw]of [[x.b,wrong],[x.b.replace('"version":1','"version":2'),pass],['{',pass]]){try{await x.store.save(text,pw,x.a)}catch{count++}}const broken=JSON.parse(x.b);broken.data.ciphertext='A'+broken.data.ciphertext.slice(1);if(JSON.stringify(broken)===x.b)broken.data.ciphertext='B'+broken.data.ciphertext.slice(1);try{await x.store.save(JSON.stringify(broken),pass,x.a)}catch{count++}return count===4&&await x.store.readEncrypted()===x.a},{pass:PASS,wrong:WRONG}));
 });
 await t.test('transaction abort after put protects the previously committed package',async()=>{
  assert(await page.evaluate(async pass=>{const x=labTest,original=IDBObjectStore.prototype.put;let failed=false;try{IDBObjectStore.prototype.put=function(...args){const q=original.apply(this,args);this.transaction.abort();return q};try{await x.store.save(x.b,pass,x.a)}catch{failed=true}}finally{IDBObjectStore.prototype.put=original}return failed&&await x.store.readEncrypted()===x.a},PASS));
 });
 await t.test('stale or competing update cannot overwrite a newer package',async()=>{
  assert(await page.evaluate(async pass=>{const x=labTest;await x.store.save(x.b,pass,x.a);let denied=false;try{await x.store.save(x.a,pass,x.a)}catch{denied=true}return denied&&await x.store.readEncrypted()===x.b},PASS));
 });
 await t.test('all six classes and two years reject a package from a different scope',async()=>{
  assert(await page.evaluate(async pass=>{let rejected=0;for(const classId of FlowerClassDataBoundary.CLASS_IDS)for(const schoolYear of [2026,2027]){if(classId==='tanpopo'&&schoolYear===2026)continue;const b=FlowerClassDataBoundary.createBoundary(),scope={classId,schoolYear,baseYear:schoolYear},s=b.createSession({...scope,mode:'demo'}),store=FlowerFictionalVaultStore.createStore(b,s,scope);if(await store.readEncrypted()!==null)return false;try{await store.save(labTest.a,pass)}catch{rejected++}}return rejected===11},PASS));
 });
 await t.test('scope/version mismatch or corrupt stored JSON refuses read and never decrypts as empty',async()=>{
  assert(await page.evaluate(async()=>{const x=labTest,key=JSON.stringify(['tanpopo',2026,1]);let rejected=0;for(const text of ['{',JSON.stringify({...JSON.parse(x.b),classId:'sakura'}),JSON.stringify({...JSON.parse(x.b),schoolYear:2027}),JSON.stringify({...JSON.parse(x.b),version:2})]){await x.raw(s=>s.put(text,key));try{await x.store.readEncrypted()}catch{rejected++}}await x.raw(s=>s.put(x.b,key));return rejected===4}));
 });
 await t.test('explicit deletion confirmation is required and other scopes survive',async()=>{
  assert(await page.evaluate(async()=>{const x=labTest;let denied=false;try{await x.store.remove(x.b,'')}catch{denied=true}const b=FlowerClassDataBoundary.createBoundary(),scope={classId:'sakura',schoolYear:2026,baseYear:2026},s=b.createSession({...scope,mode:'demo'}),store=FlowerFictionalVaultStore.createStore(b,s,scope);await store.remove(undefined,FlowerFictionalVaultStore.CONFIRM_DELETE);return denied&&await x.store.readEncrypted()===x.b}));
 });
 await t.test('invalid year and revoked session fail before DB access',async()=>{
  assert(await page.evaluate(async pass=>{const x=labTest;let rejected=0;try{FlowerFictionalVaultStore.createStore(x.boundary,x.session,{...x.scope,schoolYear:NaN})}catch{rejected++}x.boundary.invalidate();const n=dbNames.length;for(const fn of [()=>x.store.readEncrypted(),()=>x.store.save(x.a,pass),()=>x.store.remove(undefined,FlowerFictionalVaultStore.CONFIRM_DELETE)])try{await fn()}catch{rejected++}return rejected===4&&dbNames.length===n},PASS));
 });
 async function click(id,fields,expected){for(const [key,value]of Object.entries(fields))await page.locator('#'+key).fill(value);await page.locator('#'+id).click();await page.waitForFunction(()=>!document.querySelector('#prepare').disabled);assert((await page.locator('#status').innerText()).includes(expected))}
 await t.test('real UI restores after reload and rejects wrong passphrase',async()=>{
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#restore').disabled);
  await click('restore',{year:'2026',pass:WRONG},'拒否');await click('restore',{pass:PASS},'復元成功');
 });
 await t.test('390px and 1366px UI saves candidates and requires explicit deletion',async()=>{
  for(const width of [390,1366]){await page.setViewportSize({width,height:900});await click('prepare',{pass:PASS},'暗号化成功');assert.equal(await page.locator('#issued').getAttribute('type'),'password');await click('save',{pass:PASS},'保存成功');assert(await page.locator('#remove').isDisabled());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifacts,`storage-${width}.png`),fullPage:true});}
  await page.locator('#confirmDelete').check();await click('remove',{},'削除しました');await click('restore',{pass:PASS},'ありません');
 });
 await t.test('only test DB is accessed, with no storage secrets or operation network',async()=>{
  const audit=await page.evaluate(()=>({forbidden,dbNames}));assert.deepEqual(audit.forbidden,[]);assert(audit.dbNames.length>0);assert(audit.dbNames.every(n=>n==='flower-journey-fictional-only-stage8-67c291de-92ac-4ec1-a837-18e81a43f992'));assert.deepEqual(errors,[]);
  // One deliberate reload loads the same eight local assets again. No operation requests.
  assert.equal(requests,initialRequests*2);
 });
 }finally{await browser.close()}
});
