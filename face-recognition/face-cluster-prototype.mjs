// Standalone in-memory experiment. Never writes to album storage.
const $=id=>document.getElementById(id);
const input=$('photos'),start=$('start'),cancel=$('cancel'),status=$('status'),groupsHost=$('groups'),destination=$('destination'),move=$('move'),selection=$('selection');
let stop=false,items=[],groups=[],selected=new Set(),urls=[],photoNames=[],photoUrls=[];
const groupNames=new Map();
const queued=[];
const folderInput=$('folderInput');
const count=$('photoCount');
function updateCount(){count.textContent=queued.length+'枚選択済み（追加選択できます）'}
function addFiles(files){let skipped=0;for(const file of files){if(!file.type.startsWith('image/'))continue;if(queued.length>=100){skipped++;continue}queued.push(file)}updateCount();if(skipped)count.textContent+=' ※100枚を超えた'+skipped+'枚は未追加';input.value='';folderInput.value=''}
input.addEventListener('change',()=>addFiles(Array.from(input.files||[])));
$('addPhotos').addEventListener('click',()=>input.click());
$('folderPhotos').addEventListener('click',()=>folderInput.click());
folderInput.addEventListener('change',()=>addFiles(Array.from(folderInput.files||[])));
$('clearPhotos').addEventListener('click',()=>{queued.length=0;input.value='';folderInput.value='';updateCount()});
$('threshold').addEventListener('input',()=>{$('thresholdValue').value=Number($('threshold').value).toFixed(2)});
$('recognitionModel').addEventListener('change',()=>{
 const threshold=$('threshold');
 threshold.value=$('recognitionModel').value==='arcface'?'0.65':'0.70';
 $('thresholdValue').value=Number(threshold.value).toFixed(2);
 status.textContent='モデル別の試験用初期基準を設定しました。精度保証ではありません。';
});
$('clear').addEventListener('click',()=>{selected.clear();render()});
cancel.addEventListener('click',()=>{stop=true;status.textContent='中断しています…'});
const similarity=(x,y)=>{let dot=0,a=0,b=0;for(let i=0;i<x.length;i++){dot+=x[i]*y[i];a+=x[i]*x[i];b+=y[i]*y[i]}return dot/Math.sqrt(a*b)};
function groupLabel(id){return id==='unknown'?'未分類':(groupNames.get(id)?groupNames.get(id)+'（グループ'+id+'）':'グループ '+id)}
function render(){
 selection.textContent='選択中：'+selected.size+'件';move.disabled=!selected.size;
 const existing=groups.filter(g=>g.members.length);
 destination.replaceChildren();
 for(const g of existing){const opt=document.createElement('option');opt.value=g.id;opt.textContent=groupLabel(g.id);destination.append(opt)}
 const add=document.createElement('option');add.value='new';add.textContent='新しいグループ';destination.append(add);
 const photoLinks=$('photoLinks');
 if(photoLinks){photoLinks.replaceChildren();for(let i=0;i<photoNames.length;i++){
  const row=document.createElement('div');row.style.cssText='padding:8px 0;border-bottom:1px solid #e8edf3;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const label=document.createElement('strong');label.textContent=(i+1)+'枚目：'+photoNames[i];row.append(label);
  const faceIds=items.map((item,id)=>item.sourcePhoto===i?id:-1).filter(id=>id>=0);
  const assigned=[...new Set(faceIds.flatMap(id=>groups.filter(g=>g.members.includes(id)).map(g=>g.id)))];
  const info=document.createElement('span');info.textContent=faceIds.length?('検出顔 '+faceIds.length+'件 ／ '+(assigned.length?assigned.map(id=>groupLabel(id)).join('・'):'未分類')):'顔未検出（手動対応予定）';row.append(info);photoLinks.append(row);
 }}
 const folders=$('childFolders');
 if(folders){folders.replaceChildren();for(const g of existing){if(g.id==='unknown')continue;
  const row=document.createElement('div');row.style.cssText='padding:10px 0;border-bottom:1px solid #e8edf3';
  const label=document.createElement('label');label.textContent='グループ '+g.id+' → 園児名 ';const field=document.createElement('input');field.type='text';field.placeholder='園児名（仮入力）';field.value=groupNames.get(g.id)||'';field.style.cssText='padding:8px;border:1px solid #ccd5e0;border-radius:8px';label.append(field);row.append(label);
  const photos=document.createElement('div');photos.className='faces';photos.style.cssText='margin-top:8px';
  const update=()=>{const name=field.value.trim();if(name)groupNames.set(g.id,name);else groupNames.delete(g.id);
   const ids=[...new Set(g.members.map(id=>items[id]?.sourcePhoto).filter(Number.isInteger))].sort((a,b)=>a-b);
   photos.replaceChildren();
   if(!ids.length){photos.textContent='該当写真なし';return}
   for(const i of ids){const figure=document.createElement('figure');figure.style.cssText='margin:0;width:96px';const img=document.createElement('img');img.src=photoUrls[i];img.alt=photoNames[i];img.title=photoNames[i];img.style.cssText='width:96px;height:96px;object-fit:cover;border-radius:10px';const caption=document.createElement('figcaption');caption.className='muted';caption.style.cssText='overflow-wrap:anywhere;font-size:11px';caption.textContent=(i+1)+'枚目';figure.append(img,caption);photos.append(figure)}
  };
  field.addEventListener('input',update);field.addEventListener('change',()=>render());update();row.append(photos);folders.append(row);
 }}
 groupsHost.replaceChildren();
 for(const g of existing){
  const card=document.createElement('article');card.className='group';
  const title=document.createElement('strong');title.textContent=groupLabel(g.id)+'（顔 '+g.members.length+'件）';card.append(title);
  const faces=document.createElement('div');faces.className='faces';
  for(const id of g.members){
   const item=items[id],img=document.createElement('img');img.className='face'+(selected.has(id)?' selected':'');img.src=item.url;img.alt=item.name;img.title=item.name;img.addEventListener('click',()=>{selected.has(id)?selected.delete(id):selected.add(id);render()});faces.append(img);
  }card.append(faces);groupsHost.append(card);
 }
}
move.addEventListener('click',()=>{
 if(!selected.size)return;
 let target=destination.value;
 if(target==='new'){target=String(Math.max(0,...groups.map(g=>Number(g.id)||0))+1);groups.push({id:target,members:[]})}
 const dest=groups.find(g=>g.id===target);if(!dest)return;
 for(const g of groups)g.members=g.members.filter(id=>!selected.has(id));
 for(const id of selected)dest.members.push(id);
 selected.clear();render();
});
async function embed(bitmap,human,session,ort){
 const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 const faces=(await human.detect(canvas)).face||[];
 if(!faces.length)throw Error('顔を検出できません');
 const results=[];
 for(const face of faces){
 try{
 const mesh=face.mesh,indices=[33,263,1,61,291];
 if(!Array.isArray(mesh)||mesh.length<292)throw Error('顔の位置情報不足');
 const src=indices.map(k=>[mesh[k]?.[0],mesh[k]?.[1]]);
 if(src.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('顔の座標が不正');
 const dst=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
 const mean=p=>p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]);
 const sm=mean(src),dm=mean(dst);let aa=0,bb=0,den=0;
 for(let k=0;k<5;k++){const x=src[k][0]-sm[0],y=src[k][1]-sm[1],u=dst[k][0]-dm[0],v=dst[k][1]-dm[1];aa+=x*u+y*v;bb+=x*v-y*u;den+=x*x+y*y}
 if(den<1)throw Error('顔位置補正失敗');
 const a=aa/den,b=bb/den,tx=dm[0]-a*sm[0]+b*sm[1],ty=dm[1]-b*sm[0]-a*sm[1];
 const aligned=document.createElement('canvas');aligned.width=112;aligned.height=112;
 const ctx=aligned.getContext('2d');ctx.setTransform(a,b,-b,a,tx,ty);ctx.drawImage(canvas,0,0);
 const pixels=ctx.getImageData(0,0,112,112).data,plane=112*112,tensor=new Float32Array(plane*3);
 for(let p=0;p<plane;p++)for(let c=0;c<3;c++)tensor[c*plane+p]=(pixels[p*4+c]-127.5)/127.5;
 const output=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,112,112])});
 const vec=Array.from(output[session.outputNames[0]].data);
 if(vec.length!==512||vec.some(v=>!Number.isFinite(v)))throw Error('特徴データ取得失敗');
 const box=face.box||[];
 const bx=Array.isArray(box)?box[0]:box.x,by=Array.isArray(box)?box[1]:box.y,bw=Array.isArray(box)?box[2]:box.width,bh=Array.isArray(box)?box[3]:box.height;
 const crop=document.createElement('canvas');crop.width=160;crop.height=160;
 if([bx,by,bw,bh].every(Number.isFinite)&&bw>0&&bh>0){
  const side=Math.max(bw,bh)*1.5,cx=bx+bw/2,cy=by+bh/2;
  crop.getContext('2d').drawImage(canvas,cx-side/2,cy-side/2,side,side,0,0,160,160);
 }else{
  // Landmark-based fallback when the detector does not supply a bounding box.
  const xs=mesh.map(p=>p?.[0]).filter(Number.isFinite),ys=mesh.map(p=>p?.[1]).filter(Number.isFinite);
  if(!xs.length||!ys.length)throw Error('顔の切り抜き位置を取得できません');
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),side=Math.max(x1-x0,y1-y0)*1.35;
  crop.getContext('2d').drawImage(canvas,(x0+x1-side)/2,(y0+y1-side)/2,side,side,0,0,160,160);
 }
 results.push({vector:vec,thumbnail:crop.toDataURL('image/jpeg',0.82)});
 }catch(error){console.warn('顔ごとの解析失敗',error)}
 }
 if(!results.length)throw Error('検出した顔の特徴を取得できません');
 return results;
}
start.addEventListener('click',async()=>{
 const files=[...queued];if(files.length<2){status.textContent='2枚以上の写真を選んでください。';return}
 if(files.length>100){status.textContent='試作版は一度に100枚までです。';return}
 stop=false;start.disabled=true;cancel.disabled=false;selected.clear();items=[];groups=[];groupNames.clear();photoNames=files.map(f=>f.name);urls.forEach(URL.revokeObjectURL);urls=files.map(file=>URL.createObjectURL(file));photoUrls=[...urls];render();
 let session;
 try{
  status.textContent='AIモデルを準備しています…';
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const ort=await import(base+'ort.min.mjs');ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;
  const selectedModel=$('recognitionModel').value;
  let modelURL;
  if(selectedModel==='arcface'){
   // Recognition weights are downloaded only; images remain in the browser.
   modelURL='https://huggingface.co/globalnebula/insightface-buffalo-l-onnx/resolve/main/arcface_w600k_r50.onnx';
   status.textContent='研究用ArcFaceモデルを準備中（約174MB・初回は時間がかかります）…';
  }else{
   modelURL=new URL('./models/auraface-glintr100.onnx',import.meta.url).href;
   try{const r=await fetch(modelURL,{method:'HEAD'});if(!r.ok)throw Error('not found')}catch{modelURL='https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx'}
  }
  session=await ort.InferenceSession.create(modelURL,{executionProviders:['wasm']});
  const mod=await import('./human.esm.js'),Human=mod.Human||mod.default;
  const human=new Human({backend:'webgl',modelBasePath:new URL('./models/',import.meta.url).href,face:{enabled:true,detector:{enabled:true,maxDetected:20},mesh:{enabled:true},description:{enabled:false},iris:{enabled:false},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:false}},body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
  await human.load();const failed=[];
  for(let i=0;i<files.length;i++){
   if(stop)break;status.textContent='解析中 '+(i+1)+' / '+files.length+'枚';
   let bitmap;try{
    bitmap=await createImageBitmap(files[i]);const detected=await embed(bitmap,human,session,ort);
    for(let faceIndex=0;faceIndex<detected.length;faceIndex++){
     const {vector,thumbnail}=detected[faceIndex];
     items.push({name:files[i].name+'（顔'+(faceIndex+1)+'）',sourcePhoto:i,url:thumbnail,vector});
    }
   }catch(e){failed.push((i+1)+'枚目: '+String(e?.message||e).slice(0,65))}finally{bitmap?.close()}
   await new Promise(r=>setTimeout(r,0));
  }
  if(stop){status.textContent='⏹ 中断しました。アルバムへの変更はありません。';return}
  const threshold=Number($('threshold').value);
  const pairScores=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const score=similarity(items[i].vector,items[j].vector);
   if(Number.isFinite(score))pairScores.push({i,j,score});
  }
  pairScores.sort((a,b)=>b.score-a.score);
  groups=[{id:'unknown',members:[]}];let next=1;
  // DBSCAN: density-based face-embedding clustering, with singleton noise
  // retained as separate provisional groups for teacher review.
  const scoreMap=new Map(pairScores.map(p=>[p.i+':'+p.j,p.score]));
  const pairScore=(i,j)=>i===j?1:scoreMap.get(Math.min(i,j)+':'+Math.max(i,j));
  const neighbors=items.map((_,i)=>items.map((_,j)=>j).filter(j=>pairScore(i,j)>=threshold));
  const labels=new Int32Array(items.length).fill(-2); // -2 unvisited, -1 noise
  let clusterId=0;
  const minPts=2;
  for(let i=0;i<items.length;i++){
   if(labels[i]!==-2)continue;
   if(neighbors[i].length<minPts){labels[i]=-1;continue}
   const id=clusterId++;labels[i]=id;
   const queue=[...neighbors[i]],queuedNeighbors=new Set(queue);
   for(let head=0;head<queue.length;head++){
    const j=queue[head];
    if(labels[j]===-1)labels[j]=id;
    if(labels[j]!==-2)continue;
    labels[j]=id;
    if(neighbors[j].length>=minPts)for(const k of neighbors[j]){
     if(!queuedNeighbors.has(k)){queuedNeighbors.add(k);queue.push(k)}
    }
   }
  }
  const clustered=new Map();
  for(let i=0;i<items.length;i++){
   if(labels[i]<0)continue;
   if(!clustered.has(labels[i]))clustered.set(labels[i],[]);
   clustered.get(labels[i]).push(i);
  }
  for(const members of clustered.values())groups.push({id:String(next++),members});
  for(let i=0;i<items.length;i++)if(labels[i]<0)groups.push({id:String(next++),members:[i]});
  status.textContent='✅ '+files.length+'枚中'+(files.length-failed.length)+'枚解析・顔'+items.length+'件・仮グループ '+(groups.length-1)+'件（'+(selectedModel==='arcface'?'ArcFace':'AuraFace')+'・DBSCAN）。失敗 '+failed.length+'枚。\n※自動判定は誤り得ます。先生が確認してください。\n'+failed.slice(0,12).join(' ／ ');
  const old=$('pairDiagnostics');if(old)old.remove();
  const diagnostic=document.createElement('section');diagnostic.id='pairDiagnostics';diagnostic.className='panel';
  const heading=document.createElement('h2');heading.textContent='🔎 顔の比較値（高い順・上位20組）';diagnostic.append(heading);
  const info=document.createElement('p');info.className='muted';info.textContent='比較値は正解率ではありません。高いほど似ている傾向ですが、同一人物を保証しません。写真・比較値は保存しません。';diagnostic.append(info);
  for(const pair of pairScores.slice(0,20)){
   const row=document.createElement('p');row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #e8edf3;padding-bottom:8px';
   for(const id of [pair.i,pair.j]){const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.style.cssText='width:58px;height:58px;object-fit:cover;border-radius:8px';row.append(img)}
   const score=document.createElement('strong');score.textContent='比較値 '+pair.score.toFixed(4)+(pair.score>=threshold?'（基準以上）':'（基準未満）');row.append(score);diagnostic.append(row);
  }
  groupsHost.closest('section').after(diagnostic);
  render();
 }catch(e){status.textContent='⚠️ 解析できません: '+String(e?.message||e).slice(0,220)}
 finally{try{await session?.release()}catch{}start.disabled=false;cancel.disabled=true}
});
window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
