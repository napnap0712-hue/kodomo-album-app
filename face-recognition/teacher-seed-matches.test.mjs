// Synthetic-only teacher-anchored grouping tests. No real photos or embeddings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeacherSeedGroups,suggestTeacherSeedPairs,suggestUnassignedFacePairs} from './teacher-seed-matches.mjs';

const photos=[0,1,2,3,4,4,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const confirmed=[
 {i:21,j:22,same:true},{i:4,j:7,same:true},{i:3,j:6,same:true},
 {i:1,j:6,same:true},{i:11,j:14,same:true},{i:5,j:8,same:true},{i:5,j:14,same:true}
];
test('seven confirmations create four multi-photo identity seeds',()=>{
 const seeds=buildTeacherSeedGroups(photos,confirmed);
 assert.deepEqual(seeds.map(g=>g.length).sort(),[2,2,3,4]);
 assert.equal(new Set(seeds.flat()).size,11);
 for(const seed of seeds)assert.equal(new Set(seed.map(i=>photos[i])).size,seed.length);
});
test('a rejected group is excluded even if its scores are artificially strong',()=>{
 const rejected=[...confirmed,{i:0,j:21,same:false}];
 const suggestions=suggestTeacherSeedPairs(photos,rejected,(a,b)=>a===0&&[21,22].includes(b)?.98:.2,30);
 assert.ok(suggestions.every(x=>x.face!==0||!x.members.includes(21)));
});
test('never suggest merging faces from the same photograph',()=>{
 const suggestions=suggestTeacherSeedPairs(photos,confirmed,()=>.99,30);
 for(const s of suggestions)for(const id of s.members)
  assert.notEqual(photos[s.face],photos[id]);
});
test('teacher-approved faces never become unmatched recommendations',()=>{
 const seeds=buildTeacherSeedGroups(photos,confirmed);
 const assigned=new Set(seeds.flat());
 const suggestions=suggestTeacherSeedPairs(photos,confirmed,()=>.8,30);
 assert.ok(suggestions.every(x=>!assigned.has(x.face)));
});
test('no seeds: no automatic identity assignments',()=>{
 assert.deepEqual(suggestTeacherSeedPairs(photos,[],()=>.9),[]);
});
test('invalid same-face or out-of-range annotations cannot create components',()=>{
 const feedback=[{i:4,j:5,same:true},{i:-1,j:3,same:true},{i:200,j:2,same:true},{i:6,j:6,same:true}];
 assert.deepEqual(buildTeacherSeedGroups(photos,feedback),[]);
});
test('teacher positive edges do not contradict explicit negatives',()=>{
 const feedback=[{i:1,j:4,same:true},{i:1,j:2,same:true},{i:4,j:2,same:false}];
 const seeds=buildTeacherSeedGroups(photos,feedback);
 assert.equal(seeds.length,1);
 assert.equal(seeds[0].length,2);
});

test('new child proposals never conflict with teacher rejections or shared photos',()=>{
 const photos=[0,1,2,3,4,4,5,6];
 const checked=[{i:0,j:1,same:true},{i:2,j:3,same:false},{i:4,j:5,same:false}];
 const rows=suggestUnassignedFacePairs(photos,checked,()=>.8,()=>.8,12);
 assert.ok(rows.length>0);
 for(const pair of rows){
  assert.notEqual(photos[pair.i],photos[pair.j]);
  assert.ok(!checked.some(p=>p.i===pair.i&&p.j===pair.j));
  assert.ok(![0,1].includes(pair.i)&&![0,1].includes(pair.j));
 }
});
test('a two-model consensus rank is computed without averaging incompatible scores',()=>{
 const light=(i,j)=>i===0&&j===1?.95:i===2&&j===3?.8:.12;
 const r50=(i,j)=>i===0&&j===1?.10:i===2&&j===3?.9:.08;
 const rows=suggestUnassignedFacePairs([0,1,2,3],[],light,r50,4);
 assert.equal(rows.length,4);
 assert.ok(rows.every(p=>Number.isFinite(p.reviewRank)));
 assert.ok(rows.some(p=>p.i===0&&p.j===1));
 assert.ok(rows.some(p=>p.i===2&&p.j===3));
});
test('all faces in same source photograph cannot become a new-child match',()=>{
 assert.deepEqual(suggestUnassignedFacePairs([0,0],[],()=>.9,()=>.9),[]);
});
