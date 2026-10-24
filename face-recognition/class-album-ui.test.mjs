// CE UI-only regressions. Run with: node --test face-recognition/class-album-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html', import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';

test('CE script parses and supplies responsive pastel album cards',()=>{
 assert.doesNotThrow(()=>new Function(js));
 assert.match(html,/ALBUM EDITOR · 2026-10-24 CE/);
 assert.match(css,/\.screen\[data-screen="classProjects"\] #projectGrid\{display:grid;grid-template-columns:repeat\(3,/);
 assert.match(css,/@media\(min-width:750px\)\{\.screen\[data-screen="classProjects"\] #projectGrid\{grid-template-columns:repeat\(6,/);
 assert.match(css,/\.screen\[data-screen="classProjects"\] \.cdPageChecklist\{display:none!important\}/);
 assert.match(css,/position:relative!important;top:auto!important;z-index:auto!important/);
 assert.match(html,/class="cdStatusLegend"/);
});
test('CE status control is a separate button, not a nested child of page edit buttons',()=>{
 const code=js.slice(js.indexOf('function ceSyncPageCards('),js.indexOf('let cdProgressRenderToken=',js.indexOf('function ceSyncPageCards(')));
 assert.match(code,/wrap\.append\(check\)/);
 assert.match(code,/check\.onclick=event=>/);
 assert.match(code,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
 assert.match(code,/void cdTogglePageReady\(source,state,check\)/);
 assert.match(code,/check\.disabled=cdCompletionBusy\|\|\(!source\.id&&source\.type!=='special'\)/);
 assert.match(js,/ceSyncPageCards\(sources,manifest\)/);
});
test('CE maintains original completion, storage and photo sorting workflows',()=>{
 assert.match(js,/function cdPageState\(/);
 assert.match(js,/async function cdTogglePageReady\(/);
 assert.match(js,/async function cdCommitCleanup\(/);
 assert.match(js,/async function cdVerifyOriginalBackup\(/);
 assert.match(js,/async function saveNewSplitAlbum\(/);
 assert.match(js,/async function renderSplitProjectCards\(/);
 assert.match(html,/PHOTO SORT · 2026-10-23 BQ/);
 assert.match(css,/#coverPaper,#growthPaper,#messagePaper,#bcPaper\{font-family:/);
});
