// In-memory append to a NEW album photo selection. Never touches album storage,
// persisted face-review photos or child IDs. A duplicate is skipped only when its
// file bytes are identical (filename/size/lastModified alone is not sufficient).
async function digestHex(blob,subtle){
 const bytes=await subtle.digest('SHA-256',await blob.arrayBuffer());
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function stageAlbumPhotoAppend({
 existingFiles=[],existingAssignments=[],incomingFiles=[],subtle=globalThis.crypto?.subtle,
 maxPhotos=250
}={}){
 if(!Array.isArray(existingFiles)||!Array.isArray(existingAssignments)||
    !Array.isArray(incomingFiles)||existingFiles.length!==existingAssignments.length)
  throw Error('現在の写真・振り分けの件数が一致しません。');
 if(!Number.isSafeInteger(maxPhotos)||maxPhotos<=0||existingFiles.length>maxPhotos)
  throw Error('このアルバムで使える写真の上限を超えています。');
 const good=file=>file&&typeof file.name==='string'&&file.name.trim()&&
   Number.isSafeInteger(file.size)&&file.size>0&&typeof file.arrayBuffer==='function';
 if(existingFiles.some(f=>!good(f))||incomingFiles.some(f=>!good(f)))
  throw Error('写真ファイルが読み取れません。現在の写真は変更していません。');
 if(existingAssignments.some(ids=>!Array.isArray(ids)||ids.some(x=>typeof x!=='string'&&typeof x!=='number')))
  throw Error('振り分けの形式を確認できません。現在の写真は変更していません。');
 const files=[...existingFiles],assignments=existingAssignments.map(ids=>[...ids]);
 // Hash only collisions by name and size. For other photos this is O(n).
 const key=f=>f.name+'\u0000'+f.size;
 const indexes=new Map();
 for(let i=0;i<files.length;i++){
  const k=key(files[i]);if(!indexes.has(k))indexes.set(k,[]);indexes.get(k).push(i);
 }
 const memo=new Map();
 const hash=async file=>{
  if(!subtle?.digest)throw Error('同じ名前・サイズの写真を安全に照合できません。追加は中止しました。');
  if(!memo.has(file))memo.set(file,await digestHex(file,subtle));
  return memo.get(file);
 };
 let added=0,skipped=0;
 for(const file of incomingFiles){
  const duplicates=indexes.get(key(file))||[];
  let exists=false;
  for(const index of duplicates){
   if(file===files[index]||await hash(file)===await hash(files[index])){
    exists=true;break;
   }
  }
  if(exists){skipped++;continue;}
  if(files.length>=maxPhotos)throw Error('写真は一度に'+maxPhotos+'枚までです。写真と振り分けは追加前の状態のままです。');
  const index=files.length;files.push(file);assignments.push([]);added++;
  if(!indexes.has(key(file)))indexes.set(key(file),[]);
  indexes.get(key(file)).push(index);
 }
 return {files,assignments,added,skipped};
}
