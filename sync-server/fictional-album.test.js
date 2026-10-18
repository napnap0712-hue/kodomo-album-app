'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createStore,choices}=require('./fictional-album');
test('fictional album synchronizes revisions and detects stale edits',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'omoide-fake-album-'));
 try{
  const mac=createStore(directory),phone=createStore(directory);
  assert.equal(mac.read().revision,0);
  const initial=phone.read();
  const changes={baseRevision:initial.revision,title:choices.title[1],message:choices.message[2],color:choices.color[1]};
  const first=phone.save(changes);
  assert.equal(first.status,200);
  assert.equal(first.state.revision,1);
  assert.equal(mac.read().title,changes.title);
  const conflict=mac.save({...changes,baseRevision:0,color:choices.color[2]});
  assert.equal(conflict.status,409);
  assert.equal(mac.read().color,choices.color[1]);
  const next=mac.save({...changes,baseRevision:1,color:choices.color[2]});
  assert.equal(next.status,200);
  assert.equal(phone.read().color,choices.color[2]);
  assert.equal(createStore(directory).read().revision,2);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('reject arbitrary text, photos and invalid revision',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'omoide-fake-album-'));
 try{
  const store=createStore(directory);
  const input={baseRevision:0,title:choices.title[0],message:choices.message[0],color:choices.color[0]};
  assert.equal(store.save({...input,title:'real student name'}).status,400);
  assert.equal(store.save({...input,photo:'data:image/jpeg;base64,AAAA',message:'自由な文章'}).status,400);
  assert.equal(store.save({...input,baseRevision:-1}).status,400);
  assert.equal(store.save({...input,baseRevision:0}).unchanged,true);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
