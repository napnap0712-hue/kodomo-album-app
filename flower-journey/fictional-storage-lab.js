(()=>{
'use strict';
const $=id=>document.getElementById(id),boundary=FlowerClassDataBoundary.createBoundary();
let current=null,candidate=null,expected=null,busy=false;
const supported=isSecureContext&&!!globalThis.crypto?.subtle&&!!globalThis.indexedDB;
function controls(){for(const id of ['prepare','save','restore','remove'])$(id).disabled=!supported||busy||(id==='save'&&!candidate)||(id==='remove'&&!$('confirmDelete').checked);for(const id of ['classId','year','pass','confirmDelete','reveal'])$(id).disabled=!supported||busy}
function message(text){$('status').textContent=text}
function context(){
 const year=$('year').value,classId=$('classId').value;
 if(!/^\d{4}$/.test(year)||!FlowerClassDataBoundary.validYear(Number(year)))throw Error('Invalid year');
 const scope={classId,schoolYear:Number(year),baseYear:Number(year)},key=JSON.stringify(scope);
 if(current?.key!==key){boundary.invalidate();const session=boundary.createSession({...scope,mode:'demo'});current={key,scope,crypt:FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),store:FlowerFictionalVaultStore.createStore(boundary,session,scope)};candidate=null;expected=null}
 return current;
}
function clearScope(){boundary.invalidate();current=null;candidate=null;expected=null;$('issued').value='';$('reveal').checked=false;$('issued').type='password';$('confirmDelete').checked=false;$('summary').textContent='メモリ内に候補はありません。';controls()}
async function run(action){
 if(busy||!supported)return;busy=true;controls();message('処理中です。');
 try{
  const c=context(),pass=$('pass').value;
  if(action==='prepare'){
   const records=FlowerFictionalRoster.make(c.scope),input=JSON.stringify({format:FlowerFictionalRosterReadonlyAdapter.FORMAT,source:'fictional-json',...c.scope,storageKey:FlowerFriendRosterViewAdapter.legacyRosterKey(c.scope),rosterJSON:JSON.stringify(records)});
   const sealed=await c.crypt.encrypt(input,pass);candidate=sealed.envelopeJSON;$('issued').value=sealed.recoveryKey;$('summary').textContent='架空3人の暗号化候補あり（未保存）。';message('暗号化成功。保存はまだ行っていません。');
  }else if(action==='save'){
   if(!candidate)throw Error('No candidate');await c.store.save(candidate,pass,expected);expected=candidate;$('summary').textContent='保存トランザクションの確定・暗号文照合済み。';message('保存成功。専用テストDBへの確定を確認しました。');
  }else if(action==='restore'){
   const encrypted=await c.store.readEncrypted();if(encrypted===null){message('選択クラス・年度のテストデータはありません。');return}
   const records=await c.crypt.decryptWithPassphrase(encrypted,pass);
   if(JSON.stringify(records)!==JSON.stringify(FlowerFictionalRoster.make(c.scope)))throw Error('Fixture mismatch');
   expected=encrypted;$('summary').textContent=`${c.scope.classId} ／ ${c.scope.schoolYear}年度 ／ 架空3人の全項目一致`;
   message('復元成功。園児ID・正式名・顔写真・未知項目が一致しました。');
  }else{
   if(!$('confirmDelete').checked)throw Error('Confirmation required');
   await c.store.remove(undefined,FlowerFictionalVaultStore.CONFIRM_DELETE);clearScope();message('選択クラス・年度のテストデータだけを削除しました。');
  }
 }catch{message('操作を拒否または中断しました。年度・認証情報・保存状態を確認してください。保存成功とは扱いません。')}
 finally{$('pass').value='';busy=false;controls()}
}
for(const id of ['prepare','save','restore','remove'])$(id).addEventListener('click',()=>run(id));
for(const id of ['classId','year'])$(id).addEventListener('change',clearScope);
$('confirmDelete').addEventListener('change',controls);$('reveal').addEventListener('change',()=>{$('issued').type=$('reveal').checked?'text':'password'});
controls();message(supported?'準備できました。クラス・年度を入力してください。':'利用できません。対応ブラウザのHTTPSまたはlocalhostで開いてください。');
})();
