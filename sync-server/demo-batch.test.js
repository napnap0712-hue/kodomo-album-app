'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const batch=require('./demo-batch');
test('five fixed, distinct and valid image fixtures',()=>{
 assert.equal(batch.fixtures.length,5);
 assert.equal(new Set(batch.fixtures.map(f=>f.digest)).size,5);
 for(const f of batch.fixtures)assert.equal(batch.sameBytes(f.id,f.bytes),true);
});
test('reject mismatched or unknown images',()=>{
 const f=batch.fixtures[0];
 assert.equal(batch.sameBytes(batch.fixtures[1].id,f.bytes),false);
 assert.equal(batch.sameBytes('unknown',f.bytes),false);
 assert.equal(batch.sameBytes(f.id,Buffer.from('personal photo')),false);
});
test('local storage deduplicates and resumes interrupted transfers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omoide-demo-batch-'));
 try{
  const store=batch.createStore(dir);
  assert.equal(store.list().filter(x=>x.received).length,0);
  assert.deepEqual(store.put(batch.fixtures[0].id,batch.fixtures[0].bytes),{accepted:true,duplicate:false});
  assert.deepEqual(store.put(batch.fixtures[0].id,batch.fixtures[0].bytes),{accepted:true,duplicate:true});
  assert.equal(store.put(batch.fixtures[1].id,batch.fixtures[0].bytes).accepted,false);
  for(const f of batch.fixtures.slice(1))store.put(f.id,f.bytes);
  assert.equal(store.list().filter(x=>x.received).length,5);
  assert.equal(batch.createStore(dir).list().filter(x=>x.received).length,5);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
