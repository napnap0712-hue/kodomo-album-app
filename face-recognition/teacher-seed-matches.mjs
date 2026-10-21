// DOM-free research helper. Does not upload, persist, or reclassify faces.
export function buildTeacherSeedGroups(photoIds, verifiedPairs){
 const groups=photoIds.map((_,i)=>[i]);
 const cannotLink=(membersA,membersB)=>membersA.some(i=>membersB.some(j=>{
  if(photoIds[i]===photoIds[j])return true;
  return verifiedPairs.some(p=>!p.same&&((p.i===i&&p.j===j)||(p.i===j&&p.j===i)));
 }));
 for(const p of verifiedPairs){
  if(!p.same||!Number.isInteger(p.i)||!Number.isInteger(p.j)||p.i===p.j||
     p.i<0||p.j<0||p.i>=photoIds.length||p.j>=photoIds.length)continue;
  const a=groups.findIndex(g=>g.includes(p.i)),b=groups.findIndex(g=>g.includes(p.j));
  if(a<0||b<0||a===b||cannotLink(groups[a],groups[b]))continue;
  groups[a].push(...groups[b]);groups.splice(b,1);
 }
 return groups.filter(g=>g.length>=2).map(g=>[...g].sort((a,b)=>a-b));
}
// Read-only, teacher-checkable candidates from confirmed same-person groups.
// Scores may vary in scale across models; never declare an identity automatically.
export function suggestTeacherSeedPairs(photoIds,verifiedPairs,score,maxResults=6){
 const seeds=buildTeacherSeedGroups(photoIds,verifiedPairs);
 if(!seeds.length)return[];
 const assigned=new Set(seeds.flat()),negatives=verifiedPairs.filter(p=>!p.same);
 const candidates=[];
 for(let face=0;face<photoIds.length;face++){
  if(assigned.has(face))continue;
  const matches=[];
  for(const members of seeds){
   if(members.some(i=>photoIds[i]===photoIds[face]))continue;
   if(members.some(i=>negatives.some(p=>(p.i===face&&p.j===i)||(p.j===face&&p.i===i))))continue;
   const comparisons=members.map(i=>({anchor:i,value:score(face,i)})).filter(c=>Number.isFinite(c.value));
   if(!comparisons.length)continue;
   comparisons.sort((a,b)=>b.value-a.value||a.anchor-b.anchor);
   const mean=comparisons.reduce((sum,c)=>sum+c.value,0)/comparisons.length;
   matches.push({face,members:[...members],anchor:comparisons[0].anchor,best:comparisons[0].value,mean,support:comparisons.length});
  }
  matches.sort((a,b)=>b.mean-a.mean||b.best-a.best||a.anchor-b.anchor);
  if(!matches.length)continue;
  const best=matches[0],runnerUp=matches[1];
  candidates.push({...best,runnerUp:runnerUp?runnerUp.mean:null,margin:runnerUp?best.mean-runnerUp.mean:null});
 }
 // High candidate-class lead is prioritized for review, but never auto-applied.
 candidates.sort((a,b)=>(b.margin??-1)-(a.margin??-1)||b.mean-a.mean||a.face-b.face);
 return candidates.slice(0,Math.max(0,Math.trunc(maxResults)));
}

// When known children are ruled out by human negatives or photo conflicts,
// suggest *pairs among the remaining faces* rather than bypassing cannot-links.
// Both networks are used only to prioritize reviews; their raw score scales
// are NOT interchangeable, hence mean rank rather than mean cosine score.
export function suggestUnassignedFacePairs(photoIds,verifiedPairs,scoreA,scoreB=null,maxResults=4){
 const known=new Set(buildTeacherSeedGroups(photoIds,verifiedPairs).flat());
 const blocked=new Set(verifiedPairs.map(p=>[Math.min(p.i,p.j),Math.max(p.i,p.j)].join(':')));
 const candidates=[];
 for(let i=0;i<photoIds.length;i++){
  if(known.has(i))continue;
  for(let j=i+1;j<photoIds.length;j++){
   if(known.has(j)||photoIds[i]===photoIds[j]||blocked.has(i+':'+j))continue;
   const a=Number(scoreA(i,j)),b=scoreB?Number(scoreB(i,j)):null;
   if(!Number.isFinite(a)||(scoreB&&!Number.isFinite(b)))continue;
   candidates.push({i,j,lightScore:a,r50Score:b});
  }
 }
 if(!candidates.length)return[];
 const rankedA=[...candidates].sort((x,y)=>y.lightScore-x.lightScore||x.i-y.i||x.j-y.j);
 const orderA=new Map(rankedA.map((pair,index)=>[pair.i+':'+pair.j,index+1]));
 let orderB=null;
 if(scoreB){
  const rankedB=[...candidates].sort((x,y)=>y.r50Score-x.r50Score||x.i-y.i||x.j-y.j);
  orderB=new Map(rankedB.map((pair,index)=>[pair.i+':'+pair.j,index+1]));
 }
 for(const pair of candidates){
  const key=pair.i+':'+pair.j;
  pair.reviewRank=orderB?(orderA.get(key)+orderB.get(key))/2:orderA.get(key);
 }
 candidates.sort((x,y)=>x.reviewRank-y.reviewRank||x.i-y.i||x.j-y.j);
 return candidates.slice(0,Math.max(0,Math.trunc(maxResults)));
}
