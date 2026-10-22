import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterCurrentAlbumFaces,assignConfirmedAlbumCluster} from './cluster-current-album.mjs';

const sample=(index,id)=>({index,embedding:[id]});
const similarity=(a,b)=>a[0]===b[0]?.91:.21;

test('アルバムAとBは写真だけから独立して解析される',()=>{
 const first=clusterCurrentAlbumFaces([sample(0,1),sample(1,1),sample(2,2)],{similarity});
 const second=clusterCurrentAlbumFaces([sample(0,3),sample(1,4)],{similarity});
 assert.equal(first.groups.length,2);
 assert.equal(first.groups.find(g=>g.photoIndexes.length===2).photoIndexes.join(','),'0,1');
 assert.equal(second.groups.length,2);
 assert.deepEqual(second.groups.map(g=>g.photoIndexes),[[0],[1]]);
});
test('集合写真の異なる顔は同じ園児グループにまとめない',()=>{
 const out=clusterCurrentAlbumFaces([sample(0,1),sample(0,1),sample(1,1)],{similarity});
 assert.equal(out.groups.length,2);
 assert.ok(out.groups.every(g=>g.photoIndexes.length===new Set(g.photoIndexes).size));
});
test('一つの写真に複数の園児IDを付けても元写真は複製されない',()=>{
 const one=assignConfirmedAlbumCluster({photoAssignments:[[]],photoCount:1,photoIndexes:[0],
  childId:'one',validChildIds:['one','two']});
 const two=assignConfirmedAlbumCluster({photoAssignments:one,photoCount:1,photoIndexes:[0],
  childId:'two',validChildIds:['one','two']});
 assert.deepEqual(two,[['one','two']]);assert.deepEqual(one,[['one']]);
});
test('先生が名前を付けるまでは、解析だけで園児IDを書き換えない',()=>{
 const old=[['kid-1'],[]];
 const ai=clusterCurrentAlbumFaces([sample(0,1),sample(1,1)],{similarity});
 assert.deepEqual(old,[['kid-1'],[]]);assert.equal(ai.groups.length,1);
 const changed=assignConfirmedAlbumCluster({photoAssignments:old,photoCount:2,
  photoIndexes:ai.groups[0].photoIndexes,childId:'kid-2',validChildIds:['kid-1','kid-2']});
 assert.deepEqual(changed,[['kid-1','kid-2'],['kid-2']]);
 assert.deepEqual(old,[['kid-1'],[]]);
});
test('別アルバムの園児ID・不正な写真番号を渡しても拒否',()=>{
 assert.throws(()=>assignConfirmedAlbumCluster({photoAssignments:[[]],photoCount:1,photoIndexes:[0],
  childId:'previous-album-child',validChildIds:['current']}),/名簿/);
 assert.throws(()=>assignConfirmedAlbumCluster({photoAssignments:[[]],photoCount:1,photoIndexes:[5],
  childId:'current',validChildIds:['current']}),/番号/);
});
test('同一写真内の顔の特徴が極端に似ていても、同じグループに入れない',()=>{
 const v=[sample(0,5),sample(0,5)];
 const result=clusterCurrentAlbumFaces(v,{similarity});
 assert.equal(result.groups.length,2);
});
