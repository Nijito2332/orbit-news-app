// ─── ORBIT Service Worker — Network-first for news, Cache-first for shell ────
const CACHE   = 'orbit-shell-v4';
const RUNTIME = 'orbit-runtime-v4';

// App shell — cache on install, never expire
const SHELL = [
  './',
  './index.html',
  './assets/',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./']))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE && k !== RUNTIME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept backend API calls — always live news
  if (url.hostname.includes('fly.dev') ||
      url.hostname.includes('railway.app') ||
      url.hostname.includes('supabase.co')) {
    return;
  }

  // Google Fonts — cache-first (CDN, doesn't change)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(RUNTIME).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const fresh = await fetch(e.request);
        cache.put(e.request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // index.html — always network-first so new deploys show immediately
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request).then(fresh => {
        if (fresh.ok) {
          caches.open(CACHE).then(c => c.put(e.request, fresh.clone()));
        }
        return fresh;
      }).catch(() => caches.open(CACHE).then(c => c.match('./') || c.match('./index.html')))
    );
    return;
  }

  // Other app shell assets — cache-first, fallback to network
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) cache.put(e.request, fresh.clone());
          return fresh;
        } catch (_) {
          throw _;
        }
      })
    );
  }
});
