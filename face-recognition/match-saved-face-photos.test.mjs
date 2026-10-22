import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {matchSelectedPhotosToSaved} from './match-saved-face-photos.mjs';
const file=(name,text)=>({name,size:new TextEncoder().encode(text).length,
 arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
const stored=()=>[
 {name:'one.jpg',size:3,blob:file('one.jpg','aaa')},
 {name:'two.jpg',size:3,blob:file('two.jpg','bbb')},
 {name:'three.jpg',size:3,blob:file('three.jpg','ccc')}
];
const run=(chosen,saved=stored())=>matchSelectedPhotosToSaved(chosen,saved,{subtle:webcrypto.subtle});
test('元の選択順と違っても同一の元写真だけを安全に対応付ける',async()=>{
 assert.deepEqual(await run([file('three.jpg','ccc'),file('one.jpg','aaa'),file('two.jpg','bbb')]),[2,0,1]);
});
test('名前とサイズが同じでも実際の写真のバイトが違えば拒否',async()=>{
 await assert.rejects(run([file('one.jpg','aab'),file('two.jpg','bbb'),file('three.jpg','ccc')]),/内容/);
});
test('枚数・名前が違う写真は照合を始めずに拒否',async()=>{
 await assert.rejects(run([file('one.jpg','aaa')]),/枚数/);
 await assert.rejects(run([file('x.jpg','aaa'),file('two.jpg','bbb'),file('three.jpg','ccc')]),/ファイル名/);
});
test('名前も内容も全く同一の重複元写真は勝手に振り分けない',async()=>{
 const a=file('duplicate.jpg','aa');
 await assert.rejects(run([a,a],[{name:a.name,size:a.size,blob:a},{name:a.name,size:a.size,blob:a}]),/複数/);
});
test('ハッシュ照合が実行できないブラウザでは振り分けを変えない',async()=>{
 await assert.rejects(matchSelectedPhotosToSaved([file('one.jpg','aaa')],[{name:'one.jpg',size:3,blob:file('one.jpg','aaa')}],{subtle:null}),/安全/);
});
