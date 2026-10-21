// Synthetic-only checks. No photos, names, embedding vectors or user labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerifiedPhotoFolders} from './teacher-verified-folders.mjs';

const pair=(i,j,same)=>({i,j,same});
test('positive teacher links give safe folders and retain every face',()=>{
 const result=buildVerifiedPhotoFolders([0,1,1,2,3],[
  pair(0,1,true),pair(1,3,true),pair(2,4,true),pair(0,2,false)
 ]);
 assert.equal(result.clusteredCount,2);
 assert.equal(result.singletonCount,0);
 assert.equal(result.coveredFaces,5);
 assert.equal(result.allFacesCovered,true);
 assert.equal(result.hasSourcePhotoConflicts,false);
 assert.deepEqual(result.contradictions,[]);
 assert.deepEqual(result.buckets.map(g=>g.members.length).sort(),[2,3]);
});
test('single-photo faces never share a bucket',()=>{
 const result=buildVerifiedPhotoFolders([0,0,1],[pair(0,1,true)]);
 assert.equal(result.clusteredCount,0);
 assert.equal(result.singletonCount,3);
 assert.deepEqual(result.contradictions,[pair(0,1,true)]);
 assert.equal(result.hasSourcePhotoConflicts,false);
});
test('negative comparison prevents a conflicting transitive merge',()=>{
 const result=buildVerifiedPhotoFolders([0,1,2],[
  pair(0,1,true),pair(1,2,true),pair(0,2,false)
 ]);
 assert.equal(result.contradictions.length,1);
 assert.equal(result.allFacesCovered,true);
 assert.equal(result.hasSourcePhotoConflicts,false);
});
test('four separate faces can be individually distinct based on human negatives',()=>{
 const photos=[0,1,2,3],negative=[];
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)negative.push(pair(i,j,false));
 const result=buildVerifiedPhotoFolders(photos,negative);
 assert.equal(result.clusteredCount,0);
 assert.equal(result.singletonCount,4);
 assert.equal(result.separatedSingletonCount,4);
 assert.equal(result.buckets.length,4);
});
test('a face with no confirmed comparisons stays a single preview bucket',()=>{
 const result=buildVerifiedPhotoFolders([0,1,2],[pair(0,1,true)]);
 assert.equal(result.buckets.length,2);
 assert.equal(result.singletonCount,1);
 assert.equal(result.separatedSingletonCount,0);
 assert.equal(result.allFacesCovered,true);
});
test('invalid or out-of-range labels do not add faces or create folders',()=>{
 const result=buildVerifiedPhotoFolders([0,1],[
  pair(-1,1,true),pair(2,1,true),pair(0,0,true),{i:0,j:1,same:'true'}
 ]);
 assert.equal(result.reviewedPairs,0);
 assert.equal(result.buckets.length,2);
 assert.equal(result.allFacesCovered,true);
});
test('empty face list produces empty folder preview',()=>{
 const result=buildVerifiedPhotoFolders([],[]);
 assert.equal(result.buckets.length,0);
 assert.equal(result.coveredFaces,0);
 assert.equal(result.allFacesCovered,true);
});

test('correcting one mistaken same-child bridge separates only the affected folder',()=>{
 const photos=[0,1,2,3,4,5,6];
 const original=[
  pair(0,1,true),pair(1,2,true),
  pair(2,3,true), // mistakenly connected two children
  pair(3,4,true),pair(5,6,true)
 ];
 const before=buildVerifiedPhotoFolders(photos,original);
 assert.deepEqual(before.buckets.map(b=>b.members.length).sort(),[2,5]);
 const corrected=original.map(p=>p.i===2&&p.j===3?pair(2,3,false):p);
 const after=buildVerifiedPhotoFolders(photos,corrected);
 assert.deepEqual(after.buckets.map(b=>b.members.length).sort(),[2,2,3]);
 assert.deepEqual(after.contradictions,[]);
 assert.equal(after.allFacesCovered,true);
 assert.equal(after.hasSourcePhotoConflicts,false);
 assert.ok(after.buckets.some(b=>b.members.includes(5)&&b.members.includes(6)));
});
test('a remaining contradictory same-child link is reported, never silently treated as correct',()=>{
 const photos=[0,1,2,3];
 const reviewed=[pair(0,1,true),pair(1,2,true),pair(2,3,true),pair(1,3,true)];
 const corrected=reviewed.map(p=>p.i===2&&p.j===3?pair(2,3,false):p);
 const result=buildVerifiedPhotoFolders(photos,corrected);
 assert.ok(result.contradictions.length>0);
 assert.equal(result.allFacesCovered,true);
 assert.equal(result.hasSourcePhotoConflicts,false);
});
