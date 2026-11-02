/* Standalone fictional-only lab. No storage, transport, imports or app navigation. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),boundary=FlowerClassDataBoundary.createBoundary();
let state=null,busy=false,history=[];
const supported=globalThis.isSecureContext&&!!globalThis.crypto?.subtle&&typeof globalThis.crypto?.randomUUID==='function';
const buttons=['encrypt','decrypt','change','recover','reset','discard'];
function controls(){
 for(const id of buttons)$(id).disabled=!supported||busy||(id==='encrypt'?!!state:id==='discard'?false:!state);
 for(const id of ['current','next','recovery','reveal'])$(id).disabled=!supported||busy;
 for(const id of ['classId','year'])$(id).disabled=!supported||busy||!!state;
 $('issued').disabled=busy;
}
function result(message){
 $('status').textContent=message;history.unshift(message);history=history.slice(0,8);
 $('results').replaceChildren(...history.map(text=>{const li=document.createElement('li');li.textContent=text;return li}));
}
function sameRecords(records){if(JSON.stringify(records)!==JSON.stringify(state.records))throw Error('Mismatch')}
function sameBody(before,after){
 const a=JSON.parse(before),b=JSON.parse(after);
 if(JSON.stringify(a.data)!==JSON.stringify(b.data)||JSON.stringify(a.wrappedKeys.recovery)!==JSON.stringify(b.wrappedKeys.recovery))throw Error('Mismatch');
}
async function run(action){
 if(busy||!supported)return;
 busy=true;controls();$('status').textContent='処理中です。少しお待ちください。';
 const before=state?.envelopeJSON;
 try{
  if(action==='encrypt'){
   if(state)throw Error('Already initialized');
   const text=$('year').value;
   if(!/^\d{4}$/.test(text)||!FlowerClassDataBoundary.validYear(Number(text))){result('年度を1900〜9999の整数で入力してください。');return}
   const scope=Object.freeze({classId:$('classId').value,schoolYear:Number(text),baseYear:Number(text)});
   const session=boundary.createSession({...scope,mode:'demo'}),records=FlowerFictionalRoster.make(scope);
   const crypt=FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),rekey=FlowerFictionalRosterRekey.createDemoRekey(boundary,session,scope);
   const input=JSON.stringify({format:FlowerFictionalRosterReadonlyAdapter.FORMAT,source:FlowerFictionalRosterReadonlyAdapter.SOURCE,...scope,storageKey:FlowerFriendRosterViewAdapter.legacyRosterKey(scope),rosterJSON:JSON.stringify(records)});
   const sealed=await crypt.encrypt(input,$('current').value);
   const decoded=await crypt.decryptWithPassphrase(sealed.envelopeJSON,$('current').value);
   if(JSON.stringify(decoded)!==JSON.stringify(records))throw Error('Mismatch');
   state={scope,records,crypt,rekey,envelopeJSON:sealed.envelopeJSON};
   $('issued').value=sealed.recoveryKey;
   $('scope').textContent=`${scope.classId} ／ ${scope.schoolYear}年度 ／ 架空3人 ／ メモリ内のみ`;
   result('暗号化成功。園児ID・正式名・顔写真・未知項目が一致しました。');
  }else{
   if(!state)throw Error('Not initialized');
   if(action==='decrypt'){
    sameRecords(await state.crypt.decryptWithPassphrase(before,$('current').value));result('解除成功。架空名簿の全項目が一致しました。');
   }else if(action==='recover'){
    sameRecords(await state.crypt.decryptWithRecoveryKey(before,$('recovery').value));result('復旧キーで解除成功。全項目が一致しました。');
   }else{
    const next=$('next').value;
    const candidate=action==='change'?await state.rekey.changePassphrase(before,$('current').value,next):await state.rekey.resetWithRecoveryKey(before,$('recovery').value,next);
    sameBody(before,candidate.envelopeJSON);
    sameRecords(await state.crypt.decryptWithPassphrase(candidate.envelopeJSON,next));
    sameRecords(await state.crypt.decryptWithRecoveryKey(candidate.envelopeJSON,$('issued').value));
    // Publish only a fully verified candidate. Until this line, failures retain the original.
    state.envelopeJSON=candidate.envelopeJSON;
    result(action==='change'?'変更成功。本体IV・暗号文・復旧ラップは同一。復旧も有効です。':'再設定成功。本体IV・暗号文・復旧ラップと全項目を保持しました。');
   }
  }
 }catch{
  if(!state)boundary.invalidate();
  result(state&&state.envelopeJSON===before?'操作を拒否しました。入力を確認してください。元の暗号化データは保持しています。':'暗号化できませんでした。年度・16文字以上のテスト用入力を確認してください。');
 }finally{
  for(const id of ['current','next','recovery'])$(id).value='';
  busy=false;controls();
 }
}
for(const id of ['encrypt','decrypt','change','recover','reset'])$(id).addEventListener('click',()=>run(id));
$('reveal').addEventListener('change',()=>{$('issued').type=$('reveal').checked?'text':'password'});
$('discard').addEventListener('click',()=>{
 if(busy)return;boundary.invalidate();state=null;history=[];
 for(const id of ['current','next','recovery','issued','year'])$(id).value='';
 $('reveal').checked=false;$('issued').type='password';$('scope').textContent='暗号化データはありません。';
 result('テストデータとセッションを破棄しました。');controls();
});
controls();$('status').textContent=supported?'準備できました。クラス・年度から始めてください。':'利用できません。Web Crypto対応のHTTPSまたはlocalhostで開いてください。';
})();
