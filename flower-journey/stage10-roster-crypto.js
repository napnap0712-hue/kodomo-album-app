/* Fictional registration records anchored to the existing v1 login DEK. No storage. */
(function(root){
'use strict';
const FORMAT='flower-journey-fictional-registration',VERSION=1;
const nonceLedgers=new Map();
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function bytes(s,length){if(typeof s!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Invalid encoding');const a=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(length!==undefined&&a.length!==length)throw Error('Invalid size');return a}
async function unlock(boundary,session,scope,rootJSON,secret,recovery=false){
 const original=root.FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),e=original.validateEnvelope(rootJSON),subtle=root.crypto.subtle;
 let dek=null,kek=null,material=null,secretBytes=null,initialRecords=null;
 const fixed={...session,operation:'demo:register'};
 function live(){if(!dek||!boundary.authorize(session,fixed).allowed)throw Error('Locked registration')}
 async function step(fn){live();const result=await fn();live();return result}
 const metadata={format:e.format,version:e.version,source:e.source,classId:e.classId,schoolYear:e.schoolYear,baseYear:e.baseYear,storageKey:e.storageKey,algorithms:e.algorithms};
 function rootAAD(purpose){return enc.encode(JSON.stringify({metadata,purpose,...(purpose==='passphrase-dek'?{kdf:e.kdf}:{})}))}
 try{
  initialRecords=recovery?await original.decryptWithRecoveryKey(rootJSON,secret):await original.decryptWithPassphrase(rootJSON,secret);
  if(!boundary.authorize(session,fixed).allowed)throw Error('Expired');
  if(recovery){secretBytes=bytes(secret.slice(7).replace(/-/g,'+').replace(/_/g,'/')+'=',32);kek=await subtle.importKey('raw',secretBytes,'AES-GCM',false,['unwrapKey'])}
  else{secretBytes=enc.encode(secret);material=await subtle.importKey('raw',secretBytes,'PBKDF2',false,['deriveKey']);kek=await subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:e.kdf.iterations,salt:bytes(e.kdf.salt,16)},material,{name:'AES-GCM',length:256},false,['unwrapKey'])}
  const slot=e.wrappedKeys[recovery?'recovery':'passphrase'];
  dek=await subtle.unwrapKey('raw',bytes(slot.ciphertext,48),kek,{name:'AES-GCM',iv:bytes(slot.iv,12),additionalData:rootAAD(recovery?'recovery-dek':'passphrase-dek'),tagLength:128},{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }finally{secretBytes?.fill(0);secretBytes=null;secret=null;kek=null;material=null;if(!dek)initialRecords=null}
 live();
 // Password changes preserve these authenticated parts and the DEK. No password-wrap dependency.
 const anchor=b64(new Uint8Array(await step(()=>subtle.digest('SHA-256',enc.encode(JSON.stringify({metadata,data:e.data,recovery:e.wrappedKeys.recovery}))))));
 if(!nonceLedgers.has(anchor))nonceLedgers.set(anchor,new Set());const used=nonceLedgers.get(anchor);
 for(const iv of [e.data.iv,e.auth.iv,e.wrappedKeys.passphrase.iv,e.wrappedKeys.recovery.iv])used.add(iv);
 const fixedScope=Object.freeze({classId:e.classId,schoolYear:e.schoolYear,baseYear:e.baseYear});
 function validateRecords(records){const model=root.FlowerFriendRosterViewAdapter.createDemoModel(boundary,session,fixedScope,records);return root.FlowerFriendRosterViewAdapter.legacyFor(model)}
 function header(p){return {format:FORMAT,version:VERSION,...fixedScope,anchor,revision:p.revision,iv:p.iv}}
 function validate(text){
  live();if(typeof text!=='string'||text.length>4*1024*1024)throw Error('Invalid package');const p=JSON.parse(text);
  const keys=['format','version','classId','schoolYear','baseYear','anchor','revision','iv','ciphertext'];
  if(!p||Array.isArray(p)||Object.keys(p).length!==keys.length||!keys.every(k=>Object.hasOwn(p,k)))throw Error('Invalid shape');
  if(p.format!==FORMAT||p.version!==VERSION||p.anchor!==anchor||Object.keys(fixedScope).some(k=>p[k]!==fixedScope[k])||typeof p.revision!=='string'||!p.revision)throw Error('Wrong scope or login anchor');
  bytes(p.iv,12);const cipher=bytes(p.ciphertext);if(cipher.length<18||cipher.length>2*1024*1024+16)throw Error('Invalid ciphertext');
  used.add(p.iv);return p;
 }
 async function open(text){const p=validate(text);let plain;try{plain=new Uint8Array(await step(()=>subtle.decrypt({name:'AES-GCM',iv:bytes(p.iv,12),additionalData:enc.encode(JSON.stringify(header(p))),tagLength:128},dek,bytes(p.ciphertext))));return validateRecords(JSON.parse(dec.decode(plain)))}finally{plain?.fill(0)}}
 async function seal(records){
  live();const rows=validateRecords(records);let iv;
  for(let i=0;i<16;i++){const v=b64(root.crypto.getRandomValues(new Uint8Array(12)));if(!used.has(v)){used.add(v);iv=v;break}}
  if(!iv)throw Error('Nonce unavailable');const p=header({revision:root.crypto.randomUUID(),iv}),plain=enc.encode(JSON.stringify(rows));
  if(plain.length>2*1024*1024){plain.fill(0);throw Error('Too large')}
  try{const ciphertext=b64(new Uint8Array(await step(()=>subtle.encrypt({name:'AES-GCM',iv:bytes(iv,12),additionalData:enc.encode(JSON.stringify(p)),tagLength:128},dek,plain))));const text=JSON.stringify({...p,ciphertext});await open(text);return text}finally{plain.fill(0)}
 }
 return Object.freeze({open,seal,validate,takeInitialRecords(){live();if(!initialRecords)throw Error('Initial records already released');const rows=initialRecords;initialRecords=null;return rows},close(){dek=null;initialRecords=null}});
}
Object.defineProperty(root,'FlowerStage10Crypto',{value:Object.freeze({FORMAT,VERSION,unlock})});
})(typeof window==='object'?window:globalThis);
