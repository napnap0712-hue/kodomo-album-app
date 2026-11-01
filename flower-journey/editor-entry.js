/* STEP 1: explicit, read-only handoff to the existing spread editor. */
(()=>{
'use strict';
const database='omoide-new-split-albums-v1';
const classNames={tanpopo:'たんぽぽ組',tulip:'チューリップ組',cosmos:'コスモス組',canna:'カンナ組',deigo:'デイゴ組',sakura:'さくら組'};
const guidance='既存アプリで編集するアルバムを確認・保存してから、もう一度開いてください。新しいアルバムや見開きは作成していません。';
async function hasDatabase(name){
 if(typeof indexedDB.databases!=='function')throw Error('保存領域の存在を安全に確認できません。'+guidance);
 return (await indexedDB.databases()).some(db=>db.name===name);
}
async function openExisting(name){
 if(!await hasDatabase(name))return null;
 return new Promise((resolve,reject)=>{
  let failed=false;
  const request=indexedDB.open(name);
  const fail=error=>{failed=true;reject(error)};
  request.onupgradeneeded=()=>{request.transaction.abort();fail(Error('保存領域が見つかりません。'+guidance))};
  request.onerror=()=>fail(request.error||Error('保存領域を読み込めません'));
  request.onblocked=()=>fail(Error('別の画面で保存領域を使用しています'));
  request.onsuccess=()=>{if(failed)request.result.close();else resolve(request.result)};
 });
}
async function readExistingStore(name,store){
 const db=await openExisting(name);
 if(!db)return [];
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),request=tx.objectStore(store).getAll();
  tx.oncomplete=()=>resolve(request.result);
  tx.onabort=tx.onerror=()=>reject(tx.error||Error('一覧を読み込めません'));
 })}finally{db.close()}
}
async function readTargets(){
 let db;
 try{
  db=await openExisting(database);
  if(!db)return [];
  for(const store of ['albums','edits','photos','history'])if(!db.objectStoreNames.contains(store))throw Error('保存情報が不足しています。'+guidance);
  const rows=await new Promise((resolve,reject)=>{
   const tx=db.transaction(['albums','edits'],'readonly');
   const albums=tx.objectStore('albums').getAll(),edits=tx.objectStore('edits').getAll();
   tx.oncomplete=()=>resolve([albums.result,edits.result]);
   tx.onabort=tx.onerror=()=>reject(tx.error||Error('保存情報を読み込めません'));
  });
  const meta=JSON.parse(localStorage.getItem('omoide-year-meta-v1')||'null');
  const now=new Date(),year=Number.isInteger(meta?.active)?meta.active:now.getFullYear()-(now.getMonth()<3?1:0);
  const base=Number.isInteger(meta?.base)?meta.base:year;
  const settings=JSON.parse(localStorage.getItem('omoide-class-settings-v1'+(year===base?'':'-year-'+year))||'{}');
  return rows[0].flatMap(album=>{
   const edit=rows[1].find(item=>item?.albumId===album?.id);
   if(!album?.ready||album.trashedAt||album.storage!=='split-v1'||album.year!==year||!Object.hasOwn(classNames,album.classId)||typeof album.id!=='string'||!album.id||!Number.isInteger(album.photoCount)||album.photoCount<1||edit?.photoCount!==album.photoCount||!Array.isArray(edit?.designElements)||!Number.isInteger(edit.spreadIndex)||edit.spreadIndex<0)return [];
   const max=Math.max(0,Math.ceil(album.photoCount/2)-1,...edit.designElements.map(el=>el?.page||0));
   if(edit.spreadIndex>max)return [];
   return [{classId:album.classId,year,albumId:album.id,spreadIndex:edit.spreadIndex,snapshot:JSON.stringify([album,edit]),label:(settings?.[album.classId]?.name||classNames[album.classId])+' ／ '+(album.title||'タイトルなし')+' ／ 見開き '+(edit.spreadIndex+1)+'（'+year+'年度）'}];
  });
 }finally{db?.close()}
}
async function verify(target){
 const current=(await deadline(readTargets(),10000,'保存情報を確認できません。'+guidance)).find(row=>row.albumId===target?.albumId&&row.classId===target.classId&&row.year===target.year&&row.spreadIndex===target.spreadIndex&&row.snapshot===target.snapshot);
 if(!current)throw Error('編集対象が変更されたか、確認できません。'+guidance);
 if(localStorage.getItem('omoide-split-edit-recovery-v1:'+current.albumId))throw Error('保存前の編集情報があります。既存アプリで途中再開し、保存した後に開いてください。編集情報は保持しています。');
 return current;
}
function choose(targets,message){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='fjEditorEntryDialog';
  const style=document.createElement('style');
  style.textContent='#fjEditorEntryDialog{width:min(92vw,580px);max-height:85vh;overflow:auto;border:0;border-radius:20px;padding:24px;background:#fffdf6;color:#30463d;font:16px/1.7 system-ui;box-shadow:0 12px 50px #22382b55}#fjEditorEntryDialog::backdrop{background:#22382b66}#fjEditorEntryDialog h2{font-size:20px;margin:0 0 12px}#fjEditorEntryDialog select{display:block;width:100%;font:inherit;padding:10px;margin:12px 0}#fjEditorEntryDialog button{font:inherit;padding:10px 16px;margin:10px 8px 0 0;border-radius:24px;border:1px solid #82a58e;background:#edf6e9}';
  const title=document.createElement('h2');title.textContent=targets.length?'編集する見開きを確認':'見開きを開けませんでした';
  const text=document.createElement('p');text.textContent=message||(targets.length?'クラス・アルバム・保存済みの見開き番号を確認して選んでください。':'保存済みの編集対象を確認できません。'+guidance);
  dialog.append(title,text);
  let select;
  if(targets.length){
   const label=document.createElement('label');label.textContent='編集する見開き';
   select=document.createElement('select');select.id='fjEditorEntryTarget';
   select.append(new Option('選んでください',''));
   targets.forEach((target,index)=>select.append(new Option(target.label,String(index))));
   label.append(select);dialog.append(label);
   const open=document.createElement('button');open.id='fjEditorEntryOpen';open.textContent='この見開きを開く';open.disabled=true;
   select.addEventListener('change',()=>{open.disabled=select.value===''});
   open.addEventListener('click',()=>{resolve(targets[Number(select.value)]);dialog.close()});dialog.append(open);
  }
  const cancel=document.createElement('button');cancel.textContent='説明にもどる';cancel.addEventListener('click',()=>dialog.close());dialog.append(cancel);
  dialog.addEventListener('close',()=>{resolve(null);dialog.remove();style.remove()},{once:true});
  document.head.append(style);document.body.append(dialog);dialog.showModal();
 });
}
function deadline(promise,ms,message){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms)})]).finally(()=>clearTimeout(timer));
}
async function open({frame,curtain}){
 try{
  const target=await choose(await deadline(readTargets(),10000,'保存情報の確認が完了しませんでした。'+guidance));
  if(!target)return false;
  await verify(target);
  // Keep the live guide visible throughout loading and validation. Never expose app home.
  frame.style.display='none';frame.onload=null;frame.removeAttribute('sandbox');frame.title='見開き編集';
  await deadline(new Promise((resolve,reject)=>{
   frame.onload=()=>{
    frame.onload=null;
    try{frame.contentWindow.cjOriginalApp?resolve():reject(Error('編集画面の読み込みに失敗しました'))}
    catch{reject(Error('編集画面を読み込めません。もう一度お試しください。'))}
   };
   frame.onerror=()=>reject(Error('編集画面を読み込めません'));
   frame.src='../index.html?flowerEditorEntry=1';
  }),20000,'編集画面の読み込みに時間がかかっています。もう一度お試しください。');
  const result=await deadline(frame.contentWindow.cjOriginalApp.navigate('spread',target),65000,'編集画面の準備が完了しませんでした。保存データは変更していません。');
  if(!result?.ok)throw Error(result?.message||'編集対象を開けませんでした');
  // Legacy page navigation is hidden; identify the opened spread outside the paper.
  const doc=frame.contentDocument,context=doc.createElement('p');
  context.id='fjEditorEntryContext';context.setAttribute('role','status');
  context.style.cssText='margin:8px 0;padding:8px 12px;color:#526f5d;font-size:13px;overflow-wrap:anywhere';
  const indicator=doc.getElementById('pageIndicator');
  const updateContext=()=>{context.textContent=target.label.replace(/見開き \d+/, '見開き '+(indicator.textContent.split('/')[0].trim()))};
  updateContext();
  new MutationObserver(updateContext).observe(indicator,{childList:true,subtree:true,characterData:true});
  doc.getElementById('fjWideHeader').after(context);
  const image=frame.contentDocument.querySelector('.fjCannaHeaderImage');
  if(!image)throw Error('編集ヘッダーを読み込めません');
  await deadline(image.decode(),10000,'編集ヘッダーを読み込めません');
  curtain.classList.add('on');
  await new Promise(resolve=>setTimeout(resolve,330));
  frame.classList.remove('return-zoom');
  for(const property of ['transition','filter','opacity','transform'])frame.style.removeProperty(property);
  frame.style.display='block';
  frame.animate([{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}],{duration:650,easing:'cubic-bezier(.15,.7,.2,1)'});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  curtain.classList.remove('on');return true;
 }catch(error){
  frame.onload=null;frame.onerror=null;frame.style.display='none';curtain.classList.remove('on');
  await choose([],String(error?.message||error));return false;
 }
}
window.cjFlowerEditorEntry={readExistingStore,readTargets,verify,open};
})();
