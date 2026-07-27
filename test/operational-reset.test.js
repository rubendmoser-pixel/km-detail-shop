import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import {
  getOperationalResetPreview,
  OPERATIONAL_RESET_CONFIRMATION,
  resetOperationalData
} from "../server/services/operational-reset-service.js";

test("operational reset clears test activity and preserves validated masters", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-reset-${Date.now()}.sqlite`);
  const uploadsPath = path.join(os.tmpdir(), `km-detail-reset-uploads-${Date.now()}`);
  const db = await openDatabase({
    databasePath,
    adminEmail: "admin@km-detail.com",
    adminPassword: "secure-admin-password"
  });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
    fs.rmSync(uploadsPath, { recursive: true, force: true });
  });

  const family = db.prepare("INSERT INTO product_families (name, slug) VALUES (?, ?) RETURNING id").get("Prueba", "prueba");
  const product = db.prepare(`
    INSERT INTO products (km_code, ean13, name, slug, family_id, base_price_cents, price_effective_from)
    VALUES ('AA999K', '0000000000001', 'Producto maestro', 'producto-maestro', ?, 1000, '2026-08-01')
    RETURNING id
  `).get(family.id);
  const item = db.prepare(`
    INSERT INTO inventory_items (item_code, name, item_type, unit)
    VALUES ('MP-TEST', 'Insumo maestro', 'raw_material', 'unidad')
    RETURNING id
  `).get();
  db.prepare("INSERT INTO product_bom (product_id, component_item_id, quantity) VALUES (?, ?, 2)").run(product.id, item.id);
  db.prepare("INSERT INTO inventory_balances (item_id, quantity) VALUES (?, 25)").run(item.id);
  db.prepare(`
    INSERT INTO inventory_movements (item_id, quantity_delta, movement_type, balance_after)
    VALUES (?, 25, 'initial_stock', 25)
  `).run(item.id);
  db.prepare("INSERT INTO production_suppliers (name) VALUES ('Proveedor maestro')").run();
  db.prepare(`
    INSERT INTO price_update_batches (type, effective_date, product_count, changed_count)
    VALUES ('individual', '2026-08-01', 1, 1)
  `).run();
  db.prepare("INSERT INTO analytics_events (event_type) VALUES ('page_view')").run();
  db.prepare("INSERT INTO security_events (event_type) VALUES ('login_ok')").run();
  db.prepare(`
    INSERT INTO users (email, password_hash, role) VALUES ('cliente@prueba.com', 'hash', 'customer')
  `).run();
  const customerUser = db.prepare("SELECT id FROM users WHERE email='cliente@prueba.com'").get();
  const adminUser = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  db.prepare(`
    INSERT INTO notification_push_subscriptions
      (recipient_type, recipient_id, endpoint, p256dh, auth)
    VALUES
      ('customer', ?, 'https://push.test/customer', 'key-customer', 'auth-customer'),
      ('admin', ?, 'https://push.test/admin', 'key-admin', 'auth-admin')
  `).run(customerUser.id, adminUser.id);
  db.prepare(`
    INSERT INTO customers (
      user_id, first_name, last_name, business_name, tax_id, tax_condition,
      customer_type, industry, city, province, address, phone, whatsapp,
      contact_person, terms_accepted_at, privacy_accepted_at
    ) VALUES (?, 'Cliente', 'Prueba', 'Cliente Prueba', '20-00000000-1',
      'Responsable inscripto', 'Distribuidor', 'Pintureria', 'Rosario',
      'Santa Fe', 'Calle 1', '1', '1', 'Cliente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(customerUser.id);

  const preview = getOperationalResetPreview(db);
  assert.equal(preview.clears.commercial.tables.customers, 1);
  assert.equal(preview.clears.production.tables.inventory_movements, 1);
  assert.equal(preview.stock.nonZero, 1);
  assert.equal(preview.preserves.catalog.tables.products, 1);
  assert.equal(preview.preserves.recipes.tables.product_bom, 1);
  assert.equal(preview.preserves.suppliers.tables.production_suppliers, 1);
  assert.equal(preview.preserves.prices.tables.price_update_batches, 1);

  assert.throws(
    () => resetOperationalData(db, uploadsPath, { confirmation: "LIMPIAR" }),
    /LIMPIAR BASE DE PRUEBA/
  );

  const result = resetOperationalData(db, uploadsPath, { confirmation: OPERATIONAL_RESET_CONFIRMATION });
  assert.equal(result.resetStockBalances.nonZero, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM customers").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='customer'").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get().count, 0);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(item.id).quantity, 0);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='inventory_initial_stock_loaded'").get().value, "0");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM security_events").get().count, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM notification_push_subscriptions WHERE recipient_type='customer'").get().count,
    0
  );

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM products").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_bom").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM production_suppliers").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM price_update_batches").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get().count, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM notification_push_subscriptions WHERE recipient_type='admin'").get().count,
    1
  );
});
