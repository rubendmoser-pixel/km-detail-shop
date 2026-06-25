import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { registerCustomer } from "../server/services/auth-service.js";
import { setCustomerDiscounts, setCustomerStatus } from "../server/services/customer-service.js";
import { createOrder, getOrder } from "../server/services/order-service.js";
import { upsertProduct } from "../server/services/product-service.js";
import { updateCommercialSettings } from "../server/services/settings-service.js";

test("confirmed order preserves price, discounts, VAT and bank snapshot", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-order-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente@example.com",
    password: "customer-password-123",
    firstName: "Ana",
    lastName: "Perez",
    businessName: "Pintureria Ejemplo",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Pintureria",
    industry: "Repintado automotriz",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "2000",
    address: "Calle 123",
    phone: "3410000000",
    whatsapp: "5493410000000",
    contactPerson: "Ana Perez",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id);
  setCustomerDiscounts(db, registration.customer.id, [3000, 2000, 1000], admin.id);
  updateCommercialSettings(db, {
    vatBps: 2100,
    bank: { bankName: "Banco KM", accountHolder: "KM", taxId: "30-00000000-0", cbu: "123", alias: "KM.TEST" }
  }, admin.id);

  const product = upsertProduct(db, {
    kmCode: "TEST01K",
    ean13: "7791234567890",
    name: "Producto de prueba",
    familyName: "Poliespumas",
    basePriceCents: 100_000 * 100,
    priceEffectiveFrom: "2026-01-01"
  });

  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 2 }],
    shipping: {
      recipient: "Ana Perez",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  assert.equal(order.items[0].basePriceCents, 10_000_000);
  assert.equal(order.items[0].finalUnitPriceCents, 5_040_000);
  assert.equal(order.subtotalNetCents, 10_080_000);
  assert.equal(order.vatCents, 2_116_800);
  assert.equal(order.totalCents, 12_196_800);
  assert.equal(order.bank.alias, "KM.TEST");

  db.prepare("UPDATE products SET base_price_cents = ? WHERE id = ?").run(999_000_00, product.id);
  updateCommercialSettings(db, { vatBps: 1050, bank: { alias: "CAMBIO.POSTERIOR" } }, admin.id);
  const persisted = getOrder(db, order.id, registration.customer.id, false);
  assert.equal(persisted.items[0].basePriceCents, 10_000_000);
  assert.equal(persisted.vatBps, 2100);
  assert.equal(persisted.bank.alias, "KM.TEST");
});
