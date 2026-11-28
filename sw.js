const CACHE_NAME = 'bakry-erp-local-v30';
const CORE = ['./','./index.html','./css/style.css','./css/mobile.css','./css/bakry-responsive.css','./css/bakry-light-cards.css','./css/bakry-mobile-polish.css','./css/bakry-v3-refinements.css','./css/bakry-requested-fixes.css','./css/bakry-live-search.css','./css/bakry-search-refinements.css','./css/bakry-stability.css','./css/cairo.css','./css/all.min.css','./js/app.js','./js/ui-preferences.js','./js/live-search.js','./js/db.js','./js/cloud-sync.js','./js/xlsx.full.min.js','./js/excel-import-worker.js','./js/excel-export-worker.js','./manifest.webmanifest','./owner.html','./css/owner.css','./js/owner.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isDocument = event.request.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname.endsWith('/');
  const isMainAppDocument = url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  const isAppFile = isDocument || /\/(js|css)\//.test(url.pathname);
  if (isAppFile) {
    // Network-first keeps both index.html and owner.html aligned with the deployed frontend.
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => {
      const hit = await caches.match(event.request);
      if (hit) return hit;
      if (isMainAppDocument) {
        const appShell = await caches.match('./index.html');
        if (appShell) return appShell;
      }
      return new Response('Bakry ERP غير متصل ولا توجد نسخة محفوظة من هذا الملف.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }));
  } else {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    })));
  }
});
