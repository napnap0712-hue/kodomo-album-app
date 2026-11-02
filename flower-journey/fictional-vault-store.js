/* Dedicated fictional ciphertext store. No legacy DB discovery or migration. */
(function(root){
'use strict';
const DB_NAME='flower-journey-fictional-only-stage8-67c291de-92ac-4ec1-a837-18e81a43f992';
const STORE='encrypted-packages',CONFIRM_DELETE='DELETE FICTIONAL TEST DATA';
function createStore(boundary,session,scope){
 const crypt=root.FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope);
 const fixed=Object.freeze({classId:session.classId,schoolYear:session.schoolYear,mode:'demo',operation:'demo:register'});
 const key=JSON.stringify([session.classId,session.schoolYear,1]);
 function live(){if(!boundary.authorize(session,fixed).allowed)throw Error('セッションが無効です')}
 function validate(text){live();return crypt.validateEnvelope(text)}
 function open(){
  live();return new Promise((resolve,reject)=>{
   const request=root.indexedDB.open(DB_NAME,1);let failed=false;
   request.onupgradeneeded=()=>{
    try{live();const db=request.result;if(failed||db.objectStoreNames.length)throw Error('Unexpected schema');db.createObjectStore(STORE)}catch{request.transaction.abort()}
   };
   request.onblocked=()=>{failed=true;reject(Error('他のテスト画面を閉じてください'))};
   request.onerror=()=>reject(Error('テストDBを開けません'));
   request.onsuccess=()=>{
    const db=request.result;db.onversionchange=()=>db.close();
    try{live();if(failed||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(STORE))throw Error('Unexpected schema');resolve(db)}catch{db.close();reject(Error('テストDBを利用できません'))}
   };
  });
 }
 async function transact(mode,handler){
  const db=await open();
  try{return await new Promise((resolve,reject)=>{
   let result,problem;const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
   const fail=()=>{problem=true;try{tx.abort()}catch{}};
   const check=fn=>{try{live();fn()}catch{fail()}};
   tx.onabort=()=>reject(Error('テストDBの操作を確定できません'));
   tx.onerror=()=>{};
   tx.oncomplete=()=>{try{live();if(problem)throw Error();resolve(result)}catch{reject(Error('完了を確認できません。再読込で確認してください'))}};
   check(()=>handler(store,check,value=>{result=value}));
  })}finally{db.close()}
 }
 async function readEncrypted(){
  return transact('readonly',(store,check,done)=>{const request=store.get(key);request.onsuccess=()=>check(()=>{
   if(request.result===undefined){done(null);return}validate(request.result);done(request.result);
  })});
 }
 async function save(envelopeJSON,passphrase,expected=null){
  // Authenticate and validate records before any persistent operation; never save secrets.
  validate(envelopeJSON);await crypt.decryptWithPassphrase(envelopeJSON,passphrase);live();
  if(expected!==null)validate(expected);
  return transact('readwrite',(store,check,done)=>{
   const old=store.get(key);old.onsuccess=()=>check(()=>{
    if((old.result??null)!==expected)throw Error('Concurrent update');
    const put=store.put(envelopeJSON,key);put.onsuccess=()=>check(()=>{
     const readback=store.get(key);readback.onsuccess=()=>check(()=>{
      if(readback.result!==envelopeJSON)throw Error('Verification failed');done(true);
     });
    });
   });
  });
 }
 async function remove(expected,confirmation){
  live();if(confirmation!==CONFIRM_DELETE)throw Error('削除確認が必要です');
  // A corrupt entry can be explicitly removed too. Only this scope's fixed key is touched.
  if(expected!==undefined&&expected!==null&&typeof expected!=='string')throw Error('Invalid expected value');
  return transact('readwrite',(store,check,done)=>{
   const old=store.get(key);old.onsuccess=()=>check(()=>{
    if(expected!==undefined&&(old.result??null)!==expected)throw Error('Concurrent update');
    const request=store.delete(key);request.onsuccess=()=>check(()=>done(true));
   });
  });
 }
 return Object.freeze({readEncrypted,save,remove});
}
Object.defineProperty(root,'FlowerFictionalVaultStore',{value:Object.freeze({DB_NAME,CONFIRM_DELETE,createStore})});
})(typeof window==='object'?window:globalThis);
