// Caches the app itself so it opens with no connection. The music is in IndexedDB, not here.
// Bump the version whenever you change a file, or phones keep the old copy.
const CACHE = 'vinilo-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'metadata.js', 'playlist-import.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request))));
