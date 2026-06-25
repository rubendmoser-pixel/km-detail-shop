import { NotFoundError, ValidationError, basisPoints, normalizeEmail, optionalText, requiredText } from "../domain/validation.js";

const SALES_REP_STATUSES = new Set(["active", "inactive"]);

export function listSalesReps(db, filters = {}) {
  const search = String(filters.search || "").trim();
  const status = String(filters.status || "").trim();
  const where = [];
  const params = [];
  if (status) {
    if (!SALES_REP_STATUSES.has(status)) throw new ValidationError("Invalid sales rep status");
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ? OR whatsapp LIKE ?)");
    params.push(...Array(4).fill(`%${search}%`));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT id, name, email, phone, whatsapp, default_commission_bps, status, notes, created_at, updated_at
    FROM sales_reps
    ${whereSql}
    ORDER BY status = 'inactive', name COLLATE NOCASE
  `).all(...params);
}

export function upsertSalesRep(db, input = {}) {
  const id = Number(input.id || 0);
  const name = requiredText(input.name, "name", { min: 2, max: 160 });
  const email = normalizeEmail(input.email);
  const phone = optionalText(input.phone, "phone", { max: 60 });
  const whatsapp = optionalText(input.whatsapp, "whatsapp", { max: 60 });
  const defaultCommissionBps = basisPoints(Math.round(Number(input.defaultCommissionBps || 0)), "defaultCommissionBps");
  const status = optionalText(input.status, "status", { max: 20 }) || "active";
  if (!SALES_REP_STATUSES.has(status)) throw new ValidationError("Invalid sales rep status");
  const notes = optionalText(input.notes, "notes", { max: 1000 });

  try {
    if (id) {
      const updated = db.prepare(`
        UPDATE sales_reps
        SET name = ?, email = ?, phone = ?, whatsapp = ?, default_commission_bps = ?,
            status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING id, name, email, phone, whatsapp, default_commission_bps, status, notes, created_at, updated_at
      `).get(name, email, phone, whatsapp, defaultCommissionBps, status, notes, id);
      if (!updated) throw new NotFoundError("Sales rep not found");
      return updated;
    }
    return db.prepare(`
      INSERT INTO sales_reps (name, email, phone, whatsapp, default_commission_bps, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, phone, whatsapp, default_commission_bps, status, notes, created_at, updated_at
    `).get(name, email, phone, whatsapp, defaultCommissionBps, status, notes);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Sales rep email already exists");
    throw error;
  }
}

export function assignSalesRepToCustomer(db, customerId, input = {}) {
  const salesRepId = input.salesRepId ? Number(input.salesRepId) : null;
  if (salesRepId) {
    const rep = db.prepare("SELECT id FROM sales_reps WHERE id = ?").get(salesRepId);
    if (!rep) throw new NotFoundError("Sales rep not found");
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
  if (!updated) throw new NotFoundError("Customer not found");
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
