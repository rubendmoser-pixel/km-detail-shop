import { ValidationError, NotFoundError, optionalText, requiredText } from "../domain/validation.js";
import { transaction } from "../db.js";
import { ARGENTINA_PROVINCES, allowedValue, normalizePhone, normalizePostalCode } from "./auth-service.js";

export function listShippingAddresses(db, customerId) {
  ensureSeedAddress(db, customerId);
  return db.prepare(`
    SELECT * FROM customer_shipping_addresses
    WHERE customer_id = ?
    ORDER BY is_default DESC, updated_at DESC, id DESC
  `).all(customerId).map(mapAddress);
}

export function getShippingAddress(db, customerId, addressId) {
  const address = db.prepare("SELECT * FROM customer_shipping_addresses WHERE id = ? AND customer_id = ?").get(addressId, customerId);
  if (!address) throw new NotFoundError("Shipping address not found");
  return mapAddress(address);
}

export function upsertShippingAddress(db, customerId, input) {
  const address = validateAddress(input);
  const id = Number(input.id || 0);
  return transaction(db, () => {
    if (address.isDefault) clearDefault(db, customerId);
    if (id) {
      const existing = db.prepare("SELECT id FROM customer_shipping_addresses WHERE id = ? AND customer_id = ?").get(id, customerId);
      if (!existing) throw new NotFoundError("Shipping address not found");
      db.prepare(`
        UPDATE customer_shipping_addresses
        SET label = ?, recipient = ?, address = ?, city = ?, province = ?, postal_code = ?,
            contact_phone = ?, preferred_transport = ?, notes = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND customer_id = ?
      `).run(
        address.label, address.recipient, address.address, address.city, address.province, address.postalCode,
        address.contactPhone, address.preferredTransport, address.notes, address.isDefault ? 1 : 0, id, customerId
      );
      ensureOneDefault(db, customerId);
      return getShippingAddress(db, customerId, id);
    }
    const shouldDefault = address.isDefault || countAddresses(db, customerId) === 0;
    if (shouldDefault) clearDefault(db, customerId);
    const created = db.prepare(`
      INSERT INTO customer_shipping_addresses (
        customer_id, label, recipient, address, city, province, postal_code,
        contact_phone, preferred_transport, notes, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      customerId, address.label, address.recipient, address.address, address.city, address.province,
      address.postalCode, address.contactPhone, address.preferredTransport, address.notes, shouldDefault ? 1 : 0
    );
    ensureOneDefault(db, customerId);
    return getShippingAddress(db, customerId, created.id);
  });
}

export function setDefaultShippingAddress(db, customerId, addressId) {
  return transaction(db, () => {
    const existing = db.prepare("SELECT id FROM customer_shipping_addresses WHERE id = ? AND customer_id = ?").get(addressId, customerId);
    if (!existing) throw new NotFoundError("Shipping address not found");
    clearDefault(db, customerId);
    db.prepare("UPDATE customer_shipping_addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND customer_id = ?").run(addressId, customerId);
    return getShippingAddress(db, customerId, addressId);
  });
}

export function deleteShippingAddress(db, customerId, addressId) {
  return transaction(db, () => {
    const existing = db.prepare("SELECT is_default FROM customer_shipping_addresses WHERE id = ? AND customer_id = ?").get(addressId, customerId);
    if (!existing) throw new NotFoundError("Shipping address not found");
    db.prepare("DELETE FROM customer_shipping_addresses WHERE id = ? AND customer_id = ?").run(addressId, customerId);
    ensureOneDefault(db, customerId);
    return { deleted: true };
  });
}

export function ensureSeedAddress(db, customerId) {
  if (countAddresses(db, customerId) > 0) return;
  const customer = db.prepare(`
    SELECT business_name, contact_person, address, city, province, postal_code, phone, whatsapp
    FROM customers WHERE id = ?
  `).get(customerId);
  if (!customer) return;
  db.prepare(`
    INSERT INTO customer_shipping_addresses (
      customer_id, label, recipient, address, city, province, postal_code, contact_phone, is_default
    ) VALUES (?, 'Principal', ?, ?, ?, ?, ?, ?, 1)
  `).run(
    customerId,
    customer.contact_person || customer.business_name,
    customer.address,
    customer.city,
    customer.province,
    customer.postal_code,
    customer.whatsapp || customer.phone
  );
}

function validateAddress(input = {}) {
  const province = allowedValue(requiredText(input.province, "province"), ARGENTINA_PROVINCES, "province");
  return {
    label: requiredText(input.label || "Principal", "label", { max: 80 }),
    recipient: requiredText(input.recipient, "recipient", { max: 120 }),
    address: requiredText(input.address, "address", { max: 180 }),
    city: requiredText(input.city, "city", { min: 2, max: 80 }),
    province,
    postalCode: normalizePostalCode(input.postalCode),
    contactPhone: normalizePhone(input.contactPhone, "contactPhone"),
    preferredTransport: optionalText(input.preferredTransport, "preferredTransport", { max: 120 }),
    notes: optionalText(input.notes, "notes", { max: 500 }),
    isDefault: input.isDefault === true || input.isDefault === "true" || input.isDefault === 1
  };
}

function countAddresses(db, customerId) {
  return db.prepare("SELECT COUNT(*) AS count FROM customer_shipping_addresses WHERE customer_id = ?").get(customerId).count;
}

function clearDefault(db, customerId) {
  db.prepare("UPDATE customer_shipping_addresses SET is_default = 0 WHERE customer_id = ?").run(customerId);
}

function ensureOneDefault(db, customerId) {
  const count = countAddresses(db, customerId);
  if (!count) return;
  const current = db.prepare("SELECT id FROM customer_shipping_addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1").get(customerId);
  if (current) return;
  const fallback = db.prepare("SELECT id FROM customer_shipping_addresses WHERE customer_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1").get(customerId);
  db.prepare("UPDATE customer_shipping_addresses SET is_default = 1 WHERE id = ?").run(fallback.id);
}

function mapAddress(row) {
  return {
    id: row.id,
    label: row.label,
    recipient: row.recipient,
    address: row.address,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    contactPhone: row.contact_phone,
    preferredTransport: row.preferred_transport || "",
    notes: row.notes || "",
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
