import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {stageAlbumPhotoAppend} from './album-photo-append.mjs';

const file=(name,body,modified=10)=>{
 const binary=new TextEncoder().encode(body);
 return {name,size:binary.length,lastModified:modified,
  arrayBuffer:async()=>binary.slice().buffer};
};
const stage=args=>stageAlbumPhotoAppend({...args,subtle:webcrypto.subtle});

test('保存済みアルバムに触れず、新しい写真のみ追加し既存の園児紐づけを維持',async()=>{
 const old=file('one.jpg','abcd'),added=file('two.jpg','efgh');
 const originalAssignments=[['kid-1','kid-2']];
 const result=await stage({existingFiles:[old],existingAssignments:originalAssignments,incomingFiles:[added]});
 assert.deepEqual(result.files,[old,added]);
 assert.deepEqual(result.assignments,[['kid-1','kid-2'],[]]);
 assert.deepEqual(originalAssignments,[['kid-1','kid-2']]);
 assert.equal(result.added,1);
});
test('まったく同一の写真は名前と内容を検証して重複追加しない',async()=>{
 const old=file('one.jpg','abcd');
 const result=await stage({existingFiles:[old],existingAssignments:[['a']],
  incomingFiles:[file('one.jpg','abcd'),file('second.jpg','EF')]});
 assert.equal(result.skipped,1);
 assert.equal(result.added,1);
 assert.deepEqual(result.assignments,[['a'],[]]);
});
test('同名・同サイズでも別の実写真なら勝手に重複扱いしない',async()=>{
 const old=file('same.jpg','abcd');
 const result=await stage({existingFiles:[old],existingAssignments:[['a']],
  incomingFiles:[file('same.jpg','abce')]});
 assert.equal(result.skipped,0);
 assert.equal(result.added,1);
 assert.deepEqual(result.assignments,[['a'],[]]);
});
test('空の新規アルバムでも新しい写真から開始できる',async()=>{
 const result=await stage({incomingFiles:[file('new.jpg','xy')]});
 assert.deepEqual(result.assignments,[[]]);assert.equal(result.files.length,1);
});
test('途中で枚数上限を超えても元の配列は一切書き換えない',async()=>{
 const previous=[file('one.jpg','aaa')],assigned=[['a']];
 await assert.rejects(stage({existingFiles:previous,existingAssignments:assigned,
  incomingFiles:[file('two.jpg','bbb'),file('three.jpg','ccc')],maxPhotos:2}),/上限|まで/);
 assert.equal(previous.length,1);assert.deepEqual(assigned,[['a']]);
});
test('ファイル不一致などの場合は写真を追加しない',async()=>{
 await assert.rejects(stage({existingFiles:[file('one.jpg','aaa')],existingAssignments:[],
  incomingFiles:[file('two.jpg','bbb')]}),/件数/);
});
