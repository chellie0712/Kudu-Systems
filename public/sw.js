// Kudu Systems service worker: keeps the offline job page and the app's static files on the phone,
// so a technician can open and fill in their downloaded jobs with no signal.
// Everything else always comes from the network; nothing private is cached here
// (job data lives in the page's own IndexedDB store, see src/lib/offlineStore.ts).
const VERSION = "kudu-v1";
const OFFLINE_URL = "/offline";

async function cacheOfflinePage() {
  const cache = await caches.open(VERSION);
  const res = await fetch(OFFLINE_URL, { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(OFFLINE_URL, res);
  // The page's scripts and styles, so it can start without a connection.
  const assets = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s)]+/g)].map((m) => m[0]))];
  await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
  await Promise.all(["/manifest.webmanifest", "/icon-192.png", "/icon.png"].map((a) => cache.add(a).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for a refresh after each deploy-visible change (e.g. when it loads online).
self.addEventListener("message", (event) => {
  if (event.data === "refresh-offline") event.waitUntil(cacheOfflinePage().catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built files never change once deployed: serve from the cache, keep what was fetched.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // The offline page itself: network first, cached copy when there is no signal.
  if (url.pathname === OFFLINE_URL) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && req.mode === "navigate") caches.open(VERSION).then((c) => c.put(OFFLINE_URL, res.clone()));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // Any other page: when the network fails, show the offline job page instead of the browser's error.
  if (req.mode === "navigate" && !url.pathname.startsWith("/portal")) {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((hit) => hit || Response.error())));
  }
});
