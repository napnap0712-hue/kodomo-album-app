// Teacher-approved, READ-ONLY album-photo handoff plan.
// Creates indices and child IDs only. Never opens an album, copies photos or writes storage.
export const ALBUM_PHOTO_HANDOFF_SCHEMA='omoide-album-photo-handoff-preview-v1';

function ints(values,count,label){
 if(!Array.isArray(values))throw Error(label+'の形式が不正です。');
 const seen=new Set();
 for(const index of values){
  if(!Number.isSafeInteger(index)||index<0||index>=count||seen.has(index))
   throw Error(label+'に重複・範囲外の写真番号があります。');
  seen.add(index);
 }
 return [...seen].sort((a,b)=>a-b);
}

export function buildAlbumPhotoHandoff(candidate,{roster=[],rosterClass='',photoNames=[]}={}){
 if(!candidate||candidate.version!==1||candidate.verifiedByTeacher!==true||
    candidate.productionAlbumCommitted!==false||typeof candidate.sourceSignature!=='string'||!candidate.sourceSignature)
  throw Error('確認済みの仮確定を開いてから使ってね。');
 const photoCount=candidate.photoCount;
 if(!Number.isSafeInteger(photoCount)||photoCount<1||!Array.isArray(photoNames)||
    photoNames.length!==photoCount)
  throw Error('元写真の枚数が仮確定と一致しません。');
 if(rosterClass!==candidate.rosterClass||!rosterClass)
  throw Error('仮確定したクラスと現在のクラスが違います。');
 const validChildren=new Map();
 for(const child of roster){
  const id=String(child?.id??''),name=String(child?.name??'').trim();
  if(!id||!name||validChildren.has(id))throw Error('園児名簿に不正または重複があります。');
  validChildren.set(id,name);
 }
 const seenIds=new Set(),linked=new Map();
 const children=[];
 for(const child of candidate.children||[]){
  const id=String(child?.id??''),name=String(child?.name??'').trim();
  if(!validChildren.has(id)||validChildren.get(id)!==name||seenIds.has(id))
   throw Error('仮確定時と園児名簿が一致しません。');
  seenIds.add(id);
  const indexes=ints(child.photoIndexes,photoCount,'園児別写真');
  const manuallyAdded=ints(child.manuallyAdded,photoCount,'手動の振り分け');
  if(manuallyAdded.some(n=>!indexes.includes(n)))throw Error('手動振り分けの写真が園児別写真にありません。');
  if(!indexes.length)throw Error('写真がない園児フォルダが含まれています。');
  const entry={id,name,photoIndexes:indexes,manuallyAdded};
  children.push(entry);
  for(const index of indexes){
   if(!linked.has(index))linked.set(index,new Set());
   linked.get(index).add(id);
  }
 }
 if(!children.length)throw Error('園児に紐づいた写真がありません。');
 const unassigned=ints(candidate.unassignedPhotoIndexes,photoCount,'未紐づけ写真');
 const expectedUnassigned=[];
 for(let i=0;i<photoCount;i++)if(!linked.has(i))expectedUnassigned.push(i);
 if(JSON.stringify(expectedUnassigned)!==JSON.stringify(unassigned))
  throw Error('未紐づけ写真の数や番号が一致しません。');
 if(linked.size!==candidate.linkedPhotoCount)
  throw Error('紐づけ済みの元写真数が一致しません。');
 const sharedPhotos=[...linked].filter(([,ids])=>ids.size>1).map(([photoIndex,ids])=>({
  photoIndex,childIds:[...ids]
 })).sort((a,b)=>a.photoIndex-b.photoIndex);
 const originalShares=(candidate.sharedPhotos||[]).map(row=>({
  photoIndex:row.photoIndex,childIds:[...row.childIds].sort()
 })).sort((a,b)=>a.photoIndex-b.photoIndex);
 const expectedShares=sharedPhotos.map(row=>({photoIndex:row.photoIndex,childIds:[...row.childIds].sort()}));
 if(JSON.stringify(originalShares)!==JSON.stringify(expectedShares))
  throw Error('集合写真の園児紐づけに不一致があります。');
 // Each photo appears once in this source catalog even when linked to two or more children.
 const photos=photoNames.map((name,photoIndex)=>({
  photoIndex,name:String(name||'写真'+(photoIndex+1)),
  childIds:linked.has(photoIndex)?[...linked.get(photoIndex)]:[],
  manuallyAddedTo:children.filter(c=>c.manuallyAdded.includes(photoIndex)).map(c=>c.id)
 }));
 return {
  schema:ALBUM_PHOTO_HANDOFF_SCHEMA,sourceSignature:candidate.sourceSignature,
  rosterClass,photoCount,linkedPhotoCount:linked.size,
  children,photos,sharedPhotos,unassignedPhotoIndexes:unassigned,
  previewOnly:true,productionAlbumCommitted:false
 };
}

// A future editor integration can use this adapter, but only for an exactly matching class/roster.
// No app state is touched by this function.
export function previewEditorPhotoAssignments(plan,{roster=[],rosterClass=''}={}){
 if(!plan||plan.schema!==ALBUM_PHOTO_HANDOFF_SCHEMA||
    plan.rosterClass!==rosterClass||plan.productionAlbumCommitted!==false)
  throw Error('編集対象と仮確定したクラスが一致しません。');
 const available=new Map(roster.map(c=>[String(c.id),String(c.name||'').trim()]));
 for(const child of plan.children)
  if(available.get(child.id)!==child.name)
   throw Error('園児名簿が変わっています。編集画面への連携はできません。');
 return plan.photos.map(photo=>[...photo.childIds]);
}
