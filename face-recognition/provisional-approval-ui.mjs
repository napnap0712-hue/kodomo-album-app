// Small UI adapter for the separate approval-only IndexedDB. Never handles image Blobs.
import {
 fingerprintProvisionalReview,buildProvisionalApproval,matchSavedProvisionalApproval,
 saveProvisionalApproval,loadProvisionalApproval,deleteProvisionalApproval
} from './provisional-approval-storage.mjs';
import {checkFinalizationReadiness,createProvisionalFinalization} from './provisional-photo-finalization.mjs';

export function bindProvisionalApprovalUi({getState,onRestored,formatDate}){
 const $=id=>document.getElementById(id);
 let busy=false;
 const report=message=>{const el=$('provisionalApprovalStorageStatus');if(el)el.textContent=message;};
 function refresh(){
  const {candidate,signature,persistedSignature,faceDraftBusy}=getState();
  const save=$('saveProvisionalApproval');
  if(save)save.disabled=busy||faceDraftBusy||!candidate||
   !persistedSignature||persistedSignature!==signature;
  for(const id of ['restoreProvisionalApproval','deleteProvisionalApproval']){
   const b=$(id);if(b)b.disabled=busy||faceDraftBusy;
  }
 }
 const lock=value=>{busy=value;refresh();};
 $('saveProvisionalApproval')?.addEventListener('click',async()=>{
  if(busy)return;
  const {audit,signature,candidate,persistedSignature,faceDraftBusy}=getState();
  if(faceDraftBusy)return;
  if(!candidate){report('⚠️ 先に先生が仮確定してね。');return;}
  if(!persistedSignature||persistedSignature!==signature){
   report('⚠️ 先にSTEP 1「今の作業を保存」で、現在の写真と振り分けを保存してね。');return;
  }
  if(candidate.sourceSignature!==signature||!checkFinalizationReadiness(audit).ready){
   report('⚠️ 仮確定後に振り分けが変わっています。もう一度点検してね。');return;
  }
  if(!window.confirm('元写真は二重保存せず、仮確定の記録だけをこのSafariに保存します。次回は元の保存済み作業も開く必要があります。保存しますか？'))return;
  lock(true);
  try{
   const digest=await fingerprintProvisionalReview(signature);
   if(getState().signature!==signature)throw Error('保存中に振り分けが変更されました。');
   const saved=await saveProvisionalApproval(buildProvisionalApproval(candidate,digest));
   report('✅ 仮確定の保存成功：園児'+saved.childCount+'名・紐づけ写真'+saved.linkedPhotoCount+
    '枚。写真は重複保存していません。');
  }catch(error){report('⚠️ 仮確定を保存できませんでした：'+String(error?.message||error).slice(0,210));}
  finally{lock(false);}
 });
 $('restoreProvisionalApproval')?.addEventListener('click',async()=>{
  if(busy)return;
  const current=getState();
  if(current.faceDraftBusy)return;
  if(!current.persistedSignature){
   report('⚠️ 先にSTEP 1「保存した続きから開く」で、元の写真と振り分けを復元してね。');return;
  }
  lock(true);
  try{
   const saved=await loadProvisionalApproval();
   if(!saved)throw Error('保存した仮確定がありません。');
   const {audit,signature,persistedSignature}=getState();
   if(signature!==persistedSignature)throw Error('振り分けが保存済み作業と異なります。元の保存済み作業を開いてね。');
   const matched=await matchSavedProvisionalApproval(saved,signature,audit);
   if(!matched.ok)throw Error(matched.error);
   const readiness=checkFinalizationReadiness(audit);
   if(!readiness.ready)throw Error('仮確定できない項目が残っています：'+readiness.blockers.join('／'));
   if(getState().signature!==signature)throw Error('読み込み中に振り分けが変更されました。');
   // Recreate using the CURRENT verified photo indexes; never trust stored names/photos.
   const candidate=createProvisionalFinalization(audit,{
    rosterClass:current.rosterClass,sourceSignature:signature,
    visuallyReviewed:true,acknowledgedUnassigned:true
   });
   onRestored({candidate,audit,signature});
   report('✅ 仮確定の復元成功（'+formatDate(saved.savedAt)+'に保存）'+
    (matched.legacyFormat?'：旧保存形式を確認済み。':'。')+
    '写真の再解析やアルバムの変更はありません。');
  }catch(error){
   report('⚠️ 仮確定を読み込めませんでした：'+String(error?.message||error).slice(0,220)+
    '。現在の写真・振り分けは変更していません。');
  }finally{lock(false);}
 });
 $('deleteProvisionalApproval')?.addEventListener('click',async()=>{
  if(busy||getState().faceDraftBusy)return;
  if(!window.confirm('このSafariに保存した仮確定の確認記録だけを削除しますか？ 元写真や振り分けは変更しません。'))return;
  lock(true);
  try{
   await deleteProvisionalApproval();
   report('✅ 仮確定の保存記録だけを削除しました。元写真・現在の作業はそのままです。');
  }catch(error){report('⚠️ 削除できませんでした：'+String(error?.message||error).slice(0,150));}
  finally{lock(false);}
 });
 refresh();
 void (async()=>{
  try{
   const saved=await loadProvisionalApproval();
   if(!busy)report(saved?
    '💾 保存済みの仮確定：園児'+saved.childCount+'名・元写真'+saved.photoCount+
     '枚／'+formatDate(saved.savedAt)+'。先に元の保存済み作業を開いてね。':
    '仮確定はまだ保存されていません。');
  }catch(error){if(!busy)report('⚠️ 保存状況を確認できません：'+String(error?.message||error).slice(0,150));}
 })();
 return {refresh};
}
