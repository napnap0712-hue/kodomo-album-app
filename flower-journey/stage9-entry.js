/* Independent fictional prototype controller. No production auth or data privileges. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),entry=$('entry'),map=$('map'),view=$('mapView');
const boundary=window.flowerClassBoundary,names=['たんぽぽ','ちゅうりっぷ','コスモス','カンナ','でいご','さくら'];
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),petals=$('petals');
let nonce='',generation=0,selection=null,busy=false,source='',bridge='';
function notice(text,retry=false){$('status').textContent=text;$('notice').hidden=false;$('retry').hidden=!retry}
function post(type,extra={}){if(selection)entry.contentWindow.postMessage({type,nonce,classIndex:selection.index,serial:selection.serial,...extra},'*')}
function live(c,id){if(id!==generation||selection!==c||!boundary.isActive(c.session))throw Error('Cancelled')}
async function fetchText(path){const r=await fetch(path,{credentials:'omit',cache:'no-store'});if(!r.ok)throw Error('Asset unavailable');return r.text()}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout')),ms)})]).finally(()=>clearTimeout(timer))}
function compose(){
 const doc=new DOMParser().parseFromString(source,'text/html');
 if(doc.querySelectorAll('.character').length!==6||doc.querySelectorAll('script').length!==1||!doc.querySelector('#form .go')||!doc.querySelector('.art[src="assets/class-entry-art.png"]'))throw Error('Approved entry changed');
 doc.querySelectorAll('script').forEach(el=>el.remove());doc.querySelector('#mapView').remove();doc.querySelector('#mock').remove();
 doc.querySelector('.demoNotice').textContent='第9段階｜2026年度・架空データ専用・本番利用不可';
 const pass=doc.querySelector('#password');pass.setAttribute('autocapitalize','off');pass.setAttribute('spellcheck','false');
 const recovery=doc.createElement('div');recovery.id='recoveryPanel';recovery.className='overlay';recovery.hidden=true;
 recovery.innerHTML='<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle"><h2 id="recoveryTitle">復旧キーを控えてください</h2><p>2026年度・架空データ専用。キーはブラウザに保存しません。</p><div id="issuedArea"><label for="issuedKey">今回のテスト用復旧キー</label><input id="issuedKey" type="password" readonly autocomplete="off"><label><input id="revealKey" type="checkbox" style="width:auto"> キーを表示する</label></div><div id="resumeArea" hidden><label for="recoverySecret">以前控えたテスト用復旧キー</label><input id="recoverySecret" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"><p>控えていない場合は完了できません。保存データは自動削除・上書きしません。</p></div><label><input id="recorded" type="checkbox" style="width:auto"> 復旧キーを安全な場所へ控えました</label><div class="buttons"><button id="recoveryCancel" class="cancel" type="button">← もどる</button><button id="ack" class="go" type="button">確認してマップへ</button></div><p id="recoveryMessage" class="message" aria-live="polite"></p></section>';
 doc.body.append(recovery);
 const base=doc.createElement('base');base.href=new URL('./',location.href).href;doc.head.prepend(base);
 const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; img-src "+location.origin+" data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri "+location.origin;doc.head.prepend(csp);
 const script=doc.createElement('script');script.textContent='Object.defineProperty(window,"stage9Nonce",{value:'+JSON.stringify(nonce)+'});\n'+bridge;doc.body.append(script);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
async function load(){
 const id=++generation;busy=true;selection=null;boundary.invalidate();notice('第9段階の入口を読み込んでいます…');
 try{
  if(!isSecureContext||!crypto.subtle||typeof crypto.randomUUID!=='function'||!globalThis.indexedDB)throw Error('Unsupported');
  if(!source)[source,bridge]=await timeout(Promise.all([fetchText('class-entry-password-v8.html'),fetchText('stage9-entry-bridge.js')]),15000);
  if(id!==generation)return;nonce=crypto.randomUUID();
  const loaded=new Promise(resolve=>{entry.onload=()=>{entry.onload=null;resolve()}});entry.srcdoc=compose();await timeout(loaded,15000);
  if(id!==generation)return;busy=false;$('notice').hidden=true;
 }catch{if(id===generation){busy=false;notice('第9段階を開けません。HTTPS・ブラウザ対応・ファイル配置を確認してください。',true)}}
}
function compare(c,records){if(JSON.stringify(records)!==JSON.stringify(FlowerFictionalRoster.make(c.scope)))throw Error('Fictional fixture mismatch')}
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
async function enterMap(c,id){
 live(c,id);if(!c.unlocked)throw Error('Locked');post('stage9-cleared');
 notice('架空データの解除確認済み。冒険マップを読み込んでいます…');
 const loaded=new Promise(resolve=>{map.onload=()=>{map.onload=null;resolve()}});
 await window.flowerDemo.connect(map,c.session);await timeout(loaded,20000);live(c,id);
 bloom();view.hidden=false;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));live(c,id);
 view.classList.add('visible','reveal');entry.style.visibility='hidden';entry.inert=true;$('notice').hidden=true;
 $('mapClass').textContent=names[c.index]+'ぐみ（2026年度）';
 // No decrypted roster, password or recovery key is supplied to games or registration.
 c.envelopeJSON=null;c.recoveryKey=null;
}
window.addEventListener('message',async event=>{
 const d=event.data;
 if(event.source!==entry.contentWindow||event.origin!=='null'||!d||d.nonce!==nonce||!view.hidden||busy||!Number.isInteger(d.classIndex)||!names[d.classIndex]||!Number.isSafeInteger(d.serial)||d.serial<1)return;
 const allowed=['type','nonce','classIndex','serial',...(['stage9-submit','stage9-confirm'].includes(d.type)?['secret']:[])];
 if(Object.keys(d).some(k=>!allowed.includes(k)))return;
 if(d.type==='stage9-cancel'){if(selection?.index===d.classIndex&&selection.serial===d.serial){++generation;boundary.invalidate();selection=null}return}
 if(!['stage9-select','stage9-submit','stage9-confirm'].includes(d.type))return;
 if(d.type!=='stage9-select'&&(!selection||selection.index!==d.classIndex||selection.serial!==d.serial||typeof d.secret!=='string'||d.secret.length>1024))return;
 busy=true;const id=++generation;let c=selection,phase='読取';
 try{
  if(d.type==='stage9-select'){
   boundary.invalidate();const scope=Object.freeze({classId:FlowerClassDataBoundary.classIdForIndex(d.classIndex),schoolYear:2026,baseYear:2026});
   const session=boundary.createSession({...scope,mode:'demo'});
   c=selection={index:d.classIndex,serial:d.serial,scope,session,crypt:FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),vault:FlowerStage9Vault.createVault(boundary,session,scope),unlocked:false,envelopeJSON:null,recoveryKey:null};
   const slot=await c.vault.read();live(c,id);post('stage9-mode',{mode:slot.state==='empty'?'setup':slot.state==='pending'?'pending':'unlock'});
  }else if(d.type==='stage9-submit'){
   const slot=await c.vault.read();live(c,id);
   if(slot.state==='empty'){
    phase='初回保存';const records=FlowerFictionalRoster.make(c.scope);
    const input=JSON.stringify({format:FlowerFictionalRosterReadonlyAdapter.FORMAT,source:'fictional-json',...c.scope,storageKey:FlowerFriendRosterViewAdapter.legacyRosterKey(c.scope),rosterJSON:JSON.stringify(records)});
    const sealed=await c.crypt.encrypt(input,d.secret);live(c,id);
    // Preserve the transient key for a same-page retry if commit acknowledgement fails.
    c.envelopeJSON=sealed.envelopeJSON;c.recoveryKey=sealed.recoveryKey;
    await c.vault.savePending(sealed.envelopeJSON,d.secret);live(c,id);
    const confirmed=await c.vault.read();live(c,id);if(confirmed.state!=='pending'||confirmed.envelopeJSON!==sealed.envelopeJSON)throw Error('Unconfirmed save');
    compare(c,await c.crypt.decryptWithPassphrase(confirmed.envelopeJSON,d.secret));live(c,id);
    c.envelopeJSON=confirmed.envelopeJSON;c.recoveryKey=sealed.recoveryKey;post('stage9-recovery',{recoveryKey:sealed.recoveryKey});
   }else{
    phase='解除';compare(c,await c.crypt.decryptWithPassphrase(slot.envelopeJSON,d.secret));live(c,id);
    if(slot.state==='pending'){
     const rememberedKey=c.envelopeJSON===slot.envelopeJSON?c.recoveryKey:null;
     c.envelopeJSON=slot.envelopeJSON;c.recoveryKey=rememberedKey;
     post('stage9-recovery',rememberedKey?{recoveryKey:rememberedKey}:{});
    }
    else{c.unlocked=true;phase='マップ読込';await enterMap(c,id)}
   }
  }else{
   phase='復旧キー確認';if(!c.envelopeJSON||c.unlocked)throw Error('No pending setup');
   await c.vault.confirmRecovery(c.envelopeJSON,d.secret);live(c,id);
   const slot=await c.vault.read();live(c,id);if(slot.state!=='active'||slot.envelopeJSON!==c.envelopeJSON)throw Error('Confirmation not committed');
   compare(c,await c.crypt.decryptWithRecoveryKey(slot.envelopeJSON,d.secret));live(c,id);
   c.unlocked=true;phase='マップ読込';await enterMap(c,id);
  }
 }catch{
  if(id!==generation)return;
  if(phase==='マップ読込'){reset();notice('マップを開けませんでした。再度解除してください。',true);return}
  const message=phase==='解除'?'解除できません。パスフレーズの誤り・破損などを確認してください。マップへは進みません。':phase==='復旧キー確認'?'復旧キーの確認・確定ができません。控えたキーを確認してください。':phase==='初回保存'?'初回保存を確認できません。成功とは扱いません。再選択して保存状態を確認してください。':'第9段階データを読めません。対象・形式・DB利用状態を確認してください。';
  post('stage9-error',{message});
 }finally{if(id===generation)busy=false}
});
function reset(){
 ++generation;busy=false;selection=null;nonce='';boundary.invalidate();window.flowerDemo.close();
 map.onload=null;map.removeAttribute('src');map.removeAttribute('srcdoc');view.hidden=true;view.classList.remove('visible','reveal');petals.replaceChildren();entry.style.removeProperty('visibility');entry.inert=false;
 void load();
}
$('logout').addEventListener('click',reset);$('retry').addEventListener('click',reset);
window.addEventListener('pagehide',()=>{++generation;busy=false;selection=null;nonce='';boundary.invalidate();window.flowerDemo.close();map.removeAttribute('srcdoc');entry.removeAttribute('srcdoc');view.hidden=true});
window.addEventListener('pageshow',e=>{if(e.persisted)reset()});
void load();
})();
