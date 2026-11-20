// Minimal service worker: makes the CRM installable and keeps the app shell available.
// Network first for everything; data always comes live from Supabase (never cached).
const CACHE = 'crm-shell-1795182184';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'steps.js', 'queue.js', 'sales.js', 'deals.js', 'deal.js', 'ops.js', 'shipments.js', 'labs.js', 'more.js', 'config.js', 'help.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
