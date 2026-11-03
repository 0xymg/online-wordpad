// EDTRDocs service worker: offline shell for the editor.
// - Immutable Next.js static assets and fonts: cache-first.
// - /pad navigations: network-first with cached fallback so the editor opens offline.
const CACHE = "edtrdocs-v3";
// An old production registration may still control a local development server.
// Its chunk URLs are reused between edits, so always let local requests hit the network.
const LOCAL_DEVELOPMENT = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(self.location.hostname)
  || self.location.hostname.endsWith(".localhost");
const isAppCache = (key) => /^(edtrdocs|edtr|wordpad)-/.test(key);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => isAppCache(k) && (LOCAL_DEVELOPMENT || k !== CACHE)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (LOCAL_DEVELOPMENT) return;
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Hashed build assets + local fonts + icons: safe to cache forever.
  const isImmutable =
    (url.origin === location.origin &&
      (url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/fonts/") ||
        url.pathname.startsWith("/icon-"))) ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "fonts.googleapis.com";

  if (isImmutable) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Editor shell: network-first, cached copy when offline.
  if (request.mode === "navigate" && url.origin === location.origin && url.pathname === "/pad") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
    );
  }
});
