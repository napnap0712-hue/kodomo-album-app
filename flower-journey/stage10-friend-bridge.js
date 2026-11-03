/* Runs in the opaque Ver.6 copy. No storage, real file picker or crypto authority. */
(()=>{
'use strict';
const send=d=>parent.postMessage(d,'*');let baseline=null,formDirty=false,saving=false,pending=null,replaying=false;
const snapshot=()=>window.stage10Read?.()||[];
function changed(){const text=JSON.stringify(snapshot());if(baseline===null)baseline=text;send({type:'stage10-dirty',dirty:formDirty||text!==baseline})}
window.confirm=()=>replaying;
window.addEventListener('stage10-change',()=>{formDirty=false;changed()});
document.addEventListener('input',e=>{if(e.target.closest('#form')){formDirty=true;changed()}},true);
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button');
 if(saving){e.preventDefault();e.stopImmediatePropagation();return}
 if(e.target.id==='photo'){
  e.preventDefault();e.stopImmediatePropagation();
  const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#eab8cf';ctx.fillRect(0,0,32,32);
  const text=c.toDataURL('image/png').split(',')[1],bytes=Uint8Array.from(atob(text),v=>v.charCodeAt(0)),data=new DataTransfer();data.items.add(new File([bytes],'fictional-face.png',{type:'image/png'}));e.target.files=data.files;e.target.dispatchEvent(new Event('change',{bubbles:true}));formDirty=true;changed();return;
 }
 if(b?.id==='back'){e.preventDefault();e.stopImmediatePropagation();send({type:'stage10-back'});return}
 const discard=['cancel','close'].includes(b?.id)||e.target.id==='overlay';
 if(!replaying&&(b?.id==='delete'||discard&&formDirty)){
  e.preventDefault();e.stopImmediatePropagation();if(pending)return;pending={request:crypto.randomUUID(),element:b||e.target};send({type:b?.id==='delete'?'stage10-delete':'stage10-discard-form',request:pending.request});return;
 }
 if(discard){formDirty=false;changed()}
},true);
window.addEventListener('message',e=>{
 if(!window.flowerDemoChannel.matches(e))return;const d=e.data;
 if(d.type==='stage10-confirm-result'&&pending&&d.request===pending.request){const target=pending.element;pending=null;if(!d.approved)return;replaying=true;formDirty=false;try{target.click()}finally{replaying=false;changed()}return}
 if(d.type==='stage10-save-request'){
  if(saving)return;if(document.getElementById('overlay').classList.contains('show')){document.getElementById('error').textContent='先に登録・変更を反映してから保存してください。';return}
  saving=true;document.querySelectorAll('button,input').forEach(b=>b.disabled=true);send({type:'stage10-save',rows:snapshot()});return;
 }
 if(d.type==='stage10-save-result'){
  saving=false;document.querySelectorAll('button,input').forEach(b=>b.disabled=false);
  if(d.ok){window.stage10Replace(d.rows);baseline=JSON.stringify(snapshot());formDirty=false;changed()}
  window.stage10Notify(d.ok?'保存できたよ！':d.message,!d.ok);
 }
});
})();
