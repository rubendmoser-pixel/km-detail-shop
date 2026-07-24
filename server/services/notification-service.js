const RECIPIENT_TYPES = new Set(["admin", "customer", "sales_rep", "logistics", "production"]);
const PRIORITIES = new Set(["info", "action", "urgent"]);

export function notificationActor({ user = null, salesRep = null, logisticsOperator = null, productionOperator = null } = {}) {
  if (user?.role === "admin") return { type: "admin", id: Number(user.id) };
  if (user?.role === "customer" && user.customerId) return { type: "customer", id: Number(user.customerId) };
  if (salesRep?.id) return { type: "sales_rep", id: Number(salesRep.id) };
  if (logisticsOperator?.id) return { type: "logistics", id: Number(logisticsOperator.id) };
  if (productionOperator?.id) return { type: "production", id: Number(productionOperator.id) };
  return null;
}

export function requireNotificationActor(context = {}) {
  const actor = notificationActor(context);
  if (!actor) {
    const error = new Error("Iniciá sesión para consultar tus avisos.");
    error.statusCode = 401;
    throw error;
  }
  return actor;
}

export function listNotifications(db, actor, { limit = 40 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 40));
  const notifications = db.prepare(`
    SELECT id, event_type, priority, title, body, action_url, entity_type, entity_id,
           read_at, created_at
    FROM notifications
    WHERE recipient_type = ? AND recipient_id = ?
    ORDER BY read_at IS NULL DESC, created_at DESC, id DESC
    LIMIT ?
  `).all(actor.type, actor.id, safeLimit).map(publicNotification);
  const unread = db.prepare(`
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL
  `).get(actor.type, actor.id).count;
  return { notifications, unread: Number(unread || 0) };
}

export function markNotificationRead(db, actor, id) {
  const notificationId = positiveInteger(id);
  db.prepare(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND recipient_type = ? AND recipient_id = ?
  `).run(notificationId, actor.type, actor.id);
  return getNotification(db, actor, notificationId);
}

export function markAllNotificationsRead(db, actor) {
  const result = db.prepare(`
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL
  `).run(actor.type, actor.id);
  return { ok: true, updated: Number(result.changes || 0) };
}

export function notifyAdmins(db, input) {
  return notifyRows(db, "admin", db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all(), input);
}

export function notifyAllLogistics(db, input) {
  return notifyRows(db, "logistics", db.prepare("SELECT id FROM logistics_operators WHERE status='active'").all(), input);
}

export function notifyAllProduction(db, input) {
  return notifyRows(db, "production", db.prepare("SELECT id FROM production_operators WHERE status='active'").all(), input);
}

export function notifySalesRep(db, salesRepId, input) {
  if (!Number(salesRepId)) return [];
  return notifyRows(db, "sales_rep", [{ id: Number(salesRepId) }], input);
}

export function notifyCustomer(db, customerId, input) {
  if (!Number(customerId)) return [];
  return notifyRows(db, "customer", [{ id: Number(customerId) }], input);
}

export function getOrderNotificationContext(db, orderId) {
  return db.prepare(`
    SELECT o.id, o.order_number, o.customer_id, o.sales_rep_id, o.payment_status,
           c.business_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ?
  `).get(positiveInteger(orderId)) || null;
}

export function getCustomerNotificationContext(db, customerId) {
  return db.prepare(`
    SELECT id, business_name, sales_rep_id, requested_by_sales_rep_id
    FROM customers
    WHERE id = ?
  `).get(positiveInteger(customerId)) || null;
}

function notifyRows(db, recipientType, rows, input = {}) {
  if (!RECIPIENT_TYPES.has(recipientType)) throw new Error("Destinatario de aviso inválido.");
  const created = [];
  for (const row of rows) {
    const recipientId = Number(row.id);
    if (!recipientId) continue;
    created.push(createNotification(db, {
      ...input,
      recipientType,
      recipientId
    }));
  }
  return created;
}

export function createNotification(db, input = {}) {
  const recipientType = String(input.recipientType || "");
  const recipientId = positiveInteger(input.recipientId);
  const priority = PRIORITIES.has(input.priority) ? input.priority : "info";
  const eventType = cleanText(input.eventType, 80) || "general";
  const title = cleanText(input.title, 140);
  const body = cleanText(input.body, 500);
  const actionUrl = internalUrl(input.actionUrl);
  const entityType = cleanText(input.entityType, 60);
  const entityId = Number(input.entityId) > 0 ? Number(input.entityId) : null;
  const dedupeKey = cleanText(input.dedupeKey, 180);
  if (!RECIPIENT_TYPES.has(recipientType) || !title) throw new Error("El aviso no tiene destinatario o título válido.");

  if (dedupeKey) {
    const existing = db.prepare(`
      SELECT id FROM notifications
      WHERE recipient_type = ? AND recipient_id = ? AND dedupe_key = ? AND read_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).get(recipientType, recipientId, dedupeKey);
    if (existing) {
      db.prepare(`
        UPDATE notifications
        SET event_type=?, priority=?, title=?, body=?, action_url=?, entity_type=?, entity_id=?,
            created_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(eventType, priority, title, body, actionUrl, entityType, entityId, existing.id);
      queuePushNotification(db, existing.id, recipientType, recipientId, priority);
      return getNotification(db, { type: recipientType, id: recipientId }, existing.id);
    }
  }

  const result = db.prepare(`
    INSERT INTO notifications (
      recipient_type, recipient_id, event_type, priority, title, body,
      action_url, entity_type, entity_id, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(recipientType, recipientId, eventType, priority, title, body, actionUrl, entityType, entityId, dedupeKey);
  queuePushNotification(db, result.lastInsertRowid, recipientType, recipientId, priority);
  return getNotification(db, { type: recipientType, id: recipientId }, result.lastInsertRowid);
}

function queuePushNotification(db, notificationId, recipientType, recipientId, priority) {
  if (priority !== "action" && priority !== "urgent") return;
  const subscribed = db.prepare(`
    SELECT 1
    FROM notification_push_subscriptions
    WHERE recipient_type = ? AND recipient_id = ? AND enabled = 1
    LIMIT 1
  `).get(recipientType, recipientId);
  if (!subscribed) return;
  db.prepare(`
    INSERT INTO notification_push_outbox (notification_id, recipient_type, recipient_id)
    VALUES (?, ?, ?)
  `).run(notificationId, recipientType, recipientId);
}

function getNotification(db, actor, id) {
  const row = db.prepare(`
    SELECT id, event_type, priority, title, body, action_url, entity_type, entity_id,
           read_at, created_at
    FROM notifications
    WHERE id = ? AND recipient_type = ? AND recipient_id = ?
  `).get(id, actor.type, actor.id);
  return row ? publicNotification(row) : null;
}

function publicNotification(row) {
  return {
    id: Number(row.id),
    eventType: row.event_type,
    priority: row.priority,
    title: row.title,
    body: row.body || "",
    actionUrl: row.action_url || "/",
    entityType: row.entity_type || "",
    entityId: row.entity_id ? Number(row.entity_id) : null,
    readAt: row.read_at || null,
    createdAt: row.created_at
  };
}

function internalUrl(value) {
  const url = String(value || "/").trim();
  if (!url.startsWith("/") || url.startsWith("//")) return "/";
  return url.slice(0, 500);
}

function cleanText(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error("Identificador de aviso inválido.");
    error.statusCode = 400;
    throw error;
  }
  return number;
}
