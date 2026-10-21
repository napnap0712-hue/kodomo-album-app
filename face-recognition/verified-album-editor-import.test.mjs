import test from 'node:test';
import assert from 'node:assert/strict';
import {FACE_DRAFT_SCHEMA} from './face-draft-storage.mjs';
import {restoreApprovedPhotoAudit,prepareVerifiedAlbumEditorImport} from './verified-album-editor-import.mjs';
import {createProvisionalFinalization} from './provisional-photo-finalization.mjs';
import {buildProvisionalApproval,fingerprintProvisionalReview} from './provisional-approval-storage.mjs';

function fixture(){
 const roster=[{id:'a',name:'あお'},{id:'b',name:'はる'}];
 const face=i=>({
  name:'fixture',sourcePhoto:0,url:'data:image/jpeg;base64,QUJDRA==',
  vector:Array.from({length:32},(_,j)=>(j+i)/64)
 });
 const binary={size:6,slice(){return this;}};
 const draft={
  schema:FACE_DRAFT_SCHEMA,version:1,savedAt:1761118000000,
  data:{
   photos:[{name:'A.jpg',size:6,blob:binary,type:'image/jpeg',lastModified:1000},
    {name:'B.jpg',size:6,blob:binary,type:'image/jpeg',lastModified:1001}],
   photoNames:['A.jpg','B.jpg'],faces:[face(1),face(2)],
   groups:[{id:'unknown',members:[]},{id:'1',members:[0]},{id:'2',members:[1]}],
   initialFaceGroups:['1','2'],verifiedPairs:[{i:0,j:1,same:false}],
   groupNames:[],roster,rosterClass:'tulip',
   verifiedFolderNames:[['0','a'],['1','b']],
   excludedVerifiedFolders:[],newManualPhotoFolders:[],manualFolderSequence:0,
   manualPhotoFolderChoices:[],manualPhotoAssignments:[],photoFolderCorrections:[],
   excludedFacePairs:[]
  }
 };
 return {draft,roster};
}
async function approvedFixture(){
 const {draft,roster}=fixture();
 const {audit,signature}=restoreApprovedPhotoAudit(draft);
 const candidate=createProvisionalFinalization(audit,{
  rosterClass:'tulip',sourceSignature:signature,visuallyReviewed:true,
  acknowledgedUnassigned:true
 });
 const approval=buildProvisionalApproval(candidate,await fingerprintProvisionalReview(signature));
 return {draft,roster,approval};
}
test('既存の顔保存データから元写真を二重コピーせず集合写真を2人へ紐づける',async()=>{
 const {draft,roster,approval}=await approvedFixture();
 const plan=await prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:approval,selectedClassId:'tulip',registeredRoster:roster
 });
 assert.equal(plan.photoCount,2);
 assert.equal(plan.linkedPhotoCount,1);
 assert.equal(plan.sharedPhotoCount,1);
 assert.equal(plan.unassignedCount,1);
 assert.deepEqual(plan.assignments,[['a','b'],[]]);
 assert.deepEqual(plan.children.map(x=>x.photoCount),[1,1]);
 assert.equal('photos' in plan,false);
});
test('園児名やクラスが異なればアプリの新規編集へ反映しない',async()=>{
 const {draft,roster,approval}=await approvedFixture();
 await assert.rejects(prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:approval,selectedClassId:'canna',registeredRoster:roster
 }),/クラス/);
 await assert.rejects(prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:approval,selectedClassId:'tulip',
  registeredRoster:[{id:'a',name:'別の子'},roster[1]]
 }),/名簿/);
});
test('古い承認と写真の修正が一致しないときは取り込まない',async()=>{
 const {draft,roster,approval}=await approvedFixture();
 draft.data.photoFolderCorrections=[[0,[['0',false]]]];
 await assert.rejects(prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:approval,selectedClassId:'tulip',registeredRoster:roster
 }),/一致|確認|写真/);
});
test('承認を保存していない・保存元写真が欠けた場合は取り込まない',async()=>{
 const {draft,roster,approval}=await approvedFixture();
 await assert.rejects(prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:null,selectedClassId:'tulip',registeredRoster:roster
 }),/仮確定/);
 draft.data.photos[0].blob=null;
 await assert.rejects(prepareVerifiedAlbumEditorImport({
  savedDraft:draft,savedApproval:approval,selectedClassId:'tulip',registeredRoster:roster
 }),/安全に読み込めません/);
});
