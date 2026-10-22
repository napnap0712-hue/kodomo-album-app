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

test('園児フォルダを最初からAI候補より上に用意する',()=>{
 assert.ok(html.indexOf('id="albumChildFolderPanel"')<html.indexOf('id="currentAlbumAiPanel"'));
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
 const end=html.indexOf('function renderCurrentAlbumAiGroups()',start);
 const body=html.slice(start,end);
 assert.match(body,/const joined=data\.mergeTeacherAlbumGroupsBatch/);
 assert.ok(body.indexOf('const joined=')<body.indexOf('data.mergeUndo.push(snapshot)'));
 assert.match(body,/data\.mergeUndo\.push\(snapshot\)/);
 assert.match(body,/data\.groups=joined/);
 assert.match(body,/data\.confirmed\.has\(g\.key\)/);
 assert.doesNotMatch(body,/files\.splice\(|photoAssignments=|indexedDB\.|localStorage\./);
});

test('BFは今回取り込んだ写真だけでグループ改善を比較表示',()=>{
 assert.match(html,/PHOTO SORT · 2026-10-23 BF/);
 assert.match(html,/clusterCurrentAlbumFaces\(samples,\{similarity:faceEmbeddingSimilarity,photoCount:sourceFiles\.length\}\)/);
 assert.match(html,/result\.beforeCommunityGroups/);
 assert.match(html,/result\.communityMerges/);
 assert.match(html,/前の判定 /);
 assert.match(html,/改善後 /);
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

test('BFは単独候補の似た顔を横断的に表示し、先生のチェック後だけ統合する',()=>{
 assert.match(html,/id="albumAiSingletonReview"/);
 assert.match(html,/id="albumAiFindSingletonPairs"/);
 assert.match(html,/id="albumAiSingletonPairs"/);
 assert.match(html,/function renderCurrentAlbumSingletonPairs\(\)/);
 assert.match(html,/data\.suggestSingletonGroupPairs/);
 assert.match(html,/data\.mergeTeacherReviewedGroupPairs/);
 assert.match(html,/check\.addEventListener\('change'/);
 assert.match(html,/window\.confirm\('選んだ'/);
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
