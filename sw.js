const CACHE='omoide-book-v0.52';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.svg','./icon-512.svg','./assets/stamps/stamp-01.b64','./assets/stamps/stamp-02.b64','./assets/stamps/stamp-03.b64','./assets/stamps/stamp-04.b64','./assets/stamps/stamp-05.b64','./assets/stamps/stamp-06.b64','./assets/stamps/stamp-07.b64','./assets/stamps/stamp-08.b64','./assets/stamps/stamp-09.b64','./assets/stamps/stamp-10.b64'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
