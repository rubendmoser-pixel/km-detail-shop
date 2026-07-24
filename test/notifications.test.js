import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../server/db.js";
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyAdmins
} from "../server/services/notification-service.js";

test("los avisos se crean, agrupan y marcan como leídos por destinatario", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "km-notifications-"));
  const databasePath = path.join(directory, "test.sqlite");
  const db = await openDatabase({
    databasePath,
    adminEmail: "avisos@km-detail.com",
    adminPassword: "secure-admin-password"
  });
  t.after(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  const actor = { type: "admin", id: admin.id };

  notifyAdmins(db, {
    eventType: "order_created",
    priority: "action",
    title: "Nuevo pedido",
    body: "KM-TEST-1",
    actionUrl: "/admin.html#orders",
    dedupeKey: "order-created:1"
  });
  notifyAdmins(db, {
    eventType: "order_created",
    priority: "urgent",
    title: "Pedido actualizado",
    body: "KM-TEST-1",
    actionUrl: "/admin.html#orders",
    dedupeKey: "order-created:1"
  });
  createNotification(db, {
    recipientType: "customer",
    recipientId: 99,
    title: "Aviso de otro destinatario"
  });

  const initial = listNotifications(db, actor);
  assert.equal(initial.unread, 1);
  assert.equal(initial.notifications.length, 1);
  assert.equal(initial.notifications[0].title, "Pedido actualizado");
  assert.equal(initial.notifications[0].priority, "urgent");

  const read = markNotificationRead(db, actor, initial.notifications[0].id);
  assert.ok(read.readAt);
  assert.equal(listNotifications(db, actor).unread, 0);

  notifyAdmins(db, { title: "Uno" });
  notifyAdmins(db, { title: "Dos" });
  assert.equal(markAllNotificationsRead(db, actor).updated, 2);
  assert.equal(listNotifications(db, actor).unread, 0);
});
