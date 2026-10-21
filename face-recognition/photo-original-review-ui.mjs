// Original-photo viewer and teacher-operated PHOTO-only corrections.
// No database, face recognition model, cloud access, or production-album mutations.
export function bindPhotoOriginalReviewUi({getData,applyChange}){
 const $=id=>document.getElementById(id);
 const dialog=$('photoReviewDialog');
 const image=$('photoReviewFullImage'),heading=$('photoReviewHeading');
 const caption=$('photoReviewPhotoDescription'),select=$('photoReviewMoveDestination');
 const unlink=$('photoReviewUnlink'),move=$('photoReviewMove'),message=$('photoReviewMessage');
 let photoIndex=-1,sourceKey='';
 function open(index,key=''){
  const data=getData();
  if(!Number.isInteger(index)||index<0||index>=data.photoNames.length)return false;
  const source=key?data.namedFolders.find(row=>row.key===key&&row.childId):null;
  if(key&&(!source||!source.photoIndexes.includes(index)))return false;
  if(!dialog||!image||!select)return false;
  photoIndex=index;sourceKey=key;
  image.src=data.photoUrls[index]||'';
  image.alt='写真'+(index+1)+'の元画像全体（顔の切り抜きなし）';
  heading.textContent='🖼 元写真 '+(index+1)+'を確認';
  caption.textContent=(data.photoNames[index]||'写真'+(index+1))+
   (source?' ／ '+source.childName+'さんのフォルダから確認中':' ／ 元写真を確認中');
  select.replaceChildren();
  const blank=document.createElement('option');
  blank.value='';blank.textContent=source?'移動先の園児を選んでね':'追加する園児を選んでね';
  select.append(blank);
  for(const row of data.namedFolders){
   if(!row.childId||row.key===sourceKey)continue;
   const option=document.createElement('option');
   option.value=row.key;option.textContent=row.childName+'さん';
   select.append(option);
  }
  if(unlink)unlink.hidden=!source;
  if(message)message.textContent='写真自体は削除しません。ほかの園児の写真リンクや顔認識結果も変更しません。';
  if(!dialog.open)dialog.showModal();
  return true;
 }
 const change=target=>{
  try{
   const result=applyChange({photoIndex,fromKey:sourceKey,toKey:target});
   dialog.close();
   if(message)message.textContent=typeof result==='string'?result:'';
  }catch(error){
   if(message)message.textContent='⚠️ '+String(error?.message||error);
  }
 };
 $('photoReviewClose')?.addEventListener('click',()=>dialog.close());
 move?.addEventListener('click',()=>{
  if(!select?.value){if(message)message.textContent='移動先の園児を選んでね。';return;}
  change(select.value);
 });
 unlink?.addEventListener('click',()=>{
  if(!sourceKey)return;
  if(!window.confirm('この園児のフォルダから写真だけを外しますか？ 元写真とほかの園児への紐づけは残ります。'))return;
  change('');
 });
 return {open};
}
