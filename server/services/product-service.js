import { applyDiscounts } from "../domain/pricing.js";
import { ValidationError, optionalText, requiredText } from "../domain/validation.js";

export function listProducts(db, user) {
  const rows = db.prepare(`
    SELECT p.*, f.name AS family_name, f.slug AS family_slug
    FROM products p JOIN product_families f ON f.id = p.family_id
    WHERE p.active = 1 AND f.active = 1
    ORDER BY f.sort_order, p.web_sort_order, p.name
  `).all();

  if (!user || user.role !== "customer" || user.approvalStatus !== "approved") {
    return rows.map(publicProduct);
  }

  const discounts = db.prepare(`
    SELECT discount_1_bps, discount_2_bps, discount_3_bps
    FROM customer_discounts WHERE customer_id = ?
  `).get(user.customerId);
  const discountList = [discounts.discount_1_bps, discounts.discount_2_bps, discounts.discount_3_bps];
  return rows.map((row) => ({
    ...publicProduct(row),
    basePriceCents: row.base_price_cents,
    discountsBps: discountList,
    finalPriceCents: applyDiscounts(row.base_price_cents, discountList),
    currency: row.currency,
    priceEffectiveFrom: row.price_effective_from,
    priceNotice: "Precio neto. IVA no incluido."
  }));
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
           p.compatible_machine, p.recommended_use, p.technical_description,
           p.image_filename, p.base_price_cents, p.currency, p.price_effective_from,
           p.active, p.web_sort_order, p.created_at, p.updated_at,
           f.id AS family_id, f.name AS family_name, f.slug AS family_slug,
           f.sort_order AS family_sort_order
    FROM products p JOIN product_families f ON f.id = p.family_id
    ${whereSql}
    ORDER BY f.sort_order, p.web_sort_order, p.name
    LIMIT 500
  `).all(...params).map(adminProduct);
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
      technical_description, image_filename, base_price_cents, price_effective_from,
      active, web_sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(km_code) DO UPDATE SET
      ean13 = excluded.ean13, name = excluded.name, slug = excluded.slug,
      family_id = excluded.family_id, subfamily = excluded.subfamily,
      material = excluded.material, color = excluded.color, measure = excluded.measure,
      cut_level = excluded.cut_level, attachment_system = excluded.attachment_system,
      compatible_machine = excluded.compatible_machine,
      recommended_use = excluded.recommended_use,
      technical_description = excluded.technical_description,
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
    imageFilename: row.image_filename,
    basePriceCents: row.base_price_cents,
    currency: row.currency,
    priceEffectiveFrom: row.price_effective_from,
    active: Boolean(row.active),
    webSortOrder: row.web_sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicProduct(row) {
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
    imageFilename: row.image_filename
  };
}

export function slugify(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
