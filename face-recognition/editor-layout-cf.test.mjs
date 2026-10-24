// CF responsive editor regression checks. Run with:
// node --test face-recognition/editor-layout-cf.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

test('CF: editor code parses and there is only one editable canvas and save action',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/ALBUM EDITOR · 2026-10-24 CF/);
 assert.equal((html.match(/id="designCanvas"/g)||[]).length,1);
 assert.equal((html.match(/id="saveDraft"/g)||[]).length,1);
 assert.equal((html.match(/id="editorRestoreMenuButton"/g)||[]).length,1);
 assert.match(js,/async function saveNewSplitAlbum\(/);
 assert.match(js,/function switchEditorTab\(tab\)/);
});
test('CF: desktop workstation places navigation left, canvas center and inspector right',()=>{
 assert.match(css,/grid-template-columns:150px minmax\(0,1fr\) clamp\(260px,23vw,350px\)!important/);
 assert.match(css,/\.editorPanel>\.editorCanvasFirst\{\s*grid-column:2!important;grid-row:2!important/);
 assert.match(css,/\.editorPanel>\.mobileEditorTabs\{\s*grid-column:1!important;grid-row:2!important/);
 assert.match(css,/\.editorPanel>:is\(\.desktopEditorWelcome,\.pageSettings,\.photoManager,#seasonStickerPanel,\.editorLayerPanel,\.textTabUnifiedCard\)\{\s*grid-column:3!important;grid-row:2!important/);
});
test('CF: iPhone keeps five tabs below the spread and safe staff toolbar',()=>{
 const start=html.indexOf('class="mobileEditorTabs" role="tablist" aria-label="編集する項目"');
 assert.ok(start>=0);
 const part=html.slice(start,html.indexOf('</div>',start));
 const expected=['photos','background','layout','text','stamps'];
 const positions=expected.map(name=>part.indexOf('data-editor-tab="'+name+'"'));
 assert.ok(positions.every((n,i)=>n>=0&&(i===0||n>positions[i-1])));
 assert.match(css,/\.editorPanel>\.editorCanvasFirst\{\s*order:1!important/);
 assert.match(css,/\.editorPanel>\.mobileEditorTabs\{\s*order:2!important/);
 assert.match(css,/\.editorPanel:has\(\.mobileTextInspector\)\{padding-bottom:0!important\}/);
 assert.match(css,/\.editorPanel>\.field:first-child\{display:none!important\}/);
});
