/* No persistent storage and no file chooser: all photos are generated illustrations. */
(()=>{
'use strict';
const sessions=new Map();
window.flowerPhotoDemo=Object.freeze({async save(files){
 if(!files.length||files.some(f=>f.name!=='flower-demo.svg'||f.type!=='image/svg+xml'))throw Error('検証用画像だけを保存できます');
 const sessionId='demo-'+crypto.randomUUID();
 const record=await Promise.all(files.map(async file=>({name:file.name,text:await file.text()})));
 sessions.set(sessionId,record);
 if(sessions.get(sessionId)!==record||record.length!==files.length)throw Error('検証保存に失敗しました');
 return {sessionId,count:record.length,demo:true};
}});
document.addEventListener('click',e=>{
 if(e.target.id!=='picker')return;
 e.preventDefault();e.stopImmediatePropagation();
 const data=new DataTransfer();
 data.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2f3dc"/><text x="70" y="160" font-size="40">FLOWER DEMO</text></svg>'],'flower-demo.svg',{type:'image/svg+xml'}));
 e.target.files=data.files;e.target.dispatchEvent(new Event('change',{bubbles:true}));
},true);
})();
