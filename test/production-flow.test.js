import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { getInventoryValuation } from "../server/services/production-cost-service.js";
import {
  addProductionPlanItem, adjustProductionInventory, approveProductionPlan, authenticateProductionOperator, closeProductionPlan, confirmDailyProductionReport, consumeProductionAdminPortalAccess, createProductionAdminPortalAccess, createProductionCommissionSettlement, createProductionWeek, getCurrentProductionDashboard, getProductionCommissionDashboard, getProductionCommissionSettlement, getProductionInventory, getProductionReportImpact, getProductionScheduleDefaults, loginProductionOperator, logoutProductionOperator,
  registerProductionInventoryEntry, saveDailyProductionReport, saveProductionPlan, saveProductionPlanCalendar, saveProductionScheduleDefaults, searchProductionProducts, submitDailyProductionReport, upsertProductionOperator, upsertProductionRecipe
} from "../server/services/production-service.js";

test("production plan, daily report and admin confirmation update stock with traceability", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-production-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-production@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });
  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  const adminUser = db.prepare("SELECT id,email,role,status FROM users WHERE role='admin'").get();
  const handoff = createProductionAdminPortalAccess(db, adminUser);
  const adminPortal = consumeProductionAdminPortalAccess(db, handoff.token);
  assert.equal(adminPortal.operator.isAdmin, true);
  assert.equal(authenticateProductionOperator(db, handoff.token).portalRole, "admin");
  assert.throws(() => consumeProductionAdminPortalAccess(db, handoff.token), /venció o ya fue utilizado/);
  assert.throws(() => saveDailyProductionReport(db, { productionDate: "2026-07-14", items: [] }, adminPortal.operator), /supervisión/);
  logoutProductionOperator(db, handoff.token);
  assert.equal(authenticateProductionOperator(db, handoff.token), null);
  const family = db.prepare("INSERT INTO product_families(name,slug) VALUES('Prueba produccion','prueba-produccion') RETURNING id").get();
  const product = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('TEST-PROD','7790000000001','Producto de prueba','producto-prueba-produccion',?,1000,'2026-07-17') RETURNING id`).get(family.id);
  const raw = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit) VALUES('MP-TEST','Materia prima de prueba','raw_material','unidad') RETURNING id`).get();
  assert.equal(searchProductionProducts(db, "test-prod")[0].kmCode, "TEST-PROD");
  assert.deepEqual(searchProductionProducts(db, "no-existe"), []);
  db.prepare("INSERT INTO inventory_balances(item_id,quantity) VALUES(?,100)").run(raw.id);
  const recipe = upsertProductionRecipe(db, {
    productId: product.id, kmCode: "TEST-PROD", ean13: "7790000000001", productionMinutesPerUnit: 30, productionCommissionArs: 80,
    components: [{ itemId: raw.id, quantity: 2 }]
  });
  assert.equal(recipe.productionMinutesPerUnit, 30);
  assert.equal(recipe.productionCommissionArs, 80);
  assert.equal(searchProductionProducts(db, "test-prod")[0].productionMinutesPerUnit, 30);
  assert.equal(searchProductionProducts(db, "test-prod")[0].productionCommissionArs, 80);

  const configuredWeek = createProductionWeek(db, {
    weekStart: "2026-08-03",
    operatorCount: 4,
    days: getProductionScheduleDefaults(db).days.map((day) => ({ ...day, enabled: day.weekday <= 6, plannedHours: day.weekday <= 5 ? 8 : day.weekday === 6 ? 4 : 0 }))
  }, admin.id);
  assert.equal(configuredWeek.items.length, 0);
  assert.equal(configuredWeek.summary.workingDays, 6);
  assert.equal(configuredWeek.summary.scheduledHours, 44);
  assert.equal(configuredWeek.summary.availableLaborHours, 176);
  assert.throws(() => createProductionWeek(db, {
    weekStart: "2026-08-04", operatorCount: 1, days: getProductionScheduleDefaults(db).days
  }, admin.id), /comenzar un lunes/);

  const operator = await upsertProductionOperator(db, {
    name: "Operario Produccion", email: "produccion@km-detail.com", portalPassword: "clave-produccion-2026", portalAccessEnabled: true
  });
  const session = await loginProductionOperator(db, { email: operator.email, password: "clave-produccion-2026" });
  const secondOperator = await upsertProductionOperator(db, {
    name: "Segundo Operario", email: "produccion-dos@km-detail.com", portalPassword: "clave-produccion-2026", portalAccessEnabled: true
  });
  assert.equal(session.operator.id, operator.id);

  const plan = saveProductionPlan(db, { weekStart: "2026-07-13", items: [{ productId: product.id, targetQuantity: 10 }] }, admin.id);
  assert.equal(plan.summary.workingDays, 5);
  assert.equal(plan.summary.scheduledHours, 40);
  assert.equal(plan.summary.operatorCount, 1);
  assert.equal(plan.summary.availableLaborHours, 40);
  assert.equal(plan.summary.requiredLaborHours, 5);
  assert.equal(plan.summary.productsWithoutTime, 0);
  const defaultDays = getProductionScheduleDefaults(db).days;
  saveProductionScheduleDefaults(db, { days: defaultDays.map((day) => ({ ...day, plannedHours: day.enabled ? 7 : 0 })) });
  const capacity = saveProductionPlanCalendar(db, plan.id, { operatorCount: 3, days: plan.days.map((day) => ({ ...day, plannedHours: day.weekday === 5 ? 6 : day.plannedHours })) });
  assert.equal(capacity.summary.scheduledHours, 38);
  assert.equal(capacity.summary.operatorCount, 3);
  assert.equal(capacity.summary.availableLaborHours, 114);
  assert.equal(capacity.summary.requiredLaborHours, 5);
  assert.equal(capacity.summary.overCapacityHours, 0);
  approveProductionPlan(db, plan.id, admin.id);
  assert.equal(getCurrentProductionDashboard(db).plan.items[0].remainingQuantity, 10);

  const report = saveDailyProductionReport(db, {
    productionDate: "2026-07-17", participantIds: [operator.id, secondOperator.id],
    items: [{ productId: product.id, goodQuantity: 5, rejectedQuantity: 1 }]
  }, session.operator);
  submitDailyProductionReport(db, report.id, session.operator);
  const preview = getProductionReportImpact(db, report.id);
  assert.equal(preview.components[0].currentBalance, 100);
  assert.equal(preview.components[0].resultingBalance, 88);
  const result = confirmDailyProductionReport(db, report.id, admin.id);
  assert.equal(result.report.status, "confirmed");
  assert.deepEqual(result.warnings, []);
  assert.equal(result.report.productionCommissionArs, 400);
  const commissions = getProductionCommissionDashboard(db);
  assert.equal(commissions.pending.length, 2);
  assert.ok(commissions.pending.every((entry) => entry.amountArs === 200));
  const settlement = createProductionCommissionSettlement(db, { entryIds: [commissions.pending[0].id], notes: "Pago de prueba" }, admin.id);
  assert.equal(settlement.totalArs, 200);
  const repeatedSettlement = createProductionCommissionSettlement(db, { entryIds: [commissions.pending[0].id], notes: "Reintento duplicado" }, admin.id);
  assert.equal(repeatedSettlement.id, settlement.id);
  const settlementDetail = getProductionCommissionSettlement(db, settlement.id);
  assert.equal(settlementDetail.items.length, 1);
  assert.equal(settlementDetail.items[0].amountArs, 200);
  assert.equal(settlementDetail.totalArs, 200);
  assert.equal(settlementDetail.totalProducts, 5);
  assert.equal(getProductionCommissionDashboard(db).pending.length, 1);

  const finishedBalance = db.prepare(`SELECT b.quantity FROM inventory_balances b JOIN inventory_items i ON i.id=b.item_id WHERE i.product_id=?`).get(product.id);
  assert.equal(finishedBalance.quantity, 5);
  const finishedItem = getProductionInventory(db).items.find((item) => item.productId === product.id);
  assert.equal(finishedItem.quantity, 5);
  assert.equal(finishedItem.availableQuantity, 5);
  assert.equal(finishedItem.hasInitialStock, false);
  assert.throws(() => registerProductionInventoryEntry(db, { itemId: finishedItem.id, mode: "initial", quantity: 1.5 }, admin.id), /unidades enteras/);
  registerProductionInventoryEntry(db, { itemId: finishedItem.id, mode: "initial", quantity: 12, notes: "Conteo inicial" }, admin.id);
  assert.equal(getProductionInventory(db).items.find((item) => item.id === finishedItem.id).hasInitialStock, true);
  assert.throws(() => registerProductionInventoryEntry(db, { itemId: finishedItem.id, mode: "initial", quantity: 14 }, admin.id), /ya fue cargado/);
  adjustProductionInventory(db, { itemId: finishedItem.id, quantity: 9, reason: "Corrección de conteo" }, admin.id);
  assert.equal(getProductionInventory(db).items.find((item) => item.id === finishedItem.id).quantity, 9);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(raw.id).quantity, 88);
  db.prepare("UPDATE inventory_items SET currency='ARS',purchase_cost=2,conversion_factor=1 WHERE id=?").run(raw.id);
  db.prepare("UPDATE settings SET value='100' WHERE key='production_hourly_cost_ars'").run();
  const valuation = getInventoryValuation(db);
  assert.equal(valuation.summary.rawMaterialsValueArs, 176);
  assert.equal(valuation.summary.finishedProductsValueArs, 1206);
  assert.equal(valuation.summary.totalInventoryValueArs, 1382);
  assert.equal(valuation.groups.finishedProducts[0].unitCostArs, 134);
  assert.equal(valuation.groups.finishedProducts[0].availableQuantity, 9);
  assert.equal(valuation.summary.incompleteItems, 0);
  assert.equal(db.prepare("SELECT balance_after FROM inventory_movements WHERE item_id=? ORDER BY id DESC LIMIT 1").get(raw.id).balance_after, 88);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type='production_report' AND reference_id=?").get(report.id).count, 2);
  assert.equal(getCurrentProductionDashboard(db).plan.items[0].remainingQuantity, 5);
  db.prepare(`UPDATE inventory_balances SET quantity=-8 WHERE item_id=(SELECT id FROM inventory_items WHERE product_id=?)`).run(product.id);
  const closed = closeProductionPlan(db, plan.id, admin.id);
  assert.equal(closed.plan.status, "closed");
  assert.equal(closed.nextPlan.weekStart, "2026-07-20");
  assert.equal(closed.nextPlan.summary.scheduledHours, 35);
  assert.equal(closed.nextPlan.summary.operatorCount, 3);
  assert.equal(closed.nextPlan.summary.availableLaborHours, 105);
  assert.equal(closed.nextPlan.summary.requiredLaborHours, 4);
  assert.equal(closed.nextPlan.items[0].carryoverQuantity, 5);
  assert.equal(closed.nextPlan.items[0].suggestedQuantity, 8);
  assert.equal(closed.nextPlan.items[0].targetQuantity, 8);
  approveProductionPlan(db, closed.nextPlan.id, admin.id);
});

test("unplanned production consumes its full recipe without advancing the weekly plan", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-production-extra-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-extra@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });
  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  const family = db.prepare("INSERT INTO product_families(name,slug) VALUES('Produccion adicional','produccion-adicional') RETURNING id").get();
  const planned = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('PLAN-001','7790000000100','Producto planificado','producto-planificado',?,1000,'2026-07-01') RETURNING id`).get(family.id);
  const extra = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('EXTRA-001','7790000000101','Producto aprovechado','producto-aprovechado',?,1000,'2026-07-01') RETURNING id`).get(family.id);
  const extraSecond = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('EXTRA-002','7790000000102','Segundo producto aprovechado','segundo-producto-aprovechado',?,1000,'2026-07-01') RETURNING id`).get(family.id);
  const raw = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit) VALUES('MP-EXTRA','Materia prima compartida','raw_material','unidad') RETURNING id`).get();
  db.prepare("INSERT INTO inventory_balances(item_id,quantity) VALUES(?,100)").run(raw.id);
  upsertProductionRecipe(db, {
    productId: planned.id, kmCode: "PLAN-001", ean13: "7790000000100", productionCommissionArs: 0,
    components: [{ itemId: raw.id, quantity: 1 }]
  });
  upsertProductionRecipe(db, {
    productId: extra.id, kmCode: "EXTRA-001", ean13: "7790000000101", productionCommissionArs: 25,
    components: [{ itemId: raw.id, quantity: 4 }]
  });
  upsertProductionRecipe(db, {
    productId: extraSecond.id, kmCode: "EXTRA-002", ean13: "7790000000102", productionCommissionArs: 10,
    components: [{ itemId: raw.id, quantity: 2 }]
  });
  const operator = await upsertProductionOperator(db, {
    name: "Operario adicional", email: "extra@km-detail.com", portalPassword: "clave-produccion-2026", portalAccessEnabled: true
  });
  const session = await loginProductionOperator(db, { email: operator.email, password: "clave-produccion-2026" });
  const plan = saveProductionPlan(db, { weekStart: "2026-07-13", items: [{ productId: planned.id, targetQuantity: 10 }] }, admin.id);
  approveProductionPlan(db, plan.id, admin.id);
  const dashboard = getCurrentProductionDashboard(db);
  assert.ok(dashboard.products.some((product) => product.id === extra.id && product.kmCode === "EXTRA-001"));

  const report = saveDailyProductionReport(db, {
    productionDate: "2026-07-16",
    items: [
      { productId: planned.id, goodQuantity: 2, rejectedQuantity: 0 },
      { productId: extra.id, goodQuantity: 3, rejectedQuantity: 1, notes: "Aprovechamiento de sobrante" }
    ]
  }, session.operator);
  const unplannedItem = report.items.find((item) => item.productId === extra.id);
  assert.equal(unplannedItem.planItemId, null);
  assert.equal(unplannedItem.notes, "Aprovechamiento de sobrante");
  submitDailyProductionReport(db, report.id, session.operator);
  const reopened = saveDailyProductionReport(db, {
    productionDate: "2026-07-16",
    items: [
      { productId: planned.id, goodQuantity: 2, rejectedQuantity: 0 },
      { productId: extra.id, goodQuantity: 3, rejectedQuantity: 1, notes: "Aprovechamiento de sobrante" },
      { productId: extraSecond.id, goodQuantity: 5, rejectedQuantity: 0, notes: "Segunda producción adicional" }
    ]
  }, session.operator);
  assert.equal(reopened.status, "draft");
  assert.equal(reopened.items.find((item) => item.productId === extraSecond.id).planItemId, null);
  submitDailyProductionReport(db, reopened.id, session.operator);
  confirmDailyProductionReport(db, reopened.id, admin.id);

  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(raw.id).quantity, 72);
  assert.equal(db.prepare(`SELECT b.quantity FROM inventory_balances b JOIN inventory_items i ON i.id=b.item_id WHERE i.product_id=?`).get(extra.id).quantity, 3);
  const updated = getCurrentProductionDashboard(db).plan;
  assert.equal(updated.items[0].producedQuantity, 2);
  assert.equal(updated.items[0].remainingQuantity, 8);
  assert.equal(updated.summary.unplannedProducedQuantity, 8);
  assert.equal(updated.summary.actualProducedQuantity, 10);
  const commissions = getProductionCommissionDashboard(db).pending.filter((entry) => entry.productId === extra.id);
  assert.equal(commissions.length, 1);
  assert.equal(commissions[0].amountArs, 75);
});

test("administration can urgently extend the active weekly production plan", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-production-extension-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-extension@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });
  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  const family = db.prepare("INSERT INTO product_families(name,slug) VALUES('Ampliacion semanal','ampliacion-semanal') RETURNING id").get();
  const first = db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('PLAN-A','7790000000200','Producto inicial','producto-inicial',?,1000,'2026-07-01') RETURNING id`).get(family.id);
  db.prepare(`INSERT INTO products(km_code,ean13,name,slug,family_id,base_price_cents,price_effective_from)
    VALUES('URG-001','7790000000201','Producto urgente','producto-urgente',?,1000,'2026-07-01')`).run(family.id);
  const plan = saveProductionPlan(db, { weekStart: "2026-07-13", items: [{ productId: first.id, targetQuantity: 10 }] }, admin.id);
  approveProductionPlan(db, plan.id, admin.id);

  const extended = addProductionPlanItem(db, plan.id, {
    kmCode: "urg-001", quantity: 25, reason: "Pedido urgente de cliente", urgent: true
  }, admin.id);
  const urgent = extended.items.find((item) => item.kmCode === "URG-001");
  assert.equal(urgent.targetQuantity, 25);
  assert.equal(urgent.addedQuantity, 25);
  assert.equal(urgent.urgent, true);
  assert.equal(urgent.latestAdditionReason, "Pedido urgente de cliente");

  const increased = addProductionPlanItem(db, plan.id, {
    kmCode: "URG-001", quantity: 5, reason: "Ampliación adicional", urgent: false
  }, admin.id);
  const updated = increased.items.find((item) => item.kmCode === "URG-001");
  assert.equal(updated.targetQuantity, 30);
  assert.equal(updated.addedQuantity, 30);
  assert.equal(updated.urgent, true);
  const operatorView = getCurrentProductionDashboard(db).plan.items.find((item) => item.kmCode === "URG-001");
  assert.equal(operatorView.urgent, true);
  assert.equal(operatorView.latestAdditionReason, "Ampliación adicional");
  assert.equal(operatorView.addedQuantity, 30);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM production_plan_additions WHERE plan_id=?").get(plan.id).count, 2);
});
