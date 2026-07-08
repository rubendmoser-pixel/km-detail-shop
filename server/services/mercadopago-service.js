import { NotFoundError, ValidationError, positiveInteger } from "../domain/validation.js";
import { recordMercadoPagoPayment } from "./order-service.js";

const API_BASE = "https://api.mercadopago.com";
const PAYABLE_ORDER_STATUSES = new Set(["availability_confirmed", "confirmed", "in_preparation", "ready"]);

export async function createMercadoPagoPreference(db, orderId, customerId, config) {
  assertConfigured(config);
  const order = db.prepare(`
    SELECT o.*, c.business_name, c.contact_person, u.email
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN users u ON u.id = c.user_id
    WHERE o.id = ? AND o.customer_id = ?
  `).get(positiveInteger(orderId, "orderId"), positiveInteger(customerId, "customerId"));
  if (!order) throw new NotFoundError("Order not found");
  if (!PAYABLE_ORDER_STATUSES.has(order.status) || order.modified_acceptance_required) {
    throw new ValidationError("El pedido todavia no esta habilitado para pagar con Mercado Pago");
  }
  if (["paid", "settled_adjustment"].includes(order.payment_status) || order.fulfillment_status === "delivered") {
    throw new ValidationError("El pedido no tiene saldo pendiente");
  }
  if (order.payment_status === "receipt_uploaded") {
    throw new ValidationError("Hay un comprobante pendiente de revision");
  }
  const balanceCents = Math.max(0, Number(order.balance_cents || 0));
  if (!balanceCents) throw new ValidationError("El pedido no tiene saldo pendiente");

  const baseUrl = String(config.publicBaseUrl || "https://www.km-detail.com").replace(/\/$/, "");
  const preference = await mercadoPagoFetch(config, "/checkout/preferences", {
    method: "POST",
    body: {
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
    }
  });

  db.prepare(`
    INSERT INTO mercadopago_payments (order_id, preference_id, status, amount_cents, raw_json)
    VALUES (?, ?, 'preference_created', ?, ?)
  `).run(order.id, preference.id || "", balanceCents, JSON.stringify(preference));

  return {
    id: preference.id || "",
    initPoint: preference.init_point || "",
    sandboxInitPoint: preference.sandbox_init_point || ""
  };
}

export async function handleMercadoPagoWebhook(db, input, config) {
  assertConfigured(config);
  const paymentId = extractPaymentId(input);
  if (!paymentId) return { ignored: true, reason: "Sin payment id" };
  const payment = await mercadoPagoFetch(config, `/v1/payments/${encodeURIComponent(paymentId)}`);
  return { ignored: false, ...recordMercadoPagoPayment(db, normalizePayment(payment)) };
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
    throw new ValidationError(data.message || data.error || "Mercado Pago no respondio correctamente");
  }
  return data;
}

function assertConfigured(config) {
  if (!config?.mercadopagoAccessToken) {
    throw new ValidationError("Mercado Pago no esta configurado en el servidor");
  }
}

function extractPaymentId(input = {}) {
  const query = input.query || {};
  const body = input.body || {};
  if (query["data.id"]) return String(query["data.id"]);
  if (query.id && (query.topic === "payment" || query.type === "payment")) return String(query.id);
  if (body?.data?.id) return String(body.data.id);
  if (body?.id && (body.topic === "payment" || body.type === "payment")) return String(body.id);
  if (typeof body?.resource === "string") return body.resource.split("/").filter(Boolean).at(-1) || "";
  return "";
}

function normalizePayment(payment) {
  return {
    orderId: Number(payment?.metadata?.order_id || 0),
    orderNumber: payment?.external_reference || payment?.metadata?.order_number || "",
    paymentId: String(payment?.id || ""),
    preferenceId: payment?.preference_id || "",
    status: payment?.status || "",
    statusDetail: payment?.status_detail || "",
    amountCents: Math.round(Number(payment?.transaction_amount || 0) * 100),
    raw: payment
  };
}
