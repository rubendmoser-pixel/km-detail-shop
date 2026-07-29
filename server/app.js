import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ZipArchive } from "archiver";
import { normalizeEmail, ValidationError, publicErrorMessage } from "./domain/validation.js";
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
  getUnfulfilledDemandReport,
  getPaymentReceiptFile,
  listAdminOrders,
  countAdminOrderScopes,
  listCustomerOrders,
  registerCurrentAccountPayment,
  reviewPaymentReceipt,
  requestModifiedOrderReview,
  updateOrderFulfillment,
  updateOrderStatus
} from "./services/order-service.js";
import {
  addProductImage,
  deleteProductImage,
  getAdminProductBoxLabel,
  getAdminProductLocationLabel,
  listAdminProducts,
  listPublicProductsForSeo,
  listProductFamilies,
  listProductImages,
  listProducts,
  removeProductPromotion,
  setPrimaryProductImage,
  upsertProduct
} from "./services/product-service.js";
import { getCommercialSettings, getPublicSettings, updateCommercialSettings } from "./services/settings-service.js";
import { getInventoryValuation, getProductionCosts } from "./services/production-cost-service.js";
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
  getAssignedCustomerForSalesRep,
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
import { createProspectSalesQuote, createSalesQuote, getSalesQuote, listProspectQuoteProducts, listSalesQuotesForSalesRep, markSalesQuoteConverted, markSalesQuoteShared } from "./services/sales-quote-service.js";
import {
  addSalesProspectActivity,
  canSalesRepAccessProspects,
  listAdminProspects,
  listSalesProspects,
  markProspectConverted,
  markProspectQuoted,
  updateSalesProspect
} from "./services/prospect-service.js";
import { deleteShippingAddress, listShippingAddresses, setDefaultShippingAddress, upsertShippingAddress } from "./services/shipping-address-service.js";
import { SECURITY_HEADERS, SEO_SECURITY_HEADERS, analyticsSessionCookie, clearLogisticsSessionCookie, clearProductionSessionCookie, clearSalesRepSessionCookie, clearSessionCookie, logisticsSessionCookie, parseCookies, productionSessionCookie, readJson, salesRepSessionCookie, sendJson, serveProductImage, serveStatic, sessionCookie } from "./http.js";
import {
  authenticateLogisticsOperator, claimLogisticsOrder, confirmLogisticsAvailability, dispatchLogisticsOrder,
  getLogisticsOrder, listLogisticsOperators, listLogisticsOrders, loginLogisticsOperator, logoutLogisticsOperator,
  logisticsLabels, logisticsPickingList, logisticsShippingRemit, requireLogisticsOperator,
  updateLogisticsChecklist, upsertLogisticsOperator
} from "./services/logistics-service.js";
import {
  addProductionPlanItem, adjustProductionInventory, approveProductionPlan, authenticateProductionOperator, closeProductionPlan, confirmDailyProductionReport, consumeProductionAdminPortalAccess, createProductionAdminPortalAccess, createProductionCommissionSettlement, createProductionWeek, getCurrentProductionDashboard, getProductionCommissionDashboard, getProductionCommissionSettlement, getProductionInventory, getProductionReportImpact, getProductionScheduleDefaults, getProductionStockParameters, getProductionSuggestions,
  listProductionMaterials, listProductionOperators, listProductionPlans, listProductionRecipes, listProductionReports, listProductionSuppliers, loginProductionOperator, logoutProductionOperator, searchProductionProducts,
  registerProductionInventoryEntry, requireProductionOperator, returnDailyProductionReport, saveDailyProductionReport, saveProductionPlan, saveProductionPlanCalendar, saveProductionScheduleDefaults, saveProductionStockItemParameter, saveProductionStockParameterDefaults,
  submitDailyProductionReport, upsertProductionMaterial, upsertProductionOperator, upsertProductionRecipe, upsertProductionSupplier
} from "./services/production-service.js";
import { createEmailService } from "./services/email-service.js";
import { createPushService } from "./services/push-service.js";
import { createMercadoPagoPreference, handleMercadoPagoWebhook, publicMercadoPagoConfig } from "./services/mercadopago-service.js";
import { createRateLimiter } from "./rate-limit.js";
import { isServerRenderedSeoPath, renderProductDirectoryPage, renderSeoLandingPage, renderSitemap } from "./seo-pages.js";
import { listSecurityEvents, recordSecurityEvent, summarizeSecurityEvents } from "./services/security-event-service.js";
import { getAdminOperationDashboard } from "./services/admin-report-service.js";
import { createCustomerPriceList, createScheduledPriceList } from "./services/price-list-service.js";
import {
  applyDuePriceUpdates,
  createSellerPriceListShare,
  getSellerPriceUpdateBatch,
  getSharedPriceUpdateBatch,
  getPriceUpdateBatch,
  listSellerCustomerPriceListShares,
  listSellerPriceUpdateBatches,
  listPriceUpdateBatches,
  scheduleIndividualPriceUpdate,
  scheduleLinearPriceUpdate,
  setPriceUpdateSellerVisibility
} from "./services/price-update-service.js";
import { getAnalyticsDashboard, recordAnalyticsEvents, recordServerAnalyticsEvent } from "./services/analytics-service.js";
import { createBackup, formatBackupSummary } from "./services/backup-service.js";
import { getOperationalResetPreview, OPERATIONAL_RESET_CONFIRMATION, resetOperationalData } from "./services/operational-reset-service.js";
import { pruneBackups } from "./services/storage-status-service.js";
import { deleteOfficialDistributor, listOfficialDistributors, upsertOfficialDistributor } from "./services/distributor-service.js";
import {
  getCustomerNotificationContext,
  getOrderNotificationContext,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyAdmins,
  notifyAllLogistics,
  notifyAllProduction,
  notifyCustomer,
  notifySalesRep,
  requireNotificationActor
} from "./services/notification-service.js";

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
    const currentProductionOperator = authenticateProductionOperator(db, cookies.km_production_session);

    try {
      let match;
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
      const notificationContext = {
        user: currentUser,
        salesRep: currentSalesRep,
        logisticsOperator: currentLogisticsOperator,
        productionOperator: currentProductionOperator
      };
      if (request.method === "GET" && url.pathname === "/api/notifications") {
        return sendJson(response, 200, listNotifications(
          db,
          requireNotificationActor(notificationContext),
          { limit: url.searchParams.get("limit") }
        ));
      }
      if (request.method === "POST" && url.pathname === "/api/notifications/read-all") {
        return sendJson(response, 200, markAllNotificationsRead(db, requireNotificationActor(notificationContext)));
      }
      if (request.method === "GET" && url.pathname === "/api/notifications/push/config") {
        const actor = requireNotificationActor(notificationContext);
        return sendJson(response, 200, {
          ...pushService.publicConfig(),
          ...pushService.getActorSubscriptionState(actor)
        });
      }
      if (request.method === "POST" && url.pathname === "/api/notifications/push/subscribe") {
        const actor = requireNotificationActor(notificationContext);
        return sendJson(response, 201, pushService.upsertActorSubscription(
          actor,
          await readJson(request),
          request.headers["user-agent"] || ""
        ));
      }
      if (request.method === "DELETE" && url.pathname === "/api/notifications/push/subscribe") {
        const actor = requireNotificationActor(notificationContext);
        const body = await readJson(request);
        return sendJson(response, 200, pushService.removeActorSubscription(actor, body.endpoint));
      }
      match = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
      if (request.method === "POST" && match) {
        return sendJson(response, 200, {
          notification: markNotificationRead(db, requireNotificationActor(notificationContext), Number(match[1]))
        });
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
          notifyPaymentReviewed(db, result.order.id, "accepted", "Pago acreditado por Mercado Pago");
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
        notifyAdmins(db, {
          eventType: "customer_request_created",
          priority: "action",
          title: "Nueva solicitud comercial",
          body: result.customer.businessName || "Cliente nuevo",
          actionUrl: "/admin.html#customers",
          entityType: "customer",
          entityId: result.customer.id,
          dedupeKey: `customer-request-admin:${result.customer.id}`
        });
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
      match = url.pathname.match(/^\/api\/shared\/price-lists\/(\d+)\/list\.xlsx$/);
      if (request.method === "GET" && match) {
        applyDuePriceUpdates(db);
        const batch = getSharedPriceUpdateBatch(db, Number(match[1]), url.searchParams.get("token"));
        if (!batch) return sendJson(response, 404, { error: "Este enlace venció o ya no está disponible." });
        const priceList = await createScheduledPriceList(batch);
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
      match = url.pathname.match(/^\/api\/shared\/price-lists\/(\d+)$/);
      if (request.method === "GET" && match) {
        applyDuePriceUpdates(db);
        const batch = getSharedPriceUpdateBatch(db, Number(match[1]), url.searchParams.get("token"));
        return batch
          ? sendJson(response, 200, { batch })
          : sendJson(response, 404, { error: "Este enlace venció o ya no está disponible." });
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
      if (request.method === "POST" && url.pathname === "/api/production/login") {
        const result = await loginProductionOperator(db, await readJson(request), config.sessionDays || 30);
        logout(db, cookies.km_session);
        logoutSalesRep(db, cookies.km_sales_session);
        logoutLogisticsOperator(db, cookies.km_logistics_session);
        return sendJson(response, 200, { operator: result.operator, expiresAt: result.expiresAt }, {
          "set-cookie": [
            productionSessionCookie(result.token, { secure: config.secureCookies, maxAgeSeconds: (config.sessionDays || 30) * 86_400 }),
            clearSessionCookie({ secure: config.secureCookies }), clearSalesRepSessionCookie({ secure: config.secureCookies }),
            clearLogisticsSessionCookie({ secure: config.secureCookies })
          ]
        });
      }
      if (request.method === "GET" && url.pathname === "/api/production/admin-handoff") {
        const result = consumeProductionAdminPortalAccess(db, url.searchParams.get("token") || "", config.sessionDays || 30);
        response.writeHead(302, {
          location: "/produccion.html",
          "set-cookie": productionSessionCookie(result.token, { secure: config.secureCookies, maxAgeSeconds: (config.sessionDays || 30) * 86_400 }),
          "cache-control": "no-store",
          ...SECURITY_HEADERS
        });
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/production/logout") {
        logoutProductionOperator(db, cookies.km_production_session);
        return sendJson(response, 200, { ok: true }, { "set-cookie": clearProductionSessionCookie({ secure: config.secureCookies }) });
      }
      if (request.method === "GET" && url.pathname === "/api/production/me") {
        return sendJson(response, 200, { operator: requireProductionOperator(currentProductionOperator) });
      }
      if (request.method === "GET" && url.pathname === "/api/production/dashboard") {
        return sendJson(response, 200, { operator: requireProductionOperator(currentProductionOperator), ...getCurrentProductionDashboard(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/production/reports") {
        return sendJson(response, 201, { report: saveDailyProductionReport(db, await readJson(request), requireProductionOperator(currentProductionOperator)) });
      }
      match = url.pathname.match(/^\/api\/production\/reports\/(\d+)\/submit$/);
      if (request.method === "POST" && match) {
        const operator = requireProductionOperator(currentProductionOperator);
        const report = submitDailyProductionReport(db, Number(match[1]), operator);
        notifyAdmins(db, {
          eventType: "production_report_submitted",
          priority: "action",
          title: "Parte de producción para revisar",
          body: `${operator.name || "Producción"} envió un nuevo parte diario.`,
          actionUrl: "/admin.html#production",
          entityType: "production_report",
          entityId: report.id,
          dedupeKey: `production-report-submitted:${report.id}`
        });
        return sendJson(response, 200, { report });
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
        notifyOrderAvailability(db, order.id);
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
        notifyOrderDispatched(db, order.id);
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
        return sendJson(response, 200, {
          salesRep,
          dashboard: getSalesRepPortalDashboard(db, salesRep.id),
          prospectAccess: canSalesRepAccessProspects(salesRep)
        });
      }
      if (request.method === "POST" && url.pathname === "/api/sales/customer-requests") {
        const salesRep = requireSalesRep(currentSalesRep);
        const body = await readJson(request);
        const result = await requestCommercialCustomer(db, salesRep, body);
        markProspectConverted(db, salesRep, body.prospectId, result.customer.id);
        emailService.queueCustomerRegistration(result.customer.id);
        notifyAdmins(db, {
          eventType: "customer_request_created",
          priority: "action",
          title: "Nueva alta comercial para revisar",
          body: `${result.customer.businessName || "Cliente nuevo"} · ${salesRep.name}`,
          actionUrl: "/admin.html#customers",
          entityType: "customer",
          entityId: result.customer.id,
          dedupeKey: `customer-request-admin:${result.customer.id}`
        });
        return sendJson(response, 201, { ...result, message: "Solicitud enviada a KM." });
      }
      if (request.method === "GET" && url.pathname === "/api/sales/prospects") {
        const salesRep = requireSalesRep(currentSalesRep);
        return sendJson(response, 200, listSalesProspects(db, salesRep, {
          search: url.searchParams.get("q"),
          status: url.searchParams.get("status"),
          city: url.searchParams.get("city")
        }));
      }
      match = url.pathname.match(/^\/api\/sales\/prospects\/(\d+)$/);
      if (request.method === "PATCH" && match) {
        const salesRep = requireSalesRep(currentSalesRep);
        return sendJson(response, 200, { prospect: updateSalesProspect(db, salesRep, Number(match[1]), await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/sales\/prospects\/(\d+)\/activities$/);
      if (request.method === "POST" && match) {
        const salesRep = requireSalesRep(currentSalesRep);
        return sendJson(response, 201, { prospect: addSalesProspectActivity(db, salesRep, Number(match[1]), await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/sales\/customers\/(\d+)\/shipping-addresses$/);
      if (match && request.method === "GET") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        return sendJson(response, 200, { addresses: listShippingAddresses(db, customer.id) });
      }
      if (match && request.method === "POST") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        return sendJson(response, 201, { address: upsertShippingAddress(db, customer.id, await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/sales\/customers\/(\d+)\/shipping-addresses\/(\d+)$/);
      if (match && request.method === "PUT") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        return sendJson(response, 200, { address: upsertShippingAddress(db, customer.id, { ...(await readJson(request)), id: Number(match[2]) }) });
      }
      if (match && request.method === "DELETE") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        return sendJson(response, 200, deleteShippingAddress(db, customer.id, Number(match[2])));
      }
      match = url.pathname.match(/^\/api\/sales\/customers\/(\d+)\/shipping-addresses\/(\d+)\/default$/);
      if (match && request.method === "PATCH") {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        return sendJson(response, 200, { address: setDefaultShippingAddress(db, customer.id, Number(match[2])) });
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
          shippingAddressId: Number(body.shippingAddressId || customer.default_shipping_address_id),
          createdByRole: "sales_rep",
          createdBySalesRepId: salesRep.id
        });
        emailService.queueOrderCreated(order.id);
        notifyOrderCreated(db, order.id);
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
      if (request.method === "GET" && url.pathname === "/api/sales/prospect-products") {
        requireSalesRep(currentSalesRep);
        applyDuePriceUpdates(db);
        return sendJson(response, 200, { products: listProspectQuoteProducts(db), vatBps: getCommercialSettings(db).vatBps });
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/([^/]+)\/order$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, match[1], salesRep.id);
          if (quote.kind === "prospect") throw new ValidationError("Primero inicia y aprueba el alta comercial del cliente potencial");
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
          notifyOrderCreated(db, order.id);
          return sendJson(response, 201, { order, quote: updatedQuote, message: "Pedido generado desde presupuesto." });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/([^/]+)\/email$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, match[1], salesRep.id);
          if (!quote.customerEmail) throw new ValidationError("El cliente no tiene email cargado");
          emailService.queueSalesQuoteCustomer(quote);
          const updatedQuote = markSalesQuoteShared(db, quote.id, salesRep.id, "email");
          return sendJson(response, 200, { quote: updatedQuote, message: `Presupuesto ${quote.quoteNumber || ""} enviado por email.` });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/([^/]+)\/whatsapp$/);
        if (request.method === "POST" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          const quote = getSalesQuote(db, match[1], salesRep.id);
          if (!quote.customerWhatsapp) throw new ValidationError("El cliente no tiene WhatsApp cargado");
          const updatedQuote = markSalesQuoteShared(db, quote.id, salesRep.id, "whatsapp");
          return sendJson(response, 200, { quote: updatedQuote, message: `WhatsApp del presupuesto ${quote.quoteNumber || ""} abierto y registrado.` });
        }
      }
      {
        const match = url.pathname.match(/^\/api\/sales\/quotes\/([^/]+)$/);
        if (request.method === "GET" && match) {
          const salesRep = requireSalesRep(currentSalesRep);
          return sendJson(response, 200, { quote: getSalesQuote(db, match[1], salesRep.id) });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/sales/quotes") {
        const salesRep = requireSalesRep(currentSalesRep);
        const body = await readJson(request);
        if (body.kind === "prospect") {
          const quote = createProspectSalesQuote(db, salesRep, body);
          markProspectQuoted(db, salesRep, body.prospectId);
          return sendJson(response, 201, { quote, message: "Presupuesto para cliente potencial generado." });
        }
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, body.customerId);
        const quote = createSalesQuote(db, salesRep, customer.id, {
          items: body.items,
          validUntil: body.validUntil,
          notes: body.notes
        });
        return sendJson(response, 201, { quote, message: "Presupuesto generado." });
      }
      if (request.method === "GET" && url.pathname === "/api/sales/price-lists") {
        requireSalesRep(currentSalesRep);
        applyDuePriceUpdates(db);
        return sendJson(response, 200, { priceLists: listSellerPriceUpdateBatches(db) });
      }
      match = url.pathname.match(/^\/api\/sales\/customers\/(\d+)\/price-lists$/);
      if (request.method === "GET" && match) {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        applyDuePriceUpdates(db);
        return sendJson(response, 200, {
          customer: {
            id: customer.id,
            businessName: customer.business_name,
            email: customer.email || "",
            whatsapp: customer.whatsapp || customer.phone || ""
          },
          priceLists: listSellerPriceUpdateBatches(db),
          history: listSellerCustomerPriceListShares(db, {
            salesRepId: salesRep.id,
            customerId: customer.id
          })
        });
      }
      match = url.pathname.match(/^\/api\/sales\/customers\/(\d+)\/price-lists\/(\d+)\/share$/);
      if (request.method === "POST" && match) {
        const salesRep = requireSalesRep(currentSalesRep);
        const customer = getAssignedApprovedCustomerForSalesRep(db, salesRep.id, Number(match[1]));
        const body = await readJson(request);
        const channel = String(body.channel || "").trim().toLowerCase();
        let recipient = "";
        if (channel === "email") {
          recipient = normalizeEmail(customer.email);
        } else if (channel === "whatsapp") {
          recipient = String(customer.whatsapp || customer.phone || "").replace(/\D/g, "");
          if (recipient.length < 8 || recipient.length > 15) {
            throw new ValidationError("El cliente no tiene un WhatsApp válido cargado.");
          }
        } else {
          throw new ValidationError("Seleccioná email o WhatsApp para compartir la lista.");
        }
        const share = createSellerPriceListShare(db, {
          batchId: Number(match[2]),
          salesRepId: salesRep.id,
          customerId: customer.id,
          channel,
          recipient
        });
        if (!share) return sendJson(response, 404, { error: "Esta lista ya no está disponible para vendedores." });
        const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
        const token = encodeURIComponent(share.token);
        const pdfUrl = `${baseUrl}/price-update-list.html?batch=${share.batch.id}&share=${token}`;
        const excelUrl = `${baseUrl}/api/shared/price-lists/${share.batch.id}/list.xlsx?token=${token}`;
        if (channel === "email") {
          emailService.queueSellerPriceListCustomer({
            recipient,
            salesRepName: salesRep.name,
            effectiveDate: share.batch.effectiveDate,
            pdfUrl,
            excelUrl
          });
        }
        const whatsappText = [
          `Hola, te comparto la lista oficial de precios de KM Detail Line.`,
          `Vigencia: ${share.batch.effectiveDate.split("-").reverse().join("/")}.`,
          "",
          `Ver o guardar en PDF: ${pdfUrl}`,
          `Descargar en Excel: ${excelUrl}`,
          "",
          "Los enlaces privados tienen una vigencia de 30 días."
        ].join("\n");
        return sendJson(response, 200, {
          message: channel === "email"
            ? `Lista enviada a ${recipient}.`
            : "Mensaje preparado para abrir en WhatsApp.",
          whatsappText: channel === "whatsapp" ? whatsappText : "",
          recipient,
          pdfUrl,
          excelUrl,
          expiresAt: share.expiresAt,
          history: listSellerCustomerPriceListShares(db, {
            salesRepId: salesRep.id,
            customerId: customer.id
          })
        });
      }
      match = url.pathname.match(/^\/api\/sales\/price-lists\/(\d+)\/share$/);
      if (request.method === "POST" && match) {
        const salesRep = requireSalesRep(currentSalesRep);
        const body = await readJson(request);
        const channel = String(body.channel || "").trim().toLowerCase();
        let recipient = "";
        if (channel === "email") {
          recipient = normalizeEmail(body.recipient);
        } else if (channel === "whatsapp") {
          recipient = String(body.recipient || "").replace(/\D/g, "");
          if (recipient.length < 8 || recipient.length > 15) {
            throw new ValidationError("Ingresá un número de WhatsApp válido, con código de país y área.");
          }
        } else {
          throw new ValidationError("Seleccioná email o WhatsApp para compartir la lista.");
        }
        const share = createSellerPriceListShare(db, {
          batchId: Number(match[1]),
          salesRepId: salesRep.id,
          channel,
          recipient
        });
        if (!share) return sendJson(response, 404, { error: "Esta lista ya no está disponible para vendedores." });
        const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
        const token = encodeURIComponent(share.token);
        const pdfUrl = `${baseUrl}/price-update-list.html?batch=${share.batch.id}&share=${token}`;
        const excelUrl = `${baseUrl}/api/shared/price-lists/${share.batch.id}/list.xlsx?token=${token}`;
        if (channel === "email") {
          emailService.queueSellerPriceListCustomer({
            recipient,
            salesRepName: salesRep.name,
            effectiveDate: share.batch.effectiveDate,
            pdfUrl,
            excelUrl
          });
        }
        const whatsappText = [
          "Hola, te comparto la lista oficial de precios de KM Detail Line.",
          `Vigencia: ${share.batch.effectiveDate.split("-").reverse().join("/")}.`,
          "",
          `Ver o guardar en PDF: ${pdfUrl}`,
          `Descargar en Excel: ${excelUrl}`,
          "",
          "Los enlaces privados tienen una vigencia de 30 días."
        ].join("\n");
        return sendJson(response, 200, {
          message: channel === "email"
            ? `Lista enviada a ${recipient}.`
            : "Mensaje preparado para abrir en WhatsApp.",
          whatsappText: channel === "whatsapp" ? whatsappText : "",
          recipient,
          pdfUrl,
          excelUrl,
          expiresAt: share.expiresAt
        });
      }
      match = url.pathname.match(/^\/api\/sales\/price-lists\/(\d+)\/list\.xlsx$/);
      if (request.method === "GET" && match) {
        requireSalesRep(currentSalesRep);
        applyDuePriceUpdates(db);
        const batch = getSellerPriceUpdateBatch(db, Number(match[1]));
        if (!batch) return sendJson(response, 404, { error: "Esta lista de precios no está disponible para vendedores." });
        const priceList = await createScheduledPriceList(batch);
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
      match = url.pathname.match(/^\/api\/sales\/price-lists\/(\d+)$/);
      if (request.method === "GET" && match) {
        requireSalesRep(currentSalesRep);
        applyDuePriceUpdates(db);
        const batch = getSellerPriceUpdateBatch(db, Number(match[1]));
        return batch
          ? sendJson(response, 200, { batch })
          : sendJson(response, 404, { error: "Esta lista de precios no está disponible para vendedores." });
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
        notifyOrderCreated(db, order.id);
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

      match = url.pathname.match(/^\/api\/orders\/(\d+)$/);
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
        notifyPaymentUploaded(db, order.id);
        return sendJson(response, 201, { order });
      }
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/accept$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { order: acceptModifiedOrder(db, Number(match[1]), user.customerId, user.id) });
      }
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/review-request$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { order: requestModifiedOrderReview(db, Number(match[1]), user.customerId, user.id) });
      }
      match = url.pathname.match(/^\/api\/orders\/(\d+)\/received$/);
      if (request.method === "POST" && match) {
        const user = requireApprovedCustomer(currentUser);
        return sendJson(response, 200, { order: confirmOrderReceived(db, Number(match[1]), user.customerId, user.id) });
      }

      if (url.pathname.startsWith("/api/admin/")) requireAdmin(currentUser);

      if (request.method === "GET" && url.pathname === "/api/admin/production/portal-entry") {
        const access = createProductionAdminPortalAccess(db, currentUser);
        const host = request.headers.host || "";
        const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
        const origin = local ? `${config.secureCookies ? "https" : "http"}://${host}` : "https://produccion.km-detail.com";
        response.writeHead(302, {
          location: `${origin}/api/production/admin-handoff?token=${encodeURIComponent(access.token)}`,
          "cache-control": "no-store",
          ...SECURITY_HEADERS
        });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/customers") {
        return sendJson(response, 200, {
          customers: listCustomers(db, {
            status: url.searchParams.get("status") || "",
            search: url.searchParams.get("q") || ""
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/prospects") {
        return sendJson(response, 200, listAdminProspects(db, {
          search: url.searchParams.get("q"),
          status: url.searchParams.get("status"),
          city: url.searchParams.get("city")
        }));
      }
      match = url.pathname.match(/^\/api\/admin\/prospects\/(\d+)$/);
      if (request.method === "PATCH" && match) {
        return sendJson(response, 200, {
          prospect: updateSalesProspect(db, currentUser, Number(match[1]), await readJson(request), "admin")
        });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/customers") {
        return sendJson(response, 201, { customer: await createAdminCustomer(db, await readJson(request), currentUser.id) });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/profile$/);
      if (request.method === "PATCH" && match) {
        return sendJson(response, 200, { customer: updateCustomerProfile(db, Number(match[1]), await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/shipping-addresses$/);
      if (match && request.method === "GET") return sendJson(response, 200, { addresses: listShippingAddresses(db, Number(match[1])) });
      if (match && request.method === "POST") return sendJson(response, 201, { address: upsertShippingAddress(db, Number(match[1]), await readJson(request)) });
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/shipping-addresses\/(\d+)$/);
      if (match && request.method === "PUT") return sendJson(response, 200, { address: upsertShippingAddress(db, Number(match[1]), { ...(await readJson(request)), id: Number(match[2]) }) });
      if (match && request.method === "DELETE") return sendJson(response, 200, deleteShippingAddress(db, Number(match[1]), Number(match[2])));
      match = url.pathname.match(/^\/api\/admin\/customers\/(\d+)\/shipping-addresses\/(\d+)\/default$/);
      if (match && request.method === "PATCH") return sendJson(response, 200, { address: setDefaultShippingAddress(db, Number(match[1]), Number(match[2])) });
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
        if (customer.changed) notifyCustomerStatusChanged(db, Number(match[1]), body.status);
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
      if (request.method === "GET" && url.pathname === "/api/admin/production-operators") {
        return sendJson(response, 200, { operators: listProductionOperators(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production-operators") {
        return sendJson(response, 201, { operator: await upsertProductionOperator(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/products") {
        return sendJson(response, 200, { products: searchProductionProducts(db, url.searchParams.get("q") || "") });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/plans") {
        return sendJson(response, 200, { plans: listProductionPlans(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/plans") {
        return sendJson(response, 201, { plan: saveProductionPlan(db, await readJson(request), currentUser.id) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/weeks") {
        return sendJson(response, 201, { plan: createProductionWeek(db, await readJson(request), currentUser.id) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/schedule-defaults") {
        return sendJson(response, 200, { schedule: getProductionScheduleDefaults(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/schedule-defaults") {
        return sendJson(response, 200, { schedule: saveProductionScheduleDefaults(db, await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/plans\/(\d+)\/calendar$/);
      if (request.method === "POST" && match) {
        return sendJson(response, 200, { plan: saveProductionPlanCalendar(db, Number(match[1]), await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/plans\/(\d+)\/approve$/);
      if (request.method === "POST" && match) {
        const plan = approveProductionPlan(db, Number(match[1]), currentUser.id);
        notifyAllProduction(db, {
          eventType: "production_plan_approved",
          priority: "action",
          title: "Plan semanal habilitado",
          body: "Administración aprobó el plan de fabricación. Ya está disponible para trabajar.",
          actionUrl: "/produccion.html",
          entityType: "production_plan",
          entityId: plan.id,
          dedupeKey: `production-plan-approved:${plan.id}`
        });
        return sendJson(response, 200, { plan });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/plans\/(\d+)\/items$/);
      if (request.method === "POST" && match) {
        const body = await readJson(request);
        const plan = addProductionPlanItem(db, Number(match[1]), body, currentUser.id);
        notifyAllProduction(db, {
          eventType: "production_plan_updated",
          priority: body.urgent ? "urgent" : "action",
          title: body.urgent ? "Fabricación urgente agregada" : "Plan semanal actualizado",
          body: body.reason || "Administración agregó un producto al plan en curso.",
          actionUrl: "/produccion.html",
          entityType: "production_plan",
          entityId: plan.id,
          dedupeKey: `production-plan-item:${plan.id}:${body.productId || ""}`
        });
        return sendJson(response, 201, { plan });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/plans\/(\d+)\/close$/);
      if (request.method === "POST" && match) {
        return sendJson(response, 200, closeProductionPlan(db, Number(match[1]), currentUser.id));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/reports") {
        return sendJson(response, 200, { reports: listProductionReports(db, { status: url.searchParams.get("status") || "" }) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/commissions") {
        return sendJson(response, 200, { commissions: getProductionCommissionDashboard(db, { operatorId: Number(url.searchParams.get("operatorId") || 0) }) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/costs") {
        return sendJson(response, 200, { costs: getProductionCosts(db) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/inventory-valuation") {
        return sendJson(response, 200, { valuation: getInventoryValuation(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/commission-settlements") {
        return sendJson(response, 201, { settlement: createProductionCommissionSettlement(db, await readJson(request), currentUser.id) });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/commission-settlements\/(\d+)$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { settlement: getProductionCommissionSettlement(db, Number(match[1])) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/inventory") {
        return sendJson(response, 200, { inventory: getProductionInventory(db, { query: url.searchParams.get("q") || "", type: url.searchParams.get("type") || "" }) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/inventory/adjustment") {
        return sendJson(response, 201, { adjustment: adjustProductionInventory(db, await readJson(request), currentUser.id) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/inventory/entry") {
        return sendJson(response, 201, { entry: registerProductionInventoryEntry(db, await readJson(request), currentUser.id) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/stock-parameters") {
        return sendJson(response, 200, { parameters: getProductionStockParameters(db) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/suggestions") {
        return sendJson(response, 200, { suggestions: getProductionSuggestions(db) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/stock-parameters/defaults") {
        return sendJson(response, 200, { parameters: saveProductionStockParameterDefaults(db, await readJson(request), currentUser.id) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/stock-parameters/item") {
        return sendJson(response, 200, { parameters: saveProductionStockItemParameter(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/materials") {
        return sendJson(response, 200, { materials: listProductionMaterials(db, {
          query: url.searchParams.get("q") || "", kind: url.searchParams.get("kind") || "", status: url.searchParams.get("status") || ""
        }) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/materials") {
        return sendJson(response, 201, { material: upsertProductionMaterial(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/suppliers") {
        return sendJson(response, 200, { suppliers: listProductionSuppliers(db, {
          query: url.searchParams.get("q") || "", status: url.searchParams.get("status") || ""
        }) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/suppliers") {
        return sendJson(response, 201, { supplier: upsertProductionSupplier(db, await readJson(request)) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/production/recipes") {
        return sendJson(response, 200, { recipes: listProductionRecipes(db, {
          query: url.searchParams.get("q") || "", status: url.searchParams.get("status") || ""
        }) });
      }
      if (request.method === "POST" && url.pathname === "/api/admin/production/recipes") {
        return sendJson(response, 201, { recipe: upsertProductionRecipe(db, await readJson(request)) });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/reports\/(\d+)\/impact$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { impact: getProductionReportImpact(db, Number(match[1])) });
      }
      match = url.pathname.match(/^\/api\/admin\/production\/reports\/(\d+)\/confirm$/);
      if (request.method === "POST" && match) {
        const result = confirmDailyProductionReport(db, Number(match[1]), currentUser.id);
        notifyAllProduction(db, {
          eventType: "production_report_confirmed",
          priority: "info",
          title: "Parte de producción aprobado",
          body: "Administración confirmó el ingreso de la producción al stock.",
          actionUrl: "/produccion.html",
          entityType: "production_report",
          entityId: Number(match[1]),
          dedupeKey: `production-report-confirmed:${match[1]}`
        });
        return sendJson(response, 200, result);
      }
      match = url.pathname.match(/^\/api\/admin\/production\/reports\/(\d+)\/return$/);
      if (request.method === "POST" && match) {
        const body = await readJson(request);
        const report = returnDailyProductionReport(db, Number(match[1]), body.reason);
        notifyAllProduction(db, {
          eventType: "production_report_returned",
          priority: "action",
          title: "Parte devuelto para corregir",
          body: body.reason || "Administración devolvió un parte diario.",
          actionUrl: "/produccion.html",
          entityType: "production_report",
          entityId: Number(match[1]),
          dedupeKey: `production-report-returned:${match[1]}`
        });
        return sendJson(response, 200, { report });
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
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/promotion$/);
      if (request.method === "DELETE" && match) {
        return sendJson(response, 200, { product: removeProductPromotion(db, Number(match[1])) });
      }
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/location-label$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { label: getAdminProductLocationLabel(db, Number(match[1])) });
      }
      match = url.pathname.match(/^\/api\/admin\/products\/(\d+)\/box-label$/);
      if (request.method === "GET" && match) {
        return sendJson(response, 200, { label: getAdminProductBoxLabel(db, Number(match[1])) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/price-updates") {
        applyDuePriceUpdates(db);
        return sendJson(response, 200, { batches: listPriceUpdateBatches(db) });
      }
      match = url.pathname.match(/^\/api\/admin\/price-updates\/(\d+)\/list\.xlsx$/);
      if (request.method === "GET" && match) {
        applyDuePriceUpdates(db);
        const batch = getPriceUpdateBatch(db, Number(match[1]));
        if (!batch) return sendJson(response, 404, { error: "No encontramos la actualizacion de precios." });
        const priceList = await createScheduledPriceList(batch);
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
      match = url.pathname.match(/^\/api\/admin\/price-updates\/(\d+)$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        if (typeof body.visible !== "boolean") {
          throw new ValidationError("Indicá si la lista debe estar visible para vendedores.");
        }
        const batch = setPriceUpdateSellerVisibility(db, Number(match[1]), body.visible, currentUser.id);
        return batch
          ? sendJson(response, 200, {
            batch,
            batches: listPriceUpdateBatches(db),
            message: batch.sellerVisible
              ? "Lista habilitada para vendedores."
              : "Lista oculta para vendedores."
          })
          : sendJson(response, 404, { error: "No encontramos la actualización de precios." });
      }
      if (request.method === "GET" && match) {
        applyDuePriceUpdates(db);
        const batch = getPriceUpdateBatch(db, Number(match[1]));
        return batch
          ? sendJson(response, 200, { batch })
          : sendJson(response, 404, { error: "No encontramos la actualizacion de precios." });
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
      if (request.method === "GET" && url.pathname === "/api/admin/unfulfilled-demand") {
        requireAdmin(currentUser);
        return sendJson(response, 200, getUnfulfilledDemandReport(db, {
          q: url.searchParams.get("q") || "",
          from: url.searchParams.get("from") || "",
          to: url.searchParams.get("to") || "",
          reason: url.searchParams.get("reason") || ""
        }));
      }
      match = url.pathname.match(/^\/api\/admin\/orders\/(\d+)\/availability$/);
      if (request.method === "PATCH" && match) {
        const body = await readJson(request);
        const order = confirmOrderAvailability(db, Number(match[1]), body, currentUser.id);
        emailService.queueOrderAvailabilityConfirmed(order.id, body.reason);
        notifyOrderAvailability(db, order.id);
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
        notifyPaymentReviewed(db, order.id, "accepted");
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
        notifyPaymentReviewed(db, order.id, body.status, body.reason);
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
        return sendJson(response, 200, { dashboard: getAdminOperationDashboard(db, { month: url.searchParams.get("month") }) });
      }
      if (request.method === "GET" && url.pathname === "/api/admin/operation/reset-preview") {
        return sendJson(response, 200, { preview: getOperationalResetPreview(db) });
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
      if (request.method === "POST" && url.pathname === "/api/admin/operation/reset-operational-data") {
        const input = await readJson(request);
        if (String(input.confirmation || "").trim() !== OPERATIONAL_RESET_CONFIRMATION) {
          throw new ValidationError(`Para limpiar la base escribi exactamente: ${OPERATIONAL_RESET_CONFIRMATION}`);
        }
        const backup = createBackup({
          databasePath: config.databasePath,
          uploadsPath,
          backupPath: config.backupPath
        });
        const result = resetOperationalData(db, uploadsPath, input);
        return sendJson(response, 200, { result, backup: formatBackupSummary(backup) });
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
      if (request.method === "GET" && url.pathname === "/productos") {
        applyDuePriceUpdates(db);
        const analyticsSessionId = resolveServerAnalyticsSessionId(cookies.km_analytics_session);
        const productDirectory = renderProductDirectoryPage(listPublicProductsForSeo(db));
        recordServerAnalyticsEvent(db, request, currentUser, {
          eventType: "page_view",
          sessionId: analyticsSessionId,
          path: url.pathname,
          referrer: request.headers.referer || "",
          metadata: { source: "server", pageType: "product_directory" }
        });
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(productDirectory),
          "cache-control": "no-cache",
          ...SEO_SECURITY_HEADERS,
          "set-cookie": analyticsSessionCookie(analyticsSessionId, { secure: config.secureCookies })
        });
        response.end(productDirectory);
        return;
      }
      match = url.pathname.match(/^\/producto\/([a-z0-9-]+)$/);
      if (request.method === "GET" && match) {
        const body = "Esta ficha de producto fue retirada.";
        response.writeHead(410, {
          "content-type": "text/plain; charset=utf-8",
          "content-length": Buffer.byteLength(body),
          "cache-control": "no-cache",
          "x-robots-tag": "noindex, nofollow",
          ...SEO_SECURITY_HEADERS
        });
        response.end(body);
        return;
      }
      if (request.method === "GET" && url.pathname === "/" && String(request.headers.host || "").split(":")[0].toLowerCase() === "produccion.km-detail.com") {
        url.pathname = "/produccion.html";
      }
      if (request.method === "GET" && url.pathname === "/actualizar-app-produccion") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "clear-site-data": "\"cache\", \"storage\"",
          ...SECURITY_HEADERS
        });
        response.end("<!doctype html><html lang=\"es-AR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"refresh\" content=\"1;url=/produccion.html?version=14\"><title>Actualizando KM Producción</title></head><body style=\"margin:0;background:#0b0d0f;color:#fff;font-family:system-ui;display:grid;min-height:100vh;place-items:center;text-align:center\"><main><h1>Actualizando KM Producción</h1><p>La aplicación se abrirá nuevamente en un momento.</p></main></body></html>");
        return;
      }
      let staticHeaders = {};
      if (request.method === "GET" && /^(\/(?:admin|vendedor|logistica|produccion)\.html|\/(?:admin-production|vendedor|logistica|produccion|notifications)\.(?:js|css)|\/pwa-register\.js|\/portal-service-worker\.js|\/manifest-(?:admin|vendedor|logistica|produccion)\.webmanifest)$/.test(url.pathname)) {
        staticHeaders = { "cache-control": "no-store" };
      }
      if (request.method === "GET" && isServerRenderedSeoPath(url.pathname)) {
        const landingPage = renderSeoLandingPage(url.pathname, listPublicProductsForSeo(db));
        const analyticsSessionId = resolveServerAnalyticsSessionId(cookies.km_analytics_session);
        recordServerAnalyticsEvent(db, request, currentUser, {
          eventType: "page_view",
          sessionId: analyticsSessionId,
          path: url.pathname,
          referrer: request.headers.referer || "",
          metadata: { source: "server", pageType: "seo" }
        });
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(landingPage),
          "cache-control": "no-cache",
          ...SEO_SECURITY_HEADERS,
          "set-cookie": analyticsSessionCookie(analyticsSessionId, { secure: config.secureCookies })
        });
        response.end(landingPage);
        return;
      }
      if (request.method === "GET" && serveStatic(response, projectRoot, url.pathname, staticHeaders)) return;
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

function notifyOrderCreated(db, orderId) {
  const order = getOrderNotificationContext(db, orderId);
  if (!order) return;
  const label = `${order.order_number} · ${order.business_name}`;
  const common = {
    eventType: "order_created",
    priority: "action",
    body: label,
    entityType: "order",
    entityId: order.id
  };
  notifyAdmins(db, {
    ...common,
    title: "Nuevo pedido recibido",
    actionUrl: "/admin.html#orders",
    dedupeKey: `order-created-admin:${order.id}`
  });
  notifyAllLogistics(db, {
    ...common,
    title: "Pedido para confirmar disponibilidad",
    actionUrl: "/logistica.html",
    dedupeKey: `order-created-logistics:${order.id}`
  });
  notifySalesRep(db, order.sales_rep_id, {
    ...common,
    priority: "info",
    title: "Pedido registrado",
    actionUrl: "/vendedor.html",
    dedupeKey: `order-created-sales:${order.id}`
  });
}

function notifyCustomerStatusChanged(db, customerId, status) {
  const customer = getCustomerNotificationContext(db, customerId);
  if (!customer) return;
  const approved = status === "approved";
  const salesRepId = customer.sales_rep_id || customer.requested_by_sales_rep_id;
  notifySalesRep(db, salesRepId, {
    eventType: approved ? "customer_approved" : "customer_status_changed",
    priority: approved ? "info" : "action",
    title: approved ? "Alta comercial aprobada" : "Alta comercial actualizada",
    body: `${customer.business_name} · Estado: ${status}`,
    actionUrl: "/vendedor.html",
    entityType: "customer",
    entityId: customer.id,
    dedupeKey: `customer-status-sales:${customer.id}:${status}`
  });
  notifyCustomer(db, customer.id, {
    eventType: approved ? "customer_approved" : "customer_status_changed",
    priority: approved ? "info" : "action",
    title: approved ? "Tu cuenta comercial fue aprobada" : "KM actualizó el estado de tu cuenta",
    body: approved ? "Ya podés consultar precios y realizar pedidos." : "Ingresá para consultar el estado de tu solicitud.",
    actionUrl: approved ? "/#catalogo" : "/",
    entityType: "customer",
    entityId: customer.id,
    dedupeKey: `customer-status-customer:${customer.id}:${status}`
  });
}

function notifyOrderAvailability(db, orderId) {
  const order = getOrderNotificationContext(db, orderId);
  if (!order) return;
  const label = `${order.order_number} · ${order.business_name}`;
  const common = {
    eventType: "order_availability_confirmed",
    priority: "action",
    body: label,
    entityType: "order",
    entityId: order.id
  };
  notifyAdmins(db, {
    ...common,
    title: "Disponibilidad confirmada",
    actionUrl: "/admin.html#orders",
    dedupeKey: `availability-admin:${order.id}`
  });
  notifyCustomer(db, order.customer_id, {
    ...common,
    title: "KM revisó tu pedido",
    actionUrl: "/#mis-compras",
    dedupeKey: `availability-customer:${order.id}`
  });
  notifySalesRep(db, order.sales_rep_id, {
    ...common,
    priority: "info",
    title: "Disponibilidad confirmada",
    actionUrl: "/vendedor.html",
    dedupeKey: `availability-sales:${order.id}`
  });
}

function notifyPaymentUploaded(db, orderId) {
  const order = getOrderNotificationContext(db, orderId);
  if (!order) return;
  const common = {
    eventType: "payment_receipt_uploaded",
    priority: "action",
    body: `${order.order_number} · ${order.business_name}`,
    entityType: "order",
    entityId: order.id
  };
  notifyAdmins(db, {
    ...common,
    title: "Comprobante de pago para revisar",
    actionUrl: "/admin.html#orders",
    dedupeKey: `payment-uploaded-admin:${order.id}`
  });
  notifySalesRep(db, order.sales_rep_id, {
    ...common,
    priority: "info",
    title: "Cliente informó un pago",
    actionUrl: "/vendedor.html",
    dedupeKey: `payment-uploaded-sales:${order.id}`
  });
}

function notifyPaymentReviewed(db, orderId, status, reason = "") {
  const order = getOrderNotificationContext(db, orderId);
  if (!order) return;
  const accepted = ["accepted", "approved", "paid"].includes(String(status || "").toLowerCase());
  const common = {
    eventType: accepted ? "payment_accepted" : "payment_rejected",
    priority: accepted ? "info" : "action",
    body: reason || `${order.order_number} · ${order.business_name}`,
    entityType: "order",
    entityId: order.id
  };
  notifyCustomer(db, order.customer_id, {
    ...common,
    title: accepted ? "Pago confirmado por KM" : "Revisá el comprobante de pago",
    actionUrl: "/#mis-compras",
    dedupeKey: `payment-reviewed-customer:${order.id}:${accepted}`
  });
  notifySalesRep(db, order.sales_rep_id, {
    ...common,
    title: accepted ? "Pago confirmado" : "Comprobante observado",
    actionUrl: "/vendedor.html",
    dedupeKey: `payment-reviewed-sales:${order.id}:${accepted}`
  });
  if (accepted && order.payment_status === "paid") {
    notifyAllLogistics(db, {
      ...common,
      priority: "action",
      title: "Pago aprobado: preparar pedido",
      body: `${order.order_number} · ${order.business_name}`,
      actionUrl: "/logistica.html",
      dedupeKey: `payment-approved-logistics:${order.id}`
    });
  }
}

function notifyOrderDispatched(db, orderId) {
  const order = getOrderNotificationContext(db, orderId);
  if (!order) return;
  const common = {
    eventType: "order_dispatched",
    priority: "info",
    body: `${order.order_number} · ${order.business_name}`,
    entityType: "order",
    entityId: order.id
  };
  notifyCustomer(db, order.customer_id, {
    ...common,
    title: "Tu pedido fue despachado",
    actionUrl: "/#mis-compras",
    dedupeKey: `order-dispatched-customer:${order.id}`
  });
  notifyAdmins(db, {
    ...common,
    title: "Pedido despachado",
    actionUrl: "/admin.html#orders",
    dedupeKey: `order-dispatched-admin:${order.id}`
  });
  notifySalesRep(db, order.sales_rep_id, {
    ...common,
    title: "Pedido despachado",
    actionUrl: "/vendedor.html",
    dedupeKey: `order-dispatched-sales:${order.id}`
  });
}

function resolveServerAnalyticsSessionId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9-]{20,80}$/.test(normalized) ? normalized : randomUUID();
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
