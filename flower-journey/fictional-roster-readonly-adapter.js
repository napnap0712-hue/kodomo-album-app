/* Stage 3: read-only preparation using explicitly fictional JSON strings only.
 * No storage/network/file/DOM connection. The fixture envelope is not a migration
 * format, a new legacy storage key, or proof that caller-supplied data is fictional.
 * The parent must supply its trusted boundary instance and current session.
 */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports;
const boundaryAPI=node?require('./class-data-boundary.js'):root.FlowerClassDataBoundary;
const viewAPI=node?require('./friend-roster-view-adapter.js'):root.FlowerFriendRosterViewAdapter;
const SOURCE='fictional-json',FORMAT='flower-journey-fictional-roster-json-v1';
const FIELDS=Object.freeze(['format','source','classId','schoolYear','baseYear','storageKey','rosterJSON']);
function scopeOf(scope){
 if(!scope||typeof scope!=='object'||Array.isArray(scope)||Object.getOwnPropertySymbols(scope).length)throw Error('クラス・年度・基準年度を明示してください');
 const d=Object.getOwnPropertyDescriptors(scope),keys=Object.keys(d);
 if(keys.length!==3||!['classId','schoolYear','baseYear'].every(k=>Object.hasOwn(d,k)&&Object.hasOwn(d[k],'value')&&d[k].enumerable))throw Error('接続スコープが不正です');
 const fixed=Object.freeze({classId:d.classId.value,schoolYear:d.schoolYear.value,baseYear:d.baseYear.value});
 viewAPI.legacyRosterKey(fixed);return fixed;
}
function assertSession(boundary,session,scope){
 if(!session||session.mode!==boundaryAPI.MODES.DEMO||!boundary?.isActive(session)||!boundary.authorize(session,{classId:scope.classId,schoolYear:scope.schoolYear,mode:'demo',operation:'demo:render'}).allowed)throw Error('有効な同一クラス・年度のデモセッションが必要です');
}
function parse(text,label){
 if(typeof text!=='string')throw Error(label+'はJSON文字列だけを受け付けます');
 try{return JSON.parse(text)}catch{throw Error(label+'のJSONが破損しています。空名簿として扱いません')}
}
function assertRequest(request){
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.getOwnPropertySymbols(request).length)throw Error('架空JSONの読み取り要求だけを受け付けます');
 const d=Object.getOwnPropertyDescriptors(request);
 if('source' in request&&!Object.hasOwn(d,'source'))throw Error('継承された接続元は受け付けません');
 if(Object.keys(d).some(k=>k!=='source')||d.source&&(!Object.hasOwn(d.source,'value')||!d.source.enumerable||d.source.value!==SOURCE))throw Error('実データ要求や保存・削除・復元要求には対応していません');
}
function createFictionalReader(boundary,session,inputScope,envelopeJSON){
 const scope=scopeOf(inputScope);assertSession(boundary,session,scope);
 const envelope=parse(envelopeJSON,'架空名簿パッケージ');
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).length!==FIELDS.length||!FIELDS.every(k=>Object.hasOwn(envelope,k)))throw Error('架空名簿パッケージの項目が不正です');
 if(envelope.format!==FORMAT||envelope.source!==SOURCE)throw Error('架空JSON以外の接続は未実装です');
 for(const k of ['classId','schoolYear','baseYear'])if(envelope[k]!==scope[k])throw Error('パッケージのクラス・年度・基準年度が一致しません');
 const storageKey=viewAPI.legacyRosterKey(scope);
 if(envelope.storageKey!==storageKey)throw Error('既存名簿キーのクラス・年度が一致しません');
 const records=parse(envelope.rosterJSON,'名簿');
 const model=viewAPI.createDemoModel(boundary,session,scope,records);
 const metadata=Object.freeze({source:SOURCE,readOnly:true,...scope,storageKey});
 function verify(request){assertSession(boundary,session,scope);assertRequest(request)}
 // No setters, mutable model handles, provider callbacks, or generic command API.
 return Object.freeze({
  describe(request={}){verify(request);return metadata},
  readLegacy(request={}){verify(request);return viewAPI.legacyFor(model)},
  readView(request={}){verify(request);return viewAPI.viewFor(model)}
 });
}
const api=Object.freeze({SOURCE,FORMAT,createFictionalReader});
if(node)module.exports=api;
else Object.defineProperty(root,'FlowerFictionalRosterReadonlyAdapter',{value:api});
})(typeof window==='object'?window:globalThis);
