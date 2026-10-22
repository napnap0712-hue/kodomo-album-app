// Face clustering for ONE newly created album. Pure, stateless and independent
// of previous albums, approved face drafts or any saved nursery photographs.
// Similarities are heuristic scores, NOT identification accuracy.
export function clusterCurrentAlbumFaces(samples,{similarity,threshold=.72,gap=.035,photoCount}={}){
 if(!Array.isArray(samples)||typeof similarity!=='function')throw Error('顔の解析結果がありません。');
 const n=samples.length;
 if(n>3000)throw Error('解析する顔が多すぎます。');
 for(const s of samples)if(!Number.isSafeInteger(s?.index)||s.index<0||
   !Array.isArray(s.embedding)||!s.embedding.length||
   s.embedding.some(x=>!Number.isFinite(x)))
  throw Error('顔の特徴情報を確認できません。');
 const scores=Array.from({length:n},()=>new Float32Array(n));
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const value=samples[i].index===samples[j].index?-1:similarity(samples[i].embedding,samples[j].embedding);
  scores[i][j]=scores[j][i]=Number.isFinite(value)?value:-1;
 }
 const nearest=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>j)
  .filter(j=>j!==i&&scores[i][j]>0).sort((a,b)=>scores[i][b]-scores[i][a]));
 const edges=[];
 for(let i=0;i<n;i++){
  const j=nearest[i][0];if(j===undefined||j<=i||nearest[j][0]!==i)continue;
  const score=scores[i][j];
  const nextI=nearest[i][1]===undefined?-1:scores[i][nearest[i][1]];
  const nextJ=nearest[j][1]===undefined?-1:scores[j][nearest[j][1]];
  if(score>=threshold&&score-nextI>=gap&&score-nextJ>=gap)edges.push({i,j,score});
 }
 edges.sort((a,b)=>b.score-a.score);
 const sets=Array.from({length:n},(_,i)=>[i]),roots=Array.from({length:n},(_,i)=>i);
 let preventedMerges=0;
 for(const edge of edges){
  const ai=roots[edge.i],bi=roots[edge.j];if(ai===bi)continue;
  const left=sets[ai],right=sets[bi];
  if(left.some(i=>right.some(j=>samples[i].index===samples[j].index))||
     left.some(i=>right.some(j=>scores[i][j]<threshold))){
   preventedMerges++;continue;
  }
  left.push(...right);
  for(const i of right)roots[i]=ai;
  sets[bi]=[];
 }
 // Conservative extension: only attach singletons compatible with every face
 // already in one group, with a sufficient advantage over alternatives.
 let extended=true;
 while(extended){
  extended=false;
  const singles=sets.map((g,k)=>({g,k})).filter(({g})=>g.length===1);
  for(const {g,k} of singles){
   if(sets[k].length!==1)continue;
   const idx=g[0],candidates=[];
   for(let p=0;p<sets.length;p++){
    const target=sets[p];if(p===k||target.length<2)continue;
    if(target.some(j=>samples[idx].index===samples[j].index))continue;
    const values=target.map(j=>scores[idx][j]),minimum=Math.min(...values);
    if(minimum>=threshold)candidates.push({p,minimum,average:values.reduce((a,b)=>a+b,0)/values.length});
   }
   candidates.sort((a,b)=>b.average-a.average);
   if(!candidates.length||candidates[1]&&candidates[0].average-candidates[1].average<gap)continue;
   sets[candidates[0].p].push(idx);sets[k]=[];extended=true;
  }
 }
 // A second, high-confidence pass can reunite an isolated face even when it
 // was not the reciprocal #1 match. Never use class roster or previous albums.
 // This deliberately keeps uncertain faces separate for teacher review.
 const strongThreshold=Math.max(.80,threshold+.07);
 let improved=true;
 while(improved){
  improved=false;
  for(let k=0;k<sets.length;k++){
   if(sets[k].length!==1)continue;
   const faceIndex=sets[k][0],matches=[];
   for(let p=0;p<sets.length;p++){
    const target=sets[p];if(k===p||!target.length)continue;
    if(target.some(j=>samples[faceIndex].index===samples[j].index))continue;
    const values=target.map(j=>scores[faceIndex][j]);
    const peak=Math.max(...values),mean=values.reduce((sum,v)=>sum+v,0)/values.length;
    if(peak<strongThreshold)continue;
    // For established groups, require more than a single coincidental match.
    if(target.length>1&&(Math.min(...values)<Math.max(.64,threshold-.08)||
       mean<Math.max(.735,threshold+.015)))continue;
    matches.push({p,peak,mean});
   }
   matches.sort((a,b)=>b.mean-a.mean);
   if(!matches.length)continue;
   if(matches[1]&&matches[0].mean-matches[1].mean<Math.max(.055,gap))continue;
   const destination=matches[0].p;
   sets[destination].push(faceIndex);
   sets[k]=[];
   improved=true;
  }
 }
 // Soft target: roughly one tentative group per two imported photos. This is
 // NOT a quota: low-confidence or same-photo faces must remain separate.
 const totalPhotos=Number.isInteger(photoCount)&&photoCount>0?photoCount:
    new Set(samples.map(s=>s.index)).size;
 const targetGroups=Math.max(1,Math.ceil(totalPhotos/2));
 const countGroups=()=>sets.filter(g=>g.length).length;
 let adaptiveMerges=0;
 // Find mutual-best compatible groups rather than just mutually nearest faces.
 // Requiring cross-group agreement prevents an accidental chain of lookalikes.
 while(countGroups()>targetGroups){
  const live=sets.map((g,k)=>({g,k})).filter(item=>item.g.length);
  const options=[];
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++){
   const left=live[a],right=live[b];
   if(left.g.some(i=>right.g.some(j=>samples[i].index===samples[j].index)))continue;
   const values=[];
   for(const i of left.g)for(const j of right.g)values.push(scores[i][j]);
   const peak=Math.max(...values),floor=Math.min(...values);
   const mean=values.reduce((sum,v)=>sum+v,0)/values.length;
   // A strong peak alone cannot hide disagreement among other faces.
   const support=values.filter(v=>v>=.72).length;
   const approved=peak>=.81&&floor>=.60&&mean>=.70 ||
      peak>=.76&&floor>=.66&&mean>=.72&&
        (Math.min(left.g.length,right.g.length)===1||support>=2);
   if(!approved)continue;
   const quality=mean+.12*peak+.02*Math.min(3,support);
   options.push({a:left.k,b:right.k,quality});
  }
  if(!options.length)break;
  const preferences=new Map();
  for(const option of options){
   for(const [key,other] of [[option.a,option.b],[option.b,option.a]]){
    const arr=preferences.get(key)||[];
    arr.push({other,quality:option.quality});preferences.set(key,arr);
   }
  }
  for(const choices of preferences.values())choices.sort((a,b)=>b.quality-a.quality);
  // A three-way close match is not ambiguous when every candidate also
  // agrees with the other candidates (a consistent triangle).
  const agree=(a,b)=>{
   const left=sets[a],right=sets[b];
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))return false;
   return left.every(i=>right.every(j=>scores[i][j]>=.75));
  };
  const mutual=options.filter(option=>{
   const left=preferences.get(option.a),right=preferences.get(option.b);
   if(left[0]?.other!==option.b||right[0]?.other!==option.a)return false;
   if(left[1]&&left[0].quality-left[1].quality<.035&&!agree(option.b,left[1].other))return false;
   if(right[1]&&right[0].quality-right[1].quality<.035&&!agree(option.a,right[1].other))return false;
   return true;
  }).sort((a,b)=>b.quality-a.quality);
  if(!mutual.length)break;
  let changed=false;
  for(const choice of mutual){
   if(countGroups()<=targetGroups)break;
   if(!sets[choice.a].length||!sets[choice.b].length)continue;
   sets[choice.a].push(...sets[choice.b]);sets[choice.b]=[];
   adaptiveMerges++;changed=true;
  }
  if(!changed)break;
 }
 const groups=sets.filter(g=>g.length).map((faceIndexes,i)=>({
  key:'current-'+i,
  faceIndexes:[...faceIndexes],
  photoIndexes:[...new Set(faceIndexes.map(j=>samples[j].index))].sort((a,b)=>a-b)
 }));
 groups.sort((a,b)=>b.faceIndexes.length-a.faceIndexes.length||
    a.photoIndexes[0]-b.photoIndexes[0]);
 return {groups,faceCount:n,uncertainGroups:groups.filter(g=>g.faceIndexes.length===1).length,
  preventedMerges,adaptiveMerges,targetGroups};
}
// The teacher's confirmation belongs only to the current selected album. A
// cluster's identity is NEVER inferred from a previous album or roster photo.
export function assignConfirmedAlbumCluster({
 photoAssignments,photoCount,photoIndexes,childId,validChildIds
}){
 const child=String(childId??''),allowed=new Set([...validChildIds].map(String));
 if(!allowed.has(child))throw Error('園児名簿にない名前です。');
 if(!Array.isArray(photoAssignments)||photoAssignments.length!==photoCount)
  throw Error('現在の写真の振り分けが一致しません。');
 if(!Array.isArray(photoIndexes)||!photoIndexes.length||
  photoIndexes.some(i=>!Number.isInteger(i)||i<0||i>=photoCount))
  throw Error('振り分ける元写真の番号が不正です。');
 const copy=photoAssignments.map(ids=>[...ids]);
 for(const index of photoIndexes){
  const ids=new Set(copy[index].map(String));ids.add(child);copy[index]=[...ids];
 }
 return copy;
}

// Suggest possible group merges for the teacher; never merge automatically.
// A score ranks candidates, and is NOT an identification confidence or accuracy.
export function suggestCurrentAlbumGroupMerges(samples,groups,{similarity,minScore=.55,limit=3}={}){
 if(!Array.isArray(samples)||!Array.isArray(groups)||typeof similarity!=='function')
  throw Error('現在のアルバムの顔候補がありません。');
 const result=new Map(groups.map(g=>[g.key,[]]));
 for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
  const left=groups[a],right=groups[b];
  if(!left.faceIndexes.length||!right.faceIndexes.length)continue;
  const leftPhotos=new Set(left.faceIndexes.map(i=>samples[i]?.index));
  if(right.faceIndexes.some(i=>leftPhotos.has(samples[i]?.index)))continue;
  const values=[];
  for(const i of left.faceIndexes)for(const j of right.faceIndexes){
   const first=samples[i],second=samples[j];
   if(!first?.embedding||!second?.embedding)continue;
   const n=similarity(first.embedding,second.embedding);
   if(Number.isFinite(n))values.push(n);
  }
  if(!values.length)continue;
  values.sort((x,y)=>y-x);
  const best=values[0],strong=values.slice(0,Math.min(3,values.length));
  const average=strong.reduce((sum,v)=>sum+v,0)/strong.length;
  // A single lookalike in a large group should not drown out contradictory matches.
  const score=(best+average)/2;
  if(score<minScore)continue;
  result.get(left.key).push({key:right.key,score});
  result.get(right.key).push({key:left.key,score});
 }
 for(const items of result.values())items.sort((a,b)=>b.score-a.score);
 for(const [key,items] of result)result.set(key,items.slice(0,Math.max(1,limit)));
 return result;
}
// A confirmed teacher merge of two temporary groups. Reject same-photo faces
// because one group must never represent two different faces in one photo.
export function mergeTeacherAlbumGroups(groups,samples,sourceKey,destinationKey){
 if(sourceKey===destinationKey)throw Error('同じグループには移動できません。');
 const source=groups.find(g=>g.key===sourceKey);
 const destination=groups.find(g=>g.key===destinationKey);
 if(!source||!destination||!source.faceIndexes.length||!destination.faceIndexes.length)
  throw Error('移動先のグループを確認できません。');
 const seen=new Set(destination.faceIndexes.map(i=>samples[i]?.index));
 if(source.faceIndexes.some(i=>seen.has(samples[i]?.index)))
  throw Error('同じ写真に写っている別の顔が含まれるため統合できません。');
 return groups.filter(g=>g!==source).map(g=>g===destination?
  {...g,faceIndexes:[...g.faceIndexes,...source.faceIndexes]}:{...g,faceIndexes:[...g.faceIndexes]});
}

// Merge multiple teacher-checked candidate groups in one transaction. The
// operation either succeeds entirely or leaves all temporary groups untouched.
// A source photo cannot contain two faces assigned to the same person group.
export function mergeTeacherAlbumGroupsBatch(groups,samples,destinationKey,sourceKeys){
 if(!Array.isArray(groups)||!Array.isArray(samples)||
    !Array.isArray(sourceKeys)||!sourceKeys.length)
  throw Error('まとめるグループをチェックしてください。');
 const destination=groups.find(g=>g.key===destinationKey);
 if(!destination||!Array.isArray(destination.faceIndexes)||!destination.faceIndexes.length)
  throw Error('基準となるグループが見つかりません。');
 const unique=[...new Set(sourceKeys.map(String))];
 if(unique.length!==sourceKeys.length||unique.includes(String(destinationKey)))
  throw Error('同じグループを重複して選択できません。');
 const selected=unique.map(key=>groups.find(g=>String(g.key)===key));
 if(selected.some(g=>!g||!Array.isArray(g.faceIndexes)||!g.faceIndexes.length))
  throw Error('移動先のグループを確認できません。');
 const photoIndexes=new Set();
 const all=[destination,...selected];
 for(const group of all)for(const i of group.faceIndexes){
  const photo=samples[i]?.index;
  if(!Number.isSafeInteger(photo)||photo<0)
   throw Error('顔に対応する元写真が見つかりません。');
  if(photoIndexes.has(photo))
   throw Error('同じ写真に写っている別の顔が含まれるため、一括統合できません。選択を見直してね。');
  photoIndexes.add(photo);
 }
 const selectedKeys=new Set(unique);
 const combined=all.flatMap(g=>g.faceIndexes);
 return groups.filter(g=>!selectedKeys.has(String(g.key))).map(g=>g===destination?
  {...g,faceIndexes:combined}: {...g,faceIndexes:[...g.faceIndexes]});
}
