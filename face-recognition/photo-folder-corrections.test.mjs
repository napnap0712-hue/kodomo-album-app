import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNamedFolderPreview} from './teacher-folder-names.mjs';
import {setPhotoFolderCorrection,transferPhotoFolderCorrection,trimPhotoFolderCorrections,photoFolderCorrectionsAsRows} from './photo-folder-corrections.mjs';

const folders=[
 {kind:'confirmed',members:[0,1],photos:[0,1,2]},
 {kind:'confirmed',members:[2,3],photos:[1,3]}
],roster=[{id:'a',name:'あお'},{id:'b',name:'はる'}],names=new Map([['0:1','a'],['2:3','b']]);
const preview=edits=>buildNamedFolderPreview(folders,roster,names,new Map(),edits);

test('集合写真を一人のフォルダから外しても、もう一人の写真リンクは残る',()=>{
 const corrections=setPhotoFolderCorrection(new Map(),1,'0:1',false,{photoCount:4,folderKeys:new Set(['0:1','2:3'])});
 const named=preview(corrections).named;
 assert.deepEqual(named[0].photoIndexes,[0,2]);
 assert.deepEqual(named[1].photoIndexes,[1,3]);
 assert.deepEqual(folders[0].photos,[0,1,2]);
});
test('写真一枚だけ別の園児フォルダに移動、顔グループの識別は変更しない',()=>{
 const options={photoCount:4,folderKeys:new Set(['0:1','2:3'])};
 const corrected=transferPhotoFolderCorrection(new Map(),2,'0:1','2:3',options);
 const named=preview(corrected).named;
 assert.deepEqual(named[0].photoIndexes,[0,1]);
 assert.deepEqual(named[1].photoIndexes,[1,2,3]);
 assert.deepEqual(named[1].manuallyAdded,[2]);
 assert.deepEqual(folders[0].members,[0,1]);
});
test('元フォルダへ戻す、または未分類から園児へ追加できる',()=>{
 const options={photoCount:4,folderKeys:new Set(['0:1','2:3'])};
 let edits=setPhotoFolderCorrection(new Map(),0,'0:1',false,options);
 assert.deepEqual(preview(edits).named[0].photoIndexes,[1,2]);
 edits=setPhotoFolderCorrection(edits,0,'0:1',true,options);
 assert.deepEqual(preview(edits).named[0].photoIndexes,[0,1,2]);
 edits=transferPhotoFolderCorrection(edits,3,'','0:1',options);
 assert.deepEqual(preview(edits).named[0].photoIndexes,[0,1,2,3]);
});
test('昔のフォルダキーには自動振り分けせず安全に破棄する',()=>{
 const options={photoCount:4,folderKeys:new Set(['0:1','2:3'])};
 const edits=setPhotoFolderCorrection(new Map(),2,'0:1',false,options);
 const clean=trimPhotoFolderCorrections(edits,new Set(['2:3']),4);
 assert.deepEqual(photoFolderCorrectionsAsRows(clean),[]);
});
test('補正の保存形式は元写真番号と名前のないフォルダキーだけ',()=>{
 const options={photoCount:4,folderKeys:new Set(['0:1','2:3'])};
 const edits=transferPhotoFolderCorrection(new Map(),1,'0:1','2:3',options);
 assert.deepEqual(photoFolderCorrectionsAsRows(edits),[[1,[['0:1',false],['2:3',true]]]]);
 assert.throws(()=>setPhotoFolderCorrection(edits,4,'0:1',false,options),/写真番号/);
 assert.throws(()=>transferPhotoFolderCorrection(edits,1,'0:1','0:1',options),/別の/);
});
