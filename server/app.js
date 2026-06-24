import path from "node:path";
import { authenticate, createPasswordReset, login, logout, registerCustomer, requireAdmin, requireApprovedCustomer, requireUser, resetPassword } from "./services/auth-service.js";
import { listCustomers, setCustomerDiscounts, setCustomerStatus } from "./services/customer-service.js";
import {
  acceptModifiedOrder,
  addPaymentReceipt,
  confirmOrderAvailability,
  createOrder,
  getOrder,
  listAdminOrders,
  listCustomerOrders,
  reviewPaymentReceipt,
  updateOrderFulfillment,
  updateOrderStatus
} from "./services/order-service.js";
import {
  addProductImage,
  deleteProductImage,
  listAdminProducts,
  listProductFamilies,
  listProductImages,
  listProducts,
  setPrimaryProductImage,
  upsertProduct
} from "./services/product-service.js";
import { getCommercialSettings, getPublicSettings, updateCommercialSettings } from "./services/settings-service.js";
import { clearSessionCookie, parseCookies, readJson, sendJson, serveProductImage, serveStatic, sessionCookie } from "./http.js";
import { createEmailService } from "./services/email-service.js";
import { createRateLimiter } from "./rate-limit.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

export function createApp({ db, config, emailService = createEmailService({ db, config }) }) {
  const checkRateLimit = createRateLimiter();
  const uploadsPath = config.uploadsPath || path.join(projectRoot, "uploads");
  return async function app(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const cookies = parseCookies(request);
    const currentUser = authenticate(db, cookies.km_session);

    try {
      const retryAfter = checkRateLimit(request, url.pathname);
      if (retryAfter) return sendJson(response, 429, { error: "Too many requests. Try again later." }, { "retry-after": String(retryAfter) });
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { status: "ok", service: "km-detail-b2b", time: new Date().toISOString() });
      }
      if (request.method === "GET" && serveProductImage(response, uploadsPath, url.pathname)) return;
      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const result = await registerCustomer(db, await readJson(request));
        emailService.queueCustomerRegistration(result.customer.id);
        return sendJson(response, 201, result);
      }
      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const result = await login(db, await readJson(request), config.sessionDays, config);
        return sendJson(response, 200, { user: result.user, expiresAt: result.expiresAt }, {
          "set-cookie": sessionCookie(result.token, {
            secure: config.secureCookies,
            maxAgeSeconds: config.sessionDays * 86_400
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        logout(db, cookies.km_session);
        return sendJson(response, 200, { ok: true }, { "set-cookie": clearSessionCookie({ secure: config.secureCookies }) });
      }
      if (request.method === "POST" && url.pathname === "/api/auth/forgot-password") {
        const body = await readJson(request);
        const reset = createPasswordReset(db, body.email);
        if (reset) emailService.queuePasswordReset(reset.userId, reset.token);
        return sendJson(response, 200, { message: "If the account exists, a recovery email was queued." });
      }
      if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
        const body = await readJson(request);
        const result = await resetPassword(db, body.token, body.password);
        return sendJson(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/api/me") {
        return sendJson(response, 200, { user: requireUser(currentUser) });
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        return sendJson(response, 200, { products: listProducts(db, currentUser) });
      }
      if (request.method === "GET" && url.pathname === "/api/public-settings") {
        return sendJson(response, 200, { settings: getPublicSettings(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/orders") {
        const user = requireApprovedCustomer(currentUser);
        const order = createOrder(db, user.customerId, await readJson(request));
        emailService.queueOrderCreated(order.id);
        return sendJson(response, 201, { order, availabilityNotice: "Pedido sujeto a confirmación de disponibilidad." });
      }

      if (request.method === "GET" && url.pathname === "/api/orders") {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { orders: listCustomerOrders(db, user.customerId) });
      }

      let match = url.pathname.match(/^\/api\/orders\/(\d+)$/);
      if (request.method === "GET" && match) {
        const user = requireUser(currentUser);
        return sendJson(response, 200, {
          order: getOrder(db, Number(match[1]), user.customerId, user.role === "admin")
        });
      }
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/payment-receipts$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        const order = addPaymentReceipt(db, Number(match[1]), user.customerId, user.id, await readJson(request, 12_500_000), uploadsPath);
        emailService.queuePaymentReceiptUploaded(order.id);
        return sendJson(response, 201, { order });
      }
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/accept$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { order: acceptModifiedOrder(db, Number(match[1]), user.customerId, user.id) });
      }

      if (url.pathname.startsWith("/api/admin/")) requireAdmin(currentUser);

      if (request.method === "GET" && url.pathname === "/api/admin/customers") {
        return sendJson(response, 200, {
          customers: listCustomers(db, {
            status: url.searchParams.get("status") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/status$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const customer = setCustomerStatus(db, Number(match[1]), body.status, currentUser.id);
        if (customer.changed) emailService.queueCustomerStatus(Number(match[1]), body.status);
        return sendJson(response, 200, { customer });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/discounts$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const discounts = setCustomerDiscounts(db, Number(match[1]), body.discountsBps || [], currentUser.id);
        return sendJson(response, 200, { discounts });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/products") {
        return sendJson(response, 201, { product: upsertProduct(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/products") {
        return sendJson(response, 200, {
          products: listAdminProducts(db, {
            status: url.searchParams.get("status") || "",
            familySlug: url.searchParams.get("family") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/images$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { images: listProductImages(db, Number(match[1])) });
      }
      if (request.method === "POST" && match) {
        const image = addProductImage(db, Number(match[1]), await readJson(request, 8_500_000), uploadsPath);
        return sendJson(response, 201, { image, images: listProductImages(db, Number(match[1])) });
      }
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)\/primary$/);
      if (request.method === "PATCH" && match) {
        return sendJson(response, 200, { images: setPrimaryProductImage(db, Number(match[1]), Number(match[2])) });
      }
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)$/);
      if (request.method === "DELETE" && match) {
        return sendJson(response, 200, { images: deleteProductImage(db, Number(match[1]), Number(match[2]), uploadsPath) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/product-families") {
        return sendJson(response, 200, { families: listProductFamilies(db) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/orders") {
        return sendJson(response, 200, {
          orders: listAdminOrders(db, {
            status: url.searchParams.get("status") || "",
            paymentStatus: url.searchParams.get("payment") || "",
            fulfillmentStatus: url.searchParams.get("fulfillment") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/availability$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const order = confirmOrderAvailability(db, Number(match[1]), body, currentUser.id);
        emailService.queueOrderAvailabilityConfirmed(order.id, body.reason);
        return sendJson(response, 200, { order });
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/fulfillment$/);
      if (request.method === "PATCH" && match) {
        const order = updateOrderFulfillment(db, Number(match[1]), await readJson(request), currentUser.id);
        emailService.queueOrderFulfillmentUpdated(order.id);
        return sendJson(response, 200, { order });
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { order: getOrder(db, Number(match[1]), null, true) });
      }
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const order = updateOrderStatus(db, Number(match[1]), body, currentUser.id);
        emailService.queueOrderStatusUpdated(order.id, body.reason);
        return sendJson(response, 200, { order });
      }
      match = url.pathname.match(/^\/api\/admin\/payment-receipts\/(\d+)$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const order = reviewPaymentReceipt(db, Number(match[1]), body, currentUser.id);
        emailService.queuePaymentReceiptReviewed(order.id, body.status, body.reason);
        return sendJson(response, 200, { order });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/settings") {
        return sendJson(response, 200, { settings: getCommercialSettings(db) });
      }
      if (request.method === "PATCH" && url.pathname === "/api/admin/settings") {
        const settings = updateCommercialSettings(db, await readJson(request), currentUser.id);
        return sendJson(response, 200, { settings });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/emails") {
        return sendJson(response, 200, {
          enabled: emailService.enabled,
          provider: emailService.provider,
          summary: emailService.summarizeOutbox(),
          emails: emailService.listOutbox({
            limit: Number(url.searchParams.get("limit") || 50),
            search: url.searchParams.get("q") || ""
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/emails/flush") {
        const result = await emailService.flush();
        return sendJson(response, 200, {
          result,
          summary: emailService.summarizeOutbox(),
          emails: emailService.listOutbox(50)
        });
      }

      if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "API route not found" });
      if (request.method === "GET" && serveStatic(response, projectRoot, url.pathname)) return;
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error(error);
      return sendJson(response, statusCode, {
        error: error.message || "Internal server error",
        details: error.details || undefined
      });
    }
  };
}
