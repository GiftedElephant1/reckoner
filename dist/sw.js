/* Reckoner's offline copy. The page and its icons are kept on the device, so the app opens
   without a connection. Whatever is kept is served straight away and refreshed in the
   background, so a new version arrives the next time the app is opened after an update. */
'use strict';

var CACHE = 'reckoner-site-1';
var KEEP = ['./index.html', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png'];

/* The address of the page itself is the folder; both spellings are kept under one key. */
function keyFor(url) {
  var u = new URL(url);
  return u.origin + (u.pathname.slice(-1) === '/' ? u.pathname + 'index.html' : u.pathname);
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(KEEP);
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) { return name !== CACHE; }).map(function (name) { return caches.delete(name); }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  var key = keyFor(request.url);
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key).then(function (kept) {
      var fresh = fetch(request).then(function (response) {
        if (response && response.ok) return cache.put(key, response.clone()).then(function () { return response; });
        return response;
      }).catch(function () { return null; });
      event.waitUntil(fresh);
      if (kept) return kept;
      return fresh.then(function (response) {
        return response || new Response('Reckoner has not been saved on this device yet. Open it once with a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      });
    });
  }));
});
