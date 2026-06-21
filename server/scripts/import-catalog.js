import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { openDatabase, transaction } from "../db.js";
import { upsertProduct } from "../services/product-service.js";

const defaultCatalogPath = path.resolve(import.meta.dirname, "..", "data", "catalog-2026.json");
const catalogPath = path.resolve(process.argv[2] || defaultCatalogPath);

if (!fs.existsSync(catalogPath)) {
  console.error(`Catalog file not found: ${catalogPath}`);
  process.exitCode = 1;
} else {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(catalog.products) || catalog.products.length === 0) {
    throw new Error("Catalog must contain a non-empty products array");
  }

  const db = await openDatabase(config);
  try {
    const imported = transaction(db, () => catalog.products.map((product) => upsertProduct(db, product)));
    const productCount = db.prepare("SELECT COUNT(*) AS count FROM products WHERE active = 1").get().count;
    const familyCount = db.prepare("SELECT COUNT(*) AS count FROM product_families WHERE active = 1").get().count;
    console.log(`Imported ${imported.length} products from ${path.basename(catalogPath)}.`);
    console.log(`Database now contains ${productCount} active products in ${familyCount} families.`);
  } finally {
    db.close();
  }
}
