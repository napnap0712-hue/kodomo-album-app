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
