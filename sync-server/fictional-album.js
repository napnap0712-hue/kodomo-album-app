'use strict';
// Fictional-only sync demo: values MUST come from these hard-coded lists.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const choices=Object.freeze({
 title:['🌸 テストアルバム','🌈 にじいろテスト','⭐ おもいでテスト'],
 message:['こんにちは！これは架空のアルバムです。','テスト用のメッセージを表示しています。','これは実際の園児とは関係ありません。'],
 color:['peach','mint','sky']
});
const DEFAULT=Object.freeze({revision:0,title:choices.title[0],message:choices.message[0],color:choices.color[0],updatedAt:null});
function validFields(value){return value&&typeof value==='object'&&Object.keys(choices).every(k=>typeof value[k]==='string'&&choices[k].includes(value[k]));}
function createStore(folder=path.join(__dirname,'data')){
 const file=path.join(folder,'fictional-album-sync.json');
 function read(){
  if(!fs.existsSync(file))return {...DEFAULT};
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Test album state is not a regular file');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Number.isSafeInteger(data.revision)||data.revision<0||!validFields(data))throw Error('Invalid fictional album state');
  return {revision:data.revision,title:data.title,message:data.message,color:data.color,updatedAt:typeof data.updatedAt==='string'?data.updatedAt:null};
 }
 function save(input){
  if(!input||Object.keys(input).some(key=>!['baseRevision','title','message','color'].includes(key))||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0||!validFields(input))return {status:400,message:'固定の架空アルバムの選択肢だけを送れます'};
  const current=read();
  if(input.baseRevision!==current.revision)return {status:409,message:'ほかの端末で更新されています。内容を確認して読み込み直してください。',current};
  if(current.title===input.title&&current.message===input.message&&current.color===input.color)return {status:200,unchanged:true,state:current};
  if(current.revision>=Number.MAX_SAFE_INTEGER)return {status:409,message:'改訂番号の上限です',current};
  const next={revision:current.revision+1,title:input.title,message:input.message,color:input.color,updatedAt:new Date().toISOString()};
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(temp,JSON.stringify(next),{flag:'wx',mode:0o600});
   fs.renameSync(temp,file);
   try{fs.chmodSync(file,0o600)}catch{}
  }catch(e){try{fs.unlinkSync(temp)}catch{}throw e}
  return {status:200,unchanged:false,state:next};
 }
 return {read,save,choices};
}
module.exports={createStore,choices,validFields};
