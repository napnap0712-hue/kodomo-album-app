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

test('photo-only new folder accepts a temporary child name and shared image references',()=>{
 const made={key:'manual-3',kind:'manual',members:[],photos:[],customName:'卒園児候補'};
 const roster=[{id:'child-x',name:'仮の園児'}];
 const selections=new Map([['manual-3','child-x']]);
 const photos=new Map([[0,new Set(['manual-3'])],[4,new Set(['manual-3'])]]);
 const result=buildNamedFolderPreview([made],roster,selections,photos);
 assert.equal(result.namedCount,1);
 assert.equal(result.allAssignmentsValid,true);
 assert.deepEqual(result.named[0].faceIndexes,[]);
 assert.deepEqual(result.named[0].photoIndexes,[0,4]);
 assert.deepEqual(result.named[0].manuallyAdded,[0,4]);
 assert.equal(result.named[0].key,'manual-3');
});
test('excluding a worker face folder removes only its nursery-class assignment',()=>{
 const staff={kind:'confirmed',members:[0,1],photos:[0,1]};
 const child={kind:'confirmed',members:[2,3],photos:[1,2]};
 const roster=[{id:'kid',name:'架空園児'}];
 const selected=new Map([['0:1','kid'],['2:3','kid']]);
 const before=buildNamedFolderPreview([staff,child],roster,selected);
 assert.equal(before.allAssignmentsValid,false);
 const after=buildNamedFolderPreview([child],roster,selected);
 assert.equal(after.allAssignmentsValid,true);
 assert.equal(after.namedCount,1);
 assert.deepEqual(after.named[0].photoIndexes,[1,2]);
});
