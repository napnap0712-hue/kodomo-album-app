// Standalone in-memory experiment. Never writes to album storage.
const $=id=>document.getElementById(id);
const input=$('photos'),start=$('start'),cancel=$('cancel'),status=$('status'),groupsHost=$('groups'),destination=$('destination'),move=$('move'),selection=$('selection');
let stop=false,items=[],groups=[],selected=new Set(),urls=[],photoNames=[],photoUrls=[];
const groupNames=new Map();
let openedFolder=null;
const excludedFacePairs=new Set();
const facePairKey=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const hasExcludedPair=(a,b)=>a.members.some(i=>b.members.some(j=>excludedFacePairs.has(facePairKey(i,j))));
$('backToFolders').addEventListener('click',()=>{openedFolder=null;selected.clear();render()});
const confirmedAssignments=new Map();
function invalidateAssignmentPreview(){
 if(typeof clearSuggestions==='function')clearSuggestions();
 confirmedAssignments.clear();
 const host=$('assignmentPreview');if(host)host.replaceChildren();
 const label=$('assignmentStatus');if(label)label.textContent='変更があったため、仮振り分け結果をクリアしました。もう一度確認してください。';
}
$('previewAssignments').addEventListener('click',()=>{
 confirmedAssignments.clear();
 const byName=new Map();
 for(const g of groups){
  const name=groupNames.get(g.id)?.trim();
  if(!name||!g.members.length)continue;
  if(!byName.has(name))byName.set(name,new Set());
  for(const id of g.members){const index=items[id]?.sourcePhoto;if(Number.isInteger(index))byName.get(name).add(index)}
 }
 const host=$('assignmentPreview');host.replaceChildren();
 for(const [name,indices] of byName){
  const ids=[...indices].sort((a,b)=>a-b);confirmedAssignments.set(name,ids);
  const section=document.createElement('div');section.style.cssText='padding:12px 0;border-bottom:1px solid #e8edf3';
  const heading=document.createElement('strong');heading.textContent='📁 '+name+'（写真'+ids.length+'枚）';section.append(heading);
  const grid=document.createElement('div');grid.className='faces';grid.style.marginTop='8px';
  for(const i of ids){const img=document.createElement('img');img.src=photoUrls[i];img.alt=photoNames[i];img.title=photoNames[i];img.style.cssText='width:90px;height:90px;object-fit:cover;border-radius:9px';grid.append(img)}
  section.append(grid);host.append(section);
 }
 $('assignmentStatus').textContent=byName.size?'✅ '+byName.size+'名分の仮振り分け結果を作成しました。画面内のプレビューのみ。アルバム・写真・園児名簿には保存していません。':'園児名が設定されたグループがありません。④で園児名を選んでください。';
});

const rosterClasses=[['tanpopo','たんぽぽ組'],['tulip','ちゅうりっぷ組'],['cosmos','コスモス組'],['canna','カンナ組'],['deigo','でいご組'],['sakura','さくら組']];
let roster=[];
const classSelect=$('rosterClass');
for(const [id,name] of rosterClasses){const option=document.createElement('option');option.value=id;option.textContent=name;classSelect.append(option)}
classSelect.value='tulip';
function readRegisteredChildren(){
 const meta=JSON.parse(localStorage.getItem('omoide-year-meta-v1')||'null');
 const schoolYear=()=>{const d=new Date();return d.getFullYear()-(d.getMonth()<3?1:0)};
 const base=Number.isInteger(meta?.base)?meta.base:schoolYear();
 const active=Number.isInteger(meta?.active)?meta.active:schoolYear();
 const suffix=active===base?'':'-year-'+active;
 const key='omoide-class-children-v1-'+classSelect.value+suffix;
 const value=JSON.parse(localStorage.getItem(key)||'[]');
 if(!Array.isArray(value))throw Error('園児名簿の形式が不正です');
 return value.filter(k=>k&&typeof k.name==='string'&&k.name.trim()).map(k=>({id:String(k.id),name:k.name}));
}
$('loadRoster').addEventListener('click',()=>{
 try{roster=readRegisteredChildren();$('rosterStatus').textContent=roster.length+'名を参照読み込みしました（端末内の登録データは未変更）。';render()}
 catch(e){roster=[];$('rosterStatus').textContent='読み込めませんでした：'+String(e.message||e);render()}
});
classSelect.addEventListener('change',()=>{roster=[];$('rosterStatus').textContent='クラスを変更しました。「登録済み園児を読み込む」を押してください。';render()});

// The file inputs are declared in HTML to remain visible even if script loading fails.
const lightInput=$('lightweightOnnxFile'),dataInput=$('lightweightDataFile');
let lightweightModelFile=null,lightweightDataFile=null;
lightInput?.addEventListener('change',()=>{lightweightModelFile=lightInput.files?.[0]||null;status.textContent=lightweightModelFile?'軽量ONNXモデル：'+lightweightModelFile.name:'従来モデルを使用します';});
dataInput?.addEventListener('change',()=>{lightweightDataFile=dataInput.files?.[0]||null;status.textContent=lightweightDataFile?'追加データ：'+lightweightDataFile.name:'追加データ未選択';});
const queued=[];
const folderInput=$('folderInput');
const count=$('photoCount');
function updateCount(){count.textContent=queued.length+'枚選択済み（追加選択できます）'}
function addFiles(files){let skipped=0;for(const file of files){if(!file.type.startsWith('image/'))continue;if(queued.length>=100){skipped++;continue}queued.push(file)}updateCount();if(skipped)count.textContent+=' ※100枚を超えた'+skipped+'枚は未追加';input.value='';folderInput.value=''}
input.addEventListener('change',()=>addFiles(Array.from(input.files||[])));
$('addPhotos').addEventListener('click',()=>input.click());
$('folderPhotos').addEventListener('click',()=>folderInput.click());
folderInput.addEventListener('change',()=>addFiles(Array.from(folderInput.files||[])));
$('clearPhotos').addEventListener('click',()=>{queued.length=0;input.value='';folderInput.value='';updateCount()});
$('threshold').addEventListener('input',()=>{$('thresholdValue').value=Number($('threshold').value).toFixed(2)});
$('recognitionModel').addEventListener('change',()=>{
 const threshold=$('threshold');
 threshold.value=['arcface','buffalo_s'].includes($('recognitionModel').value)?'0.65':'0.70';
 $('thresholdValue').value=Number(threshold.value).toFixed(2);
 status.textContent='モデル別の試験用初期基準を設定しました。精度保証ではありません。';
});
$('clear').addEventListener('click',()=>{selected.clear();render()});
cancel.addEventListener('click',()=>{stop=true;status.textContent='中断しています…'});
function regroupFromExistingVectors(threshold){
 if(!items.length)return;
 const pairScores=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const score=similarity(items[i].vector,items[j].vector);
  if(Number.isFinite(score))pairScores.push({i,j,score});
 }
 pairScores.sort((a,b)=>b.score-a.score);
  groups=[{id:'unknown',members:[]}];let next=1;
  // DBSCAN: density-based face-embedding clustering, with singleton noise
  // retained as separate provisional groups for teacher review.
  const scoreMap=new Map(pairScores.map(p=>[p.i+':'+p.j,p.score]));
  const pairScore=(i,j)=>i===j?1:scoreMap.get(Math.min(i,j)+':'+Math.max(i,j));
  // Complete-link grouping: an incoming face must match EVERY existing member.
  // This avoids DBSCAN chaining across lookalike children through one pose-matched pair.
  const neighbors=items.map((_,i)=>items.map((_,j)=>j).filter(j=>pairScore(i,j)>=threshold));
  const labels=new Int32Array(items.length).fill(-2); // -2 unvisited, -1 noise
  let clusterId=0;
  const minPts=2;
  for(let i=0;i<items.length;i++){
   if(labels[i]!==-2)continue;
   if(neighbors[i].length<minPts){labels[i]=-1;continue}
   const id=clusterId++;labels[i]=id;
   const queue=[...neighbors[i]],queuedNeighbors=new Set(queue);
   for(let head=0;head<queue.length;head++){
    const j=queue[head];
    if(labels[j]===-1)labels[j]=id;
    if(labels[j]!==-2)continue;
    labels[j]=id;
    if(neighbors[j].length>=minPts)for(const k of neighbors[j]){
     if(!queuedNeighbors.has(k)){queuedNeighbors.add(k);queue.push(k)}
    }
   }
  }
  const clustered=new Map();
  for(let i=0;i<items.length;i++){
   if(labels[i]<0)continue;
   if(!clustered.has(labels[i]))clustered.set(labels[i],[]);
   clustered.get(labels[i]).push(i);
  }
  // Split transitive DBSCAN chains before any secondary merge.
  // Within each provisional identity, require pairwise agreement rather than
  // allowing a single similar-looking bridge to connect two different children.
  const completeLinkSplit=members=>{
   const ordered=[...members].sort((a,b)=>{
    const quality=id=>members.reduce((total,other)=>total+(pairScore(id,other)||0),0);
    return quality(b)-quality(a);
   });
   const parts=[];
   for(const id of ordered){
    const candidates=parts.map((part,k)=>({k,min:Math.min(...part.map(other=>pairScore(id,other)))}))
      .filter(candidate=>candidate.min>=threshold)
      .sort((a,b)=>b.min-a.min);
    if(candidates.length)parts[candidates[0].k].push(id);
    else parts.push([id]);
   }
   return parts;
  };
  for(const members of clustered.values())for(const part of completeLinkSplit(members))groups.push({id:String(next++),members:part});
  for(let i=0;i<items.length;i++)if(labels[i]<0)groups.push({id:String(next++),members:[i]});
  // A face pair from the same photo must never be in one identity group.
  // Unlike a nearest-neighbor edge, this cannot-link rule survives transitive merges.
  const splitSamePhotoConflicts=()=>{
   const repaired=[groups[0]];
   for(const group of groups.slice(1)){
    const buckets=[];
    for(const id of group.members){
     let bucket=buckets.find(bucket=>bucket.every(other=>items[other].sourcePhoto!==items[id].sourcePhoto));
     if(!bucket){bucket=[];buckets.push(bucket)}
     bucket.push(id);
    }
    for(const bucket of buckets)repaired.push({id:String(repaired.length),members:bucket});
   }
   groups=repaired;
  };
  splitSamePhotoConflicts();
  // Conservative second pass: merge fragmented clusters only when all cross-cluster
  // faces remain similar. Never merge simply to match the roster headcount.
  let merged=true;
  while(merged){
   merged=false;let best=null;
   for(let a=1;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
    const ga=groups[a],gb=groups[b];if(!ga.members.length||!gb.members.length)continue;
    // Never combine two faces from one source photo, even during later passes.
    const photos=new Set(ga.members.map(i=>items[i].sourcePhoto));
    if(gb.members.some(i=>photos.has(items[i].sourcePhoto)))continue;
    const cross=ga.members.flatMap(i=>gb.members.map(j=>pairScore(i,j)));
    if(cross.some(v=>!Number.isFinite(v)))continue;
    const minimum=Math.min(...cross),average=cross.reduce((sum,v)=>sum+v,0)/cross.length;
    if(minimum<Math.max(0.48,threshold-0.12)||average<Math.max(0.62,threshold-0.02))continue;
    if(!best||average>best.average)best={a,b,average};
   }
   if(best){
    groups[best.a].members.push(...groups[best.b].members);
    groups.splice(best.b,1);merged=true;
   }
  }


 groupNames.clear();selected.clear();openedFolder=null;invalidateAssignmentPreview();render();
}
$('threshold').addEventListener('change',()=>{
 if(!items.length)return;
 regroupFromExistingVectors(Number($('threshold').value));
 status.textContent+='\n🔄 保存済みの顔特徴からグループ分けだけ再計算しました（写真の再解析なし）。園児名の仮設定はリセットされました。';
});
let assignmentSuggestions=[];
function clearSuggestions(){
 assignmentSuggestions=[];
 const panel=$('suggestionReview');if(panel)panel.replaceChildren();
 const button=$('applySuggestions');if(button)button.disabled=true;
}
$('suggestAssignments').addEventListener('click',()=>{
 const out=$('suggestStatus');clearSuggestions();
 if(!items.length){out.textContent='先に写真を解析してください。';return}
 if(!roster.length){out.textContent='登録済み園児を読み込んでください。';return}
 const references=new Map();
 for(const g of groups){
  const name=groupNames.get(g.id);
  if(!name||!roster.some(k=>k.name===name))continue;
  if(!references.has(name))references.set(name,[]);
  for(const id of g.members)references.get(name).push(items[id].vector);
 }
 if(!references.size){out.textContent='まず顔グループに正しい園児名を設定してください。';return}
 let strong=0,review=0,unknown=0;
 for(const g of groups){
  if(!g.members.length||groupNames.has(g.id))continue;
  const ranked=[...references].map(([name,vectors])=>{
   const scores=g.members.map(id=>Math.max(...vectors.map(v=>similarity(items[id].vector,v))));
   return {name,score:Math.min(...scores)};
  }).sort((a,b)=>b.score-a.score);
  const first=ranked[0],second=ranked[1];if(!first){unknown++;continue}
  const gap=second?first.score-second.score:1;
  const category=first.score>=0.68&&gap>=0.12?'高一致候補':first.score>=0.50&&gap>=0.04?'要確認':'未選別';
  if(category==='高一致候補')strong++;else if(category==='要確認')review++;else unknown++;
  if(category==='未選別')continue;
  assignmentSuggestions.push({groupId:g.id,name:first.name,score:first.score,gap,category});
 }
 const host=$('suggestionReview');host.replaceChildren();
 for(const suggestion of assignmentSuggestions){
  const g=groups.find(x=>x.id===suggestion.groupId);if(!g)continue;
  const row=document.createElement('div');row.style.cssText='padding:12px 0;border-bottom:1px solid #e1e8f2';
  const label=document.createElement('label');label.style.cssText='display:block;font-weight:600;margin-bottom:8px';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=false;checkbox.dataset.suggestGroup=suggestion.groupId;
  label.append(checkbox,document.createTextNode(' '+suggestion.category+'：候補 '+g.id+' → '+suggestion.name+'（比較値 '+suggestion.score.toFixed(3)+'／次点差 '+suggestion.gap.toFixed(3)+'）'));
  row.append(label);
  const faces=document.createElement('div');faces.className='faces';
  for(const id of g.members){const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.className='face';faces.append(img)}
  row.append(faces);host.append(row);
 }
 $('applySuggestions').disabled=!assignmentSuggestions.length;
 out.textContent='高一致候補 '+strong+'件／要確認 '+review+'件／未選別 '+unknown+'件。提案のみで変更なし。内容を確認してチェックした候補だけ反映してください。';
});
$('applySuggestions').addEventListener('click',()=>{
 const checked=new Set([...document.querySelectorAll('[data-suggest-group]:checked')].map(el=>el.dataset.suggestGroup));
 let applied=0;
 for(const suggestion of assignmentSuggestions){
  if(!checked.has(suggestion.groupId)||!groups.some(g=>g.id===suggestion.groupId))continue;
  groupNames.set(suggestion.groupId,suggestion.name);applied++;
 }
 clearSuggestions();invalidateAssignmentPreview();render();
 $('suggestStatus').textContent=applied+'件を仮反映しました。先生の確認が必要です。アルバムには保存していません。';
});
const similarity=(x,y)=>{let dot=0,a=0,b=0;for(let i=0;i<x.length;i++){dot+=x[i]*y[i];a+=x[i]*x[i];b+=y[i]*y[i]}return dot/Math.sqrt(a*b)};
function groupLabel(id){return id==='unknown'?'未分類':(groupNames.get(id)?groupNames.get(id)+'（グループ'+id+'）':'グループ '+id)}
let draggingFace=null,pressTimer=null,dragGhost=null,dragPointer=null,dragJustFinished=false,pressOrigin=null;
function relocateFace(id,target){
 if(!Number.isInteger(id)||!groups.some(g=>g.id===target))return;
 if(groups.find(g=>g.id===target).members.includes(id))return;
 for(const g of groups)g.members=g.members.filter(x=>x!==id);
 groups.find(g=>g.id===target).members.push(id);
 selected.clear();invalidateAssignmentPreview();render();
}
function cleanupDrag(){
 if(draggingFace!==null){dragJustFinished=true;setTimeout(()=>{dragJustFinished=false},350)}
 clearTimeout(pressTimer);pressTimer=null;draggingFace=null;dragPointer=null;pressOrigin=null;
 if(dragGhost){dragGhost.remove();dragGhost=null}
 document.querySelectorAll('[data-drop-folder]').forEach(el=>el.style.outline='');
}
function installDrag(img,id){
 img.draggable=true;
 img.style.cursor='grab';img.style.touchAction='pan-y';img.addEventListener('contextmenu',e=>e.preventDefault());
 img.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});
 img.addEventListener('dragstart',e=>{draggingFace=id;e.dataTransfer.setData('text/plain',String(id));e.dataTransfer.effectAllowed='move'});
 img.addEventListener('dragend',cleanupDrag);
 img.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  const x=e.clientX,y=e.clientY;
  dragPointer=e.pointerId;pressOrigin={x,y};
  pressTimer=setTimeout(()=>{
   draggingFace=id;dragGhost=img.cloneNode();dragGhost.style.cssText='position:fixed;z-index:9999;width:72px;height:72px;object-fit:cover;opacity:.8;pointer-events:none;border:3px solid #3385f2;border-radius:10px';
   document.body.append(dragGhost);dragGhost.style.left=(x-36)+'px';dragGhost.style.top=(y-36)+'px';
  },380);
 });
 img.addEventListener('pointermove',e=>{
  if(e.pointerId!==dragPointer)return;
  if(!draggingFace){if(pressOrigin&&(Math.abs(e.clientX-pressOrigin.x)>12||Math.abs(e.clientY-pressOrigin.y)>12))clearTimeout(pressTimer);return}
  e.preventDefault();if(dragGhost){dragGhost.style.left=(e.clientX-36)+'px';dragGhost.style.top=(e.clientY-36)+'px'}
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop-folder]');
  document.querySelectorAll('[data-drop-folder]').forEach(el=>el.style.outline=el===target?'3px solid #3385f2':'');
 });
 img.addEventListener('pointerup',e=>{
  if(e.pointerId!==dragPointer)return;
  const idToMove=draggingFace;
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop-folder]')?.dataset.dropFolder;
  cleanupDrag();
  if(idToMove!==null&&target)relocateFace(idToMove,target);
 });
 img.addEventListener('pointercancel',cleanupDrag);
}
function render(){
 selection.textContent='選択中：'+selected.size+'件';move.disabled=!selected.size;
 const existing=groups.filter(g=>g.members.length);
 const overview=$('folderOverview'),detail=$('folderDetail'),actions=$('folderActions');
 overview.hidden=false;detail.hidden=true;actions.hidden=true;
 overview.replaceChildren();
 // Display only registered child folders plus one unassigned folder.
 // AI clusters remain internal until a teacher explicitly associates them.
 const displayFolders=new Map();
 for(const kid of roster)if(!displayFolders.has(kid.name))displayFolders.set(kid.name,{name:kid.name,groups:[],members:[]});
 const pending={name:'未選別',groups:[],members:[]};
 for(const g of existing){
  const name=groupNames.get(g.id)?.trim();
  const folder=name&&displayFolders.has(name)?displayFolders.get(name):pending;
  folder.groups.push(g);folder.members.push(...g.members);
 }
 const makePicker=(g)=>{
  const picker=document.createElement('select');picker.setAttribute('aria-label','この顔グループの園児を選択');picker.style.cssText='display:block;max-width:100%;margin:6px 0';
  const blank=document.createElement('option');blank.value='';blank.textContent='未選別のまま';picker.append(blank);
  for(const kid of roster){const opt=document.createElement('option');opt.value=kid.name;opt.textContent=kid.name;picker.append(opt)}
  picker.value=groupNames.get(g.id)||'';
  picker.addEventListener('change',()=>{if(picker.value)groupNames.set(g.id,picker.value);else groupNames.delete(g.id);invalidateAssignmentPreview();render()});
  return picker;
 };
 for(const folder of [...displayFolders.values(),pending]){
  const card=document.createElement('article');card.className='group';card.style.cssText='min-height:120px;min-width:0;padding:12px';
  if(folder.groups.length)card.dataset.dropFolder=folder.groups[0].id;
  const title=document.createElement('strong');title.textContent='📁 '+folder.name+'（顔'+folder.members.length+'件）';card.append(title);
  if(folder===pending){
   const hint=document.createElement('p');hint.className='muted';hint.textContent='AIの仮グループはここにまとめて表示。園児を選ぶと登録園児フォルダへ移動します。';card.append(hint);
   for(const g of folder.groups){
    const section=document.createElement('div');section.style.cssText='padding:8px 0;border-top:1px solid #e8edf3';
    const label=document.createElement('span');label.textContent='候補 '+g.id+'（顔'+g.members.length+'件）';section.append(label,makePicker(g));
   const faces=document.createElement('div');faces.className='faces';
    for(const id of g.members){const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.className='face';installDrag(img,id);faces.append(img)}
    section.append(faces);card.append(section);
   }
  }else{
   const faces=document.createElement('div');faces.className='faces';
   for(const id of folder.members){const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.className='face';installDrag(img,id);faces.append(img)}
   card.append(faces);
  }
  card.addEventListener('dragover',e=>{if(draggingFace===null||!card.dataset.dropFolder)return;e.preventDefault();e.dataTransfer.dropEffect='move';card.style.outline='3px solid #3385f2'});
  card.addEventListener('dragleave',()=>card.style.outline='');
  card.addEventListener('drop',e=>{if(!card.dataset.dropFolder)return;e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));const target=card.dataset.dropFolder;cleanupDrag();relocateFace(id,target)});
  overview.append(card);
 }

 destination.replaceChildren();
 for(const g of existing){const opt=document.createElement('option');opt.value=g.id;opt.textContent=groupLabel(g.id);destination.append(opt)}
 const add=document.createElement('option');add.value='new';add.textContent='新しいグループ';destination.append(add);
 const photoLinks=$('photoLinks');
 if(photoLinks){photoLinks.replaceChildren();for(let i=0;i<photoNames.length;i++){
  const row=document.createElement('div');row.style.cssText='padding:8px 0;border-bottom:1px solid #e8edf3;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const label=document.createElement('strong');label.textContent=(i+1)+'枚目：'+photoNames[i];row.append(label);
  const faceIds=items.map((item,id)=>item.sourcePhoto===i?id:-1).filter(id=>id>=0);
  const assigned=[...new Set(faceIds.flatMap(id=>groups.filter(g=>g.members.includes(id)).map(g=>g.id)))];
  const info=document.createElement('span');info.textContent=faceIds.length?('検出顔 '+faceIds.length+'件 ／ '+(assigned.length?assigned.map(id=>groupLabel(id)).join('・'):'未分類')):'顔未検出（手動対応予定）';row.append(info);photoLinks.append(row);
 }}
 const folders=$('childFolders');
 if(folders){folders.replaceChildren();for(const g of existing){if(g.id==='unknown')continue;
  const row=document.createElement('div');row.style.cssText='padding:10px 0;border-bottom:1px solid #e8edf3';
  const label=document.createElement('label');label.textContent='グループ '+g.id+' → 園児名 ';const field=document.createElement('input');field.type='text';field.placeholder='園児名（仮入力）';field.value=groupNames.get(g.id)||'';field.style.cssText='padding:8px;border:1px solid #ccd5e0;border-radius:8px';label.append(field);row.append(label);
  const photos=document.createElement('div');photos.className='faces';photos.style.cssText='margin-top:8px';
  const update=()=>{const name=field.value.trim();if(name)groupNames.set(g.id,name);else groupNames.delete(g.id);
   const ids=[...new Set(g.members.map(id=>items[id]?.sourcePhoto).filter(Number.isInteger))].sort((a,b)=>a-b);
   photos.replaceChildren();
   if(!ids.length){photos.textContent='該当写真なし';return}
   for(const i of ids){const figure=document.createElement('figure');figure.style.cssText='margin:0;width:96px';const img=document.createElement('img');img.src=photoUrls[i];img.alt=photoNames[i];img.title=photoNames[i];img.style.cssText='width:96px;height:96px;object-fit:cover;border-radius:10px';const caption=document.createElement('figcaption');caption.className='muted';caption.style.cssText='overflow-wrap:anywhere;font-size:11px';caption.textContent=(i+1)+'枚目';figure.append(img,caption);photos.append(figure)}
  };
  field.addEventListener('input',update);field.addEventListener('change',()=>{invalidateAssignmentPreview();render()});
  if(roster.length){const picker=document.createElement('select');picker.setAttribute('aria-label','登録済み園児を選択');const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='登録済み園児から選択';picker.append(placeholder);for(const kid of roster){const option=document.createElement('option');option.value=kid.id;option.textContent=kid.name;picker.append(option)}picker.addEventListener('change',()=>{const kid=roster.find(k=>k.id===picker.value);if(!kid)return;groupNames.set(g.id,kid.name);invalidateAssignmentPreview();render()});row.append(picker)}
  update();row.append(photos);folders.append(row);
 }}
 groupsHost.replaceChildren();
}
move.addEventListener('click',()=>{
 if(!selected.size)return;
 let target=destination.value;
 if(target==='new'){target=String(Math.max(0,...groups.map(g=>Number(g.id)||0))+1);groups.push({id:target,members:[]})}
 const dest=groups.find(g=>g.id===target);if(!dest)return;
 for(const g of groups)g.members=g.members.filter(id=>!selected.has(id));
 for(const id of selected)dest.members.push(id);
 selected.clear();invalidateAssignmentPreview();render();
});
async function embed(bitmap,human,session,ort,phaseTimings,diagnostics,flipAugment=false){
 const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 const detectionStart=performance.now();
 const faces=(await human.detect(canvas)).face||[];
 phaseTimings.detection+=performance.now()-detectionStart;
 if(!faces.length)throw Error('顔を検出できません');
 const results=[];
 for(const face of faces){
 try{
 const mesh=face.mesh;
 if(!Array.isArray(mesh)||mesh.length<363)throw Error('顔の位置情報不足');
 // ArcFace's five-point alignment expects eye centers, not the outer eye
 // corners (33 and 263). Average the inner and outer corners of each eye.
 const midpoint=(i,j)=>[(mesh[i]?.[0]+mesh[j]?.[0])/2,(mesh[i]?.[1]+mesh[j]?.[1])/2];
 const src=[midpoint(33,133),midpoint(362,263),[mesh[1]?.[0],mesh[1]?.[1]],[mesh[61]?.[0],mesh[61]?.[1]],[mesh[291]?.[0],mesh[291]?.[1]]];
 if(src.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('顔の座標が不正');
 const dst=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
 const mean=p=>p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]);
 const sm=mean(src),dm=mean(dst);let aa=0,bb=0,den=0;
 for(let k=0;k<5;k++){const x=src[k][0]-sm[0],y=src[k][1]-sm[1],u=dst[k][0]-dm[0],v=dst[k][1]-dm[1];aa+=x*u+y*v;bb+=x*v-y*u;den+=x*x+y*y}
 if(den<1)throw Error('顔位置補正失敗');
 const a=aa/den,b=bb/den,tx=dm[0]-a*sm[0]+b*sm[1],ty=dm[1]-b*sm[0]-a*sm[1];
 const aligned=document.createElement('canvas');aligned.width=112;aligned.height=112;
 const ctx=aligned.getContext('2d');ctx.setTransform(a,b,-b,a,tx,ty);ctx.drawImage(canvas,0,0);
 const pixels=ctx.getImageData(0,0,112,112).data,plane=112*112,tensor=new Float32Array(plane*3);
 for(let p=0;p<plane;p++)for(let c=0;c<3;c++)tensor[c*plane+p]=(pixels[p*4+c]-127.5)/127.5;
 const recognitionStart=performance.now();
 const feeds={};
 for(const name of session.inputNames){
  const meta=session.inputMetadata?.[name];
  const dims=meta?.dimensions||meta?.dims||[];
  const valid=Array.isArray(dims)&&dims.length===4&&
    (dims[1]===3||dims[1]==='3')&&(dims[2]===112||dims[2]==='112')&&(dims[3]===112||dims[3]==='112');
  if(!valid&&session.inputNames.length>1)throw Error('追加入力 '+name+' の形状 '+JSON.stringify(dims)+' を確認する必要があります');
  feeds[name]=new ort.Tensor('float32',tensor,[1,3,112,112]);
 }
 const output=await session.run(feeds);
 phaseTimings.recognition+=performance.now()-recognitionStart;phaseTimings.faces++;
 let vec=Array.from(output[session.outputNames[0]].data);
 if(vec.length<64||vec.length>1024||vec.some(v=>!Number.isFinite(v)))throw Error('特徴データ取得失敗（対応外の出力形状）');
 if(flipAugment){
  // Test-time horizontal flip: run sequentially to avoid a second model session
  // and average L2-normalized embeddings to reduce left/right pose variation.
  const flipped=new Float32Array(tensor.length);
  for(let c=0;c<3;c++)for(let y=0;y<112;y++)for(let x=0;x<112;x++)
   flipped[c*plane+y*112+x]=tensor[c*plane+y*112+(111-x)];
  const flipFeeds={};
  for(const name of session.inputNames)flipFeeds[name]=new ort.Tensor('float32',flipped,[1,3,112,112]);
  const flipOutput=await session.run(flipFeeds);
  const other=Array.from(flipOutput[session.outputNames[0]].data);
  if(other.length===vec.length&&other.every(Number.isFinite)){
   const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
   const first=normalize(vec),second=normalize(other);
   vec=first.map((v,i)=>(v+second[i])*0.5);
  }
 }
 const box=face.box||[];
 const bx=Array.isArray(box)?box[0]:box.x,by=Array.isArray(box)?box[1]:box.y,bw=Array.isArray(box)?box[2]:box.width,bh=Array.isArray(box)?box[3]:box.height;
 const crop=document.createElement('canvas');crop.width=160;crop.height=160;
 if([bx,by,bw,bh].every(Number.isFinite)&&bw>0&&bh>0){
  const side=Math.max(bw,bh)*1.5,cx=bx+bw/2,cy=by+bh/2;
  crop.getContext('2d').drawImage(canvas,cx-side/2,cy-side/2,side,side,0,0,160,160);
 }else{
  // Landmark-based fallback when the detector does not supply a bounding box.
  const xs=mesh.map(p=>p?.[0]).filter(Number.isFinite),ys=mesh.map(p=>p?.[1]).filter(Number.isFinite);
  if(!xs.length||!ys.length)throw Error('顔の切り抜き位置を取得できません');
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),side=Math.max(x1-x0,y1-y0)*1.35;
  crop.getContext('2d').drawImage(canvas,(x0+x1-side)/2,(y0+y1-side)/2,side,side,0,0,160,160);
 }
 const faceSize=Number.isFinite(bw)&&Number.isFinite(bh)?Math.min(bw,bh):null;
 const faceQuality=faceSize==null?'不明':faceSize<55?'小さい顔・要確認':faceSize<95?'中くらいの顔':'大きい顔';
 results.push({vector:vec,thumbnail:crop.toDataURL('image/jpeg',0.82),alignedThumbnail:aligned.toDataURL('image/jpeg',0.72),faceSize,faceQuality});
 }catch(error){console.warn('顔ごとの解析失敗',error);if(diagnostics.length<5)diagnostics.push(String(error?.message||error).slice(0,260))}
 }
 if(!results.length)throw Error('検出した顔の特徴を取得できません'+(diagnostics.length?'：'+diagnostics[0]:''));
 return results;
}
start.addEventListener('click',async()=>{
 const files=[...queued];if(files.length<2){status.textContent='2枚以上の写真を選んでください。';return}
 if(files.length>100){status.textContent='試作版は一度に100枚までです。';return}
 stop=false;start.disabled=true;cancel.disabled=false;selected.clear();openedFolder=null;items=[];groups=[];groupNames.clear();invalidateAssignmentPreview();photoNames=files.map(f=>f.name);urls.forEach(URL.revokeObjectURL);urls=files.map(file=>URL.createObjectURL(file));photoUrls=[...urls];render();
 let session,human;
 const timings={model:0,decode:0,detectAndEmbed:0,detection:0,recognition:0,faces:0,group:0};const startedAt=performance.now();
 try{
  const modelStarted=performance.now();
  status.textContent='AIモデルを準備しています…';
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  const requestedGPU=false;
  const ort=await import(base+(requestedGPU?'ort.webgpu.min.mjs':'ort.min.mjs'));
  // Keep the WASM heap below iOS Safari's practical memory limits.
  ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;
  ort.env.wasm.simd=false;
  const selectedModel=lightweightModelFile?'lightweight':$('recognitionModel').value;
  let modelURL;
  if(selectedModel==='buffalo_s'){
   modelURL='https://huggingface.co/deepghs/insightface/resolve/main/buffalo_s/w600k_mbf.onnx';
   status.textContent='軽量ArcFace buffalo_sを準備中（約13.6MB）…';
  }else if(selectedModel==='lightweight'){
   modelURL=await lightweightModelFile.arrayBuffer();status.textContent='選択した軽量ONNXモデルを準備中…';
  }else if(selectedModel==='arcface'){
   // Recognition weights are downloaded only; images remain in the browser.
   modelURL='https://huggingface.co/globalnebula/insightface-buffalo-l-onnx/resolve/main/arcface_w600k_r50.onnx';
   status.textContent='研究用ArcFaceモデルを準備中（約174MB・初回は時間がかかります）…';
  }else{
   modelURL=new URL('./models/auraface-glintr100.onnx',import.meta.url).href;
   try{const r=await fetch(modelURL,{method:'HEAD'});if(!r.ok)throw Error('not found')}catch{modelURL='https://huggingface.co/fal/AuraFace-v1/resolve/main/glintr100.onnx'}
  }
  let executionProvider='wasm';
  if(requestedGPU){
   try{
    if(!navigator.gpu)throw Error('このブラウザはWebGPU非対応');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)throw Error('GPUアダプターが利用できません');
    session=await ort.InferenceSession.create(modelURL,{executionProviders:['webgpu','wasm']});
    executionProvider='webgpu（試験）';
   }catch(e){
    console.warn('WebGPUの初期化に失敗。WASMに切替',e);
    session=await ort.InferenceSession.create(modelURL,{executionProviders:['wasm']});
    executionProvider='wasm（GPU利用不可）';
   }
  }else {
   const sessionOptions={executionProviders:['wasm'],graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false};
   if(selectedModel==='lightweight'&&lightweightDataFile){
    const externalDataBytes=new Uint8Array(await lightweightDataFile.arrayBuffer());
    sessionOptions.externalData=[{path:'mobile_facenet.data',data:externalDataBytes}];
   }
   session=await ort.InferenceSession.create(modelURL,sessionOptions);
  }
  if(selectedModel==='lightweight'){
   if(!lightweightDataFile)status.textContent='⚠️ このモデルは mobile_facenet.data が必要です。ZIP内の追加データも選択してください。';
   if(session.inputNames.length!==1){
    throw Error('選択モデルは入力が'+session.inputNames.length+'個（'+session.inputNames.join('・')+'）です。顔2枚の比較用モデルの可能性があり、1枚ずつ特徴抽出する自動グループ化には未対応です。ArcFaceを選択してください。');
   }
   const inputName=session.inputNames[0],outputName=session.outputNames[0];
   const shape=session.inputMetadata?.[inputName]?.dimensions||session.inputMetadata?.[inputName]?.dims;
   const outputShape=session.outputMetadata?.[outputName]?.dimensions||session.outputMetadata?.[outputName]?.dims;
   if(Array.isArray(shape)&&shape.length===4&&
      ((Number.isInteger(shape[1])&&shape[1]!==3)||(Number.isInteger(shape[2])&&shape[2]!==112)||(Number.isInteger(shape[3])&&shape[3]!==112)))
     throw Error('このモデルの入力形状 '+JSON.stringify(shape)+' は現在の顔切り出し形式 [1,3,112,112] と一致しません。既存のArcFaceには影響しません。');
   status.textContent='軽量モデルの入力：'+JSON.stringify(shape||'不明')+' ／ 出力：'+JSON.stringify(outputShape||'不明')+'。解析を開始します…';
  }
  const mod=await import('./human.esm.js'),Human=mod.Human||mod.default;
  human=new Human({backend:'webgl',modelBasePath:new URL('./models/',import.meta.url).href,face:{enabled:true,detector:{enabled:true,maxDetected:20},mesh:{enabled:true},description:{enabled:false},iris:{enabled:false},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:false}},body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
  await human.load();timings.model=performance.now()-modelStarted;const failed=[],diagnostics=[];
  for(let i=0;i<files.length;i++){
   if(stop)break;status.textContent='解析中 '+(i+1)+' / '+files.length+'枚';
   let bitmap;try{
    const decodeStart=performance.now();bitmap=await createImageBitmap(files[i]);timings.decode+=performance.now()-decodeStart;
    const embedStart=performance.now();const detected=await embed(bitmap,human,session,ort,timings,diagnostics,$('flipAugment')?.checked===true);timings.detectAndEmbed+=performance.now()-embedStart;
    for(let faceIndex=0;faceIndex<detected.length;faceIndex++){
     const {vector,thumbnail,alignedThumbnail,faceSize,faceQuality}=detected[faceIndex];
     items.push({name:files[i].name+'（顔'+(faceIndex+1)+'）',sourcePhoto:i,url:thumbnail,alignedThumbnail,faceSize,faceQuality,vector});
    }
   }catch(e){failed.push((i+1)+'枚目: '+String(e?.message||e).slice(0,65))}finally{bitmap?.close()}
   await new Promise(r=>setTimeout(r,0));
  }
  if(stop){status.textContent='⏹ 中断しました。アルバムへの変更はありません。';return}
  const groupingStart=performance.now();
  const threshold=selectedModel==='lightweight'?0.70:Number($('threshold').value);
  const pairScores=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const score=similarity(items[i].vector,items[j].vector);
   if(Number.isFinite(score))pairScores.push({i,j,score});
  }
  pairScores.sort((a,b)=>b.score-a.score);
  groups=[{id:'unknown',members:[]}];let next=1;
  // DBSCAN: density-based face-embedding clustering, with singleton noise
  // retained as separate provisional groups for teacher review.
  const scoreMap=new Map(pairScores.map(p=>[p.i+':'+p.j,p.score]));
  const pairScore=(i,j)=>i===j?1:scoreMap.get(Math.min(i,j)+':'+Math.max(i,j));
  // Complete-link grouping: an incoming face must match EVERY existing member.
  // This avoids DBSCAN chaining across lookalike children through one pose-matched pair.
  const neighbors=items.map((_,i)=>items.map((_,j)=>j).filter(j=>pairScore(i,j)>=threshold));
  const labels=new Int32Array(items.length).fill(-2); // -2 unvisited, -1 noise
  let clusterId=0;
  const minPts=2;
  for(let i=0;i<items.length;i++){
   if(labels[i]!==-2)continue;
   if(neighbors[i].length<minPts){labels[i]=-1;continue}
   const id=clusterId++;labels[i]=id;
   const queue=[...neighbors[i]],queuedNeighbors=new Set(queue);
   for(let head=0;head<queue.length;head++){
    const j=queue[head];
    if(labels[j]===-1)labels[j]=id;
    if(labels[j]!==-2)continue;
    labels[j]=id;
    if(neighbors[j].length>=minPts)for(const k of neighbors[j]){
     if(!queuedNeighbors.has(k)){queuedNeighbors.add(k);queue.push(k)}
    }
   }
  }
  const clustered=new Map();
  for(let i=0;i<items.length;i++){
   if(labels[i]<0)continue;
   if(!clustered.has(labels[i]))clustered.set(labels[i],[]);
   clustered.get(labels[i]).push(i);
  }
  // Split transitive DBSCAN chains before any secondary merge.
  // Within each provisional identity, require pairwise agreement rather than
  // allowing a single similar-looking bridge to connect two different children.
  const completeLinkSplit=members=>{
   const ordered=[...members].sort((a,b)=>{
    const quality=id=>members.reduce((total,other)=>total+(pairScore(id,other)||0),0);
    return quality(b)-quality(a);
   });
   const parts=[];
   for(const id of ordered){
    const candidates=parts.map((part,k)=>({k,min:Math.min(...part.map(other=>pairScore(id,other)))}))
      .filter(candidate=>candidate.min>=threshold)
      .sort((a,b)=>b.min-a.min);
    if(candidates.length)parts[candidates[0].k].push(id);
    else parts.push([id]);
   }
   return parts;
  };
  for(const members of clustered.values())for(const part of completeLinkSplit(members))groups.push({id:String(next++),members:part});
  for(let i=0;i<items.length;i++)if(labels[i]<0)groups.push({id:String(next++),members:[i]});
  // A face pair from the same photo must never be in one identity group.
  // Unlike a nearest-neighbor edge, this cannot-link rule survives transitive merges.
  const splitSamePhotoConflicts=()=>{
   const repaired=[groups[0]];
   for(const group of groups.slice(1)){
    const buckets=[];
    for(const id of group.members){
     let bucket=buckets.find(bucket=>bucket.every(other=>items[other].sourcePhoto!==items[id].sourcePhoto));
     if(!bucket){bucket=[];buckets.push(bucket)}
     bucket.push(id);
    }
    for(const bucket of buckets)repaired.push({id:String(repaired.length),members:bucket});
   }
   groups=repaired;
  };
  splitSamePhotoConflicts();
  // Conservative second pass: merge fragmented clusters only when all cross-cluster
  // faces remain similar. Never merge simply to match the roster headcount.
  let merged=true;
  while(merged){
   merged=false;let best=null;
   for(let a=1;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
    const ga=groups[a],gb=groups[b];if(!ga.members.length||!gb.members.length)continue;
    // Never combine two faces from one source photo, even during later passes.
    const photos=new Set(ga.members.map(i=>items[i].sourcePhoto));
    if(gb.members.some(i=>photos.has(items[i].sourcePhoto)))continue;
    const cross=ga.members.flatMap(i=>gb.members.map(j=>pairScore(i,j)));
    if(cross.some(v=>!Number.isFinite(v)))continue;
    const minimum=Math.min(...cross),average=cross.reduce((sum,v)=>sum+v,0)/cross.length;
    if(minimum<Math.max(0.48,threshold-0.12)||average<Math.max(0.62,threshold-0.02))continue;
    if(!best||average>best.average)best={a,b,average};
   }
   if(best){
    groups[best.a].members.push(...groups[best.b].members);
    groups.splice(best.b,1);merged=true;
   }
  }

  timings.group=performance.now()-groupingStart;
  const seconds=ms=>(ms/1000).toFixed(1)+'秒';
  const perfReport='\n⚙️ 実行方式：'+executionProvider+'\n⏱ 計測：AI準備 '+seconds(timings.model)+' ／ 写真読み込み '+seconds(timings.decode)+' ／ 顔検出＋特徴解析 '+seconds(timings.detectAndEmbed)+'（うち顔検出 '+seconds(timings.detection)+'・AI特徴抽出 '+seconds(timings.recognition)+'／'+timings.faces+'顔） ／ グループ化 '+seconds(timings.group)+' ／ 合計 '+seconds(performance.now()-startedAt)+'（この端末での実測）';
  status.textContent='✅ '+files.length+'枚中'+(files.length-failed.length)+'枚解析・顔'+items.length+'件・仮グループ '+(groups.length-1)+'件（'+(selectedModel==='lightweight'?'軽量ONNX比較（暫定閾値0.70）':selectedModel==='arcface'?'ArcFace':selectedModel==='buffalo_s'?'ArcFace buffalo_s（軽量・試験）':'AuraFace')+'・DBSCAN）。失敗 '+failed.length+'枚。\n※自動判定は誤り得ます。先生が確認してください。\n'+failed.slice(0,12).join(' ／ ');
  if(diagnostics.length)status.textContent+='\n🔍 AIモデル詳細：'+[...new Set(diagnostics)].join(' ／ ');
  status.textContent+=perfReport;
  const old=$('pairDiagnostics');if(old)old.remove();
  const diagnostic=document.createElement('section');diagnostic.id='pairDiagnostics';diagnostic.className='panel';
  const heading=document.createElement('h2');heading.textContent='🔎 顔の比較値（高い順・上位20組）';diagnostic.append(heading);
  const info=document.createElement('p');info.className='muted';info.textContent='比較値は正解率ではありません。高いほど似ている傾向ですが、同一人物を保証しません。写真・比較値は保存しません。';diagnostic.append(info);
  for(const pair of pairScores.slice(0,20)){
   const row=document.createElement('p');row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #e8edf3;padding-bottom:8px';
   for(const id of [pair.i,pair.j]){const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.style.cssText='width:58px;height:58px;object-fit:cover;border-radius:8px';row.append(img)}
   const score=document.createElement('strong');score.textContent='比較値 '+pair.score.toFixed(4)+(pair.score>=threshold?'（基準以上）':'（基準未満）');row.append(score);diagnostic.append(row);
  }
  const refreshGroupPairs=()=>{
  const old=diagnostic.querySelector('#clusterMergeCandidates');if(old)old.remove();
  const host=document.createElement('div');host.id='clusterMergeCandidates';diagnostic.append(host);
  const groupPairs=[];
  for(let a=1;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
   const left=groups[a].members,right=groups[b].members;
   if(!left.length||!right.length||hasExcludedPair(groups[a],groups[b]))continue;
   const cross=left.flatMap(i=>right.map(j=>pairScore(i,j))).filter(Number.isFinite);
   if(!cross.length)continue;
   const maximum=Math.max(...cross),minimum=Math.min(...cross),average=cross.reduce((sum,v)=>sum+v,0)/cross.length;
   const samePhoto=left.some(i=>right.some(j=>items[i].sourcePhoto===items[j].sourcePhoto));
   const smallFaces=[...left,...right].filter(i=>items[i].faceQuality==='小さい顔・要確認').length;
   const support=cross.filter(score=>score>=Number($('threshold').value)).length;
   groupPairs.push({a,b,maximum,minimum,average,samePhoto,smallFaces,support,total:cross.length});
  }
  // A single high-scoring face pair is insufficient evidence to recommend
  // merging two clusters. Prioritize broad agreement across both groups.
  groupPairs.sort((x,y)=>(y.average*0.65+y.minimum*0.35)-(x.average*0.65+x.minimum*0.35));
  const likely=groupPairs.filter(p=>!p.samePhoto&&p.minimum>=0.48&&p.average>=0.55&&p.maximum>=0.60);
  const distribution=document.createElement('p');distribution.className='muted';
  const sizes=groups.slice(1).map(g=>g.members.length);
  const singleton=sizes.filter(n=>n===1).length;
  const multi=sizes.filter(n=>n>1).length;
  const smallFaces=items.filter(item=>item.faceQuality==='小さい顔・要確認').length;
  distribution.textContent='📊 分割状況：単独顔グループ '+singleton+'件 ／ 複数顔グループ '+multi+'件 ／ 小さい顔 '+smallFaces+'件（除外なし）';
  host.append(distribution);
  const eligible=groupPairs.filter(p=>!p.samePhoto&&p.minimum>=0.48&&p.average>=0.55&&p.maximum>=0.60);
  // Suggest only mutually unique matches with multiple independent supporting
  // face comparisons. This is a read-only preview, never an automatic merge.
  const safeCandidates=eligible.filter(p=>{
   if(p.total<2||p.support<2||p.support/p.total<0.5)return false;
   // Multiple comparisons of faces from one photo are not independent evidence.
   const leftPhotos=new Set(groups[p.a].members.map(i=>items[i].sourcePhoto));
   const rightPhotos=new Set(groups[p.b].members.map(i=>items[i].sourcePhoto));
   if(leftPhotos.size<2&&rightPhotos.size<2)return false;
   if(p.smallFaces>0&&p.minimum<0.58)return false;
   const rivals=eligible.filter(q=>q!==p&&(q.a===p.a||q.b===p.a||q.a===p.b||q.b===p.b));
   return rivals.every(q=>p.average-q.average>=0.09);
  });
  const safeNote=document.createElement('p');safeNote.className='muted';
  safeNote.textContent='🛡️ 複数の顔で一致し、競合が少ない統合候補：'+safeCandidates.length+'組（提案のみ・自動統合なし）';
  host.append(safeNote);
  const ambiguous=eligible.filter(p=>eligible.some(q=>q!==p&&(q.a===p.a||q.b===p.a||q.a===p.b||q.b===p.b)&&Math.abs(q.average-p.average)<0.07)).length;
  const caution=document.createElement('p');caution.className='muted';
  caution.textContent='🔎 統合候補 '+eligible.length+'組 ／ 似た候補が競合する組 '+ambiguous+'組。競合は別の園児の可能性があるため自動統合しません。';
  host.append(caution);
  const heading2=document.createElement('h3');heading2.textContent='🧩 分かれたグループの類似候補（上位15組）';host.append(heading2);
  const guide=document.createElement('p');guide.className='muted';guide.textContent='最大値だけで判断せず、グループ全体の平均・最小値も確認します。条件に合わない組は統合候補に表示しません。候補も正解保証ではありません。';host.append(guide);
  for(const pair of [...safeCandidates,...likely.filter(p=>!safeCandidates.includes(p))].slice(0,15)){
   const row=document.createElement('div');row.style.cssText='padding:10px 0;border-bottom:1px solid #e8edf3';
   const title=document.createElement('strong');title.textContent='グループ '+groups[pair.a].id+' ↔ '+groups[pair.b].id+' ／ 最大 '+pair.maximum.toFixed(3)+'・平均 '+pair.average.toFixed(3)+'・最小 '+pair.minimum.toFixed(3);row.append(title);
   const evidenceLine=document.createElement('p');evidenceLine.className='muted';
   evidenceLine.textContent='基準以上の一致 '+pair.support+'/'+pair.total+'組 ／ 小さい顔 '+pair.smallFaces+'件'+(safeCandidates.includes(pair)?' ／ 🛡️ 複数写真で裏付け':'');
   row.append(evidenceLine);
   const faces=document.createElement('div');faces.className='faces';
   for(const id of [...groups[pair.a].members.slice(0,3),...groups[pair.b].members.slice(0,3)]){
    const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.className='face';faces.append(img);
   }
   row.append(faces);
   const merge=document.createElement('button');merge.type='button';merge.className='secondary';merge.textContent='この2グループを統合';
   const firstId=groups[pair.a].id,secondId=groups[pair.b].id;
   merge.addEventListener('click',()=>{
    const first=groups.find(g=>g.id===firstId),second=groups.find(g=>g.id===secondId);
    if(!first||!second||first===second||hasExcludedPair(first,second)){refreshGroupPairs();return;}
    if(!window.confirm('顔写真を確認しましたか？ この2グループを1つにまとめます（アルバムデータは変更しません）。'))return;
    first.members.push(...second.members);
    groups=groups.filter(g=>g!==second);
    if(!groupNames.has(first.id)&&groupNames.has(second.id))groupNames.set(first.id,groupNames.get(second.id));
    groupNames.delete(second.id);selected.clear();invalidateAssignmentPreview();render();
    refreshGroupPairs();
    status.textContent+='\n✅ グループ '+firstId+' と '+secondId+' を手動統合しました。';
   });
   row.append(merge);
   const reject=document.createElement('button');reject.type='button';reject.className='secondary';reject.textContent='違う園児（候補から除外）';
   reject.addEventListener('click',()=>{
    const first=groups.find(g=>g.id===firstId),second=groups.find(g=>g.id===secondId);
    if(!first||!second)return;
    for(const i of first.members)for(const j of second.members)excludedFacePairs.add(facePairKey(i,j));
    refreshGroupPairs();
   });
   row.append(reject);host.append(row);
  }
  };
  refreshGroupPairs();
  const breakdown=document.createElement('details');
  const summary=document.createElement('summary');summary.textContent='🧪 統合されない理由を確認（顔ごとの比較）';breakdown.append(summary);
  const note=document.createElement('p');note.className='muted';note.textContent='別グループ間で最も似ている顔の組を表示します。比較値は正解率ではありません。';breakdown.append(note);
  const candidates=[];
  for(let a=1;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
   if(!groups[a].members.length||!groups[b].members.length)continue;
   let best=null;
   for(const i of groups[a].members)for(const j of groups[b].members){
    const score=pairScore(i,j);
    if(Number.isFinite(score)&&(!best||score>best.score))best={i,j,score,a,b};
   }
   if(best)candidates.push(best);
  }
  candidates.sort((a,b)=>b.score-a.score);
  for(const c of candidates.slice(0,12)){
   const row=document.createElement('div');row.style.cssText='border-bottom:1px solid #e8edf3;padding:8px 0';
   const title=document.createElement('div');title.textContent='グループ '+groups[c.a].id+' ↔ '+groups[c.b].id+'：最も似た顔 '+c.score.toFixed(3);row.append(title);
   for(const id of [c.i,c.j]){
    const img=document.createElement('img');img.src=items[id].url;img.alt=items[id].name;img.title=items[id].name;img.style.cssText='width:72px;height:72px;object-fit:cover;border-radius:8px;margin:5px';row.append(img);
   }
   breakdown.append(row);
  }
  diagnostic.append(breakdown);
  const alignment=document.createElement('details');
  const alignmentTitle=document.createElement('summary');alignmentTitle.textContent='📐 AIが実際に比較した顔画像（位置合わせ確認）';alignment.append(alignmentTitle);
  const alignmentNote=document.createElement('p');alignmentNote.className='muted';alignmentNote.textContent='左が元写真の顔、右がAIに入力した112×112の補正画像。顔の上下・傾き・左右の目の位置にズレがないか確認します。画像は端末内の一時データで、保存・送信しません。';alignment.append(alignmentNote);
  for(const [index,item] of items.entries()){
   if(!item.alignedThumbnail)continue;
   const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #e8edf3';
   const label=document.createElement('span');label.textContent='顔'+(index+1)+' ／ '+(item.faceQuality||'不明')+(item.faceSize!=null?'（'+Math.round(item.faceSize)+'px）':'');row.append(label);
   for(const src of [item.url,item.alignedThumbnail]){
    const img=document.createElement('img');img.src=src;img.alt='顔の切り抜き比較';img.style.cssText='width:84px;height:84px;object-fit:cover;border-radius:8px';row.append(img);
   }
   alignment.append(row);
  }
  diagnostic.append(alignment);

  groupsHost.closest('section').after(diagnostic);
  render();
 }catch(e){status.textContent='⚠️ 解析できません: '+String(e?.message||e).slice(0,220)}
 finally{try{await session?.release()}catch{}try{await human?.dispose?.()}catch{}start.disabled=false;cancel.disabled=true}
});
window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
