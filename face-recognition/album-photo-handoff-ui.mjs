// Read-only preview of a verified, saved provisional photo handoff.
// Intentionally NEVER mutates production album editor state or writes photo storage.
import {buildAlbumPhotoHandoff,previewEditorPhotoAssignments} from './album-photo-handoff.mjs';
import {
 loadProvisionalApproval,matchProvisionalApproval,fingerprintProvisionalReview
} from './provisional-approval-storage.mjs';

export function bindAlbumPhotoHandoffUi({getData,onPhotoOpen}){
 const $=id=>document.getElementById(id);
 const panel=$('albumPhotoHandoffPanel'),launch=$('albumPhotoHandoffOpen');
 const status=$('albumPhotoHandoffStatus'),info=$('albumPhotoHandoffInfo');
 const picker=$('albumPhotoHandoffChild'),gallery=$('albumPhotoHandoffPhotos');
 let busy=false,plan=null,planSignature='';
 const say=message=>{if(status)status.textContent=message;};
 function showPlan(){
  if(!plan||!picker||!gallery||!info)return;
  const current=getData();
  if(current.signature!==planSignature){reset();return;}
  const value=picker.value;
  const photos=value==='unassigned'?plan.photos.filter(photo=>!photo.childIds.length):
   value==='all'?plan.photos.filter(photo=>photo.childIds.length):
   plan.photos.filter(photo=>photo.childIds.includes(value));
  info.textContent=(value==='all'?'園児に紐づいた元写真':value==='unassigned'?'未紐づけの元写真':
   plan.children.find(c=>c.id===value)?.name+'さんの写真')+
   ' '+photos.length+'枚 ／ 集合写真'+photos.filter(p=>p.childIds.length>1).length+
   '枚。表示は編集用の参照候補で、アルバムにはまだ追加していません。';
  gallery.replaceChildren();
  for(const photo of photos){
   const fig=document.createElement('figure');fig.className='final-audit-photo';
   const img=document.createElement('img');
   img.loading='lazy';img.decoding='async';
   img.src=current.photoUrls[photo.photoIndex]||'';
   img.alt='写真'+(photo.photoIndex+1)+'（確認済みの元写真）';
   const caption=document.createElement('figcaption');
   caption.textContent='写真'+(photo.photoIndex+1)+
    (photo.childIds.length>1?'・集合':'')+
    (photo.manuallyAddedTo.includes(value)?'・手動':'');
   const button=document.createElement('button');button.type='button';button.className='photo-review-button';
   button.setAttribute('aria-label','元写真'+(photo.photoIndex+1)+'を大きく確認・振り分けを修正');
   button.addEventListener('click',()=>{
    const folder=plan.children.find(c=>c.id===value);
    onPhotoOpen?.(photo.photoIndex,folder?.folderKeys?.[0]||'');
   });
   button.append(img);fig.append(button,caption);gallery.append(fig);
  }
 }
 function reset(){
  plan=null;planSignature='';
  if(picker){picker.replaceChildren();picker.hidden=true;}
  if(info)info.textContent='';
  if(gallery)gallery.replaceChildren();
 }
 function refresh(){
  if(!panel)return;
  const state=getData();
  panel.hidden=!state.candidate;
  if(plan&&(state.signature!==planSignature||
   state.candidate?.sourceSignature!==planSignature))reset();
  if(launch)launch.disabled=busy||state.faceDraftBusy||!state.candidate||
   !state.persistedSignature||state.persistedSignature!==state.signature;
  if(!state.candidate&&!busy)say('園児別の仮確定を開いてから、編集用候補を確認できます。');
 }
 picker?.addEventListener('change',showPlan);
 launch?.addEventListener('click',async()=>{
  if(busy)return;
  const state=getData();
  if(!state.candidate||!state.persistedSignature||state.persistedSignature!==state.signature){
   say('⚠️ 先に元の作業と仮確定を保存・復元してね。');return;
  }
  busy=true;refresh();reset();
  try{
   const record=await loadProvisionalApproval();
   if(!record)throw Error('保存した仮確定がありません。STEP 4で仮確定を保存してね。');
   const digest=await fingerprintProvisionalReview(state.signature);
   const matched=matchProvisionalApproval(record,digest,state.audit);
   if(!matched.ok)throw Error(matched.error);
   const latest=getData();
   if(latest.signature!==state.signature||!latest.candidate||
     latest.persistedSignature!==state.signature)
    throw Error('写真または振り分け内容が変わりました。保存を確認してね。');
   plan=buildAlbumPhotoHandoff(latest.candidate,{
    roster:latest.roster,rosterClass:latest.rosterClass,photoNames:latest.photoNames
   });
   // Verify the exact ID array the current album photo assignment editor expects.
   const assignments=previewEditorPhotoAssignments(plan,{
    roster:latest.roster,rosterClass:latest.rosterClass
   });
   if(assignments.length!==plan.photoCount)throw Error('編集用の割り当て写真数が一致しません。');
   planSignature=state.signature;
   picker.replaceChildren();
   for(const [value,label] of [
    ['all','🌷 園児に紐づいた全写真'],
    ...plan.children.map(child=>[child.id,child.name+'さん（'+child.photoIndexes.length+'枚）']),
    ['unassigned','未紐づけ・除外の元写真']
   ]){
    const opt=document.createElement('option');opt.value=value;opt.textContent=label;picker.append(opt);
   }
   picker.value=plan.children[0].id;
   picker.hidden=false;
   showPlan();
   say('✅ 編集用写真の参照候補を準備できました。園児を選んで写真を確認してね。元画像・アルバム・保存済みの振り分けは変更していません。');
  }catch(error){
   reset();say('⚠️ 連携プレビューを開けません：'+String(error?.message||error).slice(0,220));
  }finally{busy=false;refresh();}
 });
 refresh();
 return {refresh};
}
