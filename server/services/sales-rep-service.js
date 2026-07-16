import { randomUUID } from "node:crypto";
import { transaction } from "../db.js";
import { createSessionToken, hashPassword, hashToken, verifyPassword } from "../security.js";
import { AuthError, NotFoundError, ValidationError, basisPoints, normalizeEmail, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import {
  ARGENTINA_PROVINCES,
  CUSTOMER_TYPES,
  TAX_CONDITIONS,
  allowedValue,
  normalizeArgentineTaxId,
  normalizePhone,
  normalizePostalCode
} from "./auth-service.js";

const SALES_REP_STATUSES = new Set(["active", "inactive"]);

export async function requestCommercialCustomer(db, salesRep, input = {}) {
  const salesRepId = positiveInteger(Number(salesRep?.id), "salesRepId");
  const email = normalizeEmail(input.email);
  const businessName = requiredText(input.businessName, "businessName", { min: 2, max: 160 });
  const taxId = normalizeArgentineTaxId(input.taxId);
  const taxCondition = allowedValue(input.taxCondition, TAX_CONDITIONS, "taxCondition");
  const customerType = allowedValue(input.customerType, CUSTOMER_TYPES, "customerType");
  const industry = requiredText(input.industry, "industry", { min: 2, max: 120 });
  const city = requiredText(input.city, "city", { min: 2, max: 120 });
  const province = allowedValue(input.province, ARGENTINA_PROVINCES, "province");
  const postalCode = normalizePostalCode(input.postalCode);
  const address = requiredText(input.address, "address", { min: 3, max: 180 });
  const phone = normalizePhone(input.phone, "phone");
  const whatsapp = normalizePhone(input.whatsapp, "whatsapp");
  const contactPerson = requiredText(input.contactPerson, "contactPerson", { min: 2, max: 140 });
  const nameParts = contactPerson.split(/\s+/).filter(Boolean);
  const firstName = optionalText(input.firstName, "firstName", { max: 80 }) || nameParts[0] || contactPerson;
  const lastName = optionalText(input.lastName, "lastName", { max: 80 }) || nameParts.slice(1).join(" ") || ".";
  const notes = optionalText(input.notes, "notes", { max: 1000 });
  const sellerNote = `Solicitud iniciada por vendedor: ${salesRep.name || "Vendedor"} (${salesRep.email || ""}).`;
  const combinedNotes = notes ? `${sellerNote}\n${notes}` : sellerNote;
  const passwordHash = await hashPassword(randomUUID());
  const acceptedAt = new Date().toISOString();

  try {
    return transaction(db, () => {
      const user = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'customer') RETURNING id, email, role, status").get(email, passwordHash);
      const customer = db.prepare(`
        INSERT INTO customers (
          user_id, first_name, last_name, business_name, tax_id, tax_condition, customer_type,
          industry, city, province, postal_code, address, phone, whatsapp, contact_person, notes,
          sales_rep_id, requested_by_sales_rep_id, terms_accepted_at, privacy_accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, approval_status, business_name, contact_person
      `).get(
        user.id, firstName, lastName, businessName, taxId, taxCondition, customerType,
        industry, city, province, postalCode, address, phone, whatsapp, contactPerson, combinedNotes,
        salesRepId, salesRepId, acceptedAt, acceptedAt
      );
      db.prepare("INSERT INTO customer_discounts (customer_id) VALUES (?)").run(customer.id);
      return {
        user,
        customer: {
          id: customer.id,
          approvalStatus: customer.approval_status,
          businessName: customer.business_name,
          contactPerson: customer.contact_person
        }
      };
    });
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe una cuenta registrada con ese email o CUIT.", { field: "email", code: "duplicate" });
    throw error;
  }
}

export function listSalesReps(db, filters = {}) {
  const search = String(filters.search || "").trim();
  const status = String(filters.status || "").trim();
  const where = [];
  const params = [];
  if (status) {
    if (!SALES_REP_STATUSES.has(status)) throw new ValidationError("El estado del vendedor no es válido.", { field: "status", code: "invalid" });
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ? OR whatsapp LIKE ?)");
    params.push(...Array(4).fill(`%${search}%`));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT id, name, email, phone, whatsapp,
           bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
           default_commission_bps, status, notes, created_at, updated_at,
           CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM sales_reps
    ${whereSql}
    ORDER BY status = 'inactive', name COLLATE NOCASE
  `).all(...params);
}

export function getSalesRepDashboard(db) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const salesReps = listSalesReps(db);
  const customersByRep = keyedBySalesRep(db.prepare(`
    SELECT sales_rep_id,
           COUNT(*) AS customer_count,
           SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END) AS approved_customer_count
    FROM customers
    WHERE sales_rep_id IS NOT NULL
    GROUP BY sales_rep_id
  `).all());
  const monthOrdersByRep = keyedBySalesRep(db.prepare(`
    SELECT sales_rep_id,
           COUNT(*) AS orders_count,
           SUM(total_cents) AS total_cents,
           SUM(paid_cents) AS paid_cents,
           SUM(balance_cents) AS balance_cents,
           SUM(sales_commission_cents) AS commission_cents,
           MAX(created_at) AS last_order_at
    FROM orders
    WHERE sales_rep_id IS NOT NULL
      AND status != 'cancelled'
      AND created_at >= ?
    GROUP BY sales_rep_id
  `).all(monthStart));
  const pendingByRep = keyedBySalesRep(db.prepare(`
    SELECT sales_rep_id,
           COUNT(*) AS pending_orders,
           SUM(sales_commission_base_cents) AS pending_base_cents,
           SUM(sales_commission_cents) AS pending_commission_cents
    FROM orders
    WHERE sales_rep_id IS NOT NULL
      AND sales_commission_cents > 0
      AND sales_commission_settlement_id IS NULL
      AND status != 'cancelled'
      AND payment_status IN ('paid', 'settled_adjustment')
      AND balance_cents = 0
    GROUP BY sales_rep_id
  `).all());
  const settledByRep = keyedBySalesRep(db.prepare(`
    SELECT sales_rep_id,
           COUNT(*) AS settlements_count,
           SUM(commission_cents) AS settled_commission_cents,
           MAX(created_at) AS last_settlement_at
    FROM sales_commission_settlements
    WHERE created_at >= ?
    GROUP BY sales_rep_id
  `).all(monthStart));

  const reps = salesReps.map((rep) => {
    const customer = customersByRep.get(rep.id) || {};
    const month = monthOrdersByRep.get(rep.id) || {};
    const pending = pendingByRep.get(rep.id) || {};
    const settled = settledByRep.get(rep.id) || {};
    return {
      id: rep.id,
      name: rep.name,
      email: rep.email,
      status: rep.status,
      defaultCommissionBps: rep.default_commission_bps,
      customerCount: Number(customer.customer_count || 0),
      approvedCustomerCount: Number(customer.approved_customer_count || 0),
      monthOrders: Number(month.orders_count || 0),
      monthTotalCents: Number(month.total_cents || 0),
      monthPaidCents: Number(month.paid_cents || 0),
      monthBalanceCents: Number(month.balance_cents || 0),
      monthCommissionCents: Number(month.commission_cents || 0),
      pendingOrders: Number(pending.pending_orders || 0),
      pendingBaseCents: Number(pending.pending_base_cents || 0),
      pendingCommissionCents: Number(pending.pending_commission_cents || 0),
      settledCommissionCents: Number(settled.settled_commission_cents || 0),
      settlementsCount: Number(settled.settlements_count || 0),
      lastOrderAt: month.last_order_at || "",
      lastSettlementAt: settled.last_settlement_at || ""
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    period: { from: monthStart, to: today },
    summary: {
      activeSalesReps: reps.filter((rep) => rep.status === "active").length,
      assignedCustomers: reps.reduce((total, rep) => total + rep.customerCount, 0),
      monthOrders: reps.reduce((total, rep) => total + rep.monthOrders, 0),
      monthTotalCents: reps.reduce((total, rep) => total + rep.monthTotalCents, 0),
      monthPaidCents: reps.reduce((total, rep) => total + rep.monthPaidCents, 0),
      pendingCommissionCents: reps.reduce((total, rep) => total + rep.pendingCommissionCents, 0),
      settledCommissionCents: reps.reduce((total, rep) => total + rep.settledCommissionCents, 0)
    },
    reps: reps.sort((a, b) => b.monthTotalCents - a.monthTotalCents || b.pendingCommissionCents - a.pendingCommissionCents || a.name.localeCompare(b.name))
  };
}

export function getSalesRepProfile(db, salesRepId) {
  const id = positiveInteger(Number(salesRepId), "salesRepId");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const rep = db.prepare(`
    SELECT id, name, email, phone, whatsapp,
           bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
           default_commission_bps, status, notes, created_at, updated_at,
           CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM sales_reps
    WHERE id = ?
  `).get(id);
  if (!rep) throw new NotFoundError("Vendedor no encontrado");

  const customers = db.prepare(`
    SELECT c.id, c.business_name, c.tax_id, c.approval_status, c.commercial_class,
           c.city, c.province, c.sales_commission_bps,
           u.email
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.sales_rep_id = ?
    ORDER BY c.approval_status = 'approved' DESC, c.business_name COLLATE NOCASE
    LIMIT 80
  `).all(id);

  const recentOrders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
           o.total_cents, o.paid_cents, o.balance_cents,
           o.sales_commission_bps, o.sales_commission_base_cents, o.sales_commission_cents,
           o.sales_commission_settlement_id, o.created_at, o.updated_at,
           c.business_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.sales_rep_id = ?
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 12
  `).all(id);

  const settlements = db.prepare(`
    SELECT id, settlement_number, period_from, period_to, orders_count,
           commission_base_cents, commission_cents, created_at
    FROM sales_commission_settlements
    WHERE sales_rep_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 8
  `).all(id);

  const orderSummary = db.prepare(`
    SELECT COUNT(*) AS total_orders,
           SUM(CASE WHEN status != 'cancelled' AND fulfillment_status != 'delivered' THEN 1 ELSE 0 END) AS open_orders,
           SUM(CASE WHEN status != 'cancelled' AND created_at >= ? THEN total_cents ELSE 0 END) AS month_total_cents,
           SUM(CASE WHEN status != 'cancelled' AND created_at >= ? THEN paid_cents ELSE 0 END) AS month_paid_cents
    FROM orders
    WHERE sales_rep_id = ?
  `).get(monthStart, monthStart, id) || {};

  const pending = db.prepare(`
    SELECT COUNT(*) AS pending_orders,
           SUM(sales_commission_base_cents) AS pending_base_cents,
           SUM(sales_commission_cents) AS pending_commission_cents
    FROM orders
    WHERE sales_rep_id = ?
      AND sales_commission_cents > 0
      AND sales_commission_settlement_id IS NULL
      AND status != 'cancelled'
      AND payment_status IN ('paid', 'settled_adjustment')
      AND balance_cents = 0
  `).get(id) || {};

  const settled = db.prepare(`
    SELECT COUNT(*) AS settlements_count,
           SUM(commission_cents) AS settled_commission_cents
    FROM sales_commission_settlements
    WHERE sales_rep_id = ?
  `).get(id) || {};

  return {
    salesRep: {
      id: rep.id,
      name: rep.name,
      email: rep.email,
      phone: rep.phone,
      whatsapp: rep.whatsapp,
      bankName: rep.bank_name,
      bankAccountHolder: rep.bank_account_holder,
      bankTaxId: rep.bank_tax_id,
      bankAccountType: rep.bank_account_type,
      bankCbu: rep.bank_cbu,
      bankAlias: rep.bank_alias,
      defaultCommissionBps: rep.default_commission_bps,
      status: rep.status,
      notes: rep.notes,
      hasPortalAccess: Boolean(rep.has_portal_access),
      createdAt: rep.created_at,
      updatedAt: rep.updated_at
    },
    summary: {
      customerCount: customers.length,
      approvedCustomerCount: customers.filter((customer) => customer.approval_status === "approved").length,
      totalOrders: Number(orderSummary.total_orders || 0),
      openOrders: Number(orderSummary.open_orders || 0),
      monthTotalCents: Number(orderSummary.month_total_cents || 0),
      monthPaidCents: Number(orderSummary.month_paid_cents || 0),
      pendingOrders: Number(pending.pending_orders || 0),
      pendingBaseCents: Number(pending.pending_base_cents || 0),
      pendingCommissionCents: Number(pending.pending_commission_cents || 0),
      settlementsCount: Number(settled.settlements_count || 0),
      settledCommissionCents: Number(settled.settled_commission_cents || 0)
    },
    customers,
    recentOrders,
    settlements
  };
}

export async function upsertSalesRep(db, input = {}) {
  const id = Number(input.id || 0);
  const existing = id ? db.prepare("SELECT id, password_hash FROM sales_reps WHERE id = ?").get(id) : null;
  if (id && !existing) throw new NotFoundError("Vendedor no encontrado");
  const name = requiredText(input.name, "name", { min: 2, max: 160 });
  const email = normalizeEmail(input.email);
  const phone = optionalText(input.phone, "phone", { max: 60 });
  const whatsapp = optionalText(input.whatsapp, "whatsapp", { max: 60 });
  const bankName = optionalText(input.bankName, "bankName", { max: 120 });
  const bankAccountHolder = optionalText(input.bankAccountHolder, "bankAccountHolder", { max: 160 });
  const bankTaxId = optionalText(input.bankTaxId, "bankTaxId", { max: 30 });
  const bankAccountType = optionalText(input.bankAccountType, "bankAccountType", { max: 80 });
  const bankCbu = optionalText(input.bankCbu, "bankCbu", { max: 40 });
  const bankAlias = optionalText(input.bankAlias, "bankAlias", { max: 80 });
  const defaultCommissionBps = basisPoints(Math.round(Number(input.defaultCommissionBps || 0)), "defaultCommissionBps");
  const status = optionalText(input.status, "status", { max: 20 }) || "active";
  if (!SALES_REP_STATUSES.has(status)) throw new ValidationError("El estado del vendedor no es válido.", { field: "status", code: "invalid" });
  const notes = optionalText(input.notes, "notes", { max: 1000 });
  const portalPassword = optionalText(input.portalPassword, "portalPassword", { max: 200 });
  const portalAccessEnabled = input.portalAccessEnabled === undefined
    ? Boolean(portalPassword || existing?.password_hash)
    : input.portalAccessEnabled === true;
  if (portalAccessEnabled && !portalPassword && !existing?.password_hash) {
    throw new ValidationError("Ingresá una clave de al menos 10 caracteres para habilitar el acceso.", { field: "portalPassword", code: "required" });
  }
  let passwordHash = portalAccessEnabled ? (existing?.password_hash || "") : "";
  if (portalAccessEnabled && portalPassword) {
    try {
      passwordHash = await hashPassword(portalPassword);
    } catch {
      throw new ValidationError("La clave del vendedor debe tener entre 10 y 200 caracteres.", { field: "portalPassword", code: "length", min: 10, max: 200 });
    }
  }

  try {
    if (id) {
      const params = [
        name, email, phone, whatsapp,
        bankName, bankAccountHolder, bankTaxId, bankAccountType, bankCbu, bankAlias,
        defaultCommissionBps, status, notes, passwordHash
      ];
      params.push(id);
      const updated = db.prepare(`
        UPDATE sales_reps
        SET name = ?, email = ?, phone = ?, whatsapp = ?,
            bank_name = ?, bank_account_holder = ?, bank_tax_id = ?, bank_account_type = ?, bank_cbu = ?, bank_alias = ?,
            default_commission_bps = ?,
            status = ?, notes = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(...params);
      if (!updated.changes) throw new NotFoundError("Vendedor no encontrado");
      return getSalesRepRow(db, id);
    }
    const inserted = db.prepare(`
      INSERT INTO sales_reps (
        name, email, phone, whatsapp,
        bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
        password_hash, default_commission_bps, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      name, email, phone, whatsapp,
      bankName, bankAccountHolder, bankTaxId, bankAccountType, bankCbu, bankAlias,
      passwordHash, defaultCommissionBps, status, notes
    );
    return getSalesRepRow(db, inserted.id);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe un vendedor con ese email.", { field: "email", code: "duplicate" });
    throw error;
  }
}

function getSalesRepRow(db, id) {
  const row = db.prepare(`
    SELECT id, name, email, phone, whatsapp,
           bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
           default_commission_bps, status, notes, created_at, updated_at,
           CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM sales_reps
    WHERE id = ?
  `).get(id);
  if (!row) throw new NotFoundError("Vendedor no encontrado");
  return row;
}

function publicSalesRep(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    whatsapp: row.whatsapp || "",
    status: row.status,
    hasPortalAccess: Boolean(row.has_portal_access),
    defaultCommissionBps: row.default_commission_bps || 0
  };
}

export async function loginSalesRep(db, input = {}, sessionDays = 30) {
  const email = normalizeEmail(input.email);
  const password = requiredText(input.password, "password", { min: 1, max: 200 });
  const row = db.prepare(`
    SELECT id, name, email, phone, whatsapp, default_commission_bps, status, password_hash,
           CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM sales_reps
    WHERE email = ?
  `).get(email);
  if (!row || row.status !== "active" || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("Email o clave incorrectos", 401);
  }
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO sales_rep_sessions (sales_rep_id, token_hash, expires_at) VALUES (?, ?, ?)").run(row.id, tokenHash, expiresAt);
  return { salesRep: publicSalesRep(row), token, expiresAt };
}

export async function createSalesRepPasswordReset(db, rawEmail) {
  const email = normalizeEmail(rawEmail);
  const row = db.prepare(`
    SELECT id, email, status, password_hash
    FROM sales_reps
    WHERE email = ?
  `).get(email);
  if (!row || row.status !== "active" || !row.password_hash) return null;
  const { token, tokenHash } = createSessionToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  transaction(db, () => {
    db.prepare("DELETE FROM sales_rep_password_reset_tokens WHERE sales_rep_id = ? OR expires_at <= ?").run(row.id, now);
    db.prepare("INSERT INTO sales_rep_password_reset_tokens (sales_rep_id, token_hash, expires_at) VALUES (?, ?, ?)")
      .run(row.id, tokenHash, expiresAt);
  });
  return { salesRepId: row.id, email: row.email, token, expiresAt };
}

export async function resetSalesRepPassword(db, token, password) {
  const normalizedToken = requiredText(token, "token", { min: 20, max: 500 });
  const reset = db.prepare(`
    SELECT srprt.*, sr.email
    FROM sales_rep_password_reset_tokens srprt
    JOIN sales_reps sr ON sr.id = srprt.sales_rep_id
    WHERE srprt.token_hash = ?
      AND srprt.used_at IS NULL
      AND srprt.expires_at > ?
      AND sr.status = 'active'
  `).get(hashToken(normalizedToken), new Date().toISOString());
  if (!reset) throw new ValidationError("El enlace de recuperacion es invalido o vencio");
  let passwordHash;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    throw new ValidationError("La clave debe tener entre 10 y 200 caracteres");
  }
  transaction(db, () => {
    db.prepare("UPDATE sales_reps SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, reset.sales_rep_id);
    db.prepare("UPDATE sales_rep_password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(reset.id);
    db.prepare("DELETE FROM sales_rep_sessions WHERE sales_rep_id = ?").run(reset.sales_rep_id);
  });
  return { ok: true };
}

export async function changeSalesRepPassword(db, salesRepId, input = {}) {
  const id = positiveInteger(Number(salesRepId), "salesRepId");
  const currentPassword = requiredText(input.currentPassword, "currentPassword", { min: 1, max: 200 });
  const nextPassword = input.password || input.newPassword;
  const row = db.prepare("SELECT id, status, password_hash FROM sales_reps WHERE id = ?").get(id);
  if (!row || row.status !== "active" || !row.password_hash || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new AuthError("La clave actual no es correcta", 401);
  }
  let passwordHash;
  try {
    passwordHash = await hashPassword(nextPassword);
  } catch {
    throw new ValidationError("La clave debe tener entre 10 y 200 caracteres");
  }
  transaction(db, () => {
    db.prepare("UPDATE sales_reps SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, row.id);
    db.prepare("DELETE FROM sales_rep_sessions WHERE sales_rep_id = ?").run(row.id);
  });
  return { ok: true };
}

export function authenticateSalesRep(db, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT sr.id, sr.name, sr.email, sr.phone, sr.whatsapp, sr.default_commission_bps, sr.status,
           CASE WHEN sr.password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM sales_rep_sessions s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND sr.status = 'active'
  `).get(tokenHash, new Date().toISOString());
  return row ? publicSalesRep(row) : null;
}

export function logoutSalesRep(db, token) {
  if (!token) return;
  db.prepare("DELETE FROM sales_rep_sessions WHERE token_hash = ?").run(hashToken(token));
}

export function requireSalesRep(salesRep) {
  if (!salesRep) throw new AuthError("Se requiere iniciar sesion como vendedor", 401);
  return salesRep;
}

export function getSalesRepPortalDashboard(db, salesRepId) {
  const id = positiveInteger(Number(salesRepId), "salesRepId");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const customers = db.prepare(`
    SELECT c.id, c.business_name, c.tax_id, c.approval_status, c.commercial_class,
           c.city, c.province, c.phone, c.whatsapp, c.contact_person,
           u.email
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.sales_rep_id = ?
    ORDER BY c.approval_status = 'approved' DESC, c.business_name COLLATE NOCASE
  `).all(id);
  const orders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.payment_status, o.fulfillment_status,
           o.total_cents, o.paid_cents, o.balance_cents, o.payment_due_date,
           o.sales_commission_bps, o.sales_commission_base_cents, o.sales_commission_cents,
           o.sales_commission_settlement_id, o.created_by_role, o.created_by_sales_rep_id,
           o.created_at, o.updated_at,
           c.business_name, c.commercial_class
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE (o.sales_rep_id = ? OR c.sales_rep_id = ?)
      AND o.status != 'cancelled'
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 120
  `).all(id, id);
  const monthOrders = orders.filter((order) => String(order.created_at || "").slice(0, 10) >= monthStart);
  const closedFulfillmentStatuses = new Set(["delivered", "customer_received"]);
  const openOrders = orders.filter((order) => !closedFulfillmentStatuses.has(order.fulfillment_status));
  const pendingCommission = orders
    .filter((order) => Number(order.sales_commission_cents || 0) > 0
      && !order.sales_commission_settlement_id
      && Number(order.balance_cents || 0) === 0
      && ["paid", "settled_adjustment"].includes(order.payment_status))
    .reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0);
  const settledCommission = db.prepare(`
    SELECT SUM(commission_cents) AS settled_commission_cents
    FROM sales_commission_settlements
    WHERE sales_rep_id = ?
  `).get(id) || {};
  const generatedCommission = monthOrders
    .reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0);
  const monthTotal = monthOrders.reduce((total, order) => total + Number(order.total_cents || 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    salesRepId: id,
    period: { from: monthStart, to: today },
    summary: {
      customerCount: customers.length,
      approvedCustomerCount: customers.filter((customer) => customer.approval_status === "approved").length,
      openOrders: openOrders.length,
      monthOrders: monthOrders.length,
      monthTotalCents: monthTotal,
      generatedSalesCents: monthTotal,
      generatedCommissionCents: generatedCommission,
      balanceCents: openOrders.reduce((total, order) => total + Number(order.balance_cents || 0), 0),
      pendingCommissionCents: pendingCommission,
      commissionToSettleCents: pendingCommission,
      settledCommissionCents: Number(settledCommission.settled_commission_cents || 0),
      settlementBalanceCents: pendingCommission
    },
    customers,
    orders
  };
}

export function getAssignedApprovedCustomerForSalesRep(db, salesRepId, customerId) {
  const repId = positiveInteger(Number(salesRepId), "salesRepId");
  const id = positiveInteger(Number(customerId), "customerId");
  const customer = db.prepare(`
    SELECT c.id, c.user_id, c.business_name, c.approval_status, c.sales_rep_id,
           (
        SELECT sa.id
        FROM customer_shipping_addresses sa
        WHERE sa.customer_id = c.id
        ORDER BY sa.is_default DESC, sa.id ASC
        LIMIT 1
      ) AS default_shipping_address_id
    FROM customers c
    WHERE c.id = ? AND c.sales_rep_id = ?
  `).get(id, repId);
  if (!customer) throw new NotFoundError("Cliente no asignado al vendedor");
  if (customer.approval_status !== "approved") throw new ValidationError("El cliente no esta aprobado");
  return customer;
}

function keyedBySalesRep(rows) {
  return new Map(rows.map((row) => [Number(row.sales_rep_id), row]));
}

export function listPendingSalesCommissions(db, filters = {}) {
  const salesRepId = Number(filters.salesRepId || 0);
  const params = [];
  const where = [
    "o.sales_rep_id IS NOT NULL",
    "o.sales_commission_cents > 0",
    "o.sales_commission_settlement_id IS NULL",
    "o.status != 'cancelled'",
    "o.payment_status IN ('paid', 'settled_adjustment')",
    "o.balance_cents = 0"
  ];
  if (salesRepId) {
    where.push("o.sales_rep_id = ?");
    params.push(salesRepId);
  }
  return db.prepare(`
    SELECT o.id, o.order_number, o.created_at, o.updated_at, o.total_cents, o.subtotal_net_cents,
           o.paid_cents, o.sales_rep_id, o.sales_rep_name, o.sales_rep_email,
           o.sales_commission_bps, o.sales_commission_base_cents, o.sales_commission_cents,
           c.business_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE ${where.join(" AND ")}
    ORDER BY o.sales_rep_name COLLATE NOCASE, o.updated_at, o.order_number
  `).all(...params);
}

export function listSalesCommissionSettlements(db, filters = {}) {
  const salesRepId = Number(filters.salesRepId || 0);
  const params = [];
  const where = [];
  if (salesRepId) {
    where.push("sales_rep_id = ?");
    params.push(salesRepId);
  }
  return db.prepare(`
    SELECT id, settlement_number, sales_rep_id, sales_rep_name, sales_rep_email,
           period_from, period_to, orders_count, commission_base_cents, commission_cents,
           notes, created_at
    FROM sales_commission_settlements
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT 80
  `).all(...params);
}

export function createSalesCommissionSettlement(db, input = {}, userId = null) {
  const salesRepId = positiveInteger(Number(input.salesRepId), "salesRepId");
  const orderIds = Array.isArray(input.orderIds)
    ? [...new Set(input.orderIds.map((id) => Number(id)).filter(Number.isSafeInteger))]
    : [];
  if (!orderIds.length) throw new ValidationError("Selecciona al menos un pedido para liquidar");
  const notes = optionalText(input.notes, "notes", { max: 1000 });

  db.exec("BEGIN IMMEDIATE");
  try {
    const rep = db.prepare(`
      SELECT id, name, email, bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias
      FROM sales_reps
      WHERE id = ?
    `).get(salesRepId);
    if (!rep) throw new NotFoundError("Vendedor no encontrado");

    const placeholders = orderIds.map(() => "?").join(",");
    const orders = db.prepare(`
      SELECT o.id, o.order_number, o.created_at, o.updated_at, o.subtotal_net_cents,
             o.sales_commission_bps, o.sales_commission_base_cents, o.sales_commission_cents,
             c.business_name
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id IN (${placeholders})
        AND o.sales_rep_id = ?
        AND o.sales_commission_cents > 0
        AND o.sales_commission_settlement_id IS NULL
        AND o.status != 'cancelled'
        AND o.payment_status IN ('paid', 'settled_adjustment')
        AND o.balance_cents = 0
      ORDER BY o.updated_at, o.order_number
    `).all(...orderIds, salesRepId);
    if (orders.length !== orderIds.length) {
      throw new ValidationError("Hay pedidos seleccionados que no estan cobrados o ya fueron liquidados");
    }

    const periodFrom = orders.map((order) => order.created_at).sort()[0]?.slice(0, 10) || "";
    const periodTo = orders.map((order) => order.created_at).sort().at(-1)?.slice(0, 10) || "";
    const commissionBaseCents = orders.reduce((total, order) => total + Number(order.sales_commission_base_cents || order.subtotal_net_cents || 0), 0);
    const commissionCents = orders.reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0);
    const bankSnapshot = JSON.stringify({
      bankName: rep.bank_name || "",
      accountHolder: rep.bank_account_holder || rep.name,
      taxId: rep.bank_tax_id || "",
      accountType: rep.bank_account_type || "",
      cbu: rep.bank_cbu || "",
      alias: rep.bank_alias || ""
    });

    const settlement = db.prepare(`
      INSERT INTO sales_commission_settlements (
        settlement_number, sales_rep_id, sales_rep_name, sales_rep_email,
        period_from, period_to, orders_count, commission_base_cents, commission_cents,
        bank_snapshot_json, notes, created_by
      )
      VALUES ('TEMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, settlement_number, sales_rep_id, sales_rep_name, sales_rep_email,
                period_from, period_to, orders_count, commission_base_cents, commission_cents,
                bank_snapshot_json, notes, created_at
    `).get(
      rep.id, rep.name, rep.email,
      periodFrom, periodTo, orders.length, commissionBaseCents, commissionCents,
      bankSnapshot, notes, userId
    );
    const settlementNumber = `LC-${new Date().getFullYear()}-${String(settlement.id).padStart(6, "0")}`;
    db.prepare("UPDATE sales_commission_settlements SET settlement_number = ? WHERE id = ?").run(settlementNumber, settlement.id);

    const insertItem = db.prepare(`
      INSERT INTO sales_commission_settlement_items (
        settlement_id, order_id, order_number, business_name, order_created_at, order_paid_at,
        subtotal_net_cents, commission_bps, commission_cents
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateOrder = db.prepare(`
      UPDATE orders
      SET sales_commission_settlement_id = ?, sales_commission_settled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    for (const order of orders) {
      insertItem.run(
        settlement.id, order.id, order.order_number, order.business_name, order.created_at, order.updated_at || "",
        order.sales_commission_base_cents || order.subtotal_net_cents || 0,
        order.sales_commission_bps || 0,
        order.sales_commission_cents || 0
      );
      updateOrder.run(settlement.id, order.id);
    }

    const eventStmt = db.prepare(`
      INSERT INTO order_events (order_id, actor_user_id, event_type, reason, after_json)
      VALUES (?, ?, 'commission_settled', ?, ?)
    `);
    for (const order of orders) {
      eventStmt.run(order.id, userId, `Liquidacion ${settlementNumber}`, JSON.stringify({ settlementId: settlement.id, settlementNumber }));
    }

    db.exec("COMMIT");
    return getSalesCommissionSettlement(db, settlement.id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSalesCommissionSettlement(db, settlementId) {
  const id = positiveInteger(Number(settlementId), "settlementId");
  const settlement = db.prepare(`
    SELECT id, settlement_number, sales_rep_id, sales_rep_name, sales_rep_email,
           period_from, period_to, orders_count, commission_base_cents, commission_cents,
           bank_snapshot_json, notes, created_at
    FROM sales_commission_settlements
    WHERE id = ?
  `).get(id);
  if (!settlement) throw new NotFoundError("Liquidacion no encontrada");
  const items = db.prepare(`
    SELECT id, order_id, order_number, business_name, order_created_at, order_paid_at,
           subtotal_net_cents, commission_bps, commission_cents
    FROM sales_commission_settlement_items
    WHERE settlement_id = ?
    ORDER BY order_paid_at, order_number
  `).all(id);
  return {
    ...settlement,
    bank: JSON.parse(settlement.bank_snapshot_json || "{}"),
    items
  };
}

export function assignSalesRepToCustomer(db, customerId, input = {}) {
  const salesRepId = input.salesRepId ? Number(input.salesRepId) : null;
  if (salesRepId) {
    const rep = db.prepare("SELECT id FROM sales_reps WHERE id = ?").get(salesRepId);
    if (!rep) throw new NotFoundError("Vendedor no encontrado");
  }
  const commissionBps = input.commissionBps === null || input.commissionBps === undefined || input.commissionBps === ""
    ? null
    : basisPoints(Math.round(Number(input.commissionBps)), "commissionBps");
  const updated = db.prepare(`
    UPDATE customers
    SET sales_rep_id = ?, sales_commission_bps = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING id, sales_rep_id, sales_commission_bps
  `).get(salesRepId, commissionBps, customerId);
  if (!updated) throw new NotFoundError("Cliente no encontrado");
  return updated;
}

export function resolveCustomerSalesRep(db, customerId) {
  const row = db.prepare(`
    SELECT sr.id, sr.name, sr.email, sr.default_commission_bps,
           c.sales_commission_bps
    FROM customers c
    LEFT JOIN sales_reps sr ON sr.id = c.sales_rep_id AND sr.status = 'active'
    WHERE c.id = ?
  `).get(customerId);
  if (!row || !row.id) {
    return { id: null, name: "", email: "", commissionBps: 0 };
  }
  const commissionBps = row.sales_commission_bps === null || row.sales_commission_bps === undefined
    ? row.default_commission_bps
    : row.sales_commission_bps;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    commissionBps
  };
}
