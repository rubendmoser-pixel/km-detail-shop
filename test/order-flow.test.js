import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { registerCustomer } from "../server/services/auth-service.js";
import { setCustomerDiscounts, setCustomerPaymentTerms, setCustomerStatus, upsertCustomerProductDiscount } from "../server/services/customer-service.js";
import { authorizeOrderCredit, clientPayableBalanceCents, confirmOrderAvailability, createOrder, getOrder, recordMercadoPagoPayment, registerCurrentAccountPayment, reviewPaymentReceipt, updateOrderFulfillment } from "../server/services/order-service.js";
import { createEmailService } from "../server/services/email-service.js";
import { removeProductPromotion, upsertProduct } from "../server/services/product-service.js";
import { updateCommercialSettings } from "../server/services/settings-service.js";
import { setCustomerPaymentAccounts, upsertPaymentAccount } from "../server/services/payment-account-service.js";
import { getAdminOperationDashboard } from "../server/services/admin-report-service.js";

test("active product promotion is applied and reserved in order items", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-promo-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-promo@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-promo@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-promo@example.com",
    password: "customer-password-123",
    firstName: "Promo",
    lastName: "Cliente",
    businessName: "Comercio Promo",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Comercio especializado",
    industry: "Detailing",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "2000",
    address: "Calle 123",
    phone: "3410000000",
    whatsapp: "5493410000000",
    contactPerson: "Promo Cliente",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id);
  setCustomerDiscounts(db, registration.customer.id, [2000, 0, 0], admin.id);

  const product = upsertProduct(db, {
    kmCode: "PROMO1K",
    ean13: "7791234567807",
    name: "Producto con promo",
    familyName: "Poliespumas",
    basePriceCents: 10_000,
    priceEffectiveFrom: "2026-01-01",
    promotionBps: 1000,
    promotionLabel: "Promo prueba",
    promotionStartsAt: "2026-01-01",
    promotionEndsAt: "2099-12-31",
    promotionActive: true
  });
  const editedProduct = upsertProduct(db, {
    kmCode: "PROMO1K",
    ean13: "7791234567807",
    name: "Producto con promo editado",
    familyName: "Poliespumas",
    basePriceCents: 10_000,
    priceEffectiveFrom: "2026-02-01",
    imageFilename: "promo-editado.png"
  });
  const storedPromotion = db.prepare(`
    SELECT promotion_bps, promotion_label, promotion_starts_at, promotion_ends_at, promotion_active
    FROM products WHERE id = ?
  `).get(editedProduct.id);
  assert.equal(storedPromotion.promotion_bps, 1000);
  assert.equal(storedPromotion.promotion_label, "Promo prueba");
  assert.equal(storedPromotion.promotion_starts_at, "2026-01-01");
  assert.equal(storedPromotion.promotion_ends_at, "2099-12-31");
  assert.equal(storedPromotion.promotion_active, 1);
  upsertCustomerProductDiscount(db, registration.customer.id, {
    kmCode: "PROMO1K",
    discountBps: 500,
    startsAt: "2026-01-01",
    endsAt: "2099-12-31",
    note: "Acuerdo especial"
  }, admin.id);

  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 3 }],
    shipping: {
      recipient: "Promo Cliente",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });

  assert.equal(order.items[0].basePriceCents, 10_000);
  assert.equal(order.items[0].discountsBps[0], 2000);
  assert.equal(order.items[0].specialDiscountBps, 500);
  assert.equal(order.items[0].specialDiscountNote, "Acuerdo especial");
  assert.equal(order.items[0].promotionBps, 1000);
  assert.equal(order.items[0].promotionLabel, "Promo prueba");
  assert.equal(order.items[0].finalUnitPriceCents, 6840);
  assert.equal(order.subtotalNetCents, 20_520);

  removeProductPromotion(db, product.id);
  const clearedPromotion = db.prepare(`
    SELECT promotion_bps, promotion_label, promotion_starts_at, promotion_ends_at, promotion_active
    FROM products WHERE id = ?
  `).get(product.id);
  assert.deepEqual({ ...clearedPromotion }, {
    promotion_bps: 0,
    promotion_label: "",
    promotion_starts_at: "",
    promotion_ends_at: "",
    promotion_active: 0
  });
  const historicalPromotion = db.prepare(`
    SELECT promotion_bps, promotion_label
    FROM order_items WHERE order_id = ?
  `).get(order.id);
  assert.deepEqual({ ...historicalPromotion }, {
    promotion_bps: 1000,
    promotion_label: "Promo prueba"
  });
});

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
  assert.throws(() => authorizeOrderCredit(db, order.id, {
    paymentDueDate: "2026-07-02",
    reason: "No corresponde antes de disponibilidad"
  }, admin.id), /Availability must be confirmed/);
  assert.throws(() => updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "ready",
    reason: "No corresponde antes de disponibilidad"
  }, admin.id), /Availability must be confirmed/);

  const confirmed = confirmOrderAvailability(db, order.id, {
    items: persisted.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id);
  assert.equal(confirmed.totalCents, 12_196_800);
  assert.equal(confirmed.modifiedAcceptanceRequired, false);
  assert.throws(() => confirmOrderAvailability(db, order.id, {
    reason: "No se debe confirmar dos veces",
    items: confirmed.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id), /only be confirmed for received orders/);
  assert.throws(() => updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "ready",
    reason: "No corresponde antes de resolver pago"
  }, admin.id), /Payment, credit account or commercial adjustment/);
  const receipt = db.prepare(`
    INSERT INTO payment_receipts (order_id, uploaded_by, original_filename, stored_filename, mime_type, size_bytes)
    VALUES (?, ?, 'parcial.png', 'parcial-test.png', 'image/png', 100)
    RETURNING id
  `).get(order.id, registration.user.id);
  const partial = reviewPaymentReceipt(db, receipt.id, {
    status: "accepted",
    amountCents: 5_000_000,
    paymentDueDate: "2026-07-02",
    reason: "Pago acreditado con saldo en cuenta corriente"
  }, admin.id);
  assert.equal(partial.paymentStatus, "credit_account");
  assert.equal(partial.paidCents, 5_000_000);
  assert.equal(partial.balanceCents, 7_196_800);
  assert.equal(partial.paymentDueDate, "2026-07-02");
  const accountDashboard = getAdminOperationDashboard(db);
  const accountRow = accountDashboard.currentAccounts.open.find((entry) => entry.id === order.id);
  assert.equal(accountRow.accountPayments.length, 1);
  assert.equal(accountRow.accountPayments[0].method, "approved_receipt");
  assert.equal(accountRow.accountPayments[0].amountCents, 5_000_000);

  const credit = authorizeOrderCredit(db, order.id, {
    paymentDueDate: "2026-07-02",
    reason: "Saldo autorizado a fecha"
  }, admin.id);
  assert.equal(credit.paymentStatus, "credit_account");
  assert.equal(credit.balanceCents, 7_196_800);
  const ready = updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "ready",
    reason: "Preparacion finalizada"
  }, admin.id);
  assert.equal(ready.fulfillment.status, "ready");
  assert.throws(() => updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "ready",
    reason: "No debe repetirse"
  }, admin.id), /already prepared/);
  assert.throws(() => updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "shipped",
    fulfillmentMethod: "Expreso",
    reason: "Faltan datos"
  }, admin.id), /despacho requiere/i);
  const shipped = updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "shipped",
    fulfillmentMethod: "Expreso",
    fulfillmentCarrier: "Sendbox",
    fulfillmentTracking: "GUIA-123",
    fulfillmentEstimatedDate: "2026-07-01",
    fulfillmentNotes: "Despacho informado"
  }, admin.id);
  assert.equal(shipped.fulfillment.status, "shipped");
  assert.throws(() => updateOrderFulfillment(db, order.id, {
    fulfillmentStatus: "ready",
    reason: "No se edita despues de despachado"
  }, admin.id), /wait for customer reception/);

  const emailService = createEmailService({
    db,
    config: { publicBaseUrl: "https://www.km-detail.com", notificationEmail: "ventas@km-detail.com" }
  });
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-06-30T12:00:00.000Z")).queued, 0);
  const reminder = emailService.queuePaymentDueReminders(new Date("2026-07-02T12:00:00.000Z"));
  assert.equal(reminder.queued, 1);
  const reminderEmail = db.prepare("SELECT text_body FROM email_outbox WHERE event_type = 'payment_due_today'").get();
  assert.match(reminderEmail.text_body, /vence hoy/);
  assert.match(reminderEmail.text_body, /02\/07\/2026/);
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-07-03T12:00:00.000Z")).queued, 0);
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-07-04T12:00:00.000Z")).queued, 1);
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-07-05T12:00:00.000Z")).queued, 1);
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-07-09T12:00:00.000Z")).queued, 1);
  assert.equal(emailService.queuePaymentDueReminders(new Date("2026-07-12T12:00:00.000Z")).queued, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE event_type = 'payment_overdue_followup'").get().count, 1);
});

test("order snapshots customer assigned payment accounts", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-payment-accounts-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-payments@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-payments@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-cuentas@example.com",
    password: "customer-password-123",
    firstName: "Ana",
    lastName: "Perez",
    businessName: "Distribuidor Cuentas",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Distribuidor",
    industry: "Detailing",
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
  const first = upsertPaymentAccount(db, {
    name: "Banco KM",
    bankName: "Banco",
    alias: "KM.BANCO",
    cbu: "111",
    active: true,
    isDefault: true
  }, admin.id);
  const second = upsertPaymentAccount(db, {
    name: "MercadoPago KM",
    method: "mercadopago",
    bankName: "MercadoPago",
    alias: "KM.MP",
    cbu: "222",
    active: true
  }, admin.id);
  setCustomerPaymentAccounts(db, registration.customer.id, { accountIds: [first.id, second.id], primaryAccountId: second.id });

  const product = upsertProduct(db, {
    kmCode: "PAY01K",
    ean13: "7791234567890",
    name: "Producto cuenta",
    familyName: "Poliespumas",
    basePriceCents: 100_000,
    priceEffectiveFrom: "2026-01-01"
  });
  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 1 }],
    shipping: {
      recipient: "Ana Perez",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  assert.equal(order.bank.alias, "KM.MP");
  assert.equal(order.bank.accounts.length, 2);
  assert.deepEqual(order.bank.accounts.map((account) => account.alias), ["KM.MP", "KM.BANCO"]);

  upsertPaymentAccount(db, { ...second, alias: "KM.MP.NUEVO" }, admin.id);
  const persisted = getOrder(db, order.id, registration.customer.id, false);
  assert.equal(persisted.bank.alias, "KM.MP");
});

test("mercado pago approved payment closes order balance", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-mp-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-mp@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-mp@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-mp@example.com",
    password: "customer-password-123",
    firstName: "Marta",
    lastName: "Gomez",
    businessName: "Distribuidor MP",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Distribuidor",
    industry: "Detailing",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "2000",
    address: "Calle 123",
    phone: "3410000000",
    whatsapp: "5493410000000",
    contactPerson: "Marta Gomez",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id);

  const product = upsertProduct(db, {
    kmCode: "MP01K",
    ean13: "7791234567890",
    name: "Producto Mercado Pago",
    familyName: "Backings",
    basePriceCents: 50_000,
    priceEffectiveFrom: "2026-01-01"
  });
  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 2 }],
    shipping: {
      recipient: "Marta Gomez",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  const confirmed = confirmOrderAvailability(db, order.id, {
    items: order.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id);

  const paid = recordMercadoPagoPayment(db, {
    orderId: order.id,
    paymentId: "mp-test-1",
    preferenceId: "pref-test-1",
    status: "approved",
    amountCents: confirmed.totalCents,
    raw: { id: "mp-test-1", status: "approved" }
  });

  assert.equal(paid.newlyApproved, true);
  assert.equal(paid.order.paymentMethod, "mercadopago");
  assert.equal(paid.order.paymentStatus, "paid");
  assert.equal(paid.order.paidCents, confirmed.totalCents);
  assert.equal(paid.order.balanceCents, 0);
  assert.equal(paid.order.mercadoPagoPayments.length, 1);
  assert.equal(paid.order.mercadoPagoPayments[0].paymentId, "mp-test-1");
});

test("mercado pago charges class N customers net amount and closes IVA internally", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-mp-n-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-mp-n@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-mp-n@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-mp-n@example.com",
    password: "customer-password-123",
    firstName: "Cliente",
    lastName: "Clase N",
    businessName: "Comercio N",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Pintureria",
    industry: "Detailing",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "2000",
    address: "Calle 123",
    phone: "3410000000",
    whatsapp: "5493410000000",
    contactPerson: "Cliente N",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id, "N");

  const product = upsertProduct(db, {
    kmCode: "MPN01K",
    ean13: "7791234567891",
    name: "Producto Mercado Pago N",
    familyName: "Backings",
    basePriceCents: 100_000,
    priceEffectiveFrom: "2026-01-01"
  });
  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 1 }],
    shipping: {
      recipient: "Cliente N",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  const confirmed = confirmOrderAvailability(db, order.id, {
    items: order.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id);

  assert.equal(confirmed.commercialClass, "N");
  assert.equal(confirmed.subtotalNetCents, 100_000);
  assert.equal(confirmed.vatCents, 21_000);
  assert.equal(confirmed.totalCents, 121_000);
  assert.equal(clientPayableBalanceCents(confirmed), 100_000);

  const paid = recordMercadoPagoPayment(db, {
    orderId: order.id,
    paymentId: "mp-test-n-1",
    preferenceId: "pref-test-n-1",
    status: "approved",
    amountCents: confirmed.subtotalNetCents,
    raw: { id: "mp-test-n-1", status: "approved" }
  });

  assert.equal(paid.newlyApproved, true);
  assert.equal(paid.order.paymentMethod, "mercadopago");
  assert.equal(paid.order.paymentStatus, "settled_adjustment");
  assert.equal(paid.order.paidCents, confirmed.subtotalNetCents);
  assert.equal(paid.order.commercialAdjustmentCents, confirmed.vatCents);
  assert.equal(paid.order.balanceCents, 0);
});

test("current account manual payments use allowed methods and close class N IVA internally", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-account-n-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-account-n@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-account-n@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-account-n@example.com",
    password: "customer-password-123",
    firstName: "Cliente",
    lastName: "Cuenta N",
    businessName: "Comercio Cuenta N",
    taxId: "30-12345678-1",
    taxCondition: "Responsable inscripto",
    customerType: "Pintureria",
    industry: "Detailing",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "2000",
    address: "Calle 123",
    phone: "3410000000",
    whatsapp: "5493410000000",
    contactPerson: "Cliente Cuenta N",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id, "N");

  const product = upsertProduct(db, {
    kmCode: "CCN01K",
    ean13: "7791234567892",
    name: "Producto Cuenta Corriente N",
    familyName: "Backings",
    basePriceCents: 100_000,
    priceEffectiveFrom: "2026-01-01"
  });
  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 1 }],
    shipping: {
      recipient: "Cliente Cuenta N",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  const confirmed = confirmOrderAvailability(db, order.id, {
    paymentMethod: "credit_account",
    creditDays: 15,
    items: order.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id);

  assert.equal(confirmed.commercialClass, "N");
  assert.equal(confirmed.totalCents, 121_000);
  assert.equal(clientPayableBalanceCents(confirmed), 100_000);
  assert.throws(
    () => registerCurrentAccountPayment(db, order.id, { amount: "$ 1.000,00", method: "mercadopago" }, admin.id),
    /Mercado Pago se acredita automaticamente/
  );

  const paid = registerCurrentAccountPayment(db, order.id, {
    amount: "1.000,00",
    method: "bank_transfer",
    reference: "Banco prueba",
    note: "Pago neto clase N"
  }, admin.id);

  assert.equal(paid.paymentStatus, "settled_adjustment");
  assert.equal(paid.paidCents, 100_000);
  assert.equal(paid.commercialAdjustmentCents, 21_000);
  assert.equal(paid.balanceCents, 0);
  assert.equal(paid.accountPayments.length, 1);
  assert.equal(paid.accountPayments[0].method, "bank_transfer");
  assert.equal(paid.accountPayments[0].methodLabel, "Transferencia");
  assert.equal(paid.accountPayments[0].reference, "Banco prueba");
});

test("new orders inherit customer payment terms and can confirm availability with that default", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-payment-terms-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath, adminEmail: "admin-terms@km-detail.com", adminPassword: "secure-admin-password" });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin-terms@km-detail.com");
  const registration = await registerCustomer(db, {
    email: "cliente-terms@example.com",
    password: "customer-password-123",
    firstName: "Cuenta",
    lastName: "Corriente",
    businessName: "Comercio Cuenta",
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
    contactPerson: "Cuenta Corriente",
    acceptTerms: true,
    acceptPrivacy: true
  });
  setCustomerStatus(db, registration.customer.id, "approved", admin.id);
  setCustomerPaymentTerms(db, registration.customer.id, { paymentCondition: "credit_account", paymentTermsDays: 21 });

  const product = upsertProduct(db, {
    kmCode: "TERM01K",
    ean13: "7791234567814",
    name: "Producto cuenta corriente",
    familyName: "Backings",
    basePriceCents: 25_000,
    priceEffectiveFrom: "2026-01-01"
  });

  const order = createOrder(db, registration.customer.id, {
    items: [{ productId: product.id, quantity: 2 }],
    shipping: {
      recipient: "Cuenta Corriente",
      address: "Calle 123",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "2000",
      contactPhone: "3410000000"
    }
  });
  assert.equal(order.requestedPaymentCondition, "credit_account");
  assert.equal(order.paymentTermsDays, 21);

  const confirmed = confirmOrderAvailability(db, order.id, {
    items: order.items.map((item) => ({ id: item.id, confirmedQuantity: item.quantity }))
  }, admin.id);
  assert.equal(confirmed.paymentStatus, "credit_account");
  assert.equal(confirmed.paymentTermsDays, 21);
  assert.match(confirmed.paymentDueDate, /^\d{4}-\d{2}-\d{2}$/);
});
