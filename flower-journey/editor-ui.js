/* FLOWER JOURNEY V4/V5 chrome. No album state or storage APIs are used here. */
(()=>{
'use strict';
const editor=document.getElementById('fjEditor');
if(!editor)return;
// Set state after the legacy [data-editor-tab] listeners have been registered.
if(!editor.dataset.editorTab)editor.dataset.editorTab='none';
const header=editor.querySelector('#fjWideHeader');
const image=header.querySelector('.fjCannaHeaderImage');
const actions=header.querySelector('#fjEditorActions');
const panels={
 photos:editor.querySelector('.photoManager'),
 background:editor.querySelector('.pageSettings'),
 layout:editor.querySelector('.pageSettings'),
 text:editor.querySelector('.textTabUnifiedCard'),
 stamps:editor.querySelector('#seasonStickerPanel')
};
for(const [key,panel] of Object.entries(panels)){
 if(panel&&!panel.id)panel.id='fj-'+key+'-panel';
}
function syncExpanded(){
 const tab=editor.dataset.editorTab||'none';
 editor.querySelectorAll('.mobileEditorTabs [data-editor-tab]').forEach(button=>{
  const key=button.dataset.editorTab,on=key===tab;
  button.setAttribute('aria-expanded',String(on));
  if(panels[key])button.setAttribute('aria-controls',panels[key].id);
 });
}
function measureHeader(){
 if(!editor.classList.contains('active'))return;
 const height=image.getBoundingClientRect().height;
 const controls=actions.getBoundingClientRect().height;
 if(!height)return;
 header.style.setProperty('--fj-art-height',height+'px');
 header.style.setProperty('--fj-controls-height',controls+'px');
}
new MutationObserver(()=>{syncExpanded();measureHeader()}).observe(editor,{attributes:true,attributeFilter:['data-editor-tab','class']});
if(typeof ResizeObserver==='function'){
 const observer=new ResizeObserver(measureHeader);observer.observe(image);observer.observe(actions);
}
image.addEventListener('load',measureHeader);
window.addEventListener('resize',measureHeader,{passive:true});
syncExpanded();measureHeader();
})();
