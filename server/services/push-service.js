import webpush from "web-push";

const DEFAULT_ICON = "/assets/icon-192.png";
const DEFAULT_BADGE = "/assets/notification-badge.png";

export function createPushService({ db, config }) {
  const enabled = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
  let flushing = false;

  if (enabled) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  }

  function publicConfig() {
    return {
      enabled,
      publicKey: enabled ? config.vapidPublicKey : ""
    };
  }

  function upsertSubscription(user, subscription, userAgent = "") {
    if (!enabled) return { enabled: false, subscribed: false };
    const endpoint = requiredText(subscription?.endpoint, "endpoint");
    const p256dh = requiredText(subscription?.keys?.p256dh, "p256dh");
    const auth = requiredText(subscription?.keys?.auth, "auth");
    db.prepare(`
      INSERT INTO push_subscriptions (user_id, customer_id, endpoint, p256dh, auth, user_agent, enabled, updated_at, disabled_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        customer_id = excluded.customer_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        enabled = 1,
        updated_at = CURRENT_TIMESTAMP,
        disabled_at = NULL
    `).run(user.id, user.customerId || null, endpoint, p256dh, auth, String(userAgent || "").slice(0, 500));
    return { enabled: true, subscribed: true };
  }

  function removeSubscription(user, endpoint) {
    if (!endpoint) return { subscribed: false };
    db.prepare(`
      UPDATE push_subscriptions
      SET enabled = 0, disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = ? AND user_id = ?
    `).run(endpoint, user.id);
    return { subscribed: false };
  }

  function getUserSubscriptionState(user) {
    if (!enabled || !user.customerId) return { enabled, subscribed: false };
    const count = db.prepare(`
      SELECT COUNT(*) AS count
      FROM push_subscriptions
      WHERE user_id = ? AND customer_id = ? AND enabled = 1
    `).get(user.id, user.customerId).count;
    return { enabled, subscribed: count > 0 };
  }

  function queueCustomerNotification({ customerId, eventType, title, body, url = "/", tag = "" }) {
    if (!enabled || !customerId || !body) return { queued: false };
    const activeSubscriptions = db.prepare(`
      SELECT COUNT(*) AS count FROM push_subscriptions
      WHERE customer_id = ? AND enabled = 1
    `).get(customerId).count;
    if (!activeSubscriptions) return { queued: false };
    db.prepare(`
      INSERT INTO push_outbox (event_type, customer_id, title, body, url, tag)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventType, customerId, title || "KM Detail Line", body, url, tag);
    return { queued: true };
  }

  async function flush(limit = 25) {
    if (!enabled || flushing) return { sent: 0, failed: 0 };
    flushing = true;
    let sent = 0;
    let failed = 0;
    try {
      const messages = db.prepare(`
        SELECT * FROM push_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `).all(limit);
      for (const message of messages) {
        const result = await sendMessage(message);
        if (result.sent) sent += 1;
        else failed += 1;
      }
      return { sent, failed };
    } finally {
      flushing = false;
    }
  }

  async function sendMessage(message) {
    const subscriptions = db.prepare(`
      SELECT * FROM push_subscriptions
      WHERE customer_id = ? AND enabled = 1
      ORDER BY updated_at DESC
    `).all(message.customer_id);
    if (!subscriptions.length) {
      markFailed(message.id, "No hay dispositivos suscriptos");
      return { sent: false };
    }
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url || "/#mis-compras",
      tag: message.tag || `km-push-${message.id}`,
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE
    });
    let delivered = 0;
    const errors = [];
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        }, payload);
        delivered += 1;
      } catch (error) {
        errors.push(error.message || "Error enviando push");
        if (error.statusCode === 404 || error.statusCode === 410) {
          db.prepare(`
            UPDATE push_subscriptions
            SET enabled = 0, disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(subscription.id);
        }
      }
    }
    if (delivered > 0) {
      db.prepare(`
        UPDATE push_outbox
        SET status = 'sent', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, last_error = NULL
        WHERE id = ?
      `).run(message.id);
      return { sent: true };
    }
    markFailed(message.id, errors.join(" | ") || "No se pudo entregar la notificacion");
    return { sent: false };
  }

  function markFailed(id, error) {
    db.prepare(`
      UPDATE push_outbox
      SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(String(error || "Error").slice(0, 1000), id);
  }

  return {
    enabled,
    publicConfig,
    upsertSubscription,
    removeSubscription,
    getUserSubscriptionState,
    queueCustomerNotification,
    flush
  };
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}
