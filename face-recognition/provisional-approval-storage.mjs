// Approval-only local checkpoint. Photos, face vectors and child names are NOT stored here.
// This IndexedDB is separate from the face analysis drafts and production albums.
export const APPROVAL_SCHEMA='omoide-provisional-photo-approval-v1';
const DATABASE='omoide-provisional-photo-approvals-v1';
const STORE='approvals';
const KEY='current';

export async function fingerprintProvisionalReview(signature){
 if(typeof signature!=='string'||!signature)throw new Error('点検結果がありません。');
 if(!globalThis.crypto?.subtle)throw new Error('このブラウザでは点検結果の照合に対応していません。');
 const bytes=new TextEncoder().encode(signature);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export function validateProvisionalApproval(record){
 const fail=reason=>({ok:false,error:reason});
 if(!record||typeof record!=='object'||record.schema!==APPROVAL_SCHEMA||record.version!==1)
  return fail('保存された仮確定の形式が異なります。');
 if(!/^[0-9a-f]{64}$/.test(record.reviewDigest||''))return fail('振り分け結果の照合情報が不正です。');
 for(const field of ['photoCount','childCount','linkedPhotoCount','unassignedCount']){
  if(!Number.isSafeInteger(record[field])||record[field]<0||record[field]>100000)
   return fail('写真・園児の件数情報が不正です。');
 }
 if(!record.photoCount||!record.childCount||!record.linkedPhotoCount||
    record.linkedPhotoCount+record.unassignedCount!==record.photoCount)
  return fail('仮確定の写真数に矛盾があります。');
 if(record.verifiedByTeacher!==true||record.productionAlbumCommitted!==false)
  return fail('先生による仮確定の確認記録が不正です。');
 if(!Number.isSafeInteger(record.savedAt)||record.savedAt<1)return fail('保存日時が不正です。');
 return {ok:true};
}

export function buildProvisionalApproval(candidate,reviewDigest){
 if(!candidate||candidate.productionAlbumCommitted!==false||candidate.verifiedByTeacher!==true)
  throw new Error('先生が確認した仮確定結果がありません。');
 const record={
  schema:APPROVAL_SCHEMA,version:1,savedAt:Date.now(),
  reviewDigest,photoCount:candidate.photoCount,
  childCount:candidate.children.length,linkedPhotoCount:candidate.linkedPhotoCount,
  unassignedCount:candidate.unassignedPhotoIndexes.length,
  verifiedByTeacher:true,productionAlbumCommitted:false
 };
 const checked=validateProvisionalApproval(record);
 if(!checked.ok)throw new Error(checked.error);
 return record;
}

export function matchProvisionalApproval(record,digest,audit){
 const checked=validateProvisionalApproval(record);
 if(!checked.ok)return checked;
 if(!audit||record.reviewDigest!==digest||
    record.photoCount!==audit.photoCount||
    record.linkedPhotoCount!==audit.linkedPhotoCount||
    record.unassignedCount!==audit.unassignedPhotos?.length||
    record.childCount!==audit.children?.filter(child=>child.folderKeys.length).length)
  return {ok:false,error:'保存時と写真・園児の振り分け結果が一致しません。元の保存済み作業を開くか、変更後にもう一度仮確定してください。'};
 return {ok:true};
}


// Compatibility with approvals saved before the optional photo-level corrections
// were added to the signed source (2026-10-22 AN).
// IMPORTANT: Only an EMPTY corrections array is eligible. When any photo was moved,
// we must NEVER accept the older digest because it did not sign those changes.
// This is strict digest verification, not an approval bypass; no saved data is rewritten.
export async function matchSavedProvisionalApproval(record,signature,audit){
 const digest=await fingerprintProvisionalReview(signature);
 const current=matchProvisionalApproval(record,digest,audit);
 if(current.ok)return {ok:true,legacyFormat:false};
 let parsed;
 try{parsed=JSON.parse(signature)}catch{return current;}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
    !Object.prototype.hasOwnProperty.call(parsed,'photoCorrections')||
    !Array.isArray(parsed.photoCorrections)||parsed.photoCorrections.length!==0)
  return current;
 const older={...parsed};
 delete older.photoCorrections;
 const oldDigest=await fingerprintProvisionalReview(JSON.stringify(older));
 const oldMatch=matchProvisionalApproval(record,oldDigest,audit);
 return oldMatch.ok?{ok:true,legacyFormat:true}:current;
}

function openDatabase(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('このブラウザでは端末内保存に対応していません。'));return;}
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('仮確定の保存先を開けませんでした。'));
  request.onblocked=()=>reject(new Error('保存先が別タブで使用されています。'));
 });
}

async function execute(mode,action){
 const db=await openDatabase();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
   let result,request;
   try{request=action(store);}catch(error){reject(error);try{tx.abort();}catch{}return;}
   if(request){
    request.onsuccess=()=>{result=request.result;};
    request.onerror=()=>{ /* transaction abort is reported below */ };
   }
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||new Error('仮確定の保存処理に失敗しました。'));
   tx.onabort=()=>reject(tx.error||new Error('仮確定の保存処理が中断されました。'));
  });
 }finally{db.close();}
}

export async function saveProvisionalApproval(record){
 const checked=validateProvisionalApproval(record);
 if(!checked.ok)throw new Error(checked.error);
 await execute('readwrite',store=>store.put(record,KEY));
 return record;
}
export async function loadProvisionalApproval(){
 const record=await execute('readonly',store=>store.get(KEY));
 if(record==null)return null;
 const checked=validateProvisionalApproval(record);
 if(!checked.ok)throw new Error(checked.error);
 return record;
}
export async function deleteProvisionalApproval(){
 await execute('readwrite',store=>store.delete(KEY));
}
