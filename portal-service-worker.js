const PORTAL_CACHE = "km-portal-apps-v6";

function portalStartPage() {
  const host = self.location.hostname;
  if (host.startsWith("ventas.")) return "/vendedor.html";
  if (host.startsWith("logistica.")) return "/logistica.html";
  if (host.startsWith("admin.")) return "/admin.html";
  if (host.startsWith("produccion.")) return "/produccion.html";
  return "/";
}

const START_PAGE = portalStartPage();
const CORE_ASSETS = [START_PAGE, "/assets/km-metal-logo-small.png"];

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
