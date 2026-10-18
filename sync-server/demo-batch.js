'use strict';
// Five hard-coded generated illustrations. Real photos and arbitrary SVG are rejected.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ids=['flower','sun','rainbow','star','leaf'];
const palettes=[['#e5f4ff','#ff8ab1'],['#fff5da','#ffbc57'],['#eef5ff','#8b9ff8'],['#fbf0ff','#bc90e9'],['#effbe9','#77bb87']];
const fixtures=ids.map((id,index)=>{
 const [bg,accent]=palettes[index];
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="'+bg+'"/><circle cx="180" cy="104" r="'+(44+index*5)+'" fill="'+accent+'"/><circle cx="180" cy="104" r="30" fill="#fff"/><text x="180" y="111" text-anchor="middle" font-size="24" font-family="sans-serif" fill="#334466">'+(index+1)+'</text><text x="180" y="215" text-anchor="middle" font-size="17" font-family="sans-serif" fill="#334466">OMOIDE TEST '+(index+1)+'</text></svg>';
 const bytes=Buffer.from(svg,'utf8');
 return Object.freeze({id,index,svg,bytes,digest:crypto.createHash('sha256').update(bytes).digest('hex')});
});
const byId=new Map(fixtures.map(f=>[f.id,f]));
function sameBytes(id,bytes){
 const fixture=byId.get(id);
 if(!fixture||!Buffer.isBuffer(bytes)||bytes.length!==fixture.bytes.length)return false;
 const digest=crypto.createHash('sha256').update(bytes).digest();
 const expected=Buffer.from(fixture.digest,'hex');
 return crypto.timingSafeEqual(digest,expected);
}
function createStore(dir=path.join(__dirname,'data','demo-batch')){
 function filename(id){if(!byId.has(id))throw Error('Unknown fixed fixture');return path.join(dir,id+'.svg');}
 function put(id,bytes){
  if(!sameBytes(id,bytes))return {accepted:false};
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const dest=filename(id);
  if(fs.existsSync(dest)&&sameBytes(id,fs.readFileSync(dest)))return {accepted:true,duplicate:true};
  const temp=dest+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,bytes,{mode:0o600,flag:'wx'});fs.renameSync(temp,dest);try{fs.chmodSync(dest,0o600)}catch{}}
  catch(e){try{fs.unlinkSync(temp)}catch{}throw e;}
  return {accepted:true,duplicate:false};
 }
 function get(id){
  const dest=filename(id);
  if(!fs.existsSync(dest))return null;
  const bytes=fs.readFileSync(dest);
  if(!sameBytes(id,bytes))throw Error('Stored fixture checksum mismatch');
  return bytes;
 }
 function list(){return fixtures.map(({id,index,digest})=>({id,number:index+1,digest,received:!!get(id)}));}
 function clearDemo(){let count=0;for(const {id} of fixtures){const file=filename(id);if(fs.existsSync(file)){fs.unlinkSync(file);count++;}}return count;}
 return {put,get,list,clearDemo};
}
module.exports={fixtures,byId,sameBytes,createStore};
