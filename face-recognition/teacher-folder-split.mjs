// Local-only correction plan for a teacher-reported mixed-child photo folder.
// A selected pair is never auto-identified. The teacher explicitly indicates
// that the two faces are DIFFERENT children before any labels are changed.
import {buildTeacherSeedGroups} from './teacher-seed-matches.mjs';

export function planTeacherFolderSplit(sourcePhotos, reviewedPairs, faceA, faceB){
 const n=sourcePhotos.length;
 if(!Number.isInteger(faceA)||!Number.isInteger(faceB)||faceA<0||faceB<0||
    faceA>=n||faceB>=n||faceA===faceB){
  return {ok:false,reason:'同じフォルダの異なる顔を2つ選んでください。'};
 }
 if(sourcePhotos[faceA]===sourcePhotos[faceB]){
  return {ok:false,reason:'同じ写真の別の顔です。顔と写真番号を再確認してください。'};
 }
 const groups=buildTeacherSeedGroups(sourcePhotos,reviewedPairs);
 const group=groups.find(members=>members.includes(faceA)&&members.includes(faceB));
 if(!group)return {ok:false,reason:'選んだ2つの顔は、現在は同じ確認済みグループにありません。'};
 const nodes=[...group], index=new Map(nodes.map((id,k)=>[id,k]));
 const positive=reviewedPairs.filter(p=>p.same&&index.has(p.i)&&index.has(p.j)&&p.i!==p.j);
 // Unit-capacity min cut: retract the fewest teacher "same-child" links needed
 // to separate the two manually chosen faces. Never silently retract labels.
 const residual=Array.from({length:nodes.length},()=>new Map());
 for(const p of positive){
  const a=index.get(p.i),c=index.get(p.j);
  residual[a].set(c,(residual[a].get(c)||0)+1);
  residual[c].set(a,(residual[c].get(a)||0)+1);
 }
 const start=index.get(faceA),target=index.get(faceB);
 for(;;){
  const parent=new Map([[start,-1]]),queue=[start];
  for(let head=0;head<queue.length&&!parent.has(target);head++){
   const u=queue[head];
   for(const [v,capacity] of residual[u]){
    if(capacity>0&&!parent.has(v)){parent.set(v,u);queue.push(v);}
   }
  }
  if(!parent.has(target))break;
  let delta=Infinity;
  for(let v=target;v!==start;v=parent.get(v)){
   const u=parent.get(v);delta=Math.min(delta,residual[u].get(v));
  }
  for(let v=target;v!==start;v=parent.get(v)){
   const u=parent.get(v);
   residual[u].set(v,residual[u].get(v)-delta);
   residual[v].set(u,(residual[v].get(u)||0)+delta);
  }
 }
 const reach=new Set([start]),queue=[start];
 for(let head=0;head<queue.length;head++){
  for(const [v,capacity] of residual[queue[head]]){
   if(capacity>0&&!reach.has(v)){reach.add(v);queue.push(v);}
  }
 }
 if(reach.has(target))return {ok:false,reason:'既存の確認記録から分離方法を計算できませんでした。'};
 const sideA=nodes.filter(id=>reach.has(index.get(id)));
 const sideB=nodes.filter(id=>!reach.has(index.get(id)));
 const removedSamePairs=positive.filter(p=>reach.has(index.get(p.i))!==reach.has(index.get(p.j)));
 if(!removedSamePairs.length)return {ok:false,reason:'取り消すべき「同じ園児」の確認が見つかりませんでした。'};
 const removed=new Set(removedSamePairs.map(p=>Math.min(p.i,p.j)+':'+Math.max(p.i,p.j)));
 const next=reviewedPairs.filter(p=>!removed.has(Math.min(p.i,p.j)+':'+Math.max(p.i,p.j)));
 const key=Math.min(faceA,faceB)+':'+Math.max(faceA,faceB);
 const existing=next.findIndex(p=>Math.min(p.i,p.j)+':'+Math.max(p.i,p.j)===key);
 if(existing>=0)next.splice(existing,1);
 next.push({i:faceA,j:faceB,same:false});
 const proposed=buildTeacherSeedGroups(sourcePhotos,next);
 if(proposed.some(members=>members.includes(faceA)&&members.includes(faceB))){
  return {ok:false,reason:'選んだ顔の分離を確実に反映できません。変更を中止しました。'};
 }
 // The correction must not merge two previously separate teacher groups.
 const beforeGroup=new Map();
 groups.forEach((members,id)=>members.forEach(face=>beforeGroup.set(face,id)));
 const newlyMerged=proposed.some(members=>new Set(members.map(face=>beforeGroup.get(face)??('single:'+face))).size>1);
 if(newlyMerged)return {ok:false,reason:'分離後に別グループを結合する可能性があるため中止しました。'};
 return {
  ok:true,faceA,faceB,
  removedSamePairs:removedSamePairs.map(p=>({i:p.i,j:p.j})),
  beforeMembers:[...group],
  leftPreview:sideA,
  rightPreview:sideB,
  nextPairs:next
 };
}
