// Isolated memory-only finalization candidate. No image copies, storage, or network access.
export const PROVISIONAL_FINALIZATION_SCHEMA='omoide-photo-assignment-candidate-v1';

export function checkFinalizationReadiness(audit){
 const blockers=[];
 if(!audit||!Number.isInteger(audit.photoCount)||audit.photoCount<1)
  blockers.push('点検できる元写真がありません。');
 if(!audit?.distinctNamedChildren||!audit?.linkedPhotoCount)
  blockers.push('園児名と写真が紐づいた仮フォルダがありません。');
 if(audit?.contradictionCount>0)
  blockers.push('先生の顔確認に矛盾が残っています（'+audit.contradictionCount+'組）。');
 if(audit?.hasSourcePhotoConflicts)
  blockers.push('同じ写真の異なる顔が同じ園児フォルダに入っています。');
 if(audit?.invalidAssignments?.length)
  blockers.push('無効または重複した園児名の設定があります。');
 if(audit?.multipleFolders?.length)
  blockers.push('同じ園児名に複数の仮フォルダが設定されています。');
 if(audit?.unnamedFolders?.length)
  blockers.push('園児名が未設定の仮フォルダが'+audit.unnamedFolders.length+'件あります。園児以外なら除外、園児なら名前を付けてください。');
 return {
  ready:blockers.length===0,
  blockers,
  needsUnassignedAcknowledgement:Boolean(audit?.unassignedPhotos?.length)
 };
}

export function createProvisionalFinalization(audit,{
 rosterClass='',sourceSignature='',visuallyReviewed=false,acknowledgedUnassigned=false
}={}){
 const check=checkFinalizationReadiness(audit);
 if(!check.ready)throw new Error('仮確定できません：'+check.blockers.join('／'));
 if(!visuallyReviewed)throw new Error('写真の目視確認が必要です。');
 if(check.needsUnassignedAcknowledgement&&!acknowledgedUnassigned)
  throw new Error('未紐づけ写真を仮確定に含めないことを確認してください。');
 if(typeof sourceSignature!=='string'||!sourceSignature)
  throw new Error('写真の点検情報が取得できませんでした。');
 // All entries store only photo indexes referencing original source images.
 const children=audit.children.filter(child=>child.folderKeys.length).map(child=>Object.freeze({
  id:child.id,name:child.name,
  photoIndexes:Object.freeze([...child.photoIndexes]),
  manuallyAdded:Object.freeze([...child.manuallyAdded]),
  folderKeys:Object.freeze([...child.folderKeys])
 }));
 const sharedPhotos=audit.sharedPhotos.map(photo=>Object.freeze({
  photoIndex:photo.photoIndex,
  childIds:Object.freeze(photo.children.map(child=>child.id))
 }));
 return Object.freeze({
  schema:PROVISIONAL_FINALIZATION_SCHEMA,
  version:1,createdAt:Date.now(),rosterClass,
  sourceSignature,
  photoCount:audit.photoCount,
  linkedPhotoCount:audit.linkedPhotoCount,
  children:Object.freeze(children),
  unassignedPhotoIndexes:Object.freeze([...audit.unassignedPhotos]),
  sharedPhotos:Object.freeze(sharedPhotos),
  // Not a declaration that AI identified every person correctly.
  verifiedByTeacher:true,productionAlbumCommitted:false
 });
}
