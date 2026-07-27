import fs from "node:fs";
import path from "node:path";
import { ValidationError } from "../domain/validation.js";

export const OPERATIONAL_RESET_CONFIRMATION = "LIMPIAR BASE DE PRUEBA";

const CLEAR_TABLES = [
  "notification_push_outbox",
  "notifications",
  "push_outbox",
  "email_outbox",
  "price_list_shares",
  "sales_prospect_quote_items",
  "sales_prospect_quotes",
  "sales_quote_items",
  "sales_quotes",
  "sales_commission_settlement_items",
  "mercadopago_payments",
  "account_payments",
  "payment_receipts",
  "order_events",
  "order_items",
  "orders",
  "sales_commission_settlements",
  "production_commission_entries",
  "production_commission_settlements",
  "production_daily_report_participants",
  "production_daily_report_items",
  "production_daily_reports",
  "production_plan_additions",
  "production_plan_days",
  "production_plan_items",
  "production_plans",
  "inventory_movements",
  "analytics_events",
  "security_events"
];

const PREVIEW_GROUPS = {
  commercial: [
    "customers", "orders", "order_items", "payment_receipts", "account_payments",
    "mercadopago_payments", "sales_quotes", "sales_prospect_quotes",
    "sales_commission_settlements", "price_list_shares"
  ],
  production: [
    "production_plans", "production_plan_items", "production_daily_reports",
    "production_daily_report_items", "production_commission_entries",
    "production_commission_settlements", "inventory_movements"
  ],
  communications: ["email_outbox", "notifications", "push_outbox"],
  audit: ["analytics_events", "security_events"]
};

const PRESERVED_TABLES = {
  catalog: ["product_families", "products", "product_images"],
  recipes: ["inventory_items", "product_bom", "inventory_item_recipes", "inventory_item_recipe_components"],
  suppliers: ["production_suppliers", "production_supplier_items"],
  prices: ["price_update_batches", "price_update_items"],
  people: ["sales_reps", "logistics_operators", "production_operators"],
  commercialMasters: ["official_distributors", "sales_prospects", "payment_accounts"]
};

export function getOperationalResetPreview(db) {
  return {
    confirmation: OPERATIONAL_RESET_CONFIRMATION,
    clears: Object.fromEntries(
      Object.entries(PREVIEW_GROUPS).map(([group, tables]) => [group, summarizeTables(db, tables)])
    ),
    preserves: Object.fromEntries(
      Object.entries(PRESERVED_TABLES).map(([group, tables]) => [group, summarizeTables(db, tables)])
    ),
    stock: {
      balances: tableExists(db, "inventory_balances") ? countRows(db, "inventory_balances") : 0,
      nonZero: tableExists(db, "inventory_balances")
        ? Number(db.prepare("SELECT COUNT(*) AS count FROM inventory_balances WHERE ABS(quantity) > 0.0000001").get().count)
        : 0
    }
  };
}

export function resetOperationalData(db, uploadsPath, input = {}) {
  if (String(input.confirmation || "").trim() !== OPERATIONAL_RESET_CONFIRMATION) {
    throw new ValidationError(`Para limpiar la base escribi exactamente: ${OPERATIONAL_RESET_CONFIRMATION}`);
  }

  const preview = getOperationalResetPreview(db);
  const receiptFiles = tableExists(db, "payment_receipts")
    ? db.prepare("SELECT stored_filename FROM payment_receipts").all().map((row) => row.stored_filename)
    : [];

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of CLEAR_TABLES) {
      if (tableExists(db, table)) db.prepare(`DELETE FROM ${table}`).run();
    }

    if (tableExists(db, "inventory_balances")) {
      db.prepare("UPDATE inventory_balances SET quantity = 0, updated_at = CURRENT_TIMESTAMP").run();
    }
    if (tableExists(db, "settings")) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('inventory_initial_stock_loaded', '0', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = CURRENT_TIMESTAMP
      `).run();
    }

    // Los usuarios cliente son datos operativos. Los administradores y los accesos
    // de ventas, logistica y produccion se conservan para no bloquear las aplicaciones.
    if (tableExists(db, "notification_push_subscriptions")) {
      db.prepare("DELETE FROM notification_push_subscriptions WHERE recipient_type = 'customer'").run();
    }
    if (tableExists(db, "users")) db.prepare("DELETE FROM users WHERE role = 'customer'").run();

    if (tableExists(db, "sqlite_sequence")) {
      const resettable = CLEAR_TABLES.filter((table) => tableExists(db, table));
      if (resettable.length) {
        const placeholders = resettable.map(() => "?").join(", ");
        db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...resettable);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    deleted: preview.clears,
    resetStockBalances: preview.stock,
    preserved: getOperationalResetPreview(db).preserves,
    files: deleteReceiptFiles(uploadsPath, receiptFiles)
  };
}

function summarizeTables(db, tables) {
  const rows = {};
  let total = 0;
  for (const table of tables) {
    if (!tableExists(db, table)) continue;
    const count = countRows(db, table);
    rows[table] = count;
    total += count;
  }
  return { total, tables: rows };
}

function countRows(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0);
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function deleteReceiptFiles(uploadsPath, filenames) {
  const receiptsRoot = path.resolve(uploadsPath, "receipts");
  let deleted = 0;
  for (const filename of filenames) {
    const target = path.resolve(receiptsRoot, filename);
    if (!target.startsWith(`${receiptsRoot}${path.sep}`)) continue;
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        deleted += 1;
      }
    } catch {
      // La base ya quedo consistente; el archivo huerfano se informara en backups.
    }
  }
  return { receiptsDeleted: deleted };
}
