import { NotFoundError, ValidationError, basisPoints } from "../domain/validation.js";

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected", "suspended", "inactive"]);
const ALLOWED_COMMERCIAL_CLASSES = new Set(["B", "N"]);
const ALLOWED_PAYMENT_CONDITIONS = new Set(["advance_payment", "credit_account"]);

export function listCustomers(db, filters = "") {
  const status = typeof filters === "object" ? filters.status || "" : filters;
  const search = typeof filters === "object" ? String(filters.search || "").trim() : "";
  const where = [];
  const params = [];
  if (status) {
    where.push("c.approval_status = ?");
    params.push(status);
  }
  if (search) {
    where.push(`(
      c.business_name LIKE ? OR c.contact_person LIKE ? OR c.tax_id LIKE ? OR
      c.phone LIKE ? OR c.whatsapp LIKE ? OR c.city LIKE ? OR c.province LIKE ? OR c.postal_code LIKE ? OR u.email LIKE ?
    )`);
    params.push(...Array(9).fill(`%${search}%`));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT c.*, u.email, d.discount_1_bps, d.discount_2_bps, d.discount_3_bps,
           sr.name AS sales_rep_name, sr.email AS sales_rep_email,
           sr.default_commission_bps AS sales_rep_default_commission_bps,
           (
             SELECT o.order_number
             FROM orders o
             WHERE o.customer_id = c.id
             ORDER BY o.created_at DESC, o.id DESC
             LIMIT 1
           ) AS last_order_number,
           (
             SELECT o.created_at
             FROM orders o
             WHERE o.customer_id = c.id
             ORDER BY o.created_at DESC, o.id DESC
             LIMIT 1
           ) AS last_order_at
    FROM customers c
    JOIN users u ON u.id = c.user_id
    JOIN customer_discounts d ON d.customer_id = c.id
    LEFT JOIN sales_reps sr ON sr.id = c.sales_rep_id
    ${whereSql}
    ORDER BY c.created_at DESC
  `).all(...params);
}

export function setCustomerStatus(db, customerId, status, adminUserId, commercialClass = "") {
  if (!ALLOWED_STATUSES.has(status)) throw new ValidationError("Invalid customer status");
  const previous = db.prepare("SELECT approval_status, commercial_class FROM customers WHERE id = ?").get(customerId);
  if (!previous) throw new NotFoundError("Customer not found");
  const normalizedClass = commercialClass ? normalizeCommercialClass(commercialClass) : previous.commercial_class || "B";
  const approvedAt = status === "approved" ? new Date().toISOString() : null;
  const updated = db.prepare(`
    UPDATE customers
    SET approval_status = ?, commercial_class = ?, approved_at = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? RETURNING id, approval_status, commercial_class, approved_at
  `).get(status, normalizedClass, approvedAt, adminUserId, customerId);
  if (!updated) throw new NotFoundError("Customer not found");
  return { ...updated, previousStatus: previous.approval_status, changed: previous.approval_status !== status };
}

export function setCustomerCommercialClass(db, customerId, commercialClass) {
  const normalizedClass = normalizeCommercialClass(commercialClass);
  const updated = db.prepare(`
    UPDATE customers
    SET commercial_class = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING id, commercial_class
  `).get(normalizedClass, customerId);
  if (!updated) throw new NotFoundError("Customer not found");
  return updated;
}

export function setCustomerPaymentTerms(db, customerId, input = {}) {
  const paymentCondition = normalizeCustomerPaymentCondition(input.paymentCondition);
  const paymentTermsDays = paymentCondition === "credit_account" ? normalizeCustomerPaymentTermsDays(input.paymentTermsDays) : 0;
  const updated = db.prepare(`
    UPDATE customers
    SET payment_condition = ?, payment_terms_days = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING id, payment_condition, payment_terms_days
  `).get(paymentCondition, paymentTermsDays, customerId);
  if (!updated) throw new NotFoundError("Customer not found");
  return updated;
}

export function setCustomerDiscounts(db, customerId, discounts, adminUserId) {
  const [d1 = 0, d2 = 0, d3 = 0] = discounts;
  basisPoints(d1, "discount1Bps");
  basisPoints(d2, "discount2Bps");
  basisPoints(d3, "discount3Bps");
  const updated = db.prepare(`
    UPDATE customer_discounts
    SET discount_1_bps = ?, discount_2_bps = ?, discount_3_bps = ?,
        updated_at = CURRENT_TIMESTAMP, updated_by = ?
    WHERE customer_id = ?
    RETURNING customer_id, discount_1_bps, discount_2_bps, discount_3_bps
  `).get(d1, d2, d3, adminUserId, customerId);
  if (!updated) throw new NotFoundError("Customer not found");
  return updated;
}

export function getCustomerPricingContext(db, customerId) {
  return db.prepare(`
    SELECT c.id, c.user_id, c.approval_status, c.commercial_class,
           c.payment_condition, c.payment_terms_days,
           d.discount_1_bps, d.discount_2_bps, d.discount_3_bps
    FROM customers c JOIN customer_discounts d ON d.customer_id = c.id
    WHERE c.id = ?
  `).get(customerId);
}

function normalizeCommercialClass(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!ALLOWED_COMMERCIAL_CLASSES.has(normalized)) throw new ValidationError("Invalid customer class");
  return normalized;
}

function normalizeCustomerPaymentCondition(value) {
  const normalized = String(value || "advance_payment").trim();
  const condition = normalized === "prepaid" ? "advance_payment" : normalized;
  if (!ALLOWED_PAYMENT_CONDITIONS.has(condition)) {
    throw new ValidationError("Invalid customer payment condition");
  }
  return condition;
}

function normalizeCustomerPaymentTermsDays(value) {
  const days = Number(value || 0);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new ValidationError("paymentTermsDays must be between 1 and 365");
  }
  return days;
}
