/* Executed only in the isolated demo copy; the map/tutorial source stays immutable. */
(()=>{
'use strict';
let active='',opening=false;
const stage=document.getElementById('stageFrame');
const supported=title=>title==='写真追加'?'photo-add':title.includes('おもいでキャッチ')?'memory-catch':title.includes('間違い探し')?'cosmos-mistake':null;
const originalTransition=window.showComparisonTransition;
window.showComparisonTransition=(title,button)=>{
 if(title==='おともだち登録'){if(!opening){opening=true;parent.postMessage({type:'fj-demo-start',stage:'friend-registration'},'*')}return}
 originalTransition(title,button);
};
function start(){const key=supported(active);if(!key||opening)return;opening=true;parent.postMessage({type:'fj-demo-start',stage:key},'*')}
document.addEventListener('click',e=>{const tap=e.target.closest?.('.tap');if(tap){active=tap.dataset.title||'';opening=false}},true);
// Opaque child frames cannot be inspected by the map. Install the small event
// bridge when the original tutorial assigns srcdoc, leaving its markup intact.
const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');
const guideBridge=`<script>document.addEventListener('click',function(e){const b=e.target.closest?.('button');if(b&&(b.id==='start'||b.id==='cta'&&b.textContent.includes('はじめよう'))){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:'fj-demo-guide-start'},'*')}},true);<\/script>`;
Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{
 ...descriptor,set(value){
  if(this===stage&&supported(active)){
   const end=value.lastIndexOf('</body>');
   value=end<0?value+guideBridge:value.slice(0,end)+guideBridge+value.slice(end);
  }
  descriptor.set.call(this,value);
 }
});
window.addEventListener('message',e=>{
 if(e.source===stage.contentWindow&&(e.data?.type==='flower-stage-start'||e.data?.type==='fj-demo-guide-start')&&supported(active)){e.stopImmediatePropagation();start();return}
 if(e.source!==parent)return;
 if(e.data?.type==='fj-demo-start-failed'){opening=false;return}
 if(e.data?.type!=='fj-demo-restore')return;
 // Invalidate original comparison timers before revealing the already-rendered map.
 window.onComparisonBack?.();
 document.getElementById('shade').hidden=true;
 const panel=document.getElementById('stagePanel');
 panel.classList.remove('stage-visible','stage-leaving');panel.hidden=true;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  opening=false;active='';parent.postMessage({type:'fj-demo-map-ready'},'*');
 }));
},true);
})();
