/* Parent-only coordinator: full records remain here; iframe supplies a validated edit projection. */
(function(root){
'use strict';
async function unlock(boundary,session,scope,rootJSON,secret,recovery=false){
 let crypt;try{crypt=await root.FlowerStage10Crypto.unlock(boundary,session,scope,rootJSON,secret,recovery)}catch{throw Object.assign(Error('Registration key unavailable'),{prototypeCode:'REG_KEY'})}finally{secret=null}
 let records,expected,dirty=false,saving=false,closed=false,channel=null;
 const store=root.FlowerStage10Store.createStore(boundary,session,scope,crypt),request={...session,operation:'demo:register'};
 function live(){if(closed||!boundary.authorize(session,request).allowed)throw Error('Expired registration')}
 try{try{expected=await store.read()}catch{throw Object.assign(Error('Registration read unavailable'),{prototypeCode:'REG_READ'})}if(expected===null)records=crypt.takeInitialRecords();else{crypt.takeInitialRecords();try{records=await crypt.open(expected)}catch{throw Object.assign(Error('Registration decrypt unavailable'),{prototypeCode:'REG_OPEN'})}}}catch(error){crypt.close();throw error}
 function project(rows=records){return root.FlowerFriendRosterViewAdapter.viewFor(root.FlowerFriendRosterViewAdapter.createDemoModel(boundary,session,scope,rows))}
 function merge(view){
  live();if(!Array.isArray(view)||view.length>500)throw Error('Invalid view');const seen=new Set(),old=new Map(records.map(r=>[r.id,r])),original=new Map(project().map(r=>[r.id,r]));
  return view.map(v=>{
   if(!v||Array.isArray(v)||Object.keys(v).length!==4||!['id','name','game','photo'].every(k=>Object.hasOwn(v,k))||typeof v.id!=='string'||seen.has(v.id)||typeof v.name!=='string'||!v.name.trim()||typeof v.game!=='string'||v.photo!==null&&typeof v.photo!=='string')throw Error('Invalid child');seen.add(v.id);
   const base=old.get(v.id),before=original.get(v.id);
   if(!base&&!/^fictional-[0-9a-f-]{36}$/.test(v.id))throw Error('Unissued child ID');
   const row={...(base||{}),id:v.id,name:v.name};
   if(!base||v.game!==before.game)row.displayName=v.game;
   if(!base||v.photo!==before.photo)row.facePhoto=v.photo;
   return row;
  });
 }
 const button=document.createElement('button');button.id='stage10Save';button.textContent='保存してマップへ';button.type='button';button.hidden=true;
 const bar=document.querySelector('.mapBar'),oldWrap=bar.style.flexWrap;bar.style.flexWrap='wrap';bar.insertBefore(button,document.getElementById('logout'));
 button.onclick=()=>{if(!saving)channel?.post({type:'stage10-save-request'})};
 function close(){if(closed)return;closed=true;crypt.close();records=null;expected=null;dirty=false;channel=null;button.remove();bar.style.flexWrap=oldWrap}
 function once(html,from,to){if(html.split(from).length!==2)throw Error('Ver.6 attachment changed');return html.replace(from,to)}
 function composeFriend(html){
  live();html=once(html,'let children=[],edit=-1','let children='+JSON.stringify(project()).replace(/</g,'\\u003c')+',edit=-1');
  html=once(html,'const data={name,game,photo:imageData};',"const data={...(edit<0?{id:'fictional-'+crypto.randomUUID()}:children[edit]),name,game,photo:imageData};");
  html=once(html,"const name=$('realName').value.trim(),game=$('gameName').value.trim();","const rawName=$('realName').value,rawGame=$('gameName').value;const name=edit>=0&&rawName===children[edit].name?children[edit].name:rawName.trim(),game=edit>=0&&rawGame===children[edit].game?children[edit].game:rawGame.trim();");
  html=once(html,'function render(){',"function render(){window.stage10Read=()=>children.map(c=>({...c}));window.stage10ChooseIcon=url=>{imageData=url;setPhoto()};window.stage10Replace=rows=>{children=rows;render();close()};window.stage10Notify=(text,persistent)=>{clearTimeout(toastTimer);$('toast').textContent=text;$('toast').style.display='block';if(!persistent)toastTimer=setTimeout(()=>{$('toast').style.display='none'},2200)};window.dispatchEvent(new Event('stage10-change'));");
  return html;
 }
 async function handle(d,api){
  live();channel=api;
  if(d.type==='stage10-dirty'){dirty=d.dirty===true;return}
  if(d.type==='stage10-delete'||d.type==='stage10-discard-form'){
   api.post({type:'stage10-confirm-result',request:d.request,approved:root.confirm(d.type==='stage10-delete'?'この架空のおともだちを削除しますか？（保存するまでは未確定です）':'未保存の入力を破棄しますか？')});return;
  }
  if(d.type==='stage10-back'){
   if(dirty&&!root.confirm('未保存の変更があります。保存してマップへ戻りますか？'))return;
   if(!dirty){button.hidden=true;api.returnToMap();return}api.post({type:'stage10-save-request'});return;
  }
  if(d.type!=='stage10-save'||saving)return;
  saving=true;button.disabled=true;
  try{
   const rows=merge(d.rows),candidate=await crypt.seal(rows);live();await store.save(candidate,expected);live();
   const committed=await store.read();live();if(committed!==candidate)throw Error('Save not current');const verified=await crypt.open(committed);live();
   if(JSON.stringify(verified)!==JSON.stringify(rows))throw Error('Mismatch');records=verified;expected=candidate;dirty=false;
   api.post({type:'stage10-save-result',ok:true,rows:project()});button.hidden=true;api.returnToMap();
  }catch{if(!closed)api.post({type:'stage10-save-result',ok:false,message:'保存を確認できません。変更は画面に残しています。別タブの更新・保存制限を確認してください。競合時は変更を控え、再ログインしてください。'})}
  finally{saving=false;button.disabled=false}
 }
 async function memoryRows(){
  live();const stored=await store.read();live();const latest=stored===null?records:await crypt.open(stored);live();
  return root.FlowerStage11Memory.view(boundary,session,scope,latest);
 }
 const integration=Object.freeze({composeFriend,memoryRows,cosmosRows:memoryRows,opened(api){channel=api;button.hidden=false},handle,close});
 return Object.freeze({integration,isDirty:()=>dirty,close});
}
Object.defineProperty(root,'FlowerStage10Registration',{value:Object.freeze({unlock})});
})(typeof window==='object'?window:globalThis);
