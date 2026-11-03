/* Injected only into the opaque, sandboxed copy of the approved entry artwork. */
(()=>{
'use strict';
const nonce=window.stage9Nonce,$=id=>document.getElementById(id),buttons=[...document.querySelectorAll('.character')];
let selected=-1,serial=0,busy=false,mode='loading';
const send=(type,extra={})=>parent.postMessage({type,nonce,classIndex:selected,serial,...extra},'*');
function lock(value){busy=value;for(const b of [...buttons,$('cancel'),document.querySelector('.go'),$('showPass'),$('ack'),$('recoveryCancel')])b.disabled=value}
function close(){if(busy)return;$('overlay').hidden=true;$('recoveryPanel').hidden=true;$('password').value='';$('recoverySecret').value='';$('issuedKey').value='';send('stage9-cancel');selected=-1;serial++}
buttons.forEach((b,i)=>b.addEventListener('click',()=>{
 if(busy)return;selected=i;serial++;mode='loading';$('modalTitle').textContent=b.dataset.class+'ぐみ';
 $('passwordArt').src='password-assets/'+String(i+1).padStart(2,'0')+'.png';
 $('passwordArt').alt='パソコンでパスワードを入力している'+b.dataset.class;
 $('password').value='';$('password').type='password';$('showPass').textContent='👁';$('message').textContent='2026年度の架空データを確認中…';$('overlay').hidden=false;
 lock(true);send('stage9-select');
}));
$('cancel').addEventListener('click',close);$('recoveryCancel').addEventListener('click',close);
$('showPass').addEventListener('click',()=>{const hidden=$('password').type==='password';$('password').type=hidden?'text':'password';$('showPass').textContent=hidden?'🙈':'👁'});
$('form').addEventListener('submit',e=>{
 e.preventDefault();if(busy||mode==='loading')return;
 if(mode==='retry'){mode='loading';lock(true);$('message').textContent='保存状態を再確認しています…';send('stage9-select');return}
 const secret=$('password').value;
 if(Array.from(secret).length<16||secret.length>1024||!secret.trim()){$('message').textContent='テスト用パスフレーズを16文字以上で入力してください。';return}
 lock(true);$('message').textContent='暗号化データを確認しています…';$('password').value='';send('stage9-submit',{secret});
});
$('ack').addEventListener('click',()=>{
 if(busy||!$('recorded').checked)return;
 const secret=$('recoveryPanel').dataset.resume==='true'?$('recoverySecret').value:$('issuedKey').value;
 $('recoverySecret').value='';lock(true);$('recoveryMessage').textContent='復旧キーと保存状態を確認中…';send('stage9-confirm',{secret});
});
$('revealKey').addEventListener('change',()=>{$('issuedKey').type=$('revealKey').checked?'text':'password'});
window.addEventListener('message',e=>{
 const d=e.data;if(e.source!==parent||d?.nonce!==nonce||d.classIndex!==selected||d.serial!==serial)return;
 if(d.type==='stage9-mode'){
  $('password').required=true;
  mode=d.mode;$('message').textContent=d.mode==='setup'?'初回設定：2026年度・架空名簿専用。16文字以上を設定してください。':d.mode==='pending'?'復旧キー確認が未完了です。設定時のパスフレーズを入力してください。':'2026年度：設定したテスト用パスフレーズを入力してください。';
  document.querySelector('.go').textContent=mode==='setup'?'設定して進む 🌸':'解除して進む 🌸';lock(false);$('password').focus();
 }else if(d.type==='stage9-recovery'){
  const resume=!d.recoveryKey;$('overlay').hidden=true;$('recoveryPanel').hidden=false;$('recoveryPanel').dataset.resume=String(resume);
  $('issuedKey').value=d.recoveryKey||'';$('issuedArea').hidden=resume;$('resumeArea').hidden=!resume;$('recorded').checked=false;$('recoveryMessage').textContent=resume?'確認待ちデータを保持しています。以前控えた復旧キーで確認してください。':'暗号化データの保存を確認しました。復旧キーを安全な場所へ控えてください。';lock(false);
 }else if(d.type==='stage9-error'){
  $('message').textContent=d.message;$('recoveryMessage').textContent=d.message;if(d.retrySelection){mode='retry';$('password').required=false;document.querySelector('.go').textContent='保存状態を再確認'}lock(false);
 }else if(d.type==='stage9-cleared'){
  $('password').value='';$('issuedKey').value='';$('recoverySecret').value='';$('recorded').checked=false;lock(true);
 }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
const ready=()=>{lock(false);parent.postMessage({type:'stage9-entry-ready',nonce},'*')};
lock(true);
if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});
})();
