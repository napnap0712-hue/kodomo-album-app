// Teacher's PHOTO-level corrections. Face identity clusters and originals remain unchanged.
// The map is keyed by original photo index. Each inner map stores a deliberate
// membership override: true = include this original, false = exclude for this folder.
export function setPhotoFolderCorrection(corrections,photoIndex,key,include,{photoCount,folderKeys}={}){
 if(!Number.isInteger(photoIndex)||photoIndex<0||photoIndex>=photoCount||
    typeof key!=='string'||!folderKeys.has(key)||typeof include!=='boolean')
  throw new Error('写真番号またはフォルダが一致しません。');
 const next=new Map([...corrections].map(([index,entries])=>[index,new Map(entries)]));
 const edits=new Map(next.get(photoIndex)||[]);
 edits.set(key,include);
 next.set(photoIndex,edits);
 return next;
}
export function transferPhotoFolderCorrection(corrections,photoIndex,fromKey,toKey,options){
 if(fromKey&&fromKey===toKey)throw new Error('移動先は別の園児フォルダを選んでね。');
 if(!fromKey&&!toKey)throw new Error('追加先フォルダを選んでね。');
 let next=corrections;
 if(fromKey)next=setPhotoFolderCorrection(next,photoIndex,fromKey,false,options);
 if(toKey)next=setPhotoFolderCorrection(next,photoIndex,toKey,true,options);
 return next;
}
export function trimPhotoFolderCorrections(corrections,validKeys,photoCount){
 const clean=new Map();
 for(const [index,entries] of corrections||[]){
  if(!Number.isInteger(index)||index<0||index>=photoCount)continue;
  const kept=new Map([...entries].filter(([key,value])=>validKeys.has(key)&&typeof value==='boolean'));
  if(kept.size)clean.set(index,kept);
 }
 return clean;
}
export function photoFolderCorrectionsAsRows(corrections){
 return [...corrections].sort((a,b)=>a[0]-b[0])
  .map(([index,entries])=>[index,[...entries].sort((a,b)=>a[0].localeCompare(b[0]))]);
}
export function correctedPhotoIndexes(bucketPhotoIndexes,legacyManuallyAdded,corrections,key){
 const images=new Set(bucketPhotoIndexes||[]);
 const manual=new Set(legacyManuallyAdded||[]);
 for(const [index,entries] of corrections||[]){
  if(!entries.has(key))continue;
  if(entries.get(key)){images.add(index);if(!(bucketPhotoIndexes||[]).includes(index))manual.add(index);}
  else{images.delete(index);manual.delete(index);}
 }
 return {
  photoIndexes:[...images].sort((a,b)=>a-b),
  manuallyAdded:[...manual].filter(index=>images.has(index)).sort((a,b)=>a-b)
 };
}
