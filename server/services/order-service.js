import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateLine, calculateOrderTotals } from "../domain/pricing.js";
import { NotFoundError, ValidationError, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import { transaction } from "../db.js";
import { activeCustomerProductDiscountsByProduct, getCustomerPricingContext } from "./customer-service.js";
import { resolveCustomerSalesRep } from "./sales-rep-service.js";
import { getCommercialSettings } from "./settings-service.js";
import { getShippingAddress } from "./shipping-address-service.js";
import { activeCustomerProductSpecialDiscount, activeProductPromotion } from "./product-service.js";
import { normalizePaymentSnapshot, resolvePaymentAccountsForCustomer } from "./payment-account-service.js";
import { getProductionCosts } from "./production-cost-service.js";

const RECEIPT_MIME_EXTENSIONS = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"]
]);
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const DELETE_TEST_ORDERS_CONFIRMATION = "BORRAR PEDIDOS";
const ORDER_EMAIL_EVENTS = [
  "order_internal",
  "order_customer",
  "order_sales_rep",
  "order_status_customer",
  "order_availability_customer",
  "order_availability_sales_rep",
  "payment_receipt_internal",
  "payment_receipt_customer",
  "payment_receipt_sales_rep",
  "payment_terms_customer",
  "payment_terms_sales_rep",
  "order_fulfillment_customer",
  "order_fulfillment_sales_rep",
  "payment_due_today",
  "payment_due_soon",
  "payment_overdue",
  "payment_overdue_48",
  "payment_overdue_72",
  "payment_overdue_7",
  "payment_overdue_followup"
];
const ORDER_STATUSES = new Set([
  "order_created",
  "availability_confirmed",
  "confirmed",
  "in_preparation",
  "ready",
  "delivered",
  "cancelled"
]);
const PAYMENT_STATUSES = new Set([
  "pending_payment",
  "receipt_uploaded",
  "credit_account",
  "settled_adjustment",
  "overdue",
  "paid",
  "rejected",
  "refunded"
]);
const FULFILLMENT_STATUSES = new Set(["pending", "ready", "shipped", "delivered"]);
const AVAILABILITY_CONFIRMED_STATUSES = new Set(["availability_confirmed", "confirmed", "in_preparation", "ready"]);
const PAYMENT_STATUSES_ALLOWING_FULFILLMENT = new Set(["paid", "credit_account", "settled_adjustment"]);
const MANUAL_ACCOUNT_PAYMENT_METHODS = new Set(["bank_transfer", "cash", "physical_check", "e_check"]);
const MANUAL_ACCOUNT_PAYMENT_LABELS = {
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  physical_check: "Cheque fisico",
  e_check: "E-cheq"
};
const UNFULFILLED_REASON_LABELS = {
  finished_stock_shortage: "Falta de producto terminado",
  material_shortage: "Falta de insumos para fabricar",
  production_delay: "Producción demorada",
  discontinued: "Producto discontinuado",
  commercial_agreement: "Cantidad corregida por acuerdo comercial",
  order_error: "Error en el pedido",
  other: "Otro motivo"
};

export function createOrder(db, customerId, input = {}) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("Order requires at least one item");
  if (input.items.length > 200) throw new ValidationError("Order contains too many items");

  const customer = getCustomerPricingContext(db, customerId);
  if (!customer || customer.approval_status !== "approved") throw new ValidationError("Customer is not approved");
  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps];
  const requestedPaymentCondition = normalizePaymentCondition(customer.payment_condition || "advance_payment");
  const requestedPaymentTermsDays = requestedPaymentCondition === "credit_account"
    ? normalizeCustomerDefaultTermsDays(customer.payment_terms_days)
    : 0;
  const salesRep = resolveCustomerSalesRep(db, customerId);
  const createdByRole = normalizeOrderOriginRole(input.createdByRole);
  const createdBySalesRepId = createdByRole === "sales_rep"
    ? positiveInteger(Number(input.createdBySalesRepId), "createdBySalesRepId")
    : null;
  const settings = getCommercialSettings(db);
  const paymentAccounts = resolvePaymentAccountsForCustomer(db, customerId);
  const shipping = input.shippingAddressId
    ? shippingFromAddress(getShippingAddress(db, customerId, positiveInteger(Number(input.shippingAddressId), "shippingAddressId")))
    : validateShipping(input.shipping || {});

  return transaction(db, () => {
    const productQuery = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1");
    const specialDiscountsByProduct = activeCustomerProductDiscountsByProduct(db, customerId);
    const seen = new Set();
    const lines = input.items.map((item, index) => {
      const productId = positiveInteger(item.productId, `items[${index}].productId`);
      const quantity = positiveInteger(item.quantity, `items[${index}].quantity`);
      if (seen.has(productId)) throw new ValidationError(`Product ${productId} appears more than once`);
      seen.add(productId);
      const product = productQuery.get(productId);
      if (!product) throw new NotFoundError(`Product ${productId} is unavailable`);
      const promotion = activeProductPromotion(product);
      const specialDiscount = activeCustomerProductSpecialDiscount(product, specialDiscountsByProduct);
      return {
        product,
        promotion,
        specialDiscount,
        ...calculateLine({ basePriceCents: product.base_price_cents, quantity, discountsBps: [...discounts, specialDiscount.bps, promotion.bps] })
      };
    });
    const totals = calculateOrderTotals(lines, settings.vatBps);
    const commissionCents = calculateCommission(totals.subtotalNetCents, salesRep.commissionBps);
    const now = new Date().toISOString();

    const order = db.prepare(`
      INSERT INTO orders (
        customer_id, status, payment_status, discount_1_bps, discount_2_bps, discount_3_bps,
        commercial_class, created_by_role, created_by_sales_rep_id,
        sales_rep_id, sales_rep_name, sales_rep_email, sales_commission_bps,
        sales_commission_base_cents, sales_commission_cents,
        subtotal_net_cents, vat_bps, vat_cents, total_cents, paid_cents, balance_cents, bank_snapshot_json,
        requested_payment_condition, payment_terms_days, shipping_snapshot_json, price_reserved_at, customer_accepted_at
      ) VALUES (?, 'order_created', 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      customerId, ...discounts,
      customer.commercial_class || "B", createdByRole, createdBySalesRepId,
      salesRep.id, salesRep.name, salesRep.email, salesRep.commissionBps,
      totals.subtotalNetCents, commissionCents,
      totals.subtotalNetCents, totals.vatBps, totals.vatCents,
      totals.totalCents, 0, totals.totalCents, JSON.stringify(paymentAccounts),
      requestedPaymentCondition, requestedPaymentTermsDays, JSON.stringify(shipping), now, now
    );
    const orderNumber = `KM-${new Date().getUTCFullYear()}-${String(order.id).padStart(6, "0")}`;
    db.prepare("UPDATE orders SET order_number = ? WHERE id = ?").run(orderNumber, order.id);

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, km_code, ean13, product_name, warehouse_location, quantity, base_price_cents,
        discount_1_bps, discount_2_bps, discount_3_bps, special_discount_bps, special_discount_note, promotion_bps, promotion_label,
        final_unit_price_cents, subtotal_net_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertItem.run(
        order.id, line.product.id, line.product.km_code, line.product.ean13, line.product.name, line.product.warehouse_location || "",
        line.quantity, line.basePriceCents, ...discounts, line.specialDiscount.bps, line.specialDiscount.note || "",
        line.promotion.bps, line.promotion.label || "",
        line.finalUnitPriceCents, line.subtotalNetCents
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
  const receipts = db.prepare("SELECT * FROM payment_receipts WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(orderId);
  const events = isAdmin ? db.prepare(`
    SELECT e.id, e.event_type, e.reason, e.created_at, u.email AS actor_email, u.role AS actor_role
    FROM order_events e
    LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE e.order_id = ?
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 40
  `).all(orderId) : [];
  const mercadoPagoPayments = listMercadoPagoPayments(db, order.id);
  const accountPayments = listAccountPayments(db, order.id);
  return mapOrder(order, items, receipts, events, mercadoPagoPayments, accountPayments);
}

export function createShippingLabels(db, orderId, packageCount) {
  const order = getOrder(db, orderId, null, true);
  const packages = normalizePackageCount(packageCount);
  const labelItems = order.items
    .filter((item) => item.confirmedQuantity > 0 || order.status === "order_created")
    .map((item) => ({
      kmCode: item.kmCode,
      productName: item.productName,
      quantity: item.confirmedQuantity > 0 ? item.confirmedQuantity : item.quantity
    }));
  return {
    generatedAt: new Date().toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      businessName: order.businessName,
      contactPerson: order.contactPerson,
      customerWhatsapp: order.customerWhatsapp,
      email: order.email,
      shipping: order.shipping,
      fulfillment: order.fulfillment,
      items: labelItems
    },
    packages: Array.from({ length: packages }, (_, index) => ({
      number: index + 1,
      total: packages,
      code: `${order.orderNumber}-B${String(index + 1).padStart(2, "0")}-${String(packages).padStart(2, "0")}`
    }))
  };
}

export function createPickingList(db, orderId) {
  const order = getOrder(db, orderId, null, true);
  const locations = db.prepare(`
    SELECT oi.id, COALESCE(NULLIF(oi.warehouse_location, ''), p.warehouse_location, '') AS warehouse_location
    FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).all(orderId);
  const locationByItemId = new Map(locations.map((item) => [item.id, item.warehouse_location || "Sin ubicacion"]));
  const items = order.items
    .map((item) => ({
      ...item,
      pickQuantity: item.confirmedQuantity > 0 ? item.confirmedQuantity : item.quantity,
      warehouseLocation: locationByItemId.get(item.id) || "Sin ubicacion"
    }))
    .filter((item) => item.pickQuantity > 0)
    .sort((a, b) => a.warehouseLocation.localeCompare(b.warehouseLocation, "es") || a.kmCode.localeCompare(b.kmCode, "es"));

  return {
    generatedAt: new Date().toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      businessName: order.businessName,
      contactPerson: order.contactPerson,
      customerWhatsapp: order.customerWhatsapp,
      email: order.email,
      shipping: order.shipping,
      fulfillment: order.fulfillment,
      totalCents: order.totalCents,
      currency: order.currency,
      items
    }
  };
}

export function createDeliveryNote(db, orderId) {
  const order = getOrder(db, orderId, null, true);
  const items = order.items
    .map((item) => {
      const quantity = item.confirmedQuantity > 0 ? item.confirmedQuantity : item.quantity;
      const subtotalNetCents = item.confirmedQuantity > 0 ? item.confirmedSubtotalNetCents : item.subtotalNetCents;
      return {
        kmCode: item.kmCode,
        ean13: item.ean13,
        productName: item.productName,
        quantity,
        unitPriceCents: item.finalUnitPriceCents,
        subtotalNetCents,
        availabilityNote: item.availabilityNote || ""
      };
    })
    .filter((item) => item.quantity > 0);

  return {
    generatedAt: new Date().toISOString(),
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      businessName: order.businessName,
      contactPerson: order.contactPerson,
      customerWhatsapp: order.customerWhatsapp,
      email: order.email,
      shipping: order.shipping,
      fulfillment: order.fulfillment,
      currency: order.currency,
      subtotalNetCents: order.subtotalNetCents,
      vatBps: order.vatBps,
      vatCents: order.vatCents,
      totalCents: order.totalCents,
      items
    }
  };
}

export function listCustomerOrders(db, customerId) {
  return db.prepare(`
    SELECT o.*, c.business_name, c.contact_person, c.whatsapp, u.email
    FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
    WHERE o.customer_id = ?
    ORDER BY o.created_at DESC
    LIMIT 100
  `).all(customerId).map((order) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(order.id);
    const receipts = db.prepare("SELECT * FROM payment_receipts WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(order.id);
    const mercadoPagoPayments = listMercadoPagoPayments(db, order.id);
    const accountPayments = listAccountPayments(db, order.id);
    return mapOrder(order, items, receipts, [], mercadoPagoPayments, accountPayments);
  });
}

export function listAdminOrders(db, filters = {}) {
  const where = [];
  const params = [];
  if (filters.scope === "history") {
    where.push("(o.status IN ('delivered', 'cancelled') OR o.fulfillment_status = 'delivered')");
  } else {
    where.push("(o.status NOT IN ('delivered', 'cancelled') AND COALESCE(o.fulfillment_status, 'pending') <> 'delivered')");
  }
  if (filters.paymentStatus) {
    where.push("o.payment_status = ?");
    params.push(filters.paymentStatus);
  }
  if (filters.search) {
    where.push("(o.order_number LIKE ? OR c.business_name LIKE ? OR c.tax_id LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.paid_cents, o.balance_cents,
           o.payment_due_date, o.currency, o.commercial_class,
           o.created_by_role, o.created_by_sales_rep_id, o.sales_rep_name, o.sales_rep_email,
           o.fulfillment_status, o.logistics_status, o.modified_acceptance_required, o.created_at, c.business_name, c.tax_id
    FROM orders o JOIN customers c ON c.id = o.customer_id
    ${whereSql} ORDER BY o.created_at DESC
    LIMIT 500
  `).all(...params)
    .map((order) => ({ ...order, stage: orderOperationalStage(order) }))
    .filter((order) => !filters.stage || order.stage === filters.stage);
}

export function countAdminOrderScopes(db) {
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status NOT IN ('delivered', 'cancelled') AND COALESCE(fulfillment_status, 'pending') <> 'delivered' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status IN ('delivered', 'cancelled') OR fulfillment_status = 'delivered' THEN 1 ELSE 0 END) AS history
    FROM orders
  `).get();
  return {
    active: Number(counts.active || 0),
    history: Number(counts.history || 0)
  };
}

export function orderOperationalStage(order) {
  const fulfillmentStatus = order.fulfillment_status || "pending";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "delivered" || fulfillmentStatus === "delivered") return "delivered";
  if (fulfillmentStatus === "shipped") return "shipped";
  if (fulfillmentStatus === "ready") return "prepared";
  if (order.status === "order_created") return "review_availability";
  if (Boolean(order.modified_acceptance_required)) return "awaiting_acceptance";
  if (!PAYMENT_STATUSES_ALLOWING_FULFILLMENT.has(normalizePaymentStatus(order.payment_status))) return "awaiting_payment";
  if (order.logistics_status === "preparing") return "preparing";
  return "ready_to_prepare";
}

export function updateOrderStatus(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  const status = input.status ? requiredText(input.status, "status", { max: 80 }) : order.status;
  const paymentStatus = normalizePaymentStatus(input.paymentStatus ? requiredText(input.paymentStatus, "paymentStatus", { max: 80 }) : order.payment_status);
  const reason = requiredText(input.reason, "reason", { min: 3, max: 1000 });
  assertManualOrderState(order, status, paymentStatus);
  const updated = db.prepare(`
    UPDATE orders SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? RETURNING *
  `).get(status, paymentStatus, orderId);
  addOrderEvent(db, orderId, adminUserId, "status_updated", reason, order, updated);
  return getOrder(db, orderId, null, true);
}

export function confirmOrderAvailability(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  assertOrderOpen(order, "Availability cannot be confirmed");
  if (order.status !== "order_created") {
    throw new ValidationError("Availability can only be confirmed for received orders");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("items are required");
  const reason = optionalText(input.reason, "reason", { max: 1000 });
  const paymentCondition = normalizePaymentCondition(optionalText(input.paymentCondition, "paymentCondition", { max: 40 }) || order.requested_payment_condition || "advance_payment");
  const fallbackTermsDays = input.paymentTermsDays === undefined || input.paymentTermsDays === null || input.paymentTermsDays === ""
    ? order.payment_terms_days
    : input.paymentTermsDays;
  const termsDays = paymentCondition === "credit_account" ? normalizeTermsDays(fallbackTermsDays) : 0;
  if (paymentCondition === "credit_account" && !termsDays) {
    throw new ValidationError("paymentTermsDays is required for credit account");
  }

  return transaction(db, () => {
    const currentItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
    const costsByProduct = new Map(getProductionCosts(db).products.map((cost) => [Number(cost.productId), cost]));
    const currentById = new Map(currentItems.map((item) => [item.id, item]));
    let requiresCustomerAcceptance = false;
    const updateItem = db.prepare(`
      UPDATE order_items SET confirmed_quantity = ?, confirmed_subtotal_net_cents = ?,
        line_status = ?, availability_note = ?, unfulfilled_reason_code = ?, industrial_unit_cost_cents = ?,
        industrial_material_cost_cents = ?, industrial_labor_cost_cents = ?,
        industrial_production_commission_cents = ?, industrial_cost_complete = ?,
        industrial_cost_snapshot_at = CURRENT_TIMESTAMP
      WHERE id = ? AND order_id = ?
    `);
    let confirmedSubtotalNetCents = 0;
    for (const itemInput of input.items) {
      const itemId = positiveInteger(itemInput.id, "items[].id");
      const item = currentById.get(itemId);
      if (!item) throw new ValidationError(`Order item ${itemId} is invalid`);
      const confirmedQuantity = normalizeConfirmedQuantity(itemInput.confirmedQuantity, item.quantity);
      const confirmedSubtotal = item.final_unit_price_cents * confirmedQuantity;
      const lineStatus = lineStatusFor(item.quantity, confirmedQuantity, itemInput.lineStatus);
      const note = optionalText(itemInput.availabilityNote, "availabilityNote", { max: 500 });
      const unfulfilledReasonCode = normalizeUnfulfilledReason(itemInput.unfulfilledReasonCode, confirmedQuantity < item.quantity, note);
      const cost = costsByProduct.get(Number(item.product_id));
      if (confirmedQuantity !== item.quantity) requiresCustomerAcceptance = true;
      confirmedSubtotalNetCents += confirmedSubtotal;
      updateItem.run(
        confirmedQuantity, confirmedSubtotal, lineStatus, note, unfulfilledReasonCode,
        cost ? Math.round(Number(cost.totalCostArs || 0) * 100) : null,
        cost ? Math.round(Number(cost.materialCostArs || 0) * 100) : null,
        cost ? Math.round(Number(cost.laborCostArs || 0) * 100) : null,
        cost ? Math.round(Number(cost.commissionArs || 0) * 100) : null,
        cost?.complete ? 1 : 0,
        item.id, orderId
      );
    }
    const vatCents = Math.round(confirmedSubtotalNetCents * order.vat_bps / 10_000);
    const totalCents = confirmedSubtotalNetCents + vatCents;
    const commissionCents = calculateCommission(confirmedSubtotalNetCents, order.sales_commission_bps || 0);
    const adjustmentOrder = {
      ...order,
      subtotal_net_cents: confirmedSubtotalNetCents,
      vat_cents: vatCents,
      total_cents: totalCents,
      commercial_adjustment_cents: 0
    };
    const commercialAdjustmentCents = expectedCommercialAdjustmentCents(adjustmentOrder);
    const newStatus = confirmedSubtotalNetCents > 0 ? "availability_confirmed" : "cancelled";
    const dueDate = confirmedSubtotalNetCents > 0 && paymentCondition === "credit_account"
      ? addDaysIsoDate(new Date(), termsDays)
      : "";
    const paidCents = order.payment_status === "paid" ? Math.max(0, totalCents - commercialAdjustmentCents) : 0;
    const balanceCents = clientPayableBalanceCents({
      ...adjustmentOrder,
      paid_cents: paidCents,
      commercial_adjustment_cents: commercialAdjustmentCents
    });
    const paymentStatus = confirmedSubtotalNetCents <= 0
      ? order.payment_status
      : paymentCondition === "credit_account" ? "credit_account" : "pending_payment";
    db.prepare(`
      UPDATE orders SET status = ?, subtotal_net_cents = ?, vat_cents = ?, total_cents = ?,
        sales_commission_base_cents = ?, sales_commission_cents = ?,
        commercial_adjustment_cents = ?, commercial_adjustment_reason = ?,
        payment_status = ?, paid_cents = ?, balance_cents = ?,
        payment_terms_days = ?, payment_due_date = ?,
        credit_authorized_at = CASE WHEN ? THEN ? ELSE credit_authorized_at END,
        credit_authorized_by = CASE WHEN ? THEN ? ELSE credit_authorized_by END,
        due_reminder_sent_at = NULL, overdue_reminder_sent_date = '',
        payment_reminder_stage = '', payment_reminder_last_sent_date = '',
        modified_acceptance_required = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newStatus, confirmedSubtotalNetCents, vatCents, totalCents,
      confirmedSubtotalNetCents, commissionCents,
      commercialAdjustmentCents,
      commercialAdjustmentCents > 0 ? "Ajuste comercial interno por condicion N" : "",
      paymentStatus, paidCents, balanceCents,
      termsDays, dueDate,
      paymentCondition === "credit_account" ? 1 : 0, new Date().toISOString(),
      paymentCondition === "credit_account" ? 1 : 0, adminUserId,
      requiresCustomerAcceptance ? 1 : 0,
      orderId
    );
    addOrderEvent(db, orderId, adminUserId, "availability_confirmed", reason, { order, items: currentItems }, {
      subtotalNetCents: confirmedSubtotalNetCents,
      vatCents,
      totalCents,
      paymentCondition,
      commercialAdjustmentCents,
      requiresCustomerAcceptance,
      paymentDueDate: dueDate,
      paymentTermsDays: termsDays
    });
    return getOrder(db, orderId, null, true);
  });
}

export function addPaymentReceipt(db, orderId, customerId, userId, input, uploadsPath) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?").get(orderId, customerId);
  if (!order) throw new NotFoundError("Order not found");
  if (!["availability_confirmed", "confirmed"].includes(order.status)) {
    throw new ValidationError("Order availability must be confirmed before uploading a receipt");
  }
  const originalFilename = requiredText(input.originalFilename, "originalFilename", { max: 180 });
  const mimeType = requiredText(input.mimeType, "mimeType", { max: 40 }).toLowerCase();
  const extension = RECEIPT_MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new ValidationError("mimeType must be application/pdf, image/jpeg or image/png");
  const base64 = requiredText(input.dataBase64, "dataBase64", { max: 12_000_000 }).replace(/^data:[^;]+;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES) throw new ValidationError("receipt must be between 1 byte and 8 MB");
  const receiptsPath = path.join(uploadsPath, "receipts");
  fs.mkdirSync(receiptsPath, { recursive: true });
  const storedFilename = `${order.order_number.toLowerCase()}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
  fs.writeFileSync(path.join(receiptsPath, storedFilename), bytes);
  const receipt = db.prepare(`
    INSERT INTO payment_receipts (order_id, uploaded_by, original_filename, stored_filename, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(orderId, userId, originalFilename, storedFilename, mimeType, bytes.length);
  db.prepare("UPDATE orders SET payment_status = 'receipt_uploaded', payment_method = 'bank_transfer', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orderId);
  addOrderEvent(db, orderId, userId, "payment_receipt_uploaded", "", null, { receiptId: receipt.id });
  return getOrder(db, orderId, customerId, false);
}

export function reviewPaymentReceipt(db, receiptId, input, adminUserId) {
  const receipt = db.prepare("SELECT * FROM payment_receipts WHERE id = ?").get(receiptId);
  if (!receipt) throw new NotFoundError("Payment receipt not found");
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(receipt.order_id);
  if (!order) throw new NotFoundError("Order not found");
  const status = requiredText(input.status, "status", { max: 30 });
  if (!["accepted", "rejected"].includes(status)) throw new ValidationError("status must be accepted or rejected");
  const reason = optionalText(input.reason, "reason", { max: 1000 });
  const adjustmentCents = resolvedCommercialAdjustmentCents(order);
  const pendingBeforeReview = clientPayableBalanceCents({
    ...order,
    paid_cents: sumAcceptedPayments(db, receipt.order_id),
    commercial_adjustment_cents: adjustmentCents
  });
  const requestedAmount = input.amountCents ?? input.amount ?? pendingBeforeReview;
  const amountCents = status === "accepted"
    ? normalizeMoneyCents(requestedAmount, "amountCents", order.total_cents)
    : 0;
  if (status === "accepted" && amountCents > pendingBeforeReview) {
    throw new ValidationError("amountCents cannot exceed pending balance");
  }
  const termsDays = normalizeTermsDays(input.paymentTermsDays);
  const dueDate = normalizeDueDate(input.paymentDueDate);
  const calculatedDueDate = dueDate || (termsDays ? addDaysIsoDate(new Date(), termsDays) : "");
  const expectedBalanceCents = Math.max(0, pendingBeforeReview - amountCents);
  if (status === "accepted" && expectedBalanceCents > 0 && !calculatedDueDate) {
    throw new ValidationError("paymentTermsDays is required when a payment leaves pending balance");
  }
  return transaction(db, () => {
    db.prepare(`
      UPDATE payment_receipts
      SET status = ?, amount_cents = ?, review_reason = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ?
    `).run(status, amountCents, reason, new Date().toISOString(), adminUserId, receiptId);
    const paidCents = sumAcceptedPayments(db, receipt.order_id);
    const balanceCents = clientPayableBalanceCents({
      ...order,
      paid_cents: paidCents,
      commercial_adjustment_cents: adjustmentCents
    });
    const paymentStatus = status === "rejected"
      ? "rejected"
      : balanceCents === 0 ? paymentStatusForClosedBalance(adjustmentCents) : "credit_account";
    updateOrderCommercialBalance(db, receipt.order_id, {
      paymentStatus,
      paidCents,
      balanceCents,
      termsDays,
      dueDate: balanceCents > 0 ? calculatedDueDate : "",
      creditAuthorized: false,
      commercialAdjustmentCents: adjustmentCents,
      adjustmentReason: adjustmentCents > 0 ? "Ajuste comercial interno por condicion N" : "",
      adminUserId
    });
    addOrderEvent(db, receipt.order_id, adminUserId, "payment_receipt_reviewed", reason, receipt, {
      status, amountCents, paidCents, balanceCents, paymentStatus, paymentDueDate: calculatedDueDate, paymentTermsDays: termsDays
    });
    return getOrder(db, receipt.order_id, null, true);
  });
}

export function recordMercadoPagoPayment(db, input = {}) {
  ensureMercadoPagoPaymentStorage(db);
  const paymentId = requiredText(input.paymentId, "paymentId", { max: 120 });
  const status = requiredText(input.status, "status", { max: 80 });
  const statusDetail = optionalText(input.statusDetail, "statusDetail", { max: 160 });
  const amountCents = normalizeMoneyCents(input.amountCents || 0, "amountCents", 2_000_000_000);
  const order = resolveMercadoPagoOrder(db, input);
  const existing = db.prepare("SELECT * FROM mercadopago_payments WHERE payment_id = ?").get(paymentId);
  const rawJson = JSON.stringify(input.raw || {});
  return transaction(db, () => {
    if (existing) {
      db.prepare(`
        UPDATE mercadopago_payments
        SET status = ?, status_detail = ?, amount_cents = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, statusDetail, amountCents, rawJson, existing.id);
    } else {
      db.prepare(`
        INSERT INTO mercadopago_payments (order_id, preference_id, payment_id, status, status_detail, amount_cents, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(order.id, input.preferenceId || "", paymentId, status, statusDetail, amountCents, rawJson);
    }

    const newlyApproved = status === "approved" && existing?.status !== "approved";
    if (newlyApproved) {
      const paidCents = sumAcceptedPayments(db, order.id);
      const commercialAdjustmentCents = resolvedCommercialAdjustmentCents(order);
      const balanceCents = clientPayableBalanceCents({ ...order, paid_cents: paidCents, commercial_adjustment_cents: commercialAdjustmentCents });
      const paymentStatus = balanceCents === 0 ? paymentStatusForClosedBalance(commercialAdjustmentCents) : "credit_account";
      updateOrderCommercialBalance(db, order.id, {
        paymentStatus,
        paidCents,
        balanceCents,
        termsDays: order.payment_terms_days || 0,
        dueDate: balanceCents > 0 ? order.payment_due_date || "" : "",
        creditAuthorized: false,
        commercialAdjustmentCents,
        adjustmentReason: commercialAdjustmentCents > 0 ? "Ajuste comercial interno por condicion N" : "",
        adminUserId: null
      });
      db.prepare("UPDATE orders SET payment_method = 'mercadopago', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
      addOrderEvent(db, order.id, null, "mercadopago_payment_approved", "Pago acreditado por Mercado Pago", order, {
        paymentId, amountCents, paidCents, balanceCents, paymentStatus, commercialAdjustmentCents
      });
    } else {
      addOrderEvent(db, order.id, null, "mercadopago_payment_updated", status, existing || null, {
        paymentId, amountCents, status, statusDetail
      });
    }
    return { order: getOrder(db, order.id, null, true), newlyApproved };
  });
}

export function clientPayableBalanceCents(order = {}) {
  const paidCents = Math.max(0, Number(order.paid_cents || order.paidCents || 0));
  const totalCents = Math.max(0, Number(order.total_cents || order.totalCents || 0));
  const subtotalNetCents = Math.max(0, Number(order.subtotal_net_cents || order.subtotalNetCents || 0));
  const adjustmentCents = Math.max(0, Number(order.commercial_adjustment_cents || order.commercialAdjustmentCents || 0));
  const payableBaseCents = isCommercialClassN(order) ? subtotalNetCents : Math.max(0, totalCents - adjustmentCents);
  return Math.max(0, payableBaseCents - paidCents);
}

export function ensureCurrentAccountPaymentStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      method TEXT NOT NULL DEFAULT 'bank_transfer',
      reference TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_account_payments_order ON account_payments(order_id, created_at DESC);
  `);
  ensureTableColumn(db, "account_payments", "method", "TEXT NOT NULL DEFAULT 'bank_transfer'");
  ensureTableColumn(db, "account_payments", "reference", "TEXT NOT NULL DEFAULT ''");
}

export function ensureMercadoPagoPaymentStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mercadopago_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      preference_id TEXT NOT NULL DEFAULT '',
      payment_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'preference_created',
      status_detail TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mp_payments_order ON mercadopago_payments(order_id, created_at DESC);
  `);
}

export function registerCurrentAccountPayment(db, orderId, input = {}, adminUserId) {
  ensureCurrentAccountPaymentStorage(db);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");

  const commercialAdjustmentCents = resolvedCommercialAdjustmentCents(order);
  const paidBeforeCents = sumAcceptedPayments(db, orderId);
  const balanceBeforeCents = clientPayableBalanceCents({
    ...order,
    paid_cents: paidBeforeCents,
    commercial_adjustment_cents: commercialAdjustmentCents
  });
  if (balanceBeforeCents <= 0) throw new ValidationError("Order has no pending balance");

  const amountCents = normalizeMoneyCents(input.amountCents ?? input.amount ?? balanceBeforeCents, "amountCents", balanceBeforeCents);
  const method = normalizeManualAccountPaymentMethod(input.method);
  const methodLabel = MANUAL_ACCOUNT_PAYMENT_LABELS[method];
  const reference = optionalText(input.reference, "reference", { max: 120 }) || "";
  const note = optionalText(input.note, "note", { max: 1000 }) || "Cobro registrado en cuenta corriente";

  return transaction(db, () => {
    db.prepare(`
      INSERT INTO account_payments (order_id, amount_cents, method, reference, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(orderId, amountCents, method, reference, note, adminUserId);

    const paidCents = sumAcceptedPayments(db, orderId);
    const balanceCents = clientPayableBalanceCents({
      ...order,
      paid_cents: paidCents,
      commercial_adjustment_cents: commercialAdjustmentCents
    });
    const today = new Date().toISOString().slice(0, 10);
    const paymentStatus = balanceCents === 0
      ? paymentStatusForClosedBalance(commercialAdjustmentCents)
      : order.payment_due_date && order.payment_due_date < today
        ? "overdue"
        : "credit_account";

    updateOrderCommercialBalance(db, orderId, {
      paymentStatus,
      paidCents,
      balanceCents,
      termsDays: balanceCents > 0 ? order.payment_terms_days || 0 : 0,
      dueDate: balanceCents > 0 ? order.payment_due_date || "" : "",
      creditAuthorized: false,
      commercialAdjustmentCents,
      adjustmentReason: commercialAdjustmentCents > 0 ? "Ajuste comercial interno por condicion N" : "",
      adminUserId
    });
    addOrderEvent(db, orderId, adminUserId, "current_account_payment_registered", `${methodLabel}: ${note}`, order, {
      amountCents, method, reference, paidCents, balanceCents, paymentStatus, commercialAdjustmentCents
    });
    return getOrder(db, orderId, null, true);
  });
}

export function authorizeOrderCredit(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  assertOrderOpen(order, "Credit account cannot be authorized");
  if (!AVAILABILITY_CONFIRMED_STATUSES.has(order.status)) {
    throw new ValidationError("Availability must be confirmed before authorizing credit account");
  }
  const paidCents = sumAcceptedPayments(db, orderId);
  const commercialAdjustmentCents = resolvedCommercialAdjustmentCents(order);
  const balanceCents = clientPayableBalanceCents({
    ...order,
    paid_cents: paidCents,
    commercial_adjustment_cents: commercialAdjustmentCents
  });
  if (balanceCents <= 0) throw new ValidationError("Order has no pending balance");
  const termsDays = normalizeTermsDays(input.paymentTermsDays);
  const dueDate = normalizeDueDate(input.paymentDueDate);
  if (!termsDays && !dueDate) throw new ValidationError("paymentDueDate or paymentTermsDays is required");
  const reason = optionalText(input.reason, "reason", { max: 1000 }) || "Cuenta corriente autorizada";
  const finalDueDate = dueDate || addDaysIsoDate(new Date(), termsDays);
  const paymentStatus = "credit_account";
  updateOrderCommercialBalance(db, orderId, {
    paymentStatus,
    paidCents,
    balanceCents,
    termsDays,
    dueDate: finalDueDate,
    creditAuthorized: true,
    commercialAdjustmentCents,
    adjustmentReason: commercialAdjustmentCents > 0 ? "Ajuste comercial interno por condicion N" : "",
    adminUserId
  });
  addOrderEvent(db, orderId, adminUserId, "credit_authorized", reason, order, {
    paidCents, balanceCents, paymentDueDate: finalDueDate, paymentTermsDays: termsDays, paymentStatus
  });
  return getOrder(db, orderId, null, true);
}

export function applyCommercialAdjustment(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  if (order.status === "cancelled" || order.status === "delivered" || order.fulfillment_status === "delivered") {
    throw new ValidationError("Closed orders cannot receive commercial adjustments");
  }
  const paidCents = sumAcceptedPayments(db, orderId);
  const commercialAdjustmentCents = resolvedCommercialAdjustmentCents(order);
  const currentBalanceCents = clientPayableBalanceCents({
    ...order,
    paid_cents: paidCents,
    commercial_adjustment_cents: commercialAdjustmentCents
  });
  if (currentBalanceCents <= 0) throw new ValidationError("Order has no pending balance");
  const amountCents = normalizeMoneyCents(input.amountCents ?? input.amount ?? currentBalanceCents, "amountCents", currentBalanceCents);
  if (amountCents !== currentBalanceCents) {
    throw new ValidationError("Commercial adjustment must compensate the full pending balance");
  }
  const reason = requiredText(input.reason, "reason", { max: 1000 });
  const adjustedAt = new Date().toISOString();
  return transaction(db, () => {
    db.prepare(`
      UPDATE orders
      SET payment_status = 'settled_adjustment',
        paid_cents = ?,
        balance_cents = 0,
        commercial_adjustment_cents = commercial_adjustment_cents + ?,
        commercial_adjustment_reason = ?,
        commercial_adjusted_at = ?,
        commercial_adjusted_by = ?,
        payment_due_date = '',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(paidCents, amountCents, reason, adjustedAt, adminUserId, orderId);
    addOrderEvent(db, orderId, adminUserId, "commercial_adjustment_applied", reason, order, {
      amountCents,
      paidCents,
      balanceCents: 0,
      paymentStatus: "settled_adjustment"
    });
    return getOrder(db, orderId, null, true);
  });
}

export function getPaymentReceiptFile(db, receiptId, uploadsPath) {
  const receipt = db.prepare("SELECT * FROM payment_receipts WHERE id = ?").get(receiptId);
  if (!receipt) throw new NotFoundError("Payment receipt not found");
  const receiptsRoot = path.resolve(uploadsPath, "receipts");
  const target = path.resolve(receiptsRoot, receipt.stored_filename);
  if (!target.startsWith(`${receiptsRoot}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new NotFoundError("Payment receipt file not found");
  }
  return {
    filePath: target,
    originalFilename: receipt.original_filename,
    mimeType: receipt.mime_type || "application/octet-stream",
    sizeBytes: receipt.size_bytes || fs.statSync(target).size
  };
}

export function deleteTestOrders(db, uploadsPath, input = {}) {
  if (String(input.confirmation || "").trim() !== DELETE_TEST_ORDERS_CONFIRMATION) {
    throw new ValidationError(`Para borrar pedidos de prueba escribi exactamente: ${DELETE_TEST_ORDERS_CONFIRMATION}`);
  }

  const receiptFiles = db.prepare("SELECT stored_filename FROM payment_receipts").all().map((row) => row.stored_filename);
  const deleted = transaction(db, () => {
    const emailPlaceholders = ORDER_EMAIL_EVENTS.map(() => "?").join(", ");
    const counts = {
      orders: countRows(db, "orders"),
      items: countRows(db, "order_items"),
      events: countRows(db, "order_events"),
      mercadoPagoPayments: tableExists(db, "mercadopago_payments") ? countRows(db, "mercadopago_payments") : 0,
      receipts: countRows(db, "payment_receipts"),
      emails: db.prepare(`SELECT COUNT(*) AS count FROM email_outbox WHERE event_type IN (${emailPlaceholders})`).get(...ORDER_EMAIL_EVENTS).count
    };
    db.prepare(`DELETE FROM email_outbox WHERE event_type IN (${emailPlaceholders})`).run(...ORDER_EMAIL_EVENTS);
    if (tableExists(db, "mercadopago_payments")) db.prepare("DELETE FROM mercadopago_payments").run();
    db.prepare("DELETE FROM payment_receipts").run();
    db.prepare("DELETE FROM order_events").run();
    db.prepare("DELETE FROM order_items").run();
    db.prepare("DELETE FROM orders").run();
    return counts;
  });

  return { deleted, files: deleteReceiptFiles(uploadsPath, receiptFiles) };
}

export function updateOrderFulfillment(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  const fulfillmentStatus = requiredText(input.fulfillmentStatus, "fulfillmentStatus", { max: 30 });
  if (!FULFILLMENT_STATUSES.has(fulfillmentStatus)) {
    throw new ValidationError("fulfillmentStatus is invalid");
  }
  const fulfillmentMethod = optionalText(input.fulfillmentMethod, "fulfillmentMethod", { max: 80 });
  const fulfillmentCarrier = optionalText(input.fulfillmentCarrier, "fulfillmentCarrier", { max: 120 });
  const fulfillmentTracking = optionalText(input.fulfillmentTracking, "fulfillmentTracking", { max: 120 });
  const fulfillmentEstimatedDate = optionalText(input.fulfillmentEstimatedDate, "fulfillmentEstimatedDate", { max: 30 });
  const fulfillmentNotes = optionalText(input.fulfillmentNotes, "fulfillmentNotes", { max: 1000 });
  const reason = optionalText(input.reason, "reason", { max: 1000 });
  assertFulfillmentTransition(order, fulfillmentStatus, {
    fulfillmentMethod,
    fulfillmentCarrier,
    fulfillmentTracking,
    fulfillmentEstimatedDate
  });
  transaction(db, () => {
    db.prepare(`
      UPDATE orders SET fulfillment_status = ?, fulfillment_method = ?, fulfillment_carrier = ?,
        fulfillment_tracking = ?, fulfillment_estimated_date = ?, fulfillment_notes = ?,
        status = CASE WHEN ? = 'delivered' THEN 'delivered' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      fulfillmentStatus, fulfillmentMethod, fulfillmentCarrier, fulfillmentTracking,
      fulfillmentEstimatedDate, fulfillmentNotes, fulfillmentStatus, orderId
    );
    if (fulfillmentStatus === "shipped" && order.fulfillment_status !== "shipped") {
      consumeFinishedProductStock(db, orderId, adminUserId);
    }
    addOrderEvent(db, orderId, adminUserId, "fulfillment_updated", reason, order, {
      fulfillmentStatus, fulfillmentMethod, fulfillmentCarrier, fulfillmentTracking, fulfillmentEstimatedDate, fulfillmentNotes
    });
  });
  return getOrder(db, orderId, null, true);
}

function consumeFinishedProductStock(db, orderId, actorUserId) {
  const items = db.prepare(`SELECT oi.product_id,oi.km_code,oi.product_name,oi.confirmed_quantity,oi.quantity,i.id AS item_id
    FROM order_items oi JOIN inventory_items i ON i.product_id=oi.product_id AND i.active=1 AND i.tracks_stock=1
    WHERE oi.order_id=? AND oi.line_status IN ('confirmed','partial')`).all(orderId);
  for (const item of items) {
    const quantity = Number(item.confirmed_quantity || item.quantity || 0);
    if (quantity <= 0) continue;
    const alreadyApplied = db.prepare(`SELECT 1 FROM inventory_movements
      WHERE item_id=? AND movement_type='order_dispatch' AND reference_type='order_dispatch' AND reference_id=? LIMIT 1`).get(item.item_id, orderId);
    if (alreadyApplied) continue;
    db.prepare("INSERT OR IGNORE INTO inventory_balances(item_id,quantity) VALUES(?,0)").run(item.item_id);
    db.prepare("UPDATE inventory_balances SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE item_id=?").run(quantity, item.item_id);
    const balanceAfter = Number(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(item.item_id).quantity || 0);
    db.prepare(`INSERT INTO inventory_movements(item_id,quantity_delta,movement_type,reference_type,reference_id,notes,actor_user_id,balance_after)
      VALUES(?,?,'order_dispatch','order_dispatch',?,?,?,?)`).run(item.item_id, -quantity, orderId, `Salida por despacho ${item.km_code}`, actorUserId || null, balanceAfter);
  }
}

export function getUnfulfilledDemandReport(db, filters = {}) {
  const clauses = ["oi.confirmed_quantity < oi.quantity", "oi.line_status IN ('partial','unavailable','cancelled')"];
  const params = [];
  const from = String(filters.from || "").trim();
  const to = String(filters.to || "").trim();
  const reason = String(filters.reason || "").trim();
  const search = String(filters.q || "").trim();
  if (from) { clauses.push("date(COALESCE(o.updated_at,o.created_at)) >= date(?)"); params.push(from); }
  if (to) { clauses.push("date(COALESCE(o.updated_at,o.created_at)) <= date(?)"); params.push(to); }
  if (reason) { clauses.push("oi.unfulfilled_reason_code = ?"); params.push(reason); }
  if (search) {
    const q = `%${search}%`;
    clauses.push("(o.order_number LIKE ? OR c.business_name LIKE ? OR oi.km_code LIKE ? OR oi.product_name LIKE ?)");
    params.push(q, q, q, q);
  }
  const rows = db.prepare(`
    SELECT o.id AS order_id,o.order_number,o.created_at,o.updated_at,c.business_name,
      COALESCE(sr.name,o.sales_rep_name,'') AS sales_rep_name,
      oi.id AS order_item_id,oi.product_id,oi.km_code,oi.product_name,oi.quantity,
      oi.confirmed_quantity,oi.final_unit_price_cents,oi.unfulfilled_reason_code,oi.availability_note,
      COALESCE(f.name,'Sin familia') AS family_name
    FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    JOIN customers c ON c.id=o.customer_id
    LEFT JOIN sales_reps sr ON sr.id=o.sales_rep_id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN product_families f ON f.id=p.family_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY COALESCE(o.updated_at,o.created_at) DESC,o.id DESC,oi.id
  `).all(...params).map((row) => {
    const requestedQuantity = Number(row.quantity || 0);
    const confirmedQuantity = Number(row.confirmed_quantity || 0);
    const unfulfilledQuantity = Math.max(0, requestedQuantity - confirmedQuantity);
    return {
      orderId: row.order_id, orderNumber: row.order_number, date: row.updated_at || row.created_at,
      customer: row.business_name, salesRep: row.sales_rep_name || "Sin vendedor",
      orderItemId: row.order_item_id, productId: row.product_id, kmCode: row.km_code,
      productName: row.product_name, family: row.family_name,
      requestedQuantity, confirmedQuantity, unfulfilledQuantity,
      fulfillmentPercent: requestedQuantity ? confirmedQuantity * 100 / requestedQuantity : 0,
      unfulfilledValueCents: unfulfilledQuantity * Number(row.final_unit_price_cents || 0),
      reasonCode: row.unfulfilled_reason_code || "unclassified",
      reasonLabel: UNFULFILLED_REASON_LABELS[row.unfulfilled_reason_code] || "Sin clasificar",
      note: row.availability_note || ""
    };
  });
  const requestedUnits = rows.reduce((sum, row) => sum + row.requestedQuantity, 0);
  const confirmedUnits = rows.reduce((sum, row) => sum + row.confirmedQuantity, 0);
  const unfulfilledUnits = rows.reduce((sum, row) => sum + row.unfulfilledQuantity, 0);
  return {
    generatedAt: new Date().toISOString(), rows,
    summary: {
      affectedLines: rows.length, requestedUnits, confirmedUnits, unfulfilledUnits,
      fulfillmentPercent: requestedUnits ? confirmedUnits * 100 / requestedUnits : 100,
      unfulfilledValueCents: rows.reduce((sum, row) => sum + row.unfulfilledValueCents, 0)
    },
    reasons: Object.entries(UNFULFILLED_REASON_LABELS).map(([code, label]) => ({ code, label }))
  };
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

export function confirmOrderReceived(db, orderId, customerId, userId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?").get(orderId, customerId);
  if (!order) throw new NotFoundError("Order not found");
  if (order.fulfillment_status === "delivered") return getOrder(db, orderId, customerId, false);
  if (order.fulfillment_status !== "shipped") throw new ValidationError("Order is not shipped yet");
  const receivedAt = new Date().toISOString();
  db.prepare(`
    UPDATE orders SET fulfillment_status = 'delivered', status = 'delivered',
      fulfillment_notes = CASE WHEN fulfillment_notes = '' THEN 'Recepcion confirmada por el cliente.' ELSE fulfillment_notes END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(orderId);
  addOrderEvent(db, orderId, userId, "customer_received", "Recepcion confirmada por el cliente", order, { receivedAt });
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

function shippingFromAddress(address) {
  return {
    recipient: address.recipient,
    address: address.address,
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    preferredTransport: address.preferredTransport,
    contactPhone: address.contactPhone,
    notes: address.notes
  };
}

function assertOrderOpen(order, message) {
  if (order.status === "cancelled" || order.status === "delivered" || order.fulfillment_status === "delivered") {
    throw new ValidationError(`${message}: order is closed`);
  }
}

function assertManualOrderState(order, status, paymentStatus) {
  assertOrderOpen(order, "Manual status update cannot be applied");
  if (!ORDER_STATUSES.has(status)) throw new ValidationError("status is invalid");
  if (!PAYMENT_STATUSES.has(paymentStatus)) throw new ValidationError("paymentStatus is invalid");
  if (status === "delivered") {
    throw new ValidationError("Delivered orders must be closed by customer reception");
  }
  if (["paid", "credit_account", "settled_adjustment", "overdue"].includes(paymentStatus) && !AVAILABILITY_CONFIRMED_STATUSES.has(status)) {
    throw new ValidationError("Payment closure requires confirmed availability");
  }
  if (status === "ready" && !PAYMENT_STATUSES_ALLOWING_FULFILLMENT.has(paymentStatus)) {
    throw new ValidationError("Ready orders require paid, credit account or commercial adjustment status");
  }
}

function assertFulfillmentTransition(order, fulfillmentStatus, details) {
  assertOrderOpen(order, "Fulfillment cannot be updated");
  if (order.modified_acceptance_required) {
    throw new ValidationError("El cliente debe aceptar los cambios de disponibilidad antes de preparar el pedido.");
  }
  if (fulfillmentStatus === "delivered") {
    throw new ValidationError("Customer reception must close delivered orders");
  }
  if (order.fulfillment_status === "shipped") {
    throw new ValidationError("Shipped orders wait for customer reception and cannot be edited from dispatch");
  }
  if (order.fulfillment_status !== "pending" && fulfillmentStatus === "pending") {
    throw new ValidationError("Fulfillment cannot move backwards to pending");
  }
  if (order.fulfillment_status === "pending" && fulfillmentStatus === "shipped") {
    throw new ValidationError("Order must be prepared before dispatch");
  }
  if (order.fulfillment_status === "ready" && fulfillmentStatus === "ready") {
    throw new ValidationError("Order is already prepared for dispatch");
  }
  if (fulfillmentStatus === "ready" || fulfillmentStatus === "shipped") {
    if (!AVAILABILITY_CONFIRMED_STATUSES.has(order.status)) {
      throw new ValidationError("Availability must be confirmed before preparing dispatch");
    }
    if (!PAYMENT_STATUSES_ALLOWING_FULFILLMENT.has(normalizePaymentStatus(order.payment_status))) {
      throw new ValidationError("Payment, credit account or commercial adjustment must be resolved before dispatch");
    }
  }
  if (fulfillmentStatus === "shipped") {
    if (order.fulfillment_status !== "ready") {
      throw new ValidationError("Order must be prepared before dispatch");
    }
    const isCustomerPickup = details.fulfillmentMethod === "Retira en local";
    if (!details.fulfillmentMethod || !details.fulfillmentCarrier || (!isCustomerPickup && !details.fulfillmentTracking) || !details.fulfillmentEstimatedDate) {
      throw new ValidationError(isCustomerPickup
        ? "El retiro requiere modalidad, persona responsable y fecha."
        : "El despacho requiere modalidad, transporte, guía o remito y fecha.");
    }
  }
}

function addOrderEvent(db, orderId, actorUserId, eventType, reason, before, after) {
  db.prepare(`
    INSERT INTO order_events (order_id, actor_user_id, event_type, reason, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, actorUserId, eventType, reason, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

function normalizeConfirmedQuantity(value, orderedQuantity) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > orderedQuantity) {
    throw new ValidationError("confirmedQuantity must be between 0 and ordered quantity");
  }
  return quantity;
}

function lineStatusFor(orderedQuantity, confirmedQuantity, requestedStatus = "") {
  if (requestedStatus === "cancelled") return "cancelled";
  if (confirmedQuantity === 0) return "unavailable";
  if (confirmedQuantity < orderedQuantity) return "partial";
  return "confirmed";
}

function normalizeUnfulfilledReason(value, required, note = "") {
  if (!required) return "";
  const code = String(value || "").trim();
  if (!UNFULFILLED_REASON_LABELS[code]) {
    throw new ValidationError("Seleccioná el motivo de la cantidad no confirmada.");
  }
  if (code === "other" && !String(note || "").trim()) {
    throw new ValidationError("Escribí una observación cuando seleccionás Otro motivo.");
  }
  return code;
}

function normalizePackageCount(value) {
  const packages = Number(value || 1);
  if (!Number.isInteger(packages) || packages < 1 || packages > 99) {
    throw new ValidationError("packages must be between 1 and 99");
  }
  return packages;
}

function calculateCommission(baseCents, commissionBps) {
  return Math.round((baseCents * commissionBps) / 10_000);
}

function normalizeMoneyCents(value, fieldName, maxCents) {
  if (typeof value === "string") {
    const cents = parseMoneyStringToCents(value, fieldName);
    if (cents > maxCents) throw new ValidationError("El importe no puede superar el saldo pendiente");
    return cents;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new ValidationError("Ingresa un importe valido");
  const cents = Number.isInteger(numeric) ? numeric : Math.round(numeric * 100);
  if (cents <= 0) throw new ValidationError("El importe debe ser mayor a cero");
  if (cents > maxCents) throw new ValidationError("El importe no puede superar el saldo pendiente");
  return cents;
}

function parseMoneyStringToCents(value, fieldName) {
  const raw = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!raw || raw.includes("-")) throw new ValidationError("Ingresa un importe valido");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = raw.split(",");
    if (parts.length > 2) {
      const cents = parts.pop();
      normalized = cents.length > 0 && cents.length <= 2 ? `${parts.join("")}.${cents}` : [...parts, cents].join("");
    } else {
      const [pesos, cents = ""] = parts;
      normalized = cents.length > 0 && cents.length <= 2 ? `${pesos}.${cents}` : `${pesos}${cents}`;
    }
  } else if (lastDot >= 0) {
    const parts = raw.split(".");
    if (parts.length > 2) {
      const cents = parts.pop();
      normalized = cents.length > 0 && cents.length <= 2 ? `${parts.join("")}.${cents}` : [...parts, cents].join("");
    } else {
      const [pesos, cents = ""] = parts;
      normalized = cents.length > 0 && cents.length <= 2 ? `${pesos}.${cents}` : `${pesos}${cents}`;
    }
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("El importe debe ser mayor a cero");
  return Math.round(amount * 100);
}

function normalizeManualAccountPaymentMethod(value) {
  const method = String(value || "bank_transfer").trim();
  if (method === "mercadopago" || method === "mercado_pago") {
    throw new ValidationError("Mercado Pago se acredita automaticamente desde la integracion");
  }
  if (!MANUAL_ACCOUNT_PAYMENT_METHODS.has(method)) {
    throw new ValidationError("Forma de cobro no valida");
  }
  return method;
}

function normalizeTermsDays(value) {
  if (value === undefined || value === null || value === "") return 0;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new ValidationError("paymentTermsDays must be between 0 and 365");
  return days;
}

function normalizeDueDate(value) {
  if (!value) return "";
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new ValidationError("paymentDueDate must be YYYY-MM-DD");
  }
  return date;
}

function sumAcceptedPayments(db, orderId) {
  const manualPaid = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS paid_cents
    FROM payment_receipts
    WHERE order_id = ? AND status = 'accepted'
  `).get(orderId).paid_cents || 0;
  const mercadoPagoPaid = tableExists(db, "mercadopago_payments")
    ? db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS paid_cents
      FROM mercadopago_payments
      WHERE order_id = ? AND status = 'approved'
    `).get(orderId).paid_cents || 0
    : 0;
  const currentAccountPaid = tableExists(db, "account_payments")
    ? db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS paid_cents
      FROM account_payments
      WHERE order_id = ?
    `).get(orderId).paid_cents || 0
    : 0;
  return manualPaid + mercadoPagoPaid + currentAccountPaid;
}

function paymentStatusForClosedBalance(adjustmentCents) {
  return adjustmentCents > 0 ? "settled_adjustment" : "paid";
}

function resolvedCommercialAdjustmentCents(order = {}) {
  const currentAdjustment = Math.max(0, Number(order.commercial_adjustment_cents || order.commercialAdjustmentCents || 0));
  return Math.max(currentAdjustment, expectedCommercialAdjustmentCents(order));
}

function expectedCommercialAdjustmentCents(order = {}) {
  if (!isCommercialClassN(order)) return 0;
  return Math.max(0, Number(order.vat_cents || order.vatCents || 0));
}

function isCommercialClassN(order = {}) {
  return String(order.commercial_class || order.commercialClass || "B").trim().toUpperCase() === "N";
}

function normalizePaymentStatus(status) {
  return status === "partial_payment" ? "credit_account" : status;
}

function normalizeOrderOriginRole(value) {
  const role = String(value || "customer").trim();
  if (["customer", "sales_rep", "admin"].includes(role)) return role;
  return "customer";
}

function normalizePaymentCondition(value) {
  const raw = String(value || "advance_payment").trim();
  const condition = raw === "prepaid" ? "advance_payment" : raw;
  if (!["advance_payment", "credit_account"].includes(condition)) {
    throw new ValidationError("paymentCondition must be advance_payment or credit_account");
  }
  return condition;
}

function normalizeCustomerDefaultTermsDays(value) {
  const days = normalizeTermsDays(value);
  return days || 15;
}

function updateOrderCommercialBalance(db, orderId, {
  paymentStatus,
  paidCents,
  balanceCents,
  termsDays,
  dueDate,
  creditAuthorized,
  commercialAdjustmentCents = null,
  adjustmentReason = "",
  adminUserId
}) {
  const hasAdjustment = Number.isInteger(commercialAdjustmentCents) && commercialAdjustmentCents >= 0;
  const adjustedAt = hasAdjustment ? new Date().toISOString() : "";
  db.prepare(`
    UPDATE orders
    SET payment_status = ?, paid_cents = ?, balance_cents = ?,
      commercial_adjustment_cents = CASE WHEN ? THEN ? ELSE commercial_adjustment_cents END,
      commercial_adjustment_reason = CASE WHEN ? THEN ? ELSE commercial_adjustment_reason END,
      commercial_adjusted_at = CASE WHEN ? THEN ? ELSE commercial_adjusted_at END,
      commercial_adjusted_by = CASE WHEN ? THEN ? ELSE commercial_adjusted_by END,
      payment_terms_days = CASE WHEN ? > 0 THEN ? ELSE payment_terms_days END,
      payment_due_date = CASE WHEN ? <> '' THEN ? ELSE payment_due_date END,
      credit_authorized_at = CASE WHEN ? THEN ? ELSE credit_authorized_at END,
      credit_authorized_by = CASE WHEN ? THEN ? ELSE credit_authorized_by END,
      due_reminder_sent_at = CASE WHEN ? <> payment_due_date THEN NULL ELSE due_reminder_sent_at END,
      overdue_reminder_sent_date = CASE WHEN ? <> payment_due_date THEN '' ELSE overdue_reminder_sent_date END,
      payment_reminder_stage = CASE WHEN ? <> payment_due_date THEN '' ELSE payment_reminder_stage END,
      payment_reminder_last_sent_date = CASE WHEN ? <> payment_due_date THEN '' ELSE payment_reminder_last_sent_date END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    paymentStatus, paidCents, balanceCents,
    hasAdjustment ? 1 : 0, commercialAdjustmentCents || 0,
    hasAdjustment ? 1 : 0, adjustmentReason || "",
    hasAdjustment ? 1 : 0, adjustedAt,
    hasAdjustment ? 1 : 0, adminUserId || null,
    termsDays, termsDays,
    dueDate, dueDate,
    creditAuthorized ? 1 : 0, new Date().toISOString(),
    creditAuthorized ? 1 : 0, adminUserId,
    dueDate, dueDate,
    dueDate, dueDate,
    orderId
  );
}

function addDaysIsoDate(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function deleteReceiptFiles(uploadsPath, filenames) {
  const receiptsRoot = path.resolve(uploadsPath, "receipts");
  const result = { deleted: 0, failed: [] };
  for (const filename of filenames) {
    const target = path.resolve(receiptsRoot, filename);
    if (!target.startsWith(`${receiptsRoot}${path.sep}`)) {
      result.failed.push(filename);
      continue;
    }
    try {
      fs.rmSync(target, { force: true });
      result.deleted += 1;
    } catch {
      result.failed.push(filename);
    }
  }
  return result;
}

function resolveMercadoPagoOrder(db, input) {
  const orderId = Number(input.orderId || 0);
  const orderNumber = String(input.orderNumber || "").trim();
  const order = orderId > 0
    ? db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId)
    : db.prepare("SELECT * FROM orders WHERE order_number = ?").get(orderNumber);
  if (!order) throw new NotFoundError("Order not found");
  return order;
}

function listMercadoPagoPayments(db, orderId) {
  if (!tableExists(db, "mercadopago_payments")) return [];
  return db.prepare("SELECT * FROM mercadopago_payments WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(orderId);
}

function listAccountPayments(db, orderId) {
  if (!tableExists(db, "account_payments")) return [];
  return db.prepare("SELECT * FROM account_payments WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(orderId);
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function ensureTableColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function mapOrder(order, items, receipts = [], events = [], mercadoPagoPayments = [], accountPayments = []) {
  const commercialAdjustmentCents = resolvedCommercialAdjustmentCents(order);
  const calculatedBalanceCents = clientPayableBalanceCents({
    ...order,
    paid_cents: order.paid_cents || 0,
    commercial_adjustment_cents: commercialAdjustmentCents
  });
  return {
    id: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
    businessName: order.business_name,
    contactPerson: order.contact_person,
    customerWhatsapp: order.whatsapp,
    email: order.email,
    status: order.status,
    createdBy: {
      role: order.created_by_role || "customer",
      salesRepId: order.created_by_sales_rep_id || null,
      salesRepName: (order.created_by_role || "customer") === "sales_rep" ? (order.sales_rep_name || "") : "",
      salesRepEmail: (order.created_by_role || "customer") === "sales_rep" ? (order.sales_rep_email || "") : ""
    },
    createdByRole: order.created_by_role || "customer",
    createdBySalesRepId: order.created_by_sales_rep_id || null,
    commercialClass: order.commercial_class || "B",
    paymentStatus: order.payment_status,
    requestedPaymentCondition: normalizePaymentCondition(order.requested_payment_condition || "advance_payment"),
    paymentMethod: order.payment_method || "bank_transfer",
    paidCents: order.paid_cents || 0,
    balanceCents: Number.isFinite(Number(order.balance_cents)) ? Math.max(0, Number(order.balance_cents || 0)) : calculatedBalanceCents,
    commercialAdjustmentCents,
    commercialAdjustmentReason: order.commercial_adjustment_reason || "",
    commercialAdjustedAt: order.commercial_adjusted_at || "",
    paymentTermsDays: order.payment_terms_days || 0,
    paymentDueDate: order.payment_due_date || "",
    creditAuthorizedAt: order.credit_authorized_at || "",
    fulfillment: {
      status: order.fulfillment_status || "pending",
      method: order.fulfillment_method || "",
      carrier: order.fulfillment_carrier || "",
      tracking: order.fulfillment_tracking || "",
      estimatedDate: order.fulfillment_estimated_date || "",
      notes: order.fulfillment_notes || ""
    },
    logisticsStatus: order.logistics_status || "pending",
    currency: order.currency,
    discountsBps: [order.discount_1_bps, order.discount_2_bps, order.discount_3_bps],
    salesRep: {
      id: order.sales_rep_id || null,
      name: order.sales_rep_name || "",
      email: order.sales_rep_email || "",
      commissionBps: order.sales_commission_bps || 0,
      commissionBaseCents: order.sales_commission_base_cents || 0,
      commissionCents: order.sales_commission_cents || 0
    },
    subtotalNetCents: order.subtotal_net_cents,
    vatBps: order.vat_bps,
    vatCents: order.vat_cents,
    totalCents: order.total_cents,
    bank: normalizePaymentSnapshot(JSON.parse(order.bank_snapshot_json || "{}")),
    shipping: JSON.parse(order.shipping_snapshot_json),
    priceReservedAt: order.price_reserved_at,
    customerAcceptedAt: order.customer_accepted_at,
    modifiedAcceptanceRequired: Boolean(order.modified_acceptance_required),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    paymentReceipts: receipts.map((receipt) => ({
      id: receipt.id,
      originalFilename: receipt.original_filename,
      mimeType: receipt.mime_type,
      sizeBytes: receipt.size_bytes,
      status: receipt.status,
      amountCents: receipt.amount_cents || 0,
      reviewReason: receipt.review_reason || "",
      reviewedAt: receipt.reviewed_at || "",
      createdAt: receipt.created_at
    })),
    mercadoPagoPayments: mercadoPagoPayments.map((payment) => ({
      id: payment.id,
      preferenceId: payment.preference_id || "",
      paymentId: payment.payment_id || "",
      status: payment.status,
      statusDetail: payment.status_detail || "",
      amountCents: payment.amount_cents || 0,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    })),
    accountPayments: accountPayments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amount_cents || 0,
      method: payment.method || "bank_transfer",
      methodLabel: MANUAL_ACCOUNT_PAYMENT_LABELS[payment.method] || "Cobro manual",
      reference: payment.reference || "",
      note: payment.note || "",
      createdAt: payment.created_at
    })),
    events: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      reason: event.reason || "",
      actorEmail: event.actor_email || "",
      actorRole: event.actor_role || "",
      createdAt: event.created_at
    })),
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      kmCode: item.km_code,
      ean13: item.ean13,
      productName: item.product_name,
      warehouseLocation: item.warehouse_location || "",
      quantity: item.quantity,
      confirmedQuantity: item.confirmed_quantity || 0,
      basePriceCents: item.base_price_cents,
      discountsBps: [item.discount_1_bps, item.discount_2_bps, item.discount_3_bps],
      specialDiscountBps: item.special_discount_bps || 0,
      specialDiscountNote: item.special_discount_note || "",
      promotionBps: item.promotion_bps || 0,
      promotionLabel: item.promotion_label || "",
      finalUnitPriceCents: item.final_unit_price_cents,
      subtotalNetCents: item.subtotal_net_cents,
      confirmedSubtotalNetCents: item.confirmed_subtotal_net_cents || 0,
      lineStatus: item.line_status || "pending_confirmation",
      availabilityNote: item.availability_note || "",
      unfulfilledReasonCode: item.unfulfilled_reason_code || "",
      unfulfilledReasonLabel: UNFULFILLED_REASON_LABELS[item.unfulfilled_reason_code] || ""
    }))
  };
}
