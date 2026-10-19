// AuraFace two-labelled-set comparison. Local memory only; no persistent changes.
const el=id=>document.getElementById(id);
const start=el('auraBatchStart'),cancel=el('auraBatchCancel'),status=el('auraBatchStatus'),results=el('auraBatchResults');
let cancelled=false;
const staged={A:[],B:[]};
for(const group of ['A','B']){
 const input=el('auraBatchGroup'+group),host=el('auraBatchList'+group);
 const render=()=>{
  host.replaceChildren();
  const count=document.createElement('span');count.textContent=staged[group].length+'枚選択済み';host.append(count);
  staged[group].forEach((file,index)=>{
   const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0';
   const name=document.createElement('span');name.textContent=(index+1)+'. '+file.name;name.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
   const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='×';remove.setAttribute('aria-label',file.name+'を取り消す');remove.style.padding='5px 11px';
   remove.addEventListener('click',()=>{staged[group].splice(index,1);render()});
   line.append(name,remove);host.append(line);
  });
 };
 input?.addEventListener('change',()=>{
  for(const file of Array.from(input.files||[])){
   if(staged.A.length+staged.B.length>=20){status.textContent='最大20枚までです。';break}
   staged[group].push(file);
  }
  input.value='';render();
 });
 render();
}
const cosine=(x,y)=>{let dot=0,aa=0,bb=0;for(let k=0;k<x.length;k++){dot+=x[k]*y[k];aa+=x[k]*x[k];bb+=y[k]*y[k]}return dot/Math.sqrt(aa*bb)};
if(cancel)cancel.addEventListener('click',()=>{cancelled=true;status.textContent='中断を受け付けました。';});
if(start)start.addEventListener('click',async()=>{
 const first=[...staged.A],second=[...staged.B];
 if(first.length<2||second.length<2){status.textContent='園児A・園児Bそれぞれ、1人だけ写っている写真を2枚以上選んでください。';return}
 if(first.length+second.length>20){status.textContent='最初は端末負荷を抑えるため、合計20枚以内で試してください。';return}
 const chosen=[...first.map(file=>({file,group:'A'})),...second.map(file=>({file,group:'B'}))];
 cancelled=false;start.disabled=true;cancel.disabled=false;results.replaceChildren();
 let session;
 try{
  status.textContent='AIを準備中…';
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const ort=await import(base+'ort.min.mjs');
  ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;
  let modelURL=new URL('face-recognition/models/auraface-glintr100.onnx',document.baseURI).href;
  try{const r=await fetch(modelURL,{method:'HEAD'});if(!r.ok)throw Error('local model missing')}
  catch{modelURL='https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx'}
  session=await ort.InferenceSession.create(modelURL,{executionProviders:['wasm']});
  const module=await import(new URL('./human.esm.js',import.meta.url).href),Human=module.Human||module.default;
  const human=new Human({backend:'webgl',modelBasePath:new URL('./models/',import.meta.url).href,
   face:{enabled:true,detector:{enabled:true,maxDetected:5},mesh:{enabled:true},description:{enabled:false},iris:{enabled:false},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:false}},
   body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
  await human.load();
  const embeddings=[],failures=[];
  for(let index=0;index<chosen.length;index++){
   if(cancelled)break;
   const item=chosen[index];
   status.textContent='顔を解析中 '+(index+1)+' / '+chosen.length+'枚';
   try{
   const bitmap=await createImageBitmap(item.file);
   try{
    // Human is used exclusively to locate landmarks; AuraFace performs identification.
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const faces=(await human.detect(canvas)).face||[];
    if(faces.length!==1)throw Error('写真'+(index+1)+'は顔が'+faces.length+'個です。顔が1人だけ写る写真を選んでください');
    const face=faces[0],mesh=face.mesh;
    if(!Array.isArray(mesh)||mesh.length<292)throw Error('顔の位置補正に必要な目・鼻・口の点が取得できません');
    const indices=[33,263,1,61,291];
    const sourcePoints=indices.map(k=>[mesh[k]?.[0],mesh[k]?.[1]]);
    if(sourcePoints.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('顔の位置情報を読み取れません');
    const dest=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
    // Least-squares 2D similarity transform using centered coordinates.
    const mean=p=>p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]);
    const sm=mean(sourcePoints),dm=mean(dest);
    let aa=0,bb=0,den=0;
    for(let k=0;k<5;k++){
     const x=sourcePoints[k][0]-sm[0],y=sourcePoints[k][1]-sm[1];
     const u=dest[k][0]-dm[0],v=dest[k][1]-dm[1];
     aa+=x*u+y*v;bb+=x*v-y*u;den+=x*x+y*y;
    }
    if(den<1)throw Error('顔の位置補正に失敗');
    const a=aa/den,b=bb/den,tx=dm[0]-a*sm[0]+b*sm[1],ty=dm[1]-b*sm[0]-a*sm[1];
    const aligned=document.createElement('canvas');aligned.width=112;aligned.height=112;
    const ctx=aligned.getContext('2d');ctx.setTransform(a,b,-b,a,tx,ty);ctx.drawImage(canvas,0,0);
    const data=ctx.getImageData(0,0,112,112).data,plane=112*112,tensor=new Float32Array(plane*3);
    for(let p=0;p<plane;p++)for(let c=0;c<3;c++)tensor[c*plane+p]=(data[p*4+c]-127.5)/127.5;
    const result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,112,112])});
    const vec=Array.from(result[session.outputNames[0]].data);
    if(vec.length!==512||vec.some(v=>!Number.isFinite(v)))throw Error('AuraFace特徴抽出に失敗');

    embeddings.push({vector:vec,group:item.group,label:item.group+'-'+(item.group==='A'?index+1:index-first.length+1)});
   }finally{bitmap.close()}
   }catch(e){failures.push({number:index+1,reason:String(e?.message||e).slice(0,120)});console.warn('AuraFace batch comparison sample failed',index,e)}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(cancelled){status.textContent='⏹ 中断しました。結果・写真は保存していません。';return}
  const same=[],different=[];
  for(let i=0;i<embeddings.length;i++)for(let j=i+1;j<embeddings.length;j++){
   const x=embeddings[i],y=embeddings[j],score=cosine(x.vector,y.vector);
   (x.group===y.group?same:different).push({x:x.label,y:y.label,score});
  }
  const summarize=arr=>arr.length?('最小 '+Math.min(...arr.map(v=>v.score)).toFixed(4)+' / 最大 '+Math.max(...arr.map(v=>v.score)).toFixed(4)):'比較なし';
  const overlap=same.length&&different.length&&Math.min(...same.map(v=>v.score))<=Math.max(...different.map(v=>v.score));
  status.style.whiteSpace='pre-line';
  status.textContent=['✅ '+embeddings.length+'枚解析（失敗 '+failures.length+'枚）','同じ園児 '+same.length+'組：'+summarize(same),'違う園児 '+different.length+'組：'+summarize(different),'比較値の範囲が重なる：'+(overlap?'あり':'なし（今回の写真に限る）'),'写真・特徴データ・結果は保存も送信もしません。自動振り分けもしません。'].join(String.fromCharCode(10));
  const heading=document.createElement('strong');heading.textContent='別の園児なのに比較値が高い組（上位5件）';results.append(heading);
  for(const item of different.sort((a,b)=>b.score-a.score).slice(0,5)){
   const p=document.createElement('p');p.className='muted';p.textContent=item.x+' と '+item.y+'：'+item.score.toFixed(4);results.append(p);
  }
  if(failures.length){const p=document.createElement('p');p.className='muted';p.textContent='解析失敗：'+failures.map(f=>f.number+'枚目：'+f.reason).join(' ／ ');results.append(p)}
 }catch(e){console.warn('AuraFace batch comparison',e);status.textContent='⚠️ 一括比較失敗：'+String(e?.message||e).slice(0,180)}
 finally{try{await session?.release()}catch{}start.disabled=false;cancel.disabled=true}
});
