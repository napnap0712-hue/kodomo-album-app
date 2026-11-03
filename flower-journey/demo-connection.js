/* Verification-only router. Every rendered document has an opaque sandbox origin. */
(()=>{
'use strict';
const game=document.getElementById('demoGame'),friend=document.getElementById('friendRegistration');
let display=game,session=null,rosterModel=null,registration=null;
const fictionalRoster=new URLSearchParams(location.search).get('fictionalRoster')==='1';
const boundary=window.flowerClassBoundary,channels=new WeakMap();let mapReady=null;
function alive(){return boundary.isActive(session)}
function demoAllowed(){return alive()&&boundary.authorize(session,{...session,operation:'demo:navigate'}).allowed}
function bindPosts(code){return code.replace(/\b(?:window\.)?parent\.postMessage\(/g,'window.flowerDemoChannel.send(')}
function post(frame,data){const channelId=channels.get(frame);if(!alive()||!channelId)return;frame.contentWindow.postMessage({...data,...boundary.context(session,channelId)},'*')}
function bootstrap(frame){
 const channelId=crypto.randomUUID();channels.set(frame,channelId);
 const scope=JSON.stringify(boundary.context(session,channelId));
 return `(()=>{const scope=Object.freeze(${scope});Object.defineProperty(window,'flowerDemoChannel',{value:Object.freeze({send(data){parent.postMessage({...data,...scope},'*')},matches(e){return e.source===parent&&Object.keys(scope).every(k=>e.data?.[k]===scope[k])}})});window.addEventListener('load',()=>window.flowerDemoChannel.send({type:'fj-demo-document-ready'}),{once:true});})();`;
}
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
// This opt-in route can only construct generated fixtures; it has no data reader.
function fictionalFriend(html){
 const scope={classId:session.classId,schoolYear:session.schoolYear,baseYear:2026};
 const api=window.FlowerFriendRosterViewAdapter;
 rosterModel=api.createDemoModel(boundary,session,scope,window.FlowerFictionalRoster.make(scope));
 const view=JSON.stringify(api.viewFor(rosterModel)).replace(/</g,'\\u003c');
 const replacements=[
  ['let children=[],edit=-1', 'let children='+view+',edit=-1'],
  ["b.className='friend';b.append", "b.className='friend';b.dataset.rosterId=c.id;b.append"],
  ['const data={name,game,photo:imageData};',"const data={...(edit<0?{id:'fixture-new-'+crypto.randomUUID()}:children[edit]),name,game,photo:imageData};"]
 ];
 for(const [original,replacement] of replacements){
  if(html.split(original).length!==2)throw Error('Ver.6の架空名簿接続箇所を確認できません。原本は変更していません。');
  html=html.replace(original,replacement);
 }
 return html;
}
function notice(message){document.getElementById('status').textContent=message;document.getElementById('notice').hidden=false}
function close(){
 mapReady?.reject(Error('Map connection cancelled'));mapReady=null;
 registration?.close();registration=null;
 boundary.invalidate(session);session=null;rosterModel=null;
 ++generation;clearTimeout(timer);finishTransition?.();finishTransition=null;
 for(const frame of [game,friend]){frame.hidden=true;frame.classList.remove('return-zoom','enter-zoom');frame.onload=null;frame.removeAttribute('srcdoc');channels.delete(frame)}display=game;phase='closed';active='';
}
async function connect(frame,nextSession,registrationIntegration=null){
 close();
 if(!boundary.isActive(nextSession))throw Error('有効なデモセッションがありません');
 session=nextSession;registration=registrationIntegration;map=frame;const id=generation;
 const [html,bridge]=await Promise.all([source('master-LOCKED.html'),source('demo-map-bridge.js')]);
 if(id!==generation||!demoAllowed())throw Error('接続が中止されました');
 phase='map';
 const end=html.lastIndexOf('</body>');
 if(end<0)throw Error('マップ原本の構造を確認できません');
 const hotspot='<button id="friendButton" class="tap" type="button" style="--x:79.25%;--y:4.15%;--w:27.5%;--h:4.5%;" data-title="おともだち登録" aria-label="FLOWER WORLD：おともだち登録を開く"></button>';
 // Insert before the original map binds its .tap listeners, reusing its petals.
 const composed=html.slice(0,end)+script(bridge)+html.slice(end);
 const documentHTML=isolate(composed.replace('</main>',hotspot+'</main>'),bootstrap(map));
 const ready=new Promise((resolve,reject)=>{mapReady={id,resolve,reject}});let readyTimer;
 try{map.srcdoc=documentHTML;await Promise.race([ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('マップの準備応答を確認できません')),20000)})])}
 finally{clearTimeout(readyTimer);if(mapReady?.id===id)mapReady=null}
}
async function start(stage){
 if(!demoAllowed()||phase!=='map'||typeof stage!=='string'||!Object.hasOwn(routes,stage))return;
 phase='loading';const id=generation;active=stage;
 try{
  let memoryRows=null;
  if(stage==='memory-catch'&&registration?.memoryRows){
   memoryRows=await registration.memoryRows();if(id!==generation||!demoAllowed())return;
   if(!memoryRows.length){
    phase='map';active='';post(map,{type:'fj-demo-start-failed'});
    if(window.confirm('園児が0人です。おともだち登録を開きますか？')){await start('friend-registration')}
    else{display=game;phase='game';returnToMap();notice('FLOWER WORLDから架空のおともだちを登録してください。')}
    return;
   }
  }
  const [path,title]=routes[stage];
  const target=stage==='friend-registration'?friend:game;display=target;
  const reveal=()=>{
   if(id!==generation||!demoAllowed())return;
   target.onload=null;target.hidden=false;phase='game';
   if(target===friend)registration?.opened?.({post:data=>post(friend,data),returnToMap});
   if(target===friend){target.classList.remove('enter-zoom');void target.offsetWidth;target.classList.add('enter-zoom')}
  };
  // Keep the isolated registration document alive throughout this demo login.
  if(target===friend&&friend.hasAttribute('srcdoc')){reveal();return}
  const [html,adapter]=await Promise.all([source(path),stage==='photo-add'?source('demo-photo-adapter.js'):stage==='friend-registration'?source(registration?'stage10-friend-bridge.js':'demo-friend-adapter.js'):Promise.resolve('')]);
  if(id!==generation||!demoAllowed())return;
  const base=new URL(stage==='friend-registration'?'./':'games/',location.href).href;
  target.title=title+'（デモ・本保存なし）';
  target.onload=reveal;
  // The map stays visible underneath until the game has fully loaded.
  const documentHTML=memoryRows?window.FlowerStage11Memory.compose(html,memoryRows):stage==='friend-registration'&&registration?registration.composeFriend(html):stage==='friend-registration'&&fictionalRoster?fictionalFriend(html):stage==='photo-add'?demoPhoto(html):html;
  target.srcdoc=isolate(bindPosts(documentHTML),bootstrap(target)+bindPosts(adapter)).replace('<base href="'+new URL('./',location.href).href+'">','<base href="'+base+'">');
 }catch(e){if(id!==generation||!demoAllowed())return;phase='map';active='';post(map,{type:'fj-demo-start-failed'});notice(e.message)}
}
function returnToMap(){
 if(!demoAllowed()||phase!=='game')return;
 phase='restoring';post(map,{type:'fj-demo-restore'});
 timer=setTimeout(()=>{if(phase==='restoring'){phase='game';notice('マップ復帰を確認できませんでした。ゲーム画面を保持しています。')}},5000);
}
function fade(){
 clearTimeout(timer);phase='fading';const id=generation,leaving=display;leaving.classList.remove('enter-zoom');
 const finish=()=>{
  if(id!==generation||!demoAllowed())return;
  clearTimeout(timer);leaving.removeEventListener('transitionend',end);finishTransition=null;
  leaving.hidden=true;leaving.classList.remove('return-zoom');active='';phase='map';
  // No map navigation, unload, or delayed map hiding.
 };
 const end=e=>{if(e.target===leaving&&e.propertyName==='opacity')finish()};
 finishTransition=()=>leaving.removeEventListener('transitionend',end);
 leaving.addEventListener('transitionend',end);leaving.classList.add('return-zoom');timer=setTimeout(finish,1250);
}
window.addEventListener('message',e=>{
 const d=e.data;if(!d||!demoAllowed())return;
 if(map&&boundary.accepts(session,e,map.contentWindow,channels.get(map))){
  if(d.type==='fj-demo-document-ready'){mapReady?.resolve();return}
  if(d.type==='fj-demo-start')void start(d.stage);
  if(d.type==='fj-demo-map-ready'&&phase==='restoring')fade();
  if(d.type==='fj-demo-error')notice(d.message);
  return;
 }
 if(!boundary.accepts(session,e,display.contentWindow,channels.get(display))||phase!=='game')return;
 if(active==='friend-registration'&&registration&&typeof d.type==='string'&&d.type.startsWith('stage10-')){
  void registration.handle(d,{post:data=>post(friend,data),returnToMap});return;
 }
 if(active==='friend-registration'&&d.type==='fj-demo-friend-delete'){
  const approved=window.confirm('このおともだちを一覧から削除しますか？');
  post(friend,{type:'fj-demo-friend-delete-result',request:d.request,approved});return;
 }
 const complete=d.type==='flower-stage-complete'&&d.demo===true&&d.complete===true&&d.saved===false&&d.stage===active;
 const back=d.type==='flower-stage-back'&&((active==='memory-catch'&&!d.stage)||(active==='cosmos-mistake'&&d.stage===active)||(active==='friend-registration'&&d.stage===active));
 if(complete||back)returnToMap();
});
window.flowerDemo=Object.freeze({connect,close});
})();
