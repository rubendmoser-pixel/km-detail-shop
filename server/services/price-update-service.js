import { ValidationError } from "../domain/validation.js";
import { transaction } from "../db.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateEffectiveDate(value) {
  const effectiveDate = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new ValidationError("Ingresa una fecha de implementacion valida.");
  }
  return effectiveDate;
}

function ensureMoneyCents(value, label = "precio") {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) {
    throw new ValidationError(`Ingresa un ${label} valido.`);
  }
  return cents;
}

function ensurePercentBps(value) {
  const bps = Number(value);
  if (!Number.isInteger(bps) || bps === 0 || bps <= -9000 || bps > 100000) {
    throw new ValidationError("Ingresa un porcentaje valido.");
  }
  return bps;
}

function variationBps(oldPriceCents, newPriceCents) {
  if (!oldPriceCents) return newPriceCents ? 10000 : 0;
  return Math.round(((newPriceCents - oldPriceCents) / oldPriceCents) * 10000);
}

function listActiveProducts(db) {
  return db.prepare(`
    SELECT id, km_code AS kmCode, name, base_price_cents AS basePriceCents
    FROM products
    WHERE active = 1
    ORDER BY web_sort_order ASC, km_code ASC
  `).all();
}

function mapBatch(row, items = []) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    effectiveDate: row.effectiveDate,
    percentBps: row.percentBps,
    productCount: row.productCount,
    changedCount: row.changedCount,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
    note: row.note,
    items
  };
}

export function applyDuePriceUpdates(db) {
  const due = db.prepare(`
    SELECT id, effective_date AS effectiveDate
    FROM price_update_batches
    WHERE status = 'scheduled' AND effective_date <= ?
    ORDER BY effective_date ASC, id ASC
  `).all(todayIso());

  if (!due.length) return { applied: 0 };

  const itemsStmt = db.prepare(`
    SELECT product_id AS productId, new_price_cents AS newPriceCents
    FROM price_update_items
    WHERE batch_id = ?
  `);
  const updateProduct = db.prepare(`
    UPDATE products
    SET base_price_cents = ?, price_effective_from = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const updateBatch = db.prepare(`
    UPDATE price_update_batches
    SET status = 'applied', applied_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  transaction(db, () => {
    for (const batch of due) {
      const items = itemsStmt.all(batch.id);
      for (const item of items) {
        updateProduct.run(item.newPriceCents, batch.effectiveDate, item.productId);
      }
      updateBatch.run(batch.id);
    }
  });
  return { applied: due.length };
}

export function scheduleIndividualPriceUpdate(db, body = {}, createdBy = null) {
  const effectiveDate = validateEffectiveDate(body.effectiveDate);
  const products = listActiveProducts(db);
  if (!products.length) throw new ValidationError("No hay productos activos para actualizar.");

  const activeById = new Map(products.map((product) => [product.id, product]));
  const submitted = Array.isArray(body.items) ? body.items : [];
  if (submitted.length !== products.length) {
    throw new ValidationError("Revisa todos los productos activos antes de programar la actualizacion.");
  }

  const normalized = submitted.map((item) => {
    const productId = Number(item.productId);
    const product = activeById.get(productId);
    if (!product) throw new ValidationError("La actualizacion incluye un producto no valido.");
    return { product, newPriceCents: ensureMoneyCents(item.newPriceCents, "precio nuevo") };
  });
  const seen = new Set(normalized.map((item) => item.product.id));
  if (seen.size !== products.length) {
    throw new ValidationError("Hay productos repetidos o sin revisar.");
  }

  const changedCount = normalized.filter((item) => item.newPriceCents !== item.product.basePriceCents).length;
  const batchId = transaction(db, () => {
    const batch = db.prepare(`
      INSERT INTO price_update_batches (type, effective_date, product_count, changed_count, created_by, note)
      VALUES ('individual', ?, ?, ?, ?, ?)
    `).run(effectiveDate, products.length, changedCount, createdBy || null, "Actualizacion uno a uno");
    const insertItem = db.prepare(`
      INSERT INTO price_update_items (batch_id, product_id, km_code, old_price_cents, new_price_cents, variation_bps)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of normalized) {
      insertItem.run(
        batch.lastInsertRowid,
        item.product.id,
        item.product.kmCode,
        item.product.basePriceCents,
        item.newPriceCents,
        variationBps(item.product.basePriceCents, item.newPriceCents)
      );
    }
    return Number(batch.lastInsertRowid);
  });

  return getPriceUpdateBatch(db, batchId);
}

export function scheduleLinearPriceUpdate(db, body = {}, createdBy = null) {
  const effectiveDate = validateEffectiveDate(body.effectiveDate);
  const percentBps = ensurePercentBps(body.percentBps);
  const products = listActiveProducts(db);
  if (!products.length) throw new ValidationError("No hay productos activos para actualizar.");

  const batchId = transaction(db, () => {
    const batch = db.prepare(`
      INSERT INTO price_update_batches (type, effective_date, percent_bps, product_count, changed_count, created_by, note)
      VALUES ('linear', ?, ?, ?, ?, ?, ?)
    `).run(effectiveDate, percentBps, products.length, products.length, createdBy || null, "Aumento lineal");
    const insertItem = db.prepare(`
      INSERT INTO price_update_items (batch_id, product_id, km_code, old_price_cents, new_price_cents, variation_bps)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const product of products) {
      const newPriceCents = Math.max(0, Math.round(product.basePriceCents * (10000 + percentBps) / 10000));
      insertItem.run(
        batch.lastInsertRowid,
        product.id,
        product.kmCode,
        product.basePriceCents,
        newPriceCents,
        variationBps(product.basePriceCents, newPriceCents)
      );
    }
    return Number(batch.lastInsertRowid);
  });

  return getPriceUpdateBatch(db, batchId);
}

export function getPriceUpdateBatch(db, id) {
  const row = db.prepare(`
    SELECT id, type, status, effective_date AS effectiveDate, percent_bps AS percentBps,
      product_count AS productCount, changed_count AS changedCount, created_at AS createdAt,
      applied_at AS appliedAt, note
    FROM price_update_batches
    WHERE id = ?
  `).get(id);
  if (!row) return null;
  const items = db.prepare(`
    SELECT pui.product_id AS productId, pui.km_code AS kmCode,
      pui.old_price_cents AS oldPriceCents, pui.new_price_cents AS newPriceCents,
      pui.variation_bps AS variationBps, p.ean13, p.name, p.measure,
      f.name AS familyName, p.web_sort_order AS webSortOrder,
      pi.stored_filename AS primaryImageFilename,
      pi2.stored_filename AS secondaryImageFilename
    FROM price_update_items pui
    JOIN products p ON p.id = pui.product_id
    JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    )
    LEFT JOIN product_images pi2 ON pi2.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1 OFFSET 1
    )
    WHERE pui.batch_id = ?
    ORDER BY f.sort_order ASC, p.web_sort_order ASC, p.km_code ASC
  `).all(id);
  return mapBatch(row, items.map((item) => ({
    ...item,
    primaryImageUrl: item.primaryImageFilename ? `/media/products/${item.primaryImageFilename}` : "",
    secondaryImageUrl: item.secondaryImageFilename ? `/media/products/${item.secondaryImageFilename}` : ""
  })));
}

export function listPriceUpdateBatches(db) {
  const rows = db.prepare(`
    SELECT id, type, status, effective_date AS effectiveDate, percent_bps AS percentBps,
      product_count AS productCount, changed_count AS changedCount, created_at AS createdAt,
      applied_at AS appliedAt, note
    FROM price_update_batches
    ORDER BY id DESC
    LIMIT 20
  `).all();
  const itemsStmt = db.prepare(`
    SELECT product_id AS productId, km_code AS kmCode, old_price_cents AS oldPriceCents,
      new_price_cents AS newPriceCents, variation_bps AS variationBps
    FROM price_update_items
    WHERE batch_id = ?
    ORDER BY km_code ASC
    LIMIT 8
  `);
  return rows.map((row) => mapBatch(row, itemsStmt.all(row.id)));
}
