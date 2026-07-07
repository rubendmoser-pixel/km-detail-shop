import { NotFoundError, ValidationError, optionalText, positiveInteger, requiredText } from "../domain/validation.js";
import { transaction } from "../db.js";

const PAYMENT_METHODS = new Set(["bank_transfer", "mercadopago", "other"]);

export function listPaymentAccounts(db, { includeInactive = true } = {}) {
  const where = includeInactive ? "" : "WHERE active = 1";
  return db.prepare(`
    SELECT * FROM payment_accounts
    ${where}
    ORDER BY is_default DESC, sort_order ASC, name ASC, id ASC
  `).all().map(publicPaymentAccount);
}

export function upsertPaymentAccount(db, input, adminUserId) {
  const account = validatePaymentAccount(input || {});
  return transaction(db, () => {
    if (account.isDefault) {
      db.prepare("UPDATE payment_accounts SET is_default = 0").run();
    }
    let id = Number(input.id || 0);
    if (id) {
      const exists = db.prepare("SELECT id FROM payment_accounts WHERE id = ?").get(id);
      if (!exists) throw new NotFoundError("Payment account not found");
      db.prepare(`
        UPDATE payment_accounts
        SET name = ?, method = ?, bank_name = ?, account_holder = ?, tax_id = ?, account_type = ?,
          cbu = ?, alias = ?, instructions = ?, active = ?, is_default = ?, sort_order = ?,
          updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id = ?
      `).run(
        account.name, account.method, account.bankName, account.accountHolder, account.taxId, account.accountType,
        account.cbu, account.alias, account.instructions, account.active ? 1 : 0, account.isDefault ? 1 : 0,
        account.sortOrder, adminUserId, id
      );
    } else {
      const result = db.prepare(`
        INSERT INTO payment_accounts (
          name, method, bank_name, account_holder, tax_id, account_type, cbu, alias, instructions,
          active, is_default, sort_order, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        account.name, account.method, account.bankName, account.accountHolder, account.taxId, account.accountType,
        account.cbu, account.alias, account.instructions, account.active ? 1 : 0, account.isDefault ? 1 : 0,
        account.sortOrder, adminUserId
      );
      id = Number(result.lastInsertRowid);
    }
    ensureOneDefaultPaymentAccount(db);
    return publicPaymentAccount(db.prepare("SELECT * FROM payment_accounts WHERE id = ?").get(id));
  });
}

export function listCustomerPaymentAccountAssignments(db, customerId) {
  ensureCustomer(db, customerId);
  const accounts = db.prepare(`
    SELECT pa.*, COALESCE(cpa.customer_id, 0) AS assigned, COALESCE(cpa.is_primary, 0) AS customer_primary
    FROM payment_accounts pa
    LEFT JOIN customer_payment_accounts cpa
      ON cpa.payment_account_id = pa.id AND cpa.customer_id = ?
    WHERE pa.active = 1
    ORDER BY cpa.is_primary DESC, pa.is_default DESC, pa.sort_order ASC, pa.name ASC, pa.id ASC
  `).all(customerId);
  const mapped = accounts.map((row) => ({
    ...publicPaymentAccount(row),
    assigned: Boolean(row.assigned),
    isPrimary: Boolean(row.customer_primary)
  }));
  return {
    accounts: mapped,
    assignedAccountIds: mapped.filter((account) => account.assigned).map((account) => account.id),
    primaryAccountId: mapped.find((account) => account.isPrimary)?.id || null
  };
}

export function setCustomerPaymentAccounts(db, customerId, input) {
  ensureCustomer(db, customerId);
  const ids = Array.isArray(input?.accountIds)
    ? [...new Set(input.accountIds.map((id) => positiveInteger(Number(id), "accountIds")))]
    : [];
  const primaryId = input?.primaryAccountId ? positiveInteger(Number(input.primaryAccountId), "primaryAccountId") : ids[0] || null;
  if (primaryId && !ids.includes(primaryId)) throw new ValidationError("primaryAccountId must be assigned to customer");

  return transaction(db, () => {
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const active = db.prepare(`SELECT id FROM payment_accounts WHERE active = 1 AND id IN (${placeholders})`).all(...ids);
      if (active.length !== ids.length) throw new ValidationError("One or more payment accounts are inactive or invalid");
    }
    db.prepare("DELETE FROM customer_payment_accounts WHERE customer_id = ?").run(customerId);
    const insert = db.prepare(`
      INSERT INTO customer_payment_accounts (customer_id, payment_account_id, is_primary)
      VALUES (?, ?, ?)
    `);
    for (const id of ids) insert.run(customerId, id, id === primaryId ? 1 : 0);
    return listCustomerPaymentAccountAssignments(db, customerId);
  });
}

export function resolvePaymentAccountsForCustomer(db, customerId) {
  let rows = db.prepare(`
    SELECT pa.*, cpa.is_primary AS customer_primary
    FROM customer_payment_accounts cpa
    JOIN payment_accounts pa ON pa.id = cpa.payment_account_id
    WHERE cpa.customer_id = ? AND pa.active = 1
    ORDER BY cpa.is_primary DESC, pa.sort_order ASC, pa.name ASC, pa.id ASC
  `).all(customerId);
  if (!rows.length) {
    rows = db.prepare(`
      SELECT *, is_default AS customer_primary
      FROM payment_accounts
      WHERE active = 1
      ORDER BY is_default DESC, sort_order ASC, name ASC, id ASC
      LIMIT 1
    `).all();
  }
  if (!rows.length) {
    const bank = db.prepare("SELECT * FROM bank_settings WHERE id = 1").get() || {};
    rows = [{
      id: null,
      name: bank.alias || bank.bank_name ? "Cuenta principal KM" : "Cuenta de cobro KM",
      method: "bank_transfer",
      bank_name: bank.bank_name || "",
      account_holder: bank.account_holder || "",
      tax_id: bank.tax_id || "",
      account_type: bank.account_type || "",
      cbu: bank.cbu || "",
      alias: bank.alias || "",
      instructions: bank.instructions || "",
      active: 1,
      is_default: 1,
      sort_order: 0,
      customer_primary: 1
    }];
  }
  return paymentAccountsSnapshot(rows.map((row) => ({ ...publicPaymentAccount(row), isPrimary: Boolean(row.customer_primary) })));
}

export function normalizePaymentSnapshot(raw) {
  if (raw?.accounts?.length) return paymentAccountsSnapshot(raw.accounts);
  if (raw && Object.keys(raw).length) {
    return paymentAccountsSnapshot([{ ...raw, name: raw.name || raw.bankName || "Cuenta de cobro KM", method: raw.method || "bank_transfer", isPrimary: true }]);
  }
  return paymentAccountsSnapshot([]);
}

export function paymentAccountsSnapshot(accounts = []) {
  const normalized = accounts.map((account, index) => ({
    id: account.id ?? null,
    name: account.name || account.bankName || "Cuenta de cobro KM",
    method: account.method || "bank_transfer",
    bankName: account.bankName || account.bank_name || "",
    accountHolder: account.accountHolder || account.account_holder || "",
    taxId: account.taxId || account.tax_id || "",
    accountType: account.accountType || account.account_type || "",
    cbu: account.cbu || "",
    alias: account.alias || "",
    instructions: account.instructions || "",
    isPrimary: Boolean(account.isPrimary || account.customer_primary || index === 0)
  }));
  const primary = normalized.find((account) => account.isPrimary) || normalized[0] || {};
  return {
    ...primary,
    accounts: normalized,
    primaryAccountId: primary.id || null
  };
}

function validatePaymentAccount(input) {
  const method = optionalText(input.method || "bank_transfer", "method", { max: 30 }) || "bank_transfer";
  if (!PAYMENT_METHODS.has(method)) throw new ValidationError("method is invalid");
  return {
    name: requiredText(input.name, "name", { max: 120 }),
    method,
    bankName: optionalText(input.bankName, "bankName", { max: 120 }),
    accountHolder: optionalText(input.accountHolder, "accountHolder", { max: 160 }),
    taxId: optionalText(input.taxId, "taxId", { max: 40 }),
    accountType: optionalText(input.accountType, "accountType", { max: 80 }),
    cbu: optionalText(input.cbu, "cbu", { max: 80 }),
    alias: optionalText(input.alias, "alias", { max: 120 }),
    instructions: optionalText(input.instructions, "instructions", { max: 1000 }),
    active: input.active !== false,
    isDefault: Boolean(input.isDefault),
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Math.trunc(Number(input.sortOrder)) : 0
  };
}

function ensureOneDefaultPaymentAccount(db) {
  const current = db.prepare("SELECT id FROM payment_accounts WHERE active = 1 AND is_default = 1 ORDER BY id LIMIT 1").get();
  if (current) return;
  const first = db.prepare("SELECT id FROM payment_accounts WHERE active = 1 ORDER BY sort_order, id LIMIT 1").get();
  if (first) db.prepare("UPDATE payment_accounts SET is_default = 1 WHERE id = ?").run(first.id);
}

function ensureCustomer(db, customerId) {
  const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(positiveInteger(Number(customerId), "customerId"));
  if (!customer) throw new NotFoundError("Customer not found");
}

function publicPaymentAccount(row) {
  return {
    id: row.id,
    name: row.name,
    method: row.method,
    bankName: row.bank_name ?? row.bankName ?? "",
    accountHolder: row.account_holder ?? row.accountHolder ?? "",
    taxId: row.tax_id ?? row.taxId ?? "",
    accountType: row.account_type ?? row.accountType ?? "",
    cbu: row.cbu || "",
    alias: row.alias || "",
    instructions: row.instructions || "",
    active: Boolean(row.active),
    isDefault: Boolean(row.is_default ?? row.isDefault),
    sortOrder: row.sort_order ?? row.sortOrder ?? 0
  };
}
