/* Read the existing stage-02 checkpoint without starting the old application. */
(()=>{
 'use strict';
 const database='omoide-photo-sort-progress-v1';
 async function openExisting(){
  // Without enumeration, opening an absent database could create one.
  if(typeof indexedDB.databases!=='function')return null;
  if(!(await indexedDB.databases()).some(db=>db.name===database))return null;
  return new Promise((resolve,reject)=>{
   let settled=false;
   const request=indexedDB.open(database); // No version upgrade.
   const timer=setTimeout(()=>finish(new Error('Read timeout')),4000);
   function finish(error,db){
    if(settled){db?.close();return;}
    settled=true;clearTimeout(timer);
    if(error)reject(error);else resolve(db);
   }
   request.onupgradeneeded=()=>{
    // Handle deletion between enumeration and open: abort creation, never migrate.
    request.transaction.abort();
    finish(new Error('Database no longer exists'));
   };
   request.onerror=()=>finish(new Error('Cannot read checkpoint database'));
   request.onblocked=()=>finish(new Error('Checkpoint database is busy'));
   request.onsuccess=()=>{
    request.result.onversionchange=()=>request.result.close();
    finish(null,request.result);
   };
  });
 }
 function rosterFor(row){
  let text=row.registered;
  try{
   const meta=JSON.parse(localStorage.getItem('omoide-year-meta-v1')||'null');
   // Match the old app's year-scoped roster; otherwise use its saved snapshot.
   if(Number.isInteger(meta?.base)&&Number.isInteger(row.schoolYear)&&typeof row.classId==='string'){
    const suffix=row.schoolYear===meta.base?'':'-year-'+row.schoolYear;
    const current=localStorage.getItem('omoide-class-children-v1-'+row.classId+suffix);
    if(current!==null)text=current;
   }
  }catch{/* A saved checkpoint also contains the registered roster. */}
  const children=JSON.parse(text);
  if(!Array.isArray(children)||!children.length||children.some(k=>!k?.id||typeof k.name!=='string'||!k.name.trim()))throw Error('Roster unavailable');
  if(new Set(children.map(k=>String(k.id))).size!==children.length)throw Error('Duplicate child IDs');
  return children.map(k=>({id:String(k.id),name:k.name,facePhoto:typeof k.facePhoto==='string'&&k.facePhoto.startsWith('data:image/')?k.facePhoto:''}));
 }
 function gameData(row){
  const children=rosterFor(row),sourceFiles=row.photos.map(p=>p.blob);
  if(sourceFiles.some(blob=>!(blob instanceof Blob)||!blob.size||!blob.type.startsWith('image/')))throw Error('Photos unavailable');
  const ai=row.ai,validIndex=i=>Number.isInteger(i)&&i>=0&&i<sourceFiles.length;
  let groups;
  if(ai){
   if(!Array.isArray(ai.groups)||!Array.isArray(ai.samples))throw Error('Invalid groups');
   const original=new Map(ai.groups.map(group=>[group.key,group]));
   if(original.size!==ai.groups.length)throw Error('Duplicate groups');
   const unused=new Set(ai.unusedPhotoIndexes||[]);
   if([...unused].some(i=>!validIndex(i)))throw Error('Invalid unused photo');
   const folders=ai.photoFolders??ai.groups.map(g=>({key:g.key,groupKeys:[g.key]}));
   if(!Array.isArray(folders))throw Error('Invalid folders');
   groups=folders.map(folder=>{
    if(typeof folder?.key!=='string'||!Array.isArray(folder.groupKeys))throw Error('Invalid folder');
    const indexes=new Set();
    for(const key of folder.groupKeys){
     const group=original.get(key);
     if(!Array.isArray(group?.faceIndexes))throw Error('Unknown group');
     for(const faceIndex of group.faceIndexes){
      if(!Number.isInteger(faceIndex)||faceIndex<0)throw Error('Invalid face index');
      const index=ai.samples[faceIndex]?.index;
      if(!validIndex(index))throw Error('Unknown photo');
      if(!unused.has(index))indexes.add(index);
     }
    }
    for(const index of folder.addedPhotoIndexes||[]){
     if(!validIndex(index))throw Error('Invalid added photo');
     if(!unused.has(index))indexes.add(index);
    }
    for(const index of folder.excludedPhotoIndexes||[]){
     if(!validIndex(index))throw Error('Invalid excluded photo');
     indexes.delete(index);
    }
    return {key:folder.key,indexes:[...indexes].sort((a,b)=>a-b)};
   }).filter(group=>group.indexes.length);
  }else{
   // No new AI processing. Without saved groups, show one original photo per card.
   groups=sourceFiles.map((_,i)=>({key:'photo-'+i,indexes:[i]}));
  }
  if(!groups.length||new Set(groups.map(g=>g.key)).size!==groups.length)throw Error('No usable groups');
  const links=Object.fromEntries(groups.map(group=>[group.key,ai?.photoMatchFolderChild?.[group.key]])
   .filter(([,id])=>children.some(child=>child.id===String(id))).map(([key,id])=>[key,String(id)]));
  return {mode:'readonly',children,sourceFiles,groups,links,hasSavedGroups:!!ai};
 }
 window.flowerCatchReadOnlyData=async()=>{
  let db;
  try{
   db=await openExisting();
   if(!db||!db.objectStoreNames.contains('checkpoints'))return null;
   const row=await new Promise((resolve,reject)=>{
    let latest=null;
    const tx=db.transaction('checkpoints','readonly');
    const request=tx.objectStore('checkpoints').openCursor();
    request.onsuccess=()=>{
     const cursor=request.result;
     if(!cursor)return;
     const value=cursor.value;
     if(value?.version===1&&Number.isFinite(value.savedAt)&&Array.isArray(value.photos)&&value.photos.length&&
       (!latest||value.savedAt>latest.savedAt))latest=value;
     cursor.continue();
    };
    tx.oncomplete=()=>resolve(latest);
    tx.onerror=tx.onabort=()=>reject(new Error('Cannot read checkpoint'));
   });
   return row?gameData(row):null;
  }catch{
   return null; // The host clearly labels its sample-data fallback.
  }finally{db?.close();}
 };
})();
