'use strict';
// TEST ONLY. No photo, child, album, or backup data transfer endpoints.
// Plain HTTP is NOT encrypted. A secure pairing protocol is required for production.
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
const TLS_CERT=process.env.OMOIDE_TLS_CERT,TLS_KEY=process.env.OMOIDE_TLS_KEY;
if(Boolean(TLS_CERT)!==Boolean(TLS_KEY))throw Error('HTTPSには証明書と秘密鍵の両方を指定してください');
const tlsOptions=TLS_CERT?{cert:fs.readFileSync(TLS_CERT),key:fs.readFileSync(TLS_KEY)}:null;
const protocol=tlsOptions?'https':'http';
const HOST=process.env.OMOIDE_SYNC_HOST||'0.0.0.0';
const PORT=Number(process.env.OMOIDE_SYNC_PORT||4318);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('Invalid port');
let pin='',expires=0;
const {createSessionStore}=require('./pairing-store');
const demoImage=require('./demo-image');
const demoImagePath=require('node:path').join(__dirname,'data','synthetic-demo-image.svg');
let demoImageReceivedAt=null;
// Persist only while HTTPS is configured. In HTTP demo mode sessions remain ephemeral.
const sessionStore=createSessionStore({enabled:!!tlsOptions});
const failures=new Map();
const SESSION_DURATION_MS=tlsOptions?7*24*60*60*1000:60*60*1000;
const SESSION_MAX_AGE=Math.floor(SESSION_DURATION_MS/1000);
let demoRevision=0,demoValue=0; // Synthetic integer only; not persisted.
const fakeChildren=['テスト園児A','テスト園児B','テスト園児C'];let fakeChildIndex=0,fakeChildRevision=0; // No names or photos are accepted from clients.
function pairingToken(req){return /(?:^|;\s*)omoide_pair=([0-9a-f]{48})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||null;}
function pairedSession(req){const token=pairingToken(req);if(!token)return null;return sessionStore.get(token);}
function isPaired(req){return !!pairedSession(req);}
function checkSameOrigin(req){return req.headers.origin===protocol+'://'+req.headers.host;}
function isLoopback(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}

function renewPin(){pin=String(crypto.randomInt(100000,1000000));expires=Date.now()+300000;failures.clear();console.log('【テスト用6桁確認コード】 '+pin+'（5分間有効）');}
function json(res,status,obj,headers={}){const data=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(data),...headers});res.end(data);}
const page="<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>おもいでブック ペアリングテスト</title><style>body{font-family:system-ui;background:#f4f7fb;color:#24344a;max-width:460px;padding:24px;margin:auto}main{background:white;border-radius:18px;padding:24px}input,button{font:inherit;box-sizing:border-box;width:100%;padding:13px;border-radius:10px;margin-top:10px}input{border:1px solid #b9c6d7;text-align:center;font-size:24px;letter-spacing:4px}button{background:#317ddd;color:white;border:0}small{color:#66748a}</style></head><body><main><h2>📱 おもいでブック</h2><h3>Wi-Fi接続テスト</h3><p>MacBookのターミナルに表示された6桁の確認コードを入力してね。</p><form method=\"POST\" action=\"/pair\"><input id=\"code\" name=\"code\" maxlength=\"6\" inputmode=\"numeric\" pattern=\"[0-9]{6}\" required placeholder=\"000000\"><button id=\"pair\" type=\"submit\">接続を確認</button></form><p id=\"status\" role=\"status\"></p><section id=\"pairedInfo\" hidden><p>✅ この端末はペアリング済みです。</p><form method=\"POST\" action=\"/unpair\"><button type=\"submit\" style=\"background:#707989\">この端末の接続を解除</button></form></section><section id=\"demo\" hidden><hr><h3>🔄 テスト数字の同期</h3><p>今の数字：<strong id=\"value\">0</strong></p><button id=\"increase\">数字を1増やす</button><p id=\"demoStatus\" role=\"status\"></p><small>数字だけを3秒ごとに確認。写真・園児情報とは連携しません。</small><hr><h3>👶 架空の園児データ同期</h3><p>選択中：<strong id=\"fakeName\">テスト園児A</strong></p><button id=\"fakeNext\" type=\"button\">次のテスト園児に切り替える</button><p id=\"fakeStatus\" role=\"status\"></p><small>テスト園児A〜Cの固定文字列のみ。実際の名前や写真は送れません。</small><hr><h3>📸 テスト画像の送信</h3><p>下のイラストはアプリ内で用意した架空画像だよ。</p><img id=\"sampleDemoImage\" alt=\"テスト画像\" style=\"display:block;width:100%;max-width:320px;border-radius:12px;margin:8px auto\"><button type=\"button\" id=\"sendDemoImage\">このテスト画像をMacBookへ送る</button><p id=\"imageDemoStatus\" role=\"status\"></p><small>自分の写真を選ぶ機能はありません。決まったテスト画像だけを送ります。</small></section><small>⚠️ テスト専用です。実際の写真・園児情報は送信しません。HTTPS未設定時は通信が暗号化されません。</small></main><script>async function refreshDemo(){if(document.getElementById('demo').hidden)return;try{const r=await fetch('/demo-value',{cache:'no-store'});if(!r.ok){document.getElementById('demo').hidden=true;return;}const j=await r.json();document.getElementById('value').textContent=String(j.value);}catch(e){document.getElementById('demoStatus').textContent='通信待機中…';}}document.getElementById('increase').onclick=async()=>{try{const r=await fetch('/demo-increment',{method:'POST'});const j=await r.json();document.getElementById('demoStatus').textContent=r.ok?'✅ テスト数字を送信しました':j.message;await refreshDemo();}catch(e){document.getElementById('demoStatus').textContent='接続に失敗しました';}};fetch('/pair-status').then(r=>r.json()).then(j=>{document.getElementById('demo').hidden=!j.paired;document.getElementById('pairedInfo').hidden=!j.paired;refreshDemo()});setInterval(refreshDemo,3000);async function refreshFake(){if(document.getElementById('demo').hidden)return;try{const r=await fetch('/demo-child',{cache:'no-store'});if(!r.ok)return;const d=await r.json();document.getElementById('fakeName').textContent=d.name;}catch(e){document.getElementById('fakeStatus').textContent='通信待機中…';}}document.getElementById('fakeNext').onclick=async()=>{try{const r=await fetch('/demo-child-next',{method:'POST'});document.getElementById('fakeStatus').textContent=r.ok?'✅ 架空の園児データを送信しました':'送信できませんでした';await refreshFake();}catch(e){document.getElementById('fakeStatus').textContent='通信できませんでした';}};setInterval(refreshFake,3000);const demoImageText=decodeURIComponent('__DEMO_SVG_URI__');document.getElementById('sampleDemoImage').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(demoImageText);document.getElementById('sendDemoImage').onclick=async()=>{const output=document.getElementById('imageDemoStatus');output.textContent='送信しています…';try{const r=await fetch('/demo-image/upload',{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:new TextEncoder().encode(demoImageText)});const result=await r.json();output.textContent=r.ok?'✅ テスト画像を送信・保存しました。MacBookで画像を確認してね。':result.message||'送信に失敗しました';}catch(e){output.textContent='通信できませんでした：'+e.message}};</script></body></html>".replace('__DEMO_SVG_URI__',encodeURIComponent(demoImage.SVG));
const server=(tlsOptions?https:http).createServer(...(tlsOptions?[tlsOptions]:[]),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='POST'&&!checkSameOrigin(req))return json(res,403,{message:'この画面以外からの送信はできません'});
 if(req.method==='GET'&&path==='/security-status'){
  return json(res,200,{
   transport:tlsOptions?'https':'http',
   encrypted:!!tlsOptions,
   browserTrustNeedsVerification:!!tlsOptions,
   demoOnly:true,
   allowsRealChildData:false,
   allowsRealPhotos:false,
   authenticatedPairingDemo:true,
   sessionPersistence:sessionStore.enabled,
   message:tlsOptions?'HTTPSで通信中です。証明書の信頼と端末認証の本番要件は別途確認が必要です。':'HTTPのため暗号化されていません。架空データのテスト専用です。'
  });
 }
 if(req.method==='GET'&&(path==='/'||path==='/health'))return json(res,200,{app:'omoide-book-sync-prototype',status:'ready',message:'接続テスト成功！写真やアルバムのデータはまだ送受信しません。',secureDataSyncEnabled:false,pairingTestAvailable:true});
 if(req.method==='GET'&&path==='/pair'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data: 'self'; frame-ancestors 'none'"});return res.end(page);}
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
  const token=crypto.randomBytes(24).toString('hex');sessionStore.add(token,{id:crypto.randomBytes(8).toString('hex'),expires:Date.now()+SESSION_DURATION_MS,createdAt:Date.now()});
  renewPin();
  return pairReply(200,'✅ iPhoneの接続テスト成功！写真の自動同期はまだ始まりません。','omoide_pair='+token+'; HttpOnly; Path=/; SameSite=Strict; Max-Age='+SESSION_MAX_AGE+(tlsOptions?'; Secure':''));
 }
 if(path==='/demo-value'&&req.method==='GET'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  return json(res,200,{value:demoValue,revision:demoRevision,syntheticOnly:true});
 }
 if(path==='/demo-increment'&&req.method==='POST'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  if(!isLoopback(req)){const origin=req.headers.origin; if(origin&&origin!==protocol+'://'+req.headers.host)return json(res,403,{message:'接続元を確認してください'});}
  demoValue=(demoValue+1)%100;demoRevision++;
  return json(res,200,{value:demoValue,revision:demoRevision,syntheticOnly:true});
 }
 if(path==='/demo-child'&&req.method==='GET'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  return json(res,200,{name:fakeChildren[fakeChildIndex],revision:fakeChildRevision,syntheticOnly:true});
 }
 if(path==='/demo-child-next'&&req.method==='POST'){
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  if(!isLoopback(req)){const origin=req.headers.origin;if(origin&&origin!==protocol+'://'+req.headers.host)return json(res,403,{message:'接続元を確認してください'});}
  fakeChildIndex=(fakeChildIndex+1)%fakeChildren.length;fakeChildRevision++;
  return json(res,200,{name:fakeChildren[fakeChildIndex],revision:fakeChildRevision,syntheticOnly:true});
 }

 // HTTPS-only synthetic illustration test. No user-selected images are accepted.
 if(path==='/demo-image/upload'&&req.method==='POST'){
  if(!tlsOptions)return json(res,403,{message:'HTTPSで起動してください'});
  if(!isPaired(req))return json(res,401,{message:'この端末をペアリングしてください'});
  if(req.headers['content-type']!=='image/svg+xml')return json(res,415,{message:'テスト画像のみ送信できます'});
  const chunks=[];let length=0;
  for await(const chunk of req){
   length+=chunk.length;
   if(length>8192)return json(res,413,{message:'画像が大きすぎます'});
   chunks.push(chunk);
  }
  const bytes=Buffer.concat(chunks);
  if(!demoImage.validPayload(bytes))return json(res,422,{message:'内蔵のテスト画像以外は受け付けません'});
  const folder=require('node:path').dirname(demoImagePath);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const temp=demoImagePath+'.'+process.pid+'.tmp';
  try{
   fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
   fs.renameSync(temp,demoImagePath);
   try{fs.chmodSync(demoImagePath,0o600)}catch{}
  }catch(err){try{fs.unlinkSync(temp)}catch{};return json(res,500,{message:'テスト画像を保存できませんでした'});}
  demoImageReceivedAt=new Date().toISOString();
  return json(res,200,{message:'テスト画像を保存しました',bytes:bytes.length,syntheticOnly:true});
 }
 if(path==='/demo-image/view'&&req.method==='GET'){
  if(!tlsOptions)return json(res,403,{message:'HTTPSが必要です'});
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  if(!fs.existsSync(demoImagePath))return json(res,404,{message:'まだテスト画像が届いていません'});
  const bytes=fs.readFileSync(demoImagePath);
  if(!demoImage.validPayload(bytes))return json(res,500,{message:'保存画像がテスト画像と一致しません'});
  res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Content-Length':bytes.length,'Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'});
  return res.end(bytes);
 }
 if(path==='/demo-image/status'&&req.method==='GET'){
  if(!tlsOptions)return json(res,403,{message:'HTTPSが必要です'});
  if(!isPaired(req)&&!isLoopback(req))return json(res,401,{message:'ペアリングしてください'});
  const exists=fs.existsSync(demoImagePath);
  return json(res,200,{received:exists,syntheticOnly:true,imageUrl:exists?'/demo-image/view':null,receivedAt:demoImageReceivedAt});
 }
 if(req.method==='POST'&&path==='/unpair'){
  const token=pairingToken(req);if(token)sessionStore.remove(token);
  res.writeHead(303,{'Location':'/pair','Cache-Control':'no-store','Set-Cookie':'omoide_pair=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'+(tlsOptions?'; Secure':'')});return res.end();
 }
 if(req.method==='GET'&&path==='/devices'){
  if(!isLoopback(req))return json(res,403,{message:'この操作はサーバーのパソコンのみです'});
  const active=sessionStore.list();return json(res,200,{activeDeviceCount:active.length,devices:active.map(s=>({id:s.id,expiresAt:new Date(s.expires).toISOString()})),storedOnDisk:sessionStore.enabled});
 }
 if(req.method==='POST'&&path==='/revoke-all'){
  if(!isLoopback(req))return json(res,403,{message:'この操作はサーバーのパソコンのみです'});
  sessionStore.clear();renewPin();return json(res,200,{message:'すべての接続を解除しました。',activeDeviceCount:0});
 }
 if(req.method==='GET'&&path==='/pair-status'){
  const session=pairedSession(req);
  return json(res,200,{paired:!!session,deviceId:session?.id||null,expiresAt:session?new Date(session.expires).toISOString():null,dataSyncEnabled:false,demoEnabled:true,syntheticImageDemo:true});
 }
 return json(res,404,{error:'not_found'});
});
server.listen(PORT,HOST,()=>{
 console.log('おもいでブック：ペアリングの接続テスト');
 console.log('Mac/Windows: '+protocol+'://localhost:'+PORT+'/pair');
 for(const [name,devices]of Object.entries(os.networkInterfaces()))for(const net of devices||[])if(net.family==='IPv4'&&!net.internal)console.log(name+': '+protocol+'://'+net.address+':'+PORT+'/pair');
 renewPin();
 console.log('テスト数字の確認： '+protocol+'://localhost:'+PORT+'/demo-value');
 console.log(tlsOptions?'HTTPSモード：テスト端末の登録を7日間（最大）保存します。':'HTTPテストモード：暗号化なし・登録保存なし。架空データ以外を送らないでください。');
});
server.on('error',e=>{console.error('起動エラー:',e.message);process.exitCode=1});
