/* Stage 5: Web Crypto for fictional JSON only. No UI, persistence or authentication.
 * A fixture marker is a scope restriction, not proof of a caller's data provenance.
 * Caller supplies the trusted parent boundary/session. No plaintext fallback.
 */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports;
const views=node?require('./friend-roster-view-adapter.js'):root.FlowerFriendRosterViewAdapter;
const readers=node?require('./fictional-roster-readonly-adapter.js'):root.FlowerFictionalRosterReadonlyAdapter;
const FORMAT='flower-journey-fictional-roster-vault',VERSION=1;
const PARAMETERS=Object.freeze({kdf:'PBKDF2',hash:'SHA-256',iterations:600000,saltBytes:16,keyBits:256,ivBytes:12,tagBits:128,minPassphraseCharacters:16});
const MAX_PLAINTEXT=2*1024*1024,MAX_ENVELOPE=4*1024*1024;
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))throw Error('暗号化形式が不正です');
}
function encode(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return root.btoa(s)}
function decode(text,length){
 if(typeof text!=='string'||!text||text.length%4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))throw Error('暗号化形式のBase64が不正です');
 let raw;try{raw=root.atob(text)}catch{throw Error('暗号化形式のBase64が不正です')}
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(encode(bytes)!==text||length!==undefined&&bytes.length!==length)throw Error('暗号化形式の長さが不正です');return bytes;
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
function createDemoCrypto(boundary,session,inputScope){
 if(!inputScope||typeof inputScope!=='object'||Array.isArray(inputScope)||Object.getOwnPropertySymbols(inputScope).length)throw Error('接続スコープが不正です');
 const fields=Object.getOwnPropertyDescriptors(inputScope);
 if(Object.keys(fields).length!==3||!['classId','schoolYear','baseYear'].every(k=>Object.hasOwn(fields,k)&&fields[k].enumerable&&Object.hasOwn(fields[k],'value')))throw Error('接続スコープが不正です');
 const scope=Object.freeze({classId:fields.classId.value,schoolYear:fields.schoolYear.value,baseYear:fields.baseYear.value});
 const storageKey=views.legacyRosterKey(scope),seenSalts=new Set();
 const crypto=root.crypto,subtle=crypto?.subtle;
 if(!subtle||typeof crypto.getRandomValues!=='function')throw Error('安全なWeb Cryptoを利用できません');
 const encoder=new root.TextEncoder(),decoder=new root.TextDecoder('utf-8',{fatal:true});
 function live(){
  if(!boundary?.isActive(session)||session.mode!=='demo'||!boundary.authorize(session,{classId:scope.classId,schoolYear:scope.schoolYear,mode:'demo',operation:'demo:render'}).allowed)throw Error('有効な同一クラス・年度のデモセッションが必要です');
 }
 live();
 async function step(call){live();const result=await call();live();return result}
 function fresh(length,used){
  for(let i=0;i<16;i++){const bytes=crypto.getRandomValues(new Uint8Array(length)),value=encode(bytes);if(!used.has(value)){used.add(value);return bytes}bytes.fill(0)}
  throw Error('新しい乱数を生成できませんでした');
 }
 function password(value){
  if(typeof value!=='string'||[...value].length<PARAMETERS.minPassphraseCharacters||value.length>1024||!value.trim())throw Error('デモ用パスフレーズは16文字以上が必要です');
  for(const char of value)if(char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff)throw Error('パスフレーズのUnicodeが不正です');
  return value;
 }
 function metadata(e){return {format:e.format,version:e.version,source:e.source,classId:e.classId,schoolYear:e.schoolYear,baseYear:e.baseYear,storageKey:e.storageKey,algorithms:e.algorithms}}
 function aad(e,purpose){return encoder.encode(JSON.stringify({metadata:metadata(e),purpose,...(purpose==='passphrase-dek'?{kdf:e.kdf}:{}),...(purpose==='manifest'?{kdf:e.kdf,wrappedKeys:e.wrappedKeys,data:e.data}:{})}))}
 function params(iv,additionalData){return {name:'AES-GCM',iv,additionalData,tagLength:128}}
 async function kek(passphrase,kdf){
  const bytes=encoder.encode(password(passphrase));let material;
  try{material=await step(()=>subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']))}finally{bytes.fill(0)}
  return step(()=>subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:PARAMETERS.iterations,salt:decode(kdf.salt,16)},material,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey']));
 }
 function validateEnvelope(text){
  live();if(typeof text!=='string'||text.length>MAX_ENVELOPE)throw Error('暗号化JSON文字列が必要です');
  let e;try{e=JSON.parse(text)}catch{throw Error('暗号化JSONが破損しています')}
  exact(e,['format','version','source','classId','schoolYear','baseYear','storageKey','algorithms','kdf','data','wrappedKeys','auth']);
  if(e.format!==FORMAT||e.version!==VERSION||e.source!==readers.SOURCE)throw Error('未対応の暗号化形式です');
  for(const key of ['classId','schoolYear','baseYear'])if(e[key]!==scope[key])throw Error('暗号文のクラス・年度が一致しません');
  if(e.storageKey!==storageKey)throw Error('暗号文の名簿キーが一致しません');
  exact(e.algorithms,['data','wrap','integrity','keyBits','tagBits']);
  if(e.algorithms.data!=='AES-GCM'||e.algorithms.wrap!=='AES-GCM'||e.algorithms.integrity!=='AES-GCM'||e.algorithms.keyBits!==256||e.algorithms.tagBits!==128)throw Error('未対応の暗号方式です');
  exact(e.kdf,['name','hash','iterations','salt']);
  if(e.kdf.name!=='PBKDF2'||e.kdf.hash!=='SHA-256'||e.kdf.iterations!==PARAMETERS.iterations)throw Error('未対応の鍵導出条件です');
  decode(e.kdf.salt,16);exact(e.wrappedKeys,['passphrase','recovery']);
  exact(e.auth,['iv','tag']);decode(e.auth.iv,12);decode(e.auth.tag,16);
  const ivs=new Set([e.auth.iv]);
  for(const [slot,length] of [[e.data,undefined],[e.wrappedKeys.passphrase,48],[e.wrappedKeys.recovery,48]]){
   exact(slot,['iv','ciphertext']);decode(slot.iv,12);if(ivs.has(slot.iv))throw Error('IVが重複しています');ivs.add(slot.iv);
   const bytes=decode(slot.ciphertext,length);if(bytes.length<18||bytes.length>MAX_PLAINTEXT+16)throw Error('暗号文サイズが不正です');
  }
  // Reconstruct canonical field order: harmless JSON key reordering is supported.
  return freeze({format:FORMAT,version:VERSION,source:readers.SOURCE,...scope,storageKey,
   algorithms:{data:'AES-GCM',wrap:'AES-GCM',integrity:'AES-GCM',keyBits:256,tagBits:128},
   kdf:{name:'PBKDF2',hash:'SHA-256',iterations:PARAMETERS.iterations,salt:e.kdf.salt},
   data:{iv:e.data.iv,ciphertext:e.data.ciphertext},auth:{iv:e.auth.iv,tag:e.auth.tag},
   wrappedKeys:{passphrase:{iv:e.wrappedKeys.passphrase.iv,ciphertext:e.wrappedKeys.passphrase.ciphertext},recovery:{iv:e.wrappedKeys.recovery.iv,ciphertext:e.wrappedKeys.recovery.ciphertext}}});
 }
 async function encrypt(fictionalJSON,passphrase){
  live();password(passphrase);
  if(typeof fictionalJSON!=='string'||fictionalJSON.length>MAX_ENVELOPE)throw Error('架空名簿パッケージのサイズが不正です');
  const reader=readers.createFictionalReader(boundary,session,scope,fictionalJSON);
  const plaintext=encoder.encode(JSON.stringify(reader.readLegacy()));
  if(plaintext.length>MAX_PLAINTEXT){plaintext.fill(0);throw Error('架空名簿のサイズ上限を超えています')}
  let recoveryBytes;
  try{
   const salt=fresh(16,seenSalts),ivs=new Set();
   const dataIV=fresh(12,ivs),passIV=fresh(12,ivs),recoveryIV=fresh(12,ivs),authIV=fresh(12,ivs);
   recoveryBytes=crypto.getRandomValues(new Uint8Array(32));
   const e={format:FORMAT,version:VERSION,source:readers.SOURCE,...scope,storageKey,
    algorithms:{data:'AES-GCM',wrap:'AES-GCM',integrity:'AES-GCM',keyBits:256,tagBits:128},
    kdf:{name:'PBKDF2',hash:'SHA-256',iterations:PARAMETERS.iterations,salt:encode(salt)},
    data:null,auth:null,wrappedKeys:{passphrase:null,recovery:null}};
   const dek=await step(()=>subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']));
   const passKey=await kek(passphrase,e.kdf);
   const recoveryKey=await step(()=>subtle.importKey('raw',recoveryBytes,'AES-GCM',false,['wrapKey','unwrapKey']));
   e.wrappedKeys.passphrase={iv:encode(passIV),ciphertext:encode(new Uint8Array(await step(()=>subtle.wrapKey('raw',dek,passKey,params(passIV,aad(e,'passphrase-dek'))))))};
   e.wrappedKeys.recovery={iv:encode(recoveryIV),ciphertext:encode(new Uint8Array(await step(()=>subtle.wrapKey('raw',dek,recoveryKey,params(recoveryIV,aad(e,'recovery-dek'))))))};
   e.data={iv:encode(dataIV),ciphertext:encode(new Uint8Array(await step(()=>subtle.encrypt(params(dataIV,aad(e,'roster')),dek,plaintext))))};
   // Independent manifest tag covers both key slots and data. Future rewrapping
   // can update the manifest with a fresh nonce without rewriting the roster.
   e.auth={iv:encode(authIV),tag:encode(new Uint8Array(await step(()=>subtle.encrypt(params(authIV,aad(e,'manifest')),dek,new Uint8Array(0)))))};
   const envelopeJSON=JSON.stringify(e);validateEnvelope(envelopeJSON);
   const recoverySecret='FJREC1-'+encode(recoveryBytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   live();return Object.freeze({envelopeJSON,recoveryKey:recoverySecret});
  }finally{plaintext.fill(0);recoveryBytes?.fill(0)}
 }
 async function decrypt(text,secret,recovery){
  const e=validateEnvelope(text);let recoveryBytes,plaintext;
  try{
   let key;
   if(recovery){
    if(typeof secret!=='string'||!/^FJREC1-[A-Za-z0-9_-]{43}$/.test(secret))throw Error('復旧キーの形式が不正です');
    recoveryBytes=decode(secret.slice(7).replace(/-/g,'+').replace(/_/g,'/')+'=',32);
    key=await step(()=>subtle.importKey('raw',recoveryBytes,'AES-GCM',false,['unwrapKey']));
   }else key=await kek(secret,e.kdf);
   const purpose=recovery?'recovery-dek':'passphrase-dek',slot=e.wrappedKeys[recovery?'recovery':'passphrase'];
   // Runtime DEK is non-extractable and decrypt-only. No raw DEK is returned.
   const dek=await step(()=>subtle.unwrapKey('raw',decode(slot.ciphertext,48),key,params(decode(slot.iv,12),aad(e,purpose)),{name:'AES-GCM',length:256},false,['decrypt']));
   await step(()=>subtle.decrypt(params(decode(e.auth.iv,12),aad(e,'manifest')),dek,decode(e.auth.tag,16)));
   plaintext=new Uint8Array(await step(()=>subtle.decrypt(params(decode(e.data.iv,12),aad(e,'roster')),dek,decode(e.data.ciphertext))));
   const rosterJSON=decoder.decode(plaintext);
   const reader=readers.createFictionalReader(boundary,session,scope,JSON.stringify({format:readers.FORMAT,source:readers.SOURCE,...scope,storageKey,rosterJSON}));
   live();return reader.readLegacy();
  }catch(error){live();throw Error('復号できません。秘密情報・暗号文・対象を確認してください',{cause:error})}
  finally{recoveryBytes?.fill(0);plaintext?.fill(0)}
 }
 return Object.freeze({validateEnvelope,encrypt,decryptWithPassphrase:(text,passphrase)=>decrypt(text,passphrase,false),decryptWithRecoveryKey:(text,key)=>decrypt(text,key,true)});
}
const api=Object.freeze({FORMAT,VERSION,PARAMETERS,createDemoCrypto});
if(node)module.exports=api;
else Object.defineProperty(root,'FlowerFictionalRosterCrypto',{value:api});
})(typeof window==='object'?window:globalThis);
