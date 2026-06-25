const CACHE_NAME = "km-detail-shop-v38";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=36",
  "./app.js?v=37",
  "./assets/km-hero-detailing.png",
  "./assets/km-empresa.png",
  "./assets/km-distribuidores.png",
  "./assets/km-contacto-final.png",
  "./assets/catalogo-2026/1_DETAIL-LINE.png",
  "./reset.html",
  "./reset.js?v=1",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./assets/favicon-16.png",
  "./assets/favicon-32.png",
  "./assets/apple-touch-icon.png",
  "./assets/km-metal-logo-small.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/catalog/catalog-page-1.png",
  "./assets/catalog/catalog-page-9.png",
  "./assets/catalog/catalog-page-13.png",
  "./assets/catalog/catalog-page-20.png",
  "./assets/catalog/catalog-page-24.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
