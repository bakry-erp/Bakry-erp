const CACHE_NAME = 'bakry-erp-local-v5';
const CORE = ['./','./index.html','./css/style.css','./css/mobile.css','./css/bakry-responsive.css','./css/cairo.css','./css/all.min.css','./js/app.js','./js/db.js','./js/xlsx.full.min.js','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isAppFile = url.pathname.endsWith('/index.html') || /\/(js|css)\//.test(url.pathname);
  if (isAppFile) {
    event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)); } return response; }).catch(()=>caches.match(event.request).then(hit=>hit || caches.match('./index.html'))));
  } else {
    event.respondWith(caches.match(event.request).then(hit=>hit || fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}return response;})));
  }
});
