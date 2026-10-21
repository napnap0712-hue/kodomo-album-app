// Read-only experimental face grouping. No photos or vectors are stored.
// Operates solely on caller-provided similarity scores and source photo IDs.
export function groupFacesWithEvidence(photos, getScore, threshold=0.65, strategy='balanced'){
 const n=photos.length,allowed=['conservative','balanced','exploratory'];
 if(!allowed.includes(strategy))throw Error('Unsupported grouping strategy');
 const matrix=Array.from({length:n},()=>Array(n).fill(NaN));
 for(let i=0;i<n;i++){matrix[i][i]=1;for(let j=i+1;j<n;j++){const value=Number(getScore(i,j));if(Number.isFinite(value))matrix[i][j]=matrix[j][i]=value;}}
 const score=(i,j)=>matrix[i][j];
 const groups=photos.map((_,i)=>[i]),details=[];
 const triangleFloor=strategy==='conservative'?.85:strategy==='balanced'?.78:.74;
 const triangleGap=strategy==='conservative'?.12:strategy==='balanced'?.06:.04;
 const triangles=[];
 // Cap three-face cross-check complexity on larger 100-photo batches.
 if(n<=90)for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++){
  const ids=[i,j,k];
  if(new Set(ids.map(id=>photos[id])).size!==3)continue;
  const values=[score(i,j),score(i,k),score(j,k)],minimum=Math.min(...values);
  if(!Number.isFinite(minimum)||minimum<triangleFloor)continue;
  const unambiguous=ids.every(id=>{
   let competitor=-1;
   for(let m=0;m<n;m++)if(!ids.includes(m)&&Number.isFinite(score(id,m)))competitor=Math.max(competitor,score(id,m));
   return Math.min(...ids.filter(other=>other!==id).map(other=>score(id,other)))-competitor>=triangleGap;
  });
  if(unambiguous)triangles.push({ids,minimum,mean:values.reduce((a,v)=>a+v,0)/3});
 }
 triangles.sort((a,b)=>b.minimum-a.minimum||b.mean-a.mean);
 const used=new Set();
 for(const candidate of triangles){
  if(candidate.ids.some(id=>used.has(id)))continue;
  for(const id of candidate.ids)used.add(id);
  for(let t=groups.length-1;t>=0;t--)if(groups[t].some(id=>candidate.ids.includes(id)))groups.splice(t,1);
  groups.push([...candidate.ids]);
  details.push({type:'triangle',members:[...candidate.ids]});
 }
 const singleFloor=strategy==='conservative'?Math.max(.76,threshold+.10):strategy==='balanced'?Math.max(.70,threshold+.04):Math.max(.66,threshold);
 const gapNeeded=strategy==='conservative'?.12:strategy==='balanced'?.06:.035;
 const rival=(i,j)=>{
  let highest=-1;
  for(let k=0;k<n;k++)if(k!==i&&k!==j&&Number.isFinite(score(i,k)))highest=Math.max(highest,score(i,k));
  return highest;
 };
 for(let pass=0;pass<n;pass++){
  let best=null;
  for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
   const left=groups[a],right=groups[b];
   if(left.some(i=>right.some(j=>photos[i]===photos[j])))continue;
   const cross=left.flatMap(i=>right.map(j=>score(i,j)));
   if(cross.some(value=>!Number.isFinite(value)))continue;
   const minimum=Math.min(...cross),average=cross.reduce((sum,value)=>sum+value,0)/cross.length;
   const support=cross.filter(value=>value>=threshold).length;
   let ok=false;
   if(left.length===1&&right.length===1){
    const i=left[0],j=right[0];
    ok=average>=singleFloor&&Math.min(average-rival(i,j),average-rival(j,i))>=gapNeeded;
   }else{
    const floor=strategy==='conservative'?threshold:strategy==='balanced'?threshold-.065:threshold-.11;
    const meanFloor=strategy==='conservative'?threshold+.07:strategy==='balanced'?threshold+.03:threshold+.005;
    const ratio=strategy==='conservative'?.8:strategy==='balanced'?.6:.5;
    ok=minimum>=floor&&average>=meanFloor&&support>=Math.max(2,Math.ceil(cross.length*ratio));
   }
   if(!ok)continue;
   const rank=average+.35*minimum+.003*support;
   if(!best||rank>best.rank)best={a,b,rank,average,minimum,support};
  }
  if(!best)break;
  const joined=[...groups[best.a],...groups[best.b]];
  groups[best.a]=joined;groups.splice(best.b,1);
  details.push({type:'merge',...best,members:[...joined]});
 }
 return {groups,details};
}
