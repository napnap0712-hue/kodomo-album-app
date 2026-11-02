'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const a=require('./friend-roster-view-adapter.js');
const record={id:'kid-001',name:'架空 はな',kana:'かくう はな',facePhoto:'data:image/jpeg;base64,TEST',externalNote:'do not drop'};
test('legacy class IDs and year key preserve existing suffix rules',()=>{
 assert.equal(a.legacyRosterKey({classId:'tanpopo',schoolYear:2026,baseYear:2026}),'omoide-class-children-v1-tanpopo');
 assert.equal(a.legacyRosterKey({classId:'sakura',schoolYear:2027,baseYear:2026}),'omoide-class-children-v1-sakura-year-2027');
 for(const x of [{classId:'bad',schoolYear:2026,baseYear:2026},{classId:'tulip',schoolYear:'2026',baseYear:2026},{classId:'tulip',schoolYear:2026},{classId:'tulip',schoolYear:2025,baseYear:2026}])assert.throws(()=>a.legacyRosterKey(x));
});
test('read-only view maps legacy data without mutation or losing names',()=>{
 const before=JSON.stringify(record),v=a.normalizeLegacyRoster([record]);
 assert.deepEqual(v[0],{id:'kid-001',name:'架空 はな',game:'架空 はな',photo:record.facePhoto});
 assert.equal(JSON.stringify(record),before);assert(Object.isFrozen(v));assert(Object.isFrozen(v[0]));
});
test('game name is optional and never overwrites formal name',()=>{
 const v=a.normalizeLegacyRoster([{...record,displayName:'はなデモ'}]);
 assert.equal(v[0].game,'はなデモ');assert.equal(v[0].name,record.name);
});
test('duplicate IDs are rejected even if names differ',()=>{
 assert.throws(()=>a.normalizeLegacyRoster([record,{...record,name:'別の子'}]));
});
test('damaged JSON and invalid records fail closed rather than returning empty',()=>{
 for(const x of ['{','null','{}','[null]','[{"name":"x"}]'])assert.throws(()=>a.parseLegacyRoster(x));
 assert.deepEqual(a.parseLegacyRoster('[]'),[]);
});
test('no browser storage, network or DOM is used by the module',()=>{
 const sandbox={module:{exports:{}},require:path=>{assert.equal(path,'./class-data-boundary.js');return require('./class-data-boundary.js')}};
 for(const key of ['localStorage','sessionStorage','indexedDB','fetch','document'])Object.defineProperty(sandbox,key,{get(){throw Error('Forbidden access: '+key)}});
 vm.runInNewContext(fs.readFileSync(require.resolve('./friend-roster-view-adapter.js'),'utf8'),sandbox);
 const adapter=sandbox.module.exports;assert.equal(adapter.normalizeLegacyRoster([{id:'abc',name:'テスト'}])[0].name,'テスト');const {boundary,session,scope}=setup();const model=adapter.createDemoModel(boundary,session,scope,[{id:'abc',name:'テスト',extra:{keep:true}}]);assert.equal(adapter.legacyFor(model)[0].extra.keep,true);assert.equal(adapter.viewFor(adapter.withDisplayName(model,'abc','別表示'))[0].name,'テスト');boundary.invalidate();assert.throws(()=>adapter.viewFor(model));
});
const {createBoundary}=require('./class-data-boundary.js');
const fixture=require('./fictional-roster-fixture.js');
function setup(extra={}){const boundary=createBoundary(),scope={classId:'tanpopo',schoolYear:2026,baseYear:2026,...extra},session=boundary.createSession({...scope,mode:'demo'});return {boundary,scope,session}}
test('complete legacy snapshot round-trips IDs, formal names, photos and nested unknown fields',()=>{
 const {boundary,session,scope}=setup(),records=fixture.make(scope),before=JSON.stringify(records);
 const model=a.createDemoModel(boundary,session,scope,records);
 assert.deepEqual(a.legacyFor(model),records);assert.equal(JSON.stringify(records),before);
 assert.deepEqual(a.viewFor(model).map(x=>x.id),records.map(x=>x.id));
 assert.deepEqual(a.viewFor(model).map(x=>x.photo),records.map(x=>x.facePhoto));
 records[0].extra.flags.push('modified outside');assert.deepEqual(a.legacyFor(model)[0].extra.flags,[true,7,null]);
 assert(Object.isFrozen(a.legacyFor(model)[0].extra.flags));
});
test('display-name edits live separately and never overwrite any legacy field',()=>{
 const {boundary,session,scope}=setup(),records=fixture.make(scope),model=a.createDemoModel(boundary,session,scope,records);
 const edited=a.withDisplayName(model,records[0].id,'表示専用デモ');
 assert.equal(a.viewFor(edited)[0].game,'表示専用デモ');assert.equal(a.viewFor(edited)[0].name,records[0].name);assert.deepEqual(a.legacyFor(edited),records);
 assert.deepEqual(a.displayNamesFor(edited),{[records[0].id]:'表示専用デモ'});assert.deepEqual(a.displayNamesFor(model),{});
 assert.equal(a.viewFor(a.withDisplayName(edited,records[0].id,''))[0].game,'');
 assert.throws(()=>a.withDisplayName(model,'missing-id','x'));
});
test('all six classes and both base/non-base year suffixes use the stage 1 IDs',()=>{
 const api=require('./class-data-boundary.js');assert.equal(a.VALID_IDS,api.CLASS_IDS);
 for(const classId of api.CLASS_IDS)for(const schoolYear of [2026,2027]){
  const {boundary,session,scope}=setup({classId,schoolYear});const rows=fixture.make(scope);const model=a.createDemoModel(boundary,session,scope,rows);
  assert.equal(a.viewFor(model)[0].id,rows[0].id);assert.equal(a.legacyRosterKey(scope),'omoide-class-children-v1-'+classId+(schoolYear===2026?'':'-year-2027'));
 }
});
test('session, mode, class and year substitution are rejected',()=>{
 const {boundary,session,scope}=setup(),rows=fixture.make(scope);
 for(const changed of [{classId:'tulip'},{schoolYear:2027},{schoolYear:undefined},{baseYear:undefined},{baseYear:2027},{mode:'local-unlock'},{sessionId:'forged'},{capabilities:{read:true}}])assert.throws(()=>a.createDemoModel(boundary,session,{...scope,...changed},rows));
 assert.throws(()=>a.createDemoModel(boundary,{...session},scope,rows));
 assert.throws(()=>a.createDemoModel(boundary,{...session,mode:'local-unlock'},scope,rows));
 for(const r of [{...rows[0],classId:'tulip'},{...rows[0],year:2025},{...rows[0],schoolYear:2025}])assert.throws(()=>a.createDemoModel(boundary,session,scope,[r]));
});
test('logout and replacement session revoke conversion and edits for old models',()=>{
 const {boundary,session,scope}=setup(),rows=fixture.make(scope),model=a.createDemoModel(boundary,session,scope,rows);
 boundary.invalidate();for(const fn of [()=>a.viewFor(model),()=>a.legacyFor(model),()=>a.displayNamesFor(model),()=>a.withDisplayName(model,rows[0].id,'x')])assert.throws(fn);
 boundary.createSession({...scope,mode:'demo'});assert.throws(()=>a.viewFor(model));assert.throws(()=>a.viewFor({...model}));
});
test('invalid photo URLs, incorrect fields and non-JSON data fail without touching the source',()=>{
 for(const r of [{id:1,name:'x'},{id:' a ',name:'x'},{id:'x',name:' '},{id:'x',name:'x',displayName:1},...[false,42,'https://example.invalid/photo.jpg','javascript:alert(1)','data:image/png;base64,%%%'].map(facePhoto=>({id:'x',name:'x',facePhoto}))])assert.throws(()=>a.normalizeLegacyRoster([r]));
 for(const value of [undefined,NaN,Infinity,1n,()=>{},new Date(),Symbol('x')])assert.throws(()=>a.normalizeLegacyRoster([{id:'x',name:'x',extra:value}]));
 const cycle={};cycle.self=cycle;assert.throws(()=>a.normalizeLegacyRoster([{id:'x',name:'x',extra:cycle}]));assert.throws(()=>a.normalizeLegacyRoster(Array(2)));
 let read=false;const bad={id:'x',name:'x'};Object.defineProperty(bad,'extra',{enumerable:true,get(){read=true;return 1}});assert.throws(()=>a.normalizeLegacyRoster([bad]));assert.equal(read,false);
});
test('unknown JSON keys survive safely, including __proto__, without prototype pollution',()=>{
 const {boundary,session,scope}=setup(),rows=JSON.parse('[{"id":"x","name":"架空","__proto__":{"polluted":true},"constructor":{"keep":1},"unknown":[{"a":null}]}]');
 const model=a.createDemoModel(boundary,session,scope,rows);assert.equal(JSON.stringify(a.legacyFor(model)),JSON.stringify(rows));assert.equal({}.polluted,undefined);
});
test('empty roster and blank display-name fallback remain valid',()=>{
 const {boundary,session,scope}=setup();assert.deepEqual(a.viewFor(a.createDemoModel(boundary,session,scope,[])),[]);
 assert.deepEqual(a.parseLegacyRoster('[]'),[]);assert.equal(a.normalizeLegacyRoster([{id:'x',name:'架空',displayName:'   ',facePhoto:null}])[0].game,'架空');
});
