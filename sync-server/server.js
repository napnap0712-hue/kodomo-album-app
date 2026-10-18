'use strict';
// LAN connectivity prototype. Deliberately does NOT accept album or photo data.
const http = require('node:http');
const os = require('node:os');
const HOST = process.env.OMOIDE_SYNC_HOST || '0.0.0.0';
const PORT = Number(process.env.OMOIDE_SYNC_PORT || 4318);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid port');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' || !['/', '/health'].includes(new URL(req.url, 'http://localhost').pathname)) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const body = JSON.stringify({
    app: 'omoide-book-sync-prototype',
    status: 'ready',
    message: '接続テスト成功！写真やアルバムのデータはまだ送受信しません。',
    secureDataSyncEnabled: false
  });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
});
server.listen(PORT, HOST, () => {
  console.log('おもいでブック：Wi-Fi接続テスト用サーバー');
  console.log('Mac/Windows: http://localhost:' + PORT + '/health');
  for (const [name, interfaces] of Object.entries(os.networkInterfaces())) {
    for (const net of interfaces || []) {
      if (net.family === 'IPv4' && !net.internal) console.log(name + ': http://' + net.address + ':' + PORT + '/health');
    }
  }
  console.log('注意：これはテスト専用です。写真や個人情報は送らないでください。');
});
server.on('error', error => { console.error('サーバーを起動できません:', error.message); process.exitCode = 1; });
