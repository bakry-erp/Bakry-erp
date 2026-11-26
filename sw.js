const CACHE='bakry-erp-shell-v1';
const CORE=['./','./index.html','./manifest.webmanifest','./css/cairo.css','./css/all.min.css','./css/style.css?v=3.2.0','./css/mobile.css?v=1.0.0','./js/xlsx.full.min.js','./js/db.js?v=4.2.0','./js/app.js?v=3.2.0','./icons/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin)return; e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return res;}).catch(()=>caches.match('./index.html'))));});
