const CACHE='omoide-book-v0.75';
const ASSETS=['./manifest.webmanifest','./icon-192.svg','./icon-512.svg','./assets/stamps/stamp-01.b64','./assets/stamps/stamp-02.b64','./assets/stamps/stamp-03.b64','./assets/stamps/stamp-04.b64','./assets/stamps/stamp-05.b64','./assets/stamps/stamp-06.b64','./assets/stamps/stamp-07.b64','./assets/stamps/stamp-08.b64','./assets/stamps/stamp-09.b64','./assets/stamps/stamp-10.b64','./assets/crop/rect.png','./assets/crop/circle.png','./assets/crop/heart.png','./assets/crop/star.png','./assets/crop/hex.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.mode==='navigate'||req.destination==='document'){
    e.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req)));
});