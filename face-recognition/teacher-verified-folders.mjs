// Read-only teacher-confirmed photo-folder preview. Never touches saved albums.
// Assumes zero-based face IDs and source photo indexes from the CURRENT analysis.
import {buildTeacherSeedGroups} from './teacher-seed-matches.mjs';

export function buildVerifiedPhotoFolders(sourcePhotos, reviewedPairs){
 const length=sourcePhotos.length;
 const valid=reviewedPairs.filter(p=>Number.isInteger(p.i)&&Number.isInteger(p.j)&&
  p.i>=0&&p.j>=0&&p.i<length&&p.j<length&&p.i!==p.j&&typeof p.same==='boolean');
 const seeds=buildTeacherSeedGroups(sourcePhotos,valid);
 const assigned=new Set(seeds.flat());
 const singles=sourcePhotos.map((_,i)=>i).filter(i=>!assigned.has(i));
 const clusters=[...seeds.map(members=>({members,kind:'confirmed'})),
   ...singles.map(face=>({members:[face],kind:'individual'}))];
 const negativeBetween=(left,right)=>left.some(a=>right.some(b=>
  sourcePhotos[a]===sourcePhotos[b] ||
  valid.some(p=>!p.same&&((p.i===a&&p.j===b)||(p.i===b&&p.j===a)))
 ));
 const faceToCluster=new Map();
 clusters.forEach((cluster,index)=>{
  for(const id of cluster.members)faceToCluster.set(id,index);
 });
 const contradictory=valid.filter(p=>{
  const joined=faceToCluster.get(p.i)===faceToCluster.get(p.j);
  return p.same?!joined:joined;
 });
 const buckets=clusters.map((cluster,index)=>{
  const photos=[...new Set(cluster.members.map(id=>sourcePhotos[id]))].sort((a,b)=>a-b);
  const contradictingPhoto=photos.length!==cluster.members.length;
  const independentlyDistinct=cluster.kind==='individual'&&clusters.every((other,k)=>
   k===index||negativeBetween(cluster.members,other.members));
  return {
   id:index+1,
   kind:cluster.kind,
   members:[...cluster.members],
   photos,
   independentlyDistinct,
   contradictingPhoto
  };
 });
 const duplicateFaces=buckets.flatMap(bucket=>bucket.members).length!==new Set(buckets.flatMap(bucket=>bucket.members)).size;
 return {
  buckets,
  clusteredCount:seeds.length,
  singletonCount:singles.length,
  coveredFaces:faceToCluster.size,
  allFacesCovered:faceToCluster.size===length&&!duplicateFaces,
  contradictions:contradictory.map(p=>({i:p.i,j:p.j,same:p.same})),
  hasSourcePhotoConflicts:buckets.some(bucket=>bucket.contradictingPhoto),
  separatedSingletonCount:buckets.filter(bucket=>bucket.kind==='individual'&&bucket.independentlyDistinct).length,
  reviewedPairs:valid.length
 };
}
