/* sw.js — v1.0 “instant-shell” */
const VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

/* Files we want immediately available offline (the app shell) */
const PRECACHE_URLS = [
  '/',                 // ensure navigation fallback
  '/index.html',
  '/manifest.webmanifest',
];

/* Install: pre-cache the shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
        .map((k) => caches.delete(k))
    );
  })());
  self.clients.claim();
});

/* Helper: network with timeout */
async function networkWithTimeout(req, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

/* Fetch strategy:
   - Navigations: cache-first (show instantly) + background revalidate
   - Static JS/CSS from same-origin & Firebase CDN: stale-while-revalidate
   - Everything else: pass-through (let Firestore/Auth do their thing)
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Handle navigations fast (SPA shell)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);

      // Try network quickly; if slow or offline, fall back to cached shell
      try {
        const net = await networkWithTimeout(req, 3000);
        // Update cache copy of the shell
        event.waitUntil(cache.put('/index.html', net.clone()));
        return net;
      } catch {
        const cached = await cache.match('/index.html') || await cache.match('/');
        if (cached) return cached;
        // Last resort
        return fetch(req);
      }
    })());
    return;
  }

  // 2) Runtime caching for static resources (local & Firebase CDN)
  const url = new URL(req.url);

  // Do not cache images
  if (req.destination === 'image') {
    return; // fall through to default network fetch
  }

  // Same-origin static, excluding images
  const isSameOriginStatic =
    url.origin === self.location.origin &&
    /\.(?:js|css|woff2?|mp3|wav|ogg|m4a|aac)$/i.test(url.pathname);

  // Only cache static SDK assets. Do NOT cache Firebase Storage media.
  const isFirebaseCdn =
    url.hostname === 'www.gstatic.com';

  if (isSameOriginStatic || isFirebaseCdn) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const netPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            cache.put(req, res.clone()).catch(()=>{});
          }
          return res;
        })
        .catch(() => null);

      // Stale-while-revalidate: return cached ASAP; refresh in background
      return cached || netPromise || fetch(req);
    })());
    return;
  }



  // 3) Default: do nothing special (let network proceed)
});
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());
