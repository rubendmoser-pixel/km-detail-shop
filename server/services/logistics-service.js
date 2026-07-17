import { AuthError, NotFoundError, ValidationError, normalizeEmail, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import { createSessionToken, hashPassword, hashToken, verifyPassword } from "../security.js";
import { confirmOrderAvailability, createPickingList, createShippingLabels, getOrder, updateOrderFulfillment } from "./order-service.js";

const PAYMENT_READY = new Set(["paid", "credit_account", "settled_adjustment"]);

export function listLogisticsOperators(db) {
  return db.prepare(`
    SELECT id, name, email, phone, status, notes, created_at, updated_at,
           CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM logistics_operators ORDER BY status = 'active' DESC, name COLLATE NOCASE
  `).all();
}

export async function upsertLogisticsOperator(db, input = {}) {
  const id = Number(input.id || 0);
  const existing = id ? db.prepare("SELECT id, password_hash FROM logistics_operators WHERE id = ?").get(id) : null;
  if (id && !existing) throw new NotFoundError("Operario no encontrado");
  const name = requiredText(input.name, "name", { min: 2, max: 160 });
  const email = normalizeEmail(input.email);
  const phone = optionalText(input.phone, "phone", { max: 60 });
  const status = input.status === "inactive" ? "inactive" : "active";
  const notes = optionalText(input.notes, "notes", { max: 1000 });
  const password = optionalText(input.portalPassword, "portalPassword", { max: 200 });
  const enabled = input.portalAccessEnabled !== false;
  if (enabled && !password && !existing?.password_hash) {
    throw new ValidationError("Ingresá una clave de al menos 10 caracteres para habilitar el acceso.", { field: "portalPassword", code: "required" });
  }
  let passwordHash = enabled ? (existing?.password_hash || "") : "";
  if (enabled && password) {
    try { passwordHash = await hashPassword(password); }
    catch { throw new ValidationError("La clave debe tener entre 10 y 200 caracteres.", { field: "portalPassword", code: "length" }); }
  }
  try {
    if (id) {
      db.prepare(`UPDATE logistics_operators SET name=?, email=?, phone=?, status=?, notes=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, email, phone, status, notes, passwordHash, id);
      if (status !== "active" || !passwordHash) db.prepare("DELETE FROM logistics_sessions WHERE operator_id = ?").run(id);
      return listLogisticsOperators(db).find((row) => row.id === id);
    }
    const row = db.prepare(`INSERT INTO logistics_operators (name,email,phone,status,notes,password_hash) VALUES (?,?,?,?,?,?) RETURNING id`)
      .get(name, email, phone, status, notes, passwordHash);
    return listLogisticsOperators(db).find((operator) => operator.id === row.id);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe un operario con ese email.", { field: "email", code: "duplicate" });
    throw error;
  }
}

export async function loginLogisticsOperator(db, input = {}, sessionDays = 30) {
  const email = normalizeEmail(input.email);
  const password = requiredText(input.password, "password", { min: 1, max: 200 });
  const row = db.prepare("SELECT * FROM logistics_operators WHERE email = ?").get(email);
  if (!row || row.status !== "active" || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("El email o la clave no son correctos.", 401);
  }
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO logistics_sessions (operator_id, token_hash, expires_at) VALUES (?,?,?)").run(row.id, tokenHash, expiresAt);
  return { operator: publicOperator(row), token, expiresAt };
}

export function authenticateLogisticsOperator(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT o.* FROM logistics_sessions s JOIN logistics_operators o ON o.id=s.operator_id
    WHERE s.token_hash=? AND s.expires_at>? AND o.status='active'`).get(hashToken(token), new Date().toISOString());
  return row ? publicOperator(row) : null;
}

export function requireLogisticsOperator(operator) {
  if (!operator) throw new AuthError("Iniciá sesión como operario de logística.", 401);
  return operator;
}

export function logoutLogisticsOperator(db, token) {
  if (token) db.prepare("DELETE FROM logistics_sessions WHERE token_hash=?").run(hashToken(token));
}

export function listLogisticsOrders(db, filters = {}) {
  const params = [];
  const scopeSql = filters.scope === "dispatched" ? "AND o.fulfillment_status = 'shipped'" : "AND o.fulfillment_status <> 'shipped'";
  let searchSql = "";
  if (filters.search) {
    searchSql = "AND (o.order_number LIKE ? OR c.business_name LIKE ? OR c.tax_id LIKE ?)";
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }
  return db.prepare(`SELECT o.*, c.business_name, c.contact_person, c.whatsapp, u.email AS customer_email,
      lo.name AS operator_name
    FROM orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=c.user_id
    LEFT JOIN logistics_operators lo ON lo.id=o.logistics_operator_id
    WHERE o.status NOT IN ('cancelled','delivered') AND o.fulfillment_status <> 'delivered' ${scopeSql} ${searchSql}
    ORDER BY CASE o.fulfillment_status WHEN 'ready' THEN 1 WHEN 'pending' THEN 2 WHEN 'shipped' THEN 3 ELSE 4 END, o.created_at
    LIMIT 500`).all(...params).map(logisticsOrderRow);
}

export function getLogisticsOrder(db, orderId) {
  const order = getOrder(db, positiveInteger(Number(orderId), "orderId"), null, true);
  const row = db.prepare(`SELECT logistics_status, logistics_operator_id, logistics_started_at, logistics_prepared_at,
      logistics_packed_at, logistics_labeled_at, logistics_ready_at, logistics_packages
    FROM orders WHERE id=?`).get(orderId);
  return sanitizeOrder({ ...order, logistics: mapLogistics(row) });
}

export function claimLogisticsOrder(db, orderId, operator) {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  assertLogisticsOpen(order);
  if (order.status !== "order_created" && (order.modified_acceptance_required || !PAYMENT_READY.has(order.payment_status))) {
    throw new ValidationError("El pedido todavía espera aceptación o aprobación administrativa.");
  }
  if (order.logistics_operator_id && Number(order.logistics_operator_id) !== Number(operator.id)) {
    throw new ValidationError("El pedido ya está asignado a otro operario.");
  }
  db.prepare(`UPDATE orders SET logistics_operator_id=?, logistics_status=CASE WHEN status='order_created' THEN logistics_status ELSE 'preparing' END,
      logistics_started_at=COALESCE(logistics_started_at,?), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(operator.id, new Date().toISOString(), orderId);
  addLogisticsEvent(db, orderId, operator, "logistics_claimed", "Pedido tomado por logística");
  return getLogisticsOrder(db, orderId);
}

export function confirmLogisticsAvailability(db, orderId, input, operator) {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (!order || order.status !== "order_created") throw new ValidationError("Este pedido ya no espera confirmación de disponibilidad.");
  if (order.logistics_operator_id && Number(order.logistics_operator_id) !== Number(operator.id)) throw new ValidationError("El pedido está asignado a otro operario.");
  db.prepare("UPDATE orders SET logistics_operator_id=? WHERE id=?").run(operator.id, orderId);
  const result = confirmOrderAvailability(db, orderId, { ...input, paymentCondition: "advance_payment" }, null);
  addLogisticsEvent(db, orderId, operator, "availability_confirmed", "Disponibilidad confirmada por logística");
  return sanitizeOrder(result);
}

export function updateLogisticsChecklist(db, orderId, input, operator) {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  assertAssignedAndReady(order, operator);
  const prepared = input.prepared === true;
  const packed = input.packed === true;
  const labeled = input.labeled === true;
  const packages = Math.max(1, Math.min(99, Number(input.packages || order.logistics_packages || 1)));
  const now = new Date().toISOString();
  db.prepare(`UPDATE orders SET logistics_status=?, logistics_prepared_at=CASE WHEN ? THEN COALESCE(logistics_prepared_at,?) ELSE NULL END,
    logistics_packed_at=CASE WHEN ? THEN COALESCE(logistics_packed_at,?) ELSE NULL END,
    logistics_labeled_at=CASE WHEN ? THEN COALESCE(logistics_labeled_at,?) ELSE NULL END,
    logistics_packages=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(prepared && packed && labeled ? "ready" : "preparing", prepared ? 1 : 0, now, packed ? 1 : 0, now, labeled ? 1 : 0, now, packages, orderId);
  if (prepared && packed && labeled && order.fulfillment_status === "pending") {
    updateOrderFulfillment(db, orderId, { fulfillmentStatus: "ready", fulfillmentNotes: "Pedido preparado, embalado y rotulado." }, null);
    db.prepare("UPDATE orders SET logistics_ready_at=? WHERE id=?").run(now, orderId);
  }
  addLogisticsEvent(db, orderId, operator, prepared && packed && labeled ? "logistics_ready" : "logistics_checklist", "Control de preparación actualizado");
  return getLogisticsOrder(db, orderId);
}

export function dispatchLogisticsOrder(db, orderId, input, operator) {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
  if (!order || order.fulfillment_status !== "ready") throw new ValidationError("El pedido debe estar preparado antes de despacharlo.");
  if (Number(order.logistics_operator_id || 0) !== Number(operator.id)) throw new ValidationError("Solo el operario asignado puede despachar este pedido.");
  const result = updateOrderFulfillment(db, orderId, { ...input, fulfillmentStatus: "shipped", reason: `Despachado por ${operator.name}` }, null);
  addLogisticsEvent(db, orderId, operator, "logistics_dispatched", "Pedido entregado al transporte o retirado");
  return sanitizeOrder(result);
}

export function logisticsPickingList(db, orderId) { return createPickingList(db, orderId); }
export function logisticsLabels(db, orderId) {
  const row = db.prepare("SELECT logistics_packages FROM orders WHERE id = ?").get(orderId);
  if (!row) throw new NotFoundError("Pedido no encontrado");
  return createShippingLabels(db, orderId, positiveInteger(Number(row.logistics_packages || 0), "packages"));
}
export function logisticsShippingRemit(db, orderId) {
  const order = getOrder(db, positiveInteger(Number(orderId), "orderId"), null, true);
  const logistics = db.prepare("SELECT logistics_packages FROM orders WHERE id = ?").get(orderId);
  const packages = positiveInteger(Number(logistics?.logistics_packages || 0), "packages");
  const items = order.items.map((item) => ({
    kmCode: item.kmCode,
    ean13: item.ean13,
    productName: item.productName,
    quantity: item.confirmedQuantity > 0 ? item.confirmedQuantity : item.quantity
  })).filter((item) => item.quantity > 0);
  return {
    generatedAt: new Date().toISOString(),
    order: {
      id: order.id, orderNumber: order.orderNumber, remitNumber: `REM-${order.orderNumber}`,
      businessName: order.businessName, contactPerson: order.contactPerson,
      customerWhatsapp: order.customerWhatsapp, email: order.email,
      shipping: order.shipping, fulfillment: order.fulfillment, packages,
      declaredValueCents: Math.round(Number(order.subtotalNetCents || 0) * 0.2), items
    }
  };
}

function publicOperator(row) { return { id: row.id, name: row.name, email: row.email, phone: row.phone || "", status: row.status }; }
function stageFor(row) {
  if (row.fulfillment_status === "shipped") return "in_transit";
  if (row.fulfillment_status === "ready") return "awaiting_dispatch";
  if (row.status === "order_created") return "review_availability";
  if (row.modified_acceptance_required) return "waiting_acceptance";
  if (!PAYMENT_READY.has(row.payment_status)) return "waiting_payment";
  if (row.logistics_status === "preparing") return "preparing";
  return "ready_to_prepare";
}
function logisticsOrderRow(row) {
  return { id: row.id, orderNumber: row.order_number, businessName: row.business_name, contactPerson: row.contact_person,
    whatsapp: row.whatsapp, createdAt: row.created_at, stage: stageFor(row), operatorId: row.logistics_operator_id,
    operatorName: row.operator_name || "", fulfillmentMethod: row.fulfillment_method || "", packages: row.logistics_packages || 1 };
}
function mapLogistics(row = {}) { return { status: row.logistics_status || "pending", operatorId: row.logistics_operator_id || null,
  startedAt: row.logistics_started_at, prepared: Boolean(row.logistics_prepared_at), packed: Boolean(row.logistics_packed_at),
  labeled: Boolean(row.logistics_labeled_at), readyAt: row.logistics_ready_at, packages: row.logistics_packages || 1 }; }
function sanitizeOrder(order) {
  return { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus,
    modifiedAcceptanceRequired: order.modifiedAcceptanceRequired, businessName: order.businessName, contactPerson: order.contactPerson,
    customerWhatsapp: order.customerWhatsapp, shipping: order.shipping, fulfillment: order.fulfillment, logistics: order.logistics,
    items: (order.items || []).map((item) => ({ id: item.id, kmCode: item.kmCode, ean13: item.ean13, productName: item.productName,
      warehouseLocation: item.warehouseLocation, quantity: item.quantity, confirmedQuantity: item.confirmedQuantity,
      lineStatus: item.lineStatus, availabilityNote: item.availabilityNote })) };
}
function assertLogisticsOpen(order) {
  if (!order) throw new NotFoundError("Pedido no encontrado");
  if (["cancelled", "delivered"].includes(order.status) || order.fulfillment_status === "delivered") throw new ValidationError("El pedido está cerrado.");
}
function assertAssignedAndReady(order, operator) {
  assertLogisticsOpen(order);
  if (Number(order.logistics_operator_id || 0) !== Number(operator.id)) throw new ValidationError("Primero tomá el pedido para comenzar la preparación.");
  if (order.modified_acceptance_required || !PAYMENT_READY.has(order.payment_status)) throw new ValidationError("El pedido todavía espera aceptación o aprobación comercial.");
}
function addLogisticsEvent(db, orderId, operator, type, reason) {
  db.prepare(`INSERT INTO order_events (order_id, actor_user_id, event_type, reason, before_json, after_json) VALUES (?,NULL,?,?,NULL,?)`)
    .run(orderId, type, `${reason}. Operario: ${operator.name} (${operator.email})`, JSON.stringify({ operatorId: operator.id, operatorName: operator.name }));
}
