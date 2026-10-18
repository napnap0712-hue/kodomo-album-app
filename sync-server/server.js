'use strict';
// TEST ONLY. No photo, child, album, or backup data transfer endpoints.
// Plain HTTP is NOT encrypted. A secure pairing protocol is required for production.
const http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const HOST=process.env.OMOIDE_SYNC_HOST||'0.0.0.0';
const PORT=Number(process.env.OMOIDE_SYNC_PORT||4318);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('Invalid port');
let pin='',expires=0;
const sessions=new Map(),failures=new Map();
function renewPin(){pin=String(crypto.randomInt(100000,1000000));expires=Date.now()+300000;failures.clear();console.log('【テスト用6桁確認コード】 '+pin+'（5分間有効）');}
function json(res,status,obj,headers={}){const data=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(data),...headers});res.end(data);}
const page="<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>おもいでブック ペアリングテスト</title><style>body{font-family:system-ui;background:#f4f7fb;color:#24344a;max-width:460px;padding:24px;margin:auto}main{background:white;border-radius:18px;padding:24px}input,button{font:inherit;box-sizing:border-box;width:100%;padding:13px;border-radius:10px;margin-top:10px}input{border:1px solid #b9c6d7;text-align:center;font-size:24px;letter-spacing:4px}button{background:#317ddd;color:white;border:0}small{color:#66748a}</style></head><body><main><h2>📱 おもいでブック</h2><h3>Wi-Fi接続テスト</h3><p>MacBookのターミナルに表示された6桁の確認コードを入力してね。</p><input id=\"code\" maxlength=\"6\" inputmode=\"numeric\" placeholder=\"000000\"><button id=\"pair\">接続を確認</button><p id=\"status\" role=\"status\"></p><small>⚠️ テスト専用です。通信は暗号化されていません。写真・園児情報は送信しません。</small></main><script>document.getElementById('pair').onclick=async()=>{const status=document.getElementById('status'),code=document.getElementById('code').value.trim();if(!/^[0-9]{6}$/.test(code)){status.textContent='6桁で入力してね';return}try{const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});status.textContent=(await r.json()).message;}catch(e){status.textContent='通信に失敗しました：'+e.message}}</script></body></html>";
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&(path==='/'||path==='/health'))return json(res,200,{app:'omoide-book-sync-prototype',status:'ready',message:'接続テスト成功！写真やアルバムのデータはまだ送受信しません。',secureDataSyncEnabled:false,pairingTestAvailable:true});
 if(req.method==='GET'&&path==='/pair'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});return res.end(page);}
 if(req.method==='POST'&&path==='/pair'){
  const ip=req.socket.remoteAddress||'unknown',state=failures.get(ip)||{count:0,until:0};
  if(state.until>Date.now())return json(res,429,{message:'試行回数の上限です。5分後に試してね。'});
  let body='';
  for await(const part of req){body+=part.toString();if(body.length>1024)return json(res,413,{message:'入力が長すぎます'});}
  let input;try{input=JSON.parse(body)}catch{return json(res,400,{message:'入力形式が正しくありません'})}
  if(typeof input?.code!=='string'||!/^[0-9]{6}$/.test(input.code))return json(res,400,{message:'6桁の確認コードを入力してね'});
  if(Date.now()>expires)return json(res,410,{message:'コードの期限切れです。サーバーを再起動してね。'});
  if(!crypto.timingSafeEqual(Buffer.from(input.code),Buffer.from(pin))){
   state.count++;if(state.count>=5)state.until=Date.now()+300000;failures.set(ip,state);
   return json(res,403,{message:'コードが違います。'});
  }
  const token=crypto.randomBytes(24).toString('hex');sessions.set(token,Date.now()+3600000);
  renewPin();
  return json(res,200,{message:'✅ iPhoneの接続テスト成功！写真の自動同期はまだ始まりません。'},{'Set-Cookie':'omoide_pair='+token+'; HttpOnly; Path=/; SameSite=Strict; Max-Age=3600'});
 }
 if(req.method==='GET'&&path==='/pair-status'){
  const token=/(?:^|;\s*)omoide_pair=([0-9a-f]{48})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  return json(res,200,{paired:!!token&&(sessions.get(token)||0)>Date.now(),dataSyncEnabled:false});
 }
 return json(res,404,{error:'not_found'});
});
server.listen(PORT,HOST,()=>{
 console.log('おもいでブック：ペアリングの接続テスト');
 console.log('Mac/Windows: http://localhost:'+PORT+'/pair');
 for(const [name,devices]of Object.entries(os.networkInterfaces()))for(const net of devices||[])if(net.family==='IPv4'&&!net.internal)console.log(name+': http://'+net.address+':'+PORT+'/pair');
 renewPin();
 console.log('注意：暗号化されない接続テストです。個人情報や写真は送らないでください。');
});
server.on('error',e=>{console.error('起動エラー:',e.message);process.exitCode=1});
