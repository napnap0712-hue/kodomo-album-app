import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPhotoAssignments} from './final-photo-audit.mjs';
import {checkFinalizationReadiness,createProvisionalFinalization} from './provisional-photo-finalization.mjs';

function sample(){
 return auditPhotoAssignments({
  photoCount:4,roster:[{id:'a',name:'あお'},{id:'b',name:'はる'}],
  namedFolders:[
   {key:'face-1',childId:'a',photoIndexes:[0,1],manuallyAdded:[],faceIndexes:[0]},
   {key:'face-2',childId:'b',photoIndexes:[1,2],manuallyAdded:[2],faceIndexes:[1]}
  ],excludedFolders:[{photos:[3]}]
 });
}
test('目視確認と未紐づけ写真の明示的承認が必要',()=>{
 const audit=sample();
 const check=checkFinalizationReadiness(audit);
 assert.equal(check.ready,true);
 assert.equal(check.needsUnassignedAcknowledgement,true);
 assert.throws(()=>createProvisionalFinalization(audit,{sourceSignature:'test'}),/目視確認/);
 assert.throws(()=>createProvisionalFinalization(audit,{sourceSignature:'test',visuallyReviewed:true}),/未紐づけ/);
});
test('集合写真は1枚の元写真を複数園児で参照する読み取り候補だけを作る',()=>{
 const audit=sample();
 const result=createProvisionalFinalization(audit,{
  sourceSignature:'source-1',rosterClass:'tulip',
  visuallyReviewed:true,acknowledgedUnassigned:true
 });
 assert.equal(result.productionAlbumCommitted,false);
 assert.equal(result.photoCount,4);
 assert.equal(result.linkedPhotoCount,3);
 assert.equal(result.children.length,2);
 assert.deepEqual(result.children[0].photoIndexes,[0,1]);
 assert.deepEqual(result.children[1].photoIndexes,[1,2]);
 assert.deepEqual(result.sharedPhotos.map(entry=>entry.photoIndex),[1]);
 assert.deepEqual(result.unassignedPhotoIndexes,[3]);
 assert.deepEqual(result.children[1].manuallyAdded,[2]);
 assert.ok(Object.isFrozen(result.children[0].photoIndexes));
});
test('矛盾・未設定フォルダ・名前の重複は仮確定を止める',()=>{
 const withConflicts={...sample(),contradictionCount:1};
 assert.equal(checkFinalizationReadiness(withConflicts).ready,false);
 assert.throws(()=>createProvisionalFinalization(withConflicts,{
  sourceSignature:'test',visuallyReviewed:true,acknowledgedUnassigned:true
 }),/矛盾/);
 const withUnnamed={...sample(),unnamedFolders:[{key:'x',photoIndexes:[0]}]};
 assert.equal(checkFinalizationReadiness(withUnnamed).ready,false);
 const withDuplicates={...sample(),multipleFolders:[{id:'a',name:'あお',folderKeys:['a','b']}]};
 assert.equal(checkFinalizationReadiness(withDuplicates).ready,false);
});
test('空の作業や園児に写真がない場合は仮確定できない',()=>{
 assert.equal(checkFinalizationReadiness(auditPhotoAssignments()).ready,false);
 const empty=auditPhotoAssignments({photoCount:2,roster:[{id:'1',name:'あお'}]});
 assert.equal(checkFinalizationReadiness(empty).ready,false);
});
