/* Stage 03: Omoide Pocket. Existing folder membership and checkpoint are authoritative. */
(function(){
'use strict';
const sessions=new WeakMap();
window.omoidePocketRender=function(data,host,api){
 if(!data||!api||!api.valid())return;
 // Match the legacy Stage 03 renderer's session initialization.
 // The strict finish validation still checks every folder, child and photo.
 data.photoMatchActive=true;
 const m=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const b=(text,cls,fn)=>{const e=m('button',cls,text);e.type='button';e.addEventListener('click',fn);return e};
 let st=sessions.get(data);if(!st){st={id:null,chosen:new Set(),phase:'check',notice:'',combo:0};sessions.set(data,st)}
 const kids=api.children(),folders=api.folders(data),links=api.links(data),reviewed=data.photoFolderMistakeReviewed;
 const byKid=new Map(kids.map(k=>[String(k.id),[]]));
 folders.forEach(f=>{const id=String(links.get(f.key)||'');if(byKid.has(id))byKid.get(id).push(f)});
 const inbox=api.inbox(data);
 const name=k=>{let labels={};try{labels=JSON.parse(localStorage.getItem('omoide-catch-display-names-v1')||'{}')||{}}catch{}const custom=String(labels[String(k.id)]||'').trim();if(custom)return custom;const value=String(k.name||'').trim().replace(/(さん|ちゃん|くん)$/,'').split(/[\s\u3000]+/);return value.at(-1)||k.name};
 const photo=i=>{const e=m('img');e.src=api.url(data.sourceFiles[i]);e.alt='';e.loading='lazy';return e};
 const idsOf=k=>[...new Set((byKid.get(String(k.id))||[]).flatMap(f=>api.indexes(data,f)))];
 const complete=k=>(byKid.get(String(k.id))||[]).every(f=>reviewed.has(f.key));
 const pending=kids.filter(k=>!complete(k));
 if(!st.id||!kids.some(k=>String(k.id)===String(st.id)))st.id=String(pending[0]?.id||kids[0]?.id||'');
 const selectedKid=kids.find(k=>String(k.id)===String(st.id));
 if(!pending.length&&st.phase==='check')st.phase='deliver';
 if(pending.length&&st.phase==='deliver'&&!st.forceDeliver)st.phase='check';
 const redraw=()=>window.omoidePocketRender(data,host,api);
 function deliverTo(k){
  const chosen=[...st.chosen];
  if(!chosen.length){st.notice='先に写真を選んでね';redraw();return}
  try{
   const dest=(byKid.get(String(k.id))||[])[0];
   const slot=api.slot(data,String(k.id));
   const key=dest?.key||slot;
   if(!key)throw Error('この園児の移動先が見つかりません');
   const wasReviewed=dest?reviewed.has(dest.key):false;
   api.deliver(data,chosen,key);
   if(wasReviewed&&dest)reviewed.add(dest.key);
   st.chosen.clear();st.combo++;st.notice='✨ GREAT DELIVERY! '+name(k)+'さんへ '+chosen.length+'枚！';redraw();
  }catch(e){st.notice='⚠️ '+String(e?.message||e);redraw()}
 }
 const root=m('section','pocketRoot');host.replaceChildren(root);
 root.append(m('h2','pocketTitle','🔎 おもいで間違い探し！'));
 root.append(m('p','pocketSub',st.phase==='check'?'🔎 CHECK':'🫧 DELIVERY'));
 const summary=m('div','pocketSummary');
 summary.append(m('strong','',kids.filter(complete).length+' / '+kids.length+' 人確認'),m('span','','🧺 ポケット '+inbox.length+'枚'));root.append(summary);
 const progress=m('div','pocketProgress');const fill=m('span');fill.style.width=(kids.length?kids.filter(complete).length/kids.length*100:0)+'%';progress.append(fill);root.append(progress);
 const roster=m('div','pocketRoster');
 kids.forEach(k=>{
  const node=b('','pocketKid'+(String(k.id)===st.id?' active':'')+(complete(k)?' checked':''),()=>{if(st.phase==='deliver'){deliverTo(k);return}st.id=String(k.id);st.phase='check';st.chosen.clear();redraw()});
  const avatar=m('span','pocketAvatar');if(k.facePhoto){const im=m('img');im.src=k.facePhoto;im.alt='';avatar.append(im)}else avatar.textContent='🌼';
  node.append(avatar,m('small','',name(k)),m('span','pocketTick',complete(k)?'⭐':''));roster.append(node)
 });
 root.append(roster);
 if(st.phase==='check'){
  // AI未検出・未振り分けも最初からポケットに見せる（既存inboxと同じ参照、コピーしない）。
  if(inbox.length){
   const peek=b('','pocketInboxPreview',()=>{st.phase='deliver';st.forceDeliver=true;st.chosen.clear();redraw()});
   peek.append(m('strong','','🧺 おもいでポケット　'+inbox.length+'枚'));
   const thumbnails=m('span','pocketInboxThumbs');
   inbox.slice(0,5).forEach(i=>{const bubble=m('span','pocketInboxThumb');bubble.append(photo(i));thumbnails.append(bubble)});
   peek.append(thumbnails,m('small','','タップして写真を届ける ›'));
   root.append(peek);
  }
  const photos=selectedKid?idsOf(selectedKid):[];
  const title=m('div','pocketCardHeader');
  title.append(m('h3','',selectedKid?'🌷 '+name(selectedKid)+'さん':'園児を登録してね'),m('span','',photos.length+'枚'));root.append(title);

  const grid=m('div','pocketGrid');
  photos.forEach(i=>{
   const n=b('','pocketPhoto'+(st.chosen.has(i)?' chosen':''),()=>{st.chosen.has(i)?st.chosen.delete(i):st.chosen.add(i);redraw()});
   n.append(photo(i));n.setAttribute('aria-pressed',String(st.chosen.has(i)));n.setAttribute('aria-label','写真'+(i+1)+'を選択');
   grid.append(n);
  });
  root.append(grid);
  if(!photos.length)root.append(m('p','pocketEmpty','この園児の写真はまだないよ。'));
  const actions=m('div','pocketActions');
  const park=b('🧺 '+(st.chosen.size||'')+'枚をポケットへ','pocketPark',()=>{
   const requested=[...st.chosen];if(!requested.length)return;
   try{
    const affected=(byKid.get(st.id)||[]).filter(f=>requested.some(i=>api.indexes(data,f).includes(i)));
    affected.forEach(f=>{
     const values=requested.filter(i=>api.indexes(data,f).includes(i));
     if(values.length)api.park(data,f.key,values);
     // The remaining photos were just visually reviewed; no need to recheck the folder.
     if(api.indexes(data,f).length)reviewed.add(f.key);
    });
    st.chosen.clear();st.combo++;st.notice='✨ POCKET! '+requested.length+'枚を預かったよ';redraw();
   }catch(e){st.notice='⚠️ '+String(e?.message||e);redraw()}
  });park.disabled=!st.chosen.size;actions.append(park);
  actions.append(b('⭐ この子はOK！','pocketOk',()=>{
   (byKid.get(st.id)||[]).forEach(f=>reviewed.add(f.key));
   st.chosen.clear();st.combo++;st.notice='✨ PERFECT! '+name(selectedKid)+'さんの確認完了！';
   st.id=String(kids.find(k=>!complete(k))?.id||st.id);redraw();
  }));root.append(actions);
  if(!pending.length)root.append(b('🌈 おもいでを届ける','pocketNext',()=>{st.phase='deliver';redraw()}));
 }else{
  root.append(m('div','pocketPocket','🧺 '+inbox.length+'枚'));
  const grid=m('div','pocketGrid');
  inbox.forEach(i=>{const n=b('','pocketPhoto'+(st.chosen.has(i)?' chosen':''),()=>{st.chosen.has(i)?st.chosen.delete(i):st.chosen.add(i);redraw()});n.append(photo(i));n.setAttribute('aria-pressed',String(st.chosen.has(i)));grid.append(n)});
  root.append(grid);

  if(!inbox.length&&pending.length===0){
   const done=m('section','pocketClear');
   done.append(m('h2','','🏆 ALL CLEAR!'),m('p','','みんなのおもいでが集まったよ！'));
   done.append(b('✨ 振り分け完了！','pocketNext',()=>api.finish()));root.append(done);
  }
  root.append(b('‹ 写真の確認へ戻る','pocketBack',()=>{st.phase='check';st.forceDeliver=false;redraw()}));
 }
 if(st.notice){const note=m('p','pocketNotice',st.notice);note.setAttribute('role','status');root.append(note)}
 const footer=m('div','pocketFooter');
 footer.append(b('↶ 直前の操作を戻す','pocketUndo',()=>{
  try{if(api.undo(data)){st.chosen.clear();st.notice='↶ ひとつ前に戻したよ';redraw()}}catch(e){st.notice='⚠️ '+String(e);redraw()}
 }));
 footer.append(b('💾 ここまで保存','pocketSave',()=>document.getElementById('savePhotoSortProgress')?.click()));
 root.append(footer);
 api.progress();
};
})();