// Local, read-only helper for mapping *teacher-verified provisional* face folders
// to IDs in a class roster. No storage writes and no external networking.
export const verifiedFolderKey=bucket=>[...bucket.members].sort((a,b)=>a-b).join(':');
export function buildNamedFolderPreview(buckets,roster,selections,manualPhotoChoices=new Map()){
 const children=new Map();
 for(const child of roster){
  const id=String(child?.id??'').trim(),name=String(child?.name??'').trim();
  if(!id||id==='undefined'||!name||children.has(id))continue;
  children.set(id,{id,name});
 }
 const named=[],used=new Set(),invalid=[],duplicates=[];
 for(const bucket of buckets){
  const key=verifiedFolderKey(bucket);
  const chosen=selections.get(key);
  let child=null;
  if(chosen!=null&&chosen!==''){
   const id=String(chosen);
   if(!children.has(id))invalid.push({key,reason:'名簿にない園児'});
   else if(used.has(id))duplicates.push({key,id});
   else{child=children.get(id);used.add(id);}
  }
  const images=new Set(bucket.photos);
  const manual=[];
  for(const [photoIndex,keys] of manualPhotoChoices){
   if(keys?.has(key)&&Number.isInteger(photoIndex)&&photoIndex>=0){
    images.add(photoIndex);manual.push(photoIndex);
   }
  }
  named.push({
   key,childId:child?.id||null,childName:child?.name||null,
   photoIndexes:[...images].sort((a,b)=>a-b),
   manuallyAdded:[...new Set(manual)].sort((a,b)=>a-b),
   faceIndexes:[...bucket.members],
   confirmedByTeacher:bucket.kind==='confirmed'
  });
 }
 return {
  named,invalid,duplicates,
  namedCount:named.filter(x=>x.childId!==null).length,
  unusedRoster: [...children.values()].filter(c=>!used.has(c.id)),
  allAssignmentsValid:!invalid.length&&!duplicates.length
 };
}
