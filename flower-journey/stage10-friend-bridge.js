/* Runs in the opaque Ver.6 copy. No storage, real file picker or crypto authority. */
(()=>{
'use strict';
const send=d=>parent.postMessage(d,'*');let baseline=null,formDirty=false,saving=false,pending=null,replaying=false;
const snapshot=()=>window.stage10Read?.()||[];
function changed(){const text=JSON.stringify(snapshot());if(baseline===null)baseline=text;send({type:'stage10-dirty',dirty:formDirty||text!==baseline})}
let iconPanel=null,iconFocus=null;
function iconPNG(index){
 const c=document.createElement('canvas');c.width=c.height=192;const x=c.getContext('2d');if(!x)throw Error('Canvas unavailable');
 x.fillStyle=['#f4bdd0','#acd8e8','#b9dfbe','#d3c1ea','#f5c299','#f3df94'][index];x.fillRect(0,0,192,192);
 x.fillStyle='#ffe1bb';x.beginPath();x.arc(96,103,61,0,Math.PI*2);x.fill();
 x.fillStyle=['#654739','#3b3948','#715344'][index%3];x.beginPath();x.arc(96,84,61,Math.PI,Math.PI*2);x.fill();
 x.fillStyle='#473e3d';for(const a of [73,119]){x.beginPath();x.arc(a,104,5,0,Math.PI*2);x.fill()}
 x.strokeStyle='#a96065';x.lineWidth=5;x.lineCap='round';x.beginPath();x.arc(96,121,16,0,Math.PI);x.stroke();
 return c.toDataURL('image/png');
}
function closeIcons(){iconPanel?.remove();iconPanel=null;iconFocus?.focus();iconFocus=null}
function openIcons(){
 if(iconPanel||saving)return;iconFocus=document.activeElement;
 const panel=document.createElement('div');panel.id='testIconPicker';panel.className='overlay show';panel.style.zIndex='100';
 const dialog=document.createElement('div');dialog.className='dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','テスト用顔アイコン');
 const title=document.createElement('h2');title.textContent='テスト用アイコンを選んでね';const note=document.createElement('p');note.textContent='架空データ専用。写真ライブラリは開きません。';
 const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px';
 try{for(let i=0;i<6;i++){
  const url=iconPNG(i),button=document.createElement('button'),img=document.createElement('img');button.type='button';button.dataset.testIcon=String(i);button.setAttribute('aria-label','テストアイコン '+(i+1));button.style.cssText='padding:4px;border:2px solid #dfd8c9;border-radius:50%;background:#fff;min-height:64px;cursor:pointer';img.src=url;img.alt='';img.style.cssText='width:100%;display:block;border-radius:50%';button.append(img);
  button.onclick=()=>{window.stage10ChooseIcon(url);formDirty=true;changed();closeIcons()};grid.append(button);
 }}catch{document.getElementById('error').textContent='テストアイコンを作れませんでした。対応ブラウザで再試行してください。';return}
 const cancel=document.createElement('button');cancel.id='testIconCancel';cancel.type='button';cancel.className='cancel';cancel.textContent='選ばずにもどる';cancel.style.cssText='margin-top:16px;min-height:44px';cancel.onclick=closeIcons;
 dialog.append(title,note,grid,cancel);panel.append(dialog);panel.onclick=e=>{if(e.target===panel)closeIcons()};document.body.append(panel);iconPanel=panel;grid.querySelector('button').focus();
}
// Block all native file input routes, including synthetic change and drop, before the original reader.
document.addEventListener('change',e=>{if(e.target.id==='photo'){e.preventDefault();e.stopImmediatePropagation();e.target.value='';openIcons()}},true);
document.addEventListener('dragover',e=>e.preventDefault(),true);document.addEventListener('drop',e=>{e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&iconPanel){e.preventDefault();e.stopImmediatePropagation();closeIcons()}},true);

window.confirm=()=>replaying;
window.addEventListener('stage10-change',()=>{formDirty=false;changed()});
document.addEventListener('input',e=>{if(e.target.closest('#form')){formDirty=true;changed()}},true);
document.addEventListener('click',e=>{
 const b=e.target.closest?.('button');
 if(saving){e.preventDefault();e.stopImmediatePropagation();return}
 if(e.target.id==='photo'||e.target.closest?.('label[for="photo"]')){e.preventDefault();e.stopImmediatePropagation();openIcons();return}
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
