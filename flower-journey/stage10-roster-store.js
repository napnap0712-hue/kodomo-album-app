/* Storage only for Stage 10 encrypted registration packages; atomic compare-and-swap. */
(function(root){
'use strict';
const DB_NAME='flower-journey-stage10-fictional-registration-902ffa93-794e-4f04-b264-fb0ba81d1c16',STORE='encrypted-registration';
function createStore(boundary,session,scope,crypt){
 const descriptors=scope&&Object.getOwnPropertyDescriptors(scope);
 if(!descriptors||Object.keys(descriptors).sort().join()!=='baseYear,classId,schoolYear'||Object.values(descriptors).some(d=>!Object.hasOwn(d,'value')))throw Error('Explicit data scope required');
 scope={classId:descriptors.classId.value,schoolYear:descriptors.schoolYear.value,baseYear:descriptors.baseYear.value};
 if(scope.classId!==session?.classId||scope.schoolYear!==session?.schoolYear||scope.schoolYear!==2026||scope.baseYear!==2026)throw Error('Wrong scope');
 const key=JSON.stringify([scope.classId,scope.schoolYear,1]),request={...session,operation:'demo:register'};
 function live(){if(!boundary.authorize(session,request).allowed)throw Error('Expired session')}
 live();
 function open(){live();return new Promise((resolve,reject)=>{const q=root.indexedDB.open(DB_NAME,1);let blocked=false;
  q.onblocked=()=>{blocked=true;reject(Error('Other tab blocks DB'))};q.onerror=()=>reject(Error('DB unavailable'));
  q.onupgradeneeded=()=>{try{live();if(blocked||q.result.objectStoreNames.length)throw Error();q.result.createObjectStore(STORE)}catch{q.transaction.abort()}};
  q.onsuccess=()=>{const db=q.result;db.onversionchange=()=>db.close();try{live();if(blocked||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(STORE))throw Error();resolve(db)}catch{db.close();reject(Error('Invalid DB'))}};
 })}
 async function tx(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode);let result;const check=cb=>{try{live();cb()}catch{try{t.abort()}catch{}}};t.onabort=()=>reject(Error('Save rejected: conflict or transaction failure'));t.onerror=()=>{};t.oncomplete=()=>{try{live();resolve(result)}catch{reject(Error('Session expired after transaction'))}};check(()=>fn(t.objectStore(STORE),check,v=>{result=v}))})}finally{db.close()}}
 async function read(){return tx('readonly',(s,check,done)=>{const q=s.get(key);q.onsuccess=()=>check(()=>{if(q.result===undefined){done(null);return}crypt.validate(q.result);done(q.result)})})}
 async function save(text,expected){
  live();await crypt.open(text);live();if(expected!==null)crypt.validate(expected);
  return tx('readwrite',(s,check,done)=>{const q=s.get(key);q.onsuccess=()=>check(()=>{
   if((q.result??null)!==expected)throw Error('Stale snapshot');
   const put=s.put(text,key);put.onsuccess=()=>check(()=>{const verify=s.get(key);verify.onsuccess=()=>check(()=>{if(verify.result!==text)throw Error('Readback mismatch');done(true)})});
  })});
 }
 return Object.freeze({read,save});
}
Object.defineProperty(root,'FlowerStage10Store',{value:Object.freeze({DB_NAME,createStore})});
})(typeof window==='object'?window:globalThis);
