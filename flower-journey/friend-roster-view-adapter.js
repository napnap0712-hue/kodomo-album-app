/* Pure fictional-roster conversion. No storage, network, DOM, or file access.
 * The model keeps full legacy snapshots separately from the Ver.6 projection.
 */
(function(root){
'use strict';
const boundaryAPI=typeof module==='object'&&module.exports?require('./class-data-boundary.js'):root.FlowerClassDataBoundary;
const VALID_IDS=boundaryAPI.CLASS_IDS,models=new WeakMap();
function assertScope({classId,schoolYear}={}){
 if(!VALID_IDS.includes(classId))throw Error('未知のクラスIDです');
 if(!boundaryAPI.validYear(schoolYear))throw Error('年度を明示してください');
 return Object.freeze({classId,schoolYear});
}
function legacyRosterKey({classId,schoolYear,baseYear}={}){
 assertScope({classId,schoolYear});
 if(!boundaryAPI.validYear(baseYear)||schoolYear<baseYear)throw Error('基準年度を明示してください');
 return 'omoide-class-children-v1-'+classId+(schoolYear===baseYear?'':'-year-'+schoolYear);
}
// Clone only JSON data, rejecting accessors, cycles, sparse arrays and lossy types.
// defineProperty preserves unknown keys (including __proto__) without setters.
function snapshot(value,ancestors=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||ancestors.has(value))throw Error('JSON互換でない名簿データです');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(!array&&proto!==null&&Object.getPrototypeOf(proto)!==null)throw Error('名簿データは通常のオブジェクトが必要です');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Object.getOwnPropertySymbols(value).length||Object.entries(descriptors).some(([k,d])=>!(array&&k==='length')&&(!d.enumerable||!Object.hasOwn(d,'value'))))throw Error('名簿データのプロパティが不正です');
 if(array&&(Object.keys(value).length!==value.length||Object.keys(value).some((key,i)=>key!==String(i))))throw Error('名簿配列が不正です');
 ancestors.add(value);const out=array?[]:{};
 for(const key of Object.keys(value))Object.defineProperty(out,key,{value:snapshot(descriptors[key].value,ancestors),enumerable:true,writable:true,configurable:true});
 ancestors.delete(value);return Object.freeze(out);
}
function validate(records){
 if(!Array.isArray(records))throw Error('園児名簿が配列ではありません');
 const copy=snapshot(records),seen=new Set();
 for(const [index,r] of copy.entries()){
  if(!r||Array.isArray(r)||typeof r!=='object')throw Error('園児レコードが不正です: '+index);
  if(typeof r.id!=='string'||!r.id.trim()||r.id!==r.id.trim()||seen.has(r.id))throw Error('園児IDが不正または重複しています: '+index);
  if(typeof r.name!=='string'||!r.name.trim())throw Error('園児名が不正です: '+index);
  if(r.facePhoto!==undefined&&r.facePhoto!==null&&r.facePhoto!==''&&(typeof r.facePhoto!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.facePhoto)||!r.facePhoto.split(',')[1]))throw Error('顔写真のデータ形式が不正です: '+index);
  if(r.displayName!==undefined&&typeof r.displayName!=='string')throw Error('ゲーム内表示名が不正です: '+index);
  seen.add(r.id);
 }
 return copy;
}
function project(records,aliases){return Object.freeze(records.map(r=>Object.freeze({id:r.id,name:r.name,game:aliases&&Object.hasOwn(aliases,r.id)?aliases[r.id]:(r.displayName?.trim()||r.name),photo:r.facePhoto??null})))}
function normalizeLegacyRoster(records){return project(validate(records))}
function parseLegacyRoster(text){
 if(typeof text!=='string')throw Error('名簿テキストが不正です');
 let records;try{records=JSON.parse(text)}catch{throw Error('名簿JSONが破損しています。0人として扱いません')}
 return normalizeLegacyRoster(records);
}
function check(boundary,session,scope,operation){
 if(!scope||Object.keys(scope).some(key=>!['classId','schoolYear','baseYear'].includes(key)))throw Error('接続スコープに未対応の項目があります');
 assertScope(scope);legacyRosterKey(scope);
 if(session?.mode!=='demo'||!boundary?.isActive(session)||!boundary.authorize(session,{classId:scope.classId,schoolYear:scope.schoolYear,mode:'demo',operation}).allowed)throw Error('有効な同一クラス・年度のデモセッションが必要です');
}
function createDemoModel(boundary,session,scope,records,aliases={}){
 check(boundary,session,scope,'demo:render');const original=validate(records),names=snapshot(aliases);
 if(!names||Array.isArray(names)||typeof names!=='object')throw Error('表示名設定が不正です');
 for(const [id,name] of Object.entries(names))if(!original.some(r=>r.id===id)||typeof name!=='string')throw Error('表示名の園児IDまたは値が不正です');
 for(const r of original)for(const [key,value] of [['classId',scope.classId],['schoolYear',scope.schoolYear],['year',scope.schoolYear]])if(Object.hasOwn(r,key)&&r[key]!==value)throw Error('レコードのクラス・年度が一致しません');
 const fixed=Object.freeze({classId:scope.classId,schoolYear:scope.schoolYear,baseYear:scope.baseYear});
 const model=Object.freeze({scope:fixed,kind:'fictional-roster'});
 models.set(model,{boundary,session,scope:fixed,original,names,view:project(original,names)});return model;
}
function state(model,operation='demo:render'){
 const s=models.get(model);if(!s)throw Error('未確認の名簿モデルです');check(s.boundary,s.session,s.scope,operation);return s;
}
function viewFor(model){return state(model).view}
function legacyFor(model){return snapshot(state(model).original)}
function displayNamesFor(model){return snapshot(state(model).names)}
function withDisplayName(model,id,name){
 const s=state(model,'demo:register');if(!s.original.some(r=>r.id===id)||typeof name!=='string')throw Error('表示名が不正です');
 const names=Object.fromEntries([...Object.entries(s.names).filter(([key])=>key!==id),[id,name]]);
 return createDemoModel(s.boundary,s.session,s.scope,s.original,names);
}
const api=Object.freeze({VALID_IDS,assertScope,legacyRosterKey,normalizeLegacyRoster,parseLegacyRoster,createDemoModel,viewFor,legacyFor,displayNamesFor,withDisplayName});
if(typeof module==='object'&&module.exports)module.exports=api;
else Object.defineProperty(root,'FlowerFriendRosterViewAdapter',{value:api});
})(typeof window==='object'?window:globalThis);
