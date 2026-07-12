const CACHE_NAME = "km-detail-shop-v78";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=58",
  "./app.js?v=80",
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
  "./assets/notification-badge.png",
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "KM Detail Line", body: event.data?.text() || "Tenes una notificacion de KM." };
  }
  const title = payload.title || "KM Detail Line";
  const options = {
    body: payload.body || "Tenes una notificacion de KM.",
    icon: payload.icon || "./assets/icon-192.png",
    badge: payload.badge || "./assets/notification-badge.png",
    tag: payload.tag || "km-detail",
    data: {
      url: payload.url || "/#mis-compras"
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/#mis-compras", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
