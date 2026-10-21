// Read-only final review of teacher-named photo folders. No database, filesystem, or network access.
// Each photo index refers to ONE original image even when multiple children appear in it.
export function auditPhotoAssignments({photoCount=0,namedFolders=[],roster=[],excludedFolders=[],invalidAssignments=[],contradictions=[],hasSourcePhotoConflicts=false}={}){
 const count=Number.isInteger(photoCount)&&photoCount>=0?photoCount:0;
 const valid=index=>Number.isInteger(index)&&index>=0&&index<count;
 const unique=values=>[...new Set((values||[]).filter(valid))].sort((a,b)=>a-b);
 const people=new Map();
 for(const entry of roster){
  const id=String(entry?.id??'').trim(),name=String(entry?.name??'').trim();
  if(id&&name&&!people.has(id))people.set(id,{id,name,photos:new Set(),manual:new Set(),folderKeys:[]});
 }
 const linked=Array.from({length:count},()=>new Set());
 const unnamedFolders=[];
 for(const folder of namedFolders){
  const photos=unique(folder.photoIndexes),key=String(folder.key??'');
  const childId=String(folder.childId??'').trim();
  const person=people.get(childId);
  if(!person){
   unnamedFolders.push({key,photoIndexes:photos,faceCount:(folder.faceIndexes||[]).length});
   continue;
  }
  person.folderKeys.push(key);
  for(const index of photos){person.photos.add(index);linked[index].add(childId);}
  for(const index of unique(folder.manuallyAdded))if(person.photos.has(index))person.manual.add(index);
 }
 const children=[...people.values()].map(person=>({
  id:person.id,name:person.name,folderKeys:[...person.folderKeys],
  photoIndexes:[...person.photos].sort((a,b)=>a-b),
  manuallyAdded:[...person.manual].sort((a,b)=>a-b)
 }));
 const unassignedPhotos=[],sharedPhotos=[];
 linked.forEach((ids,index)=>{
  if(!ids.size)unassignedPhotos.push(index);
  if(ids.size>1)sharedPhotos.push({photoIndex:index,children:[...ids].map(id=>({id,name:people.get(id).name}))});
 });
 const excludedPhotoIndexes=unique(excludedFolders.flatMap(folder=>folder.photos||[]));
 const excludedWithChildren=excludedPhotoIndexes.filter(index=>linked[index].size>0);
 const excludedWithoutChildren=excludedPhotoIndexes.filter(index=>!linked[index].size);
 const multipleFolders=children.filter(child=>child.folderKeys.length>1)
  .map(child=>({id:child.id,name:child.name,folderKeys:child.folderKeys}));
 const counts=children.map(child=>child.photoIndexes.length);
 const minCount=counts.length?Math.min(...counts):0,maxCount=counts.length?Math.max(...counts):0;
 const countImbalance=counts.length>1&&maxCount>=5&&maxCount-minCount>=5&&maxCount>=2*Math.max(1,minCount);
 return {
  photoCount:count,children,unnamedFolders,
  unnamedPhotos:unique(unnamedFolders.flatMap(folder=>folder.photoIndexes)),
  unassignedPhotos,sharedPhotos,excludedWithChildren,excludedWithoutChildren,
  excludedFaceFolderCount:excludedFolders.length,
  multipleFolders,invalidAssignments:[...invalidAssignments],
  contradictionCount:contradictions.length,hasSourcePhotoConflicts:Boolean(hasSourcePhotoConflicts),
  linkedPhotoCount:count-unassignedPhotos.length,
  distinctNamedChildren:children.filter(child=>child.folderKeys.length>0).length,
  minCount,maxCount,countImbalance,
  // Image/identity accuracy cannot be established from bookkeeping alone.
  needsIdentityVisualReview:true
 };
}
