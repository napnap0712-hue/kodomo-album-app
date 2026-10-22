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
