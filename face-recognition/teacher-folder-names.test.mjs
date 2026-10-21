import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNamedFolderPreview,verifiedFolderKey} from './teacher-folder-names.mjs';
const buckets=[
 {kind:'confirmed',members:[4,0],photos:[0,3]},
 {kind:'confirmed',members:[2,3],photos:[1,3]},
 {kind:'individual',members:[1],photos:[2]}
];
const roster=[{id:'child-a',name:'園児A'},{id:'child-b',name:'園児B'},{id:'child-c',name:'園児C'}];
test('stable face keys do not depend on alphabetical order',()=>{
 assert.equal(verifiedFolderKey(buckets[0]),'0:4');
 assert.equal(verifiedFolderKey({...buckets[0],members:[0,4]}),'0:4');
});
test('manual shared source photo is referenced in several named folders without duplication',()=>{
 const choices=new Map([[13,new Set(['0:4','2:3'])]]);
 const result=buildNamedFolderPreview(buckets,roster,new Map([['0:4','child-a'],['2:3','child-b']]),choices);
 assert.equal(result.namedCount,2);
 assert.deepEqual(result.named[0].photoIndexes,[0,3,13]);
 assert.deepEqual(result.named[1].photoIndexes,[1,3,13]);
 assert.deepEqual(result.named[0].manuallyAdded,[13]);
 assert.equal(result.unusedRoster.length,1);
 assert.equal(result.allAssignmentsValid,true);
});
test('same child cannot be assigned to two different provisional folders',()=>{
 const chosen=new Map([['0:4','child-a'],['2:3','child-a']]);
 const result=buildNamedFolderPreview(buckets,roster,chosen);
 assert.equal(result.duplicates.length,1);
 assert.equal(result.namedCount,1);
 assert.equal(result.allAssignmentsValid,false);
});
test('an unknown child or missing name never counts as an assigned child',()=>{
 const chosen=new Map([['0:4','not-in-class'],['2:3','child-b']]);
 const result=buildNamedFolderPreview(buckets,roster,chosen);
 assert.equal(result.invalid.length,1);
 assert.equal(result.namedCount,1);
 assert.equal(result.allAssignmentsValid,false);
});
test('a missing-image assignment keyed to an earlier split folder is never inherited',()=>{
 const old='0:4',updatedBucket={kind:'individual',members:[4],photos:[3]};
 const manual=new Map([[13,new Set([old])]]);
 const result=buildNamedFolderPreview([updatedBucket],roster,new Map([[old,'child-a']]),manual);
 assert.equal(result.namedCount,0);
 assert.deepEqual(result.named[0].photoIndexes,[3]);
 assert.deepEqual(result.named[0].manuallyAdded,[]);
});
test('invalid IDs and duplicate roster IDs never produce extra available children',()=>{
 const mixed=[{id:'child-a',name:'園児A'},{id:'child-a',name:'重複'}, {id:null,name:'不明'}, {name:'ID無し'}];
 const result=buildNamedFolderPreview(buckets,mixed,new Map());
 assert.equal(result.unusedRoster.length,1);
 assert.equal(result.namedCount,0);
});
