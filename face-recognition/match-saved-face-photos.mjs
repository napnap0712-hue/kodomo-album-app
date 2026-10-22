// Exact local-only matching for photos a teacher has manually selected in the
// NEW album. NEVER infer an identity from filenames or a face. Only a matching
// set of original file bytes may reuse a previously approved assignment.
async function sha256Photo(blob,subtle){
 if(!blob||typeof blob.arrayBuffer!=='function'||!Number.isSafeInteger(blob.size)||
    blob.size<1)throw Error('写真のデータを読み取れません。');
 const hash=new Uint8Array(await subtle.digest('SHA-256',await blob.arrayBuffer()));
 return [...hash].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function matchSelectedPhotosToSaved(selectedFiles,savedPhotos,{
 subtle=globalThis.crypto?.subtle,onProgress=()=>{}
}={}){
 if(!subtle||typeof subtle.digest!=='function')
  throw Error('このブラウザでは写真を安全に照合できません。');
 if(!Array.isArray(selectedFiles)||!selectedFiles.length||
    !Array.isArray(savedPhotos)||selectedFiles.length!==savedPhotos.length)
  throw Error('今選んでいる写真の枚数が、保存した写真と違います。');
 if(selectedFiles.length>100)throw Error('一度に照合できる写真は100枚までです。');
 // Cheap fail-fast guard before reading any photo. The original file names and
 // byte lengths must match, but selected photo order/lastModified may differ.
 const key=o=>String(o.name)+'\u0000'+String(o.size);
 const available=new Map();
 for(let i=0;i<savedPhotos.length;i++){
  const source=savedPhotos[i];
  if(!source||typeof source.name!=='string'||!source.name||
     !Number.isSafeInteger(source.size)||source.size<1||!source.blob||
     source.blob.size!==source.size)
   throw Error('保存済みの写真情報が破損しています。');
  const k=key(source);if(!available.has(k))available.set(k,[]);
  available.get(k).push(i);
 }
 for(const file of selectedFiles){
  if(!file||typeof file.name!=='string'||!Number.isSafeInteger(file.size)||file.size<1)
   throw Error('選んだ写真の情報が不正です。');
  const group=available.get(key(file));
  if(!group?.length)throw Error('保存した写真とファイル名・サイズが一致しません。');
  group.pop();
 }
 const hashes=new Map();
 const selectedGroups=new Map();
 for(let i=0;i<savedPhotos.length;i++){
  const original=savedPhotos[i];
  const k=key(original)+'\u0000'+await sha256Photo(original.blob,subtle);
  if(hashes.has(k))throw Error('同じ名前で完全に同じ写真が複数あります。誤った園児への紐づけを防ぐため照合を中止しました。');
  hashes.set(k,i);
  onProgress(i+1,selectedFiles.length*2);
 }
 const mapping=[],used=new Set();
 for(let i=0;i<selectedFiles.length;i++){
  const file=selectedFiles[i];
  const k=key(file)+'\u0000'+await sha256Photo(file,subtle);
  const originalIndex=hashes.get(k);
  if(originalIndex===undefined||used.has(originalIndex))
   throw Error('元写真の内容が保存した写真と一致しません。振り分けを適用しません。');
  used.add(originalIndex);mapping.push(originalIndex);
  onProgress(savedPhotos.length+i+1,selectedFiles.length*2);
 }
 if(mapping.length!==savedPhotos.length||used.size!==savedPhotos.length)
  throw Error('写真の組み合わせが一致しません。');
 return mapping;
}
