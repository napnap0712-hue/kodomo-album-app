// Synthetic-only regression tests: never use pupil photos or real embeddings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {groupFacesWithEvidence} from './face-group-evidence.mjs';

function run(photos, scores, strategy='balanced'){
 return groupFacesWithEvidence(photos,(i,j)=>scores[i][j],0.65,strategy);
}
function sizes(result){return result.groups.map(g=>g.length).sort((a,b)=>a-b)}
function assertSafe(result,photos){
 const ids=result.groups.flat();
 assert.equal(ids.length,photos.length,'all face records are assigned');
 assert.equal(new Set(ids).size,photos.length,'no duplicated face records');
 for(const group of result.groups){
  assert.equal(new Set(group.map(i=>photos[i])).size,group.length,'one identity cannot contain two faces from the same image');
 }
}
test('cannot combine different faces in one photo, even with 0.99 similarity',()=>{
 const photos=[0,0],result=run(photos,[[1,.99],[.99,1]]);
 assert.deepEqual(sizes(result),[1,1]);assertSafe(result,photos);
});
test('strong unique two-photo match is grouped',()=>{
 const photos=[0,1],result=run(photos,[[1,.77],[.77,1]]);
 assert.deepEqual(sizes(result),[2]);assertSafe(result,photos);
});
test('lower 0.62 score alone does not join different identities',()=>{
 const photos=[0,1],result=run(photos,[[1,.62],[.62,1]]);
 assert.deepEqual(sizes(result),[1,1]);assertSafe(result,photos);
});
test('lookalike bridge does not chain across weak pair',()=>{
 const photos=[0,1,2],result=run(photos,[[1,.88,.81],[.88,1,.45],[.81,.45,1]]);
 assert.deepEqual(sizes(result),[1,2]);assertSafe(result,photos);
});
test('three independent high-confidence photos form a group',()=>{
 const photos=[0,1,2],result=run(photos,[[1,.88,.85],[.88,1,.87],[.85,.87,1]]);
 assert.deepEqual(sizes(result),[3]);assertSafe(result,photos);
});
test('near-equal rivals are not merged blindly',()=>{
 const photos=[0,1,2],result=run(photos,[[1,.76,.75],[.76,1,.35],[.75,.35,1]]);
 assert.deepEqual(sizes(result),[1,1,1]);assertSafe(result,photos);
});
test('all three strategies assign each face once and respect the source-image constraint',()=>{
 const photos=[0,1,2,2,3];
 const scores=[[1,.87,.7,.86,.82],[.87,1,.81,.8,.75],[.7,.81,1,.91,.6],[.86,.8,.91,1,.88],[.82,.75,.6,.88,1]];
 for(const mode of ['conservative','balanced','exploratory'])assertSafe(run(photos,scores,mode),photos);
});
test('empty batch has no groups',()=>{
 const result=run([],[]);
 assert.deepEqual(result.groups,[]);
});
