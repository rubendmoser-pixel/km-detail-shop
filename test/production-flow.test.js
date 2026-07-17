import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import {
  approveProductionPlan, confirmDailyProductionReport, getCurrentProductionDashboard, loginProductionOperator,
  saveDailyProductionReport, saveProductionPlan, submitDailyProductionReport, upsertProductionOperator
} from "../server/services/production-service.js";

test("production plan, daily report and admin confirmation update stock with traceability", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-production-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-production@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });
  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  const family = db.prepare("INSERT INTO product_families(name,slug) VALUES('Prueba produccion','prueba-produccion') RETURNING id").get();
  const product = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('TEST-PROD','7790000000001','Producto de prueba','producto-prueba-produccion',?,1000,'2026-07-17') RETURNING id`).get(family.id);
  const raw = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit) VALUES('MP-TEST','Materia prima de prueba','raw_material','unidad') RETURNING id`).get();
  db.prepare("INSERT INTO inventory_balances(item_id,quantity) VALUES(?,100)").run(raw.id);
  db.prepare("INSERT INTO product_bom(product_id,component_item_id,quantity) VALUES(?,?,2)").run(product.id, raw.id);

  const operator = await upsertProductionOperator(db, {
    name: "Operario Produccion", email: "produccion@km-detail.com", portalPassword: "clave-produccion-2026", portalAccessEnabled: true
  });
  const session = await loginProductionOperator(db, { email: operator.email, password: "clave-produccion-2026" });
  assert.equal(session.operator.id, operator.id);

  const plan = saveProductionPlan(db, { weekStart: "2026-07-13", items: [{ productId: product.id, targetQuantity: 10 }] }, admin.id);
  approveProductionPlan(db, plan.id, admin.id);
  assert.equal(getCurrentProductionDashboard(db).plan.items[0].remainingQuantity, 10);

  const report = saveDailyProductionReport(db, {
    productionDate: "2026-07-17", items: [{ productId: product.id, goodQuantity: 5, rejectedQuantity: 1 }]
  }, session.operator);
  submitDailyProductionReport(db, report.id, session.operator);
  const result = confirmDailyProductionReport(db, report.id, admin.id);
  assert.equal(result.report.status, "confirmed");
  assert.deepEqual(result.warnings, []);

  const finishedBalance = db.prepare(`SELECT b.quantity FROM inventory_balances b JOIN inventory_items i ON i.id=b.item_id WHERE i.product_id=?`).get(product.id);
  assert.equal(finishedBalance.quantity, 5);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(raw.id).quantity, 88);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='production_report' AND reference_id=?").get(report.id).count, 2);
  assert.equal(getCurrentProductionDashboard(db).plan.items[0].remainingQuantity, 5);
});
