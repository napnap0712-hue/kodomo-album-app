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
