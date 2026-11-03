/* Isolated fictional-only prototype. Two ciphertext slots make recovery acknowledgement durable. */
(function(root){
'use strict';
const DB_NAME='flower-journey-stage9-fictional-only-8fe8913a-0632-4f66-91ec-bfcd761e5028';
const PENDING='pending-packages',ACTIVE='confirmed-packages';
function createVault(boundary,session,scope){
 const crypt=root.FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope);
 if(scope.schoolYear!==2026||scope.baseYear!==2026)throw Error('第9段階は2026年度専用です');
 const request=Object.freeze({...session,operation:'demo:register'}),key=JSON.stringify([session.classId,2026,1]);
 function live(){if(!boundary.authorize(session,request).allowed)throw Error('失効セッションです')}
 function validate(text){live();crypt.validateEnvelope(text)}
 function open(){live();return new Promise((resolve,reject)=>{
  const q=root.indexedDB.open(DB_NAME,1);let blocked=false;
  q.onblocked=()=>{blocked=true;reject(Error('他の第9段階タブを閉じてください'))};
  q.onerror=()=>reject(Error('第9段階DBを開けません'));
  q.onupgradeneeded=()=>{try{live();if(blocked||q.result.objectStoreNames.length)throw Error();q.result.createObjectStore(PENDING);q.result.createObjectStore(ACTIVE)}catch{q.transaction.abort()}};
  q.onsuccess=()=>{const db=q.result;db.onversionchange=()=>db.close();try{live();if(blocked||db.objectStoreNames.length!==2||![PENDING,ACTIVE].every(n=>db.objectStoreNames.contains(n)))throw Error();resolve(db)}catch{db.close();reject(Error('第9段階DBを確認できません'))}};
 })}
 async function transaction(mode,handler){
  const db=await open();try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction([PENDING,ACTIVE],mode);let value;
   const check=fn=>{try{live();fn()}catch{try{tx.abort()}catch{}}};
   tx.onabort=()=>reject(Error('DB操作は確定できませんでした'));
   tx.onerror=()=>{};tx.oncomplete=()=>{try{live();resolve(value)}catch{reject(Error('セッション失効。DBの状態を再確認してください'))}};
   check(()=>handler(tx,check,result=>{value=result}));
  })}finally{db.close()}
 }
 function slots(tx,check,done){
  const a=tx.objectStore(ACTIVE).get(key),p=tx.objectStore(PENDING).get(key);let count=0;
  const finish=()=>check(()=>{if(++count===2){
   if(a.result!==undefined&&p.result!==undefined)throw Error('Conflicting slots');
   for(const v of [a.result,p.result])if(v!==undefined)validate(v);
   done({active:a.result,pending:p.result});
  }});a.onsuccess=finish;p.onsuccess=finish;
 }
 async function read(){return transaction('readonly',(tx,check,done)=>slots(tx,check,s=>done(Object.freeze({state:s.active!==undefined?'active':s.pending!==undefined?'pending':'empty',envelopeJSON:s.active??s.pending??null}))))}
 async function savePending(text,passphrase){
  validate(text);await crypt.decryptWithPassphrase(text,passphrase);live();
  return transaction('readwrite',(tx,check,done)=>slots(tx,check,s=>{
   if(s.active!==undefined||s.pending!==undefined)throw Error('Never overwrite');
   const store=tx.objectStore(PENDING),q=store.put(text,key);q.onsuccess=()=>check(()=>{
    const verify=store.get(key);verify.onsuccess=()=>check(()=>{if(verify.result!==text)throw Error();done(true)});
   });
  }));
 }
 async function confirmRecovery(text,recoveryKey){
  validate(text);await crypt.decryptWithRecoveryKey(text,recoveryKey);live();
  return transaction('readwrite',(tx,check,done)=>slots(tx,check,s=>{
   if(s.active!==undefined||s.pending!==text)throw Error('Stale pending confirmation');
   const q=tx.objectStore(ACTIVE).put(text,key);q.onsuccess=()=>check(()=>{
    const verify=tx.objectStore(ACTIVE).get(key);verify.onsuccess=()=>check(()=>{
     if(verify.result!==text)throw Error();const remove=tx.objectStore(PENDING).delete(key);remove.onsuccess=()=>check(()=>done(true));
    });
   });
  }));
 }
 return Object.freeze({read,savePending,confirmRecovery});
}
Object.defineProperty(root,'FlowerStage9Vault',{value:Object.freeze({DB_NAME,createVault})});
})(typeof window==='object'?window:globalThis);
