import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterCurrentAlbumFaces,assignConfirmedAlbumCluster,suggestCurrentAlbumGroupMerges,mergeTeacherAlbumGroups} from './cluster-current-album.mjs';

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
 const faces=[sample(0,1),sample(0,1),sample(1,1)];
 const out=clusterCurrentAlbumFaces(faces,{similarity});
 assert.ok(out.groups.length>=2);
 assert.ok(out.groups.every(g=>
  g.faceIndexes.length===new Set(g.faceIndexes.map(i=>faces[i].index)).size));
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

test('相互1位ではない顔も強い一致なら慎重にグループへ追加できる',()=>{
 const score=(a,b)=>{
  const pair=[a[0],b[0]].sort().join('-');
  return {'0-1':.93,'0-2':.84,'1-2':.66}[pair]??.2;
 };
 const out=clusterCurrentAlbumFaces([sample(0,0),sample(1,1),sample(2,2)],{similarity:score});
 assert.equal(out.groups.length,1);
 assert.deepEqual(out.groups[0].photoIndexes,[0,1,2]);
});
test('複数の園児グループに同程度に似る写真は勝手に統合しない',()=>{
 const score=(a,b)=>{
  const pair=[a[0],b[0]].sort().join('-');
  return {'0-1':.93,'2-3':.93,'0-4':.85,'1-4':.66,'2-4':.84,'3-4':.67}[pair]??.2;
 };
 const out=clusterCurrentAlbumFaces([0,1,2,3,4].map(i=>sample(i,i)),{similarity:score});
 assert.equal(out.groups.length,3);
 assert.ok(out.groups.some(g=>g.photoIndexes.join(',')==='4'));
});
test('同一写真内の顔を追加パスでも同じ人物として統合しない',()=>{
 const score=(a,b)=>{
  const pair=[a[0],b[0]].sort().join('-');
  return {'0-1':.93,'0-2':.94,'1-2':.84}[pair]??.2;
 };
 const out=clusterCurrentAlbumFaces([sample(0,0),sample(1,1),sample(0,2)],{similarity:score});
 assert.ok(out.groups.every(g=>g.faceIndexes.length===new Set(g.faceIndexes.map(i=>[0,1,0][i])).size));
});

test('写真150枚を75組程度にまとめる目標、同一人物の相互一致がある場合のみ',()=>{
 const faces=Array.from({length:150},(_,i)=>({index:i,embedding:[Math.floor(i/3)]}));
 const out=clusterCurrentAlbumFaces(faces,{
  similarity:(a,b)=>a[0]===b[0]?.79:.31,photoCount:150
 });
 assert.equal(out.targetGroups,75);
 assert.equal(out.groups.length,75);
 assert.ok(out.adaptiveMerges>0);
});
test('写真を半分のグループにするため異なる人物を強制統合しない',()=>{
 const faces=Array.from({length:30},(_,i)=>({index:i,embedding:[i]}));
 const out=clusterCurrentAlbumFaces(faces,{
  similarity:(a,b)=>a[0]===b[0]?.92:.34,photoCount:30
 });
 assert.equal(out.targetGroups,15);
 assert.equal(out.groups.length,30);
});
test('追加の人数調整でも集合写真で異なる顔を一つにしない',()=>{
 const faces=[
  {index:0,embedding:[1]},{index:0,embedding:[2]},
  {index:1,embedding:[3]},{index:2,embedding:[4]}
 ];
 const out=clusterCurrentAlbumFaces(faces,{similarity:()=>.83,photoCount:3});
 assert.ok(out.groups.every(g=>g.faceIndexes.length===new Set(g.faceIndexes.map(i=>faces[i].index)).size));
});


test('別グループの似た顔をスコア順に候補表示し、自動統合しない',()=>{
 const faces=[sample(0,1),sample(1,2),sample(2,3)];
 const groups=faces.map((_,i)=>({key:'g'+i,faceIndexes:[i]}));
 const sim=(a,b)=>a[0]===1&&b[0]===2||a[0]===2&&b[0]===1?.79:
  a[0]===1&&b[0]===3||a[0]===3&&b[0]===1?.61:.25;
 const out=suggestCurrentAlbumGroupMerges(faces,groups,{similarity:sim});
 assert.equal(out.get('g0')[0].key,'g1');
 assert.equal(out.get('g0')[1].key,'g2');
 assert.deepEqual(groups.map(g=>g.faceIndexes),[[0],[1],[2]]);
});
test('同じ元写真の別の顔を候補に出さず、手動統合も拒否',()=>{
 const faces=[sample(0,1),sample(0,1)];
 const groups=[{key:'a',faceIndexes:[0]},{key:'b',faceIndexes:[1]}];
 const out=suggestCurrentAlbumGroupMerges(faces,groups,{similarity:()=>.99});
 assert.equal(out.get('a').length,0);
 assert.throws(()=>mergeTeacherAlbumGroups(groups,faces,'a','b'),/同じ写真/);
});
test('先生のグループ統合は元の仮グループを変更せず元に戻せる',()=>{
 const faces=[sample(0,1),sample(1,1)];
 const groups=[{key:'a',faceIndexes:[0]},{key:'b',faceIndexes:[1]}];
 const joined=mergeTeacherAlbumGroups(groups,faces,'b','a');
 assert.equal(joined.length,1);
 assert.deepEqual(joined[0].faceIndexes,[0,1]);
 assert.deepEqual(groups.map(g=>g.faceIndexes),[[0],[1]]);
});
