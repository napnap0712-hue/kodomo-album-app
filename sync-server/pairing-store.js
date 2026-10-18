'use strict';
// Pairing DEMO storage. Stores SHA-256 hashes of random session tokens, never token secrets.
// Real photo/child data is not accepted here.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX_SESSIONS=30;
const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
function createSessionStore({enabled,dir=path.join(__dirname,'data')}){
 const sessions=new Map();
 const filename=path.join(dir,'pairing-sessions.json');
 const now=()=>Date.now();
 const valid=s=>s&&typeof s.id==='string'&&/^[0-9a-f]{16}$/.test(s.id)&&Number.isFinite(s.createdAt)&&Number.isFinite(s.expires)&&s.expires>now();
 function purge(){for(const [key,s] of sessions)if(!valid(s))sessions.delete(key);}
 function save(){
  if(!enabled)return;
  purge();
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const temp=filename+'.'+process.pid+'.tmp';
  const rows=[...sessions.entries()].map(([digest,s])=>({digest,...s}));
  try{
   fs.writeFileSync(temp,JSON.stringify({version:1,sessions:rows}),{encoding:'utf8',mode:0o600,flag:'wx'});
   fs.renameSync(temp,filename);
   try{fs.chmodSync(filename,0o600)}catch{}
  }catch(e){try{fs.unlinkSync(temp)}catch{};throw e;}
 }
 if(enabled){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.existsSync(filename)){
   const stat=fs.lstatSync(filename);
   if(!stat.isFile()||stat.isSymbolicLink())throw Error('端末登録ファイルが通常ファイルではありません');
   const data=JSON.parse(fs.readFileSync(filename,'utf8'));
   if(data.version!==1||!Array.isArray(data.sessions))throw Error('端末登録ファイルの形式が不正です');
   for(const row of data.sessions.slice(0,MAX_SESSIONS)){
    if(/^[0-9a-f]{64}$/.test(row?.digest||'')&&valid(row))sessions.set(row.digest,{id:row.id,createdAt:row.createdAt,expires:row.expires});
   }
  }
  save();
 }
 function get(token){
  if(!token||!/^[0-9a-f]{48}$/.test(token))return null;
  const key=hashToken(token),session=sessions.get(key);
  if(!session)return null;
  if(!valid(session)){sessions.delete(key);save();return null;}
  return session;
 }
 function add(token,session){
  purge();
  if(sessions.size>=MAX_SESSIONS)throw Error('テスト用端末の登録上限です');
  sessions.set(hashToken(token),session);save();
 }
 function remove(token){if(!token)return;const changed=sessions.delete(hashToken(token));if(changed)save();}
 function clear(){sessions.clear();save();}
 function list(){purge();return [...sessions.values()];}
 return {enabled,get,add,remove,clear,list};
}
module.exports={createSessionStore};
