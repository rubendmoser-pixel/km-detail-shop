import { transaction } from "../db.js";
import { ValidationError, NotFoundError, basisPoints, normalizeEmail, optionalText, requiredText } from "../domain/validation.js";
import { hashPassword } from "../security.js";
import {
  ARGENTINA_PROVINCES,
  CUSTOMER_TYPES,
  TAX_CONDITIONS,
  allowedValue,
  normalizeArgentineTaxId,
  normalizePhone,
  normalizePostalCode
} from "./auth-service.js";

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

export async function createAdminCustomer(db, input = {}, adminUserId) {
  const email = normalizeEmail(input.email);
  const password = requiredText(String(input.password || ""), "password", { min: 8, max: 100 });
  const passwordHash = await hashPassword(password);
  const customer = {
    firstName: requiredText(input.firstName, "firstName", { max: 120 }),
    lastName: requiredText(input.lastName, "lastName", { max: 120 }),
    businessName: requiredText(input.businessName, "businessName", { max: 180 }),
    taxId: normalizeArgentineTaxId(input.taxId),
    taxCondition: allowedValue(input.taxCondition, TAX_CONDITIONS, "taxCondition"),
    customerType: allowedValue(input.customerType, CUSTOMER_TYPES, "customerType"),
    industry: requiredText(input.industry, "industry", { max: 120 }),
    city: requiredText(input.city, "city", { min: 2, max: 80 }),
    province: allowedValue(input.province, ARGENTINA_PROVINCES, "province"),
    postalCode: normalizePostalCode(input.postalCode),
    address: requiredText(input.address, "address", { max: 240 }),
    phone: normalizePhone(input.phone, "phone"),
    whatsapp: normalizePhone(input.whatsapp, "whatsapp"),
    contactPerson: requiredText(input.contactPerson, "contactPerson", { max: 160 }),
    notes: optionalText(input.notes, "notes", { max: 2000 })
  };
  const salesRepId = normalizeOptionalSalesRep(db, input.salesRepId);
  const salesCommissionBps = normalizeOptionalCommission(input.commissionBps);
  const commercialClass = normalizeCommercialClass(input.commercialClass || "B");
  const paymentCondition = normalizeCustomerPaymentCondition(input.paymentCondition || "advance_payment");
  const paymentTermsDays = paymentCondition === "credit_account" ? normalizeCustomerPaymentTermsDays(input.paymentTermsDays || 15) : 0;
  const discounts = [
    basisPoints(Number(input.discount1Bps || 0), "discount1Bps"),
    basisPoints(Number(input.discount2Bps || 0), "discount2Bps"),
    basisPoints(Number(input.discount3Bps || 0), "discount3Bps")
  ];
  const now = new Date().toISOString();

  try {
    return transaction(db, () => {
      const user = db.prepare(`
        INSERT INTO users (email, password_hash, role, status)
        VALUES (?, ?, 'customer', 'active')
        RETURNING id, email, role, status
      `).get(email, passwordHash);
      const created = db.prepare(`
        INSERT INTO customers (
          user_id, first_name, last_name, business_name, tax_id, tax_condition, customer_type,
          industry, city, province, postal_code, address, phone, whatsapp, contact_person, notes,
          sales_rep_id, sales_commission_bps, commercial_class, approval_status,
          terms_accepted_at, privacy_accepted_at, approved_at, approved_by,
          payment_condition, payment_terms_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).get(
        user.id, customer.firstName, customer.lastName, customer.businessName, customer.taxId,
        customer.taxCondition, customer.customerType, customer.industry, customer.city,
        customer.province, customer.postalCode, customer.address, customer.phone, customer.whatsapp,
        customer.contactPerson, customer.notes, salesRepId, salesCommissionBps, commercialClass,
        now, now, now, adminUserId, paymentCondition, paymentTermsDays
      );
      db.prepare(`
        INSERT INTO customer_discounts (customer_id, discount_1_bps, discount_2_bps, discount_3_bps, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(created.id, discounts[0], discounts[1], discounts[2], adminUserId);
      db.prepare(`
        INSERT INTO customer_shipping_addresses (
          customer_id, label, recipient, address, city, province, postal_code, contact_phone, notes, is_default
        ) VALUES (?, 'Principal', ?, ?, ?, ?, ?, ?, '', 1)
      `).run(created.id, customer.contactPerson || customer.businessName, customer.address, customer.city, customer.province, customer.postalCode, customer.whatsapp);
      return listCustomers(db, { search: email }).find((row) => row.id === created.id);
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      throw new ValidationError("Email o CUIT ya registrado");
    }
    throw error;
  }
}

export function updateCustomerProfile(db, customerId, input = {}) {
  const existing = db.prepare("SELECT id, user_id FROM customers WHERE id = ?").get(customerId);
  if (!existing) throw new NotFoundError("Customer not found");
  const email = normalizeEmail(input.email);
  const customer = {
    firstName: requiredText(input.firstName, "firstName", { max: 120 }),
    lastName: requiredText(input.lastName, "lastName", { max: 120 }),
    businessName: requiredText(input.businessName, "businessName", { max: 180 }),
    taxId: normalizeArgentineTaxId(input.taxId),
    taxCondition: allowedValue(input.taxCondition, TAX_CONDITIONS, "taxCondition"),
    customerType: allowedValue(input.customerType, CUSTOMER_TYPES, "customerType"),
    industry: requiredText(input.industry, "industry", { max: 120 }),
    city: requiredText(input.city, "city", { min: 2, max: 80 }),
    province: allowedValue(input.province, ARGENTINA_PROVINCES, "province"),
    postalCode: normalizePostalCode(input.postalCode),
    address: requiredText(input.address, "address", { max: 240 }),
    phone: normalizePhone(input.phone, "phone"),
    whatsapp: normalizePhone(input.whatsapp, "whatsapp"),
    contactPerson: requiredText(input.contactPerson, "contactPerson", { max: 160 }),
    notes: optionalText(input.notes, "notes", { max: 2000 })
  };

  try {
    return transaction(db, () => {
      db.prepare(`
        UPDATE users
        SET email = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(email, existing.user_id);
      db.prepare(`
        UPDATE customers
        SET first_name = ?, last_name = ?, business_name = ?, tax_id = ?, tax_condition = ?,
            customer_type = ?, industry = ?, city = ?, province = ?, postal_code = ?, address = ?,
            phone = ?, whatsapp = ?, contact_person = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        customer.firstName,
        customer.lastName,
        customer.businessName,
        customer.taxId,
        customer.taxCondition,
        customer.customerType,
        customer.industry,
        customer.city,
        customer.province,
        customer.postalCode,
        customer.address,
        customer.phone,
        customer.whatsapp,
        customer.contactPerson,
        customer.notes,
        customerId
      );
      return listCustomers(db).find((row) => row.id === customerId);
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      throw new ValidationError("Email o CUIT ya registrado");
    }
    throw error;
  }
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

export function listCustomerProductDiscounts(db, customerId) {
  ensureCustomer(db, customerId);
  return db.prepare(`
    SELECT cpd.id, cpd.customer_id, cpd.product_id, cpd.discount_bps, cpd.starts_at,
           cpd.ends_at, cpd.active, cpd.note, cpd.updated_at,
           p.km_code, p.ean13, p.name, p.base_price_cents
    FROM customer_product_discounts cpd
    JOIN products p ON p.id = cpd.product_id
    WHERE cpd.customer_id = ?
    ORDER BY cpd.active DESC, p.km_code
  `).all(customerId).map(customerProductDiscount);
}

export function upsertCustomerProductDiscount(db, customerId, input = {}, adminUserId) {
  ensureCustomer(db, customerId);
  const product = resolveProductForSpecialDiscount(db, input);
  const discountBps = basisPoints(Number(input.discountBps || 0), "discountBps");
  if (discountBps <= 0) throw new ValidationError("discountBps must be greater than zero");
  const startsAt = optionalDate(input.startsAt, "startsAt");
  const endsAt = optionalDate(input.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt > endsAt) throw new ValidationError("startsAt cannot be after endsAt");
  const active = input.active === false ? 0 : 1;
  const note = optionalText(input.note, "note", { max: 500 });
  const row = db.prepare(`
    INSERT INTO customer_product_discounts (
      customer_id, product_id, discount_bps, starts_at, ends_at, active, note, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_id, product_id) DO UPDATE SET
      discount_bps = excluded.discount_bps,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      active = excluded.active,
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = excluded.updated_by
    RETURNING id
  `).get(customerId, product.id, discountBps, startsAt, endsAt, active, note, adminUserId);
  return listCustomerProductDiscounts(db, customerId).find((item) => item.id === row.id);
}

export function deleteCustomerProductDiscount(db, customerId, discountId) {
  ensureCustomer(db, customerId);
  const result = db.prepare("DELETE FROM customer_product_discounts WHERE id = ? AND customer_id = ?").run(discountId, customerId);
  if (!result.changes) throw new NotFoundError("Special discount not found");
  return { ok: true };
}

export function activeCustomerProductDiscountsByProduct(db, customerId, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT cpd.product_id, cpd.discount_bps, cpd.note
    FROM customer_product_discounts cpd
    JOIN products p ON p.id = cpd.product_id
    WHERE cpd.customer_id = ?
      AND cpd.active = 1
      AND cpd.discount_bps > 0
      AND (cpd.starts_at = '' OR cpd.starts_at <= ?)
      AND (cpd.ends_at = '' OR cpd.ends_at >= ?)
      AND p.active = 1
  `).all(customerId, today, today);
  return new Map(rows.map((row) => [row.product_id, {
    active: true,
    bps: row.discount_bps || 0,
    note: row.note || ""
  }]));
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

function ensureCustomer(db, customerId) {
  const id = Number(customerId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("customerId is invalid");
  const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(id);
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

function resolveProductForSpecialDiscount(db, input = {}) {
  const productId = Number(input.productId || 0);
  if (Number.isSafeInteger(productId) && productId > 0) {
    const product = db.prepare("SELECT id, km_code FROM products WHERE id = ?").get(productId);
    if (!product) throw new NotFoundError("Product not found");
    return product;
  }
  const kmCode = requiredText(input.kmCode || "", "kmCode", { max: 30 }).toUpperCase();
  const product = db.prepare("SELECT id, km_code FROM products WHERE km_code = ?").get(kmCode);
  if (!product) throw new NotFoundError("Product not found");
  return product;
}

function optionalDate(value, field) {
  const text = optionalText(value, field, { max: 10 });
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  return text;
}

function customerProductDiscount(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    productId: row.product_id,
    kmCode: row.km_code,
    ean13: row.ean13,
    productName: row.name,
    basePriceCents: row.base_price_cents,
    discountBps: row.discount_bps || 0,
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    active: Boolean(row.active),
    note: row.note || "",
    updatedAt: row.updated_at
  };
}

function normalizeOptionalSalesRep(db, value) {
  const id = Number(value || 0);
  if (!id) return null;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("salesRepId is invalid");
  const rep = db.prepare("SELECT id FROM sales_reps WHERE id = ?").get(id);
  if (!rep) throw new NotFoundError("Sales rep not found");
  return id;
}

function normalizeOptionalCommission(value) {
  if (value === undefined || value === null || value === "") return null;
  return basisPoints(Number(value), "commissionBps");
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
