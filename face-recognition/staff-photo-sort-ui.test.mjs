// Regression guard: staff must not see face-recognition research tools and a
// huge flat list of original photos when opening a teacher-approved album.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('entire album editor inline script still parses',()=>{
 assert.equal(typeof inline,'string');
 assert.doesNotThrow(()=>new Function(inline));
});
test('research face references are hidden in an accessible advanced disclosure',()=>{
 assert.match(html,/<details id="faceReferenceAdvanced"[^>]*><summary>[^<]*詳しい設定/);
 assert.match(html,/id="faceReferencePanel"/);
 assert.match(html,/id="faceReferenceList"/);
});
test('a child-folder selector replaces the full-page grid of all photos',()=>{
 assert.match(html,/id="assignmentFolderBar"/);
 assert.match(html,/picker\.id='assignmentFolderPicker'/);
 assert.match(html,/picker\.addEventListener\('change'/);
 assert.match(html,/return current==='all'\|\|\(current==='unassigned'/);
});
test('only a small window of photos is rendered and more can be shown',()=>{
 assert.match(html,/assignmentVisibleLimit=24/);
 assert.match(html,/indexes\.slice\(0,assignmentVisibleLimit\)/);
 assert.match(html,/id="showMoreAssignedPhotos"/);
 assert.match(html,/assignmentVisibleLimit\+=24/);
});
test('teacher-approved import opens the first named child folder',()=>{
 assert.match(html,/activeAssignmentFolder=String\(plan\.children\.find\(c=>c\.photoCount>0\)\?\.id\|\|'unassigned'\)/);
});
test('manual photos default to the unassigned folder, and all photos remain accessible',()=>{
 assert.match(html,/photoAssignments=picked\.map\(\(\)=>\[\]\);assignmentSourceType='manual';activeAssignmentFolder='unassigned'/);
 assert.match(html,/id:'all',name:'📷 全写真/);
 assert.match(html,/id:'unassigned',name:'🔎 未振り分け/);
});
test('staff can see original photos, edit one photo or advance to album editor',()=>{
 assert.match(html,/object-fit:contain/);
 assert.match(html,/id="assignmentPhotoDialog"/);
 assert.match(html,/id="assignmentDialogImage"/);
 assert.match(html,/className='assignmentSimpleEdit'/);
 assert.match(html,/photoAssignments\[index\]=\[\.\.\.next\]/);
 assert.match(html,/id="finishPhotoAssign"/);
});
test('photo changes never automatically invoke a database write',()=>{
 const start=inline.indexOf('function renderPhotoAssignmentPage(');
 const end=inline.indexOf('function renderClassPhotoSummary(',start);
 const body=inline.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(body,/saveDraft\(|indexedDB\.|localStorage\.setItem\(/);
});

test('新規アルバムでは新しい写真が先・過去14枚の流用は任意メニュー',()=>{
 const confirmed=html.indexOf('id="approvedPhotoImportPanel"');
 const manual=html.indexOf('id="photoInput"');
 assert.ok(manual>0&&confirmed>manual);
 assert.match(html,/以前のアルバムの写真は勝手に追加されません/);
 assert.match(html,/<details id="approvedPhotoImportPanel"/);
 assert.match(html,/新しい写真の自動顔認識ではありません/);
});
test('新しい写真は前の園児振り分けと別枠で追加',()=>{
 assert.match(html,/id="albumAddMorePhotos"/);
 assert.match(html,/stageAlbumPhotoAppend\(/);
 assert.match(html,/existingFiles:beforeFiles,existingAssignments:beforeAssignments,incomingFiles:picked/);
 assert.match(html,/assignmentSourceType='extended'/);
 assert.match(html,/activeAssignmentFolder='unassigned'/);
});
test('写真ごとの振り分け元を表示し、手動追加にも復元ボタンを用意',()=>{
 assert.match(html,/id="assignmentTransferStatus"/);
 assert.match(html,/id="applySavedAssignmentsToLoaded"/);
 assert.match(html,/assignmentSourceType='approved'/);
 assert.match(html,/assignmentSourceType='manual'/);
 assert.match(html,/assignmentSourceType='recovered'/);
 assert.match(html,/matchSelectedPhotosToSaved\(selectedFiles,draft\.data\.photos/);
});

test('アルバム作成では前回のAI候補を使わず、現在選択した写真だけ解析',()=>{
 assert.match(html,/id="analyzeCurrentAlbum"/);
 assert.match(html,/id="currentAlbumAiGroups"/);
 assert.match(html,/const sourceFiles=\[\.\.\.files\],registered=JSON\.stringify\(getChildren\(classId\)\)/);
 assert.match(html,/humanFacesFromBlob\(human,sourceFiles\[index\]\)/);
 assert.match(html,/clusterCurrentAlbumFaces\(samples,\{similarity:faceEmbeddingSimilarity,photoCount:sourceFiles\.length\}\)/);
});
test('先生が名前を選択して初めて、このアルバムの園児紐づけに反映',()=>{
 assert.match(html,/assign\.addEventListener\('click'/);
 assert.match(html,/assignConfirmedAlbumCluster\(\{/);
 assert.match(html,/activeAssignmentFolder=String\(choice\.value\)/);
 assert.match(html,/photoAssignments=data\.assignConfirmedAlbumCluster/);
});
test('次のアルバム・別写真の一括取込では前のAI候補を必ず破棄',()=>{
 assert.match(html,/function clearCurrentAlbumAi\(\)/);
 assert.match(html,/pendingProjectSlot=i;files=\[\];photoAssignments=\[\];assignmentSourceType='manual';clearCurrentAlbumAi\(\)/);
 assert.match(html,/\$\('#createNew'\)\.addEventListener\('click',\(\)=>\{files=\[\];photoAssignments=\[\];assignmentSourceType='manual';clearCurrentAlbumAi\(\)/);
 assert.match(html,/clearCurrentAlbumAi\(\);files=picked;photoAssignments=picked\.map/);
 assert.match(html,/clearCurrentAlbumAi\(\);\s*files=added\.files;photoAssignments=added\.assignments/);
});
test('旧14枚の仮確定を標準の振り分けに使わない',()=>{
 assert.match(html,/#approvedPhotoImportPanel,#assignmentTransferPanel\{display:none!important\}/);
 assert.match(html,/<section id="currentAlbumAiPanel"/);
 const aiStart=html.indexOf("\$\u0028'#analyzeCurrentAlbum'\u0029?.addEventListener"); // Find actual code separately.
 assert.ok(html.includes("$('#analyzeCurrentAlbum')?.addEventListener('click',async()=>{"));
});

test('150枚規模でもAIグループをコンパクト表示・分割表示',()=>{
 assert.match(html,/id="albumAiPendingOnly" checked/);
 assert.match(html,/id="albumAiMoreGroups"/);
 assert.match(html,/visibleLimit:18/);
 assert.match(html,/albumAiGroupsData\.visibleLimit\+=18/);
 assert.match(html,/card\.className='currentAlbumAiGroup'/);
 assert.match(html,/const card=document\.createElement\('details'\)/);
});
test('顔グループ内で写真をチェックし、一括移動・新規・候補除外が可能',()=>{
 assert.match(html,/className='groupPhotoPick'/);
 assert.match(html,/selectAll\.textContent='☑ このグループの写真を全選択'/);
 assert.match(html,/target\.value==='exclude'/);
 assert.match(html,/target\.value==='new'/);
 assert.match(html,/moving=group\.faceIndexes\.filter/);
 assert.match(html,/group\.faceIndexes=group\.faceIndexes\.filter/);
 assert.match(html,/data\.groups\.push\(\{key:'teacher-'/);
});
test('元写真を削除せず異なる顔の同一写真を誤統合しない',()=>{
 const start=html.indexOf('function renderCurrentAlbumAiGroups()');
 const end=html.indexOf("$('#albumAiPendingOnly')?.addEventListener",start);
 const body=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(body,/移動先に同じ写真の別の顔があります/);
 assert.match(body,/元写真は消えません/);
 assert.doesNotMatch(body,/files\.splice\(|releasePhotoUrl\(|indexedDB\.|localStorage\.setItem\(/);
 assert.match(body,/!data\.valid\(\)/);
});

test('園児フォルダは解析と顔確認の後に表示し、手動振り分けでも利用できる',()=>{
 assert.ok(html.indexOf('id="albumChildFolderPanel"')>html.indexOf('id="currentAlbumAiPanel"'));
 assert.match(html,/function renderAlbumAiChildFolders\(\)/);
 assert.match(html,/renderAlbumAiChildFolders\(\);\s*renderAssignmentFolderBar\(\);/);
 assert.match(html,/assignmentPhotoIds\(i\)\.includes\(id\)/);
});
test('チェックした写真を選んだ園児のフォルダへ直接移しAI候補から除く',()=>{
 const from=html.indexOf('function renderCurrentAlbumAiGroups()');
 const until=html.indexOf("$('#albumAiPendingOnly')?.addEventListener",from);
 const body=html.slice(from,until);
 assert.match(body,/opt\.value='child:'\+kid\.id/);
 assert.match(body,/nextAssignments=data\.assignConfirmedAlbumCluster/);
 assert.match(body,/photoIndexes:indexes/);
 assert.match(body,/group\.faceIndexes=group\.faceIndexes\.filter/);
 assert.match(body,/photoAssignments=nextAssignments/);
 assert.match(body,/renderPhotoAssignmentPage\(\);/);
 assert.doesNotMatch(body,/files\.splice\(|releasePhotoUrl\(|localStorage\.setItem\(/);
});
test('確定後の候補は初期状態では表示されない',()=>{
 assert.match(html,/id="albumAiPendingOnly" checked/);
 assert.match(html,/data\.confirmed\.add\(group\.key\)/);
 assert.match(html,/data\.groups\.filter\(group=>!data\.confirmed\.has\(group\.key\)\)/);
});

test('Safariで画像タップ・チェック操作後、移動ボタンが反応する',()=>{
 assert.match(html,/const label=document\.createElement\('div'\);label\.className='groupPhotoPick'/);
 assert.match(html,/image\.addEventListener\('click',togglePick\)/);
 assert.match(html,/checkbox\.addEventListener\('change'/);
 assert.match(html,/move\.disabled=false/);
 assert.match(html,/move\.textContent=selected\.size/);
 assert.match(html,/写真の左上にチェックを付けてね/);
});
test('園児名の選択と写真移動先の選択を連動させる',()=>{
 assert.match(html,/choice\.addEventListener\('change',\(\)=>\{/);
 assert.match(html,/target\.value='child:'\+choice\.value/);
 assert.match(html,/target\.addEventListener\('change',\(\)=>\{/);
 assert.match(html,/const chooser=content\.querySelector\('\.namePick'\)/);
 assert.match(html,/chooser\.value=sameChild/);
 assert.match(html,/nextAssignments=data\.assignConfirmedAlbumCluster/);
});


test('未確定グループから似た顔を提案し先生が確認して統合できる',()=>{
 const start=html.indexOf('function renderCurrentAlbumAiGroups()');
 const stop=html.indexOf("$('#albumAiPendingOnly')?.addEventListener",start);
 const view=html.slice(start,stop);
 assert.match(view,/似ている別グループを探す/);
 assert.match(view,/data\.suggestCurrentAlbumGroupMerges/);
 assert.match(html,/const groups=data\.mergeTeacherAlbumGroups/);
 assert.match(view,/window\.confirm\('この2グループは本当に同じ園児ですか/);
 assert.match(view,/mergeAlbumAiGroupsSafely\(data,group,other\)/);
 assert.match(view,/同じ園児と確認できましたか/);
});
test('教師が統合した顔グループは直前の状態に戻せる',()=>{
 assert.match(html,/id="albumAiUndoMerge"/);
 assert.match(html,/data\.mergeUndo\.push\(snapshot\)/);
 assert.match(html,/const previous=data\.mergeUndo\.pop\(\)/);
 assert.match(html,/data\.groups=previous/);
 assert.match(html,/data\.mergeUndo=\[\];data\.mergeSuggestions=null/);
});

test('似ている候補の写真グループをチェックで複数選択して一括統合',()=>{
 const start=html.indexOf('function renderCurrentAlbumAiGroups()');
 const end=html.indexOf("$('#albumAiPendingOnly')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/const checkedGroupKeys=new Set\(\)/);
 assert.match(view,/check\.type='checkbox';check\.value=other\.key/);
 assert.match(view,/checkedGroupKeys\.add\(other\.key\)/);
 assert.match(view,/checkedGroupKeys\.delete\(other\.key\)/);
 assert.match(view,/✅ 選んだ'\+checkedGroupKeys\.size\+'組をまとめる/);
 assert.match(view,/mergeAlbumAiGroupsBatchSafely\(data,group,keys\)/);
 assert.match(view,/チェックした'\+keys\.length\+'組/);
 assert.match(html,/limit:12/);
});
test('一括統合は一度だけ履歴へ記録し、全件確認後にしか変更しない',()=>{
 const start=html.indexOf('function mergeAlbumAiGroupsBatchSafely(');
 const end=html.indexOf('function clearCurrentAlbumSingletonPairs()',start);
 const body=html.slice(start,end);
 assert.match(body,/const joined=data\.mergeTeacherAlbumGroupsBatch/);
 assert.ok(body.indexOf('const joined=')<body.indexOf('data.mergeUndo.push(snapshot)'));
 assert.match(body,/data\.mergeUndo\.push\(snapshot\)/);
 assert.match(body,/data\.groups=joined/);
 assert.match(body,/data\.confirmed\.has\(g\.key\)/);
 assert.doesNotMatch(body,/files\.splice\(|photoAssignments=|indexedDB\.|localStorage\./);
});

test('BJでも今回取り込んだ写真だけでグループ改善を比較表示',()=>{
 assert.match(html,/PHOTO SORT · 2026-10-23 BO/);
 assert.match(html,/clusterCurrentAlbumFaces\(samples,\{similarity:faceEmbeddingSimilarity,photoCount:sourceFiles\.length\}\)/);
 assert.match(html,/result\.beforeCommunityGroups/);
 assert.match(html,/result\.communityMerges/);
 assert.match(html,/従来の判定 /);
 assert.match(html,/今回 /);
 assert.match(html,/v=20261023-bf/);
});

test('BCは匿名の類似度分布と基準値を表示、アルバムを替えると閉じる',()=>{
 assert.match(html,/id="currentAlbumAiDiagnosticPanel"/);
 assert.match(html,/id="currentAlbumAiDiagnostics"/);
 assert.match(html,/result\.clusteringDiagnostics/);
 assert.match(html,/stats\.nearestScoreRanges/);
 assert.match(html,/stats\.calibratedThreshold\.toFixed\(3\)/);
 assert.match(html,/顔の特徴データを送信・保存せず/);
 assert.match(html,/\$\('#currentAlbumAiDiagnosticPanel'\)\.hidden=true/);
});
test('BDの補助判定も現在アルバムだけで実施し、顔の生データを診断表示しない',()=>{
 assert.match(html,/stats\.consensusMerges/);
 assert.match(html,/stats\.consensusCandidates/);
 assert.match(html,/stats\.consensusAmbiguous/);
 assert.match(html,/複数顔の一致で /);
 assert.match(html,/result\.clusteringDiagnostics\.consensusMerges/);
 assert.match(html,/写真や顔の特徴データを送信・保存せず/);
});

test('BEでは単独候補の救済結果を診断に加え、園児名の確定UIは維持する',()=>{
 assert.match(html,/result\.clusteringDiagnostics\.orphanRescues/);
 assert.match(html,/stats\.orphanBefore/);
 assert.match(html,/stats\.orphanRescues/);
 assert.match(html,/stats\.orphanCandidates/);
 assert.match(html,/stats\.orphanAmbiguous/);
 assert.match(html,/stats\.orphanSamePhoto/);
 assert.match(html,/単独候補の追加検討/);
 assert.match(html,/写真や顔の特徴データを送信・保存せず/);
 assert.match(html,/mergeAlbumAiGroupsBatchSafely/);
 assert.match(html,/photoAssignments=data\.assignConfirmedAlbumCluster/);
});

test('BJは1組ずつ写真を確認し、職員が確定するまで統合しない',()=>{
 assert.match(html,/id="albumAiSingletonReview"/);
 assert.match(html,/id="albumAiSingletonPairs"/);
 assert.match(html,/function renderCurrentAlbumSingletonPairs\(\)/);
 assert.match(html,/data\.suggestSingletonGroupPairs/);
 assert.match(html,/checked:new Map\(\),decisions:new Map\(\),seen:new Set\(\)/);
 assert.match(html,/decide\('same'\)/);
 assert.match(html,/decide\('different'\)/);
 assert.match(html,/decide\('later'\)/);
 assert.match(html,/window\.confirm\('選んだ'/);
 assert.match(html,/data\.mergeTeacherReviewedGroupPairs/);
 assert.match(html,/data\.mergeUndo\.push\(snapshot\)/);
 assert.match(html,/renderCurrentAlbumAiGroups\(\);renderCurrentAlbumSingletonPairs\(\)/);
});
test('写真や端末変更時に単独候補表示を破棄し、勝手に顔を外部送信しない',()=>{
 assert.match(html,/function clearCurrentAlbumSingletonPairs\(\)/);
 assert.match(html,/clearCurrentAlbumSingletonPairs\(\);/);
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const stop=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const snippet=html.slice(start,stop);
 assert.ok(stop>start);
 assert.doesNotMatch(snippet,/files\.splice\(|localStorage\.|indexedDB\.|fetch\(|sendBeacon\(/);
 assert.match(snippet,/if\(data!==albumAiGroupsData\|\|!data\.valid\(\)\)/);
});

test('BJは全候補を対象に1組ずつ表示し、元の写真を切り抜かず比較できる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(view,/limit:Math\.max\(24,groups\.length\)/);
 assert.match(view,/let position=candidates\.findIndex\(item=>!seen\.has\(pairId\(item\)\)\)/);
 assert.match(view,/candidates\[position\]/);
 assert.match(view,/pairReviewPhotos/);
 assert.match(view,/img\.src=fileUrl\(file\)/);
 assert.match(view,/openAlbumAssignedPhoto\(sample\.index\)/);
 assert.match(view,/pairFaceMarker/);
 assert.match(view,/decisions\.set\(id,choice\)/);
 assert.match(view,/data\.mergeTeacherReviewedGroupPairs/);
 assert.doesNotMatch(view,/currentAlbumFaceThumbnail/);
 assert.match(html,/#albumAiSingletonPairs\.currentAlbumAiGroups\{display:block/);
 assert.match(html,/\.pairOriginalFrame img\{display:block;width:100%;height:100%;object-fit:contain\}/);
});
test('BJは違う園児・保留・前の候補を安全に見直せる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/data\.skippedSingletonPairs=new Set\(\)/);
 assert.match(view,/restoreSkipped\.addEventListener\('click'/);
 assert.match(view,/different\.textContent='違う園児'/);
 assert.match(view,/skipped\.add\(id\)/);
 assert.match(view,/checked\.delete\(id\)/);
 assert.match(view,/position=Math\.max\(0,position-1\)/);
 assert.match(view,/skipped\.clear\(\)/);
 assert.match(view,/元写真やグループは変更していません/);
 assert.doesNotMatch(view,/files\.splice\(|indexedDB\.|localStorage\.setItem\(/);
 assert.match(view,/const assignments=data\.assignConfirmedAlbumCluster/);
 assert.match(view,/data\.groups=next;data\.nextGroupId=nextId;photoAssignments=assignments/);
});
test('BJは元写真全体に対象の顔位置を重ね、拡大表示も維持する',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/rect\.setAttribute\('x',String\(x\/scale\)\)/);
 assert.match(view,/img\.naturalWidth,height=img\.naturalHeight/);
 assert.match(view,/button\.addEventListener\('click',\(\)=>openAlbumAssignedPhoto\(sample\.index\)\)/);
 assert.match(html,/function openAlbumAssignedPhoto\(index\)/);
 assert.match(html,/id="assignmentDialogImage"/);
});
test('BKは同じ園児の確認後に、その場で園児名を選んで振り分けられる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(html,/PHOTO SORT · 2026-10-23 BO/);
 assert.match(view,/same\.addEventListener\('click',\(\)=>\{/);
 assert.match(view,/childSelect\.setAttribute\('aria-label','振り分け先の園児名'\)/);
 assert.match(view,/getChildren\(data\.classId\)/);
 assert.match(view,/assignPanel\.hidden=false/);
 assert.match(view,/assignButton\.addEventListener\('click'/);
 assert.match(view,/assignLater\.addEventListener\('click',\(\)=>\{/);
 assert.match(view,/pendingPair=null;decide\('same'\)/);
 assert.match(view,/assignCancel\.addEventListener\('click'/);
});
test('BKは元写真をすべて一覧確認し、顔の位置も見てから園児を選べる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/const faces=\[\.\.\.sourceFaces,\.\.\.targetFaces\]/);
 assert.match(view,/const preview=originalPhoto\(\{faceIndexes:\[faceIndex\]\}/);
 assert.match(view,/openAlbumAssignedPhoto\(sample\.index\)/);
 assert.match(view,/pairFaceMarker/);
 assert.match(html,/\.pairReviewGroupPhotos\{display:grid/);
 assert.match(html,/\.pairReviewGroupPhotos \.pairOriginalFrame\{height:112px\}/);
});
test('BKは同写真別顔の統合を拒否し、振り分け失敗時は元データを保つ',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 const joined=view.indexOf('const next=keptSource.length&&keptTarget.length?');
 const validated=view.indexOf('const assignments=data.assignConfirmedAlbumCluster',joined);
 const committed=view.indexOf('data.groups=next;data.nextGroupId=nextId;photoAssignments=assignments;',validated);
 assert.ok(joined>=0&&validated>joined&&committed>validated);
 assert.match(view,/if\(data!==albumAiGroupsData\|\|!data\.valid\(\)\)/);
 assert.match(view,/data\.confirmed\.add\(destinationKey\)/);
 assert.match(view,/data\.mergeUndo=\[\]/);
 assert.doesNotMatch(view,/files\.splice\(|indexedDB\.|localStorage\.setItem\(|fetch\(|sendBeacon\(/);
});
test('BKは園児への振り分け後も残りの確認候補を引き継ぐ',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/data\.pairReviewSession\|\|\(data\.pairReviewSession=/);
 assert.match(view,/const \{checked,decisions,seen\}=session/);
 assert.match(view,/candidates\.findIndex\(item=>!seen\.has\(pairId\(item\)\)\)/);
 assert.match(view,/renderPhotoAssignmentPage\(\)/);
 assert.match(view,/renderCurrentAlbumAiGroups\(\)/);
 assert.match(view,/renderCurrentAlbumSingletonPairs\(\)/);
});

test('BLは園児名を先に選び、写真を見ながら確定予定枚数を確認できる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(html,/PHOTO SORT · 2026-10-23 BO/);
 assert.match(view,/assignPanel\.append\(assignTitle,childSelect,assignSummary,assignHint,assignPhotos,assignButtons\)/);
 assert.match(view,/assignSummary\.textContent=\(kid\?/);
 assert.match(view,/const photoCount=photoFaces\.size/);
 assert.match(view,/assignButton\.disabled=!kid\|\|!included\.length/);
 assert.match(view,/childSelect\.onchange=\(\)=>\{feedback\.textContent='';refreshAssignPreview\(\)\}/);
});
test('BLは写真ではなく検出された顔ごとに候補から外して戻せる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/pendingPair\.excluded\.add\(faceIndex\)/);
 assert.match(view,/pendingPair\.excluded\.delete\(faceIndex\)/);
 assert.match(view,/pairExcludedFace/);
 assert.match(view,/pairExcludeToggle/);
 assert.match(view,/entry\.dataset\.faceIndex=String\(faceIndex\)/);
 assert.match(view,/preview=originalPhoto\(\{faceIndexes:\[faceIndex\]\}/);
 assert.match(view,/if\(!kept\.length\)throw Error/);
 assert.match(html,/\.pairReviewFaceItem\.pairExcludedFace \.pairOriginalPhoto/);
});
test('BLは確定するまで園児フォルダも顔グループも変更せず、確定時だけ一括変更する',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 const validated=view.indexOf('const assignments=data.assignConfirmedAlbumCluster');
 const moved=view.indexOf('data.groups=next;data.nextGroupId=nextId;photoAssignments=assignments',validated);
 assert.ok(validated>=0&&moved>validated);
 assert.match(view,/const filtered=data\.groups\.map\(group=>/);
 assert.match(view,/data\.mergeTeacherReviewedGroupPairs\(filtered,data\.samples,\[draft\.item\]\)/);
 assert.match(view,/const keptSource=draft\.sourceFaces\.filter\(i=>!draft\.excluded\.has\(i\)\)/);
 assert.match(view,/const keptTarget=draft\.targetFaces\.filter\(i=>!draft\.excluded\.has\(i\)\)/);
 assert.match(view,/photoAssignments=assignments/);
 assert.doesNotMatch(view,/files\.splice\(|localStorage\.setItem\(|indexedDB\.|sendBeacon\(|fetch\(/);
});
test('BLは外した顔を未確定の一人グループへ戻し、次のAI比較候補を作れる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/for\(const faceIndex of excludedFaces\)/);
 assert.match(view,/next\.push\(\{key:'teacher-recheck-'\+\(\+\+nextId\),faceIndexes:\[faceIndex\]\}\)/);
 assert.match(view,/renderCurrentAlbumAiGroups\(\);renderCurrentAlbumSingletonPairs\(\)/);
 assert.match(view,/data\.suggestSingletonGroupPairs\(data\.samples,groups/);
 assert.match(view,/candidates\.findIndex\(item=>!seen\.has\(pairId\(item\)\)\)/);
 assert.match(view,/assignLater\.addEventListener\('click'/);
 assert.match(view,/外した顔はまだ反映されていないよ/);
});

test('BMは2段階の確認をなくし、最初から両グループの全写真を見せる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(html,/PHOTO SORT · 2026-10-23 BO/);
 assert.match(view,/for\(const \[title,sectionFaces\] of \[\['候補①',sourceFaces\],\['候補②',targetFaces\]\]\)/);
 assert.match(view,/for\(const faceIndex of sectionFaces\)/);
 assert.match(view,/const preview=originalPhoto\(\{faceIndexes:\[faceIndex\]\},'元写真'\)/);
 assert.match(view,/openPairAssignment\(\); \/\/ Start directly with the full candidate groups\./);
 assert.match(view,/card\.append\(names,photos,feedback,assignPanel,actions,navigation,complete\)/);
 assert.match(view,/photos\.replaceChildren\(\);photos\.hidden=true/);
 assert.match(html,/#albumAiSingletonPairs \.pairReviewGroupPhotos\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('BMは写真を確認しながら同じ／違うを直接判断し、園児名付きなら即振り分ける',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/actions\.append\(same,different\)/);
 assert.match(view,/actions\.hidden=false;navigation\.hidden=false;assignPanel\.hidden=false/);
 assert.match(view,/same\.addEventListener\('click',\(\)=>\{/);
 assert.match(view,/if\(childSelect\.value\)\{/);
 assert.match(view,/if\(assignButton\.disabled\)\{/);
 assert.match(view,/assignButton\.click\(\);return;/);
 assert.match(view,/decide\('same'\)/);
 assert.match(view,/different\.addEventListener\('click'/);
 assert.match(view,/decide\('different'\)/);
 assert.match(view,/later\.addEventListener\('click'/);
 assert.match(view,/decide\('later'\)/);
});
test('BMは誤分類の顔を個別に除外でき、未確定へ戻して再候補化する',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/pendingPair\.excluded\.add\(faceIndex\)/);
 assert.match(view,/pendingPair\.excluded\.delete\(faceIndex\)/);
 assert.match(view,/const excludedFaces=\[\.\.\.draft\.excluded\]/);
 assert.match(view,/next\.push\(\{key:'teacher-recheck-'\+\(\+\+nextId\),faceIndexes:\[faceIndex\]\}\)/);
 assert.match(view,/data\.suggestSingletonGroupPairs\(data\.samples,groups/);
 assert.doesNotMatch(view,/files\.splice\(|indexedDB\.|localStorage\.setItem\(|fetch\(|sendBeacon\(/);
});

test('BOは重複した予定写真一覧をなくし、候補①と候補②の写真だけを表示',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(html,/PHOTO SORT · 2026-10-23 BO/);
 assert.match(view,/assignPanel\.append\(assignTitle,childSelect,assignSummary,assignHint,assignPhotos,assignButtons\)/);
 assert.doesNotMatch(html,/pairPlannedPhotos|pairPlannedPhoto|pairPlannedHeading/);
 assert.match(view,/for\(const \[title,sectionFaces\] of \[\['候補①',sourceFaces\],\['候補②',targetFaces\]\]\)/);
 assert.match(view,/for\(const faceIndex of sectionFaces\)/);
 assert.match(view,/const preview=originalPhoto\(\{faceIndexes:\[faceIndex\]\},'元写真'\)/);
 assert.match(view,/const frame=document\.createElement\('span'\);frame\.className='pairOriginalFrame'/);
 assert.match(view,/openAlbumAssignedPhoto\(sample\.index\)/);
});
test('BOは候補から顔を外しても振り分け予定枚数が正しく更新される',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/const included=faces\.filter\(i=>!pendingPair\.excluded\.has\(i\)\)/);
 assert.match(view,/const photoFaces=new Map\(\)/);
 assert.match(view,/if\(Number\.isInteger\(photoIndex\)&&!photoFaces\.has\(photoIndex\)\)photoFaces\.set\(photoIndex,faceIndex\)/);
 assert.match(view,/const photoCount=photoFaces\.size/);
 assert.match(view,/pendingPair\.excluded\.add\(faceIndex\)/);
 assert.match(view,/pendingPair\.excluded\.delete\(faceIndex\)/);
 assert.match(view,/refreshAssignPreview\(\);feedback\.textContent=''/);
 assert.match(view,/assignButton\.disabled=!kid\|\|!included\.length\|\|conflicting/);
 assert.doesNotMatch(view,/files\.splice\(|releasePhotoUrl\(|localStorage\.setItem\(|indexedDB\./);
});

test('BIは操作を解析→顔の確認→園児フォルダの三段階に限定する',()=>{
 assert.match(html,/data-screen="photoAssign" data-flow-step="start"/);
 assert.match(html,/id="photoAssignFlowGuide"/);
 assert.match(html,/id="photoAssignFlowManual"/);
 assert.match(html,/id="photoAssignFlowNext"/);
 assert.match(html,/id="photoAssignFlowBack"/);
 assert.match(html,/function setPhotoAssignFlowStep\(step/);
 assert.match(html,/setPhotoAssignFlowStep\('review'\)/);
 assert.match(html,/renderCurrentAlbumSingletonPairs\(\);\s*check\(\);/);
 assert.match(html,/setPhotoAssignFlowStep\('folders',\{scroll:true\}\)/);
 assert.match(html,/setPhotoAssignFlowStep\('start'\);\s*albumAiGeneration\+\+/);
 assert.match(html,/スクロール|scrollIntoView/);
});
test('BIは難しい顔認識設定と大量の候補を必要なときだけ開ける',()=>{
 assert.match(html,/id="photoAssignDevTools"/);
 assert.match(html,/id="albumAiOtherGroups"/);
 assert.match(html,/if\(details\)details\.open=false/);
 assert.match(html,/id="currentAlbumAiDiagnosticPanel"/);
 assert.match(html,/data-flow-step="start"/);
 assert.match(html,/data-flow-step="review"/);
 assert.match(html,/data-flow-step="folders"/);
 assert.match(html,/id="faceReferenceAdvanced"/);
 assert.match(html,/id="finishPhotoAssign"/);
});
test('BIの画面整理で操作対象を消さず元写真・保存・園児編集機能を維持',()=>{
 assert.match(html,/id="albumAiUndoMerge"/);
 assert.match(html,/id="albumAiFindSingletonPairs"/);
 assert.match(html,/id="albumChildFolderList"/);
 assert.match(html,/id="photoAssignGrid"/);
 assert.match(html,/id="albumAddMorePhotos"/);
 assert.match(html,/id="assignmentTransferPanel"/);
 assert.match(html,/id="photoAssignProgress"/);
 assert.match(html,/for="assignmentFolderPicker"/);
 assert.match(html,/function renderCurrentAlbumAiGroups\(\)/);
 assert.match(html,/function renderAlbumAiChildFolders\(\)/);
});

test('BIは解析エラー時に最初の操作へ戻り、手動振り分けを選べる',()=>{
 const start=html.indexOf("$('#analyzeCurrentAlbum')?.addEventListener");
 const end=html.indexOf('function updateAssignmentSourceUi()',start);
 const body=html.slice(start,end);
 assert.match(body,/setPhotoAssignFlowStep\('start'\)/);
 assert.match(body,/status\.textContent='⚠️ AI解析できませんでした/);
 assert.match(html,/id="photoAssignFlowManual"/);
});
