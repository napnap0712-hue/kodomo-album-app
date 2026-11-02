'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');
const {CLASS_IDS,MODES,validYear,classIdForIndex,createBoundary}=require('./class-data-boundary.js');
const fixture=(extra={})=>({classId:'tanpopo',schoolYear:2026,mode:'demo',...extra});
test('the six legacy IDs are immutable and indices are strictly validated',()=>{
 assert.deepEqual(CLASS_IDS,['tanpopo','tulip','cosmos','canna','deigo','sakura']);
 assert(Object.isFrozen(CLASS_IDS));CLASS_IDS.forEach((id,i)=>assert.equal(classIdForIndex(i),id));
 for(const x of [-1,6,1.2,'0',null,undefined,NaN])assert.equal(classIdForIndex(x),null);
});
test('year must be explicit: reject missing, malformed and out-of-range years',()=>{
 for(const year of [undefined,null,'2026',NaN,Infinity,2026.5,0,1899,10000]){
  assert.equal(validYear(year),false);assert.throws(()=>createBoundary().createSession(fixture({schoolYear:year})));
 }
 for(const year of [1900,2025,2026,9999])assert.equal(validYear(year),true);
});
test('every class/year has a separate session and demo never authorizes real data',()=>{
 const b=createBoundary();let previous;
 for(const classId of CLASS_IDS)for(const schoolYear of [2025,2026]){
  const s=b.createSession(fixture({classId,schoolYear}));assert(Object.isFrozen(s));assert(b.isActive(s));assert(!b.isActive(previous));
  for(const operation of ['demo:navigate','demo:render','demo:register'])assert(b.authorize(s,{...s,operation}).allowed);
  for(const operation of ['roster:read','roster:write','photo:read','photo:write','album:read','album:write','backup:restore','storage:read','local-unlock','read','write',undefined])assert.equal(b.authorize(s,{...s,operation}).allowed,false);
  assert.equal(b.authorize({...s},{...s,operation:'demo:navigate'}).allowed,false);previous=s;
 }
});
test('scope substitution, future local-unlock, and invalid replacements fail closed',()=>{
 const b=createBoundary();const s=b.createSession(fixture());
 for(const override of [{classId:'tulip'},{schoolYear:2025},{mode:'local-unlock'}])assert.equal(b.authorize(s,{...s,...override,operation:'demo:navigate'}).allowed,false);
 for(const extra of [{capabilities:{read:true}},{resource:'real-roster'},{sessionId:'old'}])assert.equal(b.authorize(s,{...s,...extra,operation:'demo:register'}).allowed,false);
 assert.equal(MODES.LOCAL_UNLOCK,'local-unlock');assert.throws(()=>b.createSession(fixture({mode:MODES.LOCAL_UNLOCK})));assert(!b.isActive(s));
 for(const classId of ['__proto__','unknown','たんぽぽ',undefined])assert.throws(()=>b.createSession(fixture({classId})));
});
test('messages require current source, opaque origin, session, scope and document channel',()=>{
 const b=createBoundary(),source={},other={},s=b.createSession(fixture()),channel='fictional-map-document';
 const data={type:'fj-demo-start',...b.context(s,channel)};
 const event={source,origin:'null',data};assert(b.accepts(s,event,source,channel));
 for(const change of [{source:other},{origin:'https://example.invalid'},{data:null},{data:{...data,sessionId:'old'}},{data:{...data,classId:'tulip'}},{data:{...data,schoolYear:2025}},{data:{...data,mode:'local-unlock'}},{data:{...data,channelId:'old-document'}},{data:{...data,boundaryVersion:2}}])assert.equal(b.accepts(s,{...event,...change},source,channel),false);
 assert.equal(b.accepts(s,event,source,undefined),false);
 b.invalidate(s);assert.equal(b.accepts(s,event,source,channel),false);assert.equal(b.authorize(s,{...s,operation:'demo:navigate'}).allowed,false);assert.throws(()=>b.context(s,channel));
 const next=b.createSession(fixture());b.invalidate(s);assert(b.isActive(next));assert.notEqual(next.sessionId,s.sessionId);assert.equal(b.accepts(next,event,source,channel),false);b.invalidate();assert(!b.isActive(next));
});
test('no storage or network is read, even when blocked globals are present',()=>{
 const sandbox={module:{exports:{}},crypto:globalThis.crypto};
 for(const key of ['localStorage','sessionStorage','indexedDB','fetch'])Object.defineProperty(sandbox,key,{get(){throw Error('Forbidden '+key)}});
 vm.runInNewContext(fs.readFileSync(require.resolve('./class-data-boundary.js'),'utf8'),sandbox);
 const api=sandbox.module.exports,b=api.createBoundary(),s=b.createSession(fixture());
 assert.equal(b.authorize(s,{...s,operation:'roster:read'}).allowed,false);b.invalidate();
});
