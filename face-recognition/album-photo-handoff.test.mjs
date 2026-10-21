import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPhotoAssignments} from './final-photo-audit.mjs';
import {createProvisionalFinalization} from './provisional-photo-finalization.mjs';
import {buildAlbumPhotoHandoff,previewEditorPhotoAssignments} from './album-photo-handoff.mjs';

function fixture(){
 const roster=[{id:'a',name:'あお'},{id:'b',name:'はる'}];
 const audit=auditPhotoAssignments({
  photoCount:5,roster,
  namedFolders:[
   {key:'f-a',childId:'a',photoIndexes:[0,1,2],manuallyAdded:[2]},
   {key:'f-b',childId:'b',photoIndexes:[1,3],manuallyAdded:[3]}
  ],excludedFolders:[{photos:[4]}]
 });
 const candidate=createProvisionalFinalization(audit,{
  rosterClass:'tulip',sourceSignature:'source-v1',visuallyReviewed:true,acknowledgedUnassigned:true
 });
 return {roster,candidate,names:['A.jpg','B.jpg','C.jpg','D.jpg','E.jpg']};
}
test('写真は元写真ごとに一件、集合写真は園児二人が参照している',()=>{
 const {roster,candidate,names}=fixture();
 const plan=buildAlbumPhotoHandoff(candidate,{roster,rosterClass:'tulip',photoNames:names});
 assert.equal(plan.photoCount,5);
 assert.equal(plan.linkedPhotoCount,4);
 assert.equal(plan.photos.length,5);
 assert.deepEqual(plan.photos[1].childIds,['a','b']);
 assert.deepEqual(plan.unassignedPhotoIndexes,[4]);
 assert.deepEqual(plan.sharedPhotos,[{photoIndex:1,childIds:['a','b']}]);
 assert.equal(plan.previewOnly,true);
 assert.equal(plan.productionAlbumCommitted,false);
 assert.deepEqual(plan.children[0].manuallyAdded,[2]);
});
test('編集用割り当て候補は元写真順かつ空欄・複数人に対応する',()=>{
 const {roster,candidate,names}=fixture();
 const plan=buildAlbumPhotoHandoff(candidate,{roster,rosterClass:'tulip',photoNames:names});
 assert.deepEqual(previewEditorPhotoAssignments(plan,{roster,rosterClass:'tulip'}),
  [['a'],['a','b'],['a'],['b'],[]]);
});
test('クラス・園児名簿の違いは読み取り計画でも編集候補でも止める',()=>{
 const {roster,candidate,names}=fixture();
 assert.throws(()=>buildAlbumPhotoHandoff(candidate,{roster,rosterClass:'canna',photoNames:names}),/クラス/);
 const plan=buildAlbumPhotoHandoff(candidate,{roster,rosterClass:'tulip',photoNames:names});
 assert.throws(()=>previewEditorPhotoAssignments(plan,{
  roster:[{id:'a',name:'別人'},{id:'b',name:'はる'}],rosterClass:'tulip'
 }),/名簿/);
 assert.throws(()=>buildAlbumPhotoHandoff(candidate,{roster:[{id:'a',name:'別人'},roster[1]],rosterClass:'tulip',photoNames:names}),/名簿/);
});
test('未紐づけ・集合写真の不一致と写真番号不正は安全に拒否',()=>{
 const {roster,candidate,names}=fixture(),props={roster,rosterClass:'tulip',photoNames:names};
 assert.throws(()=>buildAlbumPhotoHandoff({...candidate,unassignedPhotoIndexes:[]},props),/未紐づけ/);
 assert.throws(()=>buildAlbumPhotoHandoff({...candidate,sharedPhotos:[]},props),/集合写真/);
 assert.throws(()=>buildAlbumPhotoHandoff({...candidate,children:[
  {...candidate.children[0],photoIndexes:[0,1,1]},candidate.children[1]
 ]},props),/重複/);
 assert.throws(()=>buildAlbumPhotoHandoff(candidate,{...props,photoNames:['A.jpg']}),/元写真/);
});
test('園児名・元写真を保存または編集画面へ書き込む処理を含まない',()=>{
 const {roster,candidate,names}=fixture();
 const plan=buildAlbumPhotoHandoff(candidate,{roster,rosterClass:'tulip',photoNames:names});
 assert.equal(plan.photos[4].childIds.length,0);
 assert.equal(typeof plan.sourceSignature,'string');
 assert.equal(plan.productionAlbumCommitted,false);
});
