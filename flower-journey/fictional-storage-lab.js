/* Standalone fictional lab UI. Existing crypto and dedicated DB formats are unchanged. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),boundary=FlowerClassDataBoundary.createBoundary();
let current=null,busy=false;
let supported=false;
try{supported=isSecureContext&&!!globalThis.crypto?.subtle&&typeof crypto.randomUUID==='function'&&!!globalThis.indexedDB}catch{}
function controls(){
 for(const id of ['save','restore','recover','remove'])$(id).disabled=!supported||busy||(id==='remove'&&!$('confirmDelete').checked);
 for(const id of ['classId','year','pass','recovery','overwrite','confirmDelete','reveal'])$(id).disabled=!supported||busy;
 $('issued').disabled=busy;
}
function message(text){$('status').textContent=text}
function reject(text){throw Object.assign(Error(),{uiMessage:text})}
function context(){
 const year=$('year').value,classId=$('classId').value;
 if(!/^\d{4}$/.test(year)||!FlowerClassDataBoundary.validYear(Number(year)))reject('年度を1900〜9999の整数で入力してください。保存時と同じ年度を選んでください。');
 const scope={classId,schoolYear:Number(year),baseYear:Number(year)},key=JSON.stringify(scope);
 if(current?.key!==key){boundary.invalidate();const session=boundary.createSession({...scope,mode:'demo'});current={key,scope,crypt:FlowerFictionalRosterCrypto.createDemoCrypto(boundary,session,scope),store:FlowerFictionalVaultStore.createStore(boundary,session,scope)}}
 return current;
}
function clearScope(){
 boundary.invalidate();current=null;$('issued').value='';$('reveal').checked=false;$('issued').type='password';
 $('overwrite').checked=false;$('confirmDelete').checked=false;$('summary').textContent='保存時と同じクラス・年度を選んでください。';controls();
}
function password(){
 const pass=$('pass').value;
 if(!pass)reject('パスフレーズが未入力です。保存時と同じものを入力してください。');
 if(Array.from(pass).length<16||pass.length>1024||!pass.trim())reject('テスト用パスフレーズは16文字以上・1024文字以内で入力してください。空白だけは使えません。');
 return pass; // Do not trim or normalize secrets.
}
function compare(c,records){if(JSON.stringify(records)!==JSON.stringify(FlowerFictionalRoster.make(c.scope)))reject('解除できましたが、架空名簿との照合が一致しません。保存・上書きは行いません。')}
async function read(c){
 try{return await c.store.readEncrypted()}catch{
  reject('保存データを読み取れません。専用DBの利用制限、形式・クラス・年度の不一致、破損などが考えられます。原因は特定できません。他のテストタブを閉じて再確認してください。データは削除しません。');
 }
}
async function unlock(c,text,secret,recovery=false){
 try{return recovery?await c.crypt.decryptWithRecoveryKey(text,secret):await c.crypt.decryptWithPassphrase(text,secret)}catch{
  reject(recovery?'復旧キーで解除できません。キーの誤り、または暗号文の改ざん・破損を区別できません。データは変更していません。':'解除できません。パスフレーズの誤り、または暗号文の改ざん・破損を区別できません。保存時の入力を確認してください。データは変更していません。');
 }
}
function absent(){reject('このクラス・年度には保存データがありません。保存時のクラス・年度、同じURL・Safariの通常／プライベートタブかを確認してください。自動削除はしていません。')}
async function run(action){
 if(busy||!supported)return;busy=true;controls();message('処理中です。この画面を開いたままお待ちください。');
 let phase='入力確認';
 $('summary').textContent='今回の操作を確認中です。';
 try{
  const c=context();
  if(action==='remove'){
   if(!$('confirmDelete').checked)reject('削除する場合だけ確認欄にチェックしてください。');
   phase='削除';await c.store.remove(undefined,FlowerFictionalVaultStore.CONFIRM_DELETE);clearScope();message('選択クラス・年度のテストデータだけを削除しました。');return;
  }
  const secret=action==='recover'?$('recovery').value:password();
  if(action==='recover'&&!/^FJREC1-[A-Za-z0-9_-]{43}$/.test(secret))reject('復旧キーをFJREC1-から省略せず入力してください。通常の復元には復旧キーは不要です。');
  phase='読取';const existing=await read(c);
  if(action==='restore'||action==='recover'){
   if(existing===null)absent();phase='解除';const records=await unlock(c,existing,secret,action==='recover');compare(c,records);
   $('summary').textContent=`${c.scope.classId} ／ ${c.scope.schoolYear}年度 ／ 架空3人の全項目一致`;
   message(action==='restore'?'復元できたよ！ 架空名簿の全項目が一致しました。':'復旧キーで復元できたよ！ データは変更していません。パスフレーズの再設定はこの画面では行いません。');return;
  }
  // Always authenticate the current stored copy with this input before allowing replacement.
  if(existing!==null){
   phase='既存データの解除';compare(c,await unlock(c,existing,secret));
   if(!$('overwrite').checked)reject('保存済みデータを正しく解除できました。上書きはしていません。「続きから開く」を使うか、上書き確認にチェックしてください。');
  }
  phase='暗号化';const records=FlowerFictionalRoster.make(c.scope);
  const input=JSON.stringify({format:FlowerFictionalRosterReadonlyAdapter.FORMAT,source:'fictional-json',...c.scope,storageKey:FlowerFriendRosterViewAdapter.legacyRosterKey(c.scope),rosterJSON:JSON.stringify(records)});
  const sealed=await c.crypt.encrypt(input,secret);
  // Keep the newly issued recovery key in its dedicated field even if saving fails.
  $('issued').value=sealed.recoveryKey;
  phase='保存';await c.store.save(sealed.envelopeJSON,secret,existing);
  phase='保存後の照合';const confirmed=await read(c);
  if(confirmed!==sealed.envelopeJSON)reject('保存後の内容を確認できません。別画面による更新の可能性もあります。保存成功とは表示しません。「続きから開く」で確認してください。');
  compare(c,await unlock(c,confirmed,secret));
  $('summary').textContent=`${c.scope.classId} ／ ${c.scope.schoolYear}年度 ／ 保存確定・復号照合済み`;
  $('overwrite').checked=false;
  message('保存できたよ！ 保存確定後の復号・全項目照合も成功しました。下の復旧キーを安全に控えてください。');
 }catch(error){
  $('summary').textContent='今回の操作は完了を確認できません。上の案内を確認してください。';
  if(error.uiMessage)message(error.uiMessage);
  else if(phase==='保存')message('保存を確定できませんでした。容量・保存制限・別タブの更新などはこのエラーでは区別できません。成功とは扱いません。直前のデータを「続きから開く」で確認してください。');
  else if(phase==='保存後の照合')message('保存後の照合を完了できません。保存済みの可能性があります。「続きから開く」で確認してください。');
  else if(phase==='暗号化')message('暗号化できませんでした。入力文字とWeb Cryptoの利用可否を確認してください。保存は行っていません。');
  else if(phase==='削除')message('削除を確認できませんでした。専用DBの利用状態を確認してください。');
  else message('処理を開始できませんでした。HTTPS・ブラウザの対応状況と入力を確認してください。');
 }finally{$('pass').value='';$('recovery').value='';busy=false;controls();$('status').scrollIntoView({block:'nearest'})}
}
for(const id of ['save','restore','recover','remove'])$(id).addEventListener('click',()=>run(id));
for(const id of ['classId','year'])$(id).addEventListener('change',clearScope);
$('confirmDelete').addEventListener('change',controls);$('reveal').addEventListener('change',()=>{$('issued').type=$('reveal').checked?'text':'password'});
controls();message(supported?'クラス・年度とパスフレーズを入力して、保存または続きから開くを選んでください。':'利用できません。HTTPSまたはlocalhostで、Web Crypto・IndexedDB対応のブラウザを使用してください。');
})();
