// Bridge from teacher-approved, isolated face review to the existing NEW album photo editor.
// All reads and validation remain on this browser's origin. Never writes album storage.
import {validateFaceDraft} from './face-draft-storage.mjs';
import {buildVerifiedPhotoFolders} from './teacher-verified-folders.mjs';
import {composeVisibleChildFolders} from './photo-folder-visibility.mjs';
import {buildNamedFolderPreview,verifiedFolderKey} from './teacher-folder-names.mjs';
import {trimPhotoFolderCorrections,photoFolderCorrectionsAsRows} from './photo-folder-corrections.mjs';
import {auditPhotoAssignments} from './final-photo-audit.mjs';
import {checkFinalizationReadiness,createProvisionalFinalization} from './provisional-photo-finalization.mjs';
import {fingerprintProvisionalReview,matchProvisionalApproval} from './provisional-approval-storage.mjs';
import {buildAlbumPhotoHandoff,previewEditorPhotoAssignments} from './album-photo-handoff.mjs';

const sortedRows=rows=>[...rows].sort((a,b)=>a[0].localeCompare(b[0]));
const sortedIndexRows=rows=>[...rows].map(([index,keys])=>[index,[...keys].sort()]).sort((a,b)=>a[0]-b[0]);

// Rebuild the *exact* reviewed folder state without rerunning recognition or modifying the draft.
// The source fingerprint deliberately keeps its established original ordering.
export function restoreApprovedPhotoAudit(savedDraft){
 const verified=validateFaceDraft(savedDraft);
 if(!verified.ok)throw Error('保存した写真・振り分けを安全に読み込めません：'+verified.error);
 const d=savedDraft.data;
 const base=buildVerifiedPhotoFolders(d.faces.map(face=>face.sourcePhoto),d.verifiedPairs);
 const exclusion=new Set(d.excludedVerifiedFolders);
 const visible=composeVisibleChildFolders(base.buckets,exclusion,new Map(d.newManualPhotoFolders));
 if(visible.staleExclusions.length)throw Error('以前の除外した顔フォルダが現在の構成と一致しません。');
 const model={...base,buckets:visible.visible};
 const folderKeys=new Set(model.buckets.map(verifiedFolderKey));
 const choices=new Map(d.manualPhotoFolderChoices.map(([index,keys])=>[index,new Set(keys)]));
 const found=new Set(d.faces.map(f=>f.sourcePhoto));
 const missing=new Set(d.photoNames.map((_,i)=>i).filter(i=>!found.has(i)));
 for(const [index,keys] of choices){
  if(!missing.has(index)||[...keys].some(key=>!folderKeys.has(key)))
   throw Error('以前の手動振り分け先が今の顔フォルダと一致しません。');
 }
 const originalCorrections=new Map((d.photoFolderCorrections||[]).map(([index,entries])=>[index,new Map(entries)]));
 const corrections=trimPhotoFolderCorrections(originalCorrections,folderKeys,d.photoNames.length);
 if(photoFolderCorrectionsAsRows(originalCorrections).length!==photoFolderCorrectionsAsRows(corrections).length||
    JSON.stringify(photoFolderCorrectionsAsRows(originalCorrections))!==JSON.stringify(photoFolderCorrectionsAsRows(corrections)))
  throw Error('以前の写真ごとの修正が、現在のフォルダと一致しません。');
 const names=new Map(d.verifiedFolderNames);
 if([...names.keys()].some(key=>!folderKeys.has(key)))
  throw Error('保存した園児名の紐づけ先が、現在の顔フォルダと一致しません。');
 const named=buildNamedFolderPreview(model.buckets,d.roster,names,choices,corrections);
 const audit=auditPhotoAssignments({
  photoCount:d.photoNames.length,namedFolders:named.named,roster:d.roster,
  excludedFolders:visible.excluded,
  invalidAssignments:[...named.invalid,...named.duplicates],
  contradictions:model.contradictions,hasSourcePhotoConflicts:model.hasSourcePhotoConflicts
 });
 const readiness=checkFinalizationReadiness(audit);
 if(!readiness.ready)throw Error('保存済みの振り分けは再確認が必要です：'+readiness.blockers.join('／'));
 const pairSignature=JSON.stringify(d.verifiedPairs.map(pair=>
  Math.min(pair.i,pair.j)+':'+Math.max(pair.i,pair.j)+':'+String(pair.same)).sort());
 const signature=JSON.stringify({
  sources:d.photos.map(photo=>[photo.name,photo.size,photo.lastModified]),
  photoNames:d.photoNames,
  faces:d.faces.map(face=>face.sourcePhoto),
  groups:d.groups.map(group=>[group.id,...group.members]),
  verifiedPairs:pairSignature,
  excluded:[...exclusion].sort(),
  newFolders:sortedRows(d.newManualPhotoFolders),
  named:sortedRows(d.verifiedFolderNames),
  manual:sortedIndexRows(d.manualPhotoFolderChoices),
  photoCorrections:photoFolderCorrectionsAsRows(corrections),
  olderManual:sortedIndexRows(d.manualPhotoAssignments),
  rosterClass:d.rosterClass,roster:d.roster,audit
 });
 return {audit,signature,rosterClass:d.rosterClass,roster:d.roster,photoNames:d.photoNames};
}

function sameRoster(left,right){
 if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return false;
 const extract=rows=>rows.map(row=>[String(row?.id??''),String(row?.name??'').trim()])
  .sort((a,b)=>a[0].localeCompare(b[0]));
 const a=extract(left),b=extract(right);
 return a.every((row,i)=>row[0]&&row[1]&&row[0]===b[i][0]&&row[1]===b[i][1])&&
  new Set(a.map(row=>row[0])).size===a.length;
}

export async function prepareVerifiedAlbumEditorImport({
 savedDraft,savedApproval,selectedClassId,registeredRoster
}){
 if(!savedApproval)throw Error('仮確定の保存記録がありません。顔振り分け画面で仮確定を保存してね。');
 const restored=restoreApprovedPhotoAudit(savedDraft);
 if(!selectedClassId||selectedClassId!==restored.rosterClass)
  throw Error('選択中のクラスが仮確定したクラスと一致しません。');
 if(!sameRoster(restored.roster,registeredRoster))
  throw Error('園児名簿が保存時と一致しません。登録園児の追加・進級・名前の変更がないか確認してね。');
 const digest=await fingerprintProvisionalReview(restored.signature);
 const match=matchProvisionalApproval(savedApproval,digest,restored.audit);
 if(!match.ok)throw Error('保存した仮確定と現在の振り分けが一致しません：'+match.error);
 const candidate=createProvisionalFinalization(restored.audit,{
  rosterClass:restored.rosterClass,sourceSignature:restored.signature,
  visuallyReviewed:true,acknowledgedUnassigned:true
 });
 const plan=buildAlbumPhotoHandoff(candidate,{
  roster:restored.roster,rosterClass:restored.rosterClass,photoNames:restored.photoNames
 });
 const assignments=previewEditorPhotoAssignments(plan,{
  roster:registeredRoster,rosterClass:selectedClassId
 });
 // No File, Blob or face embedding is returned to callers until explicit import.
 return {
  photoCount:plan.photoCount,linkedPhotoCount:plan.linkedPhotoCount,
  unassignedCount:plan.unassignedPhotoIndexes.length,
  sharedPhotoCount:plan.sharedPhotos.length,
  children:plan.children.map(c=>({id:c.id,name:c.name,photoCount:c.photoIndexes.length})),
  assignments,sourceSignature:restored.signature,savedAt:savedDraft.savedAt,
  rosterClass:restored.rosterClass,verifiedByTeacher:true
 };
}
