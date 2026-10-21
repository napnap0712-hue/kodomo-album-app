// Synthetic-only teacher-anchored grouping tests. No real photos or embeddings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeacherSeedGroups,suggestTeacherSeedPairs} from './teacher-seed-matches.mjs';

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
