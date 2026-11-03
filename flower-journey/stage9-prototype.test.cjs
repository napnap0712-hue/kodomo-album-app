'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const DB='flower-journey-stage9-fictional-only-8fe8913a-0632-4f66-91ec-bfcd761e5028',PASS='fictional stage nine testing passphrase',WRONG='wrong fictional stage nine passphrase';
const artifacts=process.env.TEST_ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'flower-stage9');fs.mkdirSync(artifacts,{recursive:true});
test('Stage 9 fictional prototype',async t=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[],logs=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>logs.push(m.text()));
  await page.addInitScript(()=>{
   if(window!==top)return;window.dbAudit=[];window.forbidden=[];window.protocol=[];addEventListener('message',e=>{protocol.push({type:e.data?.type,stage:e.data?.stage})});
   const native=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{dbAudit.push(name);if(name!=='flower-journey-stage9-fictional-only-8fe8913a-0632-4f66-91ec-bfcd761e5028')throw Error('Other DB forbidden');return native(name,...args)};
   indexedDB.databases=()=>{throw Error('DB discovery forbidden')};indexedDB.deleteDatabase=()=>{throw Error('DB deletion forbidden')};
   for(const key of ['localStorage','sessionStorage','XMLHttpRequest','WebSocket','EventSource'])Object.defineProperty(window,key,{get(){forbidden.push(key);throw Error('Forbidden')}});
  });
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());requests.push(u.href);
   if(u.origin!=='https://stage9.test'||!u.pathname.startsWith('/flower-journey/')||u.search)throw Error('Unexpected request');
   const file=path.join(__dirname,decodeURIComponent(u.pathname).slice('/flower-journey/'.length));
   if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file))throw Error('Missing asset '+u.pathname);
   return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'application/octet-stream'});
  });
  const visit=async()=>{await page.goto('https://stage9.test/flower-journey/stage9-entry.html');await page.frameLocator('#entry').locator('.character').first().waitFor();await page.waitForFunction(()=>document.querySelector('#notice').hidden)};
  const entry=()=>page.frameLocator('#entry');
  async function choose(index){await entry().locator('.character').nth(index).click();await entry().locator('#form .go').waitFor();await entry().locator('#form .go').evaluate(async b=>{while(b.disabled)await new Promise(r=>setTimeout(r,20))})}
  async function submit(secret){await entry().locator('#password').fill(secret);await entry().locator('#form .go').click()}
  async function logout(){await page.locator('#logout').click();await page.waitForFunction(()=>document.querySelector('#notice').hidden);assert(await page.locator('#mapView').evaluate(e=>e.hidden))}
  async function slots(){return page.evaluate(async()=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open(FlowerStage9Vault.DB_NAME,1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(Error())});try{return await new Promise((res,rej)=>{const tx=db.transaction(['pending-packages','confirmed-packages'],'readonly');let a,p;const qa=tx.objectStore('confirmed-packages').getAll(),qp=tx.objectStore('pending-packages').getAll();qa.onsuccess=()=>a=qa.result;qp.onsuccess=()=>p=qp.result;tx.oncomplete=()=>res({active:a,pending:p});tx.onabort=()=>rej(Error())})}finally{db.close()}})}
  await visit();
  for(let i=0;i<6;i++)await t.test(`${width}px class ${i+1}: setup, recovery acknowledgement, wrong password, logout and unlock`,async()=>{
   await choose(i);assert((await entry().locator('#message').innerText()).includes('初回設定'));
   await submit('1234');assert((await entry().locator('#message').innerText()).includes('16文字以上'));assert(await page.locator('#mapView').evaluate(e=>e.hidden));
   if(i===0){
    await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const q=originalPut.apply(this,args);this.transaction.abort();return q}});
    await submit(PASS);await entry().locator('#message').filter({hasText:'初回保存を確認できません'}).waitFor();await page.evaluate(()=>{IDBObjectStore.prototype.put=originalPut;delete window.originalPut});assert.deepEqual(await slots(),{active:[],pending:[]});assert(await page.locator('#mapView').evaluate(e=>e.hidden));
   }
   await submit(PASS);await entry().locator('#recoveryPanel').waitFor({state:'visible'});
   const recovery=await entry().locator('#issuedKey').inputValue();assert(recovery.startsWith('FJREC1-'));assert(await page.locator('#mapView').evaluate(e=>e.hidden));
   await entry().locator('#ack').click();assert(await page.locator('#mapView').evaluate(e=>e.hidden));
   if(i===0){
    await page.reload();await page.waitForFunction(()=>document.querySelector('#notice').hidden);await choose(i);assert((await entry().locator('#message').innerText()).includes('未完了'));
    await submit(PASS);await entry().locator('#resumeArea').waitFor({state:'visible'});await entry().locator('#recorded').check();await entry().locator('#recoverySecret').fill('FJREC1-wrong');await entry().locator('#ack').click();await entry().locator('#recoveryMessage').filter({hasText:'確定ができません'}).waitFor();assert(await page.locator('#mapView').evaluate(e=>e.hidden));
    await entry().locator('#recoverySecret').fill(recovery);
   }
   await entry().locator('#recorded').check();
   if(i===0){
    const before=await slots();await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const q=originalPut.apply(this,args);if(this.name==='confirmed-packages')this.transaction.abort();return q}});
    await entry().locator('#ack').click();await entry().locator('#recoveryMessage').filter({hasText:'確定ができません'}).waitFor();
    await page.evaluate(()=>{IDBObjectStore.prototype.put=originalPut;delete window.originalPut});assert.deepEqual(await slots(),before);assert(await page.locator('#mapView').evaluate(e=>e.hidden));
    await entry().locator('#recoverySecret').fill(recovery);
   }
   await entry().locator('#ack').click();await page.locator('#mapView.visible').waitFor();
   let s=await slots();assert.equal(s.pending.length,0);assert.equal(s.active.length,i+1);for(const text of s.active){assert(!text.includes(PASS));assert(!text.includes(recovery));assert(!text.includes('架空 はな'))}
   const original=s.active.slice().sort();await logout();await choose(i);await submit(WRONG);await entry().locator('#message').filter({hasText:'解除できません'}).waitFor();assert(await page.locator('#mapView').evaluate(e=>e.hidden));assert.deepEqual((await slots()).active.slice().sort(),original);
   await submit(PASS);await page.locator('#mapView.visible').waitFor();
   assert.deepEqual(await page.frameLocator('#map').locator('body').evaluate(()=>{let local=false,idb=false;try{localStorage.getItem('forbidden')}catch{local=true}try{indexedDB.open('forbidden')}catch{idb=true}return {local,idb}}),{local:true,idb:true});
   if(i===0){await page.screenshot({path:path.join(artifacts,`stage9-map-${width}.png`)});}
   await logout();
  });
  await t.test(`${width}px reload requires unlock and games/registration stay connected`,async()=>{
   await page.reload();await page.waitForFunction(()=>document.querySelector('#notice').hidden);assert(await page.locator('#mapView').evaluate(e=>e.hidden));await choose(0);assert((await entry().locator('#message').innerText()).includes('設定した'));
   await page.screenshot({path:path.join(artifacts,`stage9-password-${width}.png`)});await submit(PASS);await page.locator('#mapView.visible').waitFor();const map=page.frameLocator('#map');
   await map.locator('#friendButton').click();await page.locator('#friendRegistration:not([hidden])').waitFor();const friend=page.frameLocator('#friendRegistration');const back=friend.locator('button').filter({hasText:'マップへ'});await back.click();await page.locator('#friendRegistration[hidden]').waitFor({state:'attached'});
   for(const title of ['写真追加','おもいでキャッチ！','おもいで間違い探し！']){
    t.diagnostic(`${width}px game: ${title}`);await map.locator(`.tap[data-title="${title}"]`).click();await map.locator('#stagePanel').waitFor({state:'visible'});const guide=map.frameLocator('#stageFrame');await guide.locator('#start, #cta').waitFor({state:'attached'});const skip=guide.locator('#skip');if(await skip.count())await skip.click();await guide.locator('#start, #cta').click({timeout:40000});await page.locator('#demoGame:not([hidden])').waitFor();const game=page.frameLocator('#demoGame');
    if(title==='写真追加'){await game.locator('#add').click();await game.locator('#ai').click();await game.locator('#backHome').waitFor({state:'visible',timeout:15000});await game.locator('#backHome').click()}
    else{await game.locator('body').evaluate(()=>{window.lastClick=null;addEventListener('click',e=>{window.lastClick=e.target.id},true)});await game.locator('#back').click();assert.equal(await game.locator('body').evaluate(()=>window.lastClick),'back')}
    try{await page.locator('#demoGame[hidden]').waitFor({state:'attached'})}catch(error){await page.screenshot({path:path.join(artifacts,`failure-${width}.png`)});throw Error(`Return did not finish: ${title}; ${await page.locator('#status').innerText()}; protocol ${JSON.stringify(await page.evaluate(()=>protocol.slice(-10)))}`)}assert(await map.locator('#stagePanel').evaluate(e=>e.hidden));
   }
   await logout();
  });
  await t.test(`${width}px boundary, class/year substitution, tamper, expired session and stale confirmation`,async()=>{
   assert(await page.evaluate(async pass=>{
    let rejected=0;const boundary=FlowerClassDataBoundary.createBoundary(),scope={classId:'tanpopo',schoolYear:2026,baseYear:2026},session=boundary.createSession({...scope,mode:'demo'}),vault=FlowerStage9Vault.createVault(boundary,session,scope),crypt=FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),slot=await vault.read();
    for(const other of [{...scope,schoolYear:2027},{...scope,baseYear:2027}])try{FlowerStage9Vault.createVault(boundary,session,other)}catch{rejected++}
    const wrong=FlowerClassDataBoundary.createBoundary(),ws=wrong.createSession({classId:'sakura',schoolYear:2026,mode:'demo'}),other=FlowerStage9Vault.createVault(wrong,ws,{...scope,classId:'sakura'});try{await other.savePending(slot.envelopeJSON,pass)}catch{rejected++}
    try{await vault.savePending(slot.envelopeJSON,pass)}catch{rejected++}
    try{await vault.confirmRecovery(slot.envelopeJSON,'FJREC1-wrong')}catch{rejected++}
    const e=JSON.parse(slot.envelopeJSON);e.auth.tag=(e.auth.tag[0]==='A'?'B':'A')+e.auth.tag.slice(1);try{await crypt.decryptWithPassphrase(JSON.stringify(e),pass)}catch{rejected++}
    boundary.invalidate();try{await vault.read()}catch{rejected++}
    try{boundary.createSession({...scope,mode:'local-unlock'})}catch{rejected++}
    return rejected===8;
   },PASS));
  });
  await t.test(`${width}px adopted CSS/art, scopes, DB isolation and secrets`,async()=>{
   const adopted=fs.readFileSync(path.join(__dirname,'class-entry-password-v8.html'),'utf8');const css=[...adopted.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[1]);const actual=await entry().locator('style').allTextContents();assert.deepEqual(actual,css);
   assert.equal(await entry().locator('.character').count(),6);assert.equal(await entry().locator('.art').getAttribute('src'),'assets/class-entry-art.png');
   const audit=await page.evaluate(()=>({dbAudit,forbidden}));assert.deepEqual(audit.forbidden,[]);assert(audit.dbAudit.length>0);assert(audit.dbAudit.every(n=>n===DB));assert.deepEqual(errors,[]);assert(!logs.some(s=>s.includes(PASS)||s.includes('FJREC1-')));assert(requests.every(s=>!s.includes(PASS)&&!s.includes('FJREC1-')));
   const s=await slots();assert.equal(s.active.length,6);assert.equal(s.pending.length,0);
  });
  await context.close();
 }}finally{await browser.close()}
});
