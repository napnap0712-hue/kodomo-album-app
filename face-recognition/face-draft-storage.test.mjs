// Synthetic drafts only: no children's photos, names, or recognition data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FACE_DRAFT_SCHEMA,validateFaceDraft} from './face-draft-storage.mjs';

const face=(photo,seed=0)=>({
 sourcePhoto:photo,name:'テスト顔',url:'data:image/jpeg;base64,QUJDRA==',
 vector:Array.from({length:32},(_,i)=>(i+seed)/64)
});
const binary=(size=6)=>({size,slice(){return this}});
const sample=()=>({
 schema:FACE_DRAFT_SCHEMA,version:1,savedAt:1761019200000,
 data:{
  photos:[{name:'test1.jpg',size:6,blob:binary(),type:'image/jpeg'},
          {name:'test2.jpg',size:6,blob:binary(),type:'image/jpeg'}],
  photoNames:['test1.jpg','test2.jpg'],
  faces:[face(0),face(1,4)],
  groups:[{id:'unknown',members:[]},{id:'1',members:[0]},{id:'2',members:[1]}],
  initialFaceGroups:['1','2'],
  verifiedPairs:[{i:0,j:1,same:true}],
  groupNames:[],roster:[],verifiedFolderNames:[],excludedVerifiedFolders:[],
  manualPhotoFolderChoices:[],newManualPhotoFolders:[],manualPhotoAssignments:[],excludedFacePairs:[],
  rosterClass:'tulip'
 }
});
test('complete photo, embeddings, and teacher labels can be saved',()=>{
 const s=sample(),result=validateFaceDraft(s);
 assert.equal(result.ok,true);
 assert.equal(result.photoCount,2);
 assert.equal(result.faceCount,2);
 assert.equal(result.reviewCount,1);
});
test('missing original image blocks the save before any IndexedDB write',()=>{
 const s=sample();s.data.photos[0].blob=null;
 assert.equal(validateFaceDraft(s).ok,false);
});
test('photo name / size mismatch blocks unsafe restore',()=>{
 const s=sample();s.data.photos[1].size=9;
 assert.equal(validateFaceDraft(s).ok,false);
});
test('same source photo faces cannot be confirmed identical in a saved draft',()=>{
 const s=sample();s.data.faces[1].sourcePhoto=0;
 assert.equal(validateFaceDraft(s).ok,false);
});
test('duplicate or out-of-range face references cannot be restored',()=>{
 const s=sample();s.data.groups[2].members=[0];
 assert.equal(validateFaceDraft(s).ok,false);
 const other=sample();other.data.verifiedPairs[0].j=100;
 assert.equal(validateFaceDraft(other).ok,false);
});
test('missing face groups are not treated as valid evidence',()=>{
 const s=sample();s.data.groups[1].members=[];
 assert.equal(validateFaceDraft(s).ok,false);
});
test('a snapshot can include adult exclusions and new photo-only folders',()=>{
 const s=sample();
 s.data.excludedVerifiedFolders=['0'];
 s.data.newManualPhotoFolders=[['manual-1',{name:'写真だけの園児'}]];
 s.data.manualPhotoFolderChoices=[[0,['manual-1']]];
 assert.equal(validateFaceDraft(s).ok,true);
});
test('future schema versions are refused without mutating a draft',()=>{
 const s=sample();s.version=2;
 assert.equal(validateFaceDraft(s).ok,false);
});
test('no detected faces still supports manual photo sorting',()=>{
 const s=sample();s.data.faces=[];s.data.groups=[{id:'unknown',members:[]}];
 s.data.initialFaceGroups=[];s.data.verifiedPairs=[];
 assert.equal(validateFaceDraft(s).ok,true);
});
test('invalid generated child folder metadata cannot restore',()=>{
 const s=sample();s.data.newManualPhotoFolders=[['unknown-key',{name:'X'}]];
 assert.equal(validateFaceDraft(s).ok,false);
});

test('corrupted child roster rows never alter a current album',()=>{
 const data=sample();data.data.roster=[null];
 assert.equal(validateFaceDraft(data).ok,false);
 const wrong=sample();wrong.data.groupNames=[[null,'bad']];
 assert.equal(validateFaceDraft(wrong).ok,false);
});
test('corrupted recognition tensor never passes pre-restore checking',()=>{
 const data=sample();data.data.faces[0].recognitionInput={malicious:'object'};
 assert.equal(validateFaceDraft(data).ok,false);
 const good=sample();good.data.faces[0].recognitionInput=new Float32Array(3*112*112);
 assert.equal(validateFaceDraft(good).ok,true);
});
test('invalid manual photo folder references cannot be restored',()=>{
 const data=sample();data.data.manualPhotoFolderChoices=[[123,['manual-1']]];
 assert.equal(validateFaceDraft(data).ok,false);
});

test('a photo-folder correction survives validation while legacy snapshots remain supported',()=>{
 const older=sample();
 assert.equal(validateFaceDraft(older).ok,true);
 const edited=sample();
 edited.data.photoFolderCorrections=[[0,[['0',false]]],[1,[['1',true]]]];
 assert.equal(validateFaceDraft(edited).ok,true);
 assert.deepEqual(edited.data.photoFolderCorrections[0],[0,[['0',false]]]);
});
test('unsafe photo-level corrections cannot overwrite a valid saved draft',()=>{
 const invalidIndex=sample();
 invalidIndex.data.photoFolderCorrections=[[99,[['0',false]]]];
 assert.equal(validateFaceDraft(invalidIndex).ok,false);
 const duplicate=sample();
 duplicate.data.photoFolderCorrections=[[0,[['0',false],['0',true]]]];
 assert.equal(validateFaceDraft(duplicate).ok,false);
 const typeError=sample();
 typeError.data.photoFolderCorrections=[[1,[['1','delete']]]];
 assert.equal(validateFaceDraft(typeError).ok,false);
});
