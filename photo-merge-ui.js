/* EI: Photo merge game UI. Existing AI groups / photo File objects remain untouched. */
(function(){
'use strict';
window.omoideMergeRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
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
  'AIがまとめた写真カードを、同じ子の「なかまボックス」に集めよう。判断するのは先生だよ！'));
 host.append(head);
 const stats=el('p','mergeStats','📦 ボックス '+occupied.size+'/'+slots.length+
  '　📸 未配置カード '+inbox.length+'組　✅ 確認 '+folders.filter(f=>reviewed.has(f.key)).length+'/'+folders.length+'組');
 host.append(stats);
 if(data.photoMatchNotice){const n=el('p','mergeNotice',data.photoMatchNotice);n.setAttribute('role','status');host.append(n)}
 if(data.photoFolderUndo?.length)host.append(btn('↩ 直前の操作を戻す','secondary mergeUndo',undo));
 const title=el('div','mergeSectionTitle');
 title.append(el('strong','','🏠 なかまボックス'),el('small','','カードを選んでボックスをタップ。ドラッグでも入れられるよ。'));
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
   if(g.y>=r.top&&g.y<=r.bottom){
    if(g.x<r.left+40)tray.scrollLeft-=9;
    else if(g.x>r.right-40)tray.scrollLeft+=9;
   }
   highlight();
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
 toolbar.append(el('strong','','📸 AIの仮フォルダ'),el('small','','写真を開いて確認 → 同じ子のカードをまとめて選択'));
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
 // At least one folder remains in the inbox until it is assigned to a teacher-selected box.
 if(!inbox.length){
  const final=el('section','mergeFinal');
  final.append(el('h3','','🔎 マージ完了前のチェック'));
  const remaining=folders.filter(f=>!occupied.has(f.key)||!reviewed.has(f.key));
  final.append(el('p','','すべてのカードをボックスに入れたよ！ 各ボックスの写真を開いて確認しよう。'+
   (remaining.length?' 未確認：'+remaining.length+'組':' 全ボックス確認済み！')));
  if(remaining.length){
   final.append(btn('🔎 未確認のボックスを見る','secondary wide',()=>{
    data.photoMergeInspectorKey=remaining[0].key;data.photoMergeScrollInspector=true;redraw();
   }));
  }else{
   final.append(btn('✅ 次は写真の最終チェックへ ›','primary wide',()=>{
    if(data!==api.current()||!api.valid())return;
    data.photoMatchFinalReviewed=true;
    writeNotice('✅ すべてのボックスを確認したよ。次は写真全体の最終チェック！');
    api.next('check',{scroll:true});
   }));
  }
  host.append(final);
 }
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
})();