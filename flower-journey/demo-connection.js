/* Verification-only router. Every rendered document has an opaque sandbox origin. */
(()=>{
'use strict';
const game=document.getElementById('demoGame'),friend=document.getElementById('friendRegistration');
let display=game;
const routes={'friend-registration':['friend-registration-v6-standalone.html','おともだち登録 Ver.6'],'photo-add':['games/photo-add.html','写真追加'],'memory-catch':['games/memory-catch.html','おもいでキャッチ'],'cosmos-mistake':['games/cosmos.html','おもいで間違い探し']};
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
 for(const frame of [game,friend]){frame.hidden=true;frame.classList.remove('return-zoom','enter-zoom');frame.onload=null;frame.removeAttribute('srcdoc')}display=game;phase='closed';active='';
}
async function connect(frame){
 close();map=frame;const id=generation;
 const [html,bridge]=await Promise.all([source('master-LOCKED.html'),source('demo-map-bridge.js')]);
 if(id!==generation)throw Error('接続が中止されました');
 phase='map';
 const end=html.lastIndexOf('</body>');
 if(end<0)throw Error('マップ原本の構造を確認できません');
 const hotspot='<button id="friendButton" class="tap" type="button" style="--x:79.25%;--y:4.15%;--w:27.5%;--h:4.5%;" data-title="おともだち登録" aria-label="FLOWER WORLD：おともだち登録を開く"></button>';
 // Insert before the original map binds its .tap listeners, reusing its petals.
 const composed=html.slice(0,end)+script(bridge)+html.slice(end);
 map.srcdoc=isolate(composed.replace('</main>',hotspot+'</main>'));
}
async function start(stage){
 if(phase!=='map'||!routes[stage])return;
 phase='loading';const id=generation;active=stage;
 try{
  const [path,title]=routes[stage];
  const target=stage==='friend-registration'?friend:game;display=target;
  const reveal=()=>{
   if(id!==generation)return;
   target.onload=null;target.hidden=false;phase='game';
   if(target===friend){target.classList.remove('enter-zoom');void target.offsetWidth;target.classList.add('enter-zoom')}
  };
  // Keep the isolated registration document alive throughout this demo login.
  if(target===friend&&friend.hasAttribute('srcdoc')){reveal();return}
  const [html,adapter]=await Promise.all([source(path),stage==='photo-add'?source('demo-photo-adapter.js'):stage==='friend-registration'?source('demo-friend-adapter.js'):Promise.resolve('')]);
  if(id!==generation)return;
  const base=new URL(stage==='friend-registration'?'./':'games/',location.href).href;
  target.title=title+'（デモ・本保存なし）';
  target.onload=reveal;
  // The map stays visible underneath until the game has fully loaded.
  target.srcdoc=isolate(stage==='photo-add'?demoPhoto(html):html,adapter).replace('<base href="'+new URL('./',location.href).href+'">','<base href="'+base+'">');
 }catch(e){if(id!==generation)return;phase='map';active='';map.contentWindow.postMessage({type:'fj-demo-start-failed'},'*');notice(e.message)}
}
function returnToMap(){
 if(phase!=='game')return;
 phase='restoring';map.contentWindow.postMessage({type:'fj-demo-restore'},'*');
 timer=setTimeout(()=>{if(phase==='restoring'){phase='game';notice('マップ復帰を確認できませんでした。ゲーム画面を保持しています。')}},5000);
}
function fade(){
 clearTimeout(timer);phase='fading';const id=generation,leaving=display;leaving.classList.remove('enter-zoom');
 const finish=()=>{
  if(id!==generation)return;
  clearTimeout(timer);leaving.removeEventListener('transitionend',end);finishTransition=null;
  leaving.hidden=true;leaving.classList.remove('return-zoom');active='';phase='map';
  // No map navigation, unload, or delayed map hiding.
 };
 const end=e=>{if(e.target===leaving&&e.propertyName==='opacity')finish()};
 finishTransition=()=>leaving.removeEventListener('transitionend',end);
 leaving.addEventListener('transitionend',end);leaving.classList.add('return-zoom');timer=setTimeout(finish,1250);
}
window.addEventListener('message',e=>{
 const d=e.data;if(!d||e.origin!=='null')return;
 if(e.source===map?.contentWindow){
  if(d.type==='fj-demo-start')void start(d.stage);
  if(d.type==='fj-demo-map-ready'&&phase==='restoring')fade();
  if(d.type==='fj-demo-error')notice(d.message);
  return;
 }
 if(e.source!==display.contentWindow||phase!=='game')return;
 if(active==='friend-registration'&&d.type==='fj-demo-friend-delete'){
  const approved=window.confirm('このおともだちを一覧から削除しますか？');
  friend.contentWindow.postMessage({type:'fj-demo-friend-delete-result',request:d.request,approved},'*');return;
 }
 const complete=d.type==='flower-stage-complete'&&d.demo===true&&d.complete===true&&d.saved===false&&d.stage===active;
 const back=d.type==='flower-stage-back'&&((active==='memory-catch'&&!d.stage)||(active==='cosmos-mistake'&&d.stage===active)||(active==='friend-registration'&&d.stage===active));
 if(complete||back)returnToMap();
});
window.flowerDemo=Object.freeze({connect,close});
})();
