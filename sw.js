// Minimal service worker: cache the app shell so it can be installed
const CACHE = "kaufland-list-v1";
const ASSETS = [
  "/",             // start_url
  "/index.html",   // main file
  "/manifest.webmanifest"
  // Icons are fetched on demand; add them here if you want them pre-cached:
  // "/icon-192.png",
  // "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for everything; fallback to cache when offline for app shell
self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET and same-origin
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
