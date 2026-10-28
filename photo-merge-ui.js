/* EI: Photo merge game UI. Existing AI groups / photo File objects remain untouched. */
(function(){
'use strict';
window.omoideMergeRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 if(window.omoideMergeGameRender){window.omoideMergeGameRender(data,host,api);return;}
 const oldScroll=host.querySelector('.mergeSlots')?.scrollLeft||0;
 // Cache photo membership only for this render. It is invalidated after merges.
 const photoIndexesCache=new Map();
 function photos(folder){
  if(!folder)return [];
  if(!photoIndexesCache.has(folder.key))photoIndexesCache.set(folder.key,api.indexes(data,folder));
  return photoIndexesCache.get(folder.key);
 }
 let folders;
 try{folders=api.ensure(data).filter(f=>photos(f).length)}
 catch(e){host.textContent='⚠️ '+String(e?.message||e);return}
 data.photoMatchActive=true;
 const keys=new Set(folders.map(f=>f.key));
 const roster=Array.isArray(api.children)?api.children.filter(k=>k&&k.id&&k.name):[];
 const namesById=new Map(roster.map(k=>[String(k.id),String(k.name)]));
 const requested=Math.max(1,Math.min(60,Number(api.boxCount)||12));
 const existing=Array.isArray(data.photoMergeSlots)?data.photoMergeSlots:[];
 const savedChildIds=Array.isArray(data.photoMergeChildIds)?data.photoMergeChildIds:[];
 const slotTotal=Math.max(requested,existing.length,savedChildIds.length);
 const slots=Array.from({length:slotTotal},(_,i)=>keys.has(existing[i])?existing[i]:null);
 // Pin each box to the child's stable ID, not the roster display order.
 // An older EJ checkpoint has no IDs, so its existing positions inherit the current roster once.
 const slotChildIds=Array.from({length:slotTotal},(_,i)=>
  typeof savedChildIds[i]==='string'?savedChildIds[i]:String(roster[i]?.id||''));
 const assignedChildIds=new Set(slotChildIds.filter(Boolean));
 for(const kid of roster){
  const id=String(kid.id);
  if(assignedChildIds.has(id))continue;
  const empty=slotChildIds.findIndex((childId,i)=>!childId&&!slots[i]);
  if(empty>=0)slotChildIds[empty]=id;
  else{slots.push(null);slotChildIds.push(id)}
  assignedChildIds.add(id);
 }
 data.photoMergeSlots=slots;
 data.photoMergeChildIds=slotChildIds;
 const indexed=new Map(folders.map(f=>[f.key,f]));
 const occupied=new Set(slots.filter(Boolean));
 const inbox=folders.filter(f=>!occupied.has(f.key));
 const selected=new Set((data.photoMergeSelected||[]).filter(k=>inbox.some(f=>f.key===k)));
 const reviewed=data.photoFolderReviewed;
 // A restored EH comparison result must not bypass the new merge-board review.
 if(inbox.length||folders.some(f=>!reviewed.has(f.key)))data.photoMatchFinalReviewed=false;
 const btn=(label,cls,action)=>{
  const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;
  b.addEventListener('click',action);return b;
 };
 const el=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;
 };
 function writeNotice(message){data.photoMatchNotice=message}
 function redraw(){
  data.photoMergeSelected=[...selected];window.omoideMergeRender(data,host,api);
 }
 function errorNotice(e){writeNotice('⚠️ '+String(e?.message||e));redraw()}
 function image(index,alt){
  const img=document.createElement('img');
  img.src=api.url(data.sourceFiles[index]);img.loading='lazy';img.decoding='async';img.alt=alt||'写真';
  img.draggable=false;return img;
 }
 function boxLabel(slot){
  const id=slotChildIds[slot];
  return id?(namesById.get(id)||'⚠️ 名簿にいない園児'):'なかま '+(slot+1);
 }
 function adopt(slot,names){
  if(!names.length){writeNotice('下のAIカードを選んでから、なかまボックスをタップしてね。');redraw();return}
  const initial=api.snapshot(data),oldUndo=data.photoFolderUndo.slice();
  try{
   let key=slots[slot],merged=0;
   const targets=[...new Set(names)].filter(k=>indexed.has(k)&&k!==key&&!slots.some((s,i)=>i!==slot&&s===k));
   if(!targets.length)return;
   if(!key){key=targets.shift();data.photoMergeSlots[slot]=key}
   for(const from of targets){api.merge(data,key,from);merged++}
   photoIndexesCache.clear();
   data.photoFolderUndo=oldUndo.slice();
   data.photoFolderUndo.push(initial);
   if(data.photoFolderUndo.length>10)data.photoFolderUndo.shift();
   reviewed.delete(key);data.photoFolderMistakeReviewed?.delete(key);
   data.photoMergeFocusBoxKey=key;
   data.photoMatchFinalReviewed=false;
   selected.clear();data.photoMergeInspectorKey=null;
   writeNotice('💕 '+boxLabel(slot)+'にまとめたよ！ '+photos(api.ensure(data).find(f=>f.key===key)).length+'枚。');
   redraw();
  }catch(e){api.restore(data,initial);data.photoFolderUndo=oldUndo;errorNotice(e)}
 }
 function undo(){
  const snap=data.photoFolderUndo.pop();
  if(!snap)return;
  api.restore(data,snap);selected.clear();data.photoMergeInspectorKey=null;
  writeNotice('↩ 直前の操作を取り消したよ。');redraw();
 }
 host.replaceChildren();
 const head=el('div','mergeHero');
 head.append(el('h2','', '💕 おもいでマージ！'),el('p','',
  'ここは仮仕分けだけ！ AIカードを園児のボックスに集めよう。残りは次の画面で写真を移動できるよ。'));
 host.append(head);
 const stats=el('p','mergeStats','📦 ボックス '+occupied.size+'/'+slots.length+
  '　📸 未配置カード '+inbox.length+'組　✅ 確認 '+folders.filter(f=>reviewed.has(f.key)).length+'/'+folders.length+'組');
 host.append(stats);
 if(data.photoMatchNotice){const n=el('p','mergeNotice',data.photoMatchNotice);n.setAttribute('role','status');host.append(n)}
 if(data.photoFolderUndo?.length)host.append(btn('↩ 直前の操作を戻す','secondary mergeUndo',undo));
 const title=el('div','mergeSectionTitle');
 title.append(el('strong','','🏠 なかまボックス'),el('small','','複数選択したら、選んだカードを長押し・ドラッグでまとめて運べるよ！'));
 host.append(title);
 const tray=el('div','mergeSlots');tray.setAttribute('aria-label','園児ごとのなかまボックス');
 let drag=null;
 function dragPayload(key){
  // Dragging a selected card carries the entire selected batch.
  // Dragging a card outside the selection carries that card alone.
  return (selected.has(key)?[...selected]:[key])
   .filter(k=>indexed.has(k)&&!occupied.has(k));
 }
 function dropInto(slot){
  const keys=drag?.keys||[];
  drag=null;
  if(keys.length)adopt(slot,keys);
 }
 function longPressCard(card,key){
  let gesture=null;
  const highlight=()=>{
   if(!gesture)return;
   for(const b of tray.querySelectorAll('.mergeDrop')){
    const r=b.getBoundingClientRect();
    b.classList.toggle('mergeOver',gesture.x>=r.left&&gesture.x<=r.right&&
     gesture.y>=r.top&&gesture.y<=r.bottom);
   }
  };
  const autoScroll=()=>{
   const g=gesture;if(!g?.active)return;
   const viewport=window.visualViewport?.height||window.innerHeight;
   const edge=Math.min(76,viewport*.16);
   const delta=g.y<edge?-Math.min(12,Math.ceil((edge-g.y)/6)):
    g.y>viewport-edge?Math.min(12,Math.ceil((g.y-viewport+edge)/6)):0;
   if(delta)window.scrollBy(0,delta);
   const r=tray.getBoundingClientRect();
   let horizontal=0;
   if(g.y>=r.top&&g.y<=r.bottom){
    if(g.x<r.left+40)horizontal=-9;
    else if(g.x>r.right-40)horizontal=9;
   }
   if(horizontal)tray.scrollLeft+=horizontal;
   if(delta||horizontal)highlight();
   g.raf=requestAnimationFrame(autoScroll);
  };
  const clear=()=>{
   if(!gesture)return;
   clearTimeout(gesture.timer);
   if(gesture.raf)cancelAnimationFrame(gesture.raf);
   gesture.ghost?.remove();
   tray.classList.remove('mergeDragging');
   tray.querySelectorAll('.mergeDrop').forEach(b=>b.classList.remove('mergeOver'));
   gesture=null;
  };
  // Long press must not accidentally click the photo or selection button.
  card.addEventListener('click',event=>{
   if(Number(card.dataset.mergeSuppressUntil||0)>Date.now()){
    event.preventDefault();event.stopImmediatePropagation();
   }
  },true);
  card.addEventListener('touchstart',event=>{
   if(event.touches.length!==1)return;
   const t=event.touches[0];
   gesture={id:t.identifier,x:t.clientX,y:t.clientY,ox:t.clientX,oy:t.clientY,active:false,timer:null,ghost:null};
   gesture.timer=setTimeout(()=>{
    if(!gesture)return;
    gesture.active=true;
    gesture.keys=dragPayload(key);
    card.dataset.mergeSuppressUntil=String(Date.now()+650);
    tray.classList.add('mergeDragging');
    const ghost=el('div','mergeGhost','📸 '+gesture.keys.length+'組をお届け！');
    document.body.append(ghost);gesture.ghost=ghost;
    ghost.style.left=gesture.x+'px';ghost.style.top=gesture.y+'px';
    gesture.raf=requestAnimationFrame(autoScroll);
   },380);
  },{passive:true});
  card.addEventListener('touchmove',event=>{
   if(!gesture)return;
   const t=[...event.touches].find(t=>t.identifier===gesture.id);
   if(!t){clear();return}
   const g=gesture;
   if(!g.active&&Math.hypot(t.clientX-g.ox,t.clientY-g.oy)>10){clear();return}
   if(!g.active)return;
   if(event.cancelable)event.preventDefault();
   g.x=t.clientX;g.y=t.clientY;
   g.ghost.style.left=g.x+'px';g.ghost.style.top=g.y+'px';
   highlight();
  },{passive:false});
  card.addEventListener('touchend',event=>{
   if(!gesture)return;
   const t=[...event.changedTouches].find(t=>t.identifier===gesture.id);
   if(!t)return;
   const wasActive=gesture.active, x=t.clientX,y=t.clientY;
   const payload=wasActive?gesture.keys:[];
   if(wasActive&&event.cancelable)event.preventDefault();
   const target=wasActive?document.elementFromPoint(x,y)?.closest('[data-merge-slot]'):null;
   clear();
   if(target&&wasActive&&payload.length)adopt(Number(target.dataset.mergeSlot),payload);
  },{passive:false});
  card.addEventListener('touchcancel',clear);
 }
 slots.forEach((key,i)=>{
  const f=indexed.get(key),ids=f?photos(f):[];
  const box=btn('', 'mergeBox mergeDrop'+(f?' mergeFilled':' mergeEmpty'),()=>{
   if(selected.size){adopt(i,[...selected]);return}
   if(f){data.photoMergeFocusBoxKey=f.key;data.photoMergeInspectorKey=f.key;data.photoMergeScrollInspector=true;redraw();return}
   writeNotice('下のカードを選んで、このボックスに入れよう！');redraw();
  });
  box.dataset.mergeSlot=String(i);
  const thumb=el('div','mergeBoxPhoto');
  if(ids.length)thumb.append(image(ids[0],boxLabel(i)+'の写真'));
  else thumb.textContent='＋';
  box.append(thumb,el('b','',boxLabel(i)),el('small','',ids.length+'枚'+(f&&reviewed.has(f.key)?' · ✅':'')));
  box.addEventListener('dragover',event=>{
   if(drag?.keys?.length){event.preventDefault();box.classList.add('mergeOver')}
  });
  box.addEventListener('dragleave',()=>box.classList.remove('mergeOver'));
  box.addEventListener('drop',event=>{event.preventDefault();box.classList.remove('mergeOver');dropInto(i)});
  tray.append(box);
 });
 host.append(tray);
 const toolbar=el('div','mergeSectionTitle');
 toolbar.append(el('strong','','📸 AIの仮フォルダ'),el('small','','同じ子のカードを複数選択 → その1枚をドラッグすると全選択分を運べるよ'));
 host.append(toolbar);
 const actions=el('div','mergeActions');
 const count=el('b','',selected.size+'組を選択中');
 actions.append(count,btn('選択解除','secondary',()=>{
  selected.clear();syncSelection();
 }));
 const sortBtn=btn(data.photoMergeSort==='similar'?'↩ 枚数順':'✨ AI候補順','secondary',()=>{
  data.photoMergeSort=data.photoMergeSort==='similar'?'size':'similar';redraw();
 });
 actions.append(sortBtn);
 const quick=document.createElement('select');quick.className='mergeQuickDestination';
 quick.setAttribute('aria-label','選んだAIカードの入れ先');
 slots.forEach((key,i)=>{
  const option=document.createElement('option');option.value=String(i);
  option.textContent=boxLabel(i)+(key?' · '+photos(indexed.get(key)).length+'枚':' · 空き');
  quick.append(option);
 });
 const firstEmpty=slots.findIndex(k=>!k);
 if(firstEmpty>=0)quick.value=String(firstEmpty);
 const quickAdd=btn('💕 選んだカードを入れる','primary mergeQuickAdd',()=>{
  adopt(Number(quick.value),[...selected]);
 });
 actions.append(quick,quickAdd);host.append(actions);
 function syncSelection(){
  data.photoMergeSelected=[...selected];
  count.textContent=selected.size+'組を選択中';
  quickAdd.disabled=selected.size===0;
  for(const card of grid.querySelectorAll('.mergeCard')){
   const picked=selected.has(card.dataset.mergeKey);
   card.classList.toggle('mergePicked',picked);
   const pick=card.querySelector('.mergeSelectCard');
   if(pick){
    pick.textContent=picked?'✅ 選択中':'＋ まとめて選ぶ';
    pick.setAttribute('aria-pressed',String(picked));
   }
  }
 }
 const targetKey=slots.find(Boolean);
 const target=indexed.get(data.photoMergeFocusBoxKey)||indexed.get(targetKey);
 let ordered=[...inbox];
 if(data.photoMergeSort==='similar'&&target){
  const faces=api.faces(data,target),cache=data.photoMatchScoreCache||(data.photoMatchScoreCache=new Map());
  if(cache.size>1800)cache.clear();
  const signature=api.signature(data,target),scores=new Map();
  for(const f of ordered){
   const key=target.key+'|'+f.key+'|'+signature+'|'+api.signature(data,f);
   if(!cache.has(key))cache.set(key,api.score(data,faces,api.faces(data,f)));
   scores.set(f.key,cache.get(key));
  }
  ordered.sort((a,b)=>scores.get(b.key)-scores.get(a.key));
 }else ordered.sort((a,b)=>photos(b).length-photos(a).length);
 const grid=el('div','mergeCards');
 const mobile=window.matchMedia?.('(max-width:600px)').matches||false;
 const batchSize=mobile?16:24;
 const limit=Math.max(batchSize,Number(data.photoMergeCardLimit)||batchSize);
 ordered.slice(0,limit).forEach((f,i)=>{
  const ids=photos(f);
  const card=el('div','mergeCard'+(selected.has(f.key)?' mergePicked':''));
  card.dataset.mergeKey=f.key;
  card.draggable=true;
  card.addEventListener('dragstart',event=>{
   const keys=dragPayload(f.key);
   if(!keys.length){event.preventDefault();return}
   drag={keys};
   if(event.dataTransfer){
    event.dataTransfer.setData('text/plain','omoide-merge');
    event.dataTransfer.effectAllowed='move';
   }
  });
  card.addEventListener('dragend',()=>{drag=null;tray.querySelectorAll('.mergeDrop').forEach(b=>b.classList.remove('mergeOver'))});
  longPressCard(card,f.key);
  const cover=btn('','mergeCover',()=>{
   data.photoMergeInspectorKey=f.key;data.photoMergeScrollInspector=true;redraw();
  });
  cover.append(image(ids[0],'AIフォルダの代表写真'));
  const tag=el('span','mergeCardBadge',ids.length+'枚');cover.append(tag);
  card.append(cover);
  const preview=el('div','mergeMini');
  ids.slice(1,1+(mobile?2:3)).forEach(id=>preview.append(image(id,'フォルダの写真')));
  if(ids.length===1)preview.textContent='写真を開いて確認できるよ';
  card.append(preview);
  const footer=el('div','mergeCardFoot');
  const pick=btn(selected.has(f.key)?'✅ 選択中':'＋ まとめて選ぶ','secondary mergeSelectCard',()=>{
   if(selected.has(f.key))selected.delete(f.key);else selected.add(f.key);
   syncSelection();
  });
  pick.setAttribute('aria-pressed',String(selected.has(f.key)));
  footer.append(el('small','', 'AIカード '+(i+1)),pick);
  card.append(footer);grid.append(card);
 });
 host.append(grid);
 syncSelection();
 if(inbox.length>limit)host.append(btn('＋ カードをもっと見る（'+limit+' / '+inbox.length+'組）','secondary wide mergeMore',()=>{
  data.photoMergeCardLimit=limit+batchSize;redraw();
 }));
 // Inspect source photos without navigating away from the merge board.
 const active=indexed.get(data.photoMergeInspectorKey);
 if(active){
  const inspector=el('section','mergeInspector');
  inspector.id='mergeInspector';
  const idList=photos(active),isBox=occupied.has(active.key);
  const heading=el('div','mergeInspectorTitle');
  heading.append(el('strong','',isBox?'🏠 なかまボックスの写真':'📸 AIカードの写真'),
   btn('✕ 閉じる','secondary',()=>{data.photoMergeInspectorKey=null;redraw()}));
  inspector.append(heading,el('p','muted',idList.length+'枚の元写真を確認しよう。別の子が混ざっていたら選択して移動・追加できるよ。'));
  const picks=new Set(),gallery=el('div','mergeGallery');
  const pickedStatus=el('p','muted','写真を選択してね');
  let shown=0;
  const morePhotos=btn('','secondary wide',appendNext);
  function appendNext(){
   const next=Math.min(idList.length,shown+18);
   idList.slice(shown,next).forEach(id=>{
    const cell=el('div','mergePhotoCell');
    const select=btn('','mergePhotoPick',()=>{
     if(picks.has(id))picks.delete(id);else picks.add(id);
     cell.classList.toggle('mergePhotoSelected',picks.has(id));
     pickedStatus.textContent=picks.size+'枚を選択中';
    });
    select.append(image(id,'写真'+(id+1)));cell.append(select);
    cell.append(btn('🔎','mergePhotoZoom',()=>api.openPhoto(id)));
    gallery.append(cell);
   });
   shown=next;morePhotos.hidden=shown>=idList.length;
   morePhotos.textContent='＋ 写真をもっと見る（'+shown+' / '+idList.length+'枚）';
  }
  appendNext();inspector.append(gallery);
  if(idList.length>18)inspector.append(morePhotos);
  inspector.append(pickedStatus);
  const picker=document.createElement('select');picker.className='mergeDestination';
  picker.setAttribute('aria-label','写真の移動・追加先');
  const emptyOpt=document.createElement('option');emptyOpt.value='';emptyOpt.textContent='移動・追加先のボックスを選ぶ';picker.append(emptyOpt);
  slots.forEach((k,i)=>{
   if(k&&!idsEqual(k,active.key)){
    const opt=document.createElement('option');opt.value=k;
    opt.textContent=boxLabel(i)+'（'+photos(indexed.get(k)).length+'枚）';picker.append(opt);
   }
  });
  inspector.append(picker);
  function idsEqual(a,b){return a===b}
  function modify(mode){
   if(!picks.size){writeNotice('写真を先に選んでね。');redraw();return}
   try{
    if(mode==='split')api.split(data,active.key,[...picks]);
    else{
     if(!picker.value||!indexed.has(picker.value))throw Error('移動・追加先を選んでね');
     if(mode==='add')api.add(data,active.key,picker.value,[...picks]);
     else api.move(data,active.key,picker.value,[...picks]);
    }
    data.photoMergeInspectorKey=null;selected.clear();redraw();
   }catch(e){errorNotice(e)}
  }
  const edits=el('div','mergeEditActions');
  edits.append(btn('📦 移動','secondary',()=>modify('move')),
   btn('📋 両方に追加','secondary',()=>modify('add')),
   btn('✂️ 新しいカードに分離','secondary',()=>modify('split')));
  inspector.append(edits);
  if(isBox){
   const verify=btn(reviewed.has(active.key)?'↩ 確認を取り消す':'✅ このボックスを確認済みにする','primary wide',()=>{
    if(reviewed.has(active.key))reviewed.delete(active.key);else reviewed.add(active.key);
    data.photoMatchFinalReviewed=false;redraw();
   });inspector.append(verify);
  }
  host.insertBefore(inspector,toolbar);
 }
 // EM: Merging is only the first, rough sorting pass. Never require an empty
 // inbox or imply final verification here; all loose cards remain for photo moving.
 const continuePanel=el('section','mergeFinal mergeContinue');
 continuePanel.append(el('h3','','📷 次は写真のおひっこし！'));
 continuePanel.append(el('p','',inbox.length?
  'まだAIカードが'+inbox.length+'組残っていても大丈夫。残したカードも次の画面に持ち越して、写真を移動・修正できるよ。':
  'カードの仕分けはここまで。次の画面で写真の混ざりを確認し、必要な写真だけ移動しよう。'));
 continuePanel.append(btn('➡️ 写真の移動・修正へ進む','primary wide',()=>{
  if(data!==api.current()||!api.valid())return;
  data.photoMergeSelected=[];
  data.photoMatchFinalReviewed=false;
  data.photoMatchNotice='📷 カードの仮仕分けを終えたよ。写真は次の画面で移動できるよ。';
  api.next('check',{scroll:true});
 }));
 host.append(continuePanel);
 api.progress();
 requestAnimationFrame(()=>{
  if(host.isConnected){
   const strip=host.querySelector('.mergeSlots');if(strip)strip.scrollLeft=oldScroll;
   if(data.photoMergeScrollInspector){
    data.photoMergeScrollInspector=false;
    host.querySelector('#mergeInspector')?.scrollIntoView({behavior:'smooth',block:'start'});
   }
  }
 });
};

/* ET: Real 12-tile photo merge board. Uses ER merge/snapshot/undo APIs;
   no AI, file, persistence or STEP2 transfer logic is replaced. */
const omoideGameSessions=new WeakMap();
window.omoideMergeGameRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 const make=(tag,cls,value)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(value!==undefined)e.textContent=value;return e;
 };
 const button=(label,cls,fn)=>{
  const b=make('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;
 };
 let st=omoideGameSessions.get(data);
 if(!st){st={page:0,waiting:0,selected:null,checked:new Set(),mergeTarget:null,notice:'',dragging:null};omoideGameSessions.set(data,st)}
 if(!(st.checked instanceof Set))st.checked=new Set();
 let folders;
 try{folders=api.ensure(data).filter(f=>api.indexes(data,f).length)}
 catch(err){host.textContent='⚠️ '+String(err?.message||err);return}
 const byKey=new Map(folders.map(f=>[f.key,f]));
 const all=folders.slice().sort((a,b)=>api.indexes(data,b).length-api.indexes(data,a).length);
 const rosterCount=Array.isArray(api.children)?api.children.filter(k=>k&&k.id&&k.name).length:12;
 const autoSize=rosterCount<=8?9:rosterCount<=12?12:rosterCount<=16?16:rosterCount<=20?20:rosterCount<=24?24:30;
 const allowed=[9,12,16,20,24,30];
 const boardSize=allowed.includes(st.boardSize)?st.boardSize:autoSize;
 // UI-only stable board ordering: no photo assignments or persisted merge slots change.
 if(!Array.isArray(st.boardKeys))st.boardKeys=[];
 st.boardKeys=st.boardKeys.filter(k=>byKey.has(k));
 const onBoard=new Set(st.boardKeys);
 for(const folder of all){if(st.boardKeys.length>=boardSize)break;
  if(!onBoard.has(folder.key)){st.boardKeys.push(folder.key);onBoard.add(folder.key)}
 }
 if(st.boardKeys.length>boardSize)st.boardKeys.length=boardSize;
 const board=st.boardKeys.map(k=>byKey.get(k)).filter(Boolean);
 const boardKeys=new Set(board.map(f=>f.key));
 const waiting=all.filter(f=>!boardKeys.has(f.key));
 const pages=1;st.page=0;
 const waitingPages=Math.max(1,Math.ceil(waiting.length/8));
 st.waiting=Math.max(0,Math.min(waitingPages-1,st.waiting));
 if(st.selected&&!byKey.has(st.selected))st.selected=null;
 for(const k of st.checked)if(!byKey.has(k))st.checked.delete(k);
 if(!st.checked.has(st.mergeTarget))st.mergeTarget=null;
 function redraw(){window.omoideMergeRender(data,host,api)}
 function announce(message){st.notice=message;redraw()}
 function photo(f){
  const i=api.indexes(data,f)[0],img=make('img','');
  try{img.src=api.url(data.sourceFiles[i]);}catch(e){}
  img.alt='AI仮グループの代表写真';img.loading='lazy';img.decoding='async';img.draggable=false;
  return img;
 }
 function integrateSlots(target,source){
  const slots=data.photoMergeSlots;
  if(!Array.isArray(slots))return;
  const t=slots.indexOf(target),src=slots.indexOf(source);
  if(src>=0&&t<0)slots[src]=target;
  else if(src>=0&&t>=0)slots[src]=null;
  else if(t<0){const empty=slots.findIndex(x=>!x);if(empty>=0)slots[empty]=target}
 }
 function doMergeBatch(keys,target){
  const sources=[...new Set(keys)].filter(k=>k!==target&&byKey.has(k));
  if(!target||!byKey.has(target)||!sources.length)return;
  const old=api.snapshot(data),previous=[...(data.photoFolderUndo||[])];
  try{
   for(const source of sources){
    api.merge(data,target,source);
    integrateSlots(target,source);
   }
   data.photoFolderUndo=previous.concat([old]).slice(-10);
   data.photoFolderReviewed?.delete(target);
   data.photoFolderMistakeReviewed?.delete(target);
   data.photoMatchFinalReviewed=false;
   data.photoMergeFocusBoxKey=target;
   st.selected=null;st.checked.clear();st.confirm=null;
   st.effectTarget=target;st.celebrate=true;
   st.boardKeys=st.boardKeys.filter(k=>!sources.includes(k));
   if(!st.boardKeys.includes(target))st.boardKeys.unshift(target);
   const result=api.ensure(data).find(f=>f.key===target);
   st.notice='✨ MERGE! '+sources.length+'組を合体！ '+(result?api.indexes(data,result).length:0)+'枚になったよ！';
   redraw();
  }catch(err){
   api.restore(data,old);data.photoFolderUndo=previous;
   st.confirm=null;
   announce('⚠️ '+String(err?.message||err));
  }
 }
 function doMerge(source,target){doMergeBatch([source],target)}
 function choose(key){
  if(st.checked.size){
   if(st.checked.has(key)){st.mergeTarget=key;redraw();return}
   st.checked.add(key);redraw();return;
  }
  if(st.selected===key){st.selected=null;redraw();return}
  if(!st.selected){st.selected=key;redraw();return}
  st.confirm={keys:[st.selected,key],target:st.selected};redraw();
 }
 function confirmMerge(){
  const pair=st.confirm;st.confirm=null;
  if(!pair)return;
  doMergeBatch(pair.keys,pair.target);
 }
 function card(f,cls){
  const ids=api.indexes(data,f);
  // Independent controls: no nested buttons, no synthetic click target guessing.
  const tile=make('div',cls+(st.selected===f.key?' galaxySelected':''));
  tile.dataset.key=f.key;
  const view=button('','galaxyTileImage galaxyPhotoOpen',()=>{
   st.selected=null;st.checked.clear();
   data.photoMergeInspectorKey=f.key;
   // Open the group's source photos in the existing inspector when available.
   api.openPhoto(ids[0]);
  });
  view.setAttribute('aria-label',ids.length+'枚の写真グループを確認');
  view.append(photo(f));
  tile.append(view,make('strong','',ids.length+'枚'),make('small','','写真で中身を確認'));
  const check=button(st.checked.has(f.key)?'✓':'','galaxyCheck'+(st.checked.has(f.key)?' isChecked':''),()=>{
   if(st.checked.has(f.key))st.checked.delete(f.key);else st.checked.add(f.key);
   if(!st.checked.has(st.mergeTarget))st.mergeTarget=null;
   st.selected=null;redraw();
  });
  check.setAttribute('aria-pressed',String(st.checked.has(f.key)));
  check.setAttribute('aria-label','この写真グループを'+(st.checked.has(f.key)?'選択解除':'複数選択'));
  tile.append(check);
  if(st.checked.has(f.key))tile.classList.add('galaxyChecked');
  if(st.mergeTarget===f.key)tile.classList.add('galaxyMergeTarget');
  if(st.effectTarget===f.key){tile.classList.add('galaxyMergePop');
   tile.append(make('span','galaxyTileMergeFx','✨ MERGE! 💕'));}
  tile.draggable=true;
  tile.addEventListener('dragstart',e=>{st.dragging=f.key;
   if(e.dataTransfer){e.dataTransfer.setData('text/plain',f.key);e.dataTransfer.effectAllowed='move'}});
  tile.addEventListener('dragover',e=>{if(st.dragging&&st.dragging!==f.key){e.preventDefault();tile.classList.add('galaxyHover')}});
  tile.addEventListener('dragleave',()=>tile.classList.remove('galaxyHover'));
  tile.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();tile.classList.remove('galaxyHover');
   const source=st.dragging||e.dataTransfer?.getData('text/plain');st.dragging=null;
   if(source&&source!==f.key)doMerge(source,f.key)});
  tile.addEventListener('dragend',()=>{st.dragging=null;tile.classList.remove('galaxyHover')});
  // iPhone: long-press to drag without stealing ordinary vertical scrolling.
  let hold=null;
  tile.addEventListener('touchstart',e=>{
   if(e.touches.length!==1)return;
   const t=e.touches[0];hold={x:t.clientX,y:t.clientY,active:false};
   hold.timer=setTimeout(()=>{
    if(!hold)return;hold.active=true;st.dragging=f.key;
    tile.classList.add('galaxyDragging');
   },360);
  },{passive:true});
  tile.addEventListener('touchmove',e=>{
   if(!hold)return;
   const t=e.touches[0];
   if(!hold.active&&Math.hypot(t.clientX-hold.x,t.clientY-hold.y)>10){
    clearTimeout(hold.timer);hold=null;return;
   }
   if(hold.active){
    if(e.cancelable)e.preventDefault();
    document.querySelectorAll('.galaxyHover').forEach(x=>x.classList.remove('galaxyHover'));
    document.elementFromPoint(t.clientX,t.clientY)?.closest('.galaxyTile')?.classList.add('galaxyHover');
   }
  },{passive:false});
  tile.addEventListener('touchend',e=>{
   if(!hold)return;
   clearTimeout(hold.timer);const active=hold.active;
   const t=e.changedTouches[0],dest=active?document.elementFromPoint(t.clientX,t.clientY)?.closest('.galaxyTile'):null;
   hold=null;st.dragging=null;tile.classList.remove('galaxyDragging');
   document.querySelectorAll('.galaxyHover').forEach(x=>x.classList.remove('galaxyHover'));
   if(active){e.preventDefault();tile.dataset.suppressClick=String(Date.now()+800);
    if(dest?.dataset.key&&dest.dataset.key!==f.key)doMerge(f.key,dest.dataset.key)}
  },{passive:false});
  tile.addEventListener('touchcancel',()=>{if(hold)clearTimeout(hold.timer);hold=null;st.dragging=null;tile.classList.remove('galaxyDragging')});
  tile.addEventListener('click',e=>{if(Number(tile.dataset.suppressClick||0)>Date.now()){e.preventDefault();e.stopImmediatePropagation()}},true);
  return tile;
 }
 host.replaceChildren();
 const hero=make('div','galaxyGameHero');
 hero.append(make('h2','','🌙 おもいでマージ！'),make('p','','同じ子の写真ピースを重ねて、ひとつにしよう！'));
 host.append(hero);
 if(st.celebrate){st.celebrate=false;setTimeout(()=>{host.querySelectorAll('.galaxyTileMergeFx').forEach(e=>e.remove());st.effectTarget=null},1300)}
 host.append(make('p','galaxyGameStats','🧩 写真グループ '+all.length+'組　·　🎮 '+boardSize+'マスボード　·　🚀 待機 '+waiting.length+'組'));
 const note=make('p','galaxyGameNotice',st.notice||'写真ピースを1つ選んで、合体する相手をタップ！ 長押しドラッグでもOK。');
 note.setAttribute('role','status');host.append(note);
 if(data.photoFolderUndo?.length)host.append(button('↩ ひとつ戻す','secondary galaxyUndo',()=>{
  const snap=data.photoFolderUndo.pop();if(!snap)return;
  api.restore(data,snap);st.selected=null;st.checked.clear();st.boardKeys=[];st.effectTarget=null;st.notice='↩ 元に戻したよ！';redraw();
 }));
 if(st.confirm){
  const pair=st.confirm;
  const sources=pair.keys.map(k=>byKey.get(k)).filter(Boolean);
  if(sources.length>1){
   const dialog=make('section','galaxyConfirm');
   dialog.append(make('strong','','💕 '+sources.length+'組の写真グループを合体する？'));
   const previews=make('div','galaxyConfirmPreviews');
   for(const f of sources){
    const frame=make('div','galaxyConfirmFace');
    frame.append(photo(f),make('span','',api.indexes(data,f).length+'枚'));
    previews.append(frame);
   }
   dialog.append(previews,make('p','','大まかな仕分けでOK！混ざった写真はSTEP2で移動できるよ。'));
   const actions=make('div','galaxyConfirmActions');
   actions.append(button('やめる','secondary',()=>{st.confirm=null;st.selected=null;redraw()}),
    button('✨ 合体する！','primary',confirmMerge));
   dialog.append(actions);host.append(dialog);
  }else st.confirm=null;
 }
 const batchBar=make('div','galaxyBatchBar');
 batchBar.append(make('strong','',st.checked.size+'組チェック中'));
 const batchBtn=button('💕 まとめてマージ！','primary',()=>{if(st.checked.size<2)return;
  const keys=[...st.checked];st.confirm={keys,target:st.mergeTarget&&st.checked.has(st.mergeTarget)?st.mergeTarget:keys[0]};redraw();});
 batchBtn.disabled=st.checked.size<2;
 batchBar.append(batchBtn,button('チェック解除','secondary',()=>{st.checked.clear();st.mergeTarget=null;redraw()}));
 host.append(batchBar);
 const heading=make('div','galaxyGameHead');
 heading.append(make('strong','','🪐 おほしさまボード'));
 const sizePicker=make('select','galaxyBoardSize');sizePicker.setAttribute('aria-label','ボードのマス数');
 allowed.forEach(n=>{const option=make('option','',n+'マス');option.value=String(n);sizePicker.append(option)});
 sizePicker.value=String(boardSize);
 sizePicker.addEventListener('change',()=>{st.boardSize=Number(sizePicker.value);st.boardKeys=[];st.checked.clear();st.selected=null;redraw()});
 heading.append(sizePicker);
 host.append(heading);
 const stage=make('div','galaxyGameBoard');
 stage.style.gridTemplateColumns='repeat('+(boardSize===9?3:boardSize===30?5:4)+',minmax(0,1fr))';
 board.forEach(f=>stage.append(card(f,'galaxyTile')));
 for(let i=board.length;i<boardSize;i++)stage.append(make('div','galaxyTile galaxyEmpty','＋'));
 host.append(stage);

 const sub=make('div','galaxyGameHead');
 sub.append(make('strong','','🚀 なかま待ちピース'),make('span','',waiting.length+'組'));host.append(sub);
 const wait=make('div','galaxyWaiting');
 waiting.slice(st.waiting*8,st.waiting*8+8).forEach(f=>wait.append(card(f,'galaxyTile galaxyWaitingTile')));
 if(!waiting.length)wait.append(make('p','','このページ以外のカードはないよ'));
 host.append(wait);
 const waitNav=make('div','galaxyGameNav');
 const prev=button('◀ 前','secondary',()=>{st.waiting--;redraw()});prev.disabled=st.waiting===0;
 const nxt=button('次 ▶','secondary',()=>{st.waiting++;redraw()});nxt.disabled=st.waiting>=waitingPages-1;
 waitNav.append(prev,make('strong','',st.waiting+1+' / '+waitingPages),nxt);host.append(waitNav);
 const footer=make('section','galaxyGameFinal');
 footer.append(make('strong','','📸 次は「写真のおひっこし！」'));
 footer.append(make('p','','ここで全部を合体させなくても大丈夫。残ったグループも次の画面で確認できるよ。'));
 footer.append(button('🚀 写真のおひっこしへ進む','primary wide',()=>{
  if(data!==api.current()||!api.valid())return;
  data.photoMergeSelected=[];data.photoMatchFinalReviewed=false;
  api.next('check',{scroll:true});
 }));
 host.append(footer);
 api.progress();
};

/* FG: roster-first sorting game. Original game preserved above for migration safety. */
const namedMergeSessions=new WeakMap();
window.omoideMergeGameRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 let st=namedMergeSessions.get(data);
 if(!st){st={selected:new Set(),page:0,notice:'',effect:null};namedMergeSessions.set(data,st)}
 let groups;try{groups=api.ensure(data).filter(f=>api.indexes(data,f).length)}
 catch(error){host.textContent='⚠️ '+String(error?.message||error);return}
 const kids=(api.children||[]).filter(k=>k.id&&k.name);
 const links=new Map();
 for(const [key,id] of Object.entries(data.photoMatchFolderChild||{}))
  if(kids.some(k=>String(k.id)===String(id)))links.set(key,String(id));
 // No automatic child naming from old slot positions: only teacher-confirmed links count.
 const unassigned=groups.filter(f=>!links.has(f.key));
 for(const key of [...st.selected])if(!unassigned.some(f=>f.key===key))st.selected.delete(key);
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const btn=(label,cls,fn)=>{const e=make('button',cls,label);e.type='button';e.addEventListener('click',fn);return e};
 const image=(f)=>{const e=make('img');const i=api.indexes(data,f)[0];if(i!==undefined)try{e.src=api.url(data.sourceFiles[i])}catch(error){}e.alt='候補グループの代表写真';e.loading='lazy';e.draggable=false;return e};
 const redraw=()=>window.omoideMergeRender(data,host,api);
 function assign(id){
  if(!st.selected.size){st.notice='先に候補ピースをチェックしてね';redraw();return}
  const kid=kids.find(k=>String(k.id)===String(id));
  if(!kid)return;
  // STEP1 is one-tap assignment. Mistakes can be corrected in STEP2 or undone here.
  try{
   const done=api.assignChild(data,String(id),[...st.selected]);
   st.selected.clear();st.effect=id;
   st.notice='✨ MERGE! '+kid.name+'さんに'+done.photos+'枚！';
   redraw();setTimeout(()=>{if(st.effect===id)st.effect=null},1300);
  }catch(error){st.notice='⚠️ '+String(error?.message||error);redraw()}
 }
 host.replaceChildren();
 const hero=make('div','galaxyGameHero');
 hero.append(make('div','cjMergeDecor','🌼　⭐　🫧　🌷'),make('h2','','🧩 おもいでマージ！'),make('p','','写真ピースをえらんで、園児にぽんっ！ ✨'));
 host.append(hero);
 const stats=make('p','galaxyGameStats','🌟 なかまあつめ　'+(groups.length-unassigned.length)+' / '+groups.length+' 組　・　あと '+unassigned.length+' 組');
 host.append(stats);
 const notice=make('p','galaxyGameNotice',st.notice||'① 写真カードをえらぶ　② 園児の丸い写真をタップ！');
 notice.setAttribute('role','status');host.append(notice);
 if(data.photoFolderUndo?.length)host.append(btn('←戻す','secondary galaxyUndo',()=>{
  if(!api.undoChild?.(data)){st.notice='戻せるマージがないよ。';redraw();return}
  st.selected.clear();st.effect=null;
  st.notice='← 直前のマージと園児への写真登録を元に戻したよ！';
  redraw();
 }));
 const board=make('div','galaxyGameBoard galaxyChildBoard cjMergeBoard');
 board.style.gridTemplateColumns='repeat('+(kids.length<=9?3:4)+',minmax(0,1fr))';
 for(const kid of kids){
  const id=String(kid.id);
  const associated=groups.filter(f=>links.get(f.key)===id);
  const count=new Set(associated.flatMap(f=>api.indexes(data,f))).size;
  const tile=btn('','galaxyChildTile'+(st.effect===id?' galaxyMergePop':''),()=>assign(id));
  tile.append(make('strong','',kid.name+'さん'),make('span','',count+'枚'));
  const preview=make('span','galaxyChildPreview');
  // The roster portrait is decorative only; it never identifies or assigns AI groups.
  if(typeof kid.facePhoto==='string'&&kid.facePhoto.startsWith('data:image/')){
   const portrait=make('img');portrait.src=kid.facePhoto;
   portrait.alt='';portrait.loading='lazy';portrait.decoding='async';
   portrait.addEventListener('error',()=>{portrait.remove();preview.textContent='🪐'},{once:true});
   preview.append(portrait);
  }else preview.textContent='🪐';
  tile.prepend(preview);
  if(st.effect===id)tile.append(make('span','galaxyTileMergeFx','✨ MERGE! ✨'));
  board.append(tile);
 }
 host.append(make('div','galaxyGameHead','🌼 だれのおもいで？'),board);
 const waiting=make('div','galaxyWaiting galaxyCandidates');
 const size=12,pages=Math.max(1,Math.ceil(unassigned.length/size));
 st.page=Math.min(Math.max(0,st.page),pages-1);
 for(const folder of unassigned.slice(st.page*size,(st.page+1)*size)){
  const tile=make('div','galaxyTile'+(st.selected.has(folder.key)?' galaxyChecked':''));
  tile.append(image(folder),make('strong','',api.indexes(data,folder).length+'枚'));
  const check=btn(st.selected.has(folder.key)?'✓':'','galaxyCheck'+(st.selected.has(folder.key)?' isChecked':''),()=>{
   if(st.selected.has(folder.key))st.selected.delete(folder.key);else st.selected.add(folder.key);redraw();
  });
  check.setAttribute('aria-pressed',String(st.selected.has(folder.key)));
  check.setAttribute('aria-label','候補ピースを選択');
  tile.append(check);
  tile.addEventListener('click',e=>{if(e.target.closest('button'))return;
   if(st.selected.has(folder.key))st.selected.delete(folder.key);else st.selected.add(folder.key);redraw()});
  waiting.append(tile);
 }
 host.append(make('div','galaxyGameHead','🧩 なかまをさがそう！'),waiting);
 const nav=make('div','galaxyGameNav');
 const prev=btn('◀ 前','secondary',()=>{st.page--;redraw()});prev.disabled=st.page===0;
 const next=btn('次 ▶','secondary',()=>{st.page++;redraw()});next.disabled=st.page>=pages-1;
 nav.append(prev,make('strong','',st.page+1+' / '+pages),next);host.append(nav);
 const footer=make('section','galaxyGameFinal');
 footer.append(make('p','','残りの候補は「間違い探し」で確認できるよ。'));
 footer.append(btn('🔎 おもいで間違い探しへ','primary wide',()=>{
  data.photoMergeSelected=[];data.photoMatchFinalReviewed=false;api.next('check',{scroll:true});
 }));
 host.append(footer);api.progress();
};


/* Orbit merge renderer: keeps original AI, assign/undo and next actions. */
const orbitSessions=new WeakMap();
window.omoideMergeGameRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const btn=(txt,cls,fn)=>{const n=el('button',cls,txt);n.type='button';n.addEventListener('click',fn);return n};
 let st=orbitSessions.get(data);
 if(!st){st={kid:0,page:0,selected:new Set(),notice:'',effect:false};orbitSessions.set(data,st)}
 let groups;
 try{groups=api.ensure(data).filter(f=>api.indexes(data,f).length)}catch(err){host.textContent='⚠️ '+String(err);return}
 const kids=(api.children||[]).filter(k=>k&&k.id&&k.name),ids=new Set(kids.map(k=>String(k.id)));
 const links=data.photoMatchFolderChild||{},waiting=groups.filter(f=>!ids.has(String(links[f.key]||'')));
 for(const key of [...st.selected])if(!waiting.some(f=>f.key===key))st.selected.delete(key);
 st.kid=Math.min(st.kid,Math.max(0,kids.length-1));
 const kid=kids[st.kid],pages=Math.max(1,Math.ceil(waiting.length/8));
 st.page=Math.min(st.page,pages-1);
 const redraw=()=>window.omoideMergeRender(data,host,api);
 const portrait=k=>{const n=el('span','orbitPortrait','🌼');if(typeof k?.facePhoto==='string'&&k.facePhoto.startsWith('data:image/')){const img=el('img');img.src=k.facePhoto;img.alt='';img.onerror=()=>{n.textContent='🌼'};n.replaceChildren(img)}return n};
 function assign(){
  if(!kid||!st.selected.size){st.notice=kid?'まわりの写真をえらんでね':'園児を登録してね';redraw();return}
  try{
   const done=api.assignChild(data,String(kid.id),[...st.selected]);st.selected.clear();st.effect=true;
   st.notice='✨ MERGE! '+kid.name+'さんに'+done.photos+'枚！';redraw();
   setTimeout(()=>{st.effect=false;host.querySelector('.orbitTarget')?.classList.remove('success')},950);
  }catch(err){st.notice='⚠️ '+String(err?.message||err);redraw()}
 }
 host.replaceChildren();
 const root=el('section','orbitRoot');
 root.append(el('h2','','🫧 おもいでマージ！'),el('p','orbitLead','なかまの写真を見つけよう'));
 const top=el('div','orbitTop');
 top.append(el('strong','','🌈 '+(groups.length-waiting.length)+' / '+groups.length+' 組'));
 if(data.photoFolderUndo?.length)top.append(btn('↶ 戻す','orbitUndo',()=>{if(api.undoChild?.(data)){st.selected.clear();st.notice='前のマージを戻したよ';redraw()}}));
 root.append(top);
 const roster=el('div','orbitRoster');
 kids.forEach((k,i)=>{const n=btn('','orbitKid'+(i===st.kid?' active':''),()=>{st.kid=i;st.selected.clear();st.notice='';redraw()});n.append(portrait(k),el('small','',k.name+'さん'));n.setAttribute('aria-pressed',String(i===st.kid));roster.append(n)});
 root.append(roster);
 const board=el('div','orbitBoard');
 const target=btn('','orbitTarget'+(st.effect?' success':''),assign);
 target.append(portrait(kid),el('strong','',kid?kid.name+'さん':'園児を登録'),el('small','',st.selected.size?st.selected.size+'組をMERGE!':'ここへあつめよう'));
 board.append(target);
 waiting.slice(st.page*8,st.page*8+8).forEach((f,i)=>{
  const selected=st.selected.has(f.key),count=api.indexes(data,f).length;
  const n=btn('','orbitBubble orbitPos'+i+(selected?' chosen':''),()=>{selected?st.selected.delete(f.key):st.selected.add(f.key);st.notice=st.selected.size+'組を選択中。まんなかへポンッ！';redraw()});
  const frame=el('span','orbitPhoto'),img=el('img');
  try{img.src=api.url(data.sourceFiles[api.indexes(data,f)[0]])}catch(err){}
  img.alt='';img.loading='lazy';img.draggable=false;frame.append(img);
  n.append(frame,el('span','orbitCount',count+'枚'));
  n.setAttribute('aria-pressed',String(selected));n.setAttribute('aria-label','仮フォルダ '+count+'枚');
  board.append(n);
 });
 if(!waiting.length)board.append(el('div','orbitEmpty','🌟 なかまが集まったよ！'));
 root.append(board);
 const msg=el('p','orbitMsg',st.notice||(waiting.length?'写真を選んで中央をタップ！':'ぜんぶ確認したよ！'));
 msg.setAttribute('role','status');root.append(msg);
 const nav=el('div','orbitNav');
 const prev=btn('‹ 前','',()=>{st.page--;st.selected.clear();redraw()});prev.disabled=st.page===0;
 const next=btn('次 ›','',()=>{st.page++;st.selected.clear();redraw()});next.disabled=st.page>=pages-1;
 nav.append(prev,el('span','',st.page+1+' / '+pages),next);root.append(nav);
 root.append(btn('🔎 写真の間違い探しへ','orbitNext',()=>{data.photoMergeSelected=[];data.photoMatchFinalReviewed=false;api.next('check',{scroll:true})}));
 host.append(root);api.progress();
};


/* Catch game: UI-only replacement for stage 02; uses existing save/undo APIs. */
const catchSessions=new WeakMap();
window.omoideMergeGameRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 const make=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n};
 const button=(label,cls,fn)=>{const n=make('button',cls,label);n.type='button';n.addEventListener('click',fn);return n};
 let st=catchSessions.get(data);if(!st){st={cursor:0,kidPage:0,skipped:new Set(),notice:'',busy:false,inspect:false,combo:0,celebration:''};catchSessions.set(data,st)}
 let groups;try{groups=api.ensure(data).filter(f=>api.indexes(data,f).length)}catch(err){host.textContent='⚠️ '+String(err?.message||err);return}
 const kids=(api.children||[]).filter(k=>k&&k.id&&k.name),ids=new Set(kids.map(k=>String(k.id)));
 const linked=data.photoMatchFolderChild||{};
 const unassigned=groups.filter(f=>!ids.has(String(linked[f.key]||'')));
 for(const key of [...st.skipped])if(!unassigned.some(f=>f.key===key))st.skipped.delete(key);
 const sorted=unassigned.slice().sort((a,b)=>api.indexes(data,b).length-api.indexes(data,a).length);
 const available=sorted.filter(f=>!st.skipped.has(f.key));
 let focus=available[st.cursor]||available[0]||null;
 if(!focus&&sorted.length){st.skipped.clear();st.cursor=0;focus=sorted[0];}
 const currentIndex=Math.max(0,sorted.indexOf(focus)),kidPages=Math.max(1,Math.ceil(kids.length/7));
 st.kidPage=Math.min(st.kidPage,kidPages-1);
 const redraw=()=>window.omoideMergeRender(data,host,api);
 const portrait=k=>{const n=make('span','catchPortrait','🌼');if(typeof k?.facePhoto==='string'&&k.facePhoto.startsWith('data:image/')){const im=make('img');im.src=k.facePhoto;im.alt='';im.onerror=()=>n.textContent='🌼';n.replaceChildren(im)}return n};
 const firstName=name=>{const parts=String(name||'').trim().replace(/(さん|ちゃん|くん)$/,'').split(/[\s\u3000]+/).filter(Boolean);return parts.length>1?parts[parts.length-1]:parts[0]||''};
 const pic=i=>{const image=make('img');try{image.src=api.url(data.sourceFiles[i])}catch(err){}image.alt='';image.loading='lazy';image.decoding='async';return image};
 function send(k,element){
  if(!focus||st.busy)return;
  st.busy=true;
  const board=host.querySelector('.catchBoard'),from=host.querySelector('.catchFolder');
  const start=from?.getBoundingClientRect(),end=element.getBoundingClientRect();
  const fly=make('div','catchFly');fly.append(pic(api.indexes(data,focus)[0]));
  if(start&&end&&board){const rect=board.getBoundingClientRect(),x1=start.left+start.width/2-rect.left,y1=start.top+start.height/2-rect.top,x2=end.left+end.width/2-rect.left,y2=end.top+end.height/2-rect.top;const line=document.createElementNS('http://www.w3.org/2000/svg','svg');line.setAttribute('class','catchConnect');line.setAttribute('viewBox','0 0 '+rect.width+' '+rect.height);const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M'+x1+' '+y1+' L'+x2+' '+y2);path.setAttribute('pathLength','1');line.append(path);board.append(line);requestAnimationFrame(()=>line.classList.add('active'));}
  if(start&&end&&board){const rect=board.getBoundingClientRect();fly.style.left=(start.left+start.width/2-rect.left)+'px';fly.style.top=(start.top+start.height/2-rect.top)+'px';fly.style.setProperty('--catchDx',(end.left+end.width/2-start.left-start.width/2)+'px');fly.style.setProperty('--catchDy',(end.top+end.height/2-start.top-start.height/2)+'px');board.append(fly);requestAnimationFrame(()=>fly.classList.add('fly'));}
  const finish=()=>{
   try{const result=api.assignChild(data,String(k.id),[focus.key]);st.combo++;st.celebration=st.combo%10===0?'🌟 SUPER CATCH!':st.combo%5===0?'🎉 AMAZING!':st.combo%3===0?'🌈 GREAT!':'✨ NICE CATCH!';st.notice='✨ '+firstName(k.name)+'さんへ '+result.photos+'枚！';st.cursor=0;}
   catch(err){st.notice='⚠️ '+String(err?.message||err)}
   st.busy=false;redraw();
   if(st.celebration){const shown=st.celebration;setTimeout(()=>{if(st.celebration===shown){st.celebration='';redraw()}},850)}
  };
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else setTimeout(finish,520);
 }
 host.replaceChildren();
 const root=make('section','catchRoot');
 root.append(make('h2','catchTitle','🫧 おもいでキャッチ！'),make('p','catchLead','まんなかの写真は、だれのおもいで？'));
 const stat=make('div','catchStat');stat.append(make('strong','',(groups.length-unassigned.length)+' / '+groups.length+' 組'),make('span','','🌟 なかまを集めよう'));root.append(stat);
 const track=make('div','catchTrack');const bar=make('span');bar.style.width=(groups.length?(groups.length-unassigned.length)/groups.length*100:100)+'%';track.append(bar);root.append(track);
 const board=make('div','catchBoard');
 board.style.setProperty('--catchCount',String(kids.length));
 if(kids.length>7)board.classList.add('catchMany');
 for(const x of ['✦','✧','✦'])board.append(make('span','catchStar',x));
 const folder=button('','catchFolder',()=>{st.inspect=true;redraw()});
 if(focus){const photo=make('span','catchMainPhoto');photo.append(pic(api.indexes(data,focus)[0]));folder.append(photo,make('strong','','AI仮フォルダ'),make('small','',api.indexes(data,focus).length+'枚の写真'));board.append(folder);}
 else board.append(make('div','catchComplete','🎉 なかま探しクリア！'));
 kids.forEach((k,i)=>{
  const p=button('','catchKid',()=>send(k,p));
  const inner=kids.length>12?Math.min(8,Math.floor(kids.length*.4)):kids.length;
  const isInner=i<inner,ringIndex=isInner?i:i-inner,ringCount=isInner?inner:kids.length-inner;
  const angle=-Math.PI/2+2*Math.PI*ringIndex/Math.max(1,ringCount)+(isInner?0:Math.PI/Math.max(1,ringCount));
  const radius=isInner?(kids.length>12?23:35):43;
  p.style.left=(50+Math.cos(angle)*radius)+'%';p.style.top=(50+Math.sin(angle)*radius)+'%';
  p.classList.add(isInner?'catchInner':'catchOuter');
  p.style.transform='translate(-50%,-50%)';
  p.append(portrait(k),make('small','',firstName(k.name)));p.setAttribute('aria-label',k.name+'さんに振り分け');board.append(p);
 });
 if(st.celebration){const toast=make('div','catchCelebration',st.celebration);toast.setAttribute('aria-live','polite');board.append(toast)}
 root.append(board);
 const notice=make('p','catchNotice',st.notice||(focus?'園児をタップしてキャッチ！':'すべての仮フォルダを確認したよ'));notice.setAttribute('role','status');root.append(notice);
 const actions=make('div','catchActions');
 const undo=button('↶ 戻す','',()=>{if(api.undoChild?.(data)){st.skipped.clear();st.cursor=0;st.notice='ひとつ前に戻したよ';redraw()}});
 undo.disabled=!data.photoFolderUndo?.length;
 actions.append(undo,button('🔍 写真を確認','',()=>{if(focus){st.inspect=true;redraw()}}));
 const skip=button('あとで確認 ›','catchSkip',()=>{if(!focus)return;st.skipped.add(focus.key);st.cursor=0;st.notice='あとで確認するよ';redraw()});
 skip.disabled=!focus;actions.append(skip);root.append(actions);

 if(st.skipped.size){root.append(button('🫧 後回しの写真をもう一度見る（'+st.skipped.size+'組）','catchReview',()=>{st.skipped.clear();st.cursor=0;st.notice='後回しのフォルダを表示したよ';redraw()}))}
 root.append(button('🔎 写真の間違い探しへ','catchNext',()=>{if(st.busy)return;data.photoMergeSelected=[];data.photoMatchFinalReviewed=false;api.next('check',{scroll:true})}));
 if(st.inspect&&focus){
  const modal=make('div','catchModal');const content=make('section','catchModalCard');
  content.append(make('h3','','📸 フォルダの中身'),make('p','','写真を確認して、園児を選ぼう'));
  const grid=make('div','catchPhotoGrid');
  api.indexes(data,focus).forEach(i=>{const cell=make('span');cell.append(pic(i));grid.append(cell)});
  content.append(grid,button('確認できた！','catchClose',()=>{st.inspect=false;redraw()}));modal.append(content);root.append(modal);
 }
 host.append(root);api.progress();
};

})();