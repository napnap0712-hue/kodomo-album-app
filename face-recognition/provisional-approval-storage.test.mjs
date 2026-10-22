import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPhotoAssignments} from './final-photo-audit.mjs';
import {createProvisionalFinalization} from './provisional-photo-finalization.mjs';
import {
 APPROVAL_SCHEMA,fingerprintProvisionalReview,buildProvisionalApproval,
 validateProvisionalApproval,matchProvisionalApproval,matchSavedProvisionalApproval
} from './provisional-approval-storage.mjs';

function make(){
 const audit=auditPhotoAssignments({
  photoCount:4,
  roster:[{id:'1',name:'園児甲'},{id:'2',name:'園児乙'}],
  namedFolders:[
   {key:'f1',childId:'1',photoIndexes:[0,1],manuallyAdded:[]},
   {key:'f2',childId:'2',photoIndexes:[1,2],manuallyAdded:[2]}
  ],
  excludedFolders:[{photos:[3]}]
 });
 const candidate=createProvisionalFinalization(audit,{
  visuallyReviewed:true,acknowledgedUnassigned:true,sourceSignature:'local-prototype'
 });
 return {audit,candidate};
}
test('保存用の照合値は端末内でSHA256を計算し画像を含めない',async()=>{
 const a=await fingerprintProvisionalReview('画像とクラスの識別子');
 const b=await fingerprintProvisionalReview('画像とクラスの識別子');
 const c=await fingerprintProvisionalReview('画像とクラスの別の識別子');
 assert.match(a,/^[0-9a-f]{64}$/);
 assert.equal(a,b);
 assert.notEqual(a,c);
});
test('同じ元写真を2名から参照した承認は名前や画像を複製保存しない',async()=>{
 const {audit,candidate}=make();
 const digest=await fingerprintProvisionalReview('review-a');
 const record=buildProvisionalApproval(candidate,digest);
 assert.equal(record.schema,APPROVAL_SCHEMA);
 assert.equal(record.photoCount,4);
 assert.equal(record.linkedPhotoCount,3);
 assert.equal(record.unassignedCount,1);
 assert.equal(record.childCount,2);
 assert.equal(record.productionAlbumCommitted,false);
 assert.deepEqual(Object.keys(record).sort(),[
  'childCount','linkedPhotoCount','photoCount','productionAlbumCommitted',
  'reviewDigest','savedAt','schema','unassignedCount','verifiedByTeacher','version'
 ].sort());
 assert.equal(matchProvisionalApproval(record,digest,audit).ok,true);
 assert.ok(!JSON.stringify(record).includes('園児甲'));
});
test('別アルバムの振り分けと数の不一致では復元を拒否する',async()=>{
 const {audit,candidate}=make();
 const digest=await fingerprintProvisionalReview('review-a');
 const record=buildProvisionalApproval(candidate,digest);
 assert.equal(matchProvisionalApproval(record,await fingerprintProvisionalReview('review-b'),audit).ok,false);
 assert.equal(matchProvisionalApproval(record,digest,{...audit,photoCount:5}).ok,false);
 assert.equal(matchProvisionalApproval({...record,reviewDigest:'tampered'},digest,audit).ok,false);
});
test('破損や未確認の状態は保存不可',()=>{
 const {candidate}=make();
 assert.throws(()=>buildProvisionalApproval(null,'a'.repeat(64)),/仮確定/);
 assert.throws(()=>buildProvisionalApproval(candidate,'broken'),/照合情報/);
 assert.equal(validateProvisionalApproval({}).ok,false);
});

test('以前の仮確定は写真ごとの修正が空なら旧照合値で安全に復元',async()=>{
 const {audit,candidate}=make();
 const oldSignature=JSON.stringify({sources:['a','b'],audit});
 const currentSignature=JSON.stringify({sources:['a','b'],photoCorrections:[],audit});
 const oldDigest=await fingerprintProvisionalReview(oldSignature);
 const legacy=buildProvisionalApproval(candidate,oldDigest);
 const matched=await matchSavedProvisionalApproval(legacy,currentSignature,audit);
 assert.equal(matched.ok,true);
 assert.equal(matched.legacyFormat,true);
});
test('修正がある写真は古い仮確定を流用せず拒否する',async()=>{
 const {audit,candidate}=make();
 const oldSignature=JSON.stringify({sources:['a','b'],audit});
 const changed=JSON.stringify({sources:['a','b'],photoCorrections:[[1,[['0:1',false]]]],audit});
 const legacy=buildProvisionalApproval(candidate,await fingerprintProvisionalReview(oldSignature));
 const matched=await matchSavedProvisionalApproval(legacy,changed,audit);
 assert.equal(matched.ok,false);
});
test('現在の照合値は古い形式として扱わず、別写真なら拒否',async()=>{
 const {audit,candidate}=make();
 const current=JSON.stringify({sources:['a','b'],photoCorrections:[],audit});
 const approved=buildProvisionalApproval(candidate,await fingerprintProvisionalReview(current));
 const match=await matchSavedProvisionalApproval(approved,current,audit);
 assert.equal(match.ok,true);assert.equal(match.legacyFormat,false);
 const changed=JSON.stringify({sources:['a','c'],photoCorrections:[],audit});
 assert.equal((await matchSavedProvisionalApproval(approved,changed,audit)).ok,false);
});
