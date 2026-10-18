'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./demo-image');
test('synthetic image has a valid fixed SVG payload',()=>{
 assert.ok(fixture.SVG.startsWith('<svg'));
 assert.equal(fixture.validPayload(fixture.BYTES),true);
 assert.equal(fixture.BYTES.byteLength<8192,true);
});
test('ordinary photos and changed SVGs are rejected',()=>{
 assert.equal(fixture.validPayload(Buffer.from('real user photo')),false);
 assert.equal(fixture.validPayload(Buffer.from(fixture.SVG.replace('DEMO IMAGE ONLY','ANOTHER IMAGE'))),false);
 assert.equal(fixture.validPayload(Buffer.from('')),false);
});
