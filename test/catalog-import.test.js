import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, transaction } from "../server/db.js";
import { upsertProduct } from "../server/services/product-service.js";

const catalogPath = path.resolve(import.meta.dirname, "..", "server", "data", "catalog-2026.json");

test("catalog source imports 104 active products without duplicates", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-catalog-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  assert.equal(catalog.currency, "ARS");
  assert.equal(catalog.pricesExcludeVat, true);
  assert.equal(catalog.products.length, 104);

  for (let pass = 0; pass < 2; pass += 1) {
    transaction(db, () => catalog.products.map((product) => upsertProduct(db, product)));
  }

  const counts = db.prepare(`
    SELECT COUNT(*) AS products, COUNT(DISTINCT km_code) AS codes,
           COUNT(DISTINCT ean13) AS eans
    FROM products WHERE active = 1
  `).get();
  assert.equal(counts.products, 104);
  assert.equal(counts.codes, 104);
  assert.equal(counts.eans, 104);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_families WHERE active = 1").get().count, 12);
  assert.equal(db.prepare("SELECT base_price_cents FROM products WHERE km_code = 'CP171K'").get().base_price_cents, 881_800);
});
