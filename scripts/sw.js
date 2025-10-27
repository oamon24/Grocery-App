/* Kaufland PWA Service Worker — cache-first for static, network-first for HTML */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  // CSS
  "/css/theme.css",
  "/css/layout.css",
  "/css/ui.css",
  "/css/list.css",
  "/css/recipes.css",
  "/css/modals.css",
  "/css/weeklyItems.css",
  "/css/cook.css",
  "/css/timers.css",
  "/css/itemDialog.css",
  // JS
  "/scripts/main.js",
  "/scripts/ui/ui.js",
  "/scripts/ui/loadModal.js",
  "/scripts/modals/itemDialog.js",
  "/scripts/modals/weeklyItems.js",
  "/scripts/cook/mode.js",
  "/scripts/cook/timers.js",
  "/scripts/timers/core.js",
  "/scripts/timers/ui.js",
  "/scripts/utils/utils.js",
  "/scripts/lists/render.js",
  "/scripts/lists/row.js",
  "/scripts/recipes/recipes.js",
  "/scripts/photo.js",
  "/scripts/firebase.js",
  "/scripts/dataSync.js",
  // HTML partials for offline
  "/partials/modals/options.html",
  "/partials/modals/weeklyItems.html",
  "/partials/modals/recipe.html",
  "/partials/modals/addToListModal.html",
  "/partials/modals/itemDialog.html",
  "/partials/modals/photoPopup.html",
  // Assets
  "/assets/alarm.mp3",
  
  "/manifest/manifest.json"
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((k) => {
          if (![STATIC_CACHE, RUNTIME_CACHE].includes(k)) return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});


// Helpers to avoid caching Firebase dynamic endpoints
function isFirebaseUrl(url) {
  return /firebaseio\.com|googleapis\.com|gstatic\.com/.test(url.hostname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;
  if (isFirebaseUrl(url)) return; // let network handle Firestore/Storage/Auth

  if (req.destination === "document" || url.pathname.endsWith(".html")) {
    // Network-first for HTML
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

    // Cache-first for other GETs
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => new Response("", { status: 502, statusText: "Offline" }));
    })
  );


});
