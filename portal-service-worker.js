const PORTAL_CACHE = "km-portal-apps-v12";

function portalStartPage() {
  const host = self.location.hostname;
  if (host.startsWith("ventas.")) return "/vendedor.html";
  if (host.startsWith("logistica.")) return "/logistica.html";
  if (host.startsWith("admin.")) return "/admin.html";
  if (host.startsWith("produccion.")) return "/produccion.html";
  return "/";
}

const START_PAGE = portalStartPage();
const CORE_ASSETS = [START_PAGE, "/assets/km-metal-logo-small.png", "/notifications.css?v=2", "/notifications.js?v=4"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PORTAL_CACHE).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("km-portal-apps-") && key !== PORTAL_CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(PORTAL_CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match(START_PAGE);
      throw new Error("Sin conexión");
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "KM Detail Line", body: event.data?.text() || "Tenés un nuevo aviso." };
  }
  const urgent = payload.priority === "urgent";
  event.waitUntil(self.registration.showNotification(payload.title || "KM Detail Line", {
    body: payload.body || "Tenés un nuevo aviso.",
    icon: payload.icon || "/assets/icon-192.png",
    badge: payload.badge || "/assets/notification-badge.png",
    tag: payload.tag || "km-alert",
    renotify: true,
    requireInteraction: urgent,
    silent: false,
    vibrate: urgent ? [250, 100, 250, 100, 350] : [180, 90, 180],
    data: { url: payload.url || START_PAGE }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || START_PAGE, self.location.origin).href;
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
