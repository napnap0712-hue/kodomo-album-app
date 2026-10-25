/* EI: Photo merge game UI. Existing AI groups / photo File objects remain untouched. */
(function(){
'use strict';
window.omoideMergeRender=function(data,host,api){
 if(!data||!api.valid()||!host)return;
 const oldScroll=host.querySelector('.mergeSlots')?.scrollLeft||0;
 let folders;
 try{folders=api.ensure(data).filter(f=>api.indexes(data,f).length)}
 catch(e){host.textContent='⚠️ '+String(e?.message||e);return}
 data.photoMatchActive=true;
 const keys=new Set(folders.map(f=>f.key));
 const requested=Math.max(1,Math.min(60,Number(api.boxCount)||12));
 const existing=Array.isArray(data.photoMergeSlots)?data.photoMergeSlots:[];
 const slots=Array.from({length:Math.max(requested,existing.length)},(_,i)=>keys.has(existing[i])?existing[i]:null);
 data.photoMergeSlots=slots;
 const indexed=new Map(folders.map(f=>[f.key,f]));
 const occupied=new Set(slots.filter(Boolean));
 const inbox=folders.filter(f=>!occupied.has(f.key));
 const selected=new Set((data.photoMergeSelected||[]).filter(k=>inbox.some(f=>f.key===k)));
 const reviewed=data.photoFolderReviewed;
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
 function photos(folder){return api.indexes(data,folder)}
 function boxLabel(slot){return 'なかま '+(slot+1)}
 function adopt(slot,names){
  if(!names.length){writeNotice('下のAIカードを選んでから、なかまボックスをタップしてね。');redraw();return}
  const initial=api.snapshot(data),oldUndo=data.photoFolderUndo.slice();
  try{
   let key=slots[slot],merged=0;
   const targets=[...new Set(names)].filter(k=>indexed.has(k)&&k!==key&&!slots.some((s,i)=>i!==slot&&s===k));
   if(!targets.length)return;
   if(!key){key=targets.shift();data.photoMergeSlots[slot]=key}
   for(const from of targets){api.merge(data,key,from);merged++}
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
 function dropInto(slot){
  const source=drag?.key;
  drag=null;
  if(source&&indexed.has(source)&&!occupied.has(source))adopt(slot,[source]);
  else adopt(slot,[...selected]);
 }
 function longPressCard(card,key){
  let gesture=null;
  const clear=()=>{
   if(!gesture)return;
   clearTimeout(gesture.timer);gesture.ghost?.remove();
   tray.querySelectorAll('.mergeDrop').forEach(b=>b.classList.remove('mergeOver'));
   gesture=null;
  };
  card.addEventListener('touchstart',event=>{
   if(event.touches.length!==1)return;
   const t=event.touches[0];
   gesture={id:t.identifier,x:t.clientX,y:t.clientY,ox:t.clientX,oy:t.clientY,active:false,timer:null,ghost:null};
   gesture.timer=setTimeout(()=>{
    if(!gesture)return;
    gesture.active=true;
    const ghost=el('div','mergeGhost','📸 カードをお届け！');
    document.body.append(ghost);gesture.ghost=ghost;
    ghost.style.left=gesture.x+'px';ghost.style.top=gesture.y+'px';
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
   tray.querySelectorAll('.mergeDrop').forEach(b=>{
    const r=b.getBoundingClientRect();
    b.classList.toggle('mergeOver',g.x>=r.left&&g.x<=r.right&&g.y>=r.top&&g.y<=r.bottom);
   });
  },{passive:false});
  card.addEventListener('touchend',event=>{
   if(!gesture)return;
   const t=[...event.changedTouches].find(t=>t.identifier===gesture.id);
   if(!t)return;
   const wasActive=gesture.active, x=t.clientX,y=t.clientY;
   if(wasActive&&event.cancelable)event.preventDefault();
   const target=wasActive?document.elementFromPoint(x,y)?.closest('[data-merge-slot]'):null;
   if(wasActive)card.dataset.mergeSkipClick='yes';
   clear();
   if(target&&wasActive)adopt(Number(target.dataset.mergeSlot),[key]);
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
  if(ids.length)thumb.append(image(ids[0],'なかま'+(i+1)+'の写真'));
  else thumb.textContent='＋';
  box.append(thumb,el('b','',boxLabel(i)),el('small','',ids.length+'枚'+(f&&reviewed.has(f.key)?' · ✅':'')));
  box.addEventListener('dragover',event=>{
   if(drag?.key&&drag.key!==key){event.preventDefault();box.classList.add('mergeOver')}
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
 actions.append(count,btn('選択解除','secondary',()=>{selected.clear();redraw()}));
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
 actions.append(quick,btn('💕 選んだカードを入れる','primary mergeQuickAdd',()=>{
  adopt(Number(quick.value),[...selected]);
 }));
 host.append(actions);
 const targetKey=slots.find(Boolean);
 const target=indexed.get(data.photoMergeFocusBoxKey)||indexed.get(targetKey);
 let ordered=[...inbox];
 if(data.photoMergeSort==='similar'&&target){
  const faces=api.faces(data,target),cache=data.photoMatchScoreCache||(data.photoMatchScoreCache=new Map());
  if(cache.size>1800)cache.clear();
  const signature=api.signature(data,target);
  ordered.sort((a,b)=>{
   const score=f=>{
    const key=target.key+'|'+f.key+'|'+signature+'|'+api.signature(data,f);
    if(!cache.has(key))cache.set(key,api.score(data,faces,api.faces(data,f)));
    return cache.get(key);
   };
   return score(b)-score(a);
  });
 }else ordered.sort((a,b)=>photos(b).length-photos(a).length);
 const grid=el('div','mergeCards');
 const limit=Math.max(24,Number(data.photoMergeCardLimit)||24);
 ordered.slice(0,limit).forEach((f,i)=>{
  const ids=photos(f);
  const card=el('div','mergeCard'+(selected.has(f.key)?' mergePicked':''));
  card.draggable=true;
  card.addEventListener('dragstart',event=>{
   drag={key:f.key};event.dataTransfer?.setData('text/plain','omoide-merge');
   if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  });
  card.addEventListener('dragend',()=>{drag=null;tray.querySelectorAll('.mergeDrop').forEach(b=>b.classList.remove('mergeOver'))});
  longPressCard(card,f.key);
  const cover=btn('','mergeCover',()=>{
   if(card.dataset.mergeSkipClick==='yes'){delete card.dataset.mergeSkipClick;return}
   data.photoMergeInspectorKey=f.key;data.photoMergeScrollInspector=true;redraw();
  });
  cover.append(image(ids[0],'AIフォルダの代表写真'));
  const tag=el('span','mergeCardBadge',ids.length+'枚');cover.append(tag);
  card.append(cover);
  const preview=el('div','mergeMini');
  ids.slice(1,4).forEach(id=>preview.append(image(id,'フォルダの写真')));
  if(ids.length===1)preview.textContent='写真を開いて確認できるよ';
  card.append(preview);
  const footer=el('div','mergeCardFoot');
  footer.append(el('small','', 'AIカード '+(i+1)),
   btn(selected.has(f.key)?'✅ 選択中':'＋ まとめて選ぶ','secondary',()=>{
    if(selected.has(f.key))selected.delete(f.key);else selected.add(f.key);
    redraw();
   }));
  card.append(footer);grid.append(card);
 });
 host.append(grid);
 if(inbox.length>limit)host.append(btn('＋ カードをもっと見る（'+limit+' / '+inbox.length+'組）','secondary wide mergeMore',()=>{
  data.photoMergeCardLimit=limit+24;redraw();
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
   host.querySelector('.mergeSlots')?.scrollTo({left:oldScroll,behavior:'instant'});
   if(data.photoMergeScrollInspector){
    data.photoMergeScrollInspector=false;
    host.querySelector('#mergeInspector')?.scrollIntoView({behavior:'smooth',block:'start'});
   }
  }
 });
};
})();