import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { applyDiscounts } from "../domain/pricing.js";
import { NotFoundError, ValidationError, optionalText, requiredText } from "../domain/validation.js";

const IMAGE_MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function listProducts(db, user) {
  const rows = db.prepare(`
    SELECT p.*, f.name AS family_name, f.slug AS family_slug,
           pi.stored_filename AS primary_image_filename
    FROM products p JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order, id
      LIMIT 1
    )
    WHERE p.active = 1 AND f.active = 1
    ORDER BY f.sort_order, p.web_sort_order, p.name
  `).all();
  const imagesByProduct = productImagesByProduct(db, rows.map((row) => row.id));

  if (!user || user.role !== "customer" || user.approvalStatus !== "approved") {
    return rows.map((row) => publicProduct(row, imagesByProduct.get(row.id) || []));
  }

  const discounts = db.prepare(`
    SELECT discount_1_bps, discount_2_bps, discount_3_bps
    FROM customer_discounts WHERE customer_id = ?
  `).get(user.customerId) || {};
  const discountList = [
    safeBasisPoints(discounts.discount_1_bps),
    safeBasisPoints(discounts.discount_2_bps),
    safeBasisPoints(discounts.discount_3_bps)
  ];
  return rows.map((row) => ({
    ...publicProduct(row, imagesByProduct.get(row.id) || []),
    basePriceCents: row.base_price_cents,
    discountsBps: discountList,
    finalPriceCents: applyDiscounts(row.base_price_cents, discountList),
    currency: row.currency,
    priceEffectiveFrom: row.price_effective_from,
    priceNotice: "Precio neto. IVA no incluido."
  }));
}

function safeBasisPoints(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function listPublicProductsForSeo(db) {
  const rows = db.prepare(`
    SELECT p.*, f.name AS family_name, f.slug AS family_slug,
           pi.stored_filename AS primary_image_filename
    FROM products p JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order, id
      LIMIT 1
    )
    WHERE p.active = 1 AND f.active = 1
    ORDER BY f.sort_order, p.web_sort_order, p.name
  `).all();
  const imagesByProduct = productImagesByProduct(db, rows.map((row) => row.id));
  return rows.map((row) => publicProduct(row, imagesByProduct.get(row.id) || []));
}

export function getPublicProductBySlug(db, slug) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalizedSlug)) return null;
  const row = db.prepare(`
    SELECT p.*, f.name AS family_name, f.slug AS family_slug,
           pi.stored_filename AS primary_image_filename
    FROM products p JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order, id
      LIMIT 1
    )
    WHERE p.active = 1 AND f.active = 1 AND p.slug = ?
  `).get(normalizedSlug);
  if (!row) return null;
  const product = publicProduct(row, productImagesByProduct(db, [row.id]).get(row.id) || []);
  product.relatedProducts = listRelatedPublicProducts(db, row);
  return product;
}

function listRelatedPublicProducts(db, productRow) {
  const rows = db.prepare(`
    SELECT p.*, f.name AS family_name, f.slug AS family_slug,
           pi.stored_filename AS primary_image_filename
    FROM products p JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order, id
      LIMIT 1
    )
    WHERE p.active = 1
      AND f.active = 1
      AND p.id <> ?
      AND (p.family_id = ? OR p.subfamily = ? OR p.attachment_system = ?)
    ORDER BY
      CASE
        WHEN p.subfamily = ? THEN 0
        WHEN p.family_id = ? THEN 1
        ELSE 2
      END,
      p.web_sort_order,
      p.name
    LIMIT 6
  `).all(
    productRow.id,
    productRow.family_id,
    productRow.subfamily,
    productRow.attachment_system,
    productRow.subfamily,
    productRow.family_id
  );
  const imagesByProduct = productImagesByProduct(db, rows.map((row) => row.id));
  return rows.map((row) => publicProduct(row, imagesByProduct.get(row.id) || []));
}

function productImagesByProduct(db, productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT product_id, id, stored_filename, alt_text, is_primary
    FROM product_images
    WHERE product_id IN (${placeholders})
    ORDER BY product_id, is_primary DESC, sort_order, id
  `).all(...productIds);
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.product_id) || [];
    list.push({
      id: row.id,
      url: `/media/products/${row.stored_filename}`,
      altText: row.alt_text || "",
      isPrimary: Boolean(row.is_primary)
    });
    map.set(row.product_id, list);
  }
  return map;
}

export function listAdminProducts(db, filters = {}) {
  const where = [];
  const params = [];
  if (filters.status === "active") where.push("p.active = 1");
  if (filters.status === "inactive") where.push("p.active = 0");
  if (filters.familySlug) {
    where.push("f.slug = ?");
    params.push(filters.familySlug);
  }
  if (filters.search) {
    where.push("(p.km_code LIKE ? OR p.name LIKE ? OR p.ean13 LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT p.id, p.km_code, p.ean13, p.name, p.slug, p.subfamily, p.material,
           p.color, p.measure, p.cut_level, p.attachment_system,
           p.compatible_machine, p.recommended_use, p.technical_description, p.warehouse_location,
           p.image_filename, p.base_price_cents, p.currency, p.price_effective_from,
           p.active, p.web_sort_order, p.created_at, p.updated_at,
           f.id AS family_id, f.name AS family_name, f.slug AS family_slug,
           f.sort_order AS family_sort_order,
           pi.stored_filename AS primary_image_filename,
           (SELECT COUNT(*) FROM product_images WHERE product_id = p.id) AS image_count
    FROM products p JOIN product_families f ON f.id = p.family_id
    LEFT JOIN product_images pi ON pi.id = (
      SELECT id FROM product_images
      WHERE product_id = p.id
      ORDER BY is_primary DESC, sort_order, id
      LIMIT 1
    )
    ${whereSql}
    ORDER BY f.sort_order, p.web_sort_order, p.name
    LIMIT 500
  `).all(...params).map(adminProduct);
}

export function listProductImages(db, productId) {
  ensureProduct(db, productId);
  return db.prepare(`
    SELECT id, product_id, original_filename, stored_filename, mime_type, size_bytes,
           alt_text, sort_order, is_primary, created_at, updated_at
    FROM product_images
    WHERE product_id = ?
    ORDER BY is_primary DESC, sort_order, id
  `).all(productId).map(productImage);
}

export function addProductImage(db, productId, input, uploadsPath) {
  const product = ensureProduct(db, productId);
  const originalFilename = requiredText(input.originalFilename, "originalFilename", { max: 180 });
  const mimeType = requiredText(input.mimeType, "mimeType", { max: 40 }).toLowerCase();
  const extension = IMAGE_MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw new ValidationError("mimeType must be image/jpeg, image/png or image/webp");
  const base64 = requiredText(input.dataBase64, "dataBase64", { max: 8_000_000 }).replace(/^data:[^;]+;base64,/, "");
  let bytes;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new ValidationError("dataBase64 is invalid");
  }
  if (!bytes.length || bytes.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ValidationError("image must be between 1 byte and 5 MB");
  }
  const productsPath = path.join(uploadsPath, "products");
  fs.mkdirSync(productsPath, { recursive: true });

  const imageCount = db.prepare("SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?").get(productId).count;
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM product_images WHERE product_id = ?").get(productId).value;
  const imageOrder = Number(maxOrder) + 1;
  const storedFilename = `${product.slug || slugify(`${product.km_code}-${product.name}`)}-imagen-${imageOrder + 1}-${randomUUID().slice(0, 8)}${extension}`;
  fs.writeFileSync(path.join(productsPath, storedFilename), bytes);

  const isPrimary = imageCount === 0 ? 1 : 0;
  if (isPrimary) db.prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?").run(productId);
  const altText = optionalText(input.altText, "altText", { max: 180 }) || buildProductImageAlt(product, imageOrder);
  const row = db.prepare(`
    INSERT INTO product_images (
      product_id, original_filename, stored_filename, mime_type, size_bytes,
      alt_text, sort_order, is_primary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id, product_id, original_filename, stored_filename, mime_type, size_bytes,
              alt_text, sort_order, is_primary, created_at, updated_at
  `).get(
    productId,
    originalFilename,
    storedFilename,
    mimeType,
    bytes.length,
    altText,
    imageOrder,
    isPrimary
  );
  return productImage(row);
}

export function setPrimaryProductImage(db, productId, imageId) {
  ensureProductImage(db, productId, imageId);
  db.prepare("UPDATE product_images SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").run(productId);
  db.prepare("UPDATE product_images SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(imageId);
  return listProductImages(db, productId);
}

export function deleteProductImage(db, productId, imageId, uploadsPath) {
  const image = ensureProductImage(db, productId, imageId);
  db.prepare("DELETE FROM product_images WHERE id = ?").run(imageId);
  try {
    fs.rmSync(path.join(uploadsPath, "products", image.stored_filename), { force: true });
  } catch {
    // If the file is already gone, the database delete is still the source of truth.
  }
  const replacement = db.prepare(`
    SELECT id FROM product_images
    WHERE product_id = ?
    ORDER BY sort_order, id
    LIMIT 1
  `).get(productId);
  if (image.is_primary && replacement) {
    db.prepare("UPDATE product_images SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(replacement.id);
  }
  return listProductImages(db, productId);
}

export function listProductFamilies(db) {
  return db.prepare(`
    SELECT id, name, slug, description, sort_order, active
    FROM product_families
    ORDER BY sort_order, name
  `).all().map((family) => ({
    id: family.id,
    name: family.name,
    slug: family.slug,
    description: family.description,
    sortOrder: family.sort_order,
    active: Boolean(family.active)
  }));
}

export function upsertProduct(db, input) {
  const familyName = requiredText(input.familyName, "familyName");
  const familySlug = slugify(input.familySlug || familyName);
  const family = db.prepare(`
    INSERT INTO product_families (name, slug, sort_order)
    VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name
    RETURNING id
  `).get(familyName, familySlug, Number.isInteger(input.familySortOrder) ? input.familySortOrder : 0);

  if (!Number.isSafeInteger(input.basePriceCents) || input.basePriceCents < 0) {
    throw new ValidationError("basePriceCents must be a non-negative integer");
  }
  const kmCode = requiredText(input.kmCode, "kmCode", { max: 30 }).toUpperCase();
  const ean13 = requiredText(input.ean13, "ean13", { min: 13, max: 13 });
  if (!/^\d{13}$/.test(ean13)) throw new ValidationError("ean13 must contain exactly 13 digits");
  const name = requiredText(input.name, "name");
  const slug = slugify(input.slug || `${kmCode}-${name}`);

  return db.prepare(`
    INSERT INTO products (
      km_code, ean13, name, slug, family_id, subfamily, material, color, measure,
      cut_level, attachment_system, compatible_machine, recommended_use,
      technical_description, warehouse_location, image_filename, base_price_cents, price_effective_from,
      active, web_sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(km_code) DO UPDATE SET
      ean13 = excluded.ean13, name = excluded.name, slug = excluded.slug,
      family_id = excluded.family_id, subfamily = excluded.subfamily,
      material = excluded.material, color = excluded.color, measure = excluded.measure,
      cut_level = excluded.cut_level, attachment_system = excluded.attachment_system,
      compatible_machine = excluded.compatible_machine,
      recommended_use = excluded.recommended_use,
      technical_description = excluded.technical_description,
      warehouse_location = excluded.warehouse_location,
      image_filename = excluded.image_filename,
      base_price_cents = excluded.base_price_cents,
      price_effective_from = excluded.price_effective_from,
      active = excluded.active, web_sort_order = excluded.web_sort_order,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, km_code, name, base_price_cents, active
  `).get(
    kmCode, ean13, name, slug, family.id,
    optionalText(input.subfamily, "subfamily"), optionalText(input.material, "material"),
    optionalText(input.color, "color") || null, optionalText(input.measure, "measure") || null,
    optionalText(input.cutLevel, "cutLevel") || null,
    optionalText(input.attachmentSystem, "attachmentSystem") || null,
    optionalText(input.compatibleMachine, "compatibleMachine"),
    optionalText(input.recommendedUse, "recommendedUse"),
    optionalText(input.technicalDescription, "technicalDescription"),
    optionalText(input.warehouseLocation, "warehouseLocation", { max: 80 }),
    optionalText(input.imageFilename, "imageFilename") || null,
    input.basePriceCents, requiredText(input.priceEffectiveFrom, "priceEffectiveFrom", { max: 30 }),
    input.active === false ? 0 : 1, Number.isInteger(input.webSortOrder) ? input.webSortOrder : 0
  );
}

function adminProduct(row) {
  return {
    id: row.id,
    kmCode: row.km_code,
    ean13: row.ean13,
    name: row.name,
    slug: row.slug,
    family: { id: row.family_id, name: row.family_name, slug: row.family_slug, sortOrder: row.family_sort_order },
    subfamily: row.subfamily,
    material: row.material,
    color: row.color,
    measure: row.measure,
    cutLevel: row.cut_level,
    attachmentSystem: row.attachment_system,
    compatibleMachine: row.compatible_machine,
    recommendedUse: row.recommended_use,
    technicalDescription: row.technical_description,
    warehouseLocation: row.warehouse_location || "",
    imageFilename: row.image_filename,
    primaryImageUrl: row.primary_image_filename ? `/media/products/${row.primary_image_filename}` : "",
    imageCount: row.image_count || 0,
    basePriceCents: row.base_price_cents,
    currency: row.currency,
    priceEffectiveFrom: row.price_effective_from,
    active: Boolean(row.active),
    webSortOrder: row.web_sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicProduct(row, images = []) {
  return {
    id: row.id,
    kmCode: row.km_code,
    ean13: row.ean13,
    name: row.name,
    slug: row.slug,
    family: { name: row.family_name, slug: row.family_slug },
    subfamily: row.subfamily,
    material: row.material,
    color: row.color,
    measure: row.measure,
    cutLevel: row.cut_level,
    attachmentSystem: row.attachment_system,
    compatibleMachine: row.compatible_machine,
    recommendedUse: row.recommended_use,
    technicalDescription: row.technical_description,
    imageFilename: row.image_filename,
    primaryImageUrl: images[0]?.url || (row.primary_image_filename ? `/media/products/${row.primary_image_filename}` : ""),
    images,
    publicUrl: `/producto/${row.slug}`
  };
}

function productImage(row) {
  return {
    id: row.id,
    productId: row.product_id,
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    url: `/media/products/${row.stored_filename}`,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ensureProduct(db, productId) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("productId is invalid");
  const product = db.prepare(`
    SELECT p.id, p.km_code, p.name, p.slug, p.subfamily, p.material, p.color, p.measure,
           p.cut_level, p.attachment_system, p.compatible_machine,
           f.name AS family_name
    FROM products p JOIN product_families f ON f.id = p.family_id
    WHERE p.id = ?
  `).get(id);
  if (!product) throw new NotFoundError("Product not found");
  return product;
}

function buildProductImageAlt(product, imageOrder = 0) {
  const details = [
    product.km_code,
    product.name,
    product.family_name,
    product.material,
    product.measure,
    product.cut_level ? `corte ${product.cut_level}` : "",
    product.attachment_system,
    product.compatible_machine,
    "KM Detail Line"
  ].filter(Boolean);
  const suffix = imageOrder > 0 ? ` imagen ${imageOrder + 1}` : "";
  return `${[...new Set(details)].join(" - ")}${suffix}`.slice(0, 180);
}

function ensureProductImage(db, productId, imageId) {
  ensureProduct(db, productId);
  const id = Number(imageId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("imageId is invalid");
  const image = db.prepare("SELECT * FROM product_images WHERE id = ? AND product_id = ?").get(id, productId);
  if (!image) throw new NotFoundError("Product image not found");
  return image;
}

export function slugify(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
