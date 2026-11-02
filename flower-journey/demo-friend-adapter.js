/* Demo bridge only; the approved registration HTML remains byte-for-byte intact. */
(()=>{
'use strict';
let pending=0,resuming=false;
// Native dialogs are denied in opaque frames. Ask the host for the same confirmation.
window.confirm=()=>resuming;
document.addEventListener('click',e=>{
 const button=e.target.closest?.('button');
 if(button?.id==='back'){
  e.preventDefault();e.stopImmediatePropagation();
  parent.postMessage({type:'flower-stage-back',stage:'friend-registration'},'*');return;
 }
 if(button?.id==='delete'&&!resuming){
  e.preventDefault();e.stopImmediatePropagation();
  if(pending)return;
  pending=Date.now();parent.postMessage({type:'fj-demo-friend-delete',request:pending},'*');return;
 }
 // The real photo picker is never opened on the temporary login route.
 if(e.target.id==='photo'){
  e.preventDefault();e.stopImmediatePropagation();
  const data=new DataTransfer(),shade=['#f4bdd0','#aed9cf'][Number(e.target.dataset.demoVersion||0)%2];
  e.target.dataset.demoVersion=String(Number(e.target.dataset.demoVersion||0)+1);
  data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="'+shade+'"/><text x="40" y="165" font-size="42">DEMO</text></svg>'],'friend-demo.svg',{type:'image/svg+xml'}));
  e.target.files=data.files;e.target.dispatchEvent(new Event('change',{bubbles:true}));
 }
},true);
window.addEventListener('message',e=>{
 if(e.source!==parent||e.data?.type!=='fj-demo-friend-delete-result'||!pending||e.data.request!==pending)return;
 pending=0;if(!e.data.approved)return;
 resuming=true;try{document.getElementById('delete').click()}finally{resuming=false}
});
})();
