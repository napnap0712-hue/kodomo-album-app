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
 assert.match(html,/\$\('#createNew'\)\.addEventListener\('click',\(\)=>\{pendingProjectSlot=null;photoSortCheckpointKnownSavedAt=null;files=\[\];photoAssignments=\[\];assignmentSourceType='manual';clearCurrentAlbumAi\(\)/);
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
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
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
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
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
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
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
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
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
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
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

test('BPは顔の候補から元写真全体を使わない扱いにできる',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const review=html.slice(start,end);
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
 assert.match(review,/discard\.textContent='🗑 この写真は使わない'/);
 assert.match(review,/setCurrentAlbumPhotoUnused\(data,photoIndex\)/);
 assert.match(html,/function setCurrentAlbumPhotoUnused\(data,photoIndex\)/);
 assert.match(html,/data\.unusedPhotoIndexes\.add\(photoIndex\)/);
 assert.match(html,/faceIndexes:group\.faceIndexes\.filter\(i=>data\.samples\[i\]\?\.index!==photoIndex\)/);
 assert.match(html,/端末の元写真は削除しません/);
 assert.doesNotMatch(html.slice(html.indexOf('function setCurrentAlbumPhotoUnused('),html.indexOf('function restoreLastUnusedAlbumPhoto(')),/files\.splice\(|photoAssignments=|indexedDB\.|localStorage\.setItem\(/);
});
test('BPは使わない写真を見直す際に復元可能で、複数の顔も保持する',()=>{
 const start=html.indexOf('function renderCurrentAlbumSingletonPairs()');
 const end=html.indexOf("$('#albumAiFindSingletonPairs')?.addEventListener",start);
 const view=html.slice(start,end);
 assert.match(view,/restore\.textContent='↩ 使わない写真を1枚戻す（除外中 '/);
 assert.match(view,/restoreLastUnusedAlbumPhoto\(data\)/);
 assert.match(html,/data\.unusedPhotoOrder\.pop\(\)/);
 assert.match(html,/data\.unusedPhotoIndexes\.delete\(index\)/);
 assert.match(html,/data\.groups\.push\(\{key:'teacher-restored-'\+\(\+\+data\.nextGroupId\),faceIndexes:\[i\]\}\)/);
 assert.match(html,/const session=data\.pairReviewSession/);
 assert.match(html,/session\.checked\.delete\(id\)/);
 assert.match(html,/session\.decisions\.delete\(id\)/);
 assert.match(html,/session\.seen\.delete\(id\)/);
 assert.match(html,/renderCurrentAlbumAiGroups\(\)/);
 assert.match(html,/renderCurrentAlbumSingletonPairs\(\)/);
});
test('BPは除外した写真を園児フォルダと進捗から外し、編集開始時にだけ削除する',()=>{
 assert.match(html,/function isAlbumUnusedPhoto\(index\)/);
 assert.match(html,/if\(isAlbumUnusedPhoto\(index\)\)return false/);
 assert.match(html,/for\(let i=0;i<files\.length;i\+\+\)if\(!isAlbumUnusedPhoto\(i\)\)/);
 assert.match(html,/const done=files\.filter\(\(_,i\)=>!isAlbumUnusedPhoto\(i\)&&assignmentPhotoIds\(i\)\.length\)\.length/);
 assert.match(html,/const unused=albumAiGroupsData\?\.valid\(\) \? albumAiGroupsData\.unusedPhotoIndexes : null/);
 assert.match(html,/const keep=files\.map\(\(file,index\)=>\(\{file,index\}\)\)\.filter\(item=>!unused\.has\(item\.index\)\)/);
 assert.match(html,/files=keep\.map\(item=>item\.file\)/);
 assert.match(html,/photoAssignments=keep\.map\(item=>photoAssignments\[item\.index\]\|\|\[\]\)/);
 assert.match(html,/clearCurrentAlbumAi\(\)/);
});

test('BPは写真1枚を外しても関係のない確認済み候補を保持する',()=>{
 const start=html.indexOf('function refreshAfterAlbumPhotoUseChange(');
 const end=html.indexOf('function setPhotoAssignFlowStep(',start);
 const view=html.slice(start,end);
 assert.match(view,/const keys=new Set\(affectedKeys\.map\(String\)\)/);
 assert.match(view,/const affected=id=>id\.split\('→'\)\.some\(key=>keys\.has\(key\)\)/);
 assert.match(view,/if\(affected\(id\)\)session\.seen\.delete\(id\)/);
 assert.match(view,/if\(affected\(id\)\)data\.skippedSingletonPairs\.delete\(id\)/);
 assert.doesNotMatch(view,/data\.pairReviewSession=null|data\.skippedSingletonPairs\?\.clear\(\)/);
 assert.match(html,/const affectedKeys=data\.groups\.filter\(group=>group\.faceIndexes\.some\(i=>data\.samples\[i\]\?\.index===photoIndex\)\)/);
});

test('BQはアルバムの同じ枠から途中保存と再開を選べる',()=>{
 assert.match(html,/id="savePhotoSortProgress"/);
 assert.match(html,/id="photoSortProgressSaveStatus"/);
 assert.match(html,/id="photoSortResumeBox"/);
 assert.match(html,/id="resumePhotoSortProgress"/);
 assert.match(html,/function photoSortCheckpointKey\(\)/);
 assert.match(html,/Number\.isInteger\(pendingProjectSlot\)\?'slot-'\+pendingProjectSlot:'new-album'/);
 assert.match(html,/function refreshPhotoSortResumeAvailability\(\)/);
 assert.match(html,/photoSortCheckpointKnownSavedAt=null/);
 assert.match(html,/void refreshPhotoSortResumeAvailability\(\)/);
});
test('BQは正式なアルバム保存領域を変更せず別のIndexedDBへ書き込む',()=>{
 assert.match(html,/PHOTO_SORT_CHECKPOINT_DB='omoide-photo-sort-progress-v1'/);
 assert.match(html,/indexedDB\.open\(PHOTO_SORT_CHECKPOINT_DB,1\)/);
 assert.match(html,/createObjectStore\('checkpoints',\{keyPath:'key'\}\)/);
 assert.match(html,/async function saveCurrentPhotoSortCheckpoint\(\)/);
 assert.match(html,/photoSortCheckpointWrite\(snapshot\)/);
 assert.match(html,/const verified=await photoSortCheckpointRead\(key\)/);
 assert.match(html,/verified\.photos\.some\(\(p,i\)=>!\(p\.blob instanceof Blob\)/);
 assert.match(html,/photoSortCheckpointKnownSavedAt!==current\.savedAt/);
 const start=html.indexOf('function photoSortCheckpointOpen()');
 const stop=html.indexOf('// An album is a fresh photo batch.',start);
 const body=html.slice(start,stop);
 assert.doesNotMatch(body,/putDraft\(|saveSplit|DELETE FROM|omoide-new-split-albums-v1/);
});
test('BQの保存データに顔の特徴量を含めず、園児名とグループだけ残す',()=>{
 const start=html.indexOf('function photoSortCheckpointCaptureAI(');
 const end=html.indexOf('async function refreshPhotoSortResumeAvailability(',start);
 const body=html.slice(start,end);
 assert.match(body,/samples:data\.samples\.map\(sample=>\(\{index:sample\.index,box:\[\.\.\.sample\.box\]\}\)\)/);
 assert.match(body,/groups:data\.groups\.map\(g=>\(\{key:g\.key,faceIndexes:\[\.\.\.g\.faceIndexes\]\}\)\)/);
 assert.match(body,/confirmed:\[\.\.\.data\.confirmed\]/);
 assert.match(body,/unusedPhotoIndexes:\[\.\.\.data\.unusedPhotoIndexes\]/);
 assert.match(body,/pairReviewSession:data\.pairReviewSession/);
 assert.doesNotMatch(body,/embedding:|data\.samples\.map\(sample=>sample\)/);
});
test('BQの再開は写真を再解析して検証完了後にだけ元の状態へ反映',()=>{
 assert.match(html,/async function resumePhotoSortCheckpoint\(\)/);
 assert.match(html,/photoSortRestoreFaceSamples\(row\.ai,savedFiles/);
 assert.match(html,/humanFacesFromBlob\(human,loadedFiles\[photo\]\)/);
 assert.match(html,/fresh\.length!==expected\.length/);
 assert.match(html,/bestScore>tolerance/);
 assert.match(html,/row\.registered!==JSON\.stringify\(getChildren\(selected\.id\)\)/);
 const start=html.indexOf('async function resumePhotoSortCheckpoint(');
 const stop=html.indexOf("$('#resumePhotoSortProgress')?.addEventListener",start);
 const body=html.slice(start,stop);
 const verify=body.indexOf('const samples=await photoSortRestoreFaceSamples');
 const commit=body.indexOf('files=savedFiles;photoAssignments=assignmentCopies;');
 assert.ok(verify>=0&&commit>verify);
 assert.match(body,/pairReviewSession:snapshot\.pairReviewSession\?/);
 assert.match(body,/renderCurrentAlbumSingletonPairs\(\)/);
 assert.match(body,/photoSortCheckpointKnownSavedAt=row\.savedAt/);
 assert.doesNotMatch(body,/localStorage\.setItem\(|fetch\(|sendBeacon\(/);
});

test('BQは顔特徴データを保存せず教師の確認状態を復元できる形にする',()=>{
 const start=html.indexOf('function photoSortCheckpointCaptureAI(');
 const stop=html.indexOf('async function refreshPhotoSortResumeAvailability(',start);
 const source=html.slice(start,stop);
 const capture=new Function('data',source+'return photoSortCheckpointCaptureAI(data)');
 const groups=[{key:'current-1',faceIndexes:[0,1]}];
 const data={
  valid:()=>true,
  samples:[{index:0,box:[10,20,30,40],embedding:[.2,.7]},{index:1,box:[20,30,40,50],embedding:[.4,.3]}],
  groups,confirmed:new Set(['current-1']),unusedPhotoIndexes:new Set([2]),
  unusedPhotoOrder:[2],skippedSingletonPairs:new Set(['z→y']),
  pairReviewSession:{checked:new Map([['a→b',{sourceKey:'a',targetKey:'b'}]]),
   decisions:new Map([['c→d','different']]),seen:new Set(['a→b','c→d'])},
  expanded:new Set(['current-1']),visibleLimit:36,nextGroupId:7,mergeUndo:[groups]
 };
 const out=capture(data);
 assert.equal(out.samples.length,2);
 assert.deepEqual(out.samples[0],{index:0,box:[10,20,30,40]});
 assert.deepEqual(out.pairReviewSession.checked,[['a→b',{sourceKey:'a',targetKey:'b'}]]);
 assert.deepEqual(out.pairReviewSession.seen,['a→b','c→d']);
 assert.deepEqual(out.unusedPhotoIndexes,[2]);
 assert.doesNotMatch(JSON.stringify(out),/embedding/);
});
test('BQは写真内の顔の順番が変わっても安全に対応付けて復元する',async()=>{
 const start=html.indexOf('async function photoSortRestoreFaceSamples(');
 const stop=html.indexOf('async function resumePhotoSortCheckpoint(',start);
 const helpers=html.slice(start,stop);
 const fake=[
  [{box:[20,10,20,20],embedding:[1,0]}],
  [{box:[110,110,20,20],embedding:[0,1]},{box:[5,5,20,20],embedding:[1,1]}]
 ];
 const make=found=>new Function('found',"const loadHumanRecognition=async()=>({});\n"+
  "const humanFacesFromBlob=async(_human,blob)=>found[blob.index];\n"+
  helpers+"\nreturn {photoSortRestoreFaceSamples,photoSortRestoreAiData};")(found);
 const methods=make(fake);
 const saved={
  samples:[{index:0,box:[20,10,20,20]},{index:1,box:[5,5,20,20]},{index:1,box:[110,110,20,20]}],
  groups:[{key:'a',faceIndexes:[0,1]},{key:'b',faceIndexes:[2]}],
  confirmed:['a'],unusedPhotoIndexes:[],unusedPhotoOrder:[]
 };
 const photos=[{index:0},{index:1}];
 const actual=await methods.photoSortRestoreFaceSamples(saved,photos,()=>{},()=>{});
 assert.deepEqual(actual.map(x=>x.embedding),[[1,0],[1,1],[0,1]]);
 assert.doesNotThrow(()=>methods.photoSortRestoreAiData(saved,photos,''));
 const broken=fake.map(x=>[...x]);broken[1]=broken[1].slice(0,1);
 await assert.rejects(()=>make(broken).photoSortRestoreFaceSamples(saved,photos,()=>{},()=>{}),/顔の検出結果が保存時と一致しません/);
 assert.throws(()=>methods.photoSortRestoreAiData({...saved,groups:[{key:'a',faceIndexes:[0,0]}]},photos,''),/重複や不整合/);
});

test('BQは途中保存した空き枠を一覧で識別でき、写真本体を読み込まない',()=>{
 assert.match(html,/function renderPhotoSortPendingSlotBadges\(\)/);
 assert.match(html,/objectStore\('checkpoints'\)\.getAllKeys\(\)/);
 assert.match(html,/available\.has\(prefix\+slot\)/);
 assert.match(html,/btn\.classList\.contains\('hasProject'\)/);
 assert.match(html,/label\.textContent='🌷 振り分け途中'/);
 assert.match(html,/renderSplitProjectCards\(\)\.catch/);
 assert.match(html,/\.finally\(\(\)=>\{void renderPhotoSortPendingSlotBadges\(\)\}\)/);
 assert.match(html,/\.photoSortSlotBadge\{display:block/);
});

test('BRのPC版は大きな見開きと5種類の編集ツールを2カラムに配置する',()=>{
 const start=html.indexOf('/* BR / desktop editor:');
 const end=html.indexOf('</style>',start);
 const css=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(html,/ALBUM EDITOR · 2026-10-23 BY/);
 assert.match(css,/@media\(min-width:980px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) clamp\(310px,28vw,392px\)/);
 assert.match(css,/\.editorPanel>.editorCanvasFirst\{/);
 assert.match(css,/grid-column:1;grid-row:2 \/ span 2/);
 assert.match(css,/\.mobileEditorTabs\{/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.editorPanel>:is\(\.desktopEditorWelcome,\.pageSettings,\.photoManager,#seasonStickerPanel,\.editorLayerPanel,\.textTabUnifiedCard\)/);
 assert.match(css,/position:sticky;top:12px/);
 assert.match(html,/class="desktopEditorWelcome"/);
});
test('BRは写真・背景・文字・スタンプの既存機能を保持し、PCのメニューだけ切り替える',()=>{
 const start=html.indexOf('/* BR / desktop editor:');
 const end=html.indexOf('</style>',start);
 const css=html.slice(start,end);
 assert.match(css,/\[data-editor-tab="background"\] \.editorPanel>\.pageSettings/);
 assert.match(css,/\[data-editor-tab="layout"\] \.editorPanel>\.pageSettings/);
 assert.match(css,/\[data-editor-tab="photos"\] \.editorPanel>\.photoManager/);
 assert.match(css,/\[data-editor-tab="text"\] \.editorPanel>\.textTabUnifiedCard/);
 assert.match(css,/\[data-editor-tab="stamps"\] \.editorPanel>#seasonStickerPanel/);
 assert.match(html,/function setupUnifiedTextTab\(\)/);
 assert.match(html,/function setupPhotoSectionTabs\(\)/);
 assert.match(html,/function switchEditorTab\(tab\)/);
 assert.match(html,/id="designCanvas"/);
 assert.match(html,/id="saveDraft"/);
 assert.match(html,/id="exportImage"/);
 assert.match(html,/id="photoStrip"/);
});
test('BRのレイアウト変更はデスクトップ幅だけでスマホ版CSSと保存処理に触れない',()=>{
 const start=html.indexOf('/* BR / desktop editor:');
 const end=html.indexOf('</style>',start);
 const css=html.slice(start,end);
 const desktop=css.slice(css.indexOf('@media(min-width:980px)'));
 assert.ok(css.indexOf('.desktopEditorWelcome{display:none}')>=0);
 assert.match(css,/@media\(min-width:980px\) and \(max-height:690px\)/);
 assert.doesNotMatch(desktop,/@media\(max-width:(?:599|700|900)px\)/);
 assert.match(html,/\.screen\[data-screen="editor"\]\.newSplitPreparation \.editorPanel\{display:none!important\}/);
 assert.match(html,/function startEditingWithSelectedPhotos\(\)/);
 assert.match(html,/const PHOTO_SORT_CHECKPOINT_DB='omoide-photo-sort-progress-v1'/);
 assert.doesNotMatch(css,/localStorage|indexedDB|photoAssignments|saveDraft\(/);
});

test('BSはパソコン編集画面で見開きを実寸の編集領域にフィットさせる',()=>{
 const start=html.indexOf('function fitDesktopEditorCanvas()');
 const end=html.indexOf('let desktopEditorFitQueued=',start);
 const body=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(body,/window\.matchMedia\('\(min-width:980px\)'\)\.matches/);
 assert.match(body,/wrap\.clientWidth-horizontalPadding-2/);
 assert.match(body,/Math\.min\(measured,targetHeight\*1\.414\)/);
 assert.match(body,/canvas\.style\.width=targetWidth\+'px'/);
 assert.match(body,/canvas\.style\.height=Math\.round\(targetWidth\/1\.414\)\+'px'/);
 assert.match(body,/canvas\.style\.removeProperty\('width'\)/);
 assert.match(body,/canvas\.style\.removeProperty\('height'\)/);
 assert.match(html,/if\(id==='editor'\)requestDesktopEditorFit\(\)/);
 assert.match(html,/window\.addEventListener\('resize',requestDesktopEditorFit/);
 assert.match(html,/new ResizeObserver\(\(\)=>requestDesktopEditorFit\(\)\)/);
});
test('BSの見開きフィットはデスクトップとモバイルで正しい大きさになる',()=>{
 const start=html.indexOf('function fitDesktopEditorCanvas()');
 const end=html.indexOf('let desktopEditorFitQueued=',start);
 const body=html.slice(start,end);
 const removed=[];
 const canvas={style:{width:'',height:'',maxWidth:'',maxHeight:'',
  removeProperty(name){removed.push(name);delete this[name]}},closest:()=>wrap};
 const wrap={clientWidth:900};
 let desktop=true,active=true;
 const fit=new Function('canvas','wrap','desktop','active','width','height','removed',
  'const $=()=>canvas;const window={innerHeight:height,matchMedia:()=>({matches:desktop})};'+
  'const document={querySelector:()=>({classList:{contains:()=>active}})};'+
  'const getComputedStyle=()=>({paddingLeft:"14px",paddingRight:"14px"});'+
  body+'return fitDesktopEditorCanvas();');
 fit(canvas,wrap,true,true,900,900,removed);
 assert.equal(canvas.style.width,'869px');
 assert.equal(canvas.style.height,'615px');
 const off=canvas.style.width;
 fit(canvas,wrap,false,true,390,810,removed);
 assert.ok(removed.includes('width')&&removed.includes('height'));
 assert.equal(canvas.style.width,undefined);
 assert.ok(off!=='0px');
});
test('BSは保存・書き出し・復旧を残したままPCの追加ボタンのみ畳む',()=>{
 const css=html.slice(html.indexOf('/* BS: Mac / Windows editing workstation.'),html.indexOf('</style>',html.indexOf('/* BS: Mac / Windows editing workstation.')));
 assert.match(html,/id="desktopEditorMore" aria-expanded="false"/);
 assert.match(html,/id="saveDraft"/);
 assert.match(html,/id="exportImage"/);
 assert.match(html,/id="restoreSplitBackup"/);
 assert.match(html,/id="viewSplitHistory"/);
 assert.match(css,/\.desktopEditorMore\{display:none\}/);
 assert.match(css,/@media \(min-width:980px\)/);
 assert.match(css,/desktopExtrasOpen>button:not\(#saveDraft\):not\(#exportImage\)/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.doesNotMatch(css,/indexedDB|localStorage|photoAssignments|putDraft/);
});

test('BTはPCの編集メニュー直下に案内・設定を並べ、左キャンバスの高さによる大きな空白を防ぐ',()=>{
 const start=html.indexOf('/* BT: Keep the desktop editor sidebar');
 const end=html.indexOf('</style>',start);
 const css=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(css,/@media \(min-width:980px\)/);
 assert.match(css,/grid-template-rows:auto minmax\(0,auto\)!important/);
 assert.match(css,/\.editorPanel>\.editorCanvasFirst\{\s*grid-row:2!important/);
 assert.match(css,/\.editorPanel>\.mobileEditorTabs\{\s*grid-row:2!important/);
 assert.match(css,/\.desktopEditorWelcome,\.pageSettings,\.photoManager,#seasonStickerPanel,\.editorLayerPanel,\.textTabUnifiedCard/);
 assert.match(css,/grid-row:2!important;\s*margin-top:calc\(var\(--desktop-editor-tabs-height, 152px\) \+ 12px\)!important/);
 assert.match(html,/function syncDesktopEditorSidebarSpacing\(\)/);
 assert.match(html,/tabs\.getBoundingClientRect\(\)\.height/);
 assert.match(html,/fitDesktopEditorCanvas\(\);syncDesktopEditorSidebarSpacing\(\)/);
 assert.match(html,/new ResizeObserver\(\(\)=>syncDesktopEditorSidebarSpacing\(\)\)/);
 assert.doesNotMatch(css,/@media\s*\(max-width/);
});

test('BVのPC写真タブは右側にとどまり、写真一覧だけ2列で高さ制限と縦スクロールを持つ',()=>{
 const start=html.indexOf('/* BV: A bounded desktop photo library');
 const end=html.indexOf('</style>',start);
 const css=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(css,/@media \(min-width:980px\)/);
 assert.match(css,/\.editorPanel>\.photoManager\{/);
 assert.match(css,/grid-column:2!important;grid-row:2!important/);
 assert.match(css,/margin-top:calc\(var\(--desktop-editor-tabs-height, 152px\) \+ 12px\)!important/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/grid-auto-rows:max-content!important/);
 assert.match(css,/height:clamp\(210px,42dvh,490px\)!important/);
 assert.match(css,/overflow-y:auto!important;overflow-x:hidden!important/);
 assert.match(css,/scroll-snap-type:none!important/);
 assert.match(css,/\.photoAddPane\[hidden\]\{/);
 assert.doesNotMatch(css,/@media\s*\(max-width/);
});
test('BYの写真一覧はSafariで未設定srcの「？」を生まない',()=>{
 const begin=inline.indexOf('function renderPhotoStrip()');
 const stop=inline.indexOf('function elementId()',begin);
 const body=inline.slice(begin,stop);
 assert.ok(begin>0&&stop>begin);
 assert.match(body,/img\.loading='lazy'/);
 assert.match(body,/displayEditorPhotoReliably\(img,file\)/);
 assert.match(body,/strip\.onscroll=null/);
 assert.doesNotMatch(body,/refreshVisible|scheduleRefresh|if\(img\.src\)continue/);
 assert.match(body,/item\.addEventListener\('click'/);
 assert.match(body,/assign\.addEventListener\('click'/);
 assert.match(body,/remove\.addEventListener\('click'/);
});
test('BYは画像エラー時に元Blobを残して再読込と表示失敗の明示をする',()=>{
 const a=inline.indexOf('function displayEditorPhotoReliably(');
 const b=inline.indexOf('function renderPhotoStrip()',a);
 const helper=inline.slice(a,b);
 assert.ok(a>0&&b>a);
 assert.match(helper,/img\.insertAdjacentElement\('afterend',status\)/);
 assert.match(helper,/img\.style\.opacity='0'/);
 assert.match(helper,/img\.onload=/);
 assert.match(helper,/img\.onerror=async/);
 assert.match(helper,/URL\.createObjectURL\(file\)/);
 assert.match(helper,/reader\.readAsDataURL\(file\)/);
 assert.match(helper,/photoDataUrlFallbacks\.set\(file,data\)/);
 assert.match(helper,/img\.removeAttribute\('src'\)/);
 assert.match(helper,/写真を表示できません/);
 assert.doesNotMatch(helper,/\.splice\(|indexedDB\.|localStorage\.|store\.delete\(/);
 const node=inline.slice(inline.indexOf('function renderElementNode('),inline.indexOf("$('#designCanvas').addEventListener('pointerdown'"));
 assert.match(node,/displayEditorPhotoReliably\(img,file,el\.personCutout\)/);
});
test('BYはPC画像サイズを縮め、iPhoneには影響させない',()=>{
 const p=html.indexOf('/* BY: Smaller desktop photographs');
 const q=html.indexOf('</style>',p);
 const css=html.slice(p,q);
 assert.ok(p>0&&q>p);
 assert.match(css,/@media \(min-width:980px\)/);
 assert.match(css,/width:90%!important;max-width:142px!important;height:94px!important/);
 assert.match(css,/\.photoLoadState\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(css,/@media\s*\(max-width/);
});


test('BW: Photo gallery and every desktop tool remain direct children of editorPanel',()=>{
 const start=html.indexOf('<div class="editorPanel">');
 const end=html.indexOf('</section><section class="screen" data-screen="classManagement"',start);
 assert.ok(start>=0&&end>start);
 const fragment=html.slice(start,end);
 const stack=[],roots=new Map(),orphans=[];
 const voids=new Set(['input','img','br','hr','meta','link','source','wbr']);
 for(const m of fragment.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)){
  const raw=m[0],tag=m[1].toLowerCase();
  if(raw.startsWith('</')){
   const k=stack.findLastIndex(x=>x.tag===tag);
   if(k<0){orphans.push(raw);continue}
   stack.length=k;
  }else if(!voids.has(tag)&&!raw.endsWith('/>')){
   for(const cls of ['photoManager','pageSettings','mobileEditorTabs','desktopEditorWelcome','editorLayerPanel','designToolbar']){
    if(raw.includes('class="'+cls+'"'))roots.set(cls,stack.at(-1)?.raw||'');
   }
   if(raw.includes('class="pageSettingPane" data-page-pane="layout"'))roots.set('layoutPane',stack.at(-1)?.raw||'');
   stack.push({tag,raw});
  }
 }
 for(const cls of ['photoManager','pageSettings','mobileEditorTabs','desktopEditorWelcome','editorLayerPanel','designToolbar']){
  assert.equal(roots.get(cls),'<div class="editorPanel">',cls+' must be in the right editor grid');
 }
 assert.equal(roots.get('layoutPane'),'<div class="pageSettingsBody">');
 assert.ok(!orphans.includes('</details>'),'page settings details may not be prematurely closed');
});

test('BXはPC写真一覧の振り分けボタンのみ小さく、写真を主役にする',()=>{
 const start=html.indexOf('/* BX: Photo-first desktop thumbnails');
 const end=html.indexOf('</style>',start);
 assert.ok(start>0&&end>start);
 const css=html.slice(start,end);
 assert.match(css,/@media \(min-width:980px\)/);
 assert.match(css,/#photoStrip>\.photoThumb>\.photoAssignButton\{/);
 assert.match(css,/width:auto!important/);
 assert.match(css,/height:29px!important;min-height:29px!important;max-height:29px!important/);
 assert.match(css,/align-self:flex-end!important/);
 assert.match(css,/box-shadow:none!important/);
 assert.match(css,/font-size:11px!important/);
 assert.doesNotMatch(css,/@media\s*\(max-width:/);
 const src=html.slice(html.indexOf('function renderPhotoStrip()'),html.indexOf('function elementId()'));
 assert.match(src,/assign\.addEventListener\('click'/);
 assert.match(src,/assign\.textContent='振り分け'/);
 assert.match(src,/item\.append\(img,remove,name,assign\)/);
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
