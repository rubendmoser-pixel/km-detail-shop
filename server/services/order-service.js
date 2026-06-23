import { calculateLine, calculateOrderTotals } from "../domain/pricing.js";
import { NotFoundError, ValidationError, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import { transaction } from "../db.js";
import { getCustomerPricingContext } from "./customer-service.js";
import { getCommercialSettings } from "./settings-service.js";

export function createOrder(db, customerId, input) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("Order requires at least one item");
  if (input.items.length > 200) throw new ValidationError("Order contains too many items");

  const customer = getCustomerPricingContext(db, customerId);
  if (!customer || customer.approval_status !== "approved") throw new ValidationError("Customer is not approved");
  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps];
  const settings = getCommercialSettings(db);
  const shipping = validateShipping(input.shipping || {});

  return transaction(db, () => {
    const productQuery = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1");
    const seen = new Set();
    const lines = input.items.map((item, index) => {
      const productId = positiveInteger(item.productId, `items[${index}].productId`);
      const quantity = positiveInteger(item.quantity, `items[${index}].quantity`);
      if (seen.has(productId)) throw new ValidationError(`Product ${productId} appears more than once`);
      seen.add(productId);
      const product = productQuery.get(productId);
      if (!product) throw new NotFoundError(`Product ${productId} is unavailable`);
      return { product, ...calculateLine({ basePriceCents: product.base_price_cents, quantity, discountsBps: discounts }) };
    });
    const totals = calculateOrderTotals(lines, settings.vatBps);
    const now = new Date().toISOString();

    const order = db.prepare(`
      INSERT INTO orders (
        customer_id, status, payment_status, discount_1_bps, discount_2_bps, discount_3_bps,
        subtotal_net_cents, vat_bps, vat_cents, total_cents, bank_snapshot_json,
        shipping_snapshot_json, price_reserved_at, customer_accepted_at
      ) VALUES (?, 'order_created', 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      customerId, ...discounts, totals.subtotalNetCents, totals.vatBps, totals.vatCents,
      totals.totalCents, JSON.stringify(settings.bank), JSON.stringify(shipping), now, now
    );
    const orderNumber = `KM-${new Date().getUTCFullYear()}-${String(order.id).padStart(6, "0")}`;
    db.prepare("UPDATE orders SET order_number = ? WHERE id = ?").run(orderNumber, order.id);

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, km_code, ean13, product_name, quantity, base_price_cents,
        discount_1_bps, discount_2_bps, discount_3_bps, final_unit_price_cents, subtotal_net_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertItem.run(
        order.id, line.product.id, line.product.km_code, line.product.ean13, line.product.name,
        line.quantity, line.basePriceCents, ...discounts, line.finalUnitPriceCents, line.subtotalNetCents
      );
    }
    addOrderEvent(db, order.id, customer.user_id, "order_created", "", null, { orderNumber, totals });
    return getOrder(db, order.id, customerId, false);
  });
}

export function getOrder(db, orderId, customerId = null, isAdmin = false) {
  const order = db.prepare(`
    SELECT o.*, c.business_name, c.contact_person, c.whatsapp, u.email
    FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
    WHERE o.id = ?
  `).get(orderId);
  if (!order || (!isAdmin && order.customer_id !== customerId)) throw new NotFoundError("Order not found");
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
  return mapOrder(order, items);
}

export function listAdminOrders(db, status = "") {
  const where = status ? "WHERE o.status = ?" : "";
  const params = status ? [status] : [];
  return db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.currency,
           o.created_at, c.business_name, c.tax_id
    FROM orders o JOIN customers c ON c.id = o.customer_id
    ${where} ORDER BY o.created_at DESC
  `).all(...params);
}

export function updateOrderStatus(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  const status = input.status ? requiredText(input.status, "status", { max: 80 }) : order.status;
  const paymentStatus = input.paymentStatus ? requiredText(input.paymentStatus, "paymentStatus", { max: 80 }) : order.payment_status;
  const reason = requiredText(input.reason, "reason", { min: 3, max: 1000 });
  const updated = db.prepare(`
    UPDATE orders SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? RETURNING *
  `).get(status, paymentStatus, orderId);
  addOrderEvent(db, orderId, adminUserId, "status_updated", reason, order, updated);
  return getOrder(db, orderId, null, true);
}

export function acceptModifiedOrder(db, orderId, customerId, userId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?").get(orderId, customerId);
  if (!order) throw new NotFoundError("Order not found");
  if (!order.modified_acceptance_required) throw new ValidationError("Order does not require acceptance");
  const acceptedAt = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET modified_acceptance_required = 0, customer_accepted_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(acceptedAt, orderId);
  addOrderEvent(db, orderId, userId, "customer_reaccepted", "", order, { acceptedAt });
  return getOrder(db, orderId, customerId, false);
}

function validateShipping(input) {
  return {
    recipient: requiredText(input.recipient, "shipping.recipient"),
    address: requiredText(input.address, "shipping.address"),
    city: requiredText(input.city, "shipping.city"),
    province: requiredText(input.province, "shipping.province"),
    postalCode: requiredText(input.postalCode, "shipping.postalCode", { max: 20 }),
    preferredTransport: optionalText(input.preferredTransport, "shipping.preferredTransport"),
    contactPhone: requiredText(input.contactPhone, "shipping.contactPhone", { max: 50 }),
    notes: optionalText(input.notes, "shipping.notes")
  };
}

function addOrderEvent(db, orderId, actorUserId, eventType, reason, before, after) {
  db.prepare(`
    INSERT INTO order_events (order_id, actor_user_id, event_type, reason, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, actorUserId, eventType, reason, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

function mapOrder(order, items) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
    businessName: order.business_name,
    contactPerson: order.contact_person,
    customerWhatsapp: order.whatsapp,
    email: order.email,
    status: order.status,
    paymentStatus: order.payment_status,
    currency: order.currency,
    discountsBps: [order.discount_1_bps, order.discount_2_bps, order.discount_3_bps],
    subtotalNetCents: order.subtotal_net_cents,
    vatBps: order.vat_bps,
    vatCents: order.vat_cents,
    totalCents: order.total_cents,
    bank: JSON.parse(order.bank_snapshot_json),
    shipping: JSON.parse(order.shipping_snapshot_json),
    priceReservedAt: order.price_reserved_at,
    customerAcceptedAt: order.customer_accepted_at,
    modifiedAcceptanceRequired: Boolean(order.modified_acceptance_required),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      kmCode: item.km_code,
      ean13: item.ean13,
      productName: item.product_name,
      quantity: item.quantity,
      basePriceCents: item.base_price_cents,
      discountsBps: [item.discount_1_bps, item.discount_2_bps, item.discount_3_bps],
      finalUnitPriceCents: item.final_unit_price_cents,
      subtotalNetCents: item.subtotal_net_cents
    }))
  };
}
