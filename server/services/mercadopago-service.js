import { NotFoundError, ValidationError, positiveInteger } from "../domain/validation.js";
import { recordMercadoPagoPayment } from "./order-service.js";

const API_BASE = "https://api.mercadopago.com";

export async function createMercadoPagoPreference(db, orderId, customerId, config) {
  assertMercadoPagoConfigured(config);
  const order = db.prepare(`
    SELECT o.*, c.business_name, c.contact_person, c.whatsapp, u.email
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    WHERE o.id = ? AND o.customer_id = ?
  `).get(positiveInteger(orderId, "orderId"), positiveInteger(customerId, "customerId"));
  if (!order) throw new NotFoundError("Order not found");
  if (order.status === "cancelled" || order.fulfillment_status === "delivered") {
    throw new ValidationError("Closed orders cannot be paid with Mercado Pago");
  }
  if (!["availability_confirmed", "confirmed", "in_preparation", "ready"].includes(order.status)) {
    throw new ValidationError("Availability must be confirmed before paying with Mercado Pago");
  }
  const balanceCents = Math.max(0, Number(order.balance_cents || 0));
  if (balanceCents <= 0 || ["paid", "settled_adjustment"].includes(order.payment_status)) {
    throw new ValidationError("Order has no pending balance");
  }

  const baseUrl = String(config.publicBaseUrl || "https://www.km-detail.com").replace(/\/$/, "");
  const payload = {
    external_reference: order.order_number,
    notification_url: `${baseUrl}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${baseUrl}/#mis-compras`,
      pending: `${baseUrl}/#mis-compras`,
      failure: `${baseUrl}/#mis-compras`
    },
    auto_return: "approved",
    metadata: {
      order_id: order.id,
      order_number: order.order_number
    },
    payer: {
      email: order.email,
      name: order.contact_person || order.business_name
    },
    items: [{
      id: order.order_number,
      title: `Pedido ${order.order_number} - KM Detail Line`,
      description: "Pedido comercial KM Detail Line",
      quantity: 1,
      currency_id: "ARS",
      unit_price: Number((balanceCents / 100).toFixed(2))
    }]
  };

  const preference = await mercadoPagoFetch(config, "/checkout/preferences", {
    method: "POST",
    body: payload
  });
  db.prepare(`
    INSERT INTO mercadopago_payments (order_id, preference_id, status, amount_cents, raw_json)
    VALUES (?, ?, 'preference_created', ?, ?)
  `).run(order.id, preference.id || "", balanceCents, JSON.stringify(preference));
  return {
    id: preference.id,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point
  };
}

export async function handleMercadoPagoWebhook(db, input, config) {
  assertMercadoPagoConfigured(config);
  const paymentId = extractPaymentId(input);
  if (!paymentId) return { ignored: true, reason: "No payment id" };
  const payment = await mercadoPagoFetch(config, `/v1/payments/${encodeURIComponent(paymentId)}`);
  const result = recordMercadoPagoPayment(db, normalizePayment(payment));
  return { ignored: false, ...result };
}

export function publicMercadoPagoConfig(config) {
  return { enabled: Boolean(config?.mercadopagoAccessToken) };
}

async function mercadoPagoFetch(config, path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "authorization": `Bearer ${config.mercadopagoAccessToken}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ValidationError(data.message || data.error || "Mercado Pago request failed");
  }
  return data;
}

function assertMercadoPagoConfigured(config) {
  if (!config?.mercadopagoAccessToken) {
    throw new ValidationError("Mercado Pago is not configured");
  }
}

function extractPaymentId(input = {}) {
  const query = input.query || {};
  const body = input.body || input;
  if (query["data.id"]) return String(query["data.id"]);
  if (query.id && (query.topic === "payment" || query.type === "payment")) return String(query.id);
  if (body?.data?.id) return String(body.data.id);
  if (body?.id && (body.topic === "payment" || body.type === "payment")) return String(body.id);
  if (typeof body?.resource === "string") return body.resource.split("/").filter(Boolean).at(-1) || "";
  return "";
}

function normalizePayment(payment) {
  const orderId = Number(payment?.metadata?.order_id || 0);
  return {
    orderId,
    orderNumber: payment?.external_reference || payment?.metadata?.order_number || "",
    paymentId: String(payment?.id || ""),
    preferenceId: payment?.preference_id || "",
    status: payment?.status || "",
    statusDetail: payment?.status_detail || "",
    amountCents: Math.round(Number(payment?.transaction_amount || 0) * 100),
    raw: payment
  };
}
