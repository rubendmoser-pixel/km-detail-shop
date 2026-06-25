import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateLine, calculateOrderTotals } from "../domain/pricing.js";
import { NotFoundError, ValidationError, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import { transaction } from "../db.js";
import { getCustomerPricingContext } from "./customer-service.js";
import { resolveCustomerSalesRep } from "./sales-rep-service.js";
import { getCommercialSettings } from "./settings-service.js";

const RECEIPT_MIME_EXTENSIONS = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"]
]);
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export function createOrder(db, customerId, input) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("Order requires at least one item");
  if (input.items.length > 200) throw new ValidationError("Order contains too many items");

  const customer = getCustomerPricingContext(db, customerId);
  if (!customer || customer.approval_status !== "approved") throw new ValidationError("Customer is not approved");
  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps];
  const salesRep = resolveCustomerSalesRep(db, customerId);
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
    const commissionCents = calculateCommission(totals.subtotalNetCents, salesRep.commissionBps);
    const now = new Date().toISOString();

    const order = db.prepare(`
      INSERT INTO orders (
        customer_id, status, payment_status, discount_1_bps, discount_2_bps, discount_3_bps,
        sales_rep_id, sales_rep_name, sales_rep_email, sales_commission_bps,
        sales_commission_base_cents, sales_commission_cents,
        subtotal_net_cents, vat_bps, vat_cents, total_cents, bank_snapshot_json,
        shipping_snapshot_json, price_reserved_at, customer_accepted_at
      ) VALUES (?, 'order_created', 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      customerId, ...discounts,
      salesRep.id, salesRep.name, salesRep.email, salesRep.commissionBps,
      totals.subtotalNetCents, commissionCents,
      totals.subtotalNetCents, totals.vatBps, totals.vatCents,
      totals.totalCents, JSON.stringify(settings.bank), JSON.stringify(shipping), now, now
    );
    const orderNumber = `KM-${new Date().getUTCFullYear()}-${String(order.id).padStart(6, "0")}`;
    db.prepare("UPDATE orders SET order_number = ? WHERE id = ?").run(orderNumber, order.id);

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, km_code, ean13, product_name, warehouse_location, quantity, base_price_cents,
        discount_1_bps, discount_2_bps, discount_3_bps, final_unit_price_cents, subtotal_net_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertItem.run(
        order.id, line.product.id, line.product.km_code, line.product.ean13, line.product.name, line.product.warehouse_location || "",
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
  const receipts = db.prepare("SELECT * FROM payment_receipts WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(orderId);
  return mapOrder(order, items, receipts);
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
    LIMIT 25
  `).all(customerId).map((order) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(order.id);
    const receipts = db.prepare("SELECT * FROM payment_receipts WHERE order_id = ? ORDER BY created_at DESC, id DESC").all(order.id);
    return mapOrder(order, items, receipts);
  });
}

export function listAdminOrders(db, filters = {}) {
  const where = [];
  const params = [];
  if (filters.status) {
    where.push("o.status = ?");
    params.push(filters.status);
  }
  if (filters.paymentStatus) {
    where.push("o.payment_status = ?");
    params.push(filters.paymentStatus);
  }
  if (filters.fulfillmentStatus) {
    where.push("o.fulfillment_status = ?");
    params.push(filters.fulfillmentStatus);
  }
  if (filters.search) {
    where.push("(o.order_number LIKE ? OR c.business_name LIKE ? OR c.tax_id LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.currency,
           o.fulfillment_status, o.created_at, c.business_name, c.tax_id
    FROM orders o JOIN customers c ON c.id = o.customer_id
    ${whereSql} ORDER BY o.created_at DESC
    LIMIT 500
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

export function confirmOrderAvailability(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("items are required");
  const reason = requiredText(input.reason, "reason", { min: 3, max: 1000 });

  return transaction(db, () => {
    const currentItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
    const currentById = new Map(currentItems.map((item) => [item.id, item]));
    const updateItem = db.prepare(`
      UPDATE order_items SET confirmed_quantity = ?, confirmed_subtotal_net_cents = ?,
        line_status = ?, availability_note = ?
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
      confirmedSubtotalNetCents += confirmedSubtotal;
      updateItem.run(confirmedQuantity, confirmedSubtotal, lineStatus, note, item.id, orderId);
    }
    const vatCents = Math.round(confirmedSubtotalNetCents * order.vat_bps / 10_000);
    const totalCents = confirmedSubtotalNetCents + vatCents;
    const commissionCents = calculateCommission(confirmedSubtotalNetCents, order.sales_commission_bps || 0);
    const newStatus = confirmedSubtotalNetCents > 0 ? "availability_confirmed" : "cancelled";
    db.prepare(`
      UPDATE orders SET status = ?, subtotal_net_cents = ?, vat_cents = ?, total_cents = ?,
        sales_commission_base_cents = ?, sales_commission_cents = ?,
        modified_acceptance_required = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, confirmedSubtotalNetCents, vatCents, totalCents, confirmedSubtotalNetCents, commissionCents, orderId);
    addOrderEvent(db, orderId, adminUserId, "availability_confirmed", reason, { order, items: currentItems }, {
      subtotalNetCents: confirmedSubtotalNetCents,
      vatCents,
      totalCents
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
  const status = requiredText(input.status, "status", { max: 30 });
  if (!["accepted", "rejected"].includes(status)) throw new ValidationError("status must be accepted or rejected");
  const reason = optionalText(input.reason, "reason", { max: 1000 });
  db.prepare("UPDATE payment_receipts SET status = ? WHERE id = ?").run(status, receiptId);
  const paymentStatus = status === "accepted" ? "paid" : "rejected";
  db.prepare("UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(paymentStatus, receipt.order_id);
  addOrderEvent(db, receipt.order_id, adminUserId, "payment_receipt_reviewed", reason, receipt, { status });
  return getOrder(db, receipt.order_id, null, true);
}

export function updateOrderFulfillment(db, orderId, input, adminUserId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) throw new NotFoundError("Order not found");
  const fulfillmentStatus = requiredText(input.fulfillmentStatus, "fulfillmentStatus", { max: 30 });
  if (!["pending", "ready", "shipped", "delivered"].includes(fulfillmentStatus)) {
    throw new ValidationError("fulfillmentStatus is invalid");
  }
  const fulfillmentMethod = optionalText(input.fulfillmentMethod, "fulfillmentMethod", { max: 80 });
  const fulfillmentCarrier = optionalText(input.fulfillmentCarrier, "fulfillmentCarrier", { max: 120 });
  const fulfillmentTracking = optionalText(input.fulfillmentTracking, "fulfillmentTracking", { max: 120 });
  const fulfillmentEstimatedDate = optionalText(input.fulfillmentEstimatedDate, "fulfillmentEstimatedDate", { max: 30 });
  const fulfillmentNotes = optionalText(input.fulfillmentNotes, "fulfillmentNotes", { max: 1000 });
  const reason = optionalText(input.reason, "reason", { max: 1000 });
  db.prepare(`
    UPDATE orders SET fulfillment_status = ?, fulfillment_method = ?, fulfillment_carrier = ?,
      fulfillment_tracking = ?, fulfillment_estimated_date = ?, fulfillment_notes = ?,
      status = CASE WHEN ? = 'shipped' THEN 'ready' WHEN ? = 'delivered' THEN 'delivered' ELSE status END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    fulfillmentStatus, fulfillmentMethod, fulfillmentCarrier, fulfillmentTracking,
    fulfillmentEstimatedDate, fulfillmentNotes, fulfillmentStatus, fulfillmentStatus, orderId
  );
  addOrderEvent(db, orderId, adminUserId, "fulfillment_updated", reason, order, {
    fulfillmentStatus, fulfillmentMethod, fulfillmentCarrier, fulfillmentTracking, fulfillmentEstimatedDate, fulfillmentNotes
  });
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

function mapOrder(order, items, receipts = []) {
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
    paymentMethod: order.payment_method || "bank_transfer",
    fulfillment: {
      status: order.fulfillment_status || "pending",
      method: order.fulfillment_method || "",
      carrier: order.fulfillment_carrier || "",
      tracking: order.fulfillment_tracking || "",
      estimatedDate: order.fulfillment_estimated_date || "",
      notes: order.fulfillment_notes || ""
    },
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
    bank: JSON.parse(order.bank_snapshot_json),
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
      createdAt: receipt.created_at
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
      finalUnitPriceCents: item.final_unit_price_cents,
      subtotalNetCents: item.subtotal_net_cents,
      confirmedSubtotalNetCents: item.confirmed_subtotal_net_cents || 0,
      lineStatus: item.line_status || "pending_confirmation",
      availabilityNote: item.availability_note || ""
    }))
  };
}
