'use strict';
// TEST ONLY. No photo, child, album, or backup data transfer endpoints.
// Plain HTTP is NOT encrypted. A secure pairing protocol is required for production.
const http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const HOST=process.env.OMOIDE_SYNC_HOST||'0.0.0.0';
const PORT=Number(process.env.OMOIDE_SYNC_PORT||4318);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('Invalid port');
let pin='',expires=0;
const sessions=new Map(),failures=new Map();
let demoRevision=0,demoValue=0; // Synthetic integer only; not persisted.
function isPaired(req){const token=/(?:^|;\s*)omoide_pair=([0-9a-f]{48})(?:;|$)/.exec(req.headers.cookie||'')?.[1];return !!token&&(sessions.get(token)||0)>Date.now();}
function isLoopback(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}

function renewPin(){pin=String(crypto.randomInt(100000,1000000));expires=Date.now()+300000;failures.clear();console.log('【テスト用6桁確認コード】 '+pin+'（5分間有効）');}
function json(res,status,obj,headers={}){const data=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(data),...headers});res.end(data);}
const page="<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>おもいでブック ペアリングテスト</title><style>body{font-family:system-ui;background:#f4f7fb;color:#24344a;max-width:460px;padding:24px;margin:auto}main{background:white;border-radius:18px;padding:24px}input,button{font:inherit;box-sizing:border-box;width:100%;padding:13px;border-radius:10px;margin-top:10px}input{border:1px solid #b9c6d7;text-align:center;font-size:24px;letter-spacing:4px}button{background:#317ddd;color:white;border:0}small{color:#66748a}</style></head><body><main><h2>📱 おもいでブック</h2><h3>Wi-Fi接続テスト</h3><p>MacBookのターミナルに表示された6桁の確認コードを入力してね。</p><form method=\"POST\" action=\"/pair\"><input id=\"code\" name=\"code\" maxlength=\"6\" inputmode=\"numeric\" pattern=\"[0-9]{6}\" required placeholder=\"000000\"><button id=\"pair\" type=\"submit\">接続を確認</button></form><p id=\"status\" role=\"status\"></p><section id=\"demo\" hidden><hr><h3>🔄 テスト数字の同期</h3><p>今の数字：<strong id=\"value\">0</strong></p><button id=\"increase\">数字を1増やす</button><p id=\"demoStatus\" role=\"status\"></p><small>数字だけを3秒ごとに確認。写真・園児情報とは連携しません。</small></section><small>⚠️ テスト専用です。通信は暗号化されていません。写真・園児情報は送信しません。</small></main><script>async function refreshDemo(){if(document.getElementById('demo').hidden)return;try{const r=await fetch('/demo-value',{cache:'no-store'});if(!r.ok){document.getElementById('demo').hidden=true;return;}const j=await r.json();document.getElementById('value').textContent=String(j.value);}catch(e){document.getElementById('demoStatus').textContent='通信待機中…';}}document.getElementById('increase').onclick=async()=>{try{const r=await fetch('/demo-increment',{method:'POST'});const j=await r.json();document.getElementById('demoStatus').textContent=r.ok?'✅ テスト数字を送信しました':j.message;await refreshDemo();}catch(e){document.getElementById('demoStatus').textContent='接続に失敗しました';}};fetch('/pair-status').then(r=>r.json()).then(j=>{document.getElementById('demo').hidden=!j.paired;refreshDemo()});setInterval(refreshDemo,3000);</script></body></html>";
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
  let input;
  if((req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded')){
   input={code:new URLSearchParams(body).get('code')};
  }else{try{input=JSON.parse(body)}catch{return json(res,400,{message:'入力形式が正しくありません'})}}
  const formMode=(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded');
  function pairReply(status,message,cookie){
   if(!formMode)return json(res,status,{message},cookie?{'Set-Cookie':cookie}:{});
   if(status===200){
    res.writeHead(303,{'Location':'/pair','Set-Cookie':cookie,'Cache-Control':'no-store'});res.end();return;
   }
   const safe=message.replaceAll('&','&amp;').replaceAll('<','&lt;');
   res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>'+safe+'</p><a href="/pair">入力画面に戻る</a>');
  }
  if(typeof input?.code!=='string'||!/^[0-9]{6}$/.test(input.code))return json(res,400,{message:'6桁の確認コードを入力してね'});
  if(Date.now()>expires)return pairReply(410,'コードの期限切れです。サーバーを再起動してね。');
  if(!crypto.timingSafeEqual(Buffer.from(input.code),Buffer.from(pin))){
   state.count++;if(state.count>=5)state.until=Date.now()+300000;failures.set(ip,state);
   return pairReply(403,'コードが違います。');
  }
  const token=crypto.randomBytes(24).toString('hex');sessions.set(token,Date.now()+3600000);
  renewPin();
  return pairReply(200,'✅ iPhoneの接続テスト成功！写真の自動同期はまだ始まりません。','omoide_pair='+token+'; HttpOnly; Path=/; SameSite=Strict; Max-Age=3600');
 }
 if(path==='/demo-value'&&req.method==='GET'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  return json(res,200,{value:demoValue,revision:demoRevision,syntheticOnly:true});
 }
 if(path==='/demo-increment'&&req.method==='POST'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  if(!isLoopback(req)){const origin=req.headers.origin; if(origin&&origin!=='http://'+req.headers.host)return json(res,403,{message:'接続元を確認してください'});}
  demoValue=(demoValue+1)%100;demoRevision++;
  return json(res,200,{value:demoValue,revision:demoRevision,syntheticOnly:true});
 }
 if(req.method==='GET'&&path==='/pair-status'){
  const token=/(?:^|;\s*)omoide_pair=([0-9a-f]{48})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  return json(res,200,{paired:!!token&&(sessions.get(token)||0)>Date.now(),dataSyncEnabled:false,demoEnabled:true});
 }
 return json(res,404,{error:'not_found'});
});
server.listen(PORT,HOST,()=>{
 console.log('おもいでブック：ペアリングの接続テスト');
 console.log('Mac/Windows: http://localhost:'+PORT+'/pair');
 for(const [name,devices]of Object.entries(os.networkInterfaces()))for(const net of devices||[])if(net.family==='IPv4'&&!net.internal)console.log(name+': http://'+net.address+':'+PORT+'/pair');
 renewPin();
 console.log('テスト数字の確認： http://localhost:'+PORT+'/demo-value');
 console.log('注意：HTTPは暗号化されません。テスト数字以外のデータを送らないでください。');
});
server.on('error',e=>{console.error('起動エラー:',e.message);process.exitCode=1});
