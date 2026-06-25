import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./security.js";

const SCHEMA_VERSION = 10;

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
      sales_commission_bps INTEGER,
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

    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      default_commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (default_commission_bps BETWEEN 0 AND 10000),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      image_filename TEXT,
      base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
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
      sales_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
      sales_rep_name TEXT NOT NULL DEFAULT '',
      sales_rep_email TEXT NOT NULL DEFAULT '',
      sales_commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_bps BETWEEN 0 AND 10000),
      sales_commission_base_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_base_cents >= 0),
      sales_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK (sales_commission_cents >= 0),
      subtotal_net_cents INTEGER NOT NULL,
      vat_bps INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
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
      final_unit_price_cents INTEGER NOT NULL,
      subtotal_net_cents INTEGER NOT NULL,
      confirmed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_quantity >= 0),
      confirmed_subtotal_net_cents INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_subtotal_net_cents >= 0),
      line_status TEXT NOT NULL DEFAULT 'pending_confirmation'
        CHECK (line_status IN ('pending_confirmation', 'confirmed', 'partial', 'unavailable', 'cancelled')),
      availability_note TEXT NOT NULL DEFAULT ''
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
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

    CREATE INDEX IF NOT EXISTS idx_products_family_active ON products(family_id, active);
    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status);
    CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status, name);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email, created_at DESC);
  `);

  const migration = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(SCHEMA_VERSION);
  ensureColumn(db, "order_items", "confirmed_quantity", "INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_quantity >= 0)");
  ensureColumn(db, "order_items", "confirmed_subtotal_net_cents", "INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_subtotal_net_cents >= 0)");
  ensureColumn(db, "order_items", "line_status", "TEXT NOT NULL DEFAULT 'pending_confirmation'");
  ensureColumn(db, "order_items", "availability_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "payment_method", "TEXT NOT NULL DEFAULT 'bank_transfer'");
  ensureColumn(db, "orders", "fulfillment_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "orders", "fulfillment_method", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_carrier", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_tracking", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_estimated_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "fulfillment_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "orders", "sales_rep_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "sales_rep_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "orders", "sales_commission_bps", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "sales_commission_base_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "sales_commission_cents", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "customers", "postal_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "customers", "sales_rep_id", "INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL");
  ensureColumn(db, "customers", "sales_commission_bps", "INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_customers_sales_rep ON customers(sales_rep_id);");
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
  db.prepare("INSERT OR IGNORE INTO bank_settings (id) VALUES (1)").run();
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
