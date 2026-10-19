// Isolated AuraFace compatibility probe. No photo or embeddings are uploaded or persisted.
// The source model is downloaded to the browser; real face alignment and identity
// scoring are deliberately left for a separate, validated comparison stage.
const $=id=>document.getElementById(id);
const btn=$('testAuraFaceProbe'),status=$('auraFaceProbeStatus');
if(btn&&status)btn.addEventListener('click',async()=>{
 btn.disabled=true;
 const started=performance.now();
 let session=null;
 try{
  status.textContent='AuraFaceの実行環境を読み込み中…';
  const version='1.22.0';
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@'+version+'/dist/';
  const ort=await import(base+'ort.min.mjs');
  ort.env.wasm.wasmPaths=base;
  ort.env.wasm.numThreads=1;
  const model=new URL('face-recognition/models/auraface-glintr100.onnx',document.baseURI);
  const fallback='https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx';
  let modelURL=model.href;
  status.textContent='AuraFaceモデルの所在を確認中…';
  try{
   const response=await fetch(model,{method:'HEAD'});
   if(!response.ok)modelURL=fallback;
  }catch{modelURL=fallback}
  status.textContent='AuraFaceモデルを読み込み中（約261MB・初回は通信が必要）…';
  // No photo data is sent: only the public model binary is downloaded.
  session=await ort.InferenceSession.create(modelURL,{executionProviders:['wasm'],graphOptimizationLevel:'basic'});
  const input=session.inputNames[0];
  const metadata=session.inputMetadata?.[0]||session.inputMetadata?.[input];
  status.textContent='モデル読込成功。112×112の人工データで推論確認中…';
  const dummy=new Float32Array(3*112*112);
  const output=await session.run({[input]:new ort.Tensor('float32',dummy,[1,3,112,112])});
  const result=output[session.outputNames[0]];
  if(!result||result.data.length!==512)throw Error('出力が512次元ではありません');
  status.textContent='✅ AuraFace実行成功：512次元の特徴出力を確認（'+Math.round((performance.now()-started)/1000)+'秒）。人工データのみで確認。園児写真の照合は未実施、保存データの変更なし。';
 }catch(error){
  console.warn('AuraFace compatibility probe failed',error);
  status.textContent='⚠️ AuraFace読込・実行失敗：'+String(error?.message||error).slice(0,180)+'。園児の写真・保存データは変更していません。';
 }finally{
  try{await session?.release()}catch{}
  btn.disabled=false;
 }
});

/* Two-photo, in-memory face similarity diagnostic. No persistent changes. */
const compareBtn=$('compareAuraFaceTwo'),compareStatus=$('auraFaceCompareStatus');
if(compareBtn&&compareStatus)compareBtn.addEventListener('click',async()=>{
 const source=$('auraFaceCompareFiles'),chosen=[...(source?.files||[])];
 if(chosen.length!==2){compareStatus.textContent='比較したい写真を2枚選んでください。';return}
 compareBtn.disabled=true;
 let session;
 try{
  compareStatus.textContent='モデルの準備中…';
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const ort=await import(base+'ort.min.mjs');
  ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;
  let modelURL=new URL('face-recognition/models/auraface-glintr100.onnx',document.baseURI).href;
  try{const r=await fetch(modelURL,{method:'HEAD'});if(!r.ok)throw Error('not local')}
  catch{modelURL='https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx'}
  session=await ort.InferenceSession.create(modelURL,{executionProviders:['wasm']});
  const embeddings=[];
  for(let i=0;i<2;i++){
   compareStatus.textContent='写真'+(i+1)+'の顔を処理中…';
   const bitmap=await createImageBitmap(chosen[i]);
   try{
    // Human is used exclusively to locate landmarks; AuraFace performs identification.
    const human=await (async()=>{
     const mod=await import(new URL('./human.esm.js',import.meta.url).href);
     const Human=mod.Human||mod.default;
     const engine=new Human({backend:'webgl',modelBasePath:new URL('./models/',import.meta.url).href,
      face:{enabled:true,detector:{enabled:true,maxDetected:5},mesh:{enabled:true},description:{enabled:false},iris:{enabled:false},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:false}},
      body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
     await engine.load();return engine;
    })();
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const faces=(await human.detect(canvas)).face||[];
    if(faces.length!==1)throw Error('写真'+(i+1)+'は顔が'+faces.length+'個です。顔が1人だけ写る写真を選んでください');
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
    embeddings.push(vec);
   }finally{bitmap.close()}
  }
  const [a,b]=embeddings;let dot=0,na=0,nb=0;
  for(let i=0;i<512;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}
  const score=dot/Math.sqrt(na*nb);
  compareStatus.textContent='✅ AuraFace比較値 '+score.toFixed(4)+'（正解率ではありません）。同一人物かの自動判定はまだ行いません。写真・特徴データは保存・送信していません。';
 }catch(e){console.warn('AuraFace two image comparison',e);compareStatus.textContent='⚠️ 比較できません：'+String(e?.message||e).slice(0,160)}
 finally{try{await session?.release()}catch{}compareBtn.disabled=false}
});
