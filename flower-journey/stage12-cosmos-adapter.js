/* Read-only registered-child display for the isolated cosmos copy. No storage or crypto APIs. */
(function(root){
'use strict';
function once(text,from,to){if(text.split(from).length!==2)throw Error('コスモスの接続箇所を確認できません');return text.replace(from,to)}
function compose(html,rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('登録園児が必要です');
 const ids=new Set();for(const row of rows){
  if(!row||Object.keys(row).sort().join()!=='id,label,photo'||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.label!=='string'||!row.label.trim()||row.photo!==null&&typeof row.photo!=='string')throw Error('表示情報が不正です');
  if(row.photo&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(row.photo))throw Error('埋込テスト画像だけを使えます');ids.add(row.id);
 }
 for(const declaration of ['function renderKids(){','function renderPhotos(){'])if(html.split(declaration).length!==2)throw Error('コスモス原本の構造を確認できません');
 const names=html.match(/^const names=\[[^\n]*\];$/gm),children=html.match(/^const children=names\.map\([^\n]*$/gm),nav=html.match(/^\s*nav\.innerHTML=children\.map\([^\n]*$/gm),pocket=html.match(/^\s*\$\('current'\)\.innerHTML=[^\n]*$/gm);
 if([names,children,nav,pocket].some(matches=>matches?.length!==1))throw Error('コスモス原本の構造を確認できません');
 html=once(html,children[0],"const slotToId=Object.freeze(roster.map(row=>row.id));const children=Object.freeze(roster.map((row,i)=>Object.defineProperty({name:row.label,face:faces[i%faces.length],facePhoto:row.photo,color:colors[i%colors.length],checked:false,photos:Array.from({length:i===0?38:12},(_,k)=>({id:i+'-'+k,emoji:emojis[(k+i*3)%emojis.length],label:'しゃしん '+(k+1)}))},'rosterId',{value:slotToId[i],enumerable:true})));");
 html=once(html,nav[0],` nav.replaceChildren();children.forEach((c,i)=>{
 const b=document.createElement('button');b.type='button';b.className='kid'+(i===current?' active':'')+(moveMode&&i!==current?' target-choice':'');b.dataset.i=String(i);b.dataset.rosterId=slotToId[i];b.setAttribute('aria-label',c.name+(c.checked?' 確認済み':''));
 const avatar=document.createElement('span');avatar.className='avatar';avatar.style.setProperty('--c',c.color);
 if(c.facePhoto){const image=document.createElement('img');image.src=c.facePhoto;image.alt='';image.draggable=false;image.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;pointer-events:none';avatar.append(image)}else avatar.textContent=c.face;
 const name=document.createElement('span');name.className='name';name.textContent=c.name;b.append(avatar,name);if(c.checked){const mark=document.createElement('span');mark.className='checked';mark.textContent='✓';b.append(mark)}nav.append(b);
 });`);
 html=once(html,pocket[0]," const title=$('current');title.dataset.rosterId=slotToId[current];title.replaceChildren(document.createTextNode(c.name+'のポケット '));const number=document.createElement('span');number.className='count';number.textContent=c.photos.length+'枚';title.append(number);if(c.checked){const mark=document.createElement('span');mark.className='donebadge';mark.textContent='確認済み';title.append(mark)}");
 html=once(html,'const i=+b.dataset.i;',"const i=+b.dataset.i;if(!Number.isInteger(i)||i<0||i>=children.length||b.dataset.rosterId!==slotToId[i])return;");
 const drag=`
// Pointer drag stays inside this opaque sandbox and uses the original moveTo routine.
let dragState=null,suppressClick=false;
function cancelDrag(){const old=dragState;dragState=null;if(!old||!old.active)return;if(current===old.from&&slotToId[current]===old.fromId){selected=new Set(old.before);moveMode=old.beforeMode}else{selected.clear();moveMode=false}render()}
function dragTarget(x,y){const b=document.elementFromPoint(x,y)?.closest('#kids .kid');if(!b||!dragState)return null;const i=Number(b.dataset.i);return Number.isInteger(i)&&i>=0&&i<children.length&&i!==current&&b.dataset.rosterId===slotToId[i]?i:null}
document.addEventListener('pointerdown',e=>{
 const photo=e.target.closest?.('#photos .photo');if(!photo||e.pointerType!=='mouse'||e.button!==0||!e.isPrimary)return;
 if(!children[current].photos.some(p=>p.id===photo.dataset.id))return;
 dragState={pointer:e.pointerId,x:e.clientX,y:e.clientY,photo:photo.dataset.id,from:current,fromId:slotToId[current],before:[...selected],beforeMode:moveMode,active:false};
},true);
document.addEventListener('pointermove',e=>{
 const d=dragState;if(!d||d.pointer!==e.pointerId)return;if(!(e.buttons&1)){cancelDrag();return}
 if(!d.active&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
 if(current!==d.from||slotToId[current]!==d.fromId){cancelDrag();return}
 if(!d.active){d.active=true;if(!selected.has(d.photo))selected=new Set([d.photo]);d.ids=[...selected];moveMode=true;$('kids').querySelectorAll('.kid').forEach((b,i)=>b.classList.toggle('target-choice',i!==current));updateActions()}
 e.preventDefault();
},true);
document.addEventListener('pointerup',e=>{
 const d=dragState;if(!d||d.pointer!==e.pointerId)return;if(!d.active){dragState=null;return}
 e.preventDefault();e.stopImmediatePropagation();suppressClick=true;setTimeout(()=>{suppressClick=false},0);
 const to=dragTarget(e.clientX,e.clientY);
 if(to===null||current!==d.from||slotToId[current]!==d.fromId||!d.ids.every(id=>children[current].photos.some(p=>p.id===id))){cancelDrag();return}
 selected=new Set(d.ids);moveMode=true;dragState=null;moveTo(to);
},true);
document.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('dragstart',e=>{if(e.target.closest?.('#photos .photo'))e.preventDefault()},true);
window.addEventListener('blur',cancelDrag);document.addEventListener('pointercancel',cancelDrag,true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dragState){e.preventDefault();cancelDrag()}},true);
`;
 html=once(html,'\nrender();\n})();',drag+'\nrender();\n})();');
 // Insert untrusted text last, then use DOM textContent rather than HTML interpolation.
 return once(html,names[0],'const roster=Object.freeze('+JSON.stringify(rows).replace(/</g,'\\u003c')+'.map(row=>Object.freeze(row)));const names=roster.map(row=>row.label);');
}
Object.defineProperty(root,'FlowerStage12Cosmos',{value:Object.freeze({compose})});
})(typeof window==='object'?window:globalThis);
