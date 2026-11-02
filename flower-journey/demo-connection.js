/* Verification-only router. Every rendered document has an opaque sandbox origin. */
(()=>{
'use strict';
const game=document.getElementById('demoGame');
const routes={'photo-add':['games/photo-add.html','写真追加'],'memory-catch':['games/memory-catch.html','おもいでキャッチ'],'cosmos-mistake':['games/cosmos.html','おもいで間違い探し']};
let map=null,active='',phase='closed',generation=0,timer=null,finishTransition=null;
const sources=new Map();
async function source(path){
 if(!sources.has(path)){
  const r=await fetch(path,{credentials:'omit',cache:'no-store'});if(!r.ok)throw Error(path+' を読み込めませんでした');
  sources.set(path,await r.text());
 }
 return sources.get(path);
}
function script(code){return '<script>'+code.replace(/<\/script/gi,'<\\/script')+'<\/script>'}
function isolate(html,bootstrap=''){
 const csp="default-src 'none'; img-src "+location.origin+" data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src about:; connect-src 'none'; form-action 'none'; base-uri "+location.origin;
 return html.replace(/<head(?:\s[^>]*)?>/i,match=>match+'<meta http-equiv="Content-Security-Policy" content="'+csp+'"><base href="'+new URL('./',location.href).href+'">'+script(bootstrap));
}
// Adapt only the sandbox's in-memory document. The game's source and its
// normal persistence path are never edited or used by the verification entry.
function demoPhoto(html){
 const replacements=[
  ['async function persistPhotos(){','async function persistPhotos(){\n if(window.flowerPhotoDemo)return window.flowerPhotoDemo.save(selectedFiles);'],
  ['saved:true,sessionId:info.sessionId','saved:info.demo!==true,demo:info.demo===true,complete:true,sessionId:info.sessionId']
 ];
 for(const [original,replacement] of replacements){
  if(html.split(original).length!==2)throw Error('写真追加の検証接続箇所を確認できません。原本は変更していません。');
  html=html.replace(original,replacement);
 }
 return html;
}
function notice(message){document.getElementById('status').textContent=message;document.getElementById('notice').hidden=false}
function close(){
 ++generation;clearTimeout(timer);finishTransition?.();finishTransition=null;
 game.hidden=true;game.classList.remove('return-zoom');game.onload=null;game.removeAttribute('srcdoc');phase='closed';active='';
}
async function connect(frame){
 close();map=frame;const id=generation;
 const [html,bridge]=await Promise.all([source('master-LOCKED.html'),source('demo-map-bridge.js')]);
 if(id!==generation)throw Error('接続が中止されました');
 phase='map';
 const end=html.lastIndexOf('</body>');
 if(end<0)throw Error('マップ原本の構造を確認できません');
 map.srcdoc=isolate(html.slice(0,end)+script(bridge)+html.slice(end));
}
async function start(stage){
 if(phase!=='map'||!routes[stage])return;
 phase='loading';const id=generation;active=stage;
 try{
  const [path,title]=routes[stage];
  const [html,adapter]=await Promise.all([source(path),stage==='photo-add'?source('demo-photo-adapter.js'):Promise.resolve('')]);
  if(id!==generation)return;
  const base=new URL('games/',location.href).href;
  game.title=title+'（デモ・本保存なし）';
  game.onload=()=>{if(id!==generation)return;game.onload=null;game.hidden=false;phase='game'};
  // The map stays visible underneath until the game has fully loaded.
  game.srcdoc=isolate(stage==='photo-add'?demoPhoto(html):html,adapter).replace('<base href="'+new URL('./',location.href).href+'">','<base href="'+base+'">');
 }catch(e){if(id!==generation)return;phase='map';active='';map.contentWindow.postMessage({type:'fj-demo-start-failed'},'*');notice(e.message)}
}
function returnToMap(){
 if(phase!=='game')return;
 phase='restoring';map.contentWindow.postMessage({type:'fj-demo-restore'},'*');
 timer=setTimeout(()=>{if(phase==='restoring'){phase='game';notice('マップ復帰を確認できませんでした。ゲーム画面を保持しています。')}},5000);
}
function fade(){
 clearTimeout(timer);phase='fading';const id=generation;
 const finish=()=>{
  if(id!==generation)return;
  clearTimeout(timer);game.removeEventListener('transitionend',end);finishTransition=null;
  game.hidden=true;game.classList.remove('return-zoom');active='';phase='map';
  // No map navigation, unload, or delayed map hiding.
 };
 const end=e=>{if(e.target===game&&e.propertyName==='opacity')finish()};
 finishTransition=()=>game.removeEventListener('transitionend',end);
 game.addEventListener('transitionend',end);game.classList.add('return-zoom');timer=setTimeout(finish,1250);
}
window.addEventListener('message',e=>{
 const d=e.data;if(!d||e.origin!=='null')return;
 if(e.source===map?.contentWindow){
  if(d.type==='fj-demo-start')void start(d.stage);
  if(d.type==='fj-demo-map-ready'&&phase==='restoring')fade();
  if(d.type==='fj-demo-error')notice(d.message);
  return;
 }
 if(e.source!==game.contentWindow||phase!=='game')return;
 const complete=d.type==='flower-stage-complete'&&d.demo===true&&d.complete===true&&d.saved===false&&d.stage===active;
 const back=d.type==='flower-stage-back'&&((active==='memory-catch'&&!d.stage)||(active==='cosmos-mistake'&&d.stage===active));
 if(complete||back)returnToMap();
});
window.flowerDemo=Object.freeze({connect,close});
})();
