// Neon Void Breaker — offline service worker (backlog #50).
// Cache-first for the app shell and assets, so the game loads offline
// after the first visit. Bumped CACHE on every release so a new deploy
// replaces the old shell instead of serving it forever.
'use strict';
const CACHE = 'nvb-v0.19.0';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'docs/screenshot-gameplay.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // same-origin only
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.ok && url.pathname.endsWith('.png')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      });
    }).catch(() => caches.match('index.html'))
  );
});
