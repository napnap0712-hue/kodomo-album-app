import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPhotoAssignments} from './final-photo-audit.mjs';

test('集合写真は元写真を増やさず複数園児に表示する',()=>{
 const result=auditPhotoAssignments({
  photoCount:4,
  roster:[{id:'a',name:'あお'},{id:'b',name:'はる'}],
  namedFolders:[
   {key:'face-a',childId:'a',photoIndexes:[0,1,2,2],manuallyAdded:[2],faceIndexes:[0]},
   {key:'face-b',childId:'b',photoIndexes:[1,3],manuallyAdded:[],faceIndexes:[1]}
  ],
  excludedFolders:[{photos:[0,3]}]
 });
 assert.equal(result.photoCount,4);
 assert.equal(result.linkedPhotoCount,4);
 assert.deepEqual(result.sharedPhotos.map(entry=>entry.photoIndex),[1]);
 assert.deepEqual(result.children[0].photoIndexes,[0,1,2]);
 assert.deepEqual(result.children[0].manuallyAdded,[2]);
 assert.deepEqual(result.excludedWithChildren,[0,3]);
 assert.deepEqual(result.unassignedPhotos,[]);
});

test('除外した顔は園児へ自動追加せず、未設定フォルダも未割当になる',()=>{
 const result=auditPhotoAssignments({
  photoCount:4,
  roster:[{id:'a',name:'あお'}],
  namedFolders:[
   {key:'named',childId:'a',photoIndexes:[0]},
   {key:'unknown',childId:null,photoIndexes:[1,1],faceIndexes:[1]}
  ],
  excludedFolders:[{photos:[2]}]
 });
 assert.deepEqual(result.unassignedPhotos,[1,2,3]);
 assert.deepEqual(result.unnamedPhotos,[1]);
 assert.deepEqual(result.excludedWithoutChildren,[2]);
 assert.equal(result.unnamedFolders.length,1);
});

test('同じ園児が2つのフォルダに名付けられた場合は点検対象にする',()=>{
 const result=auditPhotoAssignments({
  photoCount:2,
  roster:[{id:'a',name:'あお'}],
  namedFolders:[
   {key:'f1',childId:'a',photoIndexes:[0]},
   {key:'f2',childId:'a',photoIndexes:[1]}
  ]
 });
 assert.equal(result.multipleFolders.length,1);
 assert.deepEqual(result.children[0].photoIndexes,[0,1]);
});

test('園児がゼロ人、顔なし、写真なしでも安全に集計する',()=>{
 const noNames=auditPhotoAssignments({photoCount:3,namedFolders:[],excludedFolders:[]});
 assert.deepEqual(noNames.unassignedPhotos,[0,1,2]);
 assert.deepEqual(noNames.sharedPhotos,[]);
 const empty=auditPhotoAssignments();
 assert.equal(empty.photoCount,0);
 assert.equal(empty.minCount,0);
 assert.equal(empty.countImbalance,false);
});
