import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("la actualización de las apps no fuerza recargas ni navegaciones en bucle", () => {
  const registration = fs.readFileSync(path.join(root, "pwa-register.js"), "utf8");
  const portalWorker = fs.readFileSync(path.join(root, "portal-service-worker.js"), "utf8");
  const storefront = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.doesNotMatch(registration, /controllerchange|location\.reload|registration\.update/);
  assert.doesNotMatch(portalWorker, /client\.navigate\s*\(\s*client\.url\s*\)/);
  assert.doesNotMatch(storefront, /controllerchange|location\.reload|registration\.update/);
});

test("la espera del servicio de avisos tiene un tiempo máximo", () => {
  const notifications = fs.readFileSync(path.join(root, "notifications.js"), "utf8");

  assert.match(notifications, /getServiceWorkerRegistration\(3_000\)/);
  assert.match(notifications, /getServiceWorkerRegistration\(10_000\)/);
  assert.match(notifications, /Promise\.race/);
});

test("el panel de avisos se cierra al leer uno o marcar todos", () => {
  const notifications = fs.readFileSync(path.join(root, "notifications.js"), "utf8");
  const versionedFiles = [
    "index.html",
    "admin.html",
    "vendedor.html",
    "logistica.html",
    "produccion.js",
    "service-worker.js",
    "portal-service-worker.js"
  ];

  assert.match(notifications, /async function openNotification\(notification\) \{\s*close\(\);/);
  assert.match(notifications, /async function markAllRead\(\)[\s\S]*?if \(response\.ok\) \{\s*close\(\);/);
  for (const filename of versionedFiles) {
    const source = fs.readFileSync(path.join(root, filename), "utf8");
    assert.match(source, /notifications\.js\?v=5/);
    assert.doesNotMatch(source, /notifications\.js\?v=4/);
  }
});

test("la campana publica solo se habilita para clientes con sesion", () => {
  const notifications = fs.readFileSync(path.join(root, "notifications.js"), "utf8");
  const storefront = fs.readFileSync(path.join(root, "app.js"), "utf8");

  assert.match(notifications, /if \(isInternalPortal\(\)\) return true;/);
  assert.match(notifications, /fetch\("\/api\/me"/);
  assert.match(notifications, /data\.user\?\.role === "customer"/);
  assert.match(notifications, /hideNotificationCenter\(\)/);
  assert.match(storefront, /window\.KMNotifications\?\.refresh\(\)/);
});

test("el catalogo web no enlaza las fichas individuales retiradas", () => {
  const storefront = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  assert.doesNotMatch(storefront, /product-title-link|\/producto\/\$\{/);
  assert.match(home, /app\.js\?v=100/);
  assert.match(worker, /app\.js\?v=100/);
});
