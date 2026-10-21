// In-memory preview-only rules. No photo deletion, remote requests, or albums writes.
// Excluding a face folder hides it from nursery-child choices, never its source photos.
import {verifiedFolderKey} from './teacher-folder-names.mjs';

export function composeVisibleChildFolders(baseBuckets,excludedKeys,newFolders){
 const knownKeys=new Set(baseBuckets.map(verifiedFolderKey));
 const staleExclusions=[...excludedKeys].filter(key=>!knownKeys.has(key));
 const excluded=baseBuckets.filter(bucket=>excludedKeys.has(verifiedFolderKey(bucket)));
 const included=baseBuckets.filter(bucket=>!excludedKeys.has(verifiedFolderKey(bucket)));
 const extra=[...newFolders].map(([key,entry])=>({
  key,kind:'manual',members:[],photos:[],customName:String(entry?.name||'').trim(),
  independentlyDistinct:false,contradictingPhoto:false
 }));
 const visible=[...included,...extra];
 return {
  visible:visible.map((bucket,index)=>({...bucket,id:index+1,key:verifiedFolderKey(bucket)})),
  excluded,staleExclusions,
  faceCount:included.reduce((n,bucket)=>n+bucket.members.length,0),
  excludedFaceCount:excluded.reduce((n,bucket)=>n+bucket.members.length,0),
  newFolderCount:extra.length
 };
}
export function validateNewPhotoFolderName(label){
 if(typeof label!=='string')return null;
 const trimmed=label.trim();
 if(trimmed.length>40||/[\x00-\x1f\x7f]/.test(trimmed))return null;
 return trimmed;
}
export function addManualPhotoChoice(selected,photoIndex,key){
 if(!Number.isInteger(photoIndex)||photoIndex<0||typeof key!=='string'||!key)return null;
 const copy=new Map([...selected].map(([index,values])=>[index,new Set(values)]));
 if(!copy.has(photoIndex))copy.set(photoIndex,new Set());
 copy.get(photoIndex).add(key);
 return copy;
}
