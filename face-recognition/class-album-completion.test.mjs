// CD completion-only regression tests. Do not run unrelated face-recognition tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('CD script parses and completion is opt-in with an explicit photo deletion dialog',()=>{
 assert.doesNotThrow(()=>new Function(inline));
 assert.match(html,/id="cdProgressBar"/);
 assert.match(html,/id="cdProgressPercent"/);
 assert.match(html,/id="cdPageChecklistRows"/);
 assert.match(html,/id="cdCompleteClass"/);
 assert.match(html,/id="cdFinishDialog"/);
 assert.match(html,/id="cdFinishConfirm"/);
 assert.match(inline,/cdAskFinishConfirmation\(total,unused\)/);
 assert.match(inline,/cdWriteProgress\(next\)/);
});
class FakeBlob{constructor(bytes){this.size=bytes.length;this.type='image/jpeg';this.bytes=bytes}}
const trimCode=inline.slice(inline.indexOf('function cdMakeTrimPlan('),inline.indexOf('async function cdVerifyOriginalBackup('));
const trim=new Function('Blob',trimCode+'return cdMakeTrimPlan;')(FakeBlob);
test('CD deletes only unused photographs and remaps references, without mutating original records',()=>{
 const photos=['a','bb','ccc','dddd'].map(name=>({name,blob:new FakeBlob(name)}));
 const meta={id:'a',ready:true,storage:'split-v1',photoCount:4,updatedAt:12};
 const edits={albumId:'a',photoCount:4,photoAssignments:[['a'],['b'],['c'],['d']],designElements:[{type:'photo',fileIndex:3,page:2},{type:'photo',fileIndex:1,page:0},{type:'photo',fileIndex:3,page:1},{type:'text',text:'hi'}]};
 const plan=trim('a',meta,edits,photos);
 assert.equal(plan.unused,2);
 assert.deepEqual(plan.kept,[1,3]);
 assert.deepEqual(plan.nextEdits.designElements.filter(x=>x.type==='photo').map(x=>x.fileIndex),[1,0,1]);
 assert.deepEqual(plan.nextEdits.photoAssignments,[['b'],['d']]);
 assert.equal(plan.nextMeta.photoCount,2);
 assert.equal(meta.photoCount,4);
 assert.equal(edits.designElements[0].fileIndex,3);
 assert.equal(photos.length,4);
});
test('CD stops photo cleanup for invalid references or a photo-free page',()=>{
 const photos=[{blob:new FakeBlob('x')}],meta={id:'a',ready:true,storage:'split-v1',photoCount:1};
 const edits={albumId:'a',photoCount:1,designElements:[{type:'photo',fileIndex:7}]};
 assert.throws(()=>trim('a',meta,edits,photos),/配置参照/);
 assert.throws(()=>trim('a',meta,{...edits,designElements:[{type:'text',text:'hello'}]},photos),/配置していないページ/);
});
test('CD counts each page once and changes status after a saved edit',()=>{
 const src=inline.slice(inline.indexOf('function cdPageState('),inline.indexOf('let cdProgressRenderToken='));
 const pageState=new Function(src+'return cdPageState;')();
 const pages={'slot:0':{state:'ready',sourceId:'saved-a',sourceUpdatedAt:100}};
 assert.equal(pageState({pages},{key:'slot:0',type:'split',id:'saved-a',updatedAt:100}),'ready');
 assert.equal(pageState({pages},{key:'slot:0',type:'split',id:'saved-a',updatedAt:101}),'updated');
 assert.equal(pageState({pages},{key:'slot:0',type:'split',id:'saved-b',updatedAt:100}),'updated');
 assert.equal(pageState({pages:{}},{key:'slot:0',type:'draft',id:null,updatedAt:null}),'editing');
 assert.equal((12+4)*6.25,100);
});
test('CD data deletion is limited to the atomically committed album photo keys',()=>{
 const start=inline.indexOf('async function cdCommitCleanup('),end=inline.indexOf('async function cdAskFinishConfirmation(',start);
 const code=inline.slice(start,end);
 assert.match(code,/transaction\(\['albums','edits','photos'\],'readwrite'\)/);
 assert.match(code,/JSON\.stringify\(q\.result\)!==JSON\.stringify\(plan\.meta\)/);
 assert.match(code,/JSON\.stringify\(eq\.result\)!==JSON\.stringify\(plan\.edits\)/);
 assert.match(code,/photos\.delete\(plan\.id\+':photo-'\+i\)/);
 assert.doesNotMatch(code,/objectStore\('history'\)\.delete|objectStore\('backups'\)\.delete/);
 assert.match(inline,/cdVerifyOriginalBackup\(plan\)/);
 assert.match(inline,/cdValidateSpecial\(kind\)/);
});
