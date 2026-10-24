// CI special-page UI regression tests. Run:
// node --test face-recognition/special-editor-ci.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
const ids=['coverEditor','growthEditor','messageEditor','backCoverEditor'];
const papers=['coverPaper','growthPaper','messagePaper','bcPaper'];
const saveButtons=['coverSave','growthSave','messageSave','bcSave'];
const exportButtons=['coverExport','growthExport','messageExport','bcExport'];

test('CI special-page scripts parse, existing save/export/paper IDs remain unique',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/ALBUM EDITOR · 2026-10-24 CI/);
 for(const id of [...papers,...saveButtons,...exportButtons]){
  assert.equal(html.split('id="'+id+'"').length-1,1,'Unique '+id);
 }
 assert.match(js,/function initSpecialEditorTabs\(/);
 assert.match(js,/function refreshCoverPreview\(/);
 assert.match(js,/function growthValidate\(/);
 assert.match(js,/function messageValidate\(/);
 assert.match(js,/function bcRender\(/);
});
test('Every special-page editor has two category tabs and two matching input sections',()=>{
 ids.forEach((id,index)=>{
  const start=html.indexOf('<section class="screen" data-screen="'+id+'">');
  const end=index===3?html.indexOf('</main>',start):html.indexOf('<section class="screen" data-screen="'+ids[index+1]+'">',start);
  assert.ok(start>=0&&end>start);
  const part=html.slice(start,end);
  assert.equal((part.match(/class="specialSectionTabs"/g)||[]).length,1);
  assert.equal((part.match(/data-special-tab="/g)||[]).length,2);
  assert.equal((part.match(/data-special-section="/g)||[]).length,2);
  assert.match(part,new RegExp('id="'+papers[index]+'"'));
 });
});
test('Responsive stylesheet prioritizes A4 preview and isolates UI typography',()=>{
 assert.match(css,/Desktop: same preview-left \/ settings-right workstation/);
 assert.match(css,/iPhone \/ iPad: show the A4 page first/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(300px,365px\)/);
 assert.match(css,/\.coverEditorPanel>\.coverPaper\{order:0\}/);
 assert.match(css,/\.growthFields>#growthPaper\{order:0\}/);
 assert.match(css,/\.messageFields>#messagePaper\{order:0\}/);
 assert.match(css,/#bcPaper\{order:1\}/);
 assert.match(css,/:is\(#coverPaper,#growthPaper,#messagePaper,#bcPaper\)/);
 assert.match(css,/#coverPaper,#growthPaper,#messagePaper,#bcPaper\{font-family:/);
});
test('Mobile tab toggle keeps inactive section hidden and restores both sections on desktop',()=>{
 const start=js.indexOf('function initSpecialEditorTabs()'),end=js.indexOf('initSpecialEditorTabs();',start);
 assert.ok(start>=0&&end>start);
 const fnSource=js.slice(start,end);
 let narrow=true;
 const handlers={};
 const buttons=['a','b'].map(name=>({
  dataset:{specialTab:name},attributes:{},classList:{toggle(){}},
  setAttribute(key,val){this.attributes[key]=val},addEventListener(key,callback){handlers[name+':'+key]=callback}
 }));
 const panels=['a','b'].map(name=>({dataset:{specialSection:name},hidden:false}));
 const nav={querySelectorAll(){return buttons},parentElement:{querySelectorAll(){return panels}}};
 const screen={querySelector(){return nav}};
 const document={querySelector(){return screen}};
 const mq={get matches(){return narrow},addEventListener(key,callback){handlers.media=callback}};
 new Function('document','window',fnSource+'return initSpecialEditorTabs;')(document,{matchMedia(){return mq}})();
 assert.equal(panels[0].hidden,false);
 assert.equal(panels[1].hidden,true);
 handlers['b:click']();
 assert.equal(panels[0].hidden,true);
 assert.equal(panels[1].hidden,false);
 narrow=false;handlers.media();
 assert.equal(panels[0].hidden,false);
 assert.equal(panels[1].hidden,false);
});
