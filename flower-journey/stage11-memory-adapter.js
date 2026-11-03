/* Read-only game projection and sandbox-copy composition. No storage or crypto access. */
(function(root){
'use strict';
function view(boundary,session,scope,records){
 const api=root.FlowerFriendRosterViewAdapter,model=api.createDemoModel(boundary,session,scope,records);
 return Object.freeze(api.viewFor(model).map(row=>Object.freeze({id:row.id,label:row.game,photo:row.photo})));
}
function once(text,from,to){if(text.split(from).length!==2)throw Error('Memory game attachment changed');return text.replace(from,to)}
function compose(html,rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('Registered children required');
 const ids=new Set();for(const row of rows){
  if(!row||Object.keys(row).sort().join()!=='id,label,photo'||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.label!=='string'||!row.label.trim()||row.photo!==null&&typeof row.photo!=='string')throw Error('Invalid display projection');ids.add(row.id);
  if(row.photo&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(row.photo))throw Error('Only embedded fictional images');
 }
 const names=html.match(/^const kids=\[[^\n]*\];$/gm);if(names?.length!==1)throw Error('Memory roster attachment changed');
 html=once(html,'let count=20, activeFolder=null, focusKid=null;','let count=roster.length, activeFolder=null, focusKid=null;');
 const begin=html.indexOf('function drawKids(){'),end=html.indexOf('\nconst folderRoot=',begin);
 if(begin<0||end<0||html.indexOf('function drawKids(){',begin+1)!==-1)throw Error('Memory drawing attachment changed');
 const renderer=`let rosterPage=0;
function drawKids(){
 const top=document.getElementById('top'),bottom=document.getElementById('bottom');top.replaceChildren();bottom.replaceChildren();
 const visible=roster.slice(rosterPage*20,rosterPage*20+20),perRow=visible.length>12?5:6,perSection=Math.ceil(visible.length/2);
 screen.classList.toggle('many',visible.length>12);[top,bottom].forEach(row=>row.style.gridTemplateColumns=\`repeat(\${perRow},minmax(0,1fr))\`);
 visible.forEach((row,j)=>{
  const i=rosterPage*20+j,el=document.createElement('button');el.className='kid';el.type='button';el.dataset.kid=i;el.dataset.rosterId=row.id;el.setAttribute('aria-label',row.label+'を選ぶ');
  const portrait=document.createElement('span');portrait.className='portrait';portrait.style.setProperty('--b',colors[i%6]);portrait.style.setProperty('--hair',hairs[i%6]);
  if(row.photo){const image=document.createElement('img');image.src=row.photo;image.alt='';image.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;pointer-events:none';portrait.append(image)}
  const name=document.createElement('span');name.className='kidName';name.textContent=row.label;el.append(portrait,name);el.addEventListener('click',()=>pickKid(i));(j<perSection?top:bottom).append(el);
 });
 const pages=Math.ceil(count/20),switcher=document.getElementById('switchCount');switcher.textContent=pages>1?'登録'+count+'人（'+(rosterPage+1)+'/'+pages+'）→':'登録'+count+'人';switcher.disabled=pages===1;
 document.getElementById('countSummary').textContent='園児'+count+'人 · 未確定'+(totals.length-confirmedFlags.filter(Boolean).length)+'こ';refresh();requestAnimationFrame(drawLines);
}
`;
 html=html.slice(0,begin)+renderer+html.slice(end);
 const switcher=html.match(/^document\.getElementById\('switchCount'\)\.onclick=.*;$/gm);if(switcher?.length!==1)throw Error('Memory count switch changed');
 html=once(html,switcher[0],"document.getElementById('switchCount').onclick=()=>{if(replacingFolder)return;rosterPage=(rosterPage+1)%Math.ceil(count/20);activeFolder=null;selectedFolders.clear();focusKid=null;selectionOrigin=null;drawKids()};");
 return once(html,names[0],'const roster=Object.freeze('+JSON.stringify(rows).replace(/</g,'\\u003c')+'.map(row=>Object.freeze(row)));const kids=roster.map(row=>row.label);');
}
Object.defineProperty(root,'FlowerStage11Memory',{value:Object.freeze({view,compose})});
})(typeof window==='object'?window:globalThis);
