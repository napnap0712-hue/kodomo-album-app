// Isolated, opt-in browser-only saved drafts for the face-cluster prototype.
// Own IndexedDB database; never reads/writes existing album stores or networks.
// Source photo Blobs, recognition vectors and child names remain on this device.
// No automatic persistence. Only an explicit Save button writes.
export const FACE_DRAFT_SCHEMA='omoide-face-review-prototype-v1';
const DB_NAME='omoide-face-prototype-private-drafts-v1';
const STORE='drafts';
const MAX_PHOTOS=100;
const MAX_FACES=3000;
const MAX_REVIEW_PAIRS=50000;

export function validateFaceDraft(record){
 const fail=message=>({ok:false,error:message});
 if(!record||typeof record!=='object'||record.schema!==FACE_DRAFT_SCHEMA||record.version!==1)
  return fail('この保存データの形式またはバージョンには対応していません。');
 const data=record.data;
 if(!data||typeof data!=='object')return fail('保存データがありません。');
 const photos=data.photos,faces=data.faces;
 if(!Array.isArray(photos)||!photos.length||photos.length>MAX_PHOTOS)
  return fail('写真の件数が不正です。');
 if(!Array.isArray(faces)||faces.length>MAX_FACES)
  return fail('顔の件数が不正です。');
 if(!Array.isArray(data.photoNames)||data.photoNames.length!==photos.length)
  return fail('写真名と元写真の件数が一致しません。');
 for(let i=0;i<photos.length;i++){
  const photo=photos[i];
  if(!photo||typeof photo.name!=='string'||!photo.name||photo.name.length>400||
     typeof photo.size!=='number'||!Number.isSafeInteger(photo.size)||photo.size<0||
     !photo.blob||typeof photo.blob.size!=='number'||
     typeof photo.blob.slice!=='function'||photo.blob.size!==photo.size||
     photo.name!==data.photoNames[i])
   return fail('写真'+(i+1)+'の保存情報が一致しません。');
 }
 const validVector=vec=>Array.isArray(vec)&&vec.length>=16&&vec.length<=4096&&
  vec.every(value=>typeof value==='number'&&Number.isFinite(value));
 const photosSeen=new Set();
 for(let i=0;i<faces.length;i++){
  const face=faces[i];
  if(!face||!Number.isInteger(face.sourcePhoto)||face.sourcePhoto<0||face.sourcePhoto>=photos.length||
     !validVector(face.vector)||typeof face.url!=='string'||!/^data:image\/(?:jpeg|png|webp);base64,/.test(face.url)||
     face.url.length>3_000_000)
   return fail('顔'+(i+1)+'の特徴情報が不正です。');
  photosSeen.add(face.sourcePhoto);
  if(face.r50Vector!=null&&!validVector(face.r50Vector))
   return fail('R50比較の保存情報が不正です。');
 }
 if(!Array.isArray(data.groups)||!data.groups.length)
  return fail('顔グループの情報がありません。');
 const groupIds=new Set(),assignedFaces=new Set();
 for(const group of data.groups){
  if(!group||typeof group.id!=='string'||!Array.isArray(group.members)||groupIds.has(group.id))
   return fail('顔グループのIDが重複または不正です。');
  groupIds.add(group.id);
  for(const id of group.members){
   if(!Number.isInteger(id)||id<0||id>=faces.length||assignedFaces.has(id))
    return fail('顔グループに重複・不正な顔があります。');
   assignedFaces.add(id);
  }
 }
 if(assignedFaces.size!==faces.length)return fail('顔の割り当てに欠落があります。');
 if(!Array.isArray(data.initialFaceGroups)||data.initialFaceGroups.length!==faces.length)
  return fail('AI初回のグループ結果が不正です。');
 if(!Array.isArray(data.verifiedPairs)||data.verifiedPairs.length>MAX_REVIEW_PAIRS)
  return fail('先生の確認記録が不正です。');
 const knownPairs=new Set();
 for(const pair of data.verifiedPairs){
  if(!Number.isInteger(pair?.i)||!Number.isInteger(pair?.j)||pair.i===pair.j||
     pair.i<0||pair.j<0||pair.i>=faces.length||pair.j>=faces.length||
     typeof pair.same!=='boolean')
   return fail('先生の確認記録の顔番号が不正です。');
  const id=Math.min(pair.i,pair.j)+':'+Math.max(pair.i,pair.j);
  if(knownPairs.has(id))return fail('先生の確認記録に重複があります。');
  knownPairs.add(id);
  if(pair.same&&faces[pair.i].sourcePhoto===faces[pair.j].sourcePhoto)
   return fail('同じ写真の異なる顔が同一園児として記録されています。');
 }
 for(const key of ['groupNames','roster','verifiedFolderNames','excludedVerifiedFolders','manualPhotoFolderChoices',
                   'newManualPhotoFolders','manualPhotoAssignments','excludedFacePairs']){
  if(!Array.isArray(data[key]))return fail(key+'の保存形式が不正です。');
 }
 if(!['tanpopo','tulip','cosmos','canna','deigo','sakura'].includes(data.rosterClass))
  return fail('保存されたクラス情報が不正です。');
 for(const [photoIndex,keys] of data.manualPhotoFolderChoices){
  if(!Number.isInteger(photoIndex)||photoIndex<0||photoIndex>=photos.length||!Array.isArray(keys))
   return fail('写真の手動振り分けが不正です。');
 }
 for(const [key,entry] of data.newManualPhotoFolders){
  if(typeof key!=='string'||!/^manual-\d+$/.test(key)||typeof entry?.name!=='string'||entry.name.length>40)
   return fail('新規フォルダの保存情報が不正です。');
 }
 const observed=Number(record.savedAt);
 if(!Number.isFinite(observed)||observed<=0)
  return fail('保存日時が不正です。');
 return {ok:true,photoCount:photos.length,faceCount:faces.length,
  reviewCount:data.verifiedPairs.length,savedAt:record.savedAt,
  detectedPhotoCount:photosSeen.size};
}

function openDb(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('このブラウザは端末内保存に対応していません。'));return;}
  let request;
  try{request=indexedDB.open(DB_NAME,1);}
  catch(error){reject(error);return;}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
  };
  request.onerror=()=>reject(request.error||new Error('保存先を開けませんでした。'));
  request.onblocked=()=>reject(new Error('別のタブで保存先が使用されています。別タブを閉じてから再試行してください。'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function withDb(action){
 const db=await openDb();
 try{return await action(db)}finally{db.close();}
}
function transact(db,mode,handler){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  let response;
  tx.oncomplete=()=>resolve(response);
  tx.onabort=()=>reject(tx.error||new Error('端末内の保存処理が取り消されました。'));
  tx.onerror=()=>{}; // onabort reports failure; avoid duplicate Promise rejection
  try{handler(store,result=>{response=result;});}
  catch(error){try{tx.abort()}catch{}reject(error);}
 });
}
export async function saveFaceDraft(record){
 const checked=validateFaceDraft(record);
 if(!checked.ok)throw new Error('保存を中止しました：'+checked.error);
 await withDb(db=>transact(db,'readwrite',(store)=>{
  store.put(record,'latest');
  store.put({
   schema:FACE_DRAFT_SCHEMA,version:1,savedAt:record.savedAt,
   photoCount:checked.photoCount,faceCount:checked.faceCount,
   reviewCount:checked.reviewCount
  },'info');
 }));
 return checked;
}
export async function loadFaceDraft(){
 return withDb(db=>transact(db,'readonly',(store,done)=>{
  const req=store.get('latest');
  req.onsuccess=()=>done(req.result||null);
 }));
}
export async function faceDraftInfo(){
 return withDb(db=>transact(db,'readonly',(store,done)=>{
  const req=store.get('info');
  req.onsuccess=()=>done(req.result||null);
 }));
}
export async function deleteFaceDraft(){
 return withDb(db=>transact(db,'readwrite',(store)=>{
  store.delete('latest');
  store.delete('info');
 }));
}
