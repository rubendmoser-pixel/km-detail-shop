import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./security.js";

const SCHEMA_VERSION = 24;

export async function openDatabase({ databasePath, adminEmail = "", adminPassword = "", whatsappNumber = "" }) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  seedSettings(db, whatsappNumber);
  if (adminEmail && adminPassword) await ensureAdmin(db, adminEmail, adminPassword);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      tax_id TEXT NOT NULL UNIQUE,
      tax_condition TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      industry TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
      requested_by_sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
      sales_commission_bps INTEGER,
      commercial_class TEXT NOT NULL DEFAULT 'B' CHECK (commercial_class IN ('B', 'N')),
      approval_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended', 'inactive')),
      terms_accepted_at TEXT NOT NULL,
      privacy_accepted_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_discounts (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      discount_1_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_1_bps BETWEEN 0 AND 10000),
      discount_2_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_2_bps BETWEEN 0 AND 10000),
      discount_3_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_3_bps BETWEEN 0 AND 10000),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS customer_product_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
      starts_at TEXT NOT NULL DEFAULT '',
      ends_at TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id),
      UNIQUE(customer_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS customer_shipping_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      recipient TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      preferred_transport TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_customer_shipping_addresses_customer
      ON customer_shipping_addresses(customer_id, is_default, updated_at);

    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_account_holder TEXT NOT NULL DEFAULT '',
      bank_tax_id TEXT NOT NULL DEFAULT '',
      bank_account_type TEXT NOT NULL DEFAULT '',
      bank_cbu TEXT NOT NULL DEFAULT '',
      bank_alias TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      default_commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (default_commission_bps BETWEEN 0 AND 10000),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_rep_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logistics_operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logistics_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL REFERENCES logistics_operators(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL REFERENCES production_operators(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_admin_portal_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'handoff' CHECK (state IN ('handoff', 'active')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      operator_count INTEGER NOT NULL DEFAULT 1 CHECK (operator_count > 0),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_progress', 'closed')),
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      suggested_quantity INTEGER NOT NULL DEFAULT 0 CHECK (suggested_quantity >= 0),
      target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
      adjustment_note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(plan_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS production_work_schedule_defaults (
      weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 1 AND 7),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      planned_hours REAL NOT NULL DEFAULT 0 CHECK (planned_hours BETWEEN 0 AND 24),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_plan_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      planned_hours REAL NOT NULL DEFAULT 0 CHECK (planned_hours BETWEEN 0 AND 24),
      UNIQUE(plan_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS production_daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_number TEXT NOT NULL UNIQUE,
      production_date TEXT NOT NULL UNIQUE,
      operator_id INTEGER NOT NULL REFERENCES production_operators(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed', 'returned')),
      notes TEXT NOT NULL DEFAULT '',
      submitted_at TEXT,
      confirmed_by INTEGER REFERENCES users(id),
      confirmed_at TEXT,
      return_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_daily_report_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES production_daily_reports(id) ON DELETE CASCADE,
      plan_item_id INTEGER REFERENCES production_plan_items(id) ON DELETE SET NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      good_quantity INTEGER NOT NULL DEFAULT 0 CHECK (good_quantity >= 0),
      rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(report_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS production_daily_report_participants (
      report_id INTEGER NOT NULL REFERENCES production_daily_reports(id) ON DELETE CASCADE,
      operator_id INTEGER NOT NULL REFERENCES production_operators(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(report_id, operator_id)
    );

    CREATE TABLE IF NOT EXISTS production_commission_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_number TEXT NOT NULL UNIQUE,
      operator_id INTEGER NOT NULL REFERENCES production_operators(id),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      notes TEXT NOT NULL DEFAULT '',
      settled_by INTEGER NOT NULL REFERENCES users(id),
      settled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_commission_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES production_daily_reports(id),
      report_item_id INTEGER NOT NULL REFERENCES production_daily_report_items(id),
      operator_id INTEGER NOT NULL REFERENCES production_operators(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      good_quantity INTEGER NOT NULL CHECK (good_quantity > 0),
      unit_commission_cents INTEGER NOT NULL CHECK (unit_commission_cents >= 0),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      settlement_id INTEGER REFERENCES production_commission_settlements(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_item_id, operator_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('raw_material', 'intermediate', 'finished_product')),
      unit TEXT NOT NULL DEFAULT 'unidad',
      product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_balances (
      item_id INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_bom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      UNIQUE(product_id, component_item_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_item_recipes (
      item_id INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
      output_quantity REAL NOT NULL CHECK (output_quantity > 0),
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_item_recipe_components (
      item_id INTEGER NOT NULL REFERENCES inventory_item_recipes(item_id) ON DELETE CASCADE,
      component_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (item_id, component_item_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      quantity_delta REAL NOT NULL,
      movement_type TEXT NOT NULL,
      reference_type TEXT NOT NULL DEFAULT '',
      reference_id INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER REFERENCES users(id),
      balance_after REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_rep_password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_commission_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_number TEXT NOT NULL UNIQUE,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      sales_rep_name TEXT NOT NULL,
      sales_rep_email TEXT NOT NULL,
      period_from TEXT NOT NULL DEFAULT '',
      period_to TEXT NOT NULL DEFAULT '',
      orders_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
      commission_base_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_base_cents >= 0),
      commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
      bank_snapshot_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_commission_settlement_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL REFERENCES sales_commission_settlements(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      order_number TEXT NOT NULL,
      business_name TEXT NOT NULL,
      order_created_at TEXT NOT NULL,
      order_paid_at TEXT NOT NULL DEFAULT '',
      subtotal_net_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_net_cents >= 0),
      commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
      commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
      UNIQUE(settlement_id, order_id)
    );

    CREATE TABLE IF NOT EXISTS product_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      km_code TEXT NOT NULL UNIQUE,
      ean13 TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      family_id INTEGER NOT NULL REFERENCES product_families(id),
      subfamily TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT '',
      color TEXT,
      measure TEXT,
      cut_level TEXT,
      attachment_system TEXT,
      compatible_machine TEXT NOT NULL DEFAULT '',
      recommended_use TEXT NOT NULL DEFAULT '',
      technical_description TEXT NOT NULL DEFAULT '',
      warehouse_location TEXT NOT NULL DEFAULT '',
      image_filename TEXT,
      base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
      promotion_bps INTEGER NOT NULL DEFAULT 0 CHECK (promotion_bps BETWEEN 0 AND 10000),
      promotion_label TEXT NOT NULL DEFAULT '',
      promotion_starts_at TEXT NOT NULL DEFAULT '',
      promotion_ends_at TEXT NOT NULL DEFAULT '',
      promotion_active INTEGER NOT NULL DEFAULT 0 CHECK (promotion_active IN (0, 1)),
      production_minutes_per_unit REAL NOT NULL DEFAULT 0 CHECK (production_minutes_per_unit >= 0),
      production_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (production_commission_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      price_effective_from TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      web_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      alt_text TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_update_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('individual', 'linear')),
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'applied', 'cancelled')),
      effective_date TEXT NOT NULL,
      percent_bps INTEGER,
      product_count INTEGER NOT NULL DEFAULT 0,
      changed_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_at TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS price_update_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES price_update_batches(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      km_code TEXT NOT NULL,
      old_price_cents INTEGER NOT NULL,
      new_price_cents INTEGER NOT NULL,
      variation_bps INTEGER NOT NULL DEFAULT 0,
      UNIQUE(batch_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS official_distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      coverage TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bank_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      bank_name TEXT NOT NULL DEFAULT '',
      account_holder TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      cbu TEXT NOT NULL DEFAULT '',
      alias TEXT NOT NULL DEFAULT '',
      account_type TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer', 'mercadopago', 'other')),
      bank_name TEXT NOT NULL DEFAULT '',
      account_holder TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      account_type TEXT NOT NULL DEFAULT '',
      cbu TEXT NOT NULL DEFAULT '',
      alias TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS customer_payment_accounts (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      payment_account_id INTEGER NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (customer_id, payment_account_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL DEFAULT 'order_created',
      payment_status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'mercadopago')),
      fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'ready', 'shipped', 'delivered')),
      fulfillment_method TEXT NOT NULL DEFAULT '',
      fulfillment_carrier TEXT NOT NULL DEFAULT '',
      fulfillment_tracking TEXT NOT NULL DEFAULT '',
      fulfillment_estimated_date TEXT NOT NULL DEFAULT '',
      fulfillment_notes TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      discount_1_bps INTEGER NOT NULL,
      discount_2_bps INTEGER NOT NULL,
      discount_3_bps INTEGER NOT NULL,
      commercial_class TEXT NOT NULL DEFAULT 'B' CHECK (commercial_class IN ('B', 'N')),
      created_by_role TEXT NOT NULL DEFAULT 'customer' CHECK (created_by_role IN ('customer', 'sales_rep', 'admin')),
      created_by_sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
      sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
      sales_rep_name TEXT NOT NULL DEFAULT '',
      sales_rep_email TEXT NOT NULL DEFAULT '',
      sales_commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_bps BETWEEN 0 AND 10000),
      sales_commission_base_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_base_cents >= 0),
      sales_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_cents >= 0),
      sales_commission_settlement_id INTEGER REFERENCES sales_commission_settlements(id),
      sales_commission_settled_at TEXT,
      subtotal_net_cents INTEGER NOT NULL,
      vat_bps INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
      commercial_adjustment_cents INTEGER NOT NULL DEFAULT 0 CHECK (commercial_adjustment_cents >= 0),
      commercial_adjustment_reason TEXT NOT NULL DEFAULT '',
      commercial_adjusted_at TEXT,
      commercial_adjusted_by INTEGER REFERENCES users(id),
      payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
      requested_payment_condition TEXT NOT NULL DEFAULT 'advance_payment',
      payment_due_date TEXT NOT NULL DEFAULT '',
      credit_authorized_at TEXT,
      credit_authorized_by INTEGER REFERENCES users(id),
      due_reminder_sent_at TEXT,
      overdue_reminder_sent_date TEXT NOT NULL DEFAULT '',
      payment_reminder_stage TEXT NOT NULL DEFAULT '',
      payment_reminder_last_sent_date TEXT NOT NULL DEFAULT '',
      bank_snapshot_json TEXT NOT NULL,
      shipping_snapshot_json TEXT NOT NULL,
      price_reserved_at TEXT NOT NULL,
      customer_accepted_at TEXT,
      modified_acceptance_required INTEGER NOT NULL DEFAULT 0 CHECK (modified_acceptance_required IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      km_code TEXT NOT NULL,
      ean13 TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      base_price_cents INTEGER NOT NULL,
      discount_1_bps INTEGER NOT NULL,
      discount_2_bps INTEGER NOT NULL,
      discount_3_bps INTEGER NOT NULL,
      special_discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (special_discount_bps BETWEEN 0 AND 10000),
      special_discount_note TEXT NOT NULL DEFAULT '',
      promotion_bps INTEGER NOT NULL DEFAULT 0 CHECK (promotion_bps BETWEEN 0 AND 10000),
      promotion_label TEXT NOT NULL DEFAULT '',
      final_unit_price_cents INTEGER NOT NULL,
      subtotal_net_cents INTEGER NOT NULL,
      confirmed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_quantity >= 0),
      confirmed_subtotal_net_cents INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_subtotal_net_cents >= 0),
      line_status TEXT NOT NULL DEFAULT 'pending_confirmation'
        CHECK (line_status IN ('pending_confirmation', 'confirmed', 'partial', 'unavailable', 'cancelled')),
      availability_note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sales_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      sales_rep_name TEXT NOT NULL DEFAULT '',
      sales_rep_email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'generated'
        CHECK (status IN ('generated', 'converted', 'cancelled', 'expired')),
      currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      discount_1_bps INTEGER NOT NULL DEFAULT 0,
      discount_2_bps INTEGER NOT NULL DEFAULT 0,
      discount_3_bps INTEGER NOT NULL DEFAULT 0,
      commercial_class TEXT NOT NULL DEFAULT 'B' CHECK (commercial_class IN ('B', 'N')),
      subtotal_net_cents INTEGER NOT NULL DEFAULT 0,
      vat_bps INTEGER NOT NULL DEFAULT 0,
      vat_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      email_sent_at TEXT,
      whatsapp_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      km_code TEXT NOT NULL,
      ean13 TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      base_price_cents INTEGER NOT NULL,
      discount_1_bps INTEGER NOT NULL DEFAULT 0,
      discount_2_bps INTEGER NOT NULL DEFAULT 0,
      discount_3_bps INTEGER NOT NULL DEFAULT 0,
      special_discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (special_discount_bps BETWEEN 0 AND 10000),
      special_discount_note TEXT NOT NULL DEFAULT '',
      promotion_bps INTEGER NOT NULL DEFAULT 0 CHECK (promotion_bps BETWEEN 0 AND 10000),
      promotion_label TEXT NOT NULL DEFAULT '',
      final_unit_price_cents INTEGER NOT NULL,
      subtotal_net_cents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_prospect_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT NOT NULL UNIQUE,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      sales_rep_name TEXT NOT NULL DEFAULT '',
      sales_rep_email TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      email TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 3000),
      status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'cancelled', 'expired')),
      currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      subtotal_list_cents INTEGER NOT NULL DEFAULT 0,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_net_cents INTEGER NOT NULL DEFAULT 0,
      vat_bps INTEGER NOT NULL DEFAULT 0,
      vat_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      email_sent_at TEXT,
      whatsapp_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_prospect_quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES sales_prospect_quotes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      km_code TEXT NOT NULL,
      ean13 TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      base_price_cents INTEGER NOT NULL,
      discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 3000),
      final_unit_price_cents INTEGER NOT NULL,
      subtotal_list_cents INTEGER NOT NULL,
      subtotal_net_cents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id),
      event_type TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'accepted', 'rejected')),
      amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
      review_reason TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      html_body TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      disabled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS push_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '/',
      tag TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      role TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      path TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_family_active ON products(family_id, active);
    CREATE INDEX IF NOT EXISTS idx_customer_product_discounts_customer ON customer_product_discounts(customer_id, active);
    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_price_update_batches_status_date ON price_update_batches(status, effective_date);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status);
    CREATE INDEX IF NOT EXISTS idx_sales_quotes_rep_created ON sales_quotes(sales_rep_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer_created ON sales_quotes(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote ON sales_quote_items(quote_id);
    CREATE INDEX IF NOT EXISTS idx_sales_prospect_quotes_rep_created ON sales_prospect_quotes(sales_rep_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_prospect_quote_items_quote ON sales_prospect_quote_items(quote_id);
    CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status, name);
    CREATE INDEX IF NOT EXISTS idx_sales_rep_sessions_token ON sales_rep_sessions(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_production_admin_portal_token ON production_admin_portal_sessions(token_hash, state, expires_at);
    CREATE INDEX IF NOT EXISTS idx_sales_rep_password_reset_token ON sales_rep_password_reset_tokens(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_commission_settlements_rep ON sales_commission_settlements(sales_rep_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commission_items_settlement ON sales_commission_settlement_items(settlement_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_customer ON push_subscriptions(customer_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON push_outbox(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON analytics_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_product ON analytics_events(product_id, created_at DESC);
  `);

  const migration = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(SCHEMA_VERSION);
  ensureColumn(db, "order_items", "confirmed_quantity", "INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_quantity >= 0)");
  ensureColumn(db, "order_items", "industrial_unit_cost_cents", "INTEGER");
  ensureColumn(db, "order_items", "industrial_material_cost_cents", "INTEGER");
  ensureColumn(db, "order_items", "industrial_labor_cost_cents", "INTEGER");
  ensureColumn(db, "order_items", "industrial_production_commission_cents", "INTEGER");
  ensureColumn(db, "order_items", "industrial_cost_complete", "INTEGER NOT NULL DEFAULT 0 CHECK (industrial_cost_complete IN (0, 1))");
  ensureColumn(db, "order_items", "industrial_cost_snapshot_at", "TEXT");
  ensureColumn(db, "order_items", "confirmed_subtotal_net_cents", "INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_subtotal_net_cents >= 0)");
  ensureColumn(db, "order_items", "line_status", "TEXT NOT NULL DEFAULT 'pending_confirmation'");
  ensureColumn(db, "order_items", "availability_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "order_items", "warehouse_location", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "order_items", "special_discount_bps", "INTEGER NOT NULL DEFAULT 0 CHECK (special_discount_bps BETWEEN 0 AND 10000)");
  ensureColumn(db, "order_items", "special_discount_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "order_items", "promotion_bps", "INTEGER NOT NULL DEFAULT 0 CHECK (promotion_bps BETWEEN 0 AND 10000)");
  ensureColumn(db, "order_items", "promotion_label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "products", "warehouse_location", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "products", "promotion_bps", "INTEGER NOT NULL DEFAULT 0 CHECK (promotion_bps BETWEEN 0 AND 10000)");
  ensureColumn(db, "products", "promotion_label", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "products", "promotion_starts_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "products", "promotion_ends_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "products", "promotion_active", "INTEGER NOT NULL DEFAULT 0 CHECK (promotion_active IN (0, 1))");
  ensureColumn(db, "products", "production_minutes_per_unit", "REAL NOT NULL DEFAULT 0 CHECK (production_minutes_per_unit >= 0)");
  ensureColumn(db, "products", "production_commission_cents", "INTEGER NOT NULL DEFAULT 0 CHECK (production_commission_cents >= 0)");
  ensureColumn(db, "orders", "payment_method", "TEXT NOT NULL DEFAULT 'bank_transfer'");
  ensureColumn(db, "orders", "commercial_class", "TEXT NOT NULL DEFAULT 'B' CHECK (commercial_class IN ('B', 'N'))");
  ensureColumn(db, "orders", "created_by_role", "TEXT NOT NULL DEFAULT 'customer' CHECK (created_by_role IN ('customer', 'sales_rep', 'admin'))");
  ensureColumn(db, "orders", "created_by_sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "orders", "fulfillment_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "orders", "fulfillment_method", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_carrier", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_tracking", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_estimated_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "logistics_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "orders", "logistics_operator_id", "INTEGER REFERENCES logistics_operators(id) ON DELETE SET NULL");
  ensureColumn(db, "orders", "logistics_started_at", "TEXT");
  ensureColumn(db, "orders", "logistics_prepared_at", "TEXT");
  ensureColumn(db, "orders", "logistics_packed_at", "TEXT");
  ensureColumn(db, "orders", "logistics_labeled_at", "TEXT");
  ensureColumn(db, "orders", "logistics_ready_at", "TEXT");
  ensureColumn(db, "orders", "logistics_packages", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "orders", "sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "orders", "sales_rep_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "sales_rep_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "sales_commission_bps", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "sales_commission_base_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "sales_commission_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "sales_commission_settlement_id", "INTEGER REFERENCES sales_commission_settlements(id)");
  ensureColumn(db, "orders", "sales_commission_settled_at", "TEXT");
  ensureColumn(db, "orders", "paid_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "balance_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "commercial_adjustment_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "commercial_adjustment_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "commercial_adjusted_at", "TEXT");
  ensureColumn(db, "orders", "commercial_adjusted_by", "INTEGER REFERENCES users(id)");
  ensureColumn(db, "orders", "payment_terms_days", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "requested_payment_condition", "TEXT NOT NULL DEFAULT 'advance_payment'");
  ensureColumn(db, "orders", "payment_due_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "credit_authorized_at", "TEXT");
  ensureColumn(db, "orders", "credit_authorized_by", "INTEGER REFERENCES users(id)");
  ensureColumn(db, "orders", "due_reminder_sent_at", "TEXT");
  ensureColumn(db, "orders", "overdue_reminder_sent_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "payment_reminder_stage", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "payment_reminder_last_sent_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "payment_receipts", "amount_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "payment_receipts", "review_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "payment_receipts", "reviewed_at", "TEXT");
  ensureColumn(db, "payment_receipts", "reviewed_by", "INTEGER REFERENCES users(id)");
  ensureColumn(db, "email_outbox", "html_body", "TEXT");
  ensureColumn(db, "customers", "postal_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "customers", "requested_by_sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "customers", "sales_commission_bps", "INTEGER");
  ensureColumn(db, "customers", "commercial_class", "TEXT NOT NULL DEFAULT 'B' CHECK (commercial_class IN ('B', 'N'))");
  ensureColumn(db, "customers", "payment_condition", "TEXT NOT NULL DEFAULT 'prepaid'");
  ensureColumn(db, "customers", "payment_terms_days", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sales_reps", "bank_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "bank_account_holder", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "bank_tax_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "bank_account_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "bank_cbu", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "bank_alias", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_reps", "password_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "sales_quotes", "email_sent_at", "TEXT");
  ensureColumn(db, "sales_quotes", "whatsapp_sent_at", "TEXT");
  ensureColumn(db, "inventory_movements", "balance_after", "REAL");
  ensureColumn(db, "inventory_items", "category", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "inventory_items", "item_kind", "TEXT NOT NULL DEFAULT 'raw_material'");
  ensureColumn(db, "inventory_items", "purchase_unit", "TEXT NOT NULL DEFAULT 'unidad'");
  ensureColumn(db, "inventory_items", "conversion_factor", "REAL NOT NULL DEFAULT 1");
  ensureColumn(db, "inventory_items", "currency", "TEXT NOT NULL DEFAULT 'USD'");
  ensureColumn(db, "inventory_items", "purchase_cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "minimum_purchase", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "minimum_stock", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "safety_days", "INTEGER");
  ensureColumn(db, "inventory_items", "minimum_batch", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "inventory_items", "lead_time_days", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "inventory_items", "tracks_stock", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "production_plan_items", "carryover_quantity", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "production_plan_items", "carryover_from_plan_item_id", "INTEGER");
  ensureColumn(db, "production_plans", "operator_count", "INTEGER NOT NULL DEFAULT 1 CHECK (operator_count > 0)");
  db.exec("UPDATE inventory_items SET item_kind='intermediate' WHERE item_type='intermediate' AND item_kind='raw_material'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS production_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      legal_name TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS production_supplier_items (
      supplier_id INTEGER NOT NULL REFERENCES production_suppliers(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (supplier_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_production_suppliers_active_name ON production_suppliers(active, name);
    CREATE INDEX IF NOT EXISTS idx_production_supplier_items_item ON production_supplier_items(item_id, active);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_production_supplier_items_primary
      ON production_supplier_items(item_id) WHERE is_primary=1 AND active=1;
  `);
  ensureColumn(db, "inventory_movements", "supplier_id", "INTEGER REFERENCES production_suppliers(id)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_prospect_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT NOT NULL UNIQUE,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      sales_rep_name TEXT NOT NULL DEFAULT '', sales_rep_email TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL, contact_person TEXT NOT NULL, email TEXT NOT NULL, whatsapp TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', province TEXT NOT NULL DEFAULT '',
      discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 3000),
      status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'cancelled', 'expired')),
      currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      subtotal_list_cents INTEGER NOT NULL DEFAULT 0, discount_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_net_cents INTEGER NOT NULL DEFAULT 0, vat_bps INTEGER NOT NULL DEFAULT 0,
      vat_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      email_sent_at TEXT, whatsapp_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales_prospect_quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES sales_prospect_quotes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id), km_code TEXT NOT NULL, ean13 TEXT NOT NULL,
      product_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
      base_price_cents INTEGER NOT NULL, discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 3000),
      final_unit_price_cents INTEGER NOT NULL, subtotal_list_cents INTEGER NOT NULL, subtotal_net_cents INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sales_prospect_quotes_rep_created ON sales_prospect_quotes(sales_rep_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_prospect_quote_items_quote ON sales_prospect_quote_items(quote_id);
    CREATE TABLE IF NOT EXISTS sales_rep_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_rep_sessions_token ON sales_rep_sessions(token_hash, expires_at);
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_commission_pending ON orders(sales_rep_id, sales_commission_settlement_id, payment_status);");
  db.exec(`
    UPDATE orders
    SET payment_status = 'credit_account'
    WHERE payment_status = 'partial_payment';

    UPDATE customers
    SET payment_condition = 'advance_payment'
    WHERE payment_condition = 'prepaid';

    UPDATE orders
    SET balance_cents = CASE
      WHEN payment_status IN ('paid', 'settled_adjustment') THEN 0
      ELSE MAX(0, total_cents - paid_cents - commercial_adjustment_cents)
    END
    WHERE total_cents > 0;
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_customers_sales_rep ON customers(sales_rep_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_operators_status ON logistics_operators(status, name);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_sessions_token ON logistics_sessions(token_hash, expires_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_operators_status ON production_operators(status, name);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_sessions_token ON production_sessions(token_hash, expires_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_plans_week ON production_plans(week_start, status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_plan_days_plan_date ON production_plan_days(plan_id, work_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_reports_status_date ON production_daily_reports(status, production_date DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_commissions_pending ON production_commission_entries(operator_id, settlement_id, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_production_commission_settlements_operator ON production_commission_settlements(operator_id, settled_at DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date ON inventory_movements(item_id, created_at DESC);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_logistics_queue ON orders(fulfillment_status, logistics_status, logistics_operator_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payment_accounts_active ON payment_accounts(active, sort_order, name);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_customer_payment_accounts_customer ON customer_payment_accounts(customer_id);");
  if (!migration) db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(SCHEMA_VERSION);
}

function ensureColumn(db, table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedSettings(db, whatsappNumber) {
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  insertSetting.run("vat_bps", "2100");
  insertSetting.run("whatsapp_number", whatsappNumber);
  insertSetting.run("usd_exchange_rate", "1400");
  insertSetting.run("production_hourly_cost_ars", "0");
  insertSetting.run("inventory_initial_stock_loaded", "0");
  const insertProductionDay = db.prepare("INSERT OR IGNORE INTO production_work_schedule_defaults(weekday,enabled,planned_hours) VALUES(?,?,?)");
  for (let weekday = 1; weekday <= 7; weekday += 1) insertProductionDay.run(weekday, weekday <= 5 ? 1 : 0, weekday <= 5 ? 8 : 0);
  db.prepare("INSERT OR IGNORE INTO bank_settings (id) VALUES (1)").run();
  seedPaymentAccountsFromBankSettings(db);
}

function seedPaymentAccountsFromBankSettings(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM payment_accounts").get();
  if (existing.count > 0) return;
  const bank = db.prepare("SELECT * FROM bank_settings WHERE id = 1").get() || {};
  db.prepare(`
    INSERT INTO payment_accounts (
      name, method, bank_name, account_holder, tax_id, account_type, cbu, alias, instructions,
      active, is_default, sort_order
    ) VALUES (?, 'bank_transfer', ?, ?, ?, ?, ?, ?, ?, 1, 1, 0)
  `).run(
    bank.alias || bank.bank_name ? "Cuenta principal KM" : "Cuenta de cobro KM",
    bank.bank_name || "",
    bank.account_holder || "",
    bank.tax_id || "",
    bank.account_type || "",
    bank.cbu || "",
    bank.alias || "",
    bank.instructions || ""
  );
}

async function ensureAdmin(db, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, existing.id);
    return;
  }
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')")
    .run(normalizedEmail, passwordHash);
}

export function transaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
