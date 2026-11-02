'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const boundaryAPI=require('./class-data-boundary.js'),viewAPI=require('./friend-roster-view-adapter.js'),fixture=require('./fictional-roster-fixture.js');
const a=require('./fictional-roster-readonly-adapter.js');
function setup(extra={}){
 const boundary=boundaryAPI.createBoundary(),scope={classId:'tanpopo',schoolYear:2026,baseYear:2026,...extra},session=boundary.createSession({...scope,mode:'demo'});
 const records=fixture.make(scope),envelope={format:a.FORMAT,source:a.SOURCE,...scope,storageKey:viewAPI.legacyRosterKey(scope),rosterJSON:JSON.stringify(records)};
 return {boundary,session,scope,records,envelope};
}
function open(f,envelope=f.envelope){return a.createFictionalReader(f.boundary,f.session,f.scope,JSON.stringify(envelope))}
test('six legacy classes and both year suffix cases are read with explicit matching scope',()=>{
 for(const classId of boundaryAPI.CLASS_IDS)for(const schoolYear of [2026,2027]){
  const f=setup({classId,schoolYear}),r=open(f);
  assert.equal(r.describe().storageKey,'omoide-class-children-v1-'+classId+(schoolYear===2026?'':'-year-2027'));
  assert.deepEqual(r.readLegacy(),f.records);assert.equal(r.readView()[0].id,f.records[0].id);assert.equal(r.describe().readOnly,true);
 }
});
test('IDs, exact formal names, face photos and all unknown nested JSON fields survive intact',()=>{
 const f=setup();f.records[0].name='  架空 正式名  ';f.records[0].unknown={list:[null,true,3,{deep:'retained'}]};f.envelope.rosterJSON=JSON.stringify(f.records);
 const before=JSON.stringify(f.envelope),r=open(f);assert.deepEqual(r.readLegacy(),f.records);assert.equal(JSON.stringify(f.envelope),before);
 assert.equal(r.readView()[0].name,'  架空 正式名  ');assert.equal(r.readView()[0].photo,f.records[0].facePhoto);
});
test('game display name is a separate view field and never overwrites legacy name',()=>{
 const f=setup(),r=open(f);assert.equal(r.readView()[0].game,'はなデモ');assert.equal(r.readView()[0].name,'架空 はな');assert.equal(r.readLegacy()[0].name,'架空 はな');
 assert.equal(r.readLegacy()[0].displayName,'はなデモ');
});
test('adapter, metadata and returned data cannot be mutated; caller changes do not affect reads',()=>{
 const f=setup(),r=open(f),first=r.readLegacy();assert(Object.isFrozen(r));assert(Object.isFrozen(r.describe()));assert(Object.isFrozen(first[0].extra.flags));
 assert.throws(()=>first[0].extra.flags.push('change'));assert.throws(()=>r.readView()[0].name='change');
 f.records.length=0;f.scope.classId='sakura';f.envelope.rosterJSON='[]';assert.equal(r.readLegacy().length,3);assert.equal(r.describe().classId,'tanpopo');assert.notEqual(r.readLegacy(),first);
});
test('wrong package class, year, base year or legacy key is rejected',()=>{
 const f=setup();
 for(const change of [{classId:'tulip'},{schoolYear:2027},{baseYear:2025},{storageKey:'omoide-class-children-v1-tulip'},{storageKey:'omoide-class-children-v1-tanpopo-year-2026'}])assert.throws(()=>open(f,{...f.envelope,...change}));
 const next=setup({schoolYear:2027});assert.throws(()=>open(next,{...next.envelope,storageKey:'omoide-class-children-v1-tanpopo'}));
});
test('missing, invalid and inferred years are never accepted',()=>{
 const f=setup();
 for(const change of [{schoolYear:undefined},{schoolYear:'2026'},{schoolYear:null},{schoolYear:2026.5},{schoolYear:10000},{baseYear:undefined},{baseYear:2027}])assert.throws(()=>a.createFictionalReader(f.boundary,f.session,{...f.scope,...change},JSON.stringify(f.envelope)));
 const missing={...f.envelope};delete missing.baseYear;assert.throws(()=>open(f,missing));
});
test('malformed package JSON and malformed roster JSON are not treated as zero children',()=>{
 const f=setup();for(const text of ['{','null','[]','{}','false','"string"'])assert.throws(()=>a.createFictionalReader(f.boundary,f.session,f.scope,text));
 for(const rosterJSON of ['{','null','{}','[null]','[{"id":"x"}]'])assert.throws(()=>open(f,{...f.envelope,rosterJSON}));
 for(const source of [null,[],{},()=>JSON.stringify(f.envelope)])assert.throws(()=>a.createFictionalReader(f.boundary,f.session,f.scope,source));
});
test('duplicate child IDs, invalid photos and contradictory per-record scope are rejected',()=>{
 const f=setup();for(const records of [[f.records[0],{...f.records[0],name:'架空 別名'}],[{...f.records[0],classId:'tulip'}],[{...f.records[0],schoolYear:2027}],[{...f.records[0],year:2025}],[{...f.records[0],facePhoto:'https://example.invalid/photo.jpg'}]])assert.throws(()=>open(f,{...f.envelope,rosterJSON:JSON.stringify(records)}));
});
test('an explicitly empty fictional roster is valid, rather than a parse-error fallback',()=>{
 const f=setup(),r=open(f,{...f.envelope,rosterJSON:'[]'});assert.deepEqual(r.readLegacy(),[]);assert.deepEqual(r.readView(),[]);
});
test('session scope substitution, forged session, missing session and local-unlock are denied',()=>{
 const f=setup();for(const session of [undefined,{...f.session},{...f.session,mode:'local-unlock'}])assert.throws(()=>a.createFictionalReader(f.boundary,session,f.scope,JSON.stringify(f.envelope)));
 for(const scope of [{...f.scope,classId:'tulip'},{...f.scope,schoolYear:2027}])assert.throws(()=>a.createFictionalReader(f.boundary,f.session,scope,JSON.stringify(f.envelope)));
 assert.throws(()=>f.boundary.createSession({...f.scope,mode:'local-unlock'}));
});
test('logout and replacement sessions invalidate all read operations including metadata',()=>{
 for(const replace of [false,true]){
  const f=setup(),r=open(f);if(replace)f.boundary.createSession({...f.scope,mode:'demo'});else f.boundary.invalidate();
  for(const method of ['readLegacy','readView','describe'])assert.throws(()=>r[method]());assert.throws(()=>open(f));
 }
});
test('demo real-data requests and unsupported provider/command requests are rejected',()=>{
 const f=setup(),r=open(f);
 for(const source of ['real','localStorage','indexedDB','legacy','local-unlock']){
  assert.throws(()=>open(f,{...f.envelope,source}));for(const method of ['readLegacy','readView','describe'])assert.throws(()=>r[method]({source}));
 }
 for(const request of [{operation:'save'},{operation:'delete'},{operation:'restore'},{provider:'localStorage'},{source:a.SOURCE,write:true},Object.create({source:'localStorage'}),null,'real'])assert.throws(()=>r.readLegacy(request));
 for(const key of ['getItem','setItem','removeItem','readwrite','save','put','delete','remove','restore','write','withDisplayName'])assert.equal(r[key],undefined);
 assert.deepEqual(Object.keys(r).sort(),['describe','readLegacy','readView']);assert.deepEqual(Object.keys(a).sort(),['FORMAT','SOURCE','createFictionalReader']);assert.deepEqual(r.readLegacy({source:a.SOURCE}),f.records);
});
test('provider callbacks and getters cannot be installed or invoked',()=>{
 const f=setup(),r=open(f);let calls=0;
 assert.throws(()=>open(f,{...f.envelope,provider:'not-supported'}));
 const request={};Object.defineProperty(request,'source',{enumerable:true,get(){calls++;return 'localStorage'}});assert.throws(()=>r.readLegacy(request));
 const scope={...f.scope};Object.defineProperty(scope,'schoolYear',{enumerable:true,get(){calls++;return 2026}});assert.throws(()=>a.createFictionalReader(f.boundary,f.session,scope,JSON.stringify(f.envelope)));
 assert.equal(calls,0);
});
test('unknown JSON prototype-like keys survive without prototype pollution',()=>{
 const f=setup(),records=JSON.parse('[{"id":"fictional-proto","name":"架空","__proto__":{"polluted":true},"constructor":{"keep":1}}]');
 const r=open(f,{...f.envelope,rosterJSON:JSON.stringify(records)});assert.equal(JSON.stringify(r.readLegacy()),JSON.stringify(records));assert.equal({}.polluted,undefined);
});
test('import, valid/invalid reads and revoked reads make zero storage, DOM or network accesses',()=>{
 const fixtureState=setup(),calls=[];
 const sandbox={module:{exports:{}},require:path=>{if(path==='./class-data-boundary.js')return boundaryAPI;if(path==='./friend-roster-view-adapter.js')return viewAPI;throw Error('Unexpected dependency '+path)}};
 for(const key of ['localStorage','sessionStorage','indexedDB','fetch','document','XMLHttpRequest','FileReader','navigator'])Object.defineProperty(sandbox,key,{get(){calls.push(key);throw Error('Forbidden '+key)}});
 vm.runInNewContext(fs.readFileSync(require.resolve('./fictional-roster-readonly-adapter.js'),'utf8'),sandbox);
 const api=sandbox.module.exports,r=api.createFictionalReader(fixtureState.boundary,fixtureState.session,fixtureState.scope,JSON.stringify(fixtureState.envelope));
 assert.deepEqual(r.readLegacy(),fixtureState.records);assert.equal(r.readView().length,3);r.describe();assert.throws(()=>r.readLegacy({source:'localStorage'}));assert.throws(()=>api.createFictionalReader(fixtureState.boundary,fixtureState.session,fixtureState.scope,'{'));fixtureState.boundary.invalidate();assert.throws(()=>r.readLegacy());assert.deepEqual(calls,[]);
});
