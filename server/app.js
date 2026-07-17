import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";
import { ValidationError, publicErrorMessage } from "./domain/validation.js";
import { authenticate, createPasswordReset, login, logout, registerCustomer, requireAdmin, requireApprovedCustomer, requireUser, resetPassword } from "./services/auth-service.js";
import {
  createAdminCustomer,
  deleteCustomerProductDiscount,
  listCustomerProductDiscounts,
  listCustomers,
  setCustomerCommercialClass,
  setCustomerDiscounts,
  setCustomerPaymentTerms,
  setCustomerStatus,
  updateCustomerProfile,
  upsertCustomerProductDiscount
} from "./services/customer-service.js";
import {
  acceptModifiedOrder,
  addPaymentReceipt,
  applyCommercialAdjustment,
  authorizeOrderCredit,
  confirmOrderReceived,
  confirmOrderAvailability,
  createDeliveryNote,
  createOrder,
  createPickingList,
  createShippingLabels,
  deleteTestOrders,
  getOrder,
  getPaymentReceiptFile,
  listAdminOrders,
  countAdminOrderScopes,
  listCustomerOrders,
  registerCurrentAccountPayment,
  reviewPaymentReceipt,
  updateOrderFulfillment,
  updateOrderStatus
} from "./services/order-service.js";
import {
  addProductImage,
  deleteProductImage,
  getPublicProductBySlug,
  listAdminProducts,
  listPublicProductsForSeo,
  listProductFamilies,
  listProductImages,
  listProducts,
  setPrimaryProductImage,
  upsertProduct
} from "./services/product-service.js";
import { getCommercialSettings, getPublicSettings, updateCommercialSettings } from "./services/settings-service.js";
import {
  listCustomerPaymentAccountAssignments,
  setCustomerPaymentAccounts,
  upsertPaymentAccount
} from "./services/payment-account-service.js";
import {
  assignSalesRepToCustomer,
  authenticateSalesRep,
  changeSalesRepPassword,
  createSalesCommissionSettlement,
  createSalesRepPasswordReset,
  getAssignedApprovedCustomerForSalesRep,
  getSalesRepPortalDashboard,
  getSalesRepDashboard,
  getSalesRepProfile,
  getSalesCommissionSettlement,
  listPendingSalesCommissions,
  listSalesCommissionSettlements,
  loginSalesRep,
  logoutSalesRep,
  listSalesReps,
  requireSalesRep,
  resetSalesRepPassword,
  requestCommercialCustomer,
  upsertSalesRep
} from "./services/sales-rep-service.js";
import { createSalesQuote, getSalesQuote, listSalesQuotesForSalesRep, markSalesQuoteConverted, markSalesQuoteShared } from "./services/sales-quote-service.js";
import { deleteShippingAddress, listShippingAddresses, setDefaultShippingAddress, upsertShippingAddress } from "./services/shipping-address-service.js";
import { SECURITY_HEADERS, SEO_SECURITY_HEADERS, clearLogisticsSessionCookie, clearSalesRepSessionCookie, clearSessionCookie, logisticsSessionCookie, parseCookies, readJson, salesRepSessionCookie, sendJson, serveProductImage, serveStatic, sessionCookie } from "./http.js";
import {
  authenticateLogisticsOperator, claimLogisticsOrder, confirmLogisticsAvailability, dispatchLogisticsOrder,
  getLogisticsOrder, listLogisticsOperators, listLogisticsOrders, loginLogisticsOperator, logoutLogisticsOperator,
  logisticsLabels, logisticsPickingList, logisticsShippingRemit, requireLogisticsOperator,
  updateLogisticsChecklist, upsertLogisticsOperator
} from "./services/logistics-service.js";
import { createEmailService } from "./services/email-service.js";
import { createPushService } from "./services/push-service.js";
import { createMercadoPagoPreference, handleMercadoPagoWebhook, publicMercadoPagoConfig } from "./services/mercadopago-service.js";
import { createRateLimiter } from "./rate-limit.js";
import { renderProductPage, renderSitemap } from "./seo-pages.js";
import { listSecurityEvents, recordSecurityEvent, summarizeSecurityEvents } from "./services/security-event-service.js";
import { getAdminOperationDashboard } from "./services/admin-report-service.js";
import { createCustomerPriceList } from "./services/price-list-service.js";
import {
  applyDuePriceUpdates,
  listPriceUpdateBatches,
  scheduleIndividualPriceUpdate,
  scheduleLinearPriceUpdate
} from "./services/price-update-service.js";
import { getAnalyticsDashboard, recordAnalyticsEvents, recordServerAnalyticsEvent } from "./services/analytics-service.js";
import { createBackup } from "./services/backup-service.js";
import { pruneBackups } from "./services/storage-status-service.js";
import { deleteOfficialDistributor, listOfficialDistributors, upsertOfficialDistributor } from "./services/distributor-service.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

export function createApp({
  db,
  config,
  pushService = createPushService({ db, config }),
  emailService = createEmailService({ db, config, pushService })
}) {
  const checkRateLimit = createRateLimiter();
  const uploadsPath = config.uploadsPath || path.join(projectRoot, "uploads");
  return async function app(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const cookies = parseCookies(request);
    const currentUser = authenticate(db, cookies.km_session);
    const currentSalesRep = authenticateSalesRep(db, cookies.km_sales_session);
    const currentLogisticsOperator = authenticateLogisticsOperator(db, cookies.km_logistics_session);

    try {
      const retryAfter = checkRateLimit(request, url.pathname);
      if (retryAfter) {
        if (url.pathname.startsWith("/api/auth/")) {
          recordSecurityEvent(db, request, {
            eventType: "rate_limited",
            statusCode: 429,
            metadata: { retryAfter, route: url.pathname }
          });
        }
        return sendJson(response, 429, { error: "Demasiados intentos. Proba nuevamente mas tarde." }, { "retry-after": String(retryAfter) });
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { status: "ok", service: "km-detail-b2b", time: new Date().toISOString() });
      }
      if (request.method === "POST" && url.pathname === "/api/analytics/events") {
        return sendJson(response, 202, recordAnalyticsEvents(db, request, currentUser, await readJson(request, 1_000_000)));
      }
      if (request.method === "POST" && url.pathname === "/api/webhooks/mercadopago") {
        const result = await handleMercadoPagoWebhook(db, {
          query: Object.fromEntries(url.searchParams),
          body: await readJson(request, 1_000_000).catch(() => ({}))
        }, config);
        if (result?.newlyApproved && result.order?.id) {
          emailService.queuePaymentReceiptReviewed(result.order.id, "accepted", "Pago acreditado por Mercado Pago");
          void emailService.flush();
        }
        return sendJson(response, 200, { ok: true, ignored: Boolean(result?.ignored) });
      }
      if (request.method === "GET" && url.pathname === "/sitemap.xml") {
        applyDuePriceUpdates(db);
        const body = renderSitemap(listPublicProductsForSeo(db));
        response.writeHead(200, {
          "content-type": "application/xml; charset=utf-8",
          "content-length": Buffer.byteLength(body),
          "cache-control": "no-cache",
          ...SECURITY_HEADERS
        });
        response.end(body);
        return;
      }
      if (request.method === "GET" && serveProductImage(response, uploadsPath, url.pathname)) return;
      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const result = await registerCustomer(db, await readJson(request));
        emailService.queueCustomerRegistration(result.customer.id);
        return sendJson(response, 201, result);
      }
      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(request);
        let result;
        try {
          result = await login(db, body, config.sessionDays, config);
        } catch (error) {
          recordSecurityEvent(db, request, {
            eventType: "login_failed",
            email: body.email,
            statusCode: error.statusCode || 401,
            metadata: { reason: error.message || "login failed" }
          });
          throw error;
        }
        recordSecurityEvent(db, request, {
          eventType: "login_success",
          email: result.user.email,
          userId: result.user.id,
          role: result.user.role,
          statusCode: 200
        });
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
        const reset = await createPasswordReset(db, body.email, config);
        if (reset) emailService.queuePasswordReset(reset.userId, reset.token);
        return sendJson(response, 200, { message: "Si existe una cuenta activa, enviamos un enlace de recuperacion al email." });
      }
      if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
        const body = await readJson(request);
        const result = await resetPassword(db, body.token, body.password, config);
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/api/sales/login") {
        const result = await loginSalesRep(db, await readJson(request), config.sessionDays || 30);
        return sendJson(response, 200, { salesRep: result.salesRep, expiresAt: result.expiresAt }, {
          "set-cookie": salesRepSessionCookie(result.token, {
            secure: config.secureCookies,
            maxAgeSeconds: (config.sessionDays || 30) * 86_400
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/logistics/login") {
        const result = await loginLogisticsOperator(db, await readJson(request), config.sessionDays || 30);
        logout(db, cookies.km_session);
        logoutSalesRep(db, cookies.km_sales_session);
        return sendJson(response, 200, { operator: result.operator, expiresAt: result.expiresAt }, {
          "set-cookie": [
            logisticsSessionCookie(result.token, { secure: config.secureCookies, maxAgeSeconds: (config.sessionDays || 30) * 86_400 }),
            clearSessionCookie({ secure: config.secureCookies }),
            clearSalesRepSessionCookie({ secure: config.secureCookies })
          ]
        });
      }
      if (request.method === "POST" && url.pathname === "/api/logistics/logout") {
        logoutLogisticsOperator(db, cookies.km_logistics_session);
        return sendJson(response, 200, { ok: true }, { "set-cookie": clearLogisticsSessionCookie({ secure: config.secureCookies }) });
      }
      if (request.method === "GET" && url.pathname === "/api/logistics/me") {
        return sendJson(response, 200, { operator: requireLogisticsOperator(currentLogisticsOperator) });
      }
      if (request.method === "GET" && url.pathname === "/api/logistics/orders") {
        const operator = requireLogisticsOperator(currentLogisticsOperator);
        return sendJson(response, 200, { operator, orders: listLogisticsOrders(db, {
          search: url.searchParams.get("q") || "",
          scope: url.searchParams.get("scope") || "active"
        }) });
      }
      let logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)$/);
      if (request.method === "GET" && logisticsMatch) {
        requireLogisticsOperator(currentLogisticsOperator);
        return sendJson(response, 200, { order: getLogisticsOrder(db, Number(logisticsMatch[1])) });
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/claim$/);
      if (request.method === "POST" && logisticsMatch) {
        return sendJson(response, 200, { order: claimLogisticsOrder(db, Number(logisticsMatch[1]), requireLogisticsOperator(currentLogisticsOperator)) });
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/availability$/);
      if (request.method === "PATCH" && logisticsMatch) {
        const order = confirmLogisticsAvailability(db, Number(logisticsMatch[1]), await readJson(request), requireLogisticsOperator(currentLogisticsOperator));
        emailService.queueOrderAvailabilityConfirmed(order.id);
        return sendJson(response, 200, { order });
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/checklist$/);
      if (request.method === "PATCH" && logisticsMatch) {
        return sendJson(response, 200, { order: updateLogisticsChecklist(db, Number(logisticsMatch[1]), await readJson(request), requireLogisticsOperator(currentLogisticsOperator)) });
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/dispatch$/);
      if (request.method === "PATCH" && logisticsMatch) {
        const order = dispatchLogisticsOrder(db, Number(logisticsMatch[1]), await readJson(request), requireLogisticsOperator(currentLogisticsOperator));
        emailService.queueOrderFulfillmentUpdated(order.id);
        return sendJson(response, 200, { order });
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/(picking-list|shipping-labels)$/);
      if (request.method === "GET" && logisticsMatch) {
        requireLogisticsOperator(currentLogisticsOperator);
        const id = Number(logisticsMatch[1]);
        const document = logisticsMatch[2] === "picking-list" ? logisticsPickingList(db, id)
          : logisticsLabels(db, id);
        return sendJson(response, 200, document);
      }
      logisticsMatch = url.pathname.match(/^\/api\/logistics\/orders\/(\d+)\/shipping-remit$/);
      if (request.method === "GET" && logisticsMatch) {
        requireLogisticsOperator(currentLogisticsOperator);
        return sendJson(response, 200, logisticsShippingRemit(db, Number(logisticsMatch[1])));
      }
      if (request.method === "POST" && url.pathname === "/api/sales/forgot-password") {
        const body = await readJson(request);
        const reset = await createSalesRepPasswordReset(db, body.email);
        if (reset) emailService.queueSalesRepPasswordReset(reset.salesRepId, reset.token);
        return sendJson(response, 200, { message: "Si existe una cuenta activa, enviamos un enlace al email." });
      }
      if (request.method === "POST" && url.pathname === "/api/sales/reset-password") {
        const body = await readJson(request);
        const result = await resetSalesRepPassword(db, body.token, body.password);
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/api/sales/change-password") {
        const salesRep = requireSalesRep(currentSalesRep);
        const result = await changeSalesRepPassword(db, salesRep.id, await readJson(request));
        return sendJson(response, 200, result, { "set-cookie": clearSalesRepSessionCookie({ secure: config.secureCookies }) });
      }
      if (request.method === "POST" && url.pathname === "/api/sales/logout") {
        logoutSalesRep(db, cookies.km_sales_session);
        return sendJson(response, 200, { ok: true }, { "set-cookie": clearSalesRepSessionCookie({ secure: config.secureCookies }) });
      }
      if (request.method === "GET" && url.pathname === "/api/sales/me") {
        return sendJson(response, 200, { salesRep: requireSalesRep(currentSalesRep) });
      }
      if (request.method === "GET" && url.pathname === "/api/sales/dashboard") {
        const salesRep = requireSalesRep(currentSalesRep);
        return sendJson(response, 200, { salesRep, dashboard: getSalesRepPortalDashboard(db, salesRep.id) });
      }
      if (request.method === "POST" && url.pathname === "/api/sales/customer-requests") {
        const salesRep = requireSalesRep(currentSalesRep);
        const result = await requestCommercialCustomer(db, salesRep, await readJson(request));
        emailService.queueCustomerRegistration(result.customer.id);
        return sendJson(response, 201, { ...result, message: "Solicitud enviada a KM." });
      }
      if (request.method === "GET" && url.pathname === "/api/sales/products") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, url.searchParams.get("customerId"));
        applyDuePriceUpdates(db);
        return sendJson(response, 200, {
          products: listProducts(db, {
            role: "customer",
            approvalStatus: "approved",
            customerId: customer.id
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/sales/orders") {
        const salesRep = requireSalesRep(currentSalesRep);
        const body = await readJson(request);
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, body.customerId);
        if (!customer.default_shipping_address_id) {
          throw new ValidationError("El cliente no tiene lugar de entrega cargado");
        }
        const order = createOrder(db, customer.id, {
          items: body.items,
          shippingAddressId: customer.default_shipping_address_id,
          createdByRole: "sales_rep",
          createdBySalesRepId: salesRep.id
        });
        emailService.queueOrderCreated(order.id);
        return sendJson(response, 201, { order, message: "Pedido enviado a KM." });
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/orders\/(\d+)$/);
        if (request.method === "GET" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const order = getOrder(db, Number(match[1]), null, true);
          if (Number(order.salesRep?.id || 0) !== Number(salesRep.id)) {
            throw new ValidationError("Pedido no asignado al vendedor");
          }
          return sendJson(response, 200, { order });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/sales/quotes") {
        const salesRep = requireSalesRep(currentSalesRep);
        return sendJson(response, 200, { quotes: listSalesQuotesForSalesRep(db, salesRep.id) });
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/(\d+)\/order$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, Number(match[1]), salesRep.id);
          if (quote.status !== "generated") throw new ValidationError("El presupuesto ya no esta vigente");
          const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, quote.customerId);
          if (!customer.default_shipping_address_id) {
            throw new ValidationError("El cliente no tiene lugar de entrega cargado");
          }
          const order = createOrder(db, customer.id, {
            items: quote.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity
            })),
            shippingAddressId: customer.default_shipping_address_id,
            createdByRole: "sales_rep",
            createdBySalesRepId: salesRep.id
          });
          const updatedQuote = markSalesQuoteConverted(db, quote.id, salesRep.id);
          emailService.queueOrderCreated(order.id);
          return sendJson(response, 201, { order, quote: updatedQuote, message: "Pedido generado desde presupuesto." });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/(\d+)\/email$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, Number(match[1]), salesRep.id);
          if (!quote.customerEmail) throw new ValidationError("El cliente no tiene email cargado");
          emailService.queueSalesQuoteCustomer(quote);
          const updatedQuote = markSalesQuoteShared(db, quote.id, salesRep.id, "email");
          return sendJson(response, 200, { quote: updatedQuote, message: `Presupuesto ${quote.quoteNumber || ""} enviado por email.` });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/(\d+)\/whatsapp$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, Number(match[1]), salesRep.id);
          if (!quote.customerWhatsapp) throw new ValidationError("El cliente no tiene WhatsApp cargado");
          const updatedQuote = markSalesQuoteShared(db, quote.id, salesRep.id, "whatsapp");
          return sendJson(response, 200, { quote: updatedQuote, message: `WhatsApp del presupuesto ${quote.quoteNumber || ""} abierto y registrado.` });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/(\d+)$/);
        if (request.method === "GET" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          return sendJson(response, 200, { quote: getSalesQuote(db, Number(match[1]), salesRep.id) });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/sales/quotes") {
        const salesRep = requireSalesRep(currentSalesRep);
        const body = await readJson(request);
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, body.customerId);
        const quote = createSalesQuote(db, salesRep, customer.id, {
          items: body.items,
          validUntil: body.validUntil,
          notes: body.notes
        });
        return sendJson(response, 201, { quote, message: "Presupuesto generado." });
      }
      if (request.method === "GET" && url.pathname === "/api/me") {
        return sendJson(response, 200, { user: requireUser(currentUser) });
      }
      if (request.method === "GET" && url.pathname === "/api/push/config") {
        const user = requireUser(currentUser);
        return sendJson(response, 200, {
          ...pushService.publicConfig(),
          ...pushService.getUserSubscriptionState(user)
        });
      }
      if (request.method === "POST" && url.pathname === "/api/push/subscribe") {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 201, pushService.upsertSubscription(user, await readJson(request), request.headers["user-agent"] || ""));
      }
      if (request.method === "DELETE" && url.pathname === "/api/push/subscribe") {
        const user = requireApprovedCustomer(currentUser);
        const body = await readJson(request);
        return sendJson(response, 200, pushService.removeSubscription(user, body.endpoint));
      }
      if (request.method === "GET" && url.pathname === "/api/products") {
        applyDuePriceUpdates(db);
        return sendJson(response, 200, { products: listProducts(db, currentUser) });
      }
      if (request.method === "GET" && url.pathname === "/api/products/price-list.xlsx") {
        applyDuePriceUpdates(db);
        const user = requireApprovedCustomer(currentUser);
        const priceList = createCustomerPriceList(db, user, { publicBaseUrl: config.publicBaseUrl || "https://www.km-detail.com" });
        response.writeHead(200, {
          "content-type": priceList.contentType,
          "content-disposition": `attachment; filename="${priceList.filename}"`,
          "content-length": priceList.buffer.length,
          "cache-control": "no-store",
          ...SECURITY_HEADERS
        });
        response.end(priceList.buffer);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/public-settings") {
        return sendJson(response, 200, { settings: { ...getPublicSettings(db), mercadopago: publicMercadoPagoConfig(config) } });
      }
      if (request.method === "GET" && url.pathname === "/api/distributors/public") {
        return sendJson(response, 200, { distributors: listOfficialDistributors(db, { publishedOnly: true }) });
      }
      if (request.method === "POST" && url.pathname === "/api/orders") {
        const user = requireApprovedCustomer(currentUser);
        const order = createOrder(db, user.customerId, await readJson(request));
        recordServerAnalyticsEvent(db, request, user, {
          eventType: "order_created",
          sessionId: "",
          orderId: order.id,
          path: url.pathname,
          metadata: { orderNumber: order.orderNumber, totalCents: order.totalCents }
        });
        order.items.forEach((item) => {
          recordServerAnalyticsEvent(db, request, user, {
            eventType: "order_created",
            sessionId: "",
            productId: item.productId,
            orderId: order.id,
            path: url.pathname,
            metadata: { orderNumber: order.orderNumber, kmCode: item.kmCode, quantity: item.quantity, subtotalNetCents: item.subtotalNetCents }
          });
        });
        emailService.queueOrderCreated(order.id);
        return sendJson(response, 201, { order, availabilityNotice: "Pedido sujeto a confirmación de disponibilidad." });
      }

      if (request.method === "GET" && url.pathname === "/api/orders") {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { orders: listCustomerOrders(db, user.customerId) });
      }
      let mercadoPagoPreferenceMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/mercadopago\/preference$/);
      if (request.method === "POST" && mercadoPagoPreferenceMatch) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 201, {
          preference: await createMercadoPagoPreference(db, Number(mercadoPagoPreferenceMatch[1]), user.customerId, config)
        });
      }
      if (request.method === "GET" && url.pathname === "/api/shipping-addresses") {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { addresses: listShippingAddresses(db, user.customerId) });
      }
      if (request.method === "POST" && url.pathname === "/api/shipping-addresses") {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 201, { address: upsertShippingAddress(db, user.customerId, await readJson(request)) });
      }
      let addressMatch = url.pathname.match(/^\/api\/shipping-addresses\/(\d+)$/);
      if (request.method === "PUT" && addressMatch) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { address: upsertShippingAddress(db, user.customerId, { ...(await readJson(request)), id: Number(addressMatch[1]) }) });
      }
      if (request.method === "DELETE" && addressMatch) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, deleteShippingAddress(db, user.customerId, Number(addressMatch[1])));
      }
      addressMatch = url.pathname.match(/^\/api\/shipping-addresses\/(\d+)\/default$/);
      if (request.method === "POST" && addressMatch) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { address: setDefaultShippingAddress(db, user.customerId, Number(addressMatch[1])) });
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
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/received$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { order: confirmOrderReceived(db, Number(match[1]), user.customerId, user.id) });
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
      if (request.method === "POST" && url.pathname === "/api/admin/customers") {
        return sendJson(response, 201, { customer: await createAdminCustomer(db, await readJson(request), currentUser.id) });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/profile$/);
      if (request.method === "PATCH" && match) {
        return sendJson(response, 200, { customer: updateCustomerProfile(db, Number(match[1]), await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/distributors") {
        return sendJson(response, 200, {
          distributors: listOfficialDistributors(db, {
            status: url.searchParams.get("status") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/distributors") {
        return sendJson(response, 201, { distributor: upsertOfficialDistributor(db, await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/admin\/distributors\/(\d+)$/);
      if (request.method === "PUT" && match) {
        return sendJson(response, 200, { distributor: upsertOfficialDistributor(db, { ...(await readJson(request)), id: Number(match[1]) }) });
      }
      if (request.method === "DELETE" && match) {
        return sendJson(response, 200, deleteOfficialDistributor(db, Number(match[1])));
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/status$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const customer = setCustomerStatus(db, Number(match[1]), body.status, currentUser.id, body.commercialClass);
        if (customer.changed) emailService.queueCustomerStatus(Number(match[1]), body.status);
        return sendJson(response, 200, { customer });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/commercial-class$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const customer = setCustomerCommercialClass(db, Number(match[1]), body.commercialClass);
        return sendJson(response, 200, { customer });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/payment-terms$/);
      if (request.method === "PATCH" && match) {
        const customer = setCustomerPaymentTerms(db, Number(match[1]), await readJson(request));
        return sendJson(response, 200, { customer });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/discounts$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const discounts = setCustomerDiscounts(db, Number(match[1]), body.discountsBps || [], currentUser.id);
        return sendJson(response, 200, { discounts });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/product-discounts$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { discounts: listCustomerProductDiscounts(db, Number(match[1])) });
      }
      if (request.method === "POST" && match) {
        const discount = upsertCustomerProductDiscount(db, Number(match[1]), await readJson(request), currentUser.id);
        return sendJson(response, 201, { discount, discounts: listCustomerProductDiscounts(db, Number(match[1])) });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/product-discounts\/(\d+)$/);
      if (request.method === "DELETE" && match) {
        return sendJson(response, 200, deleteCustomerProductDiscount(db, Number(match[1]), Number(match[2])));
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/sales-rep$/);
      if (request.method === "PATCH" && match) {
        const assignment = assignSalesRepToCustomer(db, Number(match[1]), await readJson(request));
        return sendJson(response, 200, { assignment });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/sales-reps") {
        return sendJson(response, 200, {
          salesReps: listSalesReps(db, {
            search: url.searchParams.get("q") || "",
            status: url.searchParams.get("status") || ""
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/sales-reps/dashboard") {
        return sendJson(response, 200, { dashboard: getSalesRepDashboard(db) });
      }
      match = url.pathname.match(/^\/api\/admin\/sales-reps\/(\d+)\/profile$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { profile: getSalesRepProfile(db, Number(match[1])) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/logistics-operators") {
        return sendJson(response, 200, { operators: listLogisticsOperators(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/logistics-operators") {
        return sendJson(response, 201, { operator: await upsertLogisticsOperator(db, await readJson(request)) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/sales-reps") {
        return sendJson(response, 201, { salesRep: await upsertSalesRep(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/sales-commissions") {
        const salesRepId = Number(url.searchParams.get("salesRepId") || 0);
        return sendJson(response, 200, {
          pending: listPendingSalesCommissions(db, { salesRepId }),
          settlements: listSalesCommissionSettlements(db, { salesRepId })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/sales-commission-settlements") {
        return sendJson(response, 201, {
          settlement: createSalesCommissionSettlement(db, await readJson(request), currentUser.id)
        });
      }
      match = url.pathname.match(/^\/api\/admin\/sales-commission-settlements\/(\d+)$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { settlement: getSalesCommissionSettlement(db, Number(match[1])) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/products") {
        return sendJson(response, 201, { product: upsertProduct(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/products") {
        applyDuePriceUpdates(db);
        return sendJson(response, 200, {
          products: listAdminProducts(db, {
            status: url.searchParams.get("status") || "",
            familySlug: url.searchParams.get("family") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/price-updates") {
        applyDuePriceUpdates(db);
        return sendJson(response, 200, { batches: listPriceUpdateBatches(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/price-updates/individual") {
        const batch = scheduleIndividualPriceUpdate(db, await readJson(request), currentUser.id);
        applyDuePriceUpdates(db);
        return sendJson(response, 201, { batch, batches: listPriceUpdateBatches(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/price-updates/linear") {
        const batch = scheduleLinearPriceUpdate(db, await readJson(request), currentUser.id);
        applyDuePriceUpdates(db);
        return sendJson(response, 201, { batch, batches: listPriceUpdateBatches(db) });
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
            scope: url.searchParams.get("scope") === "history" ? "history" : "active",
            stage: url.searchParams.get("stage") || "",
            paymentStatus: url.searchParams.get("payment") || "",
            search: url.searchParams.get("q") || ""
          }),
          scopes: countAdminOrderScopes(db)
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
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/payment-terms$/);
      if (request.method === "PATCH" && match) {
        const order = authorizeOrderCredit(db, Number(match[1]), await readJson(request), currentUser.id);
        emailService.queueOrderPaymentTermsUpdated(order.id);
        return sendJson(response, 200, { order });
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/commercial-adjustment$/);
      if (request.method === "PATCH" && match) {
        const order = applyCommercialAdjustment(db, Number(match[1]), await readJson(request), currentUser.id);
        return sendJson(response, 200, { order });
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/shipping-labels$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, createShippingLabels(db, Number(match[1]), Number(url.searchParams.get("packages") || 1)));
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/picking-list$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, createPickingList(db, Number(match[1])));
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/delivery-note$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, createDeliveryNote(db, Number(match[1])));
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/account-payments$/);
      if (request.method === "POST" && match) {
        const order = registerCurrentAccountPayment(db, Number(match[1]), await readJson(request), currentUser.id);
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
      match = url.pathname.match(/^\/api\/admin\/payment-receipts\/(\d+)\/file$/);
      if (request.method === "GET" && match) {
        const receiptFile = getPaymentReceiptFile(db, Number(match[1]), uploadsPath);
        const content = fs.readFileSync(receiptFile.filePath);
        response.writeHead(200, {
          "content-type": receiptFile.mimeType,
          "content-length": content.length,
          "content-disposition": `inline; filename="${encodeURIComponent(receiptFile.originalFilename)}"`,
          "cache-control": "no-store",
          ...SECURITY_HEADERS
        });
        response.end(content);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/settings") {
        return sendJson(response, 200, { settings: getCommercialSettings(db) });
      }
      if (request.method === "PATCH" && url.pathname === "/api/admin/settings") {
        const settings = updateCommercialSettings(db, await readJson(request), currentUser.id);
        return sendJson(response, 200, { settings });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/payment-accounts") {
        const account = upsertPaymentAccount(db, await readJson(request), currentUser.id);
        return sendJson(response, 201, { account, settings: getCommercialSettings(db) });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/payment-accounts$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, listCustomerPaymentAccountAssignments(db, Number(match[1])));
      }
      if (request.method === "PUT" && match) {
        return sendJson(response, 200, setCustomerPaymentAccounts(db, Number(match[1]), await readJson(request)));
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
      if (request.method === "GET" && url.pathname === "/api/admin/security-events") {
        return sendJson(response, 200, {
          summary: summarizeSecurityEvents(db),
          events: listSecurityEvents(db, {
            q: url.searchParams.get("q") || "",
            limit: url.searchParams.get("limit") || 150
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/operation/dashboard") {
        return sendJson(response, 200, { dashboard: getAdminOperationDashboard(db) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/analytics/dashboard") {
        return sendJson(response, 200, { dashboard: getAnalyticsDashboard(db, { days: url.searchParams.get("days") }) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/operation/delete-test-orders") {
        return sendJson(response, 200, { result: deleteTestOrders(db, uploadsPath, await readJson(request)) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/operation/prune-backups") {
        return sendJson(response, 200, { result: pruneBackups(await readJson(request)) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/operation/backups/download") {
        const backup = createBackup({
          databasePath: config.databasePath,
          uploadsPath,
          backupPath: config.backupPath
        });
        return sendBackupArchive(response, backup);
      }
      if (request.method === "POST" && url.pathname === "/api/admin/emails/flush") {
        const result = await emailService.flush();
        return sendJson(response, 200, {
          result,
          summary: emailService.summarizeOutbox(),
          emails: emailService.listOutbox(50)
        });
      }

      if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "La función solicitada no está disponible." });
      match = url.pathname.match(/^\/producto\/([a-z0-9-]+)$/);
      if (request.method === "GET" && match) {
        applyDuePriceUpdates(db);
        const productPage = renderProductPage(getPublicProductBySlug(db, match[1]));
        if (productPage) {
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "content-length": Buffer.byteLength(productPage),
            "cache-control": "no-cache",
            ...SEO_SECURITY_HEADERS
          });
          response.end(productPage);
          return;
        }
      }
      if (request.method === "GET" && serveStatic(response, projectRoot, url.pathname)) return;
      return sendJson(response, 404, { error: "No encontramos el recurso solicitado." });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error(error);
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      return sendJson(response, statusCode, {
        error: publicErrorMessage(error, statusCode),
        details: error.details || undefined
      });
    }
  };
}

function sendBackupArchive(response, backup) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const filename = `${backup.name}.zip`;
  response.writeHead(200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
    ...SECURITY_HEADERS
  });
  archive.pipe(response);
  archive.directory(backup.targetDir, backup.name);
  return archive.finalize();
}
