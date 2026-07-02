import { NotFoundError, ValidationError, basisPoints, normalizeEmail, optionalText, positiveInteger, requiredText } from "../domain/validation.js";

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
    SELECT id, name, email, phone, whatsapp,
           bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
           default_commission_bps, status, notes, created_at, updated_at
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
  const bankName = optionalText(input.bankName, "bankName", { max: 120 });
  const bankAccountHolder = optionalText(input.bankAccountHolder, "bankAccountHolder", { max: 160 });
  const bankTaxId = optionalText(input.bankTaxId, "bankTaxId", { max: 30 });
  const bankAccountType = optionalText(input.bankAccountType, "bankAccountType", { max: 80 });
  const bankCbu = optionalText(input.bankCbu, "bankCbu", { max: 40 });
  const bankAlias = optionalText(input.bankAlias, "bankAlias", { max: 80 });
  const defaultCommissionBps = basisPoints(Math.round(Number(input.defaultCommissionBps || 0)), "defaultCommissionBps");
  const status = optionalText(input.status, "status", { max: 20 }) || "active";
  if (!SALES_REP_STATUSES.has(status)) throw new ValidationError("Invalid sales rep status");
  const notes = optionalText(input.notes, "notes", { max: 1000 });

  try {
    if (id) {
      const updated = db.prepare(`
        UPDATE sales_reps
        SET name = ?, email = ?, phone = ?, whatsapp = ?,
            bank_name = ?, bank_account_holder = ?, bank_tax_id = ?, bank_account_type = ?, bank_cbu = ?, bank_alias = ?,
            default_commission_bps = ?,
            status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING id, name, email, phone, whatsapp,
                  bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
                  default_commission_bps, status, notes, created_at, updated_at
      `).get(
        name, email, phone, whatsapp,
        bankName, bankAccountHolder, bankTaxId, bankAccountType, bankCbu, bankAlias,
        defaultCommissionBps, status, notes, id
      );
      if (!updated) throw new NotFoundError("Sales rep not found");
      return updated;
    }
    return db.prepare(`
      INSERT INTO sales_reps (
        name, email, phone, whatsapp,
        bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
        default_commission_bps, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, phone, whatsapp,
                bank_name, bank_account_holder, bank_tax_id, bank_account_type, bank_cbu, bank_alias,
                default_commission_bps, status, notes, created_at, updated_at
    `).get(
      name, email, phone, whatsapp,
      bankName, bankAccountHolder, bankTaxId, bankAccountType, bankCbu, bankAlias,
      defaultCommissionBps, status, notes
    );
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Sales rep email already exists");
    throw error;
  }
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
    if (!rep) throw new NotFoundError("Sales rep not found");

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
  if (!settlement) throw new NotFoundError("Settlement not found");
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
