import fs from "node:fs";
import path from "node:path";

const defaultMasterPath = path.resolve(import.meta.dirname, "..", "data", "production-master-v1.json");
const initialProductionTimesKey = "production_time_defaults_20260719_v1";

export function synchronizeProductionMaster(db, { masterPath = defaultMasterPath, force = false } = {}) {
  const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  validateMasterShape(master);
  synchronizeInitialProductionTimes(db);
  const currentVersion = db.prepare("SELECT value FROM settings WHERE key='production_master_version'").get()?.value || "";
  if (!force && currentVersion === master.version) {
    synchronizeSuppliers(db, master);
    synchronizeIntermediateRecipes(db);
    return masterStatus(db, master, true);
  }

  const products = db.prepare("SELECT id,km_code,ean13,name FROM products WHERE active=1").all();
  const productByCode = new Map(products.map((product) => [product.km_code.toUpperCase(), product]));
  const mismatches = [];
  for (const recipe of master.recipes) {
    const product = productByCode.get(recipe.kmCode.toUpperCase());
    if (!product) mismatches.push(`${recipe.kmCode}: no existe como producto activo`);
    else if (normalizeEan(product.ean13) !== normalizeEan(recipe.ean13)) {
      mismatches.push(`${recipe.kmCode}: EAN ${product.ean13} no coincide con ${recipe.ean13}`);
    }
  }
  if (mismatches.length) throw new Error(`No se importó el maestro de producción. ${mismatches.join("; ")}`);

  const materialCodes = new Set(master.materials.map((material) => material.itemCode.toUpperCase()));
  const missingComponents = master.recipes.flatMap((recipe) => recipe.components)
    .filter((component) => !materialCodes.has(component.itemCode.toUpperCase()))
    .map((component) => component.itemCode);
  if (missingComponents.length) throw new Error(`El maestro contiene insumos inexistentes: ${[...new Set(missingComponents)].join(", ")}`);

  db.exec("BEGIN IMMEDIATE");
  try {
    const upsertItem = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit,product_id,active,item_kind,purchase_unit,
      conversion_factor,currency,purchase_cost,tracks_stock,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(item_code) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,unit=excluded.unit,
      product_id=excluded.product_id,active=excluded.active,item_kind=excluded.item_kind,purchase_unit=excluded.purchase_unit,
      conversion_factor=excluded.conversion_factor,currency=excluded.currency,purchase_cost=excluded.purchase_cost,
      tracks_stock=excluded.tracks_stock,updated_at=CURRENT_TIMESTAMP`);

    for (const recipe of master.recipes) {
      const product = productByCode.get(recipe.kmCode.toUpperCase());
      upsertItem.run(`PT-${product.km_code}`, product.name, "finished_product", "unidad", product.id, 1,
        "finished_product", "unidad", 1, "ARS", 0, 1);
    }
    for (const material of master.materials) {
      if (material.itemCode.startsWith("PT-")) continue;
      const itemKind = material.itemCode.startsWith("SRV-") ? "service"
        : material.itemCode.startsWith("MP-BOLSA-") ? "packaging"
        : material.itemType === "intermediate" ? "intermediate" : "raw_material";
      upsertItem.run(material.itemCode, material.name, material.itemType, material.unit, null, material.active ? 1 : 0,
        itemKind, material.purchaseUnit || material.unit, Number(material.purchaseContent || 1),
        material.currency === "ARS" ? "ARS" : "USD", Number(material.purchaseCost || 0), itemKind === "service" ? 0 : 1);
    }
    db.prepare("INSERT OR IGNORE INTO inventory_balances(item_id,quantity) SELECT id,0 FROM inventory_items").run();
    synchronizeSuppliers(db, master);

    const itemByCode = new Map(db.prepare("SELECT id,item_code FROM inventory_items").all()
      .map((item) => [item.item_code.toUpperCase(), item.id]));
    const deleteBom = db.prepare("DELETE FROM product_bom WHERE product_id=?");
    const insertBom = db.prepare("INSERT INTO product_bom(product_id,component_item_id,quantity,active) VALUES(?,?,?,1)");
    const updateCommission = db.prepare("UPDATE products SET production_commission_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?");
    let recipeLines = 0;
    for (const recipe of master.recipes) {
      const product = productByCode.get(recipe.kmCode.toUpperCase());
      updateCommission.run(Math.round(Number(master.productionCommissionsArs[recipe.kmCode]) * 100), product.id);
      const quantities = new Map();
      for (const component of recipe.components) {
        const key = component.itemCode.toUpperCase();
        quantities.set(key, (quantities.get(key) || 0) + Number(component.quantity));
      }
      deleteBom.run(product.id);
      for (const [itemCode, quantity] of quantities) {
        insertBom.run(product.id, itemByCode.get(itemCode), quantity);
        recipeLines += 1;
      }
    }
    db.prepare(`INSERT INTO settings(key,value) VALUES('production_master_version',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(master.version);
    synchronizeIntermediateRecipes(db);
    db.exec("COMMIT");
    return { ...masterStatus(db, master, false), recipeLines };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function synchronizeInitialProductionTimes(db) {
  if (db.prepare("SELECT value FROM settings WHERE key=?").get(initialProductionTimesKey)) return;
  const activeProducts = db.prepare("SELECT COUNT(*) AS count FROM products WHERE active=1").get().count;
  if (!activeProducts) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const updated = db.prepare(`UPDATE products
      SET production_minutes_per_unit=5,updated_at=CURRENT_TIMESTAMP
      WHERE active=1`).run();
    const exceptions = db.prepare(`UPDATE products
      SET production_minutes_per_unit=0.25,updated_at=CURRENT_TIMESTAMP
      WHERE active=1 AND UPPER(km_code) IN ('DL112K','DL114K','DL116K')`).run();
    if (exceptions.changes !== 3) {
      throw new Error("No se encontraron los tres productos DL112K, DL114K y DL116K para asignar sus tiempos.");
    }
    db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(initialProductionTimesKey, JSON.stringify({
      products: updated.changes,
      defaultMinutes: 5,
      exceptionMinutes: 0.25,
      appliedAt: new Date().toISOString()
    }));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function synchronizeIntermediateRecipes(db) {
  const formulas = [
    { itemCode: "INT-PEG-ESP", output: 9773.19587628866, notes: "Lote de 9.480 g con peso específico 0,97", components: [["MP-E530", 9000], ["MP-DBP", 80], ["MP-HOSTAPUR", 200], ["MP-TYLOSE", 200]] },
    { itemCode: "INT-CEMENTO", output: 1000, notes: "Mezcla preparada al usar en relación 4:1", components: [["MP-CEMENTO", 800], ["MP-DILUYENTE", 200]] },
    { itemCode: "INT-BUJE", output: 185, notes: "Una barra, descontando 15 cm de desperdicio", components: [["MP-BARRA-AL", 1]] },
    { itemCode: "INT-PLACA", output: 1, notes: "ABS, buje y servicio de inyección por placa", components: [["MP-ABS", 52], ["INT-BUJE", 1], ["SRV-INYECCION", 1]] }
  ];
  const item = db.prepare("SELECT id FROM inventory_items WHERE item_code=? COLLATE NOCASE");
  const insertRecipe = db.prepare("INSERT OR IGNORE INTO inventory_item_recipes(item_id,output_quantity,notes) VALUES(?,?,?)");
  const insertComponent = db.prepare("INSERT OR IGNORE INTO inventory_item_recipe_components(item_id,component_item_id,quantity) VALUES(?,?,?)");
  for (const formula of formulas) {
    const parent = item.get(formula.itemCode);
    if (!parent) continue;
    insertRecipe.run(parent.id, formula.output, formula.notes);
    for (const [componentCode, quantity] of formula.components) {
      const component = item.get(componentCode);
      if (component) insertComponent.run(parent.id, component.id, quantity);
    }
  }
}

function synchronizeSuppliers(db, master) {
  const ignored = /^(a confirmar|inyector a confirmar|produccion interna|preparado al usar|tercero \/ km)$/i;
  const insertSupplier = db.prepare("INSERT OR IGNORE INTO production_suppliers(name) VALUES(?)");
  const supplierByName = db.prepare("SELECT id FROM production_suppliers WHERE name=? COLLATE NOCASE");
  const itemByCode = db.prepare("SELECT id FROM inventory_items WHERE item_code=? COLLATE NOCASE");
  const insertRelation = db.prepare(`INSERT OR IGNORE INTO production_supplier_items(supplier_id,item_id,is_primary,active)
    VALUES(?,?,1,1)`);
  for (const material of master.materials) {
    const supplierName = String(material.supplier || "").trim();
    if (!supplierName || ignored.test(supplierName)) continue;
    const item = itemByCode.get(material.itemCode);
    if (!item) continue;
    insertSupplier.run(supplierName);
    const supplier = supplierByName.get(supplierName);
    const currentPrimary = db.prepare(`SELECT supplier_id FROM production_supplier_items
      WHERE item_id=? AND is_primary=1 AND active=1`).get(item.id);
    if (!currentPrimary) insertRelation.run(supplier.id, item.id);
    else db.prepare(`INSERT OR IGNORE INTO production_supplier_items(supplier_id,item_id,is_primary,active)
      VALUES(?,?,0,1)`).run(supplier.id, item.id);
  }
}

function masterStatus(db, master, skipped) {
  return {
    version: master.version,
    skipped,
    products: master.recipes.length,
    sourceLines: master.expectedSourceLines,
    materials: master.materials.length,
    activeMaterials: master.materials.filter((material) => material.active).length,
    recipeLines: db.prepare("SELECT COUNT(*) AS count FROM product_bom WHERE active=1").get().count,
  };
}

function validateMasterShape(master) {
  if (!master || typeof master.version !== "string" || !Array.isArray(master.materials) || !Array.isArray(master.recipes)) {
    throw new Error("El archivo maestro de producción no tiene un formato válido.");
  }
  if (master.recipes.length !== master.expectedProducts) throw new Error("El maestro no contiene la cantidad esperada de productos.");
  const sourceLines = master.recipes.reduce((total, recipe) => total + (recipe.components?.length || 0), 0);
  if (sourceLines !== master.expectedSourceLines) throw new Error("El maestro no contiene la cantidad esperada de líneas de receta.");
  const codes = new Set(master.recipes.map((recipe) => recipe.kmCode.toUpperCase()));
  if (codes.size !== master.recipes.length) throw new Error("El maestro contiene códigos KM repetidos.");
  if (!master.productionCommissionsArs || Object.keys(master.productionCommissionsArs).length !== master.recipes.length) {
    throw new Error("El maestro no contiene una comisión de producción para cada producto.");
  }
  for (const recipe of master.recipes) {
    if (!recipe.kmCode || !recipe.ean13 || !Array.isArray(recipe.components) || !recipe.components.length) {
      throw new Error(`La receta ${recipe.kmCode || "sin código"} está incompleta.`);
    }
    const commission = Number(master.productionCommissionsArs[recipe.kmCode]);
    if (!Number.isFinite(commission) || commission < 0) throw new Error(`La comisión de ${recipe.kmCode} no es válida.`);
    for (const component of recipe.components) {
      if (!component.itemCode || !Number.isFinite(Number(component.quantity)) || Number(component.quantity) <= 0) {
        throw new Error(`La receta ${recipe.kmCode} tiene un componente inválido.`);
      }
    }
  }
}

function normalizeEan(value) {
  return String(value || "").replace(/\D/g, "").padStart(13, "0");
}
