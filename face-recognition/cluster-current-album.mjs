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
   // A huge tie among unrelated people cannot be treated as a coherent
   // classmate cluster solely because all facial scores are uniformly high.
   const close=items=>items.filter(item=>items[0].quality-item.quality<.035).length;
   if(close(left)>3||close(right)>3)return false;
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
 // Community bridge: the old reciprocal-nearest-gap rule discards many
 // true matches when several photos of the SAME child are similarly close.
 // Match communities, not just one best face. This remains a soft heuristic,
 // and never overrides faces co-occurring in one original photograph.
 const beforeCommunityGroups=countGroups();
 let communityMerges=0;
 while(countGroups()>targetGroups){
  const live=sets.map((g,k)=>({g,k})).filter(entry=>entry.g.length);
  const candidates=[];
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++){
   const left=live[a],right=live[b];
   if(left.g.some(i=>right.g.some(j=>samples[i].index===samples[j].index)))continue;
   let min=1,max=-1,sum=0,count=0,strong=0;
   for(const i of left.g)for(const j of right.g){
    const score=scores[i][j];
    if(score<min)min=score;
    if(score>max)max=score;
    sum+=score;count++;
    if(score>=.72)strong++;
   }
   const mean=sum/count;
   if(max<.715||min<.55||mean<.675)continue;
   // Prefer several mutually supporting faces; a single lucky match
   // cannot pull an otherwise contradictory group into this community.
   if(count>=3&&strong===1&&mean<.73)continue;
   const quality=mean+.11*max+.012*Math.min(3,strong);
   candidates.push({a:left.k,b:right.k,quality,mean});
  }
  if(!candidates.length)break;
  const ranked=new Map();
  for(const pair of candidates){
   for(const [key,other] of [[pair.a,pair.b],[pair.b,pair.a]]){
    const row=ranked.get(key)||[];
    row.push({other,quality:pair.quality});
    ranked.set(key,row);
   }
  }
  for(const row of ranked.values())row.sort((a,b)=>b.quality-a.quality);
  const compatible=(a,b)=>{
   const left=sets[a],right=sets[b];
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))return false;
   let total=0,num=0,low=1;
   for(const i of left)for(const j of right){
    const score=scores[i][j];total+=score;num++;if(score<low)low=score;
   }
   // An all-lookalikes tie is not identity evidence. For a true triangle,
   // the alternative pair must also show a high absolute similarity.
   return low>=.68&&total/num>=.76;
  };
  const safe=candidates.filter(pair=>{
   const a=ranked.get(pair.a),b=ranked.get(pair.b);
   if(a[0].other!==pair.b||b[0].other!==pair.a)return false;
   // Even when all people look alike, don't interpret a large near-tie
   // component as a single person just to reach the suggested group count.
   const close=(rank)=>rank.filter(x=>rank[0].quality-x.quality<.045).length;
   if(close(a)>3||close(b)>3)return false;
   if(a[1]&&a[0].quality-a[1].quality<.045&&!compatible(pair.b,a[1].other))return false;
   if(b[1]&&b[0].quality-b[1].quality<.045&&!compatible(pair.a,b[1].other))return false;
   return true;
  }).sort((a,b)=>b.quality-a.quality);
  if(!safe.length)break;
  let changed=false;
  for(const edge of safe){
   if(countGroups()<=targetGroups)break;
   const left=sets[edge.a],right=sets[edge.b];
   if(!left.length||!right.length)continue;
   // Previously selected pairs could have altered a group earlier this round.
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))continue;
   left.push(...right);
   sets[edge.b]=[];
   communityMerges++;
   changed=true;
  }
  if(!changed)break;
 }

 // Album-local calibration: faces captured together are certain different
 // people, so use their upper similarity range as a hard-negative reference.
 // Do not save reference embeddings or use another album's identities.
 const negativePairs=[];
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  if(samples[i].index!==samples[j].index)continue;
  const value=similarity(samples[i].embedding,samples[j].embedding);
  if(Number.isFinite(value))negativePairs.push(value);
 }
 negativePairs.sort((a,b)=>a-b);
 const negativeQuantile=negativePairs.length?
  negativePairs[Math.min(negativePairs.length-1,Math.floor(negativePairs.length*.9))]:null;
 const calibratedThreshold=negativeQuantile===null?.675:
  Math.max(.635,Math.min(.78,negativeQuantile+.13));
 let calibratedMerges=0,calibratedPairs=0,calibratedAmbiguous=0,calibratedSamePhoto=0;
 // A moderate, mutually supported pass for fragmented small communities.
 // Missing a reciprocal absolute #1 should not reject a whole triangle of
 // consistently similar same-person photos. Ambiguity remains unmerged.
 while(countGroups()>targetGroups){
  const live=sets.map((g,k)=>({g,k})).filter(item=>item.g.length);
  const matches=[];
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++){
   const left=live[a],right=live[b];
   if(left.g.some(i=>right.g.some(j=>samples[i].index===samples[j].index))){
    calibratedSamePhoto++;continue;
   }
   const values=[];
   for(const i of left.g)for(const j of right.g)values.push(scores[i][j]);
   const mean=values.reduce((acc,v)=>acc+v,0)/values.length;
   const min=Math.min(...values),max=Math.max(...values);
   // Every face must be reasonably consistent with the other group, so
   // a high-scoring lookalike cannot drag unrelated children into it.
   const minAccepted=Math.max(.49,calibratedThreshold-.13);
   if(max<calibratedThreshold||mean<calibratedThreshold-.025||
      min<minAccepted)continue;
   if(values.length>=4&&values.filter(v=>v>=calibratedThreshold-.03).length<Math.ceil(values.length*.5))continue;
   const quality=mean+.08*max+.01*Math.min(3,values.filter(v=>v>=calibratedThreshold).length);
   matches.push({a:left.k,b:right.k,quality});
  }
  if(!matches.length)break;
  calibratedPairs+=matches.length;
  const top=new Map();
  for(const match of matches)for(const [key,other] of [[match.a,match.b],[match.b,match.a]]){
   const arr=top.get(key)||[];
   arr.push({other,quality:match.quality});top.set(key,arr);
  }
  for(const arr of top.values())arr.sort((a,b)=>b.quality-a.quality);
  const consistent=(g1,g2)=>{
   const first=sets[g1],second=sets[g2];
   if(first.some(i=>second.some(j=>samples[i].index===samples[j].index)))return false;
   let sum=0,count=0,min=1;
   for(const i of first)for(const j of second){
    const score=scores[i][j];sum+=score;count++;if(score<min)min=score;
   }
   return min>=calibratedThreshold-.10&&sum/count>=calibratedThreshold-.015;
  };
  const chosen=matches.filter(match=>{
   const left=top.get(match.a),right=top.get(match.b);
   if(left[0]?.other!==match.b||right[0]?.other!==match.a)return false;
   const margin=.045;
   const nearCount=items=>items.filter(x=>items[0].quality-x.quality<margin).length;
   // A face nearly equally similar to many other faces lacks a distinctive
   // match; coherence of an arbitrarily large all-lookalike set is not proof.
   if(nearCount(left)>3||nearCount(right)>3){
    calibratedAmbiguous++;return false;
   }
   if(left[1]&&left[0].quality-left[1].quality<margin&&!consistent(match.b,left[1].other)){
    calibratedAmbiguous++;return false;
   }
   if(right[1]&&right[0].quality-right[1].quality<margin&&!consistent(match.a,right[1].other)){
    calibratedAmbiguous++;return false;
   }
   return true;
  }).sort((a,b)=>b.quality-a.quality);
  if(!chosen.length)break;
  let any=false;
  for(const match of chosen){
   if(countGroups()<=targetGroups)break;
   const left=sets[match.a],right=sets[match.b];
   if(!left.length||!right.length)continue;
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))continue;
   // A whole-round merge may introduce newly incompatible cross-pairs;
   // re-check against the enlarged groups, not stale initial candidates.
   const cross=[];
   for(const i of left)for(const j of right)cross.push(scores[i][j]);
   const mean=cross.reduce((acc,v)=>acc+v,0)/cross.length;
   if(Math.min(...cross)<Math.max(.49,calibratedThreshold-.13)||
      mean<calibratedThreshold-.025)continue;
   left.push(...right);sets[match.b]=[];
   calibratedMerges++;any=true;
  }
  if(!any)break;
 }

 // Consensus bridge for faces photographed under very different conditions.
 // Full cross-group averages are brittle: one profile/shadowed face can cause
 // a genuine classmate's entire cluster to be rejected. The strongest 2+ pair
 // matches can instead provide evidence, but never bypass co-occurrence conflicts.
 const consensusThreshold=Math.max(.74,Math.min(.82,calibratedThreshold));
 let consensusMerges=0,consensusCandidates=0,consensusAmbiguous=0,consensusConflict=0;
 while(countGroups()>targetGroups){
  const live=sets.map((g,k)=>({g,k})).filter(item=>item.g.length);
  const potential=[];
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++){
   const first=live[a],second=live[b];
   if(first.g.some(i=>second.g.some(j=>samples[i].index===samples[j].index))){
    consensusConflict++;continue;
   }
   const values=[];
   for(const i of first.g)for(const j of second.g)values.push(scores[i][j]);
   values.sort((x,y)=>y-x);
   const best=values[0],secondBest=values[1]??-1,minimum=values[values.length-1];
   const mean=values.reduce((acc,v)=>acc+v,0)/values.length;
   const supporting=values.filter(v=>v>=consensusThreshold-.035).length;
   const hasMultiple=first.g.length>1||second.g.length>1;
   // Pairwise orphan matches must be very clear on their own.
   const strongSingleton=!hasMultiple&&best>=Math.max(.84,consensusThreshold+.06);
   // Two distinct strong face-pairs are more robust evidence than averaging
   // in all low-quality profile faces in a larger group.
   const supportedGroup=hasMultiple&&values.length>=2&&
    best>=consensusThreshold+.045&&secondBest>=consensusThreshold-.012&&
    minimum>=Math.max(.45,consensusThreshold-.31)&&
    mean>=Math.max(.59,consensusThreshold-.15)&&supporting>=2;
   if(!strongSingleton&&!supportedGroup)continue;
   const quality=hasMultiple?(best+secondBest)/2+.08*mean:best;
   potential.push({a:first.k,b:second.k,quality,best,secondBest});
  }
  if(!potential.length)break;
  consensusCandidates+=potential.length;
  const rankings=new Map();
  for(const candidate of potential)for(const [id,other] of [[candidate.a,candidate.b],[candidate.b,candidate.a]]){
   const list=rankings.get(id)||[];
   list.push({other,quality:candidate.quality});
   rankings.set(id,list);
  }
  for(const list of rankings.values())list.sort((a,b)=>b.quality-a.quality);
  const consistent=(a,b)=>{
   const left=sets[a],right=sets[b];
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))return false;
   const values=[];
   for(const i of left)for(const j of right)values.push(scores[i][j]);
   values.sort((x,y)=>y-x);
   return values[0]>=consensusThreshold+.02&&
    (values.length===1||values[1]>=consensusThreshold-.025);
  };
  const mutual=potential.filter(pair=>{
   const left=rankings.get(pair.a),right=rankings.get(pair.b);
   if(left[0]?.other!==pair.b||right[0]?.other!==pair.a)return false;
   const nearCount=items=>items.filter(x=>items[0].quality-x.quality<.042).length;
   if(nearCount(left)>3||nearCount(right)>3){
    consensusAmbiguous++;return false;
   }
   if(left[1]&&left[0].quality-left[1].quality<.042&&
      !consistent(pair.b,left[1].other)){consensusAmbiguous++;return false}
   if(right[1]&&right[0].quality-right[1].quality<.042&&
      !consistent(pair.a,right[1].other)){consensusAmbiguous++;return false}
   return true;
  }).sort((a,b)=>b.quality-a.quality);
  if(!mutual.length)break;
  let changed=false;
  for(const match of mutual){
   if(countGroups()<=targetGroups)break;
   const left=sets[match.a],right=sets[match.b];
   if(!left.length||!right.length)continue;
   if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))continue;
   const values=[];
   for(const i of left)for(const j of right)values.push(scores[i][j]);
   values.sort((x,y)=>y-x);
   const best=values[0],secondBest=values[1]??-1;
   if(values.length===1&&best<Math.max(.84,consensusThreshold+.06))continue;
   if(values.length>1&&!(best>=consensusThreshold+.045&&
       secondBest>=consensusThreshold-.012&&
       values[values.length-1]>=Math.max(.45,consensusThreshold-.31)))continue;
   left.push(...right);sets[match.b]=[];
   consensusMerges++;changed=true;
  }
  if(!changed)break;
 }

 // Distinctive-neighborhood bridge: repeated photos of the same child can
 // form 4-12 equally strong matches; ranking them #1/#2 alone cannot separate
 // true clusters from an all-lookalikes crowd. Contrast each candidate with
 // the group's BACKGROUND similarities and require the near-tied cohort
 // itself to agree. No school roster/photo history or fixed person count.
 let neighborhoodMerges=0,neighborhoodCandidates=0,neighborhoodAmbiguous=0;
 const neighborhoodFloor=Math.max(.54,negativeQuantile===null?.54:negativeQuantile-.03);
 const neighborhoodMean=Math.max(.69,negativeQuantile===null?.69:negativeQuantile+.075);
 const neighborhoodPeak=Math.max(.745,negativeQuantile===null?.745:negativeQuantile+.12);
 const neighborhoodMetric=(first,second)=>{
  const a=sets[first],b=sets[second];
  if(!a.length||!b.length||a.some(i=>b.some(j=>samples[i].index===samples[j].index)))return null;
  let sum=0,count=0,peak=-1,floor=1;
  for(const i of a)for(const j of b){
   const v=scores[i][j];sum+=v;count++;
   if(v>peak)peak=v;if(v<floor)floor=v;
  }
  return {mean:sum/count,peak,floor};
 };
 // A small fixed iteration budget bounds synchronous UI work on iPhones.
 for(let round=0;round<Math.min(100,n)&&countGroups()>targetGroups;round++){
  const live=sets.map((g,k)=>({g,k})).filter(item=>item.g.length);
  const stats=new Map(),background=new Map();
  for(let a=0;a<live.length;a++)for(let b=a+1;b<live.length;b++){
   const first=live[a].k,second=live[b].k,m=neighborhoodMetric(first,second);
   if(m)stats.set(first+'-'+second,m);
  }
  const metric=(a,b)=>stats.get(Math.min(a,b)+'-'+Math.max(a,b))||null;
  for(const item of live){
   const values=[];
   for(const other of live){
    if(item.k===other.k)continue;
    const m=metric(item.k,other.k);
    if(m)values.push(m.mean);
   }
   values.sort((a,b)=>a-b);
   background.set(item.k,values.length?values[Math.floor(values.length*.55)]:1);
  }
  const eligible=[];
  for(const [key,m] of stats){
   if(m.peak<neighborhoodPeak||m.mean<neighborhoodMean||m.floor<neighborhoodFloor)continue;
   const [a,b]=key.split('-').map(Number);
   const contrast=m.mean-Math.max(background.get(a),background.get(b));
   if(contrast<.12)continue;
   eligible.push({a,b,quality:m.mean+.08*m.peak,contrast});
  }
  if(!eligible.length)break;
  neighborhoodCandidates+=eligible.length;
  const rank=new Map();
  for(const pair of eligible)for(const [id,other] of [[pair.a,pair.b],[pair.b,pair.a]]){
   const list=rank.get(id)||[];
   list.push({other,quality:pair.quality});rank.set(id,list);
  }
  for(const items of rank.values())items.sort((a,b)=>b.quality-a.quality);
  const coherent=(a,b)=>{
   const m=metric(a,b);
   return !!m&&m.mean>=neighborhoodMean-.015&&m.floor>=neighborhoodFloor-.025;
  };
  const cohortSafe=(id,chosen)=>{
   const items=rank.get(id);
   if(!items||items[0]?.other!==chosen)return false;
   const nearby=items.filter(item=>items[0].quality-item.quality<.04);
   if(nearby.length>16)return false;
   // All plausible alternative groups form one mutually coherent neighborhood,
   // not many distinct children who happen to have similar-looking faces.
   for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++){
    if(!coherent(nearby[i].other,nearby[j].other))return false;
   }
   return true;
  };
  const sorted=eligible.sort((a,b)=>b.quality-a.quality);
  let chosen=null;
  for(const pair of sorted){
   if(rank.get(pair.a)?.[0]?.other!==pair.b||
      rank.get(pair.b)?.[0]?.other!==pair.a)continue;
   if(cohortSafe(pair.a,pair.b)&&cohortSafe(pair.b,pair.a)){chosen=pair;break}
   neighborhoodAmbiguous++;
  }
  if(!chosen)break;
  const left=sets[chosen.a],right=sets[chosen.b];
  // Re-evaluate the cannot-link condition before editing any group.
  if(left.some(i=>right.some(j=>samples[i].index===samples[j].index)))break;
  left.push(...right);sets[chosen.b]=[];
  neighborhoodMerges++;
 }
 const unmergedGroups=countGroups();
 const nearestScoreRanges={high:0,moderate:0,weak:0,low:0,missing:0};
 for(let i=0;i<n;i++){
  const best=nearest[i]?.length?scores[i][nearest[i][0]]:null;
  if(best===null||best<=0)nearestScoreRanges.missing++;
  else if(best>=.8)nearestScoreRanges.high++;
  else if(best>=.7)nearestScoreRanges.moderate++;
  else if(best>=.6)nearestScoreRanges.weak++;
  else nearestScoreRanges.low++;
 }
 const clusteringDiagnostics={
  nearestScoreRanges,
  negativePairs:negativePairs.length,
  negativeReference:negativeQuantile,
  calibratedThreshold,
  calibratedMerges,
  calibratedPairs,
  calibratedAmbiguous,
  calibratedSamePhoto,
  consensusThreshold,
  consensusMerges,
  consensusCandidates,
  consensusAmbiguous,
  consensusConflict,
  neighborhoodMerges,
  neighborhoodCandidates,
  neighborhoodAmbiguous,
  neighborhoodThreshold:neighborhoodMean,
  unmergedGroups
 };
 const groups=sets.filter(g=>g.length).map((faceIndexes,i)=>({
  key:'current-'+i,
  faceIndexes:[...faceIndexes],
  photoIndexes:[...new Set(faceIndexes.map(j=>samples[j].index))].sort((a,b)=>a-b)
 }));
 groups.sort((a,b)=>b.faceIndexes.length-a.faceIndexes.length||
    a.photoIndexes[0]-b.photoIndexes[0]);
 return {groups,faceCount:n,uncertainGroups:groups.filter(g=>g.faceIndexes.length===1).length,
  preventedMerges,adaptiveMerges,communityMerges,beforeCommunityGroups,targetGroups,clusteringDiagnostics};
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
