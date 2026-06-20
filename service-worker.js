const CACHE_NAME = "km-detail-shop-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/catalog/catalog-page-1.png",
  "./assets/catalog/catalog-page-7.png",
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
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
