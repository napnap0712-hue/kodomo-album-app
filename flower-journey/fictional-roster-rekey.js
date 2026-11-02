/* Stage 6: immutable rewrapping candidates for fictional version-1 vaults only.
 * No UI, storage, authentication or current-version commit mechanism.
 */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports;
const cryptoAPI=node?require('./fictional-roster-crypto.js'):root.FlowerFictionalRosterCrypto;
// Shared across all service instances in this JS realm, including failed attempts.
// This is not a durable cross-process nonce history or a rollback protection store.
const ledgers=new Map();
function encode(bytes){let text='';for(const b of bytes)text+=String.fromCharCode(b);return root.btoa(text)}
function decode(text){return Uint8Array.from(root.atob(text),c=>c.charCodeAt(0))}
function metadata(e){return {format:e.format,version:e.version,source:e.source,classId:e.classId,schoolYear:e.schoolYear,baseYear:e.baseYear,storageKey:e.storageKey,algorithms:e.algorithms}}
function aad(encoder,e,purpose){return encoder.encode(JSON.stringify({metadata:metadata(e),purpose,...(purpose==='passphrase-dek'?{kdf:e.kdf}:{}),...(purpose==='manifest'?{kdf:e.kdf,wrappedKeys:e.wrappedKeys,data:e.data}:{})}))}
function params(iv,additionalData){return {name:'AES-GCM',iv,additionalData,tagLength:128}}
function password(value){
 if(typeof value!=='string'||[...value].length<16||value.length>1024||!value.trim())throw Error('新しいパスフレーズは16文字以上が必要です');
 for(const char of value)if(char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff)throw Error('パスフレーズのUnicodeが不正です');
}
function createDemoRekey(boundary,session,inputScope){
 if(cryptoAPI.VERSION!==1||cryptoAPI.PARAMETERS.iterations!==600000)throw Error('未対応の暗号化形式です');
 // Reuse the authoritative version-1 validator, original authentication and roster validation.
 const original=cryptoAPI.createDemoCrypto(boundary,session,inputScope);
 const d=Object.getOwnPropertyDescriptors(inputScope),scope=Object.freeze({classId:d.classId.value,schoolYear:d.schoolYear.value,baseYear:d.baseYear.value});
 const crypto=root.crypto,subtle=crypto?.subtle;if(!subtle||typeof crypto.getRandomValues!=='function')throw Error('安全なWeb Cryptoを利用できません');
 const encoder=new root.TextEncoder();
 function live(){if(!boundary.isActive(session)||session.mode!=='demo'||!boundary.authorize(session,{...scopeWithoutBase(),mode:'demo',operation:'demo:register'}).allowed)throw Error('有効な同一クラス・年度のデモセッションが必要です')}
 function scopeWithoutBase(){return {classId:scope.classId,schoolYear:scope.schoolYear}}
 async function step(call){live();const result=await call();live();return result}
 function fresh(length,used){
  for(let i=0;i<16;i++){const bytes=crypto.getRandomValues(new Uint8Array(length)),text=encode(bytes);if(!used.has(text)){used.add(text);return bytes}bytes.fill(0)}
  throw Error('新しい乱数を生成できません');
 }
 async function kek(passphrase,kdf){
  password(passphrase);const bytes=encoder.encode(passphrase);let material;
  try{material=await step(()=>subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']))}finally{bytes.fill(0)}
  return step(()=>subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:decode(kdf.salt)},material,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey']));
 }
 async function ledgerFor(dek,e){
  let raw;
  try{
   raw=new Uint8Array(await step(()=>subtle.exportKey('raw',dek)));
   const fingerprint=encode(new Uint8Array(await step(()=>subtle.digest('SHA-256',raw))));
   if(!ledgers.has(fingerprint))ledgers.set(fingerprint,{ivs:new Set(),salts:new Set()});
   const ledger=ledgers.get(fingerprint);
   for(const iv of [e.data.iv,e.auth.iv,e.wrappedKeys.passphrase.iv,e.wrappedKeys.recovery.iv])ledger.ivs.add(iv);
   ledger.salts.add(e.kdf.salt);return ledger;
  }finally{raw?.fill(0)}
 }
 async function update(envelopeJSON,oldSecret,newPassphrase,recovery){
  live();password(newPassphrase);
  if(!recovery&&oldSecret===newPassphrase)throw Error('現在と異なるパスフレーズを指定してください');
  const e=original.validateEnvelope(envelopeJSON);let recoveryBytes;
  try{
   // Authenticate the WHOLE old envelope and validate all records before any new wrapping.
   if(recovery){
    await step(()=>original.decryptWithRecoveryKey(envelopeJSON,oldSecret));
    // Resetting to the current password is not a change, even if the user forgot it.
    let same=false;
    try{await step(()=>original.decryptWithPassphrase(envelopeJSON,newPassphrase));same=true}catch(error){live();if(error?.cause?.name!=='OperationError')throw error}
    if(same)throw Error('現在と異なるパスフレーズを指定してください');
   }else await step(()=>original.decryptWithPassphrase(envelopeJSON,oldSecret));
   let oldKey;
   if(recovery){
    recoveryBytes=decode(oldSecret.slice(7).replace(/-/g,'+').replace(/_/g,'/')+'=');
    oldKey=await step(()=>subtle.importKey('raw',recoveryBytes,'AES-GCM',false,['unwrapKey']));
   }else oldKey=await kek(oldSecret,e.kdf);
   const slot=e.wrappedKeys[recovery?'recovery':'passphrase'];
   // Extractability is temporary, needed for wrapKey; raw key bytes never leave this module.
   const dek=await step(()=>subtle.unwrapKey('raw',decode(slot.ciphertext),oldKey,params(decode(slot.iv),aad(encoder,e,recovery?'recovery-dek':'passphrase-dek')),{name:'AES-GCM',length:256},true,['encrypt','decrypt']));
   const ledger=await ledgerFor(dek,e);
   const salt=fresh(16,ledger.salts),passIV=fresh(12,ledger.ivs),authIV=fresh(12,ledger.ivs);
   const candidate={...e,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:encode(salt)},wrappedKeys:{passphrase:null,recovery:e.wrappedKeys.recovery},auth:null};
   const newKey=await kek(newPassphrase,candidate.kdf);
   candidate.wrappedKeys.passphrase={iv:encode(passIV),ciphertext:encode(new Uint8Array(await step(()=>subtle.wrapKey('raw',dek,newKey,params(passIV,aad(encoder,candidate,'passphrase-dek'))))))};
   // Empty-message authentication only. The roster IV/ciphertext are never re-encrypted.
   candidate.auth={iv:encode(authIV),tag:encode(new Uint8Array(await step(()=>subtle.encrypt(params(authIV,aad(encoder,candidate,'manifest')),dek,new Uint8Array(0)))))};
   const nextJSON=JSON.stringify(candidate);original.validateEnvelope(nextJSON);
   // Use the unchanged stage-5 engine to verify the complete new candidate.
   // The change path cannot inspect the recovery secret, so preserves that slot
   // verbatim; reset additionally verifies the provided recovery secret again.
   await step(()=>original.decryptWithPassphrase(nextJSON,newPassphrase));
   if(recovery)await step(()=>original.decryptWithRecoveryKey(nextJSON,oldSecret));
   live();return Object.freeze({envelopeJSON:nextJSON});
  }catch{live();throw Error('鍵ラップを更新できません。秘密情報・暗号文を確認し、元の暗号化JSONを保持してください')}
  finally{recoveryBytes?.fill(0)}
 }
 live();return Object.freeze({changePassphrase:(text,oldPassphrase,newPassphrase)=>update(text,oldPassphrase,newPassphrase,false),resetWithRecoveryKey:(text,recoveryKey,newPassphrase)=>update(text,recoveryKey,newPassphrase,true)});
}
const api=Object.freeze({createDemoRekey});
if(node)module.exports=api;
else Object.defineProperty(root,'FlowerFictionalRosterRekey',{value:api});
})(typeof window==='object'?window:globalThis);
