import fs from "node:fs";
import path from "node:path";

const defaultMasterPath = path.resolve(import.meta.dirname, "..", "data", "production-master-v1.json");

export function synchronizeProductionMaster(db, { masterPath = defaultMasterPath, force = false } = {}) {
  const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));
  validateMasterShape(master);
  const currentVersion = db.prepare("SELECT value FROM settings WHERE key='production_master_version'").get()?.value || "";
  if (!force && currentVersion === master.version) return masterStatus(db, master, true);

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
    const upsertItem = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit,product_id,active,updated_at)
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(item_code) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,unit=excluded.unit,
      product_id=excluded.product_id,active=excluded.active,updated_at=CURRENT_TIMESTAMP`);

    for (const recipe of master.recipes) {
      const product = productByCode.get(recipe.kmCode.toUpperCase());
      upsertItem.run(`PT-${product.km_code}`, product.name, "finished_product", "unidad", product.id, 1);
    }
    for (const material of master.materials) {
      if (material.itemCode.startsWith("PT-")) continue;
      upsertItem.run(material.itemCode, material.name, material.itemType, material.unit, null, material.active ? 1 : 0);
    }
    db.prepare("INSERT OR IGNORE INTO inventory_balances(item_id,quantity) SELECT id,0 FROM inventory_items").run();

    const itemByCode = new Map(db.prepare("SELECT id,item_code FROM inventory_items").all()
      .map((item) => [item.item_code.toUpperCase(), item.id]));
    const deleteBom = db.prepare("DELETE FROM product_bom WHERE product_id=?");
    const insertBom = db.prepare("INSERT INTO product_bom(product_id,component_item_id,quantity,active) VALUES(?,?,?,1)");
    let recipeLines = 0;
    for (const recipe of master.recipes) {
      const product = productByCode.get(recipe.kmCode.toUpperCase());
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
    db.exec("COMMIT");
    return { ...masterStatus(db, master, false), recipeLines };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
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
  for (const recipe of master.recipes) {
    if (!recipe.kmCode || !recipe.ean13 || !Array.isArray(recipe.components) || !recipe.components.length) {
      throw new Error(`La receta ${recipe.kmCode || "sin código"} está incompleta.`);
    }
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
