import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { createEmailService } from "../server/services/email-service.js";

test("HTTP API supports the initial B2B purchase flow", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-api-${Date.now()}.sqlite`);
  const uploadsPath = path.join(os.tmpdir(), `km-detail-api-uploads-${Date.now()}`);
  const config = {
    sessionDays: 30,
    secureCookies: false,
    notificationEmail: "ventas@km-detail.com",
    publicBaseUrl: baseUrlPlaceholder(),
    uploadsPath
  };
  const db = await openDatabase({ databasePath, adminEmail: "admin@km-detail.com", adminPassword: "secure-admin-password" });
  const server = http.createServer(createApp({ db, config }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
    fs.rmSync(uploadsPath, { recursive: true, force: true });
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.match(healthResponse.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
  const health = await healthResponse.json();
  assert.equal(health.status, "ok");

  const publicSettings = await getJson(`${baseUrl}/api/public-settings`);
  assert.equal(publicSettings.settings.vatBps, 2100);
  assert.equal(publicSettings.settings.whatsappNumber, "");

  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(customerRegistration())
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json();
  assert.equal(registration.customer.approval_status, "pending");
  const queuedEmail = db.prepare("SELECT recipient, status FROM email_outbox").get();
  assert.equal(queuedEmail.recipient, "ventas@km-detail.com");
  assert.equal(queuedEmail.status, "pending");
  const welcomeEmail = db.prepare("SELECT recipient, status FROM email_outbox WHERE event_type = 'customer_welcome'").get();
  assert.equal(welcomeEmail.recipient, "cliente-api@example.com");
  assert.equal(welcomeEmail.status, "pending");

  config.publicBaseUrl = baseUrl;
  const forgotResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "cliente-api@example.com" })
  });
  assert.equal(forgotResponse.status, 200);
  const resetMessage = db.prepare("SELECT text_body FROM email_outbox WHERE event_type = 'password_reset'").get();
  const resetToken = new URL(resetMessage.text_body.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: resetToken, password: "new-customer-password-456" })
  });
  assert.equal(resetResponse.status, 200);
  const reusedResetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: resetToken, password: "another-password-789" })
  });
  assert.equal(reusedResetResponse.status, 400);

  const adminCookie = await loginCookie(baseUrl, "admin@km-detail.com", "secure-admin-password");
  const emailsResponse = await getJson(`${baseUrl}/api/admin/emails`, adminCookie);
  assert.equal(emailsResponse.enabled, false);
  assert.equal(emailsResponse.summary.pending, 3);
  assert.equal(emailsResponse.emails.length, 3);
  assert.equal((await fetch(`${baseUrl}/api/admin/emails/flush`, {
    method: "POST", headers: jsonHeaders(adminCookie)
  })).status, 200);

  const productResponse = await fetch(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({
      kmCode: "API001K",
      ean13: "7791234567890",
      name: "Pad de prueba API",
      familyName: "Poliespumas",
      basePriceCents: 100_000,
      priceEffectiveFrom: "2026-01-01"
    })
  });
  assert.equal(productResponse.status, 201);
  const product = (await productResponse.json()).product;
  const adminProducts = await getJson(`${baseUrl}/api/admin/products?q=API001K`, adminCookie);
  assert.equal(adminProducts.products.length, 1);
  assert.equal(adminProducts.products[0].kmCode, "API001K");
  assert.equal(adminProducts.products[0].basePriceCents, 100_000);
  const imageResponse = await fetch(`${baseUrl}/api/admin/products/${product.id}/images`, {
    method: "POST",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({
      originalFilename: "api-product.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl5LkAAAAASUVORK5CYII="
    })
  });
  assert.equal(imageResponse.status, 201);
  const images = (await imageResponse.json()).images;
  assert.equal(images.length, 1);
  assert.equal(images[0].isPrimary, true);
  assert.match(images[0].url, /^\/media\/products\/api001k-/);
  const publicImageResponse = await fetch(`${baseUrl}${images[0].url}`);
  assert.equal(publicImageResponse.status, 200);
  assert.equal(publicImageResponse.headers.get("content-type"), "image/png");
  const adminFamilies = await getJson(`${baseUrl}/api/admin/product-families`, adminCookie);
  assert.equal(adminFamilies.families.some((family) => family.name === "Poliespumas"), true);

  assert.equal((await fetch(`${baseUrl}/api/admin/customers/${registration.customer.id}/status`, {
    method: "PATCH", headers: jsonHeaders(adminCookie), body: JSON.stringify({ status: "approved" })
  })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE event_type = 'customer_status'").get().count, 1);
  assert.equal((await fetch(`${baseUrl}/api/admin/customers/${registration.customer.id}/discounts`, {
    method: "PATCH", headers: jsonHeaders(adminCookie), body: JSON.stringify({ discountsBps: [3000, 2000, 1000] })
  })).status, 200);

  const customerCookie = await loginCookie(baseUrl, "cliente-api@example.com", "new-customer-password-456");
  const products = await getJson(`${baseUrl}/api/products`, customerCookie);
  assert.equal(products.products[0].basePriceCents, 100_000);
  assert.equal(products.products[0].finalPriceCents, 50_400);
  assert.equal(products.products[0].primaryImageUrl, images[0].url);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: jsonHeaders(customerCookie),
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: 2 }],
      shipping: {
        recipient: "Cliente API",
        address: "Calle 123",
        city: "Cordoba",
        province: "Cordoba",
        postalCode: "5000",
        contactPhone: "3510000000"
      }
    })
  });
  assert.equal(orderResponse.status, 201);
  const orderPayload = await orderResponse.json();
  assert.equal(orderPayload.order.subtotalNetCents, 100_800);
  assert.equal(orderPayload.order.vatCents, 21_168);
  assert.match(orderPayload.order.orderNumber, /^KM-\d{4}-\d{6}$/);
  const adminOrderDetail = await getJson(`${baseUrl}/api/admin/orders/${orderPayload.order.id}`, adminCookie);
  assert.equal(adminOrderDetail.order.items.length, 1);
  assert.equal(adminOrderDetail.order.items[0].kmCode, "API001K");
  assert.equal(adminOrderDetail.order.shipping.city, "Cordoba");
  assert.equal(adminOrderDetail.order.customerWhatsapp, "5493510000000");
  assert.equal(adminOrderDetail.order.contactPerson, "Cliente API");
  const updatedOrderResponse = await fetch(`${baseUrl}/api/admin/orders/${orderPayload.order.id}`, {
    method: "PATCH",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({
      status: "confirmed",
      paymentStatus: "paid",
      reason: "Confirmacion desde prueba automatica"
    })
  });
  assert.equal(updatedOrderResponse.status, 200);
  const updatedOrder = (await updatedOrderResponse.json()).order;
  assert.equal(updatedOrder.status, "confirmed");
  assert.equal(updatedOrder.paymentStatus, "paid");
});

test("customer welcome email does not depend on internal notification email", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-welcome-${Date.now()}.sqlite`);
  const config = {
    sessionDays: 30,
    secureCookies: false,
    notificationEmail: "",
    publicBaseUrl: baseUrlPlaceholder()
  };
  const db = await openDatabase({ databasePath });
  const server = http.createServer(createApp({ db, config }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(customerRegistration())
  });
  assert.equal(response.status, 201);
  const outbox = db.prepare("SELECT event_type, recipient FROM email_outbox ORDER BY id").all()
    .map((row) => ({ event_type: row.event_type, recipient: row.recipient }));
  assert.deepEqual(outbox, [{ event_type: "customer_welcome", recipient: "cliente-api@example.com" }]);
});

test("email service sends pending messages through Resend API", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-resend-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath });
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: "email_test_123" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  db.prepare(`
    INSERT INTO email_outbox (event_type, recipient, subject, text_body)
    VALUES ('test', 'cliente@example.com', 'Asunto de prueba', 'Contenido de prueba')
  `).run();
  const emailService = createEmailService({
    db,
    config: {
      emailProvider: "resend",
      resendApiKey: "re_test",
      resendFrom: "KM Detail Line <notificaciones@send.km-detail.com>",
      resendReplyTo: "ventas@km-detail.com"
    }
  });
  const result = await emailService.flush();
  assert.deepEqual(result, { enabled: true, sent: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.from, "KM Detail Line <notificaciones@send.km-detail.com>");
  assert.equal(payload.reply_to, "ventas@km-detail.com");
  assert.deepEqual(payload.to, ["cliente@example.com"]);
  assert.equal(db.prepare("SELECT status FROM email_outbox").get().status, "sent");
});

async function loginCookie(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

function baseUrlPlaceholder() {
  return "http://127.0.0.1";
}

async function getJson(url, cookie = "") {
  const response = await fetch(url, { headers: cookie ? { cookie } : {} });
  assert.equal(response.status, 200);
  return response.json();
}

function jsonHeaders(cookie) {
  return { "content-type": "application/json", cookie };
}

function customerRegistration() {
  return {
    email: "cliente-api@example.com",
    password: "customer-password-123",
    firstName: "Cliente",
    lastName: "API",
    businessName: "Comercio API",
    taxId: "30-99999999-1",
    taxCondition: "Responsable inscripto",
    customerType: "Taller",
    industry: "Detailing",
    city: "Cordoba",
    province: "Cordoba",
    address: "Calle 123",
    phone: "3510000000",
    whatsapp: "5493510000000",
    contactPerson: "Cliente API",
    acceptTerms: true,
    acceptPrivacy: true
  };
}
