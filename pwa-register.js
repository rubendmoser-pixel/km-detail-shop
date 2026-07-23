if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/portal-service-worker.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}
