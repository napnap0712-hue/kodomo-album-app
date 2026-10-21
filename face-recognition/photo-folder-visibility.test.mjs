import test from 'node:test';
import assert from 'node:assert/strict';
import {composeVisibleChildFolders,validateNewPhotoFolderName,addManualPhotoChoice} from './photo-folder-visibility.mjs';

const base=[
 {kind:'confirmed',members:[0,2],photos:[0,4]},
 {kind:'individual',members:[1],photos:[4]},
 {kind:'individual',members:[3],photos:[5]}
];
test('a non-child face folder is hidden, but shared source photos in a child folder remain',()=>{
 const view=composeVisibleChildFolders(base,new Set(['1']),new Map());
 assert.equal(view.visible.length,2);
 assert.equal(view.excluded.length,1);
 assert.equal(view.excludedFaceCount,1);
 assert.deepEqual(view.visible[0].photos,[0,4]);
 assert.deepEqual(view.visible[1].photos,[5]);
 assert.equal(view.faceCount,3);
 assert.equal(base.length,3);
});
test('new folders have stable IDs and no invented face detection',()=>{
 const extras=new Map([['manual-1',{name:'写真だけ'}],['manual-2',{name:''}]]);
 const view=composeVisibleChildFolders(base,new Set(),extras);
 assert.equal(view.visible.length,5);
 assert.equal(view.newFolderCount,2);
 assert.equal(view.visible[3].key,'manual-1');
 assert.equal(view.visible[3].members.length,0);
 assert.equal(view.visible[3].customName,'写真だけ');
 assert.equal(view.visible[4].id,5);
});
test('removing exclusion restores face folder in original order',()=>{
 const excluded=new Set(['0:2']);
 assert.deepEqual(composeVisibleChildFolders(base,excluded,new Map()).visible.map(b=>b.key),['1','3']);
 excluded.delete('0:2');
 assert.deepEqual(composeVisibleChildFolders(base,excluded,new Map()).visible.map(b=>b.key),['0:2','1','3']);
});
test('an old excluded ID is detectable rather than applied to a new group',()=>{
 const view=composeVisibleChildFolders([{members:[0],photos:[0],kind:'individual'}],new Set(['0:2']),new Map());
 assert.deepEqual(view.staleExclusions,['0:2']);
 assert.equal(view.visible.length,1);
});
test('manual image can belong to existing and new folders without modifying the original choices',()=>{
 const original=new Map([[0,new Set(['0:2'])]]);
 const next=addManualPhotoChoice(original,0,'manual-1');
 assert.deepEqual([...next.get(0)].sort(),['0:2','manual-1']);
 assert.deepEqual([...original.get(0)],['0:2']);
 assert.equal(addManualPhotoChoice(original,-1,'manual-1'),null);
});
test('temporary name is limited to a safe short label',()=>{
 assert.equal(validateNewPhotoFolderName('  新規フォルダ　 '),'新規フォルダ');
 assert.equal(validateNewPhotoFolderName(''), '');
 assert.equal(validateNewPhotoFolderName('x'.repeat(41)),null);
 assert.equal(validateNewPhotoFolderName('bad\nname'),null);
});
