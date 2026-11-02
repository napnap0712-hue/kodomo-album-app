/* Generated fictional data only. No storage reads, image requests or real records. */
(function(root){
'use strict';
function make({classId,schoolYear}){
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const prefix='fixture-'+classId+'-'+schoolYear+'-';
 return [
  {id:prefix+'001',name:'架空 はな',kana:'かくう はな',facePhoto:image,displayName:'はなデモ',extra:{note:'FICTIONAL ONLY',flags:[true,7,null]}},
  {id:prefix+'002',name:'架空 そら',kana:'かくう そら',facePhoto:null,extra:{note:'unknown field retained'}},
  {id:prefix+'003',name:'架空 ひかり',kana:'かくう ひかり',facePhoto:null,displayName:'ひかりデモ'}
 ];
}
const api=Object.freeze({make});
if(typeof module==='object'&&module.exports)module.exports=api;
else Object.defineProperty(root,'FlowerFictionalRoster',{value:api});
})(typeof window==='object'?window:globalThis);
