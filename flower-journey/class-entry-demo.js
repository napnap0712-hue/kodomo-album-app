/* Ver.8 visual handoff only. No real authentication, roster, album or storage API. */
(()=>{
'use strict';
const entry=document.getElementById('entry'),map=document.getElementById('map'),view=document.getElementById('mapView');
const notice=document.getElementById('notice'),status=document.getElementById('status'),retry=document.getElementById('retry'),petals=document.getElementById('petals');
const names=['たんぽぽ','ちゅうりっぷ','コスモス','カンナ','でいご','さくら'];
// Explicit fictional school year; never infer a legacy storage year.
const demoScope=Object.freeze({mode:'demo',schoolYear:2026});
const boundary=window.flowerClassBoundary;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let nonce='',generation=0,busy=false,source='';
function message(text,failed=false){status.textContent=text;notice.hidden=false;retry.hidden=!failed}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('読み込みが完了しませんでした。もう一度お試しください。')),ms)})]).finally(()=>clearTimeout(timer))}
function installEntry(){
 nonce=Array.from(crypto.getRandomValues(new Uint32Array(4)),v=>v.toString(16)).join('-');
 // Fail closed if the approved prototype changes: never activate its original map router.
 const original="document.getElementById('mapView').hidden=false;\n   document.getElementById('mapFrame').src='index.html';\n   document.getElementById('mapClass').textContent=selected+'ぐみ';";
 if(source.split(original).length!==2)throw Error('Ver.8原本の接続箇所を確認できません。原本を確認してください。');
 const replacement="window.parent.postMessage({type:'fj-v8-demo-login',nonce:"+JSON.stringify(nonce)+",classIndex:names.indexOf(selected)},'*');";
 const csp="default-src 'none'; img-src "+location.origin+" data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri "+location.origin;
 const html=source.replace(original,replacement).replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><base href="'+new URL('./',location.href).href+'">');
 entry.srcdoc=html;
}
async function loadEntry(){
 const id=++generation;busy=true;retry.hidden=true;message('Ver.8の入口を読み込んでいます…');
 try{
  if(!source){
   const response=await timeout(fetch('class-entry-password-v8.html',{cache:'no-store',credentials:'omit'}),15000);
   if(!response.ok)throw Error('Ver.8原本を読み込めませんでした。');
   source=await response.text();
  }
  if(id!==generation)return;
  const loaded=new Promise(resolve=>{entry.onload=()=>{entry.onload=null;resolve()}});
  installEntry();await timeout(loaded,15000);
  if(id!==generation)return;
  notice.hidden=true;busy=false;
 }catch(error){if(id===generation){busy=false;message(String(error.message||error),true)}}
}
function bloom(){
 petals.replaceChildren();if(reduce.matches)return;
 const colors=['#f2a3b4','#f6c96d','#c9b2e8','#f3a184','#fff4d8','#a9cdb6'];
 for(let i=0;i<64;i++){
  const p=document.createElement('i'),angle=Math.PI*2*(i%32)/32,reach=Math.max(innerWidth,innerHeight)*(.5+(i%8)/14);
  const dx=Math.cos(angle)*reach,dy=Math.sin(angle)*reach+115,side=(i%2?1:-1)*(36+i%7*12);
  p.className='petal';p.style.left='50%';p.style.top='48%';
  p.style.setProperty('--size',(9+i*7%12)+'px');p.style.setProperty('--color',colors[i%colors.length]);
  [[.16,side*.7,-35],[.37,-side*.78,-70],[.60,side*1.1,-45],[.82,-side*.55,-15]].forEach(([t,sway,lift],k)=>{
   p.style.setProperty('--x'+(k+1),(dx*t+sway)+'px');p.style.setProperty('--y'+(k+1),(dy*t+lift)+'px');
  });
  p.style.setProperty('--dx',dx+'px');p.style.setProperty('--dy',dy+'px');p.style.setProperty('--duration',(2600+i%6*125)+'ms');
  p.addEventListener('animationend',()=>p.remove(),{once:true});petals.append(p);
 }
}
window.addEventListener('message',async event=>{
 const data=event.data;
 // This is a temporary UI session, never passed to cjOriginalApp or persisted.
 if(event.source!==entry.contentWindow||event.origin!=='null'||data?.type!=='fj-v8-demo-login'||data.nonce!==nonce||!Number.isInteger(data.classIndex)||!names[data.classIndex]||busy||!view.hidden)return;
 if(Object.keys(data).some(key=>!['type','nonce','classIndex'].includes(key)))return;
 const id=++generation;busy=true;
 let session;
 document.getElementById('mapClass').textContent=names[data.classIndex]+'ぐみ';
 message('仮ログイン確認済み。冒険マップを読み込んでいます…');
 try{
  session=boundary.createSession({classId:window.FlowerClassDataBoundary.classIdForIndex(data.classIndex),...demoScope});
  const loaded=new Promise(resolve=>{map.onload=()=>{map.onload=null;resolve()}});
  // Compose an isolated view without changing the immutable map file.
  await window.flowerDemo.connect(map,session);
  await timeout(loaded,20000);if(id!==generation||!boundary.isActive(session))return;
  bloom();await new Promise(resolve=>setTimeout(resolve,reduce.matches?0:900));if(id!==generation)return;
  view.hidden=false;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(id!==generation)return;
  view.classList.add('visible','reveal');notice.hidden=true;
  // Retain iframe layout: display:none can leave a reloaded srcdoc at a zero viewport.
  setTimeout(()=>{if(id===generation){entry.style.visibility='hidden';entry.inert=true;busy=false}},reduce.matches?0:1050);
 }catch(error){
  if(id!==generation)return;
  boundary.invalidate(session);window.flowerDemo.close();
  map.onload=null;map.removeAttribute('src');map.removeAttribute('srcdoc');view.hidden=true;busy=false;
  message(String(error.message||error),true);
 }
});
document.getElementById('logout').addEventListener('click',()=>{
 ++generation;busy=false;boundary.invalidate();window.flowerDemo.close();map.onload=null;map.removeAttribute('src');map.removeAttribute('srcdoc');view.hidden=true;view.classList.remove('visible','reveal');petals.replaceChildren();
 entry.style.removeProperty('visibility');entry.inert=false;nonce='';void loadEntry();
});
retry.addEventListener('click',()=>{void loadEntry()});
void loadEntry();
})();
