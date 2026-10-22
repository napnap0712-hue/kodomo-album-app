import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterCurrentAlbumFaces,assignConfirmedAlbumCluster,suggestCurrentAlbumGroupMerges,mergeTeacherAlbumGroups,mergeTeacherAlbumGroupsBatch} from './cluster-current-album.mjs';

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

test('3つの候補にチェックして1回でまとめても元データは不変',()=>{
 const faces=[sample(0,1),sample(1,1),sample(2,1),sample(3,1)];
 const groups=[{key:'target',faceIndexes:[0]},{key:'a',faceIndexes:[1]},
   {key:'b',faceIndexes:[2]},{key:'c',faceIndexes:[3]}];
 const combined=mergeTeacherAlbumGroupsBatch(groups,faces,'target',['a','b','c']);
 assert.equal(combined.length,1);
 assert.deepEqual(combined[0].faceIndexes,[0,1,2,3]);
 assert.deepEqual(groups.map(g=>g.faceIndexes),[[0],[1],[2],[3]]);
});
test('複数統合の途中で同じ写真の顔が重なれば全部取り消す',()=>{
 const faces=[sample(0,1),sample(1,1),sample(1,2),sample(2,1)];
 const groups=[{key:'target',faceIndexes:[0]},{key:'a',faceIndexes:[1]},
   {key:'b',faceIndexes:[2]},{key:'c',faceIndexes:[3]}];
 const original=JSON.stringify(groups);
 assert.throws(()=>mergeTeacherAlbumGroupsBatch(groups,faces,'target',['a','b','c']),/同じ写真/);
 assert.equal(JSON.stringify(groups),original);
});
test('一括統合は空選択、同グループ重複、存在しない候補を拒否',()=>{
 const faces=[sample(0,1),sample(1,1)];
 const groups=[{key:'target',faceIndexes:[0]},{key:'a',faceIndexes:[1]}];
 assert.throws(()=>mergeTeacherAlbumGroupsBatch(groups,faces,'target',[]),/チェック/);
 assert.throws(()=>mergeTeacherAlbumGroupsBatch(groups,faces,'target',['target']),/重複/);
 assert.throws(()=>mergeTeacherAlbumGroupsBatch(groups,faces,'target',['a','a']),/重複/);
 assert.throws(()=>mergeTeacherAlbumGroupsBatch(groups,faces,'target',['missing']),/確認/);
 assert.deepEqual(groups[0].faceIndexes,[0]);
});

test('147枚の似た写真を近傍の同意で追加統合し、同一園児を分裂させにくくする',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i%12,i]}));
 const similarity=(a,b)=>a[0]===b[0]?
  (.68+.09*(((a[1]*67+b[1]*97)%19)/18)):.32;
 const out=clusterCurrentAlbumFaces(faces,{similarity,photoCount:147});
 assert.equal(out.targetGroups,74);
 assert.ok(out.communityMerges+out.clusteringDiagnostics.neighborhoodMerges>0);
 assert.ok(out.groups.length<100,
  '似ている写真を従来方式よりまとめられること');
 assert.ok(out.groups.length<out.beforeCommunityGroups);
 assert.ok(out.groups.every(group=>
  new Set(group.faceIndexes.map(i=>faces[i].embedding[0])).size===1),
  '別園児の顔を混ぜないこと');
});
test('顔同士の比較値が低い別園児は目標枚数まで強制的にまとめない',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i]}));
 const out=clusterCurrentAlbumFaces(faces,{
  similarity:(a,b)=>a[0]===b[0]?.95:.39,photoCount:147
 });
 assert.equal(out.groups.length,147);
 assert.equal(out.communityMerges,0);
});
test('同じ写真にいる別の顔はコミュニティ結合でも一つにならない',()=>{
 const faces=Array.from({length:30},(_,i)=>({
  index:Math.floor(i/2),embedding:[i%2,i]
 }));
 const out=clusterCurrentAlbumFaces(faces,{
  similarity:(a,b)=>a[0]===b[0]?.77:.73,photoCount:15
 });
 assert.ok(out.groups.every(group=>
  group.faceIndexes.length===new Set(group.faceIndexes.map(i=>faces[i].index)).size
 ));
});

test('147枚の中程度の顔一致も保守的判定後に端末内で追加グループ化',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i%12,i]}));
 const sim=(a,b)=>a[0]===b[0]?.68+.09*(((a[1]*67+b[1]*97)%19)/18):.32;
 const result=clusterCurrentAlbumFaces(faces,{similarity:sim,photoCount:147});
 assert.ok(result.clusteringDiagnostics.calibratedMerges>=0);
 assert.ok(result.groups.length<=result.beforeCommunityGroups);
 assert.equal(result.groups.length,74);
 assert.ok(result.groups.every(g=>new Set(g.faceIndexes.map(i=>faces[i].embedding[0])).size===1));
});
test('弱めの顔一致の分布も匿名の集計だけを返す',()=>{
 const faces=[sample(0,1),sample(1,2),sample(2,3)];
 const result=clusterCurrentAlbumFaces(faces,{similarity:()=>.62,photoCount:3});
 const d=result.clusteringDiagnostics;
 assert.equal(d.negativePairs,0);
 assert.equal(d.nearestScoreRanges.weak,3);
 assert.equal(Object.values(d.nearestScoreRanges).reduce((x,y)=>x+y,0),3);
 assert.equal(d.calibratedThreshold,.675);
 assert.ok(!('embeddings' in d)&&!('photos' in d));
});
test('同じ写真の別人物が似る場合は結合基準を高める',()=>{
 const faces=[
  {index:0,embedding:[0,0]},{index:0,embedding:[1,0]},
  {index:1,embedding:[0,1]},{index:2,embedding:[1,1]},
  {index:3,embedding:[0,2]},{index:4,embedding:[1,2]}
 ];
 const sim=(a,b)=>a[0]===b[0]?.73:.70;
 const result=clusterCurrentAlbumFaces(faces,{similarity:sim,photoCount:5});
 assert.ok(result.clusteringDiagnostics.negativePairs>=1);
 assert.ok(result.clusteringDiagnostics.calibratedThreshold>=.78-1e-10);
 assert.ok(result.groups.every(g=>g.faceIndexes.length===new Set(g.faceIndexes.map(i=>faces[i].index)).size));
});
test('異なる園児の一致が低ければ147顔でも目標に合わせて無理に統合しない',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i]}));
 const result=clusterCurrentAlbumFaces(faces,{similarity:()=>.28,photoCount:147});
 assert.equal(result.groups.length,147);
 assert.equal(result.clusteringDiagnostics.calibratedMerges,0);
});

test('147枚に近い実運用状況で横顔が混ざる同一人物の分裂グループを複数強一致から再結合する',()=>{
 // 36 photos, 48 faces: 12 are co-appearance photos with different children.
 // Each child has two internally clear pairs; an extreme profile makes a
 // cross-pair .52 even though two different cross-pairs are .82 and .78.
 // The previous all-pairs cutoff rejected this otherwise supported match.
 const faces=Array.from({length:48},(_,i)=>{
  const index=i<36?i:i-36;
  return {index,embedding:[Math.floor(i/4),i%4,index]};
 });
 const sim=(a,b)=>{
  if(a[0]!==b[0])return a[2]===b[2]?.61:.3;
  const pair=[a[1],b[1]].sort((x,y)=>x-y).join(',');
  return {'0,1':.9,'2,3':.9,'0,2':.82,'0,3':.52,'1,2':.55,'1,3':.78}[pair]??.3;
 };
 const result=clusterCurrentAlbumFaces(faces,{similarity:sim,photoCount:36});
 assert.equal(result.clusteringDiagnostics.calibratedThreshold,.74);
 assert.equal(result.clusteringDiagnostics.calibratedMerges,0);
 assert.ok(result.clusteringDiagnostics.consensusMerges>0);
 assert.equal(result.groups.length,18);
 assert.ok(result.groups.every(g=>
  new Set(g.faceIndexes.map(i=>faces[i].embedding[0])).size===1));
 assert.ok(result.groups.every(g=>
  g.faceIndexes.length===new Set(g.faceIndexes.map(i=>faces[i].index)).size));
});
test('曖昧な一対一の一致を人数合わせで強制統合しない',()=>{
 const faces=Array.from({length:30},(_,i)=>({index:i,embedding:[i]}));
 const result=clusterCurrentAlbumFaces(faces,{
  similarity:(a,b)=>a[0]===b[0]?.99:.74,photoCount:30
 });
 assert.equal(result.groups.length,30);
 assert.equal(result.clusteringDiagnostics.consensusMerges,0);
});
test('顔特徴や写真そのものを診断結果に含めない',()=>{
 const faces=[sample(0,1),sample(1,1),sample(2,2)];
 const result=clusterCurrentAlbumFaces(faces,{similarity,photoCount:3});
 const diag=result.clusteringDiagnostics;
 assert.ok(Number.isInteger(diag.consensusCandidates));
 assert.ok(Number.isInteger(diag.consensusAmbiguous));
 assert.ok(Number.isInteger(diag.consensusConflict));
 assert.ok(!('embedding' in diag)&&!('photos' in diag)&&!('samples' in diag));
});


test('147枚の繰り返し撮影で類似度に多数の同点があっても人物ごとにまとまる',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i%12,i]}));
 const sim=(a,b)=>a[0]===b[0]?.68+.09*(((a[1]*67+b[1]*97)%19)/18):.32;
 const output=clusterCurrentAlbumFaces(faces,{similarity:sim,photoCount:147});
 assert.equal(output.targetGroups,74);
 assert.equal(output.groups.length,74);
 assert.ok(output.clusteringDiagnostics.neighborhoodMerges>0);
 assert.ok(output.groups.every(g=>new Set(g.faceIndexes.map(i=>faces[i].embedding[0])).size===1));
});
test('全員の類似度が一律に高くても背景との差がなければ勝手にまとめない',()=>{
 const faces=Array.from({length:30},(_,i)=>({index:i,embedding:[i]}));
 for(const score of [.74,.79,.82,.85]){
  const output=clusterCurrentAlbumFaces(faces,{similarity:()=>score,photoCount:30});
  assert.equal(output.groups.length,30);
  assert.equal(output.clusteringDiagnostics.neighborhoodMerges,0);
 }
});
test('背景との差がない類似候補を人為的な目標数に合わせて統合しない',()=>{
 const faces=Array.from({length:147},(_,i)=>({index:i,embedding:[i]}));
 const result=clusterCurrentAlbumFaces(faces,{similarity:()=>.72,photoCount:147});
 assert.equal(result.groups.length,147);
 assert.equal(result.clusteringDiagnostics.neighborhoodMerges,0);
 assert.equal(result.targetGroups,74);
});

test('横顔の影響で平均値が低くても、同じ園児の2顔と強く一致した単独候補を救済',()=>{
 const faces=Array.from({length:7},(_,i)=>({index:i,embedding:[i]}));
 const pairs={'0-1':.98,'0-2':.91,'1-2':.92,'0-3':.90,'1-3':.78,'2-3':.43};
 const compare=(a,b)=>pairs[[a[0],b[0]].sort((x,y)=>x-y).join('-')]??.27;
 const out=clusterCurrentAlbumFaces(faces,{similarity:compare,photoCount:7});
 assert.equal(out.targetGroups,4);
 assert.equal(out.clusteringDiagnostics.orphanRescues,1);
 assert.equal(out.groups.length,4);
 assert.ok(out.groups.some(g=>g.faceIndexes.join(',')==='0,1,2,3'));
});
test('単独候補が集合写真の別の顔なら、似ていても既存グループへ追加しない',()=>{
 const faces=Array.from({length:7},(_,i)=>({index:i===3?0:i,embedding:[i]}));
 const pairs={'0-1':.98,'0-2':.91,'1-2':.92,'0-3':.90,'1-3':.78,'2-3':.43};
 const compare=(a,b)=>pairs[[a[0],b[0]].sort((x,y)=>x-y).join('-')]??.27;
 const out=clusterCurrentAlbumFaces(faces,{similarity:compare,photoCount:6});
 assert.equal(out.clusteringDiagnostics.orphanRescues,0);
 assert.ok(out.groups.every(g=>g.faceIndexes.length===new Set(g.faceIndexes.map(i=>faces[i].index)).size));
});
test('単独候補が2つの園児グループにほぼ同じ程度に似る場合は統合を見送る',()=>{
 const faces=Array.from({length:9},(_,i)=>({index:i,embedding:[i]}));
 const pairs={'0-1':.97,'2-4':.98,'0-3':.90,'1-3':.80,'2-3':.895,'3-4':.81};
 const compare=(a,b)=>pairs[[a[0],b[0]].sort((x,y)=>x-y).join('-')]??.26;
 const out=clusterCurrentAlbumFaces(faces,{similarity:compare,photoCount:9});
 assert.equal(out.clusteringDiagnostics.orphanRescues,0);
 assert.ok(out.clusteringDiagnostics.orphanAmbiguous>0);
 assert.ok(out.groups.some(g=>g.faceIndexes.join(',')==='3'));
});
test('単独候補を人数目標のために無理やり統合しない',()=>{
 const faces=Array.from({length:24},(_,i)=>({index:i,embedding:[i]}));
 const out=clusterCurrentAlbumFaces(faces,{similarity:()=>.35,photoCount:24});
 assert.equal(out.groups.length,24);
 assert.equal(out.clusteringDiagnostics.orphanRescues,0);
});
