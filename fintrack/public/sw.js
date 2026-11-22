// FinTrack Service Worker
// Enables PWA install prompt and basic offline shell caching

// Bump this whenever caching behaviour changes: old caches are deleted on activate.
const CACHE_NAME = "fintrack-v2";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for the app's own static files, with cache fallback when offline.
// Deliberately NOT handled (left to the browser, never cached):
//   • /api/*  — live prices, history, dividends: a cached copy would show stale
//               numbers offline with no indication they are old
//   • other origins — Google Drive / Firebase / fonts (private or token-bearing data)
//   • non-GET requests
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Only keep good, same-origin responses (never error pages or redirects)
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Offline navigation → show the cached app shell
        if (req.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
