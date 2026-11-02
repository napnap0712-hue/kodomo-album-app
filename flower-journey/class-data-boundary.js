/* Stage 1: in-memory demo scopes only. This module never opens any data store.
 * These checks prevent accidental cross-scope use; they are not server authentication.
 */
(function(root){
'use strict';
const CLASS_IDS=Object.freeze(['tanpopo','tulip','cosmos','canna','deigo','sakura']);
const MODES=Object.freeze({DEMO:'demo',LOCAL_UNLOCK:'local-unlock'});
const DEMO_OPERATIONS=Object.freeze(['demo:navigate','demo:render','demo:register']);
function validYear(year){return Number.isInteger(year)&&year>=1900&&year<=9999}
function classIdForIndex(index){return Number.isInteger(index)&&index>=0&&index<CLASS_IDS.length?CLASS_IDS[index]:null}
function createBoundary(){
 let active=null;
 function isActive(session){return !!session&&session===active}
 function invalidate(session){if(session===undefined||session===active)active=null}
 function createSession({classId,schoolYear,mode}={}){
  // An invalid replacement must not leave the previous scope usable.
  invalidate();
  if(!CLASS_IDS.includes(classId))throw Error('クラスIDを確認できません');
  if(!validYear(schoolYear))throw Error('年度が不明または不正です。推測して接続しません');
  if(mode!==MODES.DEMO)throw Error('demo以外のモードは未対応です');
  active=Object.freeze({sessionId:root.crypto.randomUUID(),classId,schoolYear,mode});
  return active;
 }
 function authorize(session,request){
  if(!isActive(session))return Object.freeze({allowed:false,reason:'inactive-session'});
  if(!request||request.classId!==session.classId||request.schoolYear!==session.schoolYear||request.mode!==session.mode)return Object.freeze({allowed:false,reason:'scope-mismatch'});
  if(Object.keys(request).some(key=>!['sessionId','classId','schoolYear','mode','operation'].includes(key)))return Object.freeze({allowed:false,reason:'unsupported-request'});
  if(request.sessionId!==undefined&&request.sessionId!==session.sessionId)return Object.freeze({allowed:false,reason:'scope-mismatch'});
  if(!DEMO_OPERATIONS.includes(request.operation))return Object.freeze({allowed:false,reason:'demo-only'});
  return Object.freeze({allowed:true,reason:'demo-only'});
 }
 function context(session,channelId){
  if(!isActive(session)||typeof channelId!=='string'||!channelId)throw Error('セッションを確認できません');
  return Object.freeze({boundaryVersion:1,sessionId:session.sessionId,classId:session.classId,schoolYear:session.schoolYear,mode:session.mode,channelId});
 }
 function accepts(session,event,expectedSource,channelId){
  if(!isActive(session)||!expectedSource||event?.source!==expectedSource||event.origin!=='null')return false;
  const d=event.data;
  return !!d&&!Array.isArray(d)&&d.boundaryVersion===1&&d.sessionId===session.sessionId&&d.classId===session.classId&&d.schoolYear===session.schoolYear&&d.mode===MODES.DEMO&&typeof channelId==='string'&&!!channelId&&d.channelId===channelId;
 }
 return Object.freeze({createSession,invalidate,isActive,authorize,context,accepts});
}
const api=Object.freeze({CLASS_IDS,MODES,validYear,classIdForIndex,createBoundary});
if(typeof module==='object'&&module.exports)module.exports=api;
else{
 Object.defineProperty(root,'FlowerClassDataBoundary',{value:api});
 Object.defineProperty(root,'flowerClassBoundary',{value:createBoundary()});
}
})(typeof window==='object'?window:globalThis);
