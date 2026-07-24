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
