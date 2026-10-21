import {groupFacesWithEvidence} from './face-group-evidence.mjs?v=20261021v2';
import {buildTeacherSeedGroups,suggestTeacherSeedPairs,suggestUnassignedFacePairs} from './teacher-seed-matches.mjs?v=20261021s2';
import {buildVerifiedPhotoFolders} from './teacher-verified-folders.mjs?v=20261021f1';
import {buildNamedFolderPreview,verifiedFolderKey} from './teacher-folder-names.mjs?v=20261022-photo-edit';
import {transferPhotoFolderCorrection,trimPhotoFolderCorrections,photoFolderCorrectionsAsRows,correctedPhotoIndexes} from './photo-folder-corrections.mjs?v=20261022-photo-edit';
import {composeVisibleChildFolders,validateNewPhotoFolderName} from './photo-folder-visibility.mjs?v=20261021x1';
import {FACE_DRAFT_SCHEMA,validateFaceDraft,saveFaceDraft,loadFaceDraft,faceDraftInfo,deleteFaceDraft} from './face-draft-storage.mjs?v=20261022-an';
import {auditPhotoAssignments} from './final-photo-audit.mjs?v=20261021-aj';
import {checkFinalizationReadiness,createProvisionalFinalization} from './provisional-photo-finalization.mjs?v=20261022-an';
import {bindProvisionalApprovalUi} from './provisional-approval-ui.mjs?v=20261022-al';
import {bindAlbumPhotoHandoffUi} from './album-photo-handoff-ui.mjs?v=20261022-an';
import {bindPhotoOriginalReviewUi} from './photo-original-review-ui.mjs?v=20261022-an';
// Standalone research prototype. Writes ONLY to its isolated IndexedDB when the user explicitly chooses Save; never alters production album storage.
const $=id=>document.getElementById(id);
// The alternate inference is a Mac research step, not an iPhone default.
if(/iPhone|iPad|Android/i.test(navigator.userAgent)){const option=$('compareEyelidAlignment');if(option)option.checked=false;}

const input=$('photos'),start=$('start'),cancel=$('cancel'),status=$('status'),groupsHost=$('groups'),destination=$('destination'),move=$('move'),selection=$('selection');
let stop=false,items=[],groups=[],selected=new Set(),urls=[],photoNames=[],photoUrls=[];
const groupNames=new Map();
let openedFolder=null;
let initialGroupCount=null,initialCandidateCount=null,currentCandidateCount=null,manualMergeCount=0;
function updateGroupProgress(){
 const host=$('groupProgress');if(!host)return;
 if(initialGroupCount===null){host.textContent='';return}
 const current=groups.filter(g=>g.id!=='unknown'&&g.members.length).length;
 const candidates=initialCandidateCount===null?'計算中':initialCandidateCount+'組 → '+(currentCandidateCount??0)+'組';
 host.textContent='📊 グループ：解析直後 '+initialGroupCount+'件 → 現在 '+current+'件（手動統合 '+manualMergeCount+'回） ／ 統合候補：'+candidates;
}

// Teacher-verified comparisons only; cleared every time a new photo batch starts.
// Photos, vectors and review labels stay in memory unless the user explicitly saves them to isolated local IndexedDB. Never send them off-device.
const verifiedFacePairs=new Map();
// At most one reversible correction; never changes saved albums or AI clusters.
let lastFolderCorrection=null,folderCorrectionNoticeText='';
const faceReviewSignature=()=>JSON.stringify(
 [...verifiedFacePairs.entries()].map(([key,p])=>key+':'+String(p.same)).sort()
);
$('undoFolderCorrection')?.addEventListener('click',()=>{
 const notice=$('folderCorrectionNotice');
 if(!lastFolderCorrection||lastFolderCorrection.afterSignature!==faceReviewSignature()){
  if(notice){notice.hidden=false;notice.textContent='ほかの確認が変更されたため、この訂正を一括で戻せません。各顔の確認履歴から修正してください。';}
  lastFolderCorrection=null;
  return;
 }
 const original=lastFolderCorrection.before;
 verifiedFacePairs.clear();
 for(const [key,pair] of original)verifiedFacePairs.set(key,{...pair});
 lastFolderCorrection=null;
 folderCorrectionNoticeText='↩ 直前の「違う園児」への訂正を戻しました。写真とアルバムは変更していません。';
 renderFaceEvaluation();
});
let selectedReviewFaces=[];
let initialFaceGroups=[];
let refreshGroupPairsUI=()=>{};
let lastVerifiedGroupSnapshot=null,alternativeGrouping=null,evidenceVariants=null;
let r50Compared=false,r50CompareRunning=false;
function clearVerifiedMergeUndo(){lastVerifiedGroupSnapshot=null;const el=$('undoVerifiedGroups');if(el)el.disabled=true;}


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
 for(const [photoIndex,names] of manualPhotoAssignments){
  if(!Number.isInteger(photoIndex)||photoIndex<0||photoIndex>=photoNames.length)continue;
  for(const name of names){
   if(!name)continue;
   if(!byName.has(name))byName.set(name,new Set());
   byName.get(name).add(photoIndex);
  }
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
// Teacher-name associations are only held in RAM; never written to a real album.
const verifiedRosterClass=$('verifiedFolderRosterClass');
for(const [id,name] of rosterClasses){
 const option=document.createElement('option');option.value=id;option.textContent=name;
 verifiedRosterClass?.append(option);
}
if(verifiedRosterClass)verifiedRosterClass.value=classSelect.value;
const verifiedFolderNames=new Map();
// Preview-only exclusions and new folders never delete a source image,
// modify verified face-pairs, or write to album storage.
const excludedVerifiedFolders=new Set();
const newManualPhotoFolders=new Map();
let manualFolderSequence=0,folderManagementNotice='';
let verifiedRosterScope='',folderNameStatus='';
function folderRosterSignature(){
 return classSelect.value+'::'+roster.map(k=>String(k.id)+':'+String(k.name)).sort().join('|');
}
function reconcileVerifiedRoster(){
 const next=roster.length?folderRosterSignature():'';
 if(verifiedRosterScope!==next){
  verifiedFolderNames.clear();
  folderNameStatus=verifiedRosterScope?'⚠️ 名簿が変わったため、以前の園児名の仮指定は解除しました。':'';
  verifiedRosterScope=next;
 }
 const status=$('verifiedFolderRosterStatus');
 if(status)status.textContent=roster.length?
  '✅ '+roster.length+'名を参照中（この画面内だけ）。'+folderNameStatus:
  '園児名簿が読み込まれていません。クラス名簿を読み込むか、一時入力を使ってね。';
}
verifiedRosterClass?.addEventListener('change',()=>{
 if(verifiedRosterClass.value!==classSelect.value){
  classSelect.value=verifiedRosterClass.value;
  classSelect.dispatchEvent(new Event('change'));
 }
});
$('loadVerifiedFolderRoster')?.addEventListener('click',()=>{
 if(verifiedRosterClass?.value!==classSelect.value){
  classSelect.value=verifiedRosterClass.value;
  classSelect.dispatchEvent(new Event('change'));
 }
 $('loadRoster').click();
});
$('useVerifiedFolderManualNames')?.addEventListener('click',()=>{
 const input=$('verifiedFolderManualNames');
 const names=(input?.value||'').split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
 const unique=[...new Set(names)];
 const status=$('verifiedFolderRosterStatus');
 if(!unique.length){
  if(status)status.textContent='⚠️ 名前を1行に1名ずつ入力してね。まだ変更していません。';
  return;
 }
 if(unique.length>100){
  if(status)status.textContent='⚠️ 一度に登録できる仮名簿は100名までです。';
  return;
 }
 roster=unique.map((name,index)=>({id:'preview-'+classSelect.value+'-'+index,name}));
 reconcileVerifiedRoster();
 if(status)status.textContent='✅ 一時名簿 '+unique.length+'名を使用中。保存・送信はしません。';
 const editorStatus=$('rosterStatus');if(editorStatus)editorStatus.textContent='画面内の一時名簿 '+unique.length+'名を使用中（登録済み名簿は未変更）';
 renderFaceEvaluation();
});

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
 try{
  roster=readRegisteredChildren();
  reconcileVerifiedRoster();
  $('rosterStatus').textContent=roster.length+'名を参照読み込みしました（端末内の登録データは未変更）。';
  render();
 }catch(e){
  roster=[];reconcileVerifiedRoster();
  $('rosterStatus').textContent='読み込めませんでした：'+String(e.message||e);
  render();
 }
});
classSelect.addEventListener('change',()=>{
 roster=[];
 if(verifiedRosterClass)verifiedRosterClass.value=classSelect.value;
 reconcileVerifiedRoster();
 $('rosterStatus').textContent='クラスを変更しました。「登録済み園児を読み込む」を押してください。';
 render();
});

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
function calculateFaceGroups(threshold){
 const clusterPairScores=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const score=similarity(items[i].vector,items[j].vector);
  if(Number.isFinite(score))clusterPairScores.push({i,j,score});
 }
 clusterPairScores.sort((a,b)=>b.score-a.score);
  groups=[{id:'unknown',members:[]}];let next=1;
  // DBSCAN: density-based face-embedding clustering, with singleton noise
  // retained as separate provisional groups for teacher review.
  const scoreMap=new Map(clusterPairScores.map(p=>[p.i+':'+p.j,p.score]));
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
      .filter(candidate=>parts[candidate.k].every(other=>items[other].sourcePhoto!==items[id].sourcePhoto))
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
  // Do not automatically merge singleton groups from similarity alone.
  // A previously observed different-child pair scored higher than several
  // confirmed same-child pairs. Leave uncertain identities for review.
  // A pair of different children can score above the threshold.
  // Do not let a single face-to-face edge create a confirmed two-face
  // identity unless other photographs corroborate it independently.
  const requireIndependentEvidence=()=>{
   const repaired=[groups[0]];
   for(const group of groups.slice(1)){
    if(group.members.length!==2){repaired.push(group);continue}
    const [left,right]=group.members;
    const corroborated=items.some((_,k)=>k!==left&&k!==right&&
     items[k].sourcePhoto!==items[left].sourcePhoto&&
     items[k].sourcePhoto!==items[right].sourcePhoto&&
     pairScore(left,k)>=Math.max(0.60,threshold-0.05)&&
     pairScore(right,k)>=Math.max(0.60,threshold-0.05));
    const own=pairScore(left,right);
    const alternatives=items.map((_,k)=>k).filter(k=>k!==left&&k!==right)
     .filter(k=>items[k].sourcePhoto!==items[left].sourcePhoto&&items[k].sourcePhoto!==items[right].sourcePhoto)
     .flatMap(k=>[pairScore(left,k),pairScore(right,k)]).filter(Number.isFinite);
    const strongestAlternative=alternatives.length?Math.max(...alternatives):-1;
    // Split only ambiguous two-face pairs; preserve strong unambiguous
    // pairs even when the child appears in just two photographs.
    const ambiguous=!corroborated&&(
     own<Math.max(0.70,threshold+0.05)||
     own-strongestAlternative<0.08
    );
    if(!ambiguous)repaired.push(group);
    else{
     repaired.push({id:group.id,members:[left]});
     repaired.push({id:String(next++),members:[right]});
    }
   }
   groups=repaired;
  };
  requireIndependentEvidence();
  // No secondary similarity-only merges: teacher confirmation remains
  // necessary for pairs without independent evidence.

 // Final invariant: never display two detected faces from the same
 // source photo inside a single provisional identity group.
 const safeGroups=[groups[0]];
 let repairedSamePhotoPairs=0;
 for(const group of groups.slice(1)){
  const partitions=[];
  for(const id of group.members){
   let part=partitions.find(part=>part.every(other=>items[other].sourcePhoto!==items[id].sourcePhoto));
   if(!part){part=[];partitions.push(part)}
   part.push(id);
  }
  if(partitions.length>1)repairedSamePhotoPairs+=partitions.length-1;
  for(const members of partitions)safeGroups.push({id:group.id,members});
 }
 groups=safeGroups;
 if(repairedSamePhotoPairs)console.warn('Same-photo face groups repaired:',repairedSamePhotoPairs);
 // Renumber after merging. Earlier numeric gaps made 18 actual groups
 // appear to be 20 when the last displayed candidate ID was 20.
 groups=groups.filter((g,index)=>index===0||g.members.length>0);
 groups.slice(1).forEach((g,index)=>{g.id=String(index+1)});

 return groups;
}
// Pair comparison shared by grouping diagnostics and manual review.
// Recompute from in-memory vectors so it never depends on a local cluster scope.
function pairScore(i,j){
 if(i===j)return 1;
 if(!items[i]?.vector||!items[j]?.vector)return NaN;
 return similarity(items[i].vector,items[j].vector);
}
function regroupFromExistingVectors(threshold){
 if(!items.length)return;
 groups=calculateFaceGroups(threshold);
 evidenceVariants=null;alternativeGrouping=null;lastVerifiedGroupSnapshot=null;const undoVerified=$('undoVerifiedGroups');if(undoVerified)undoVerified.disabled=true;
 groupNames.clear();selected.clear();openedFolder=null;invalidateAssignmentPreview();render();
 refreshGroupPairsUI();
 // The original AI grouping remains the baseline for verified teacher feedback.

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
 clearVerifiedMergeUndo();
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
// In-memory manual photo links; never writes to albums or photo storage.
const manualPhotoAssignments=new Map();
// Preview-only: missing-face photo index -> stable, face-based folder keys.
// This never writes to the album and intentionally does not use folder numbers.
const manualPhotoFolderChoices=new Map();
const photoFolderCorrections=new Map();
let photoOriginalReviewUi={open:()=>false},lastPhotoCorrectionUndo=null;
function renderManualPhotos(){
 const host=$('manualPhotoAssignments');if(!host)return;
 host.replaceChildren();
 const hasUndetected=photoNames.some((_,i)=>!items.some(item=>item.sourcePhoto===i));
 const area=$('manualPhotoArea');if(area)area.hidden=!hasUndetected;
 for(let i=0;i<photoNames.length;i++){
  if(items.some(item=>item.sourcePhoto===i))continue;
  const row=document.createElement('div');row.style.cssText='padding:12px 0;border-bottom:1px solid #e5ebf2';
  const title=document.createElement('strong');title.textContent=(i+1)+'枚目：'+photoNames[i]+'（顔未検出）';row.append(title);
  if(urls[i]){const img=document.createElement('img');img.src=urls[i];img.alt='顔未検出の写真';img.style.cssText='display:block;max-width:180px;max-height:140px;object-fit:contain;margin:8px 0;border-radius:8px';row.append(img)}
  const assigned=manualPhotoAssignments.get(i)||new Set();
  const choices=document.createElement('div');choices.className='actions';
  for(const kid of roster){
   const label=document.createElement('label');label.style.cssText='border:1px solid #dbe2ed;padding:5px 8px;border-radius:8px';
   const check=document.createElement('input');check.type='checkbox';check.checked=assigned.has(String(kid.name||kid.displayName||kid.label||''));
   check.addEventListener('change',()=>{
    const next=new Set(manualPhotoAssignments.get(i)||[]);
    if(check.checked)next.add(String(kid.name||kid.displayName||kid.label||''));else next.delete(String(kid.name||kid.displayName||kid.label||''));
    if(next.size)manualPhotoAssignments.set(i,next);else manualPhotoAssignments.delete(i);
    invalidateAssignmentPreview();
   });
   label.append(check,document.createTextNode(' '+String(kid.name||kid.displayName||kid.label||'')));choices.append(label);
  }
  if(!roster.length){const hint=document.createElement('p');hint.className='muted';hint.textContent='先に「登録済み園児を読み込む」を押してください。';choices.append(hint)}
  row.append(choices);host.append(row);
 }
}


// Re-map a verification report by source photo, not by global face index:
// face detection order and total counts can change between iPhone and Mac.
let pendingFaceImport=[];
function renderPendingFaceImport(){
 const host=$('faceEvaluationImportReview');
 if(!host)return;
 host.replaceChildren();
 if(!pendingFaceImport.length)return;
 const header=document.createElement('p');
 header.className='muted';
 header.textContent='🔎 手動確認が必要：'+pendingFaceImport.length+'組。以前の顔番号は別端末では変わることがあるため、写真を見て今回検出された顔を選んでください。';
 host.append(header);
 for(const entry of [...pendingFaceImport]){
  const panel=document.createElement('div');
  panel.style.cssText='border:1px solid #dbe2ed;border-radius:12px;padding:10px;margin:10px 0';
  const heading=document.createElement('strong');
  heading.textContent='前回：顔'+entry.oldLeft+'（写真'+(entry.photoA+1)+'） ↔ 顔'+entry.oldRight+'（写真'+(entry.photoB+1)+'）／'+(entry.same?'同じ園児':'違う園児')+' ／ 比較値 '+entry.oldScore.toFixed(4);
  panel.append(heading);
  const choices=document.createElement('div');
  choices.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:10px 0';
  for(const side of ['left','right']){
   const photo=side==='left'?entry.photoA:entry.photoB;
   const target=side==='left'?'selectedLeft':'selectedRight';
   const box=document.createElement('div');
   const title=document.createElement('p');title.className='muted';title.textContent='写真'+(photo+1)+'：今回検出した顔を選択';box.append(title);
   const list=document.createElement('div');list.className='faces';
   const candidates=items.map((item,i)=>item.sourcePhoto===photo?i:-1).filter(i=>i>=0);
   for(const id of candidates){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.style.cssText='padding:5px;border:2px solid '+(entry[target]===id?'#176ad6':'transparent')+';color:#263344;min-width:70px';
    button.setAttribute('aria-pressed',String(entry[target]===id));
    const img=document.createElement('img');img.src=items[id].url;img.alt='写真'+(photo+1)+'の顔'+(id+1);
    img.style.cssText='display:block;width:58px;height:58px;object-fit:cover;border-radius:8px';
    const label=document.createElement('span');label.textContent='顔'+(id+1);label.style.fontSize='11px';
    button.append(img,label);
    button.addEventListener('click',()=>{entry[target]=id;renderPendingFaceImport()});
    list.append(button);
   }
   if(!candidates.length){
    const warning=document.createElement('p');warning.className='muted';
    warning.textContent='今回この写真から顔を検出できません。顔が見つからない写真は手動振り分けで対応してください。';
    box.append(warning);
   }
   box.append(list);choices.append(box);
  }
  panel.append(choices);
  const canConfirm=entry.selectedLeft!=null&&entry.selectedRight!=null&&
    entry.selectedLeft!==entry.selectedRight&&
    (!entry.same||items[entry.selectedLeft].sourcePhoto!==items[entry.selectedRight].sourcePhoto);
  if(canConfirm){
   const actual=pairScore(entry.selectedLeft,entry.selectedRight);
   const message=document.createElement('p');message.className='muted';
   message.textContent='現在の比較値 '+(Number.isFinite(actual)?actual.toFixed(4):'取得不可')+' ／ 前回との差 '+(Number.isFinite(actual)?Math.abs(actual-entry.oldScore).toFixed(4):'不明')+'。数値が違う場合は顔写真を優先して目視確認してください。';
   panel.append(message);
  }
  const confirm=document.createElement('button');confirm.type='button';
  confirm.textContent='この2つの顔で確認結果を登録';
  confirm.disabled=!canConfirm;
  confirm.addEventListener('click',()=>{
   const i=entry.selectedLeft,j=entry.selectedRight,score=pairScore(i,j);
   if(!Number.isFinite(score)){const out=$('faceEvaluationMessage');if(out)out.textContent='⚠️ 今回の比較値が取得できません。';return}
   if(Math.abs(score-entry.oldScore)>0.035&&
      !window.confirm('前回と顔の比較値が異なります。写真を見て同じ顔だと確認しましたか？')){
    return;
   }
   verifiedFacePairs.set(facePairKey(i,j),{i,j,same:entry.same});
   pendingFaceImport=pendingFaceImport.filter(p=>p!==entry);
   renderFaceEvaluation();renderPendingFaceImport();
   const out=$('faceEvaluationMessage');
   if(out)out.textContent='✅ 先生の判定を登録しました。残り '+pendingFaceImport.length+'組。グループの配置は変更していません。';
  });
  panel.append(confirm);host.append(panel);
 }
}
// Recover teacher-reviewed pair identities safely across reruns.
 // The original face index is only trusted when BOTH photo identities
 // and the measured embedding similarity still agree.
function findMatchingReviewedPair(photoA,photoB,oldLeft,oldRight,oldScore){
 const left=items.map((item,i)=>item.sourcePhoto===photoA?i:-1).filter(i=>i>=0);
 const right=items.map((item,i)=>item.sourcePhoto===photoB?i:-1).filter(i=>i>=0);
 const directLeft=oldLeft-1,directRight=oldRight-1;
 const within=(i,j,tolerance)=>{
  const score=pairScore(i,j);
  return i!==j&&Number.isFinite(score)&&Math.abs(score-oldScore)<=tolerance;
 };
 const directValid=items[directLeft]?.sourcePhoto===photoA&&items[directRight]?.sourcePhoto===photoB&&within(directLeft,directRight,0.025);
 if(directValid)return {i:directLeft,j:directRight,reason:'写真番号・顔番号・比較値一致'};
 const candidates=[];
 for(const i of left)for(const j of right){
  if(i===j||!within(i,j,0.025))continue;
  candidates.push({i,j,delta:Math.abs(pairScore(i,j)-oldScore)});
 }
 candidates.sort((a,b)=>a.delta-b.delta);
 if(candidates.length===1)return {i:candidates[0].i,j:candidates[0].j,reason:'写真番号・比較値の唯一の一致'};
 if(candidates.length>1&&candidates[0].delta<=0.006&&candidates[1].delta-candidates[0].delta>=0.035)
  return {i:candidates[0].i,j:candidates[0].j,reason:'写真番号・比較値の明確な一致'};
 return null;
}
function validateFaceReportAndImport(){
 const raw=$('faceEvaluationImport')?.value||'';
 const feedback=$('faceEvaluationMessage');
 const fail=message=>{if(feedback)feedback.textContent='⚠️ '+message};
 if(!items.length)return fail('先に写真を解析してください。');
 const count=raw.match(/写真数\s+(\d+)\s*\/\s*検出顔\s+(\d+)/);
 if(!count)return fail('写真数と検出顔数を含む検証結果を貼り付けてください。');
 if(+count[1]!==photoNames.length)return fail('写真枚数が異なります。前回と同じ枚数・順番の写真を選んでください。');
 const lines=raw.split(/\r?\n/).filter(line=>/^顔\d+\(写真\d+\)/.test(line.trim()));
 if(!lines.length)return fail('このテキストは「先生が確認した顔の組 0」の結果だよ。前回確認した顔の組が記載されたテキストを貼り付けてね。今の確認記録は変更していません。');
 const imported=new Map(),manual=[];
 for(const line of lines){
  const match=line.trim().match(/^顔(\d+)\(写真(\d+)\)\s*↔\s*顔(\d+)\(写真(\d+)\)：(同じ園児|違う園児)\s*\/\s*値\s+(-?\d+(?:\.\d+)?)/);
  if(!match)return fail('読めない行があります。検証テキストを省略せずに貼り付けてください。');
  const photoA=+match[2]-1,photoB=+match[4]-1,oldLeft=+match[1],oldRight=+match[3],same=match[5]==='同じ園児',oldScore=+match[6];
  if(photoA<0||photoB<0||photoA>=photoNames.length||photoB>=photoNames.length||!Number.isFinite(oldScore))
   return fail('写真番号または比較値が不正です。');
  if(same&&photoA===photoB)return fail('同じ写真の別々の顔は同じ園児として登録できません。');
  const foundPair=findMatchingReviewedPair(photoA,photoB,oldLeft,oldRight,oldScore);
  if(foundPair){
   const key=facePairKey(foundPair.i,foundPair.j);
   if(imported.has(key)&&imported.get(key).same!==same)
    return fail('同じ顔の組に矛盾した判定があります。');
   imported.set(key,{i:foundPair.i,j:foundPair.j,same});
  }else{
   manual.push({photoA,photoB,oldLeft,oldRight,same,oldScore,selectedLeft:null,selectedRight:null});
  }
 }
 // Do not modify the current AI groups. Only recover teacher labels in memory.
 // Imported face labels can describe a different grouping: never reuse
 // staff exclusions or photo-only links from an older verification batch.
 lastFolderCorrection=null;folderCorrectionNoticeText='';
 excludedVerifiedFolders.clear();newManualPhotoFolders.clear();manualFolderSequence=0;
 manualPhotoFolderChoices.clear();photoFolderCorrections.clear();verifiedFolderNames.clear();folderManagementNotice='';
 verifiedFacePairs.clear();
 for(const [key,pair] of imported)verifiedFacePairs.set(key,pair);
 pendingFaceImport=manual;
 selectedReviewFaces=[];
 renderFaceEvaluation();renderPendingFaceImport();
 if(feedback){
  const countWarning=+count[2]===items.length?'':'（前回'+count[2]+'顔・今回は'+items.length+'顔）';
  feedback.textContent='✅ 前回の確認'+lines.length+'組から、自動復元 '+imported.size+'組 ／ 目視確認 '+manual.length+'組 '+countWarning+'。今の解析結果を変更せず、先生の確認だけ復元しました。';
 }
}
function applyVerifiedFaceMerges(){
 const feedback=$('faceEvaluationMessage');
 if(!items.length||!verifiedFacePairs.size){
  if(feedback)feedback.textContent='先に解析して、同じ園児の確認結果を登録してください。';
  return;
 }
 const candidates=[...verifiedFacePairs.values()].filter(p=>p.same);
 if(!candidates.length){if(feedback)feedback.textContent='「同じ園児」の判定がまだありません。';return}
 const trial=groups.map(g=>({id:g.id,members:[...g.members]}));
 const preservedNames=new Map(groupNames);
 const nameChanges=new Map(groupNames);
 let joined=0,skipped=0;
 const confirmedConnections=new Map();
 for(const pair of candidates){
  if(!confirmedConnections.has(pair.i))confirmedConnections.set(pair.i,new Set());
  if(!confirmedConnections.has(pair.j))confirmedConnections.set(pair.j,new Set());
  confirmedConnections.get(pair.i).add(pair.j);
  confirmedConnections.get(pair.j).add(pair.i);
 }
 const confirmedComponent=start=>{
  const visited=new Set([start]),queue=[start];
  for(let head=0;head<queue.length;head++){
   for(const other of confirmedConnections.get(queue[head])||[]){
    if(!visited.has(other)){visited.add(other);queue.push(other)}
   }
  }
  return visited;
 };
 const canJoin=(left,right)=>{
  // Never silently include unverified extra faces from either AI cluster.
  // Transitive teacher-confirmed matches (A=B and A=C) remain allowed.
  const approved=confirmedComponent(left.members[0]);
  if(![...left.members,...right.members].every(id=>approved.has(id)))return false;
  const photos=new Set(left.members.map(i=>items[i].sourcePhoto));
  if(right.members.some(i=>photos.has(items[i].sourcePhoto)))return false;
  const leftName=nameChanges.get(left.id),rightName=nameChanges.get(right.id);
  if(leftName&&rightName&&leftName!==rightName)return false;
  if(hasExcludedPair(left,right))return false;
  return ![...verifiedFacePairs.values()].some(p=>!p.same&&
   ((left.members.includes(p.i)&&right.members.includes(p.j))||
    (left.members.includes(p.j)&&right.members.includes(p.i))));
 };
 for(const pair of candidates){
  const left=trial.find(g=>g.members.includes(pair.i)),right=trial.find(g=>g.members.includes(pair.j));
  if(!left||!right){skipped++;continue}
  if(left===right)continue;
  if(!canJoin(left,right)){skipped++;continue}
  left.members.push(...right.members);
  trial.splice(trial.indexOf(right),1);
  if(!nameChanges.has(left.id)&&nameChanges.has(right.id))nameChanges.set(left.id,nameChanges.get(right.id));
  nameChanges.delete(right.id);
  joined++;
 }
 if(!joined){
  if(feedback)feedback.textContent='統合できる組はありませんでした。既に同じグループか、同じ写真・異なる園児の判定などに矛盾しています。（保留 '+skipped+'組）';
  return;
 }
 lastVerifiedGroupSnapshot={groups:groups.map(g=>({id:g.id,members:[...g.members]})),names:preservedNames,mergeCount:manualMergeCount};
 groups=trial;
 groupNames.clear();for(const [key,value] of nameChanges)groupNames.set(key,value);
 manualMergeCount+=joined;
 selected.clear();invalidateAssignmentPreview();render();refreshGroupPairsUI();
 const undo=$('undoVerifiedGroups');if(undo)undo.disabled=false;
 if(feedback)feedback.textContent='✅ 先生が同じ園児と確認した組だけ '+joined+'回仮統合しました。（保留 '+skipped+'組）写真・アルバムは変更していません。';
}
function undoVerifiedFaceMerges(){
 if(!lastVerifiedGroupSnapshot)return;
 groups=lastVerifiedGroupSnapshot.groups;
 groupNames.clear();for(const [key,value] of lastVerifiedGroupSnapshot.names)groupNames.set(key,value);
 manualMergeCount=lastVerifiedGroupSnapshot.mergeCount;
 lastVerifiedGroupSnapshot=null;
 const undo=$('undoVerifiedGroups');if(undo)undo.disabled=true;
 selected.clear();invalidateAssignmentPreview();render();refreshGroupPairsUI();
 const message=$('faceEvaluationMessage');if(message)message.textContent='↩ 確認済みグループの仮統合を戻しました。先生の確認記録は残っています。';
}
function simulateGreedyFaceGrouping(){
 if(!items.length)return[];
 const threshold=Number($('threshold').value);
 const trial=items.map((_,i)=>({members:[i]}));
 const pairs=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  if(hiddenFaces.has(i)||hiddenFaces.has(j))continue;
  if(items[i].sourcePhoto===items[j].sourcePhoto)continue;
  const score=pairScore(i,j);
  if(Number.isFinite(score)&&score>=threshold)pairs.push({i,j,score});
 }
 pairs.sort((a,b)=>b.score-a.score);
 for(const pair of pairs){
  const left=trial.find(g=>g.members.includes(pair.i));
  const right=trial.find(g=>g.members.includes(pair.j));
  if(!left||!right||left===right)continue;
  const photos=new Set(left.members.map(i=>items[i].sourcePhoto));
  if(right.members.some(i=>photos.has(items[i].sourcePhoto)))continue;
  // Complete-link prevents a high-scoring bridge from combining lookalikes.
  if(!left.members.every(i=>right.members.every(j=>pairScore(i,j)>=threshold)))continue;
  left.members.push(...right.members);
  trial.splice(trial.indexOf(right),1);
 }
 return trial.map((g,i)=>({id:String(i+1),members:g.members}));
}
function renderSimulationResult(){
 const host=$('faceSimulationResult');if(!host)return;
 host.replaceChildren();
 if(!alternativeGrouping)return;
 const feedback=[...verifiedFacePairs.values()];
 const positives=feedback.filter(p=>p.same).length,negatives=feedback.length-positives;
 const baseline=groups.filter(g=>g.id!=='unknown'&&g.members.length);
 const variants=[
  ['現在の仮グループ',baseline],
  ['従来の単純な別方式',alternativeGrouping],
  ...(evidenceVariants||[]).map(v=>[v.label,v.groups])
 ];
 const metrics=candidate=>{
  const membership=new Map();
  for(const g of candidate)for(const id of g.members)membership.set(id,g.id);
  const falseSplit=feedback.filter(p=>p.same&&membership.get(p.i)!==membership.get(p.j)).length;
  const falseMerge=feedback.filter(p=>!p.same&&membership.get(p.i)===membership.get(p.j)).length;
  const conflicts=candidate.reduce((count,g)=>{
   const ids=g.members.map(i=>items[i].sourcePhoto);
   return count+ids.length-new Set(ids).size;
  },0);
  return {falseSplit,falseMerge,conflicts};
 };
 const summary=document.createElement('p');summary.className='muted';
 summary.textContent='写真の再解析なしで比較 ／ 検証済み：同じ園児 '+positives+'組・違う園児 '+negatives+'組。数字は確認した組だけの結果です。';
 host.append(summary);
 const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:13px';
 const head=document.createElement('tr');
 for(const label of ['方式','グループ','同じ園児の分割','違う園児の混在']){
  const th=document.createElement('th');th.textContent=label;th.style.cssText='padding:8px 4px;border-bottom:1px solid #dbe2ed;text-align:left';head.append(th);
 }
 table.append(head);
 for(const [label,candidate] of variants){
  const stats=metrics(candidate);
  const tr=document.createElement('tr');
  for(const value of [label,candidate.length,positives?stats.falseSplit+'/'+positives:'未評価',negatives?stats.falseMerge+'/'+negatives:'未評価']){
   const td=document.createElement('td');td.textContent=String(value);td.style.cssText='padding:9px 4px;border-bottom:1px solid #e9eff6;vertical-align:top';tr.append(td);
  }
  if(stats.conflicts){tr.title='同じ写真に写る別々の顔が混在しています';tr.style.background='#fff0e8'}
  table.append(tr);
 }
 const wrap=document.createElement('div');wrap.style.overflowX='auto';wrap.append(table);host.append(wrap);
 const warning=document.createElement('p');warning.className='muted';
 warning.textContent='⚠️ 方式の違いは試算のみ。'+(!negatives?'「違う園児」の確認が0組なので、グループ数を減らしても誤統合が増えるか判定できません。':'確認済み以外の顔には誤統合が残る可能性があります。')+' 実際の仮グループやアルバムは変更していません。';
 host.append(warning);
 const split=[...feedback].filter(p=>p.same&&
   variants.slice(1).some(([,candidate])=>{
    const g1=candidate.find(g=>g.members.includes(p.i));
    return !g1?.members.includes(p.j);
   }));
 if(split.length){
  const reasons=document.createElement('details');
  const title=document.createElement('summary');title.textContent='分かれたままの確認済み顔：'+split.length+'組（比較値と理由の目安）';reasons.append(title);
  for(const p of split.slice(0,12)){
   const score=pairScore(p.i,p.j);
   const line=document.createElement('p');line.className='muted';
   const thr=Number($('threshold').value);
   line.textContent='顔'+(p.i+1)+'↔顔'+(p.j+1)+'：'+score.toFixed(4)+(score<thr?' ／ 基準未満。顔の向きや画質・モデルの影響も考えられます。':' ／ 基準以上でも、競合する顔やグループ全体の整合性で分割される場合があります。');
   reasons.append(line);
  }
  host.append(reasons);
 }
}
$('importFaceEvaluation')?.addEventListener('click',validateFaceReportAndImport);
$('applyVerifiedGroups')?.addEventListener('click',applyVerifiedFaceMerges);
$('undoVerifiedGroups')?.addEventListener('click',undoVerifiedFaceMerges);
$('simulateFaceGrouping')?.addEventListener('click',()=>{
 if(!items.length){
  const result=$('faceSimulationResult');if(result)result.textContent='先に顔を解析してください。';
  return;
 }
 alternativeGrouping=simulateGreedyFaceGrouping();
 const photos=items.map(item=>item.sourcePhoto);
 const threshold=Number($('threshold').value);
 evidenceVariants=[
  ['conservative','安全優先（試算）'],
  ['balanced','バランス（試算）'],
  ['exploratory','探索型（試算）']
 ].map(([mode,label])=>{
  const candidate=groupFacesWithEvidence(photos,pairScore,threshold,mode);
  return {mode,label,groups:candidate.groups.map((members,index)=>({id:String(index+1),members})),steps:candidate.details.length};
 });
 renderSimulationResult();
});

function currentFaceGroupIndex(){
 const map=new Map();
 for(const group of groups){
  if(group.id==='unknown')continue;
  for(const id of group.members)map.set(id,group.id);
 }
 return map;
}
function openPreviousReviewImport(){
 const outer=$('faceEvaluationPanel');if(outer)outer.open=true;
 const importInput=$('faceEvaluationImport');
 if(importInput){
  const box=importInput.closest('details');
  if(box)box.open=true;
  importInput.focus();
  importInput.scrollIntoView({behavior:'smooth',block:'center'});
 }
}
$('showRestoreInput')?.addEventListener('click',openPreviousReviewImport);
$('copyQuickReport')?.addEventListener('click',async()=>{
 const report=$('faceEvaluationReport'),message=$('quickCopyStatus');
 if(!report?.value){if(message)message.textContent='先に顔を解析してください。';return}
 if(items.length&&verifiedFacePairs.size===0){
  openPreviousReviewImport();
  if(message)message.textContent='⚠️ 先生の確認が0組です。以前の確認結果を読み込んでからコピーしてね。';
  return;
 }
 try{
  if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
  await navigator.clipboard.writeText(report.value);
  if(message)message.textContent='✅ 検証結果をコピーしました（写真・園児名なし）';
 }catch(error){
  const outer=$('faceEvaluationPanel');if(outer)outer.open=true;
  const inner=report.closest('details');if(inner)inner.open=true;
  report.focus();report.select();
  if(message)message.textContent='コピーが自動でできなかったため、結果を選択しました。⌘＋Cでコピーしてください。';
 }
});
// Compact teacher-first evaluation: inspect possible misses and mixed faces.
// Never changes actual album data; scores are not identity probabilities.
// Only teacher-confirmed positives create these overview groups.
// A rejected pair or two faces in the same source photo is a hard cannot-link.
// No album changes, no additional photo scans, no personal names stored.
// A read-only picture-to-child preview driven by explicit teacher labels.
// Every detected face is displayed in exactly one temporary folder.
// One original source photo can be listed in several folders (group photo).
// A teacher must explicitly confirm which formerly positive pair was wrong.
// Never infer which old label to discard merely from a mixed folder.
function renderSamePairCorrection(host,pair){
 const row=document.createElement('div');row.className='folder-review-row';
 const photos=document.createElement('div');photos.className='folder-review-faces';
 for(const id of [pair.i,pair.j]){
  const figure=document.createElement('figure'),image=document.createElement('img');
  image.src=items[id].url;image.alt='顔'+(id+1);
  const caption=document.createElement('figcaption');
  caption.textContent='顔'+(id+1)+'・写真'+(items[id].sourcePhoto+1);
  figure.append(image,caption);photos.append(figure);
 }
 row.append(photos);
 const button=document.createElement('button');
 button.type='button';button.className='secondary';
 button.textContent='この2つは違う園児';
 row.append(button);
 const confirmation=document.createElement('div');
 confirmation.className='folder-review-confirm';
 confirmation.hidden=true;
 const explain=document.createElement('p');explain.className='muted';
 explain.textContent='この2つの顔が違う園児なら、前回の「同じ園児」判定をこの1組だけ訂正します。ほかの先生の確認は残します。';
 const actions=document.createElement('div');actions.className='actions';
 const confirm=document.createElement('button');confirm.type='button';
 confirm.textContent='✅ 違う園児に訂正する';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='やめる';
 cancel.addEventListener('click',()=>{confirmation.hidden=true;button.hidden=false;});
 button.addEventListener('click',()=>{confirmation.hidden=false;button.hidden=true;});
 confirm.addEventListener('click',()=>{
  const key=facePairKey(pair.i,pair.j),current=verifiedFacePairs.get(key);
  if(!current?.same){
   confirmation.hidden=true;button.hidden=false;
   folderCorrectionNoticeText='この組はすでに「違う園児」として記録されています。';
   renderFaceEvaluation();return;
  }
  const before=[...verifiedFacePairs.entries()].map(([k,v])=>[k,{...v}]);
  verifiedFacePairs.set(key,{i:pair.i,j:pair.j,same:false});
  const after=buildVerifiedPhotoFolders(items.map(item=>item.sourcePhoto),[...verifiedFacePairs.values()]);
  lastFolderCorrection={before,afterSignature:faceReviewSignature()};
  folderCorrectionNoticeText='✅ 顔'+(pair.i+1)+'と顔'+(pair.j+1)+
   'を「違う園児」に訂正しました。'+
   (after.contradictions.length?' ⚠️ ほかの「同じ園児」の確認が'+after.contradictions.length+
    '組矛盾しています。該当する顔の組を再確認してください。':' 仮フォルダを再計算しました。')+
   ' 必要なら「最後の訂正を戻す」で元に戻せます。訂正結果は検証テキストをコピーして残してください。';
  renderFaceEvaluation();
 });
 actions.append(confirm,cancel);
 confirmation.append(explain,actions);
 row.append(confirmation);host.append(row);
}

// Folder IDs (01,02...) can change when a teacher fixes a mistaken pair.
// Use confirmed face composition as the temporary identifier instead.
function provisionalPhotoFolderKey(bucket){
 return verifiedFolderKey(bucket);
}
function currentPhotoFolderView(){
 const base=buildVerifiedPhotoFolders(items.map(item=>item.sourcePhoto),[...verifiedFacePairs.values()]);
 const visible=composeVisibleChildFolders(base.buckets,excludedVerifiedFolders,newManualPhotoFolders);
 return {base,visible,model:{...base,buckets:visible.visible}};
}
function getExcludedFaceIndexes(){
 const view=currentPhotoFolderView();
 return new Set(view.visible.excluded.flatMap(bucket=>bucket.members));
}
function renderExcludedPhotoFolderRestores(view){
 const panel=$('excludedFaceFoldersPanel'),heading=$('excludedFaceFoldersHeading');
 const body=$('excludedFaceFoldersBody');
 if(!panel||!heading||!body)return;
 panel.hidden=!view.excluded.length;
 body.replaceChildren();
 heading.textContent='🗑 除外済み '+view.excluded.length+'フォルダ（元写真はそのまま）';
 for(const bucket of view.excluded){
  const key=provisionalPhotoFolderKey(bucket);
  const card=document.createElement('div');card.className='excluded-face-card';
  const faces=document.createElement('div');
  for(const id of bucket.members){
   const image=document.createElement('img');
   image.src=items[id]?.url||'';image.alt='除外した顔'+(id+1);faces.append(image);
  }
  const label=document.createElement('p');label.className='muted';
  label.textContent='顔 '+bucket.members.map(id=>id+1).join('・')+' ／ 写真'+bucket.photos.map(id=>id+1).join('・');
  const restore=document.createElement('button');
  restore.type='button';restore.className='secondary';restore.textContent='↩ このフォルダを戻す';
  restore.addEventListener('click',()=>{
   excludedVerifiedFolders.delete(key);
   folderManagementNotice='✅ 除外した顔フォルダを元に戻しました。';
   renderFaceEvaluation();
  });
  card.append(faces,label,restore);body.append(card);
 }
}

const missingPhotoReportHeader='\n【顔未検出写真の手動仮指定】';
function updateMissingPhotoReport(){
 const report=$('faceEvaluationReport');
 if(!report?.value)return;
 // Remove only our own photo-number lines, not later model comparison
 // results or the anonymized child-name assignment count.
 report.value=report.value.replace(/\n【顔未検出写真の手動仮指定】(?:\n写真\d+：[^\n]*)*/g,'');
 const detected=new Set(items.map(item=>item.sourcePhoto));
 const missing=photoNames.map((_,i)=>i).filter(index=>!detected.has(index));
 if(!missing.length)return;
 const {model}=currentPhotoFolderView();
 const names=new Map(model.buckets.map((bucket,index)=>[
  provisionalPhotoFolderKey(bucket),'仮フォルダ'+String(index+1).padStart(2,'0')
 ]));
 report.value+=missingPhotoReportHeader;
 for(const photoIndex of missing){
  const chosen=[...(manualPhotoFolderChoices.get(photoIndex)||[])].map(key=>names.get(key)).filter(Boolean);
  report.value+='\n写真'+(photoIndex+1)+'：'+(chosen.length?chosen.join('・'):'未指定（保留）');
 }
}
function refreshMissingPhotoPreview(model,missing){
 const section=$('missingFacePhotoPicker');
 const status=$('missingFacePhotoPickerStatus');
 const grid=$('verifiedPhotoFoldersGrid');
 const validKeys=new Set(model.buckets.map(provisionalPhotoFolderKey));
 // If a verified folder was split, do not silently assign a previously
 // unchecked source photo to a changed or different child's folder.
 let invalidated=0;
 for(const [photoIndex,keys] of manualPhotoFolderChoices){
  if(!missing.includes(photoIndex)){manualPhotoFolderChoices.delete(photoIndex);continue;}
  for(const key of [...keys]){
   if(!validKeys.has(key)){keys.delete(key);invalidated++;}
  }
  if(!keys.size)manualPhotoFolderChoices.delete(photoIndex);
 }
 if(status){
  const currentLinks=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,
  manualPhotoFolderChoices,photoFolderCorrections).named;
 const assigned=missing.filter(i=>currentLinks.some(row=>row.photoIndexes.includes(i))).length;
  status.textContent='手動仮指定：'+assigned+'/'+missing.length+'枚。'+
   (invalidated?'⚠️ フォルダ構成が変わったため、以前の指定を'+invalidated+'件解除しました。もう一度確認してください。':'')+
   ' 端末内の仮プレビューだけに反映されます。';
 }
 if(grid){
  for(const list of grid.querySelectorAll('[data-verified-photo-folder]')){
   list.querySelectorAll('.manual-photo-chip').forEach(node=>node.remove());
   const key=list.dataset.verifiedPhotoFolder;
   for(const photoIndex of missing){
    if(!manualPhotoFolderChoices.get(photoIndex)?.has(key)||
       photoFolderCorrections.get(photoIndex)?.get(key)===false)continue;
    const chip=document.createElement('span');
    chip.className='folder-photo-chip manual-photo-chip';
    chip.textContent='写真'+(photoIndex+1)+'（手動・仮）';
    list.append(chip);
   }
  }
  const preview=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,manualPhotoFolderChoices,photoFolderCorrections);
  for(const target of grid.querySelectorAll('[data-folder-photo-gallery]')){
   const row=preview.named.find(entry=>entry.key===target.dataset.folderPhotoGallery);
   target.replaceChildren();
   if(!row)continue;
   for(const photoIndex of row.photoIndexes){
    const tile=document.createElement('div');tile.className='folder-photo-preview';
    const image=document.createElement('img');image.loading='lazy';
    image.src=photoUrls[photoIndex]||urls[photoIndex]||'';
    image.alt='写真'+(photoIndex+1)+'（仮プレビュー）';
    const label=document.createElement('span');label.textContent='写真'+(photoIndex+1)+
     (row.manuallyAdded.includes(photoIndex)?'・手動':'');
    const open=document.createElement('button');open.type='button';open.className='photo-review-button';
    open.setAttribute('aria-label','元写真'+(photoIndex+1)+'を拡大して振り分けを修正');
    open.addEventListener('click',()=>photoOriginalReviewUi.open(photoIndex,row.key));
    open.append(image);tile.append(open,label);target.append(tile);
   }
   const title=grid.querySelector('[data-folder-photo-heading="'+row.key+'"]');
   if(title)title.textContent='🖼 元写真を全体表示（'+row.photoIndexes.length+'枚・タップで移動／解除）';
   const count=grid.querySelector('[data-folder-photo-count="'+row.key+'"]');
   if(count)count.textContent='この園児が写る写真（'+row.photoIndexes.length+'枚・仮）';
  }
 }
 updateMissingPhotoReport();
 renderFinalPhotoAudit();
}
function renderMissingPhotoPicker(model,missing){
 const section=$('missingFacePhotoPicker'),title=$('missingFacePhotoPickerTitle');
 const body=$('missingFacePhotoPickerBody');
 if(!section||!title||!body)return;
 body.replaceChildren();
 section.hidden=!missing.length;
 if(!missing.length){
  manualPhotoFolderChoices.clear();
  refreshMissingPhotoPreview(model,missing);
  return;
 }
 title.textContent='📷 顔が見つからない写真 '+missing.length+'枚（既存／新規）';
 for(const photoIndex of missing){
  const card=document.createElement('div');card.className='photo-missing-review';
  const heading=document.createElement('strong');
  heading.textContent='写真'+(photoIndex+1)+'（顔が見つかりませんでした）';
  card.append(heading);
  const photo=photoUrls[photoIndex]||urls[photoIndex];
  if(photo){
   const image=document.createElement('img');
   image.loading='lazy';image.src=photo;
   image.alt='写真'+(photoIndex+1)+'の確認用プレビュー';card.append(image);
  }
  const current=document.createElement('strong');
  current.textContent='① 既存の園児フォルダに追加';
  card.append(current);
  const hint=document.createElement('p');hint.className='muted';
  hint.textContent='写真に写っている園児のフォルダをチェック。集合写真は複数選択OK。園児がいなければ未指定にしてね。';
  card.append(hint);
  const options=document.createElement('div');options.className='photo-missing-options';
  for(let i=0;i<model.buckets.length;i++){
   const bucket=model.buckets[i],key=provisionalPhotoFolderKey(bucket);
   const label=document.createElement('label');label.className='photo-missing-option';
   const checkbox=document.createElement('input');
   checkbox.type='checkbox';
   const overridden=photoFolderCorrections.get(photoIndex)?.get(key);
   checkbox.checked=overridden===undefined?
    (manualPhotoFolderChoices.get(photoIndex)?.has(key)||false):overridden;
   checkbox.setAttribute('aria-label','写真'+(photoIndex+1)+'を仮フォルダ'+(i+1)+'に仮指定');
   const first=bucket.members[0];
   let face;
   if(Number.isInteger(first)&&items[first]){
    face=document.createElement('img');
    face.src=items[first].url;face.alt='仮フォルダ'+(i+1)+'の顔の見本';
   }else{
    face=document.createElement('span');
    face.textContent='📷';face.style.fontSize='22px';
   }
   const name=document.createElement('span');
   const assignedChild=roster.find(child=>String(child.id)===String(verifiedFolderNames.get(key)||''));
   name.textContent=(assignedChild?assignedChild.name+'さん・':'')+
    '仮フォルダ'+String(i+1).padStart(2,'0')+
    (bucket.kind==='manual'?'（写真から作成'+(bucket.customName?'・'+bucket.customName:'')+'）':'（顔'+bucket.members.length+'件）');
   checkbox.addEventListener('change',()=>{
    const selected=new Set(manualPhotoFolderChoices.get(photoIndex)||[]);
    if(checkbox.checked)selected.add(key);else selected.delete(key);
    if(selected.size)manualPhotoFolderChoices.set(photoIndex,selected);
    else manualPhotoFolderChoices.delete(photoIndex);
    // Direct teacher toggle in the older picker now overrides the modal correction.
    const edits=photoFolderCorrections.get(photoIndex);
    if(edits){edits.delete(key);if(!edits.size)photoFolderCorrections.delete(photoIndex);}
    refreshMissingPhotoPreview(model,missing);
   });
   label.append(checkbox,face,name);options.append(label);
  }
  if(!model.buckets.length){
   const empty=document.createElement('p');empty.className='muted';
   empty.textContent='既存の園児フォルダはありません。下から新規フォルダを作れます。';
   card.append(empty);
  }
  card.append(options);
  const creator=document.createElement('div');creator.className='photo-folder-creator';
  const label=document.createElement('strong');label.textContent='② 新規フォルダに分ける';
  const note=document.createElement('p');note.className='muted';
  note.textContent='既存にない園児なら新しい仮フォルダを作って、この写真を追加します。あとから園児名を付けられます。既存のチェックは自動で外さないので、不要な指定は手動で外してね。';
  const input=document.createElement('input');input.type='text';
  input.maxLength=40;input.placeholder='仮のフォルダ名（任意）';
  input.setAttribute('aria-label','写真'+(photoIndex+1)+'の新しいフォルダ名');
  const button=document.createElement('button');button.type='button';button.textContent='＋ 新規フォルダを作る';
  const message=document.createElement('p');message.className='muted';message.setAttribute('role','status');
  button.addEventListener('click',()=>{
   const proposed=validateNewPhotoFolderName(input.value);
   if(proposed===null){
    message.textContent='フォルダ名は40文字以内で入力してね。';return;
   }
   if(newManualPhotoFolders.size>=100){
    message.textContent='新規フォルダは100件まで作成できます。';return;
   }
   const key='manual-'+(++manualFolderSequence);
   newManualPhotoFolders.set(key,{name:proposed});
   const chosen=new Set(manualPhotoFolderChoices.get(photoIndex)||[]);
   chosen.add(key);manualPhotoFolderChoices.set(photoIndex,chosen);
   folderManagementNotice='✅ 写真'+(photoIndex+1)+'を新しい仮フォルダへ追加しました。元の写真は変更していません。';
   renderFaceEvaluation();
  });
  const actions=document.createElement('div');actions.className='actions';
  actions.append(input,button);
  creator.append(label,note,actions,message);card.append(creator);
  body.append(card);
 }
 refreshMissingPhotoPreview(model,missing);
}

// Non-child folders are only excluded from the current preview.
// Deleting a photo-only folder removes its temporary references and nothing else.
function appendFolderDeletionControl(card,bucket,key){
 const actions=document.createElement('div');actions.className='photo-folder-card-actions';
 const button=document.createElement('button');button.type='button';button.className='secondary';
 button.textContent=bucket.kind==='manual'?'🗑 新規フォルダを削除':'🗑 園児以外の顔フォルダを除外';
 actions.append(button);
 const confirm=document.createElement('div');confirm.hidden=true;confirm.className='photo-folder-delete-confirm';
 const explanation=document.createElement('p');explanation.className='muted';
 explanation.textContent=bucket.kind==='manual'?
  'この新規フォルダの仮指定を取り消します。元の写真は削除しません。':
  '職員・保護者など園児以外の場合、園児の候補からこの顔のフォルダを外します。元写真や先生の確認記録は削除されず、除外済みから戻せます。';
 const approve=document.createElement('button');approve.type='button';
 approve.textContent=bucket.kind==='manual'?'削除する（写真は残す）':'園児以外として除外する';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='やめる';
 button.addEventListener('click',()=>{button.hidden=true;confirm.hidden=false;});
 cancel.addEventListener('click',()=>{button.hidden=false;confirm.hidden=true;});
 approve.addEventListener('click',()=>{
  verifiedFolderNames.delete(key);
  if(bucket.kind==='manual')newManualPhotoFolders.delete(key);
  else excludedVerifiedFolders.add(key);
  for(const [photo,selected] of manualPhotoFolderChoices){
   if(!selected.has(key))continue;
   selected.delete(key);
   if(!selected.size)manualPhotoFolderChoices.delete(photo);
  }
  folderManagementNotice=bucket.kind==='manual'?
   '✅ 写真だけの新規フォルダを削除しました。元写真は変更していません。':
   '✅ 園児以外の顔フォルダを候補から除外しました。「除外済み」から戻せます。集合写真の元画像は残ります。';
  renderFaceEvaluation();
 });
 const row=document.createElement('div');row.className='actions';row.append(approve,cancel);
 confirm.append(explanation,row);card.append(actions,confirm);
}


let provisionalFinalCandidate=null,lastFinalReviewSignature='',lastFinalReviewAudit=null;

let persistedPhotoDraftSignature='',approvalUi={refresh:()=>{}},albumHandoffUi={refresh:()=>{}};
function currentFinalReviewAudit(){
 const {visible,model}=currentPhotoFolderView();
 const preview=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,manualPhotoFolderChoices,photoFolderCorrections);
 return auditPhotoAssignments({
  photoCount:photoNames.length,namedFolders:preview.named,roster,
  excludedFolders:visible.excluded,
  invalidAssignments:[...preview.invalid,...preview.duplicates],
  contradictions:model.contradictions,
  hasSourcePhotoConflicts:model.hasSourcePhotoConflicts
 });
}

let provisionalFinalMessage='仮確定はまだ行っていません。';
function clearProvisionalFinalization(message='仮確定はまだ行っていません。'){
 provisionalFinalCandidate=null;
 lastFinalReviewAudit=null;
 lastFinalReviewSignature='';
 provisionalFinalMessage=message;
 const eye=$('provisionalFinalVisualCheck'),unassigned=$('provisionalFinalUnassignedCheck');
 if(eye)eye.checked=false;
 if(unassigned)unassigned.checked=false;
 const result=$('provisionalFinalDetails');if(result)result.replaceChildren();
}
function finalAuditSourceSignature(audit){
 // Include source identity, reviewed face pairs, exclusions, manual links and names.
 // A later source or classification change MUST invalidate the teacher's approval.
 return JSON.stringify({
  sources:analyzedSourceFiles.map(file=>[file.name,file.size,file.lastModified]),
  photoNames,faces:items.map(item=>item.sourcePhoto),
  groups:groups.map(group=>[group.id,...group.members]),
  verifiedPairs:faceReviewSignature(),
  excluded:[...excludedVerifiedFolders].sort(),
  newFolders:[...newManualPhotoFolders].sort((a,b)=>a[0].localeCompare(b[0])),
  named:[...verifiedFolderNames].sort((a,b)=>a[0].localeCompare(b[0])),
  manual:[...manualPhotoFolderChoices].map(([photo,keys])=>[photo,[...keys].sort()]).sort((a,b)=>a[0]-b[0]),
  photoCorrections:photoFolderCorrectionsAsRows(photoFolderCorrections),
  olderManual:[...manualPhotoAssignments].map(([photo,names])=>[photo,[...names].sort()]).sort((a,b)=>a[0]-b[0]),
  rosterClass:classSelect.value,roster,audit
 });
}
function updateProvisionalFinalControls(){
 const button=$('createProvisionalFinal'),cancel=$('cancelProvisionalFinal');
 const visual=$('provisionalFinalVisualCheck'),unassigned=$('provisionalFinalUnassignedCheck');
 const status=$('provisionalFinalStatus'),preview=$('provisionalFinalDetails');
 const check=checkFinalizationReadiness(lastFinalReviewAudit);
 if(button)button.disabled=Boolean(provisionalFinalCandidate)||!check.ready||
  !visual?.checked||(check.needsUnassignedAcknowledgement&&!unassigned?.checked);
 if(cancel)cancel.hidden=!provisionalFinalCandidate;
 approvalUi.refresh();
 albumHandoffUi.refresh();
 if(status)status.textContent=provisionalFinalMessage;
 if(!preview)return;
 preview.replaceChildren();
 if(provisionalFinalCandidate){
  const p=document.createElement('p');p.className='final-audit-notice';
  p.textContent='🔐 仮確定済み（この画面内のみ）：園児'+provisionalFinalCandidate.children.length+
   '名 ／ 園児に紐づいた元写真'+provisionalFinalCandidate.linkedPhotoCount+
   '枚 ／ 集合写真'+provisionalFinalCandidate.sharedPhotos.length+
   '枚 ／ 未紐づけで含めない写真'+provisionalFinalCandidate.unassignedPhotoIndexes.length+'枚。';
  preview.append(p);
 }
}
function renderProvisionalFinalControls(audit){
 const readiness=$('provisionalFinalReadiness'),unassignedRow=$('provisionalFinalUnassignedLabel');
 const unassignedText=$('provisionalFinalUnassignedText'),unassigned=$('provisionalFinalUnassignedCheck');
 const currentSignature=finalAuditSourceSignature(audit);
 if(lastFinalReviewSignature&&lastFinalReviewSignature!==currentSignature){
  clearProvisionalFinalization('⚠️ 写真または振り分け内容が変わったため、仮確定と目視確認を解除しました。改めて点検してください。');
 }
 lastFinalReviewAudit=audit;
 lastFinalReviewSignature=currentSignature;
 const check=checkFinalizationReadiness(audit);
 if(readiness){
  readiness.replaceChildren();
  const title=document.createElement('p');
  title.textContent=check.ready?'✅ 仮確定の事前条件を満たしています。写真を目視確認してね。':
   '⚠️ 仮確定の前に確認が必要な項目：'+check.blockers.length+'件';
  readiness.append(title);
  for(const message of check.blockers){
   const p=document.createElement('p');p.textContent='・'+message;readiness.append(p);
  }
 }
 if(unassignedRow)unassignedRow.hidden=!check.needsUnassignedAcknowledgement;
 if(unassignedText)unassignedText.textContent=
  '未紐づけの写真'+audit.unassignedPhotos.length+
  '枚を確認し、これらを仮確定する園児別写真に含めないことを理解しました。';
 if(unassigned&&!check.needsUnassignedAcknowledgement)unassigned.checked=false;
 updateProvisionalFinalControls();
}
$('provisionalFinalVisualCheck')?.addEventListener('change',updateProvisionalFinalControls);
$('provisionalFinalUnassignedCheck')?.addEventListener('change',updateProvisionalFinalControls);
$('createProvisionalFinal')?.addEventListener('click',()=>{
 const audit=lastFinalReviewAudit;
 if(!audit)return;
 // Recalculate before approving in case a change bypassed a repaint.
 const latest=finalAuditSourceSignature(audit);
 if(latest!==lastFinalReviewSignature){renderFinalPhotoAudit();return;}
 const visual=$('provisionalFinalVisualCheck')?.checked===true;
 const acknowledge=$('provisionalFinalUnassignedCheck')?.checked===true;
 try{
  const candidate=createProvisionalFinalization(audit,{
   rosterClass:classSelect.value,sourceSignature:latest,
   visuallyReviewed:visual,acknowledgedUnassigned:acknowledge
  });
  if(!window.confirm('園児'+candidate.children.length+'名・元写真'+candidate.linkedPhotoCount+
   '枚を、この検証画面内で仮確定しますか？ 本番アルバムへの反映・保存・写真の複製はしません。'))return;
  provisionalFinalCandidate=candidate;
  provisionalFinalMessage='✅ 先生の確認済みとして仮確定しました（この画面だけ）。本番アルバム・保存済み作業は変更していません。';
 }catch(error){
  provisionalFinalMessage='⚠️ '+String(error?.message||error);
 }
 updateProvisionalFinalControls();
});
$('cancelProvisionalFinal')?.addEventListener('click',()=>{
 clearProvisionalFinalization('↩ 仮確定を取り消しました。元の写真・園児名・保存済みデータはそのままです。');
 // Current input state was not changed; only the temporary candidate was cleared.
 lastFinalReviewAudit=null;
 renderFinalPhotoAudit();
});


function photoCorrectionScope(){
 return JSON.stringify({
  source:photoNames,faces:faceReviewSignature(),
  folders:[...verifiedFolderNames].sort((a,b)=>a[0].localeCompare(b[0])),
  manual:[...newManualPhotoFolders].sort((a,b)=>a[0].localeCompare(b[0]))
 });
}
function updatePhotoCorrectionUndoButton(){
 const button=$('undoPhotoCorrection');
 if(!button)return;
 if(lastPhotoCorrectionUndo?.scope!==photoCorrectionScope())lastPhotoCorrectionUndo=null;
 button.disabled=!lastPhotoCorrectionUndo;
}
function applyPhotoCorrection({photoIndex,fromKey,toKey}){
 const {model}=currentPhotoFolderView();
 const named=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,
  manualPhotoFolderChoices,photoFolderCorrections).named.filter(row=>row.childId);
 const source=named.find(row=>row.key===fromKey);
 const destination=named.find(row=>row.key===toKey);
 if(fromKey&&(!source||!source.photoIndexes.includes(photoIndex)))
  throw new Error('この写真は選択した園児のフォルダにありません。もう一度写真を開いてね。');
 if(toKey&&!destination)
  throw new Error('移動先のフォルダが見つかりません。');
 if(!fromKey&&!toKey)throw new Error('追加先フォルダを選んでね。');
 const old=photoFolderCorrectionsAsRows(photoFolderCorrections);
 const result=transferPhotoFolderCorrection(photoFolderCorrections,photoIndex,fromKey,toKey,{
  photoCount:photoNames.length,folderKeys:new Set(named.map(row=>row.key))
 });
 photoFolderCorrections.clear();
 for(const [index,entries] of result)photoFolderCorrections.set(index,entries);
 lastPhotoCorrectionUndo={rows:old,scope:photoCorrectionScope()};
 folderManagementNotice='✅ 写真'+(photoIndex+1)+'：'+
  (fromKey?(source.childName+'さんから'+(toKey?(destination.childName+'さんへ移動しました'):'外しました')):
   destination.childName+'さんへ追加しました')+
  '。元の写真・AI顔認識・ほかの園児との紐づけは変更していません。再度「今の作業を保存」してね。';
 renderVerifiedPhotoFolders();
 return folderManagementNotice;
}
$('undoPhotoCorrection')?.addEventListener('click',()=>{
 if(!lastPhotoCorrectionUndo||lastPhotoCorrectionUndo.scope!==photoCorrectionScope()){
  lastPhotoCorrectionUndo=null;updatePhotoCorrectionUndoButton();return;
 }
 const previous=lastPhotoCorrectionUndo.rows;
 photoFolderCorrections.clear();
 for(const [index,entries] of previous)photoFolderCorrections.set(index,new Map(entries));
 lastPhotoCorrectionUndo=null;
 folderManagementNotice='↩ 最後の写真の移動・解除を戻しました。元写真や顔認識の結果はそのままです。';
 renderVerifiedPhotoFolders();
});

$('goToFinalReview')?.addEventListener('click',()=>{
 const summary=$('provisionalFinalBox'),panel=$('finalPhotoAuditPanel');
 if(!summary||panel?.hidden)return;
 summary.scrollIntoView({behavior:'smooth',block:'start'});
});

function renderFinalPhotoAudit(){
 const panel=$('finalPhotoAuditPanel');
 if(!panel)return;
 panel.hidden=!photoNames.length;
 if(!photoNames.length){clearProvisionalFinalization();return;}
 const {visible,model}=currentPhotoFolderView();
 const preview=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,manualPhotoFolderChoices,photoFolderCorrections);
 const audit=auditPhotoAssignments({
  photoCount:photoNames.length,namedFolders:preview.named,roster,
  excludedFolders:visible.excluded,
  invalidAssignments:[...preview.invalid,...preview.duplicates],
  contradictions:model.contradictions,
  hasSourcePhotoConflicts:model.hasSourcePhotoConflicts
 });
 const metrics=$('finalPhotoAuditSummary'),warnings=$('finalPhotoAuditWarnings');
 const childrenHost=$('finalPhotoAuditChildren'),checks=$('finalPhotoAuditChecks');
 if(!metrics||!warnings||!childrenHost||!checks)return;
 metrics.replaceChildren();warnings.replaceChildren();childrenHost.replaceChildren();checks.replaceChildren();
 for(const label of [
  '元写真 '+audit.photoCount+'枚',
  '園児に紐づけ済み '+audit.linkedPhotoCount+'枚',
  '未紐づけ '+audit.unassignedPhotos.length+'枚',
  '複数園児の集合写真 '+audit.sharedPhotos.length+'枚',
  '名前がある園児 '+audit.distinctNamedChildren+'名'
 ]){
  const badge=document.createElement('span');badge.textContent=label;metrics.append(badge);
 }
 const notices=[];
 if(!roster.length)notices.push('⚠️ 園児名簿が未設定です。上の仮フォルダで名前を付けると、この画面に反映されます。');
 if(audit.contradictionCount)notices.push('⚠️ 先生の顔確認に矛盾が'+audit.contradictionCount+'組あります。上の顔グループ画面で確認してね。');
 if(audit.hasSourcePhotoConflicts)notices.push('⚠️ 同じ元写真の異なる顔が同じ仮フォルダに入っています。顔の構成を見直してね。');
 if(audit.invalidAssignments.length)notices.push('⚠️ 無効・重複した園児名設定が'+audit.invalidAssignments.length+'件あります。名前を確認してね。');
 if(audit.unnamedFolders.length)notices.push('🔎 園児名が未設定の仮フォルダ：'+audit.unnamedFolders.length+'件。職員など園児以外の顔でなければ名前を付けてね。');
 if(audit.unassignedPhotos.length)notices.push('🔎 どの園児にも紐づいていない写真：'+audit.unassignedPhotos.length+'枚。園児以外だけの写真も含みます。');
 if(audit.multipleFolders.length)notices.push('⚠️ 同じ園児名が複数の仮フォルダに設定：'+audit.multipleFolders.map(child=>child.name+'さん').join('・')+'。');
 if(audit.countImbalance)notices.push('🔎 園児間の写真枚数に偏りがありそうです（最少'+audit.minCount+'枚／最多'+audit.maxCount+'枚）。撮影状況も含めて確認してね。');
 if(audit.excludedWithChildren.length)notices.push('ℹ️ 除外した顔と園児の顔が同じ元写真に写っている可能性：'+audit.excludedWithChildren.length+'枚。園児の写真自体は除外していません。');
 if(!notices.length)notices.push('✅ 件数上の要点検項目はありません。顔の本人確認と園児以外の写り込みは引き続き目視で確認してね。');
 for(const message of notices){
  const p=document.createElement('p');p.className='final-audit-notice';p.textContent=message;warnings.append(p);
 }
 function photoGallery(indices,labels=new Map(),manual=new Set(),folderKey=''){
  const gallery=document.createElement('div');gallery.className='final-audit-photo-grid';
  for(const index of indices){
   const tile=document.createElement('figure');tile.className='final-audit-photo';
   const image=document.createElement('img');
   image.loading='lazy';image.src=photoUrls[index]||'';
   image.alt='写真'+(index+1);image.title=photoNames[index]||'';
   const label=document.createElement('figcaption');
   label.textContent='写真'+(index+1)+(manual.has(index)?'（手動追加）':'')+
    (labels.has(index)?' ／ '+labels.get(index):'');
   const open=document.createElement('button');open.type='button';open.className='photo-review-button';
   open.setAttribute('aria-label','元写真'+(index+1)+'を拡大して振り分けを修正');
   open.addEventListener('click',()=>photoOriginalReviewUi.open(index,folderKey));
   open.append(image);tile.append(open,label);gallery.append(tile);
  }
  return gallery;
 }
 if(!audit.children.length){
  const note=document.createElement('p');note.className='muted';
  note.textContent='園児の名前がまだありません。仮フォルダの上にある名簿から設定してね。';
  childrenHost.append(note);
 }
 for(const child of audit.children){
  const card=document.createElement('details');card.className='final-audit-child';
  const heading=document.createElement('summary');
  heading.textContent='🌷 '+child.name+'さん：写真'+child.photoIndexes.length+'枚'+
   (child.manuallyAdded.length?'（手動'+child.manuallyAdded.length+'枚）':'');
  card.append(heading);
  if(child.photoIndexes.length)card.append(photoGallery(child.photoIndexes,new Map(),new Set(child.manuallyAdded),child.folderKeys[0]||''));
  else{
   const empty=document.createElement('p');empty.className='muted';
   empty.textContent='この園児に紐づいた写真はまだありません。';card.append(empty);
  }
  childrenHost.append(card);
 }
 function reviewDetails(title,indices,description,labels=new Map(),open=false){
  const section=document.createElement('details');section.className='final-audit-issue';
  section.open=open;
  const summary=document.createElement('summary');summary.textContent=title;section.append(summary);
  const note=document.createElement('p');note.className='muted';note.textContent=description;section.append(note);
  if(indices.length)section.append(photoGallery(indices,labels));
  checks.append(section);
  return section;
 }
 reviewDetails('🔎 未紐づけの元写真 '+audit.unassignedPhotos.length+'枚',
  audit.unassignedPhotos,'園児が写っている場合は上の「顔が見つからない写真の振り分け」や仮フォルダの園児名を確認してね。園児以外だけの写真は未指定でも大丈夫です。',
  new Map(),audit.unassignedPhotos.length>0&&audit.unassignedPhotos.length<=12);
 const sharedNames=new Map(audit.sharedPhotos.map(row=>[
  row.photoIndex,row.children.map(child=>child.name+'さん').join('・')
 ]));
 reviewDetails('📷 複数の園児に紐づいた集合写真 '+audit.sharedPhotos.length+'枚',
  audit.sharedPhotos.map(row=>row.photoIndex),'同じ元写真を複製せず、複数園児から参照しています。写っている園児が正しいか写真で確認してね。',sharedNames);
 if(audit.unnamedFolders.length){
  const section=document.createElement('details');section.className='final-audit-issue';
  const summary=document.createElement('summary');
  summary.textContent='📁 園児名が未設定の仮フォルダ '+audit.unnamedFolders.length+'件';
  section.append(summary);
  for(const [index,folder] of audit.unnamedFolders.entries()){
   const caption=document.createElement('p');caption.className='muted';
   caption.textContent='仮フォルダ '+(index+1)+'：顔'+folder.faceCount+'件・写真'+folder.photoIndexes.length+'枚';
   section.append(caption);
   if(folder.photoIndexes.length)section.append(photoGallery(folder.photoIndexes));
  }
  checks.append(section);
 }
 if(audit.excludedWithChildren.length){
  reviewDetails('👀 除外した顔と園児の顔が同じ元写真にある '+audit.excludedWithChildren.length+'枚',
   audit.excludedWithChildren,
   '職員や保護者が一緒に写った写真の可能性があります。除外した顔フォルダは園児として分類していません。元写真は消えません。');
 }
 renderProvisionalFinalControls(audit);
 updatePhotoCorrectionUndoButton();
}

function renderVerifiedPhotoFolders(){
 const panel=$('verifiedPhotoFoldersPanel');
 const title=$('verifiedPhotoFoldersHeading');
 const summary=$('verifiedPhotoFoldersStatus');
 const container=$('verifiedPhotoFoldersGrid');
 const warnings=$('verifiedPhotoFoldersWarnings');
 const correctionNotice=$('folderCorrectionNotice'),undoCorrection=$('undoFolderCorrection');
 if(!panel||!title||!summary||!container||!warnings)return;
 if(lastFolderCorrection&&lastFolderCorrection.afterSignature!==faceReviewSignature()){
  lastFolderCorrection=null;
 }
 if(undoCorrection)undoCorrection.hidden=!lastFolderCorrection;
 if(correctionNotice){
  correctionNotice.hidden=!folderCorrectionNoticeText;
  correctionNotice.textContent=folderCorrectionNoticeText;
 }
 container.replaceChildren();warnings.textContent='';
 if(!photoNames.length){
  panel.hidden=true;
  const exclude=$('excludedFaceFoldersPanel');if(exclude)exclude.hidden=true;
  const audit=$('finalPhotoAuditPanel');if(audit)audit.hidden=true;
  return;
 }
 panel.hidden=false;
 // Make the complete-original photo sorting area visible on first use only.
 // Do not force it open again after a teacher has intentionally collapsed it.
 if(!panel.dataset.photoSortingOpened){panel.open=true;panel.dataset.photoSortingOpened='1';}
 let {base,visible,model}=currentPhotoFolderView();
 if(visible.staleExclusions.length){
  for(const key of visible.staleExclusions)excludedVerifiedFolders.delete(key);
  folderManagementNotice='⚠️ 顔のグループ構成が変わったため、前の除外指定は解除されました。もう一度確認してください。';
  ({base,visible,model}=currentPhotoFolderView());
 }
 renderExcludedPhotoFolderRestores(visible);
 const validFolderKeys=new Set(model.buckets.map(provisionalPhotoFolderKey));
 const clean=trimPhotoFolderCorrections(photoFolderCorrections,validFolderKeys,photoNames.length);
 photoFolderCorrections.clear();for(const [photoIndex,entries] of clean)photoFolderCorrections.set(photoIndex,entries);
 let cancelledOldNames=0;
 for(const key of [...verifiedFolderNames.keys()]){
  if(!validFolderKeys.has(key)){verifiedFolderNames.delete(key);cancelledOldNames++;}
 }
 const namedModel=buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,manualPhotoFolderChoices,photoFolderCorrections);
 const validChildren=new Map(
  roster.filter(k=>k&&k.id!=null&&String(k.id).trim()&&String(k.name||'').trim())
   .map(k=>[String(k.id),String(k.name).trim()])
 );
 for(const error of [...namedModel.invalid,...namedModel.duplicates]){
  verifiedFolderNames.delete(error.key);
 }
 const namedCount=[...verifiedFolderNames.values()].filter(id=>validChildren.has(String(id))).length;
 const rosterStatus=$('verifiedFolderRosterStatus');
 if(rosterStatus&&roster.length){
  rosterStatus.textContent='✅ '+roster.length+'名の名簿を参照中 ／ 園児名の仮指定 '+namedCount+'/'+model.buckets.length+'フォルダ。'+
   (cancelledOldNames?' ⚠️ グループ変更のため、以前の名前の仮指定を'+cancelledOldNames+'件解除しました。もう一度選んでね。':'');
 }
 const confirmed=model.buckets.filter(b=>b.kind==='confirmed').length;
 const soloFolders=model.buckets.filter(b=>b.kind==='individual');
 const independent=soloFolders.filter(b=>b.independentlyDistinct).length;
 const unresolved=soloFolders.length-independent;
 title.textContent='🗂 園児の仮フォルダ：'+model.buckets.length+'件（確認済み '+confirmed+'・単独 '+model.buckets.filter(b=>b.kind==='individual').length+'・新規 '+visible.newFolderCount+'）';
 const managementInfo=$('folderManagementNotice');
 if(managementInfo){managementInfo.hidden=!folderManagementNotice;managementInfo.textContent=folderManagementNotice;}
 const seenPhotos=new Set(items.map(item=>item.sourcePhoto));
 const withoutFaces=photoNames.map((_,index)=>index).filter(index=>!seenPhotos.has(index));
 summary.textContent='先生の確認 '+model.reviewedPairs+'組 ／ 園児の候補として表示する顔 '+visible.faceCount+'/'+items.length+
  '件 ／ 除外した顔 '+visible.excludedFaceCount+'件 ／ 顔が見つかった写真 '+seenPhotos.size+'/'+photoNames.length+'枚';
 const countPerOriginalPhoto=new Map();
 model.buckets.forEach((bucket,index)=>{
  const card=document.createElement('article');
  card.className='teacher-card verified-folder-card';
  const key=provisionalPhotoFolderKey(bucket);
  const chosenChildId=verifiedFolderNames.get(key)||'';
  const child=validChildren.has(String(chosenChildId))?validChildren.get(String(chosenChildId)):null;
  if(child){
   const banner=document.createElement('div');banner.className='named-folder-header';
   banner.textContent='🌷 '+child+'さんの仮フォルダ';
   card.append(banner);
  }
  const naming=document.createElement('div');naming.className='folder-child-picker';
  const caption=document.createElement('span');caption.textContent='この顔の園児：';
  const picker=document.createElement('select');picker.setAttribute('aria-label','仮フォルダ'+(index+1)+'の園児名');
  const blank=document.createElement('option');blank.value='';blank.textContent='園児名を選ぶ（未設定）';picker.append(blank);
  for(const [id,name] of validChildren){
   const option=document.createElement('option');option.value=id;option.textContent=name;
   picker.append(option);
  }
  picker.value=String(chosenChildId);
  if(!roster.length){
   picker.disabled=true;
   const option=document.createElement('option');
   option.value='';option.textContent='先に園児名簿を読み込んでね';
   picker.replaceChildren(option);
  }
  picker.addEventListener('change',()=>{
   const newId=picker.value;
   const otherKey=[...verifiedFolderNames].find(([k,id])=>k!==key&&id===newId);
   if(newId&&otherKey){
    picker.value=String(chosenChildId);
    const notice=$('verifiedFolderRosterStatus');
    if(notice)notice.textContent='⚠️ この園児は別の仮フォルダに設定されています。先にそちらの名前を「未設定」に戻してね。';
    return;
   }
   if(newId)verifiedFolderNames.set(key,newId);
   else verifiedFolderNames.delete(key);
   renderFaceEvaluation();
  });
  naming.append(caption,picker);card.append(naming);
  const heading=document.createElement('strong');
  heading.textContent='仮フォルダ '+String(index+1).padStart(2,'0')+' ／ '+
   (bucket.kind==='manual'?'写真から作った新規フォルダ'+(bucket.customName?'「'+bucket.customName+'」':'')+'（顔検出なし）':
    bucket.kind==='confirmed'?'「同じ園児」記録で構成（顔'+bucket.members.length+'件・要目視確認）':
    bucket.independentlyDistinct?'ほかの顔とは別の園児（顔1件）':'単独の顔・園児未確定');
  card.append(heading);
  const faces=document.createElement('div');faces.className='faces';
  for(const id of bucket.members){
   const tile=document.createElement('div');tile.className='teacher-photo';
   const image=document.createElement('img');image.src=items[id].url;image.alt='顔'+(id+1);
   const description=document.createElement('span');
   description.textContent='顔'+(id+1);
   tile.append(image,description);faces.append(tile);
  }
  const faceHint=document.createElement('p');faceHint.className='muted';
  faceHint.textContent='👤 上の顔は本人を確認するための見本。下の写真は元画像全体です。';
  card.append(faces,faceHint);
  const subtitle=document.createElement('div');
  subtitle.className='muted';
  const galleryCount=correctedPhotoIndexes(bucket.photos,
   [...manualPhotoFolderChoices].filter(([,keys])=>keys.has(key)).map(([index])=>index),
   photoFolderCorrections,key).photoIndexes.length;
  subtitle.dataset.folderPhotoCount=key;
  subtitle.textContent='この園児が写る写真（'+galleryCount+'枚・仮）';
  card.append(subtitle);
  const photoList=document.createElement('div');
  for(const photoIndex of correctedPhotoIndexes(bucket.photos,
   [...manualPhotoFolderChoices].filter(([,keys])=>keys.has(key)).map(([index])=>index),
   photoFolderCorrections,key).photoIndexes){
   const chip=document.createElement('span');chip.className='folder-photo-chip';
   chip.textContent='写真'+(photoIndex+1);
   photoList.append(chip);
   countPerOriginalPhoto.set(photoIndex,(countPerOriginalPhoto.get(photoIndex)||0)+1);
  }
  photoList.dataset.verifiedPhotoFolder=key;
  card.append(photoList);
  const photoGallery=document.createElement('details');
  photoGallery.className='advanced';
  // Folder sorting should show the original photos immediately. Collapsing is optional.
  photoGallery.open=true;
  photoGallery.style.margin='8px 0';
  const galleryHeading=document.createElement('summary');
  galleryHeading.dataset.folderPhotoHeading=key;
  galleryHeading.textContent='🖼 元写真を全体表示（'+galleryCount+'枚・タップで移動／解除）';
  const photoGrid=document.createElement('div');
  photoGrid.className='folder-photo-gallery';
  photoGrid.dataset.folderPhotoGallery=key;
  const photoHint=document.createElement('p');photoHint.className='folder-photo-gallery-note';
  photoHint.textContent='写真の端まで見える縮小表示です。必要な写真をタップして拡大・修正してね。';
  photoGallery.append(galleryHeading,photoHint,photoGrid);card.append(photoGallery);
  appendFolderDeletionControl(card,bucket,key);
  if(bucket.kind==='confirmed'){
   const positive=[...verifiedFacePairs.values()].filter(pair=>
    pair.same&&bucket.members.includes(pair.i)&&bucket.members.includes(pair.j));
   if(positive.length){
    const review=document.createElement('details');
    review.className='folder-review-links';
    const summary=document.createElement('summary');
    summary.textContent='🔎 違う園児が混ざっている？ 以前の「同じ園児」'+positive.length+'組を見直す';
    review.append(summary);
    const note=document.createElement('p');note.className='muted';
    note.textContent='下の2枚ずつの顔を見て、実際には違う園児だった組だけ訂正してください。ほかの判定は変更しません。';
    review.append(note);
    positive.forEach(pair=>renderSamePairCorrection(review,pair));
    card.append(review);
   }
  }
  container.append(card);
 });
 renderMissingPhotoPicker(model,withoutFaces);
 const sharedPhotos=[...countPerOriginalPhoto].filter(([,count])=>count>1).map(([index])=>index+1);
 const issues=[];
 if(!model.allFacesCovered)issues.push('顔の件数が一致しません。全写真を確認してください。');
 if(model.hasSourcePhotoConflicts)issues.push('同じ写真の別の顔が同じフォルダに入りました。仮プレビューは利用しないでください。');
 if(model.contradictions.length)issues.push('先生の確認に矛盾が'+model.contradictions.length+'組あります。必ず確認してください。');
 if(model.contradictions.length){
  const review=document.createElement('details');review.className='folder-review-links';
  review.open=true;
  review.style.gridColumn='1 / -1';
  const heading=document.createElement('summary');
  heading.textContent='⚠️ 矛盾している顔の確認 '+model.contradictions.length+'組を見直す';
  review.append(heading);
  const explain=document.createElement('p');explain.className='muted';
  explain.textContent='訂正によって、別フォルダになった顔に以前の「同じ園児」判定が残っています。これらの顔を見て、誤りがあった組だけ変更してください。';
  review.append(explain);
  for(const pair of model.contradictions){
   if(pair.same)renderSamePairCorrection(review,pair);
  }
  container.append(review);
 }
 if(unresolved)issues.push('単独の顔'+unresolved+'件は、ほかの園児との違いが未確認です。');
 if(visible.excludedFaceCount)issues.push('園児以外として除外：'+visible.excludedFaceCount+'件（元写真はそのまま）');
 if(withoutFaces.length)issues.push('顔未検出の写真：'+withoutFaces.map(index=>'写真'+(index+1)).join('・')+'（手動確認が必要）');
 warnings.textContent=
  (issues.length?'⚠️ '+issues.join(' ／ '):'✅ 確認記録どうしの矛盾はありません（正しい園児の組かどうかは顔写真で確認してください）。')+
  (sharedPhotos.length?' ／ 📷 集合写真として複数のフォルダに表示：'+sharedPhotos.map(index=>'写真'+index).join('・'):'')+
  ' ／ この分類は画面上の仮プレビューです。元写真を複製・保存したり、アルバムを変更したりしません。';
 const report=$('faceEvaluationReport');
 if(report?.value){
  report.value+='\n【先生の確認からの写真別仮フォルダ】'+model.buckets.length+'件'+
   '（複数顔の確認済み '+confirmed+'・単独 '+soloFolders.length+'・新規 '+visible.newFolderCount+'）';
  report.value+='\n顔の分類 '+model.coveredFaces+'/'+items.length+'件 / 確認の矛盾 '+model.contradictions.length+'組';
  for(const bucket of model.buckets){
   report.value+='\n仮フォルダ'+String(bucket.id).padStart(2,'0')+' '+
    (bucket.kind==='manual'?'顔未検出から新規作成':bucket.kind==='confirmed'?'同じ園児確認済み':bucket.independentlyDistinct?'別人確認済み・単独':'単独保留')+
    '：'+(bucket.members.length?'顔'+bucket.members.map(id=>id+1).join('・'):'顔検出なし')+
    ' / '+new Set([...bucket.photos,
     ...[...manualPhotoFolderChoices].filter(([,keys])=>keys.has(provisionalPhotoFolderKey(bucket))).map(([index])=>index)]).size+
    '枚の元写真を参照';
  }
  if(withoutFaces.length)report.value+='\n顔未検出：写真'+withoutFaces.map(i=>i+1).join('・');
  report.value+='\n【園児名との仮紐づけ】'+namedCount+'/'+model.buckets.length+
   'フォルダ（園児名・園児IDは検証結果に含めません）';
  if(visible.excluded.length)report.value+='\n【園児以外として除外】'+visible.excluded.length+'フォルダ / 顔'+visible.excludedFaceCount+'件'+
   visible.excluded.map(b=>'\n除外した顔：'+b.members.map(i=>i+1).join('・')).join('');
  if(visible.newFolderCount)report.value+='\n【写真から作った新規フォルダ】'+visible.newFolderCount+'件（名前は含めません）';
 }
}

function renderTeacherConfirmedOverview(){
 const panel=$('teacherConfirmedDetails'),heading=$('teacherConfirmedHeading');
 const host=$('teacherConfirmedGroups'),pendingHost=$('teacherUnclassifiedFaces'),note=$('teacherGroupNote');
 if(!panel||!heading||!host||!pendingHost||!note)return;
 if(!items.length||!verifiedFacePairs.size){panel.hidden=true;host.replaceChildren();pendingHost.replaceChildren();return;}
 panel.hidden=false;host.replaceChildren();pendingHost.replaceChildren();
 const photos=items.map(item=>item.sourcePhoto);
 const feedback=[...verifiedFacePairs.values()];
 // Staff/non-child face folders are excluded from the nursery-child overview,
 // while the original reviewed pairs remain available for diagnostic export.
 const nurseryView=currentPhotoFolderView().model.buckets;
 const groups=nurseryView.filter(bucket=>bucket.kind==='confirmed').map(bucket=>bucket.members);
 const remaining=nurseryView.filter(bucket=>bucket.kind==='individual').flatMap(bucket=>bucket.members);
 const assigned=new Set(groups.flat());
 heading.textContent='📚 先生が確認した '+groups.length+'グループ（顔'+assigned.size+'件） ／ 単独 '+remaining.length+'件';
 const imageTile=id=>{
  const tile=document.createElement('div');tile.className='teacher-photo';
  const image=document.createElement('img');image.src=items[id].url;
  image.alt='顔'+(id+1)+'（写真'+(items[id].sourcePhoto+1)+'）';
  const label=document.createElement('span');
  label.textContent='顔'+(id+1)+'・写真'+(items[id].sourcePhoto+1);
  tile.append(image,label);return tile;
 };
 groups.forEach((members,index)=>{
  const card=document.createElement('div');card.className='teacher-card';
  const title=document.createElement('strong');
  title.textContent='園児グループ '+(index+1)+'（顔'+members.length+'件・先生が確認済み）';
  const faces=document.createElement('div');faces.className='faces';
  members.forEach(id=>faces.append(imageTile(id)));
  card.append(title,faces);host.append(card);
 });
 if(!groups.length){
  const empty=document.createElement('p');empty.className='muted';
  empty.textContent='「同じ園児」の確認がまだないので、先生の確認済みグループはありません。';
  host.append(empty);
 }
 const title=document.createElement('strong');
 title.textContent='まだ他の顔とまとめていない単独の顔 '+remaining.length+'件';
 pendingHost.append(title);
 const faces=document.createElement('div');faces.className='teacher-unassigned';
 remaining.forEach(id=>faces.append(imageTile(id)));
 pendingHost.append(faces);
 const canJoin=(face,members)=>members.every(id=>photos[face]!==photos[id]&&
  !feedback.some(p=>!p.same&&((p.i===face&&p.j===id)||(p.j===face&&p.i===id))));
 const excludedAll=groups.length>0&&remaining.every(id=>groups.every(g=>!canJoin(id,g)));
 note.textContent=excludedAll?
  '未分類の顔は、確認済みの「違う園児」または同じ写真の別顔という条件により、既存の全グループには追加できません。未分類の顔同士で新しい園児グループを探します。':
  '未分類の顔は同一人物か確定していません。先生の確認が増えると、この一覧は自動で整理されます。';
 const report=$('faceEvaluationReport');
 if(report?.value){
  report.value+='\n【先生の確認済みグループ】'+groups.length+'組・顔'+assigned.size+'件 / 未分類 '+remaining.length+'件';
  groups.forEach((members,index)=>{report.value+='\nグループ'+(index+1)+'：'+members.map(id=>'顔'+(id+1)).join('・');});
  report.value+='\n未分類：'+remaining.map(id=>'顔'+(id+1)).join('・');
 }
}

function renderQuickReview(){
 renderTeacherConfirmedOverview();
 renderVerifiedPhotoFolders();
 const summary=$('quickReviewSummary'),host=$('quickReviewCandidates');
 const copy=$('copyQuickReport');if(copy)copy.disabled=!items.length;
 if(!summary||!host)return;
 host.replaceChildren();
 if(!items.length){
  summary.textContent=photoNames.length?'顔を検出できませんでした。下の「写真を整理」から手動で新規フォルダを作れます。':'先に写真を解析してください。';
  const restoreHint=$('restoreHint');if(restoreHint)restoreHint.hidden=true;
  return;
 }
 const lookup=currentFaceGroupIndex();
 const feedback=[...verifiedFacePairs.values()];
 const falseSplits=feedback.filter(p=>p.same&&lookup.get(p.i)!==lookup.get(p.j)).length;
 const falseMerges=feedback.filter(p=>!p.same&&lookup.get(p.i)===lookup.get(p.j)).length;
 const activeCount=groups.filter(g=>g.id!=='unknown'&&g.members.length).length;
 const hiddenFaces=getExcludedFaceIndexes();
 if(r50Compared&&items.every(item=>Array.isArray(item.r50Vector))){
  const photos=items.map(item=>item.sourcePhoto);
  const teacherSeeds=buildTeacherSeedGroups(photos,feedback).filter(
   members=>members.every(i=>!hiddenFaces.has(i))
  );
  if(teacherSeeds.length){
   const suggestions=suggestTeacherSeedPairs(
    photos,feedback,(i,j)=>similarity(items[i].r50Vector,items[j].r50Vector),items.length
   ).filter(pair=>!hiddenFaces.has(pair.face)&&pair.members.every(i=>!hiddenFaces.has(i))).slice(0,6);
   const quickReport=$('faceEvaluationReport');
   if(quickReport?.value){
    quickReport.value+='\n【R50の確認候補】確認済みの園児グループ '+teacherSeeds.length+'組 / 未確認の候補 '+suggestions.length+'件';
    for(const suggestion of suggestions){
     quickReport.value+='\n顔'+(suggestion.face+1)+' → 確認済みグループ代表・顔'+(suggestion.anchor+1)+
      '：平均 '+suggestion.mean.toFixed(4)+
      (suggestion.margin===null?' / 次点なし':' / 次点との差 '+suggestion.margin.toFixed(4))+
      ' / 先生の確認待ち';
    }
   }
   summary.textContent='🧠 R50の仮候補 ／ 先生が確認した園児の集まり '+teacherSeeds.length+
    '組 ／ 未確認の顔から '+suggestions.length+'件を表示。正誤は先生の確認が必要です。';
   const note=document.createElement('p');note.className='muted';note.style.gridColumn='1/-1';
   note.textContent='過去の「同じ園児」の確認を基準に、まだ分類していない顔を提案します。確率ではなく似ている順の参考です。「同じ／違う」を選んでもアルバムは変更されません。';
   host.append(note);
   for(const suggestion of suggestions){
    const card=document.createElement('article');card.className='pair-card';
    const heading=document.createElement('strong');
    heading.textContent='顔'+(suggestion.face+1)+' は、この確認済みグループ？';
    card.append(heading);
    const row=document.createElement('div');row.className='pair-faces';
    const present=(face,label)=>{
     const figure=document.createElement('figure');
     const img=document.createElement('img');img.src=items[face].url;
     img.alt='顔'+(face+1);figure.append(img);
     const caption=document.createElement('figcaption');
     caption.textContent=label+'・顔'+(face+1)+'（写真'+(items[face].sourcePhoto+1)+'）';
     figure.append(caption);row.append(figure);
    };
    present(suggestion.face,'未確認');
    present(suggestion.anchor,'確認済み');
    if(suggestion.members.length>2){
     const other=suggestion.members.find(id=>id!==suggestion.anchor);
     if(other!==undefined)present(other,'同じ園児');
    }
    card.append(row);
    const desc=document.createElement('p');desc.className='muted';
    desc.textContent='グループ内の確認済み顔 '+suggestion.members.length+
     '件 ／ R50平均 '+suggestion.mean.toFixed(3)+
     (suggestion.margin===null?' ／ 比較できる別グループなし':' ／ 次点との差 '+suggestion.margin.toFixed(3))+
     '（正解率ではありません）';
    card.append(desc);
    if(suggestion.margin!==null&&suggestion.margin<0.08){
     const warn=document.createElement('p');warn.className='muted';
     warn.textContent='⚠️ 別グループとも似ているため、顔写真を確認してね。';
     card.append(warn);
    }
    const actions=document.createElement('div');actions.className='actions';
    for(const [same,label] of [[true,'✅ 同じ園児'],[false,'違う園児']]){
     const button=document.createElement('button');button.type='button';
     if(!same)button.className='secondary';button.textContent=label;
     button.addEventListener('click',()=>{
      const i=suggestion.face,j=suggestion.anchor;
      verifiedFacePairs.set(facePairKey(i,j),{i,j,same});
      renderFaceEvaluation();
     });
     actions.append(button);
    }
    card.append(actions);host.append(card);
   }
   if(!suggestions.length){
    // Remaining faces cannot be added to the four confirmed groups:
    // suggest possible NEW children among those faces instead.
    const unassignedPairs=suggestUnassignedFacePairs(
     photos,feedback,
     (i,j)=>pairScore(i,j),
     (i,j)=>similarity(items[i].r50Vector,items[j].r50Vector),
     items.length*items.length
    ).filter(pair=>!hiddenFaces.has(pair.i)&&!hiddenFaces.has(pair.j)).slice(0,3);
    const currentReview=currentPhotoFolderView().model;
    const currentSingles=currentReview.buckets.filter(bucket=>bucket.kind==='individual');
    const allSinglesDifferent=currentSingles.length>0&&currentSingles.every(bucket=>bucket.independentlyDistinct);
    summary.textContent=unassignedPairs.length?
     '🧠 確認済み'+teacherSeeds.length+'グループへの追加候補なし ／ 未確認の顔同士 '+unassignedPairs.length+'組を確認できます。':
     '✅ 園児候補は'+currentReview.buckets.length+'つの仮フォルダに整理できます。追加確認候補はありません。';
    note.textContent=unassignedPairs.length?
     '未分類の顔同士を軽量AIとR50の順位で比較しました。正しい園児かは先生の判断が必要です。':
     (allSinglesDifferent?
      '残った単独の顔は、既存グループとも互いとも「違う園児」と確認済みです。追加候補0件は正常です。':
      'まだ確認していない安全な候補はありません。必要なら、ほかの顔の組を個別に確認できます。');
    if(quickReport?.value){
     quickReport.value+='\n【未分類の顔同士の確認候補】'+unassignedPairs.length+'組（軽量・R50の平均順位）';
    }
    for(const suggestion of unassignedPairs){
     const card=document.createElement('article');card.className='pair-card';
     const heading=document.createElement('strong');
     heading.textContent='新しい園児グループかも？';
     card.append(heading);
     const faces=document.createElement('div');faces.className='pair-faces';
     for(const id of [suggestion.i,suggestion.j]){
      const figure=document.createElement('figure');
      const img=document.createElement('img');img.src=items[id].url;img.alt='顔'+(id+1);
      const caption=document.createElement('figcaption');
      caption.textContent='顔'+(id+1)+'・写真'+(items[id].sourcePhoto+1);
      figure.append(img,caption);faces.append(figure);
     }
     card.append(faces);
     const score=document.createElement('p');score.className='muted';
     score.textContent='軽量モデル '+suggestion.lightScore.toFixed(3)+
      ' ／ R50 '+suggestion.r50Score.toFixed(3)+'（モデルごとに尺度が異なり、正解率ではありません）';
     card.append(score);
     const actions=document.createElement('div');actions.className='actions';
     for(const [same,label] of [[true,'✅ 同じ園児'],[false,'違う園児']]){
      const button=document.createElement('button');button.type='button';
      button.textContent=label;if(!same)button.className='secondary';
      button.addEventListener('click',()=>{
       verifiedFacePairs.set(facePairKey(suggestion.i,suggestion.j),{i:suggestion.i,j:suggestion.j,same});
       renderFaceEvaluation();
      });
      actions.append(button);
     }
     card.append(actions);host.append(card);
     if(quickReport?.value){
      quickReport.value+='\n顔'+(suggestion.i+1)+' ↔ 顔'+(suggestion.j+1)+
       '：軽量 '+suggestion.lightScore.toFixed(4)+' / R50 '+suggestion.r50Score.toFixed(4)+'（先生の確認待ち）';
     }
    }
    if(!unassignedPairs.length){
     const done=document.createElement('p');done.className='muted';
     done.textContent='未分類の顔同士も、まだ確認していない安全な組み合わせはありません。顔一覧から個別に確認できます。';
     host.append(done);
    }
   }
   return;
  }
 }
 summary.textContent='AIの仮グループ '+activeCount+'件 ／ 先生の確認 '+feedback.length+'組'+
  (feedback.length?' ／ 確認した範囲で：分かれた同じ園児 '+falseSplits+'組・混ざった別の園児 '+falseMerges+'組':' ／ 精度：未評価（先生の確認を読み込むと比較できます）');
 const restoreHint=$('restoreHint');if(restoreHint)restoreHint.hidden=feedback.length>0;
 const sameGroup=[],differentGroup=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  if(items[i].sourcePhoto===items[j].sourcePhoto)continue;
  const key=facePairKey(i,j);
  if(verifiedFacePairs.has(key))continue;
  const score=pairScore(i,j);
  if(!Number.isFinite(score))continue;
  if(lookup.get(i)===lookup.get(j)&&lookup.has(i)){
   sameGroup.push({i,j,score,type:'inside'});
  }else if(score>=Math.max(0.50,Number($('threshold').value)-0.15)){
   differentGroup.push({i,j,score,type:'outside'});
  }
 }
 sameGroup.sort((a,b)=>a.score-b.score);
 differentGroup.sort((a,b)=>b.score-a.score);
 const suggestions=[...sameGroup.slice(0,3),...differentGroup.slice(0,5)];
 if(!suggestions.length){
  const note=document.createElement('p');note.className='muted';
  note.textContent='自動で見つかった確認候補はありません。低い比較値でも同じ園児の場合があるので、「ほかの顔を選ぶ」から確認できます。';
  host.append(note);return;
 }
 const notice=document.createElement('p');notice.className='muted';
 notice.style.gridColumn='1/-1';
 notice.textContent='顔の比較値から最大8組を表示（正しさの保証はありません）。ここにない同じ園児もいます。';
 host.append(notice);
 for(const pair of suggestions){
  const card=document.createElement('article');card.className='pair-card';
  const heading=document.createElement('strong');
  heading.textContent=pair.type==='inside'?'同じグループ内の2人を確認':'別グループの似ている顔を確認';
  card.append(heading);
  const row=document.createElement('div');row.className='pair-faces';
  for(const id of [pair.i,pair.j]){
   const figure=document.createElement('figure');
   const image=document.createElement('img');image.src=items[id].url;image.alt='顔'+(id+1);
   const caption=document.createElement('figcaption');
   caption.textContent='顔'+(id+1)+'・写真'+(items[id].sourcePhoto+1);
   figure.append(image,caption);row.append(figure);
  }
  card.append(row);
  const score=document.createElement('p');score.className='muted';
  score.textContent='比較値 '+pair.score.toFixed(3)+'（正解率ではありません）';card.append(score);
  const buttons=document.createElement('div');buttons.className='actions';
  for(const [same,label] of [[true,'同じ園児'],[false,'違う園児']]){
   const button=document.createElement('button');button.type='button';
   if(!same)button.className='secondary';
   button.textContent=label;
   button.addEventListener('click',()=>{
    verifiedFacePairs.set(facePairKey(pair.i,pair.j),{i:pair.i,j:pair.j,same});
    renderFaceEvaluation();
   });
   buttons.append(button);
  }
  card.append(buttons);host.append(card);
 }
}

function renderEyelidComparison(){
 const host=$('eyelidComparison'),quick=$('eyelidQuickSummary');
 if(quick){quick.hidden=true;quick.textContent='';}
 if(!host)return;
 host.replaceChildren();
 if(!items.length){host.textContent='先に写真を解析してください。';return;}
 const available=items.filter(item=>Array.isArray(item.alternateVector)&&item.alternateVector.length===item.vector.length).length;
 if(!available){host.textContent='この解析では高画質補正を比較していません。写真解析前に「高画質＋まぶた補正を比較」をオンにしてください。';return;}
 const caption=document.createElement('p');caption.className='muted';
 caption.textContent='比較できた顔 '+available+'/'+items.length+'件。初回の特徴データはそのままです。';
 host.append(caption);
 const labeled=[...verifiedFacePairs.values()].map(pair=>{
  const a=items[pair.i],b=items[pair.j];
  if(!a?.alternateVector||!b?.alternateVector)return null;
  const oldScore=pairScore(pair.i,pair.j),newScore=similarity(a.alternateVector,b.alternateVector);
  if(!Number.isFinite(oldScore)||!Number.isFinite(newScore))return null;
  const delta=newScore-oldScore;
  return {...pair,oldScore,newScore,delta,improved:pair.same?delta>0:delta<0};
 }).filter(Boolean);
 if(!labeled.length){
  const note=document.createElement('p');note.className='muted';
  note.textContent='先生が同じ園児・違う園児と確認した組み合わせを使って比較します。「前回の判定を読み込む」か顔を確認すると、数値が出ます。';
  host.append(note);return;
 }
 const better=labeled.filter(p=>p.improved).length;
 const worse=labeled.filter(p=>!p.improved&&Math.abs(p.delta)>0.001).length;
 if(quick){
  quick.hidden=false;
  quick.textContent='🔬 顔補正2方式を比較：先生の確認'+labeled.length+'組中、比較値が改善方向 '+better+'組・悪化方向 '+worse+'組（自動統合には使っていません）';
 }
 const summary=document.createElement('p');
 summary.textContent='確認した'+labeled.length+'組中：改善方向 '+better+'組 ／ 悪化方向 '+worse+'組（比較値だけの参考。本人確認の精度保証ではありません）';
 host.append(summary);
 const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:13px';
 const header=document.createElement('tr');
 for(const value of ['顔の組','従来補正','高画質補正','変化']){
  const th=document.createElement('th');th.textContent=value;th.style.cssText='text-align:left;padding:7px 4px;border-bottom:1px solid #dbe2ed';header.append(th);
 }
 table.append(header);
 for(const pair of labeled){
  const row=document.createElement('tr');
  const values=[
   '顔'+(pair.i+1)+' ↔ 顔'+(pair.j+1)+'（'+(pair.same?'同じ園児':'違う園児')+'）',
   pair.oldScore.toFixed(4),
   pair.newScore.toFixed(4),
   (pair.delta>0?'+':'')+pair.delta.toFixed(4)
  ];
  for(const v of values){
   const td=document.createElement('td');td.textContent=v;td.style.cssText='padding:7px 4px;border-bottom:1px solid #edf1f6';row.append(td);
  }
  table.append(row);
 }
 const wrap=document.createElement('div');wrap.style.overflowX='auto';wrap.append(table);host.append(wrap);
 const note=document.createElement('p');note.className='muted';
 note.textContent='比較値の上昇が常に正解とは限りません。違う園児同士の検証も含めて総合的に判断し、実測で改善すると分かるまでは自動グループ化に使いません。';
 host.append(note);
 const report=$('faceEvaluationReport');
 if(report&&report.value){
  report.value+='\n【顔補正比較：元画質＋まぶた】'+labeled.length+'組 ／ 改善方向 '+better+'組 ／ 悪化方向 '+worse+'組';
  for(const pair of labeled){
   report.value+='\n顔'+(pair.i+1)+' ↔ 顔'+(pair.j+1)+' '+(pair.same?'同じ園児':'違う園児')+'：従来 '+pair.oldScore.toFixed(4)+' / 高画質補正 '+pair.newScore.toFixed(4);
  }
 }
}

// Model comparison is read-only. Vectors and aligned tensors stay in RAM.
// Similarities from different networks have different scales: only their
// ranking against held-out negative examples is comparable.
function scoreSeparation(positives,negatives){
 if(!positives.length||!negatives.length)return null;
 let wins=0,total=0;
 for(const p of positives)for(const n of negatives){
  if(!Number.isFinite(p)||!Number.isFinite(n))continue;
  total++;
  if(p>n)wins++;
  else if(p===n)wins+=.5;
 }
 return total?wins/total:null;
}
function renderR50Comparison(){
 const button=$('compareRecognitionModels'),host=$('r50CompareResult');
 if(button)button.disabled=r50CompareRunning||r50Compared||!items.length||!items.every(item=>item.recognitionInput?.length===3*112*112);
 if(!host)return;
 host.replaceChildren();
 if(!r50Compared)return;
 const verified=[...verifiedFacePairs.values()];
 const same=verified.filter(p=>p.same);
 const confirmedDifferent=verified.filter(p=>!p.same);
 const withinPhoto=[];
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  if(items[i].sourcePhoto===items[j].sourcePhoto&&
     !verifiedFacePairs.has(facePairKey(i,j))){
   withinPhoto.push({i,j});
  }
 }
 const different=confirmedDifferent.length?confirmedDifferent:withinPhoto;
 const useInferred=confirmedDifferent.length===0;
 const oldScores=pairs=>pairs.map(p=>pairScore(p.i,p.j)).filter(Number.isFinite);
 const r50Scores=pairs=>pairs.map(p=>similarity(items[p.i].r50Vector,items[p.j].r50Vector)).filter(Number.isFinite);
 const smallRate=scoreSeparation(oldScores(same),oldScores(different));
 const largeRate=scoreSeparation(r50Scores(same),r50Scores(different));
 const summary=document.createElement('p');
 summary.textContent='🧠 別モデル比較：確認済みの同じ園児 '+same.length+'組、'+
  (useInferred?'同じ写真内の別顔（参考）':'確認済みの違う園児')+' '+different.length+'組。';
 host.append(summary);
 if(smallRate!==null&&largeRate!==null){
  const metric=document.createElement('p');metric.style.fontWeight='700';
  metric.textContent='一致組が別人組より高い比較値になった割合：軽量 '+(smallRate*100).toFixed(1)+'% ／ R50 '+(largeRate*100).toFixed(1)+'%';
  host.append(metric);
 }else{
  const needed=document.createElement('p');needed.className='muted';
  needed.textContent='同じ園児の確認または比較する別人組が足りません。先生の確認が追加されたら再計算します。';
  host.append(needed);
 }
 if(same.length){
  const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:13px';
  const head=document.createElement('tr');
  for(const label of ['確認した同じ園児','軽量モデル','R50モデル']){
   const th=document.createElement('th');th.textContent=label;th.style.cssText='padding:8px 5px;text-align:left;border-bottom:1px solid #dbe2ed';head.append(th);
  }
  table.append(head);
  for(const pair of same){
   const row=document.createElement('tr');
   for(const value of ['顔'+(pair.i+1)+' ↔ 顔'+(pair.j+1),pairScore(pair.i,pair.j).toFixed(4),similarity(items[pair.i].r50Vector,items[pair.j].r50Vector).toFixed(4)]){
    const cell=document.createElement('td');cell.textContent=value;cell.style.cssText='padding:8px 5px;border-bottom:1px solid #edf1f6';row.append(cell);
   }
   table.append(row);
  }
  const wrap=document.createElement('div');wrap.style.overflowX='auto';wrap.append(table);host.append(wrap);
 }
 const caution=document.createElement('p');caution.className='muted';
 caution.textContent='⚠️ 2つのモデルで比較値の尺度が違うため、個々の数値を直接比べて精度を判断できません。'+
  (useInferred?'同じ写真の別顔は「別人」と仮定した参考例で、先生の確認ではありません。':'結果は先生が確認した組の範囲内です。')+
  ' 実際の自動グループ分けは変更していません。';
 host.append(caution);
 const report=$('faceEvaluationReport');
 if(report?.value){
  report.value+='\n【別AIモデル比較：軽量とArcFace R50】';
  report.value+='\n同じ園児の確認 '+same.length+'組 / '+(useInferred?'同じ写真の別顔（参考）':'違う園児の確認')+' '+different.length+'組';
  report.value+='\n比較値の順位による分離率：軽量 '+(smallRate===null?'未評価':(smallRate*100).toFixed(1)+'%')+' / R50 '+(largeRate===null?'未評価':(largeRate*100).toFixed(1)+'%');
  for(const pair of same){
   report.value+='\n顔'+(pair.i+1)+' ↔ 顔'+(pair.j+1)+' 同じ園児：軽量 '+pairScore(pair.i,pair.j).toFixed(4)+' / R50 '+similarity(items[pair.i].r50Vector,items[pair.j].r50Vector).toFixed(4);
  }
 }
}
$('compareRecognitionModels')?.addEventListener('click',async()=>{
 const button=$('compareRecognitionModels'),message=$('r50CompareStatus');
 if(r50CompareRunning||r50Compared)return;
 if(!items.length||!items.every(item=>item.recognitionInput?.length===3*112*112)){
  if(message)message.textContent='先に写真を解析してください。顔を再検出する必要はありません。';
  return;
 }
 r50CompareRunning=true;
 if(button)button.disabled=true;
 const wasStartDisabled=start.disabled;
 start.disabled=true;
 let session;
 try{
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  if(message)message.textContent='高精度モデルをダウンロード・準備しています（約174MB）。写真は送信しません。';
  const ort=await import(base+'ort.min.mjs');
  ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=base;ort.env.wasm.numThreads=1;ort.env.wasm.simd=false;
  const url='https://huggingface.co/globalnebula/insightface-buffalo-l-onnx/resolve/main/arcface_w600k_r50.onnx';
  session=await ort.InferenceSession.create(url,{
   executionProviders:['wasm'],graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false
  });
  if(session.inputNames.length!==1||session.outputNames.length<1)throw Error('モデル入出力が未対応');
  const inputName=session.inputNames[0],outputName=session.outputNames[0];
  const vectors=[];
  for(let i=0;i<items.length;i++){
   if(message)message.textContent='R50で顔の特徴を比較中 '+(i+1)+' / '+items.length+'（写真は再解析していません）';
   const inputs={[inputName]:new ort.Tensor('float32',items[i].recognitionInput,[1,3,112,112])};
   const output=await session.run(inputs);
   const vector=Array.from(output[outputName]?.data||[]);
   if(vector.length!==512||vector.some(value=>!Number.isFinite(value)))throw Error('顔'+(i+1)+'のR50特徴出力が不正');
   vectors.push(vector);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  for(let i=0;i<items.length;i++)items[i].r50Vector=vectors[i];
  r50Compared=true;
  if(message)message.textContent='✅ R50で'+vectors.length+'件の顔を比較しました。写真・園児名は送信せず、元のグループは変更していません。';
 }catch(error){
  if(message)message.textContent='⚠️ R50の比較を完了できませんでした：'+String(error?.message||error).slice(0,160)+'。従来の認識結果はそのままです。';
  console.warn('Optional R50 model comparison failed',error);
 }finally{
  try{await session?.release()}catch{}
  r50CompareRunning=false;start.disabled=wasStartDisabled;
  renderFaceEvaluation();
 }
});

function renderFaceEvaluation(){
 const gallery=$('faceEvaluationGallery'),choice=$('faceEvaluationChoice'),results=$('faceEvaluationResults');
 if(!gallery||!choice||!results)return;
 gallery.replaceChildren();choice.replaceChildren();results.replaceChildren();
 const report=$('faceEvaluationReport');if(report)report.value='';
 const current=currentFaceGroupIndex();
 if(!items.length){
  results.textContent='写真を解析すると顔の一覧が表示されます。';
  renderQuickReview();
  renderEyelidComparison();
  renderR50Comparison();
  updateMissingPhotoReport();
  return;
 }
 const summary=document.createElement('p');
 summary.className='muted';
 const baselineSame=(i,j)=>initialFaceGroups[i]!=null&&initialFaceGroups[i]===initialFaceGroups[j];
 const currentSame=(i,j)=>current.has(i)&&current.get(i)===current.get(j);
 renderSimulationResult();
 const feedback=[...verifiedFacePairs.values()];
 const errorCounts=(sameFn)=>feedback.filter(pair=>sameFn(pair.i,pair.j)!==pair.same).length;
 const conflicts=groups.slice(1).reduce((count,g)=>{
  const photos=g.members.map(id=>items[id]?.sourcePhoto);
  return count+photos.length-new Set(photos).size;
 },0);
 summary.textContent='先生の確認 '+feedback.length+'組 ／ 初回AIの不一致 '+errorCounts(baselineSame)+'組 → 現在の不一致 '+errorCounts(currentSame)+'組 ／ 同じ写真の別顔の混在 '+conflicts+'組';
 results.append(summary);
 if(report){
  const currentCount=groups.filter(g=>g.id!=='unknown'&&g.members.length).length;
  report.value=[
   '【顔グループ検証】写真や園児名は含みません',
   '写真数 '+photoNames.length+' / 検出顔 '+items.length,
   'AI初回グループ '+(initialGroupCount??'未取得')+' / 現在 '+currentCount,
   '先生が確認した顔の組 '+feedback.length,
   '初回の誤判定 '+errorCounts(baselineSame)+' / 現在の誤判定 '+errorCounts(currentSame),
   '同じ写真の別顔の混在 '+conflicts,
   ...feedback.map(pair=>{
    const score=pairScore(pair.i,pair.j);
    return '顔'+(pair.i+1)+'(写真'+(items[pair.i].sourcePhoto+1)+') ↔ 顔'+(pair.j+1)+'(写真'+(items[pair.j].sourcePhoto+1)+')：'+(pair.same?'同じ園児':'違う園児')+' / 値 '+(Number.isFinite(score)?score.toFixed(4):'不明')+' / AI初回 '+(baselineSame(pair.i,pair.j)?'同':'別')+' / 現在 '+(currentSame(pair.i,pair.j)?'同':'別');
   })
  ].join('\n');
  if(alternativeGrouping){
   const simulated=new Map();
   for(const g of alternativeGrouping)for(const id of g.members)simulated.set(id,g.id);
   const wrong=feedback.filter(p=>(simulated.get(p.i)===simulated.get(p.j))!==p.same).length;
   report.value+='\n別方式の試算 '+alternativeGrouping.length+'グループ / 確認済みとの不一致 '+wrong+'組';
  }
 }
  if(report&&evidenceVariants){
   for(const variant of evidenceVariants){
    const membership=new Map();
    for(const g of variant.groups)for(const id of g.members)membership.set(id,g.id);
    const missed=feedback.filter(p=>(membership.get(p.i)===membership.get(p.j))!==p.same).length;
    report.value+='\n'+variant.label+': '+variant.groups.length+'グループ / 確認済みと不一致 '+missed+'組';
   }
  }
 const sameScores=feedback.filter(p=>p.same).map(p=>pairScore(p.i,p.j)).filter(Number.isFinite);
 const differentScores=feedback.filter(p=>!p.same).map(p=>pairScore(p.i,p.j)).filter(Number.isFinite);
 if(sameScores.length||differentScores.length){
  const evidence=document.createElement('p');evidence.className='muted';
  evidence.textContent='📏 確認済みの比較値：同じ園児 '+(sameScores.length?Math.min(...sameScores).toFixed(3)+'以上':'未記録')+' ／ 違う園児 '+(differentScores.length?Math.max(...differentScores).toFixed(3)+'以下':'未記録')+
   (sameScores.length&&differentScores.length&&Math.max(...differentScores)>=Math.min(...sameScores)?'。⚠️ 比較値が重なっているため、単一の基準ではこの組み合わせを分けられません。':'');
  results.append(evidence);
 }
 const help=document.createElement('p');help.className='muted';
 help.textContent='下の顔から2件をタップして「同じ園児」「違う園児」を記録。AIの判定と比較します。判定してもAIグループは移動しません。先生が上の保存ボタンを押した場合だけ、この端末に記録します。';
 results.append(help);
 const chosen=selectedReviewFaces;
 for(let id=0;id<items.length;id++){
  const face=items[id],button=document.createElement('button');
  button.type='button';button.className='secondary';button.style.cssText='padding:5px;min-width:66px;border:2px solid '+(chosen.includes(id)?'#176ad6':'transparent')+';background:#edf3fa;color:#263344';
  button.setAttribute('aria-pressed',String(chosen.includes(id)));
  button.setAttribute('aria-label','顔'+(id+1)+'、写真'+(face.sourcePhoto+1)+'枚目');
  const img=document.createElement('img');img.src=face.url;img.alt='顔'+(id+1);img.style.cssText='width:56px;height:56px;object-fit:cover;border-radius:7px;display:block';
  const caption=document.createElement('span');caption.textContent='顔'+(id+1);caption.style.cssText='font-size:11px;display:block';
  button.append(img,caption);
  button.addEventListener('click',()=>{
   if(selectedReviewFaces.includes(id))selectedReviewFaces=selectedReviewFaces.filter(n=>n!==id);
   else if(selectedReviewFaces.length===2)selectedReviewFaces=[id];
   else selectedReviewFaces.push(id);
   renderFaceEvaluation();
  });
  gallery.append(button);
 }
 if(chosen.length===2){
  const [i,j]=chosen,score=pairScore(i,j);
  const row=document.createElement('p');row.className='muted';
  row.textContent='顔'+(i+1)+'（'+(items[i].sourcePhoto+1)+'枚目）と顔'+(j+1)+'（'+(items[j].sourcePhoto+1)+'枚目） ／ 比較値 '+(Number.isFinite(score)?score.toFixed(4):'算出不可')+' ／ AI初回：'+(baselineSame(i,j)?'同じグループ':'別グループ')+' ／ 現在：'+(currentSame(i,j)?'同じグループ':'別グループ');
  choice.append(row);
  const actions=document.createElement('div');actions.className='actions';
  if(items[i].sourcePhoto===items[j].sourcePhoto){
   const warning=document.createElement('p');warning.className='muted';
   warning.textContent='同じ写真で別々に検出された顔です。同じ園児としては登録できません。';
   choice.append(warning);
  }
  for(const [same,label] of [[true,'✅ 同じ園児'],[false,'🚫 違う園児']]){
   const button=document.createElement('button');button.type='button';
   button.className=same?'':'secondary';button.textContent=label;
   if(same&&items[i].sourcePhoto===items[j].sourcePhoto)button.disabled=true;
   button.addEventListener('click',()=>{
    verifiedFacePairs.set(facePairKey(i,j),{i,j,same});
    selectedReviewFaces=[];
    renderFaceEvaluation();
   });
   actions.append(button);
  }
  choice.append(actions);
 }else{
  const note=document.createElement('p');note.className='muted';
  note.textContent='比較する顔をあと'+(2-chosen.length)+'件選んでね。';
  choice.append(note);
 }
 if(feedback.length){
  const title=document.createElement('strong');title.textContent='先生が確認した組み合わせ';results.append(title);
  for(const pair of feedback){
   const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #e8edf3;flex-wrap:wrap';
   for(const id of [pair.i,pair.j]){
    const img=document.createElement('img');img.src=items[id].url;img.alt='顔'+(id+1);img.style.cssText='width:45px;height:45px;object-fit:cover;border-radius:7px';row.append(img);
   }
   const label=document.createElement('span');label.className='muted';
   label.textContent=(pair.same?'同じ園児':'違う園児')+' ／ 初回'+(baselineSame(pair.i,pair.j)===pair.same?'一致':'不一致')+'・現在'+(currentSame(pair.i,pair.j)===pair.same?'一致':'不一致');
   row.append(label);
   const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='取消';
   remove.style.padding='6px 10px';
   remove.addEventListener('click',()=>{verifiedFacePairs.delete(facePairKey(pair.i,pair.j));renderFaceEvaluation()});
   row.append(remove);results.append(row);
  }
 }
 renderQuickReview();
 renderEyelidComparison();
 renderR50Comparison();
 updateMissingPhotoReport();
}

function render(){
 updateGroupProgress();
 renderFaceEvaluation();
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
 renderManualPhotos();
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
 clearVerifiedMergeUndo();
 let target=destination.value;
 if(target==='new'){target=String(Math.max(0,...groups.map(g=>Number(g.id)||0))+1);groups.push({id:target,members:[]})}
 const dest=groups.find(g=>g.id===target);if(!dest)return;
 for(const g of groups)g.members=g.members.filter(id=>!selected.has(id));
 for(const id of selected)dest.members.push(id);
 selected.clear();invalidateAssignmentPreview();render();
});
// Experimental four-point eyelid-centred alignment, compared against the
// existing eye-corner alignment without changing the production embeddings.
// Both recognitions run in-browser, and the alternate embedding stays in RAM.
async function recognizeEyelidAlignment(canvas,bitmap,mesh,session,ort,phaseTimings){
 const eye=indices=>{
  const points=indices.map(i=>mesh[i]);
  if(points.some(p=>!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('まぶたの座標が不正');
  return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
 };
 const src=[
  eye([33,133,159,145]),
  eye([362,263,386,374]),
  [mesh[1]?.[0],mesh[1]?.[1]],
  [mesh[61]?.[0],mesh[61]?.[1]],
  [mesh[291]?.[0],mesh[291]?.[1]]
 ];
 if(src.some(p=>p.some(value=>!Number.isFinite(value))))throw Error('代替アライメントの座標が不正');
 const dst=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
 const centroid=points=>points.reduce((sum,p)=>[sum[0]+p[0]/points.length,sum[1]+p[1]/points.length],[0,0]);
 const sm=centroid(src),dm=centroid(dst);
 let numeratorA=0,numeratorB=0,denominator=0;
 for(let k=0;k<src.length;k++){
  const x=src[k][0]-sm[0],y=src[k][1]-sm[1],u=dst[k][0]-dm[0],v=dst[k][1]-dm[1];
  numeratorA+=x*u+y*v;numeratorB+=x*v-y*u;denominator+=x*x+y*y;
 }
 if(denominator<1)throw Error('代替アライメントの計算失敗');
 const a=numeratorA/denominator,b=numeratorB/denominator;
 const tx=dm[0]-a*sm[0]+b*sm[1],ty=dm[1]-b*sm[0]-a*sm[1];
 const aligned=document.createElement('canvas');aligned.width=112;aligned.height=112;
 // Face landmarks are in detector-canvas pixels. Convert original-image
 // coordinates into detector coordinates before applying ArcFace alignment.
 // This preserves small faces that lost detail when detection was downscaled.
 const scaleX=canvas.width/bitmap.width,scaleY=canvas.height/bitmap.height;
 const ctx=aligned.getContext('2d');
 ctx.setTransform(a*scaleX,b*scaleX,-b*scaleY,a*scaleY,tx,ty);
 ctx.drawImage(bitmap,0,0);
 const pixels=ctx.getImageData(0,0,112,112).data,plane=112*112;
 const tensor=new Float32Array(plane*3);
 for(let i=0;i<plane;i++)for(let c=0;c<3;c++)
  tensor[c*plane+i]=(pixels[i*4+c]-127.5)/127.5;
 const feeds={};
 for(const name of session.inputNames)feeds[name]=new ort.Tensor('float32',tensor,[1,3,112,112]);
 const started=performance.now();
 const output=await session.run(feeds);
 const elapsed=performance.now()-started;
 phaseTimings.recognition+=elapsed;
 phaseTimings.alternateRecognition=(phaseTimings.alternateRecognition||0)+elapsed;
 phaseTimings.alternateFaces=(phaseTimings.alternateFaces||0)+1;
 const vector=Array.from(output[session.outputNames[0]].data);
 if(vector.length<64||vector.length>1024||vector.some(value=>!Number.isFinite(value)))
  throw Error('代替アライメントの特徴データが不正');
 const thumbnail=aligned.toDataURL('image/jpeg',0.72);
 aligned.width=0;aligned.height=0;
 return {vector,thumbnail};
}

async function embed(bitmap,human,session,ort,phaseTimings,diagnostics,flipAugment=false,compareEyelidAlignment=false){
 const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 const detectionStart=performance.now();
 let faces=(await human.detect(canvas)).face||[];
 // Retry once at original resolution when downscaling hides small faces.
 // Only runs for a photo where the first pass found no faces.
 if(!faces.length&&scale<1){
  const retryCanvas=document.createElement('canvas');
  retryCanvas.width=bitmap.width;retryCanvas.height=bitmap.height;
  retryCanvas.getContext('2d').drawImage(bitmap,0,0);
  const retryFaces=(await human.detect(retryCanvas)).face||[];
  if(retryFaces.length){
   canvas.width=retryCanvas.width;canvas.height=retryCanvas.height;
   canvas.getContext('2d').drawImage(retryCanvas,0,0);
   faces=retryFaces;
   if(diagnostics.length<5)diagnostics.push('縮小画像で顔が見つからず、元画質で再検出しました');
  }
  retryCanvas.width=0;retryCanvas.height=0;
 }
 phaseTimings.detection+=performance.now()-detectionStart;
 if(!faces.length)throw Error('顔を検出できません（元画質でも再確認済み）');
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
 let alternateVector=null,alternateAlignedThumbnail=null;
 if(compareEyelidAlignment){
  try{
   const alternate=await recognizeEyelidAlignment(canvas,bitmap,mesh,session,ort,phaseTimings);
   alternateVector=alternate.vector;
   alternateAlignedThumbnail=alternate.thumbnail;
  }catch(error){
   // Alternative recognition is diagnostic only and must never discard
   // a valid original face embedding.
   if(diagnostics.length<5)diagnostics.push('まぶた補正の比較を一部スキップ：'+String(error?.message||error).slice(0,120));
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
 results.push({vector:vec,recognitionInput:tensor,alternateVector,thumbnail:crop.toDataURL('image/jpeg',0.82),alignedThumbnail:aligned.toDataURL('image/jpeg',0.72),alternateAlignedThumbnail,faceSize,faceQuality});
 }catch(error){console.warn('顔ごとの解析失敗',error);if(diagnostics.length<5)diagnostics.push(String(error?.message||error).slice(0,260))}
 }
 if(!results.length)throw Error('検出した顔の特徴を取得できません'+(diagnostics.length?'：'+diagnostics[0]:''));
 return results;
}
// Explicit local photo + face-classification checkpoint.
// No automatic writes, no upload, and no shared production-album storage.
let analyzedSourceFiles=[],analysisFinished=false,faceDraftBusy=false,faceDraftPreviousStartDisabled=false;
function faceDraftStatusText(message){
 const el=$('faceDraftStatus');if(el)el.textContent=message;
}
function faceDraftBusyState(busy){
 if(busy){
  faceDraftPreviousStartDisabled=start.disabled;
  start.disabled=true;
 }else start.disabled=faceDraftPreviousStartDisabled;
 faceDraftBusy=busy;
 approvalUi.refresh();
 for(const id of ['saveFaceDraft','restoreFaceDraft','removeFaceDraft']){
  const button=$(id);if(button)button.disabled=busy;
 }
}
function faceDraftTimestamp(millis){
 try{return new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short'}).format(new Date(millis));}
 catch{return '日時不明';}
}
async function updateSavedFaceDraftInfo(){
 try{
  const info=await faceDraftInfo();
  if(info?.schema===FACE_DRAFT_SCHEMA&&info?.version===1){
   faceDraftStatusText('💾 このSafari内に保存済み：'+info.photoCount+'枚・顔'+info.faceCount+
    '件・確認'+info.reviewCount+'組 ／ '+faceDraftTimestamp(info.savedAt)+
    '。画面を閉じていても「保存した続きから開く」で再開できます。');
  }else faceDraftStatusText('保存済みの検証データはありません。写真を解析した後に「今の作業を保存」を押してね。');
 }catch(error){
  faceDraftStatusText('⚠️ 保存状況を読み取れません：'+String(error?.message||error).slice(0,140));
 }
}
function assembleFaceDraftRecord(){
 if(!analysisFinished||!photoNames.length||analyzedSourceFiles.length!==photoNames.length)
  throw new Error('写真の解析が完了した状態で保存してください。途中の解析結果は保存しません。');
 const photos=analyzedSourceFiles.map((blob,index)=>({
  blob,name:photoNames[index],size:blob.size,type:blob.type||'',
  lastModified:Number.isFinite(blob.lastModified)?blob.lastModified:Date.now()
 }));
 const faces=items.map(face=>({
  name:String(face.name||''),sourcePhoto:face.sourcePhoto,
  url:face.url,alignedThumbnail:face.alignedThumbnail||null,
  alternateAlignedThumbnail:face.alternateAlignedThumbnail||null,
  faceSize:face.faceSize??null,faceQuality:face.faceQuality??null,
  vector:Array.from(face.vector||[]),
  recognitionInput:face.recognitionInput||null,
  alternateVector:face.alternateVector?Array.from(face.alternateVector):null,
  r50Vector:face.r50Vector?Array.from(face.r50Vector):null
 }));
 const record={
  schema:FACE_DRAFT_SCHEMA,version:1,savedAt:Date.now(),
  data:{
   photos,photoNames:[...photoNames],faces,
   groups:groups.map(g=>({id:String(g.id),members:[...g.members]})),
   initialFaceGroups:[...initialFaceGroups],initialGroupCount,
   initialCandidateCount,currentCandidateCount,manualMergeCount,
   verifiedPairs:[...verifiedFacePairs.values()].map(pair=>({...pair})),
   groupNames:[...groupNames.entries()],
   rosterClass:classSelect.value,
   roster:roster.map(child=>({id:String(child.id),name:String(child.name)})),
   verifiedFolderNames:[...verifiedFolderNames.entries()],
   excludedVerifiedFolders:[...excludedVerifiedFolders],
   newManualPhotoFolders:[...newManualPhotoFolders].map(([key,entry])=>[key,{name:entry.name}]),
   manualFolderSequence,
   manualPhotoFolderChoices:[...manualPhotoFolderChoices].map(([index,keys])=>[index,[...keys]]),
   photoFolderCorrections:photoFolderCorrectionsAsRows(photoFolderCorrections),
   manualPhotoAssignments:[...manualPhotoAssignments].map(([index,names])=>[index,[...names]]),
   excludedFacePairs:[...excludedFacePairs],
   r50Compared,
   threshold:Number($('threshold')?.value)||0.65,
   useEyelid:Boolean($('compareEyelidAlignment')?.checked),
   flipAugment:Boolean($('flipAugment')?.checked)
  }
 };
 const checked=validateFaceDraft(record);
 if(!checked.ok)throw new Error(checked.error);
 return record;
}
function prepareFaceDraftRestore(record){
 const checked=validateFaceDraft(record);
 if(!checked.ok)throw new Error(checked.error);
 const source=record.data;
 const files=source.photos.map(photo=>new File([photo.blob],photo.name,{
  type:photo.type||'',
  lastModified:Number.isFinite(photo.lastModified)?photo.lastModified:Date.now()
 }));
 if(files.some((file,index)=>file.size!==source.photos[index].size))
  throw new Error('復元する写真のサイズが一致しません。変更を中止しました。');
 const stagedUrls=[];
 try{
  for(const file of files)stagedUrls.push(URL.createObjectURL(file));
 }catch(error){
  stagedUrls.forEach(URL.revokeObjectURL);
  throw error;
 }
 return {checked,files,urls:stagedUrls,data:source,savedAt:record.savedAt};
}
function applyFaceDraftRestore(staged){
 const data=staged.data;
 lastPhotoCorrectionUndo=null;
 clearProvisionalFinalization('📂 保存済み作業を復元しました。仮確定は改めて先生が確認してね。');
 // All restoration checks and source photo URLs have been prepared above.
 // Mutate the currently open prototype only after those succeed.
 urls.forEach(URL.revokeObjectURL);
 urls=[...staged.urls];photoUrls=[...staged.urls];
 photoNames=[...data.photoNames];
 analyzedSourceFiles=[...staged.files];
 analysisFinished=true;
 queued.splice(0,queued.length,...staged.files);
 updateCount();
 items=data.faces.map(face=>({
  ...face,vector:[...face.vector],
  recognitionInput:face.recognitionInput?new Float32Array(face.recognitionInput):null,
  alternateVector:face.alternateVector?[...face.alternateVector]:null,
  r50Vector:face.r50Vector?[...face.r50Vector]:null
 }));
 groups=data.groups.map(group=>({id:String(group.id),members:[...group.members]}));
 initialFaceGroups=[...data.initialFaceGroups];
 initialGroupCount=data.initialGroupCount;
 initialCandidateCount=data.initialCandidateCount??null;
 currentCandidateCount=data.currentCandidateCount??null;
 manualMergeCount=data.manualMergeCount||0;
 const replaceMap=(destination,rows)=>{destination.clear();for(const [key,value] of rows)destination.set(key,value);};
 replaceMap(verifiedFacePairs,data.verifiedPairs.map(pair=>[facePairKey(pair.i,pair.j),{...pair}]));
 replaceMap(groupNames,data.groupNames);
 classSelect.value=data.rosterClass;
 if(verifiedRosterClass)verifiedRosterClass.value=data.rosterClass;
 roster=data.roster.map(child=>({...child}));
 verifiedRosterScope=roster.length?folderRosterSignature():'';
 folderNameStatus='';
 replaceMap(verifiedFolderNames,data.verifiedFolderNames);
 excludedVerifiedFolders.clear();
 for(const key of data.excludedVerifiedFolders)excludedVerifiedFolders.add(key);
 replaceMap(newManualPhotoFolders,data.newManualPhotoFolders.map(([key,entry])=>[key,{...entry}]));
 manualFolderSequence=Number.isInteger(data.manualFolderSequence)?data.manualFolderSequence:0;
 replaceMap(manualPhotoFolderChoices,data.manualPhotoFolderChoices.map(([index,keys])=>[index,new Set(keys)]));
 replaceMap(photoFolderCorrections,(data.photoFolderCorrections||[]).map(([index,entries])=>[index,new Map(entries)]));
 replaceMap(manualPhotoAssignments,data.manualPhotoAssignments.map(([index,names])=>[index,new Set(names)]));
 excludedFacePairs.clear();
 for(const key of data.excludedFacePairs)excludedFacePairs.add(key);
 r50Compared=Boolean(data.r50Compared)&&items.every(face=>Array.isArray(face.r50Vector));
 r50CompareRunning=false;
 lastFolderCorrection=null;folderCorrectionNoticeText='';
 lastVerifiedGroupSnapshot=null;alternativeGrouping=null;evidenceVariants=null;
 pendingFaceImport=[];const pending=$('faceEvaluationImportReview');if(pending)pending.replaceChildren();
 selectedReviewFaces=[];selected.clear();openedFolder=null;
 refreshGroupPairsUI=()=>{};
 start.disabled=false;cancel.disabled=true;stop=false;
 const threshold=$('threshold');if(threshold&&Number.isFinite(data.threshold))threshold.value=String(data.threshold);
 const thresholdValue=$('thresholdValue');if(thresholdValue)thresholdValue.value=Number(threshold.value).toFixed(2);
 if($('flipAugment'))$('flipAugment').checked=Boolean(data.flipAugment);
 if($('compareEyelidAlignment'))$('compareEyelidAlignment').checked=Boolean(data.useEyelid);
 const diag=$('diagnosticsMount');if(diag)diag.replaceChildren();
 const timer=$('timingPanel');if(timer)timer.hidden=true;
 const rosterLabel=$('rosterStatus');if(rosterLabel)rosterLabel.textContent='保存した名簿 '+roster.length+'名を画面内に復元しました。登録済みの名簿は変更していません。';
 folderManagementNotice='💾 保存済みの除外・新規フォルダ・手動振り分けを復元しました。';
 render();
 persistedPhotoDraftSignature=lastFinalReviewSignature;
 approvalUi.refresh();
 albumHandoffUi.refresh();
 status.textContent='✅ 保存した続きから再開：写真'+photoNames.length+'枚・顔'+items.length+
  '件・先生の確認'+verifiedFacePairs.size+'組。写真の再解析なし。'+
  ' この画面で変更したら「今の作業を保存」をもう一度押してね。';
}
$('saveFaceDraft')?.addEventListener('click',async()=>{
 if(faceDraftBusy)return;
 if(start.disabled||!analysisFinished){
  faceDraftStatusText('⚠️ 写真の解析が完了してから保存してね。');return;
 }
 if(!window.confirm('元写真・顔の特徴情報・先生の確認記録・園児名を、この端末のSafari内に保存します。共有パソコンではほかの利用者もアクセスできる可能性があります。保存しますか？'))return;
 faceDraftBusyState(true);
 try{
  const signatureAtSave=finalAuditSourceSignature(currentFinalReviewAudit());
  const record=assembleFaceDraftRecord();
  faceDraftStatusText('💾 このブラウザに保存しています。写真の枚数・データ量によっては容量が必要です。');
  const saved=await saveFaceDraft(record);
  persistedPhotoDraftSignature=signatureAtSave===finalAuditSourceSignature(currentFinalReviewAudit())?signatureAtSave:'';
  approvalUi.refresh();
  albumHandoffUi.refresh();
  faceDraftStatusText('✅ 保存完了：写真'+saved.photoCount+'枚・顔'+saved.faceCount+
   '件・確認'+saved.reviewCount+'組 ／ '+faceDraftTimestamp(saved.savedAt)+
   '。次回は「保存した続きから開く」を押してね。変更後はもう一度保存してください。');
 }catch(error){
  faceDraftStatusText('⚠️ 保存に失敗しました。現在の画面は変更していません。'+
   String(error?.message||error).slice(0,230)+
   '。端末の容量・Safariのサイト保存設定も確認してください。');
  console.warn('Isolated face draft save failed',error);
 }finally{faceDraftBusyState(false);}
});
$('restoreFaceDraft')?.addEventListener('click',async()=>{
 if(faceDraftBusy)return;
 if(start.disabled){
  faceDraftStatusText('⚠️ 解析中は復元できません。処理が終わってから押してね。');return;
 }
 if(photoNames.length&&!window.confirm('現在画面に表示している写真と仮振り分けを、保存した作業で置き換えます。未保存の変更は消えます。続けますか？'))return;
 faceDraftBusyState(true);
 try{
  faceDraftStatusText('📂 保存した作業を読み込んでいます。');
  const snapshot=await loadFaceDraft();
  if(!snapshot)throw new Error('保存データがありません。先に「今の作業を保存」を押してください。');
  const staged=prepareFaceDraftRestore(snapshot);
  applyFaceDraftRestore(staged);
  faceDraftStatusText('✅ 写真'+staged.checked.photoCount+'枚・顔'+staged.checked.faceCount+
   '件・確認'+staged.checked.reviewCount+'組を復元しました。写真の再解析は不要です。'+
   ' 最終保存：'+faceDraftTimestamp(staged.savedAt));
 }catch(error){
  faceDraftStatusText('⚠️ 保存データを読み込めませんでした：'+String(error?.message||error).slice(0,220)+
   '。保存形式が不正な場合は現在の作業を保護するため復元しません。');
  console.warn('Isolated face draft restore failed',error);
 }finally{faceDraftBusyState(false);}
});
$('removeFaceDraft')?.addEventListener('click',async()=>{
 if(faceDraftBusy)return;
 if(!window.confirm('このSafariに保存した検証用の元写真・顔データ・園児名を削除しますか？【現在画面に開いている作業と本番アルバムは変更しません】'))return;
 faceDraftBusyState(true);
 try{
  await deleteFaceDraft();
  persistedPhotoDraftSignature='';
  approvalUi.refresh();
  albumHandoffUi.refresh();
  faceDraftStatusText('✅ このSafariの検証用保存データを削除しました。現在画面の作業と本番アルバムは変更していません。');
 }catch(error){
  faceDraftStatusText('⚠️ 保存データを削除できませんでした：'+String(error?.message||error).slice(0,200));
 }finally{faceDraftBusyState(false);}
});

approvalUi=bindProvisionalApprovalUi({
 getState:()=>{
  const audit=currentFinalReviewAudit();
  return {
   audit,signature:finalAuditSourceSignature(audit),
   candidate:provisionalFinalCandidate,persistedSignature:persistedPhotoDraftSignature,
   faceDraftBusy,rosterClass:classSelect.value
  };
 },
 onRestored:({candidate,audit,signature})=>{
  provisionalFinalCandidate=candidate;lastFinalReviewSignature=signature;lastFinalReviewAudit=audit;
  const eye=$('provisionalFinalVisualCheck'),unassigned=$('provisionalFinalUnassignedCheck');
  if(eye)eye.checked=true;if(unassigned)unassigned.checked=true;
  provisionalFinalMessage='✅ 保存した仮確定を復元しました。確認済みの写真と園児名の対応が一致しています。本番アルバムは未変更です。';
  updateProvisionalFinalControls();
 },
 formatDate:faceDraftTimestamp
});



photoOriginalReviewUi=bindPhotoOriginalReviewUi({
 getData:()=>{
  const {model}=currentPhotoFolderView();
  return {
   photoNames,photoUrls,
   namedFolders:buildNamedFolderPreview(model.buckets,roster,verifiedFolderNames,
    manualPhotoFolderChoices,photoFolderCorrections).named
  };
 },
 applyChange:applyPhotoCorrection
});

albumHandoffUi=bindAlbumPhotoHandoffUi({
 onPhotoOpen:(photoIndex,key)=>photoOriginalReviewUi.open(photoIndex,key),
 getData:()=>{
  const audit=currentFinalReviewAudit();
  return {
   candidate:provisionalFinalCandidate,audit,
   signature:finalAuditSourceSignature(audit),
   persistedSignature:persistedPhotoDraftSignature,
   photoNames,photoUrls,roster,rosterClass:classSelect.value,faceDraftBusy
  };
 }
});

void updateSavedFaceDraftInfo();

start.addEventListener('click',async()=>{
 if(faceDraftBusy){status.textContent='保存・復元の処理中です。終了してから解析してください。';return;}
 const copied=$('quickCopyStatus');if(copied)copied.textContent='';
 const files=[...queued];if(files.length<2){status.textContent='2枚以上の写真を選んでください。';return}
 analyzedSourceFiles=[];analysisFinished=false;
 lastPhotoCorrectionUndo=null;
 persistedPhotoDraftSignature='';
 clearProvisionalFinalization('📷 新しい写真を解析します。以前の仮確定は取り消しました。');
 if(files.length>100){status.textContent='試作版は一度に100枚までです。';return}
 r50Compared=false;r50CompareRunning=false;lastFolderCorrection=null;folderCorrectionNoticeText='';evidenceVariants=null;pendingFaceImport=[];const pendingHost=$('faceEvaluationImportReview');if(pendingHost)pendingHost.replaceChildren();lastVerifiedGroupSnapshot=null;alternativeGrouping=null;const undoVerified=$('undoVerifiedGroups');if(undoVerified)undoVerified.disabled=true;verifiedFacePairs.clear();selectedReviewFaces=[];initialFaceGroups=[];refreshGroupPairsUI=()=>{};initialGroupCount=null;initialCandidateCount=null;currentCandidateCount=null;manualMergeCount=0;updateGroupProgress();stop=false;start.disabled=true;cancel.disabled=false;selected.clear();openedFolder=null;items=[];groups=[];groupNames.clear();invalidateAssignmentPreview();manualPhotoAssignments.clear();manualPhotoFolderChoices.clear();photoFolderCorrections.clear();verifiedFolderNames.clear();excludedVerifiedFolders.clear();newManualPhotoFolders.clear();manualFolderSequence=0;folderManagementNotice='';folderNameStatus='';const timingPanel=$('timingPanel');if(timingPanel)timingPanel.hidden=true;const diagnosticsMount=$('diagnosticsMount');if(diagnosticsMount)diagnosticsMount.replaceChildren();photoNames=files.map(f=>f.name);urls.forEach(URL.revokeObjectURL);urls=files.map(file=>URL.createObjectURL(file));photoUrls=[...urls];render();
 let session,human;
 const timings={model:0,decode:0,detectAndEmbed:0,detection:0,recognition:0,alternateRecognition:0,alternateFaces:0,faces:0,group:0};const startedAt=performance.now();
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
    const embedStart=performance.now();const detected=await embed(bitmap,human,session,ort,timings,diagnostics,$('flipAugment')?.checked===true,$('compareEyelidAlignment')?.checked===true);timings.detectAndEmbed+=performance.now()-embedStart;
    for(let faceIndex=0;faceIndex<detected.length;faceIndex++){
     const {vector,recognitionInput,alternateVector,thumbnail,alignedThumbnail,alternateAlignedThumbnail,faceSize,faceQuality}=detected[faceIndex];
     items.push({name:files[i].name+'（顔'+(faceIndex+1)+'）',sourcePhoto:i,url:thumbnail,alignedThumbnail,alternateAlignedThumbnail,faceSize,faceQuality,vector,recognitionInput,alternateVector});
    }
   }catch(e){failed.push((i+1)+'枚目: '+String(e?.message||e).slice(0,65))}finally{bitmap?.close()}
   await new Promise(r=>setTimeout(r,0));
  }
  if(stop){status.textContent='⏹ 中断しました。アルバムへの変更はありません。';return}
  const groupingStart=performance.now();
  const threshold=Number($('threshold').value);
  groups=calculateFaceGroups(threshold);
  initialFaceGroups=Array(items.length).fill(null);
  for(const g of groups.slice(1))for(const id of g.members)initialFaceGroups[id]=g.id;
  initialGroupCount=groups.length-1;updateGroupProgress();
  timings.group=performance.now()-groupingStart;
  const seconds=ms=>(ms/1000).toFixed(1)+'秒';
  const perfReport='\n⚙️ 実行方式：'+executionProvider+'\n⏱ 計測：AI準備 '+seconds(timings.model)+' ／ 写真読み込み '+seconds(timings.decode)+' ／ 顔検出＋特徴解析 '+seconds(timings.detectAndEmbed)+'（うち顔検出 '+seconds(timings.detection)+'・AI特徴抽出 '+seconds(timings.recognition)+'／'+timings.faces+'顔） ／ グループ化 '+seconds(timings.group)+' ／ 合計 '+seconds(performance.now()-startedAt)+'（この端末での実測）';
  status.textContent='✅ '+(files.length-failed.length)+' / '+files.length+'枚解析 ／ 顔'+items.length+'件 ／ AI仮グループ'+(groups.length-1)+'件。'+(failed.length?'\n⚠️ 顔を見つけられなかった写真：'+failed.map(v=>v.split(':')[0]).join('、')+'（手動で振り分けできます）':'');
  const timing=$('technicalStatus'),timingPanel=$('timingPanel');
  if(timing)timing.textContent='実行モデル：'+selectedModel+'\n'+perfReport+'\n'+(timings.alternateFaces?'まぶた補正：'+timings.alternateFaces+'顔／追加認識 '+seconds(timings.alternateRecognition)+'\n':'')+(diagnostics.length?'モデル詳細：'+[...new Set(diagnostics)].join(' ／ '):'')+'\n'+(failed.length?'顔未検出：'+failed.join(' ／ '):'');
  if(timingPanel)timingPanel.hidden=false;
  const old=$('pairDiagnostics');if(old)old.remove();
  const diagnostic=document.createElement('section');diagnostic.id='pairDiagnostics';diagnostic.className='panel';
  const heading=document.createElement('h2');heading.textContent='🔎 顔の比較値（高い順・上位20組）';diagnostic.append(heading);
  const info=document.createElement('p');info.className='muted';info.textContent='比較値は正解率ではありません。高いほど似ている傾向ですが、同一人物を保証しません。元写真と比較用の特徴データは、上の保存ボタンを押した場合だけこの端末内に保存します。';diagnostic.append(info);
  const diagnosticPairs=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const score=similarity(items[i].vector,items[j].vector);
   if(Number.isFinite(score))diagnosticPairs.push({i,j,score});
  }
  diagnosticPairs.sort((a,b)=>b.score-a.score);
  for(const pair of diagnosticPairs.slice(0,20)){
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
  currentCandidateCount=eligible.length;
  if(initialCandidateCount===null)initialCandidateCount=eligible.length;
  updateGroupProgress();
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
  // Experimental grouping estimate only: assess whether a one-step lower
  // threshold would create obvious same-photo conflicts before changing anything.
  const alternativeThreshold=Math.max(0.3,Number($('threshold').value)-0.04);
  const relaxed=groupPairs.filter(p=>!p.samePhoto&&p.minimum>=alternativeThreshold&&p.average>=alternativeThreshold);
  const conflictCount=groupPairs.filter(p=>p.samePhoto&&p.maximum>=alternativeThreshold).length;
  const simulation=document.createElement('p');simulation.className='muted';
  simulation.textContent='🧪 閾値を0.04緩めた場合の参考：追加の統合候補 '+relaxed.length+'組 ／ 同じ写真の別顔が似ている危険候補 '+conflictCount+'組（試算のみ・現在のグループは変更しません）';
  host.append(simulation);
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
    clearVerifiedMergeUndo();
    // Record one representative teacher-confirmed pair before merging.
    let representative=null;
    for(const i of first.members)for(const j of second.members){
     const score=pairScore(i,j);
     if(Number.isFinite(score)&&(!representative||score>representative.score))representative={i,j,score};
    }
    if(representative)verifiedFacePairs.set(facePairKey(representative.i,representative.j),{i:representative.i,j:representative.j,same:true});
    first.members.push(...second.members);
    groups=groups.filter(g=>g!==second);
    if(!groupNames.has(first.id)&&groupNames.has(second.id))groupNames.set(first.id,groupNames.get(second.id));
    groupNames.delete(second.id);manualMergeCount++;selected.clear();invalidateAssignmentPreview();render();updateGroupProgress();
    refreshGroupPairs();
    status.textContent+='\n✅ グループ '+firstId+' と '+secondId+' を手動統合しました。';
   });
   row.append(merge);
   const reject=document.createElement('button');reject.type='button';reject.className='secondary';reject.textContent='違う園児（候補から除外）';
   reject.addEventListener('click',()=>{
    const first=groups.find(g=>g.id===firstId),second=groups.find(g=>g.id===secondId);
    if(!first||!second)return;
    let representative=null;
    for(const i of first.members)for(const j of second.members){
     const score=pairScore(i,j);
     if(Number.isFinite(score)&&(!representative||score>representative.score))representative={i,j,score};
     excludedFacePairs.add(facePairKey(i,j));
    }
    if(representative)verifiedFacePairs.set(facePairKey(representative.i,representative.j),{i:representative.i,j:representative.j,same:false});
    refreshGroupPairs();renderFaceEvaluation();
   });
   row.append(reject);host.append(row);
  }
  };
  refreshGroupPairsUI=refreshGroupPairs;
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
  const alignmentNote=document.createElement('p');alignmentNote.className='muted';alignmentNote.textContent='左が元写真の顔、右がAIに入力した112×112の補正画像。顔の上下・傾き・左右の目の位置にズレがないか確認します。画像はこの画面で処理します。先生が「今の作業を保存」を押すと端末内に保存されますが、外部送信しません。';alignment.append(alignmentNote);
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

  const diagnosticMount=$('diagnosticsMount');
  if(diagnosticMount)diagnosticMount.replaceChildren(diagnostic);
  else groupsHost.closest('section').after(diagnostic);
  analyzedSourceFiles=[...files];analysisFinished=true;
  render();
 }catch(e){status.textContent='⚠️ 解析できません【かんたん検証T】: '+String(e?.message||e).slice(0,220)+'\n詳細: '+String(e?.stack||'スタック情報なし').slice(0,700);console.error('Face analysis diagnostic C',e)}
 finally{try{await session?.release()}catch{}try{await human?.dispose?.()}catch{}start.disabled=false;cancel.disabled=true}
});
window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
