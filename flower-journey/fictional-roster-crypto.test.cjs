'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const boundaryAPI=require('./class-data-boundary.js'),views=require('./friend-roster-view-adapter.js'),readers=require('./fictional-roster-readonly-adapter.js'),fixture=require('./fictional-roster-fixture.js');
const api=require('./fictional-roster-crypto.js');
const PASS='fictional passphrase for stage five';
function setup(extra={},cryptoAPI=api){
 const boundary=boundaryAPI.createBoundary(),scope={classId:'tanpopo',schoolYear:2026,baseYear:2026,...extra},session=boundary.createSession({...scope,mode:'demo'}),records=fixture.make(scope);
 const input=JSON.stringify({format:readers.FORMAT,source:readers.SOURCE,...scope,storageKey:views.legacyRosterKey(scope),rosterJSON:JSON.stringify(records)});
 return {boundary,session,scope,records,input,service:cryptoAPI.createDemoCrypto(boundary,session,scope)};
}
function flip(text){const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));bytes[0]^=1;return btoa(String.fromCharCode(...bytes))}
function sandboxAPI(cryptoOverride){
 const accesses=[],sandbox={module:{exports:{}},crypto:cryptoOverride||globalThis.crypto,TextEncoder,TextDecoder,atob,btoa,require:path=>{
  if(path==='./friend-roster-view-adapter.js')return views;if(path==='./fictional-roster-readonly-adapter.js')return readers;throw Error('Unexpected dependency '+path);
 }};
 for(const key of ['localStorage','indexedDB','sessionStorage','document','fetch','navigator','XMLHttpRequest','FileReader'])Object.defineProperty(sandbox,key,{get(){accesses.push(key);throw Error('Forbidden '+key)}});
 vm.runInNewContext(fs.readFileSync(require.resolve('./fictional-roster-crypto.js'),'utf8'),sandbox);return {api:sandbox.module.exports,accesses};
}
function overrideSubtle(changes){return {getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto),subtle:new Proxy(globalThis.crypto.subtle,{get(target,key){return changes[key]||target[key].bind(target)}})}}
test('format explicitly fixes native PBKDF2-SHA256 600000, AES-GCM-256 and 128-bit tags',async()=>{
 const f=setup(),sealed=await f.service.encrypt(f.input,PASS),e=f.service.validateEnvelope(sealed.envelopeJSON);
 assert.equal(e.format,api.FORMAT);assert.equal(e.version,1);assert.deepEqual(e.algorithms,{data:'AES-GCM',wrap:'AES-GCM',integrity:'AES-GCM',keyBits:256,tagBits:128});
 assert.deepEqual({...e.kdf,salt:null},{name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:null});assert.equal(atob(e.kdf.salt).length,16);
 assert.equal(atob(e.data.iv).length,12);assert.equal(atob(e.wrappedKeys.passphrase.ciphertext).length,48);assert.equal(atob(e.wrappedKeys.recovery.ciphertext).length,48);assert(Object.isFrozen(e.wrappedKeys));
});
test('round trip preserves exact IDs, formal names, photos and nested unknown JSON fields',async()=>{
 const f=setup();f.records[0].extra.deep={unknown:[null,true,8,{keep:'unchanged'}]};f.records[0].name=' 架空 正式名 ';
 const source=JSON.parse(f.input);source.rosterJSON=JSON.stringify(f.records);const input=JSON.stringify(source),before=input;
 const sealed=await f.service.encrypt(input,PASS),result=await f.service.decryptWithPassphrase(sealed.envelopeJSON,PASS);
 assert.deepEqual(result,f.records);assert.equal(input,before);assert(Object.isFrozen(result[0].extra.deep));
});
test('all six classes and both years independently encrypt and decrypt without changing key rules',async()=>{
 for(const classId of boundaryAPI.CLASS_IDS)for(const schoolYear of [2026,2027]){
  const f=setup({classId,schoolYear}),s=await f.service.encrypt(f.input,PASS);assert.deepEqual(await f.service.decryptWithPassphrase(s.envelopeJSON,PASS),f.records);
  assert.equal(f.service.validateEnvelope(s.envelopeJSON).storageKey,views.legacyRosterKey(f.scope));
 }
});
test('independent recovery key decrypts without the passphrase and does not change the envelope',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS),before=s.envelopeJSON;
 assert.match(s.recoveryKey,/^FJREC1-[A-Za-z0-9_-]{43}$/);assert.deepEqual(await f.service.decryptWithRecoveryKey(s.envelopeJSON,s.recoveryKey),f.records);assert.equal(s.envelopeJSON,before);
 assert(!s.envelopeJSON.includes(s.recoveryKey));assert(!s.envelopeJSON.includes(PASS));assert(!s.envelopeJSON.includes('架空'));
});
test('wrong passphrase, wrong recovery key and malformed recovery secret are rejected',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS),other=await f.service.encrypt(f.input,PASS);
 await assert.rejects(f.service.decryptWithPassphrase(s.envelopeJSON,'wrong fictional passphrase long enough'));
 await assert.rejects(f.service.decryptWithRecoveryKey(s.envelopeJSON,other.recoveryKey));
 await assert.rejects(f.service.decryptWithRecoveryKey(s.envelopeJSON,'1234'));
});
test('1234 and weak/invalid passphrases cannot encrypt or unlock a package',async()=>{
 const f=setup();for(const p of ['1234','short','                ',null,undefined,'x'.repeat(1025),'x'.repeat(16)+'\ud800'])await assert.rejects(f.service.encrypt(f.input,p));
 const s=await f.service.encrypt(f.input,PASS);await assert.rejects(f.service.decryptWithPassphrase(s.envelopeJSON,'1234'));
});
test('class/year mismatch is rejected using the external expected scope',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS);
 for(const extra of [{classId:'tulip'},{schoolYear:2027}]){const other=setup(extra);assert.throws(()=>other.service.validateEnvelope(s.envelopeJSON));await assert.rejects(other.service.decryptWithPassphrase(s.envelopeJSON,PASS));await assert.rejects(other.service.decryptWithRecoveryKey(s.envelopeJSON,s.recoveryKey))}
});
test('data, both key wrappers, IVs and salt tampering are detected on BOTH unlock paths',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS);
 const mutations=[e=>e.data.ciphertext=flip(e.data.ciphertext),e=>e.data.iv=flip(e.data.iv),e=>e.wrappedKeys.passphrase.ciphertext=flip(e.wrappedKeys.passphrase.ciphertext),e=>e.wrappedKeys.passphrase.iv=flip(e.wrappedKeys.passphrase.iv),e=>e.wrappedKeys.recovery.ciphertext=flip(e.wrappedKeys.recovery.ciphertext),e=>e.wrappedKeys.recovery.iv=flip(e.wrappedKeys.recovery.iv),e=>e.kdf.salt=flip(e.kdf.salt),e=>e.auth.iv=flip(e.auth.iv),e=>e.auth.tag=flip(e.auth.tag)];
 for(const mutate of mutations){const e=JSON.parse(s.envelopeJSON);mutate(e);const damaged=JSON.stringify(e);await assert.rejects(f.service.decryptWithPassphrase(damaged,PASS));await assert.rejects(f.service.decryptWithRecoveryKey(damaged,s.recoveryKey))}
});
test('format, source, key rules, algorithms and KDF changes fail closed before expensive derivation',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS);
 for(const mutate of [e=>e.version=2,e=>e.source='real',e=>e.classId='tulip',e=>e.schoolYear=2027,e=>e.baseYear=2025,e=>e.storageKey+='-year-2026',e=>e.algorithms.tagBits=96,e=>e.kdf.iterations=1,e=>e.kdf.iterations=999999999,e=>e.kdf.hash='SHA-1',e=>e.extra=true,e=>e.data.iv=e.wrappedKeys.passphrase.iv,e=>e.data.ciphertext='invalid']){
  const e=JSON.parse(s.envelopeJSON);mutate(e);assert.throws(()=>f.service.validateEnvelope(JSON.stringify(e)));
 }
 for(const text of ['{','null','{}','[]'])assert.throws(()=>f.service.validateEnvelope(text));
});
test('swapping wrapping roles is rejected; JSON field reordering is harmless',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS),e=JSON.parse(s.envelopeJSON);
 [e.wrappedKeys.passphrase,e.wrappedKeys.recovery]=[e.wrappedKeys.recovery,e.wrappedKeys.passphrase];await assert.rejects(f.service.decryptWithPassphrase(JSON.stringify(e),PASS));await assert.rejects(f.service.decryptWithRecoveryKey(JSON.stringify(e),s.recoveryKey));
 const reverse=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reverse(v)])):x;
 assert.deepEqual(await f.service.decryptWithPassphrase(JSON.stringify(reverse(JSON.parse(s.envelopeJSON))),PASS),f.records);
});
test('repeated and concurrent encryptions have fresh salts, IVs, recovery keys and ciphertexts',async()=>{
 const f=setup(),results=await Promise.all([1,2,3].map(()=>f.service.encrypt(f.input,PASS))),envelopes=results.map(s=>f.service.validateEnvelope(s.envelopeJSON));
 for(const get of [e=>e.kdf.salt,e=>e.data.iv,e=>e.wrappedKeys.passphrase.iv,e=>e.wrappedKeys.recovery.iv,e=>e.auth.iv,e=>e.data.ciphertext])assert.equal(new Set(envelopes.map(get)).size,3);
 assert.equal(new Set(results.map(s=>s.recoveryKey)).size,3);
 for(const e of envelopes)assert.equal(new Set([e.data.iv,e.wrappedKeys.passphrase.iv,e.wrappedKeys.recovery.iv,e.auth.iv]).size,4);
 for(const s of results)assert.deepEqual(await f.service.decryptWithRecoveryKey(s.envelopeJSON,s.recoveryKey),f.records);
});
test('invalid fictional input and real-data package markers are rejected without mutation',async()=>{
 const f=setup(),original=f.input;
 for(const change of [{source:'localStorage'},{classId:'tulip'},{schoolYear:2027},{rosterJSON:'['},{rosterJSON:JSON.stringify([f.records[0],f.records[0]])}])await assert.rejects(f.service.encrypt(JSON.stringify({...JSON.parse(original),...change}),PASS));
 await assert.rejects(f.service.encrypt(' '.repeat(4*1024*1024+1),PASS));
 assert.equal(f.input,original);
});
test('logout rejects encryption/decryption/validation and local-unlock remains disabled',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS);f.boundary.invalidate();assert.throws(()=>f.service.validateEnvelope(s.envelopeJSON));await assert.rejects(f.service.encrypt(f.input,PASS));await assert.rejects(f.service.decryptWithPassphrase(s.envelopeJSON,PASS));await assert.rejects(f.service.decryptWithRecoveryKey(s.envelopeJSON,s.recoveryKey));
 assert.throws(()=>api.createDemoCrypto(f.boundary,{...f.session,mode:'local-unlock'},f.scope));assert.throws(()=>f.boundary.createSession({...f.scope,mode:'local-unlock'}));
});
test('mid-encryption failures return no package and preserve the original input for a successful retry',async()=>{
 for(const point of ['deriveKey','wrapKey','encrypt']){
  const failing=overrideSubtle({[point]:async()=>{throw Error('intentional '+point+' failure')}}),injected=sandboxAPI(failing),f=setup({},injected.api),before=f.input;
  await assert.rejects(f.service.encrypt(f.input,PASS));assert.equal(f.input,before);assert.deepEqual(injected.accesses,[]);
  const normal=api.createDemoCrypto(f.boundary,f.session,f.scope),s=await normal.encrypt(f.input,PASS);assert.deepEqual(await normal.decryptWithPassphrase(s.envelopeJSON,PASS),f.records);
 }
});
test('revocation while derivation is pending prevents releasing a late result',async()=>{
 let revoke=()=>{};const injected=sandboxAPI(overrideSubtle({deriveKey:async(...args)=>{const key=await crypto.subtle.deriveKey(...args);revoke();return key}}));
 const f=setup({},injected.api);revoke=()=>f.boundary.invalidate();await assert.rejects(f.service.encrypt(f.input,PASS));assert.deepEqual(injected.accesses,[]);
});
test('a broken RNG is rejected on nonce collision, without falling back or touching input',async()=>{
 const injected=sandboxAPI({subtle:crypto.subtle,getRandomValues:bytes=>{bytes.fill(7);return bytes}}),f=setup({},injected.api),before=f.input;
 await assert.rejects(f.service.encrypt(f.input,PASS),/乱数/);assert.equal(f.input,before);assert.deepEqual(injected.accesses,[]);
});
test('import, successful encrypt/unlock, invalid requests and logout use zero storage/DOM/network accesses',async()=>{
 const injected=sandboxAPI(),f=setup({},injected.api),s=await f.service.encrypt(f.input,PASS);
 assert.deepEqual(await f.service.decryptWithPassphrase(s.envelopeJSON,PASS),f.records);assert.deepEqual(await f.service.decryptWithRecoveryKey(s.envelopeJSON,s.recoveryKey),f.records);
 await assert.rejects(f.service.decryptWithRecoveryKey(s.envelopeJSON,'bad'));f.boundary.invalidate();await assert.rejects(f.service.encrypt(f.input,PASS));assert.deepEqual(injected.accesses,[]);
 assert.deepEqual(Object.keys(f.service).sort(),['decryptWithPassphrase','decryptWithRecoveryKey','encrypt','validateEnvelope']);
});
test('metadata relabeling fails cryptographically even when the external scope matches the forged label',async()=>{
 const f=setup(),s=await f.service.encrypt(f.input,PASS);
 for(const extra of [{classId:'tulip'},{schoolYear:2027}]){
  const other=setup(extra),e=JSON.parse(s.envelopeJSON);e.classId=other.scope.classId;e.schoolYear=other.scope.schoolYear;e.storageKey=views.legacyRosterKey(other.scope);
  const text=JSON.stringify(e);other.service.validateEnvelope(text);await assert.rejects(other.service.decryptWithPassphrase(text,PASS));await assert.rejects(other.service.decryptWithRecoveryKey(text,s.recoveryKey));
 }
});
test('failure after a first key slot or ciphertext is built still returns no partial package',async()=>{
 for(const point of ['wrapKey','encrypt']){
  let count=0;const injected=sandboxAPI(overrideSubtle({[point]:async(...args)=>{if(++count===2)throw Error('intentional late failure');return crypto.subtle[point](...args)}}));
  const f=setup({},injected.api),before=f.input;await assert.rejects(f.service.encrypt(f.input,PASS));assert.equal(count,2);assert.equal(f.input,before);assert.deepEqual(injected.accesses,[]);
 }
});
test('unknown scope, scope getters and unavailable Web Crypto fail closed without fallback',()=>{
 const f=setup();assert.throws(()=>api.createDemoCrypto(f.boundary,f.session,{classId:'tanpopo',baseYear:2026}));let calls=0;
 const scope={...f.scope};Object.defineProperty(scope,'schoolYear',{enumerable:true,get(){calls++;throw Error('must not run')}});assert.throws(()=>api.createDemoCrypto(f.boundary,f.session,scope));assert.equal(calls,0);
 const missing=sandboxAPI({});assert.throws(()=>missing.api.createDemoCrypto(f.boundary,f.session,f.scope),/Web Crypto/);assert.deepEqual(missing.accesses,[]);
});
