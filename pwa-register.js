if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/portal-service-worker.js", { scope: "/" }).catch(() => {});
  });
}
