import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, transaction } from "../server/db.js";
import { upsertProduct } from "../server/services/product-service.js";
import { updateOrderFulfillment } from "../server/services/order-service.js";
import { synchronizeProductionMaster } from "../server/services/production-master-service.js";
import { getCommercialSettings, updateCommercialSettings } from "../server/services/settings-service.js";
import {
  adjustProductionInventory, approveProductionPlan, confirmDailyProductionReport, getProductionInventory, getProductionReportImpact, getProductionStockParameters, getProductionSuggestions, listProductionMaterials,
  listProductionRecipes, listProductionSuppliers, registerProductionInventoryEntry, saveDailyProductionReport, saveProductionPlan, saveProductionStockItemParameter, saveProductionStockParameterDefaults, submitDailyProductionReport, upsertProductionMaterial,
  upsertProductionOperator, upsertProductionRecipe, upsertProductionSupplier
} from "../server/services/production-service.js";

const catalogPath = path.resolve(import.meta.dirname, "..", "server", "data", "catalog-2026.json");

test("production master imports every validated recipe idempotently by KM code and EAN", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-production-master-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "master@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  transaction(db, () => catalog.products.map((product) => upsertProduct(db, product)));

  const imported = synchronizeProductionMaster(db);
  assert.equal(imported.skipped, false);
  assert.equal(imported.products, 104);
  assert.equal(imported.sourceLines, 560);
  assert.equal(imported.materials, 51);
  assert.equal(imported.activeMaterials, 50);
  assert.equal(imported.recipeLines, 527);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT product_id) AS count FROM product_bom WHERE active=1").get().count, 104);
  assert.equal(db.prepare("SELECT active FROM inventory_items WHERE item_code='MP-BOLSA-ZIP'").get().active, 0);
  const materials = listProductionMaterials(db);
  assert.equal(materials.length, 49);
  assert.equal(materials.find((item) => item.itemCode === "MP-ESP-CEL-12").purchaseCost, 10);
  assert.equal(materials.find((item) => item.itemCode === "MP-ESP-CEL-12").purchaseUnit, "kg");
  assert.equal(materials.find((item) => item.itemCode === "MP-BOLSA-065").itemKind, "packaging");
  assert.equal(materials.find((item) => item.itemCode === "SRV-INYECCION").tracksStock, false);
  assert.equal(materials.find((item) => item.itemCode === "MP-ESP-CEL-12").primarySupplier.name, "Norflex");
  const importedSuppliers = listProductionSuppliers(db);
  assert.equal(importedSuppliers.length, 8);
  assert.ok(importedSuppliers.find((supplier) => supplier.name === "Norflex").materials.length > 0);
  const recipes = listProductionRecipes(db);
  assert.equal(recipes.length, 104);
  assert.ok(recipes.every((recipe) => recipe.complete));
  const cp171Recipe = recipes.find((recipe) => recipe.kmCode === "CP171K");
  const updatedRecipe = upsertProductionRecipe(db, {
    productId: cp171Recipe.productId, kmCode: cp171Recipe.kmCode, ean13: cp171Recipe.ean13,
    components: cp171Recipe.components.map((component, index) => ({ itemId: component.itemId, quantity: index ? component.quantity : component.quantity + 1 }))
  });
  assert.equal(updatedRecipe.components[0].quantity, cp171Recipe.components[0].quantity + 1);
  assert.throws(() => upsertProductionRecipe(db, {
    productId: cp171Recipe.productId, kmCode: cp171Recipe.kmCode, ean13: "9999999999999",
    components: cp171Recipe.components
  }), /EAN/i);

  const createdMaterial = upsertProductionMaterial(db, {
    itemCode: "MP-PRUEBA", name: "Insumo de prueba", category: "Pruebas", itemKind: "raw_material",
    purchaseUnit: "rollo", currency: "USD", purchaseCost: 25.5, minimumPurchase: 2,
    leadTimeDays: 7, unit: "metro", conversionFactor: 50, tracksStock: true, active: true
  });
  assert.equal(createdMaterial.conversionFactor, 50);
  assert.equal(createdMaterial.quantity, 0);
  const supplier = upsertProductionSupplier(db, {
    name: "Proveedor de prueba", contactName: "Contacto", email: "compras@proveedor.test",
    city: "Rosario", province: "Santa Fe", materialIds: [createdMaterial.id], active: true
  });
  assert.deepEqual(supplier.materialIds, [createdMaterial.id]);
  const assignedMaterial = upsertProductionMaterial(db, { ...createdMaterial, primarySupplierId: supplier.id });
  assert.equal(assignedMaterial.primarySupplier.name, "Proveedor de prueba");
  const editedMaterial = upsertProductionMaterial(db, { ...createdMaterial, purchaseCost: 27, active: false });
  assert.equal(editedMaterial.purchaseCost, 27);
  assert.equal(editedMaterial.active, false);
  assert.throws(() => upsertProductionMaterial(db, { ...createdMaterial, id: undefined }), /código interno/i);

  const pa160Glue = db.prepare(`SELECT b.quantity FROM product_bom b
    JOIN products p ON p.id=b.product_id JOIN inventory_items i ON i.id=b.component_item_id
    WHERE p.km_code='PA160K' AND i.item_code='INT-PEG-ESP'`).get();
  assert.ok(Math.abs(pa160Glue.quantity - 2.8) < 0.000001);

  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
  assert.equal(getCommercialSettings(db).usdExchangeRate, 1400);
  updateCommercialSettings(db, { usdExchangeRate: 1525.5 }, admin.id);
  assert.equal(getCommercialSettings(db).usdExchangeRate, 1525.5);
  assert.throws(() => updateCommercialSettings(db, { usdExchangeRate: 0 }, admin.id), /tipo de cambio/i);
  const cp171 = db.prepare("SELECT id FROM products WHERE km_code='CP171K'").get();
  const operator = await upsertProductionOperator(db, {
    name: "Operario Maestro", email: "operario-maestro@km-detail.com", portalPassword: "clave-produccion-2026"
  });
  const plan = saveProductionPlan(db, { weekStart: "2026-07-13", items: [{ productId: cp171.id, targetQuantity: 1 }] }, admin.id);
  approveProductionPlan(db, plan.id, admin.id);
  const report = saveDailyProductionReport(db, {
    productionDate: "2026-07-17", items: [{ productId: cp171.id, goodQuantity: 1, rejectedQuantity: 0 }]
  }, operator);
  submitDailyProductionReport(db, report.id, operator);
  const preview = getProductionReportImpact(db, report.id);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.products[0].resultingBalance, 1);
  assert.ok(preview.components.length > 0);
  assert.match(preview.warnings[0], /stock inicial/i);
  const confirmation = confirmDailyProductionReport(db, report.id, admin.id);
  assert.match(confirmation.warnings[0], /stock inicial/i);
  assert.equal(confirmation.impact.mode, "applied");
  assert.ok(confirmation.impact.components.every((movement) => movement.balanceAfter !== null));
  assert.equal(db.prepare(`SELECT b.quantity FROM inventory_balances b JOIN inventory_items i ON i.id=b.item_id
    WHERE i.product_id=?`).get(cp171.id).quantity, 1);
  const inventory = getProductionInventory(db);
  assert.equal(inventory.inventoryInitialized, false);
  assert.equal(inventory.summary.finishedProducts, 104);
  assert.ok(inventory.movements.length > 0);

  const raw = db.prepare("SELECT id FROM inventory_items WHERE item_code='MP-ESP-CEL-12'").get();
  const rawMaterial = listProductionMaterials(db).find((item) => item.id === raw.id);
  const receipt = registerProductionInventoryEntry(db, { itemId: raw.id, mode: "purchase", quantity: 2, supplierId: rawMaterial.primarySupplier.id, minimumStock: 50, notes: "Factura de prueba" }, admin.id);
  assert.equal(receipt.stockQuantity, rawMaterial.conversionFactor * 2);
  assert.equal(receipt.supplier.name, "Norflex");
  const initial = registerProductionInventoryEntry(db, { itemId: raw.id, mode: "initial", quantity: 1.5, minimumStock: 40 }, admin.id);
  assert.equal(initial.quantity, rawMaterial.conversionFactor * 1.5);
  const intermediate = db.prepare("SELECT id FROM inventory_items WHERE item_code='INT-PEG-ESP'").get();
  const preparation = registerProductionInventoryEntry(db, { itemId: intermediate.id, mode: "preparation", quantity: 700, minimumStock: 200 }, admin.id);
  assert.equal(preparation.stockQuantity, 700);
  assert.throws(() => registerProductionInventoryEntry(db, { itemId: intermediate.id, mode: "purchase", quantity: 1 }, admin.id), /preparación/i);
  const adjustment = adjustProductionInventory(db, { itemId: raw.id, quantity: 150, minimumStock: 40, reason: "Conteo inicial de prueba" }, admin.id);
  assert.equal(adjustment.quantity, 150);
  assert.equal(getProductionInventory(db).items.find((item) => item.id === raw.id).minimumStock, 40);
  assert.equal(db.prepare("SELECT movement_type FROM inventory_movements WHERE item_id=? ORDER BY id DESC LIMIT 1").get(raw.id).movement_type, "stock_adjustment");
  let parameters = getProductionStockParameters(db);
  assert.deepEqual(parameters.defaults, { productSafetyDays: 30, materialSafetyDays: 30 });
  parameters = saveProductionStockParameterDefaults(db, { productSafetyDays: 21, materialSafetyDays: 14 }, admin.id);
  assert.deepEqual(parameters.defaults, { productSafetyDays: 21, materialSafetyDays: 14 });
  const productItem = parameters.items.find((item) => item.itemCode === "CP171K");
  parameters = saveProductionStockItemParameter(db, { itemId: productItem.id, safetyDays: 35, minimumBatch: 12 });
  assert.equal(parameters.items.find((item) => item.id === productItem.id).effectiveSafetyDays, 35);
  assert.equal(parameters.items.find((item) => item.id === productItem.id).minimumBatch, 12);
  parameters = saveProductionStockItemParameter(db, { itemId: raw.id, useDefault: true });
  assert.equal(parameters.items.find((item) => item.id === raw.id).effectiveSafetyDays, 14);
  assert.equal(parameters.items.find((item) => item.id === raw.id).usesDefault, true);
  let suggestions = getProductionSuggestions(db);
  assert.equal(suggestions.history.status, "collecting");
  assert.equal(suggestions.products.length, 104);
  assert.equal(suggestions.summary.productsToProduce, 0);
  const customerUser = db.prepare("INSERT INTO users(email,password_hash,role) VALUES('forecast@test.local','x','customer') RETURNING id").get();
  const customer = db.prepare(`INSERT INTO customers(user_id,first_name,last_name,business_name,tax_id,tax_condition,customer_type,industry,city,province,address,phone,whatsapp,contact_person,approval_status,terms_accepted_at,privacy_accepted_at)
    VALUES(?,'Prueba','Forecast','Cliente forecast','30-99999999-1','RI','comercio','detailing','Rosario','Santa Fe','Calle 1','1','1','Prueba','approved',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`).get(customerUser.id);
  const insertOrder = db.prepare(`INSERT INTO orders(customer_id,status,payment_status,fulfillment_status,discount_1_bps,discount_2_bps,discount_3_bps,subtotal_net_cents,vat_bps,vat_cents,total_cents,bank_snapshot_json,shipping_snapshot_json,price_reserved_at)
    VALUES(?,?,?,?,0,0,0,1000,2100,210,1210,'{}','{}',CURRENT_TIMESTAMP) RETURNING id`);
  const insertOrderItem = db.prepare(`INSERT INTO order_items(order_id,product_id,km_code,ean13,product_name,quantity,base_price_cents,discount_1_bps,discount_2_bps,discount_3_bps,final_unit_price_cents,subtotal_net_cents,confirmed_quantity,confirmed_subtotal_net_cents,line_status)
    VALUES(?,?,?,?,?,?,100,0,0,0,100,1000,?,1000,'confirmed')`);
  const deliveredOrder = insertOrder.get(customer.id, "delivered", "paid", "delivered");
  insertOrderItem.run(deliveredOrder.id, cp171.id, "CP171K", cp171Recipe.ean13, cp171Recipe.name, 14, 14);
  const activeOrder = insertOrder.get(customer.id, "availability_confirmed", "paid", "pending");
  insertOrderItem.run(activeOrder.id, cp171.id, "CP171K", cp171Recipe.ean13, cp171Recipe.name, 8, 8);
  suggestions = getProductionSuggestions(db);
  const cp171Suggestion = suggestions.products.find((product) => product.kmCode === "CP171K");
  assert.equal(suggestions.history.status, "learning");
  assert.equal(cp171Suggestion.dailyDemand, 2);
  assert.equal(cp171Suggestion.pendingQuantity, 8);
  assert.equal(cp171Suggestion.suggestedQuantity, 84);
  assert.ok(suggestions.materials.some((material) => material.plannedRequirement > 0));
  updateOrderFulfillment(db, activeOrder.id, { fulfillmentStatus: "ready" }, admin.id);
  updateOrderFulfillment(db, activeOrder.id, {
    fulfillmentStatus: "shipped", fulfillmentMethod: "carrier", fulfillmentCarrier: "Transporte prueba", fulfillmentTracking: "GUIA-1", fulfillmentEstimatedDate: "2026-07-20"
  }, admin.id);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(productItem.id).quantity, -7);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM inventory_movements WHERE item_id=? AND movement_type='order_dispatch' AND reference_id=?").get(productItem.id, activeOrder.id).count, 1);
  suggestions = getProductionSuggestions(db);
  const cp171AfterDispatch = suggestions.products.find((product) => product.kmCode === "CP171K");
  assert.equal(cp171AfterDispatch.pendingQuantity, 0);
  assert.equal(cp171AfterDispatch.deliveredQuantity, 22);
  assert.ok(Math.abs(cp171AfterDispatch.dailyDemand - (22 / 7)) < 1e-9);
  assert.equal(cp171AfterDispatch.suggestedQuantity, 120);
  db.prepare("UPDATE inventory_balances SET quantity=123.5 WHERE item_id=?").run(raw.id);
  const repeated = synchronizeProductionMaster(db);
  assert.equal(repeated.skipped, true);
  assert.equal(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(raw.id).quantity, 123.5);

  const before = db.prepare("SELECT COUNT(*) AS count FROM product_bom").get().count;
  db.prepare("UPDATE products SET ean13='9999999999999' WHERE km_code='CP171K'").run();
  assert.throws(() => synchronizeProductionMaster(db, { force: true }), /EAN/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_bom").get().count, before);
});
