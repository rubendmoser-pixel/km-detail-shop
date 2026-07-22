const adminState = {
  user: null, customers: [], products: [], families: [], selectedProductId: null, productImages: [],
  orders: [], selectedOrder: null, settings: null, emails: [], emailSummary: null, emailEnabled: false, emailProvider: "",
  securityEvents: [], securitySummary: null, salesReps: [], distributors: [], salesRepDashboard: null, salesRepProfile: null, selectedSalesRepId: null, salesPanel: "overview", pendingCommissions: [], commissionSettlements: [], selectedCustomerId: null,
  operationDashboard: null, operationMonth: new Date().toISOString().slice(0, 7), operationTab: "summary", operationProductSearch: "", analyticsDashboard: null, currentAccountFilter: "open", currentAccountOrderId: null, currentAccountPaymentsOpen: false, customerProductDiscounts: {}, paymentAccounts: [], customerPaymentAccounts: {}, customerShippingAddresses: {}, editingCustomerShippingAddress: {},
  priceProducts: [], priceCosts: null, priceProfitTargets: {}, priceDraft: {}, priceBatches: [], priceMode: "individual", priceFilter: "all",
  orderScope: "active", orderSearches: { active: "", history: "" }, logisticsOperators: [], unfulfilledDemand: null
};
const adminMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const PRODUCT_UPLOAD_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRODUCT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_UPLOAD_TARGET_BYTES = 900 * 1024;
const PRODUCT_UPLOAD_MAX_DIMENSION = 1600;
const PRODUCT_UPLOAD_WEBP_QUALITY = 0.82;
const PRODUCT_UPLOAD_JPEG_QUALITY = 0.86;
const adminViews = new Set(["customers", "sales", "logistics", "production", "production-access", "production-commissions", "production-materials", "production-product-stock", "production-valuation", "production-stock", "production-stock-parameters", "production-movements", "production-purchasing", "production-recipes", "production-costs", "production-suppliers", "commissions", "distributors", "products", "prices", "orders", "unfulfilled-demand", "accounts", "settings", "backups", "emails", "security", "analytics", "operation"]);
const UNFULFILLED_REASON_LABELS = {
  finished_stock_shortage: "Falta de producto terminado",
  material_shortage: "Falta de insumos para fabricar",
  production_delay: "Producción demorada",
  discontinued: "Producto discontinuado",
  commercial_agreement: "Cantidad corregida por acuerdo comercial",
  order_error: "Error en el pedido",
  other: "Otro motivo"
};
const statusLabels = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
  suspended: "Suspendido", inactive: "Inactivo"
};
const CUSTOMER_TAX_CONDITIONS = ["Responsable inscripto", "Monotributo", "Exento", "No responsable"];
const CUSTOMER_TYPES = ["Distribuidor", "Pintureria", "Comercio especializado", "Mayorista"];
const ARGENTINA_PROVINCES = [
  "Buenos Aires", "Ciudad Autonoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Cordoba", "Corrientes",
  "Entre Rios", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquen", "Rio Negro",
  "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucuman"
];
const orderStatusLabels = {
  order_created: "Pedido recibido por KM",
  availability_confirmed: "Disponibilidad confirmada",
  confirmed: "Pedido confirmado",
  in_preparation: "Disponibilidad confirmada",
  ready: "Preparado para despacho",
  delivered: "Operacion cerrada",
  cancelled: "Cancelado"
};
const paymentStatusLabels = {
  pending_payment: "Pago pendiente",
  receipt_uploaded: "Comprobante cargado",
  credit_account: "Cuenta corriente",
  settled_adjustment: "Cerrado con ajuste",
  overdue: "Vencido",
  paid: "Pago acreditado",
  rejected: "Pago rechazado"
};
const fulfillmentStatusLabels = {
  pending: "Preparación pendiente",
  ready: "Preparado para despacho",
  shipped: "Despachado",
  delivered: "Recibido por cliente"
};

const orderStateClasses = {
  order_created: "neutral",
  availability_confirmed: "info",
  confirmed: "success",
  in_preparation: "progress",
  ready: "success",
  delivered: "closed",
  cancelled: "danger"
};
const paymentStateClasses = {
  pending_payment: "warning",
  receipt_uploaded: "progress",
  credit_account: "info",
  settled_adjustment: "closed",
  overdue: "danger",
  paid: "success",
  rejected: "danger"
};
const fulfillmentStateClasses = {
  pending: "neutral",
  ready: "success",
  shipped: "progress",
  delivered: "done"
};

const ADMIN_ICON_PATHS = {
  menu: `<path d="M4 6h16M4 12h16M4 18h16"/>`,
  x: `<path d="M18 6 6 18M6 6l12 12"/>`,
  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>`,
  "user-round": `<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>`,
  truck: `<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>`,
  coins: `<circle cx="8" cy="8" r="6"/><path d="M18.1 8.7A6 6 0 1 1 9.3 18M8 5v6M6 7h3a2 2 0 0 1 0 4H6"/>`,
  building: `<path d="M3 21h18M6 21V4h12v17M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>`,
  package: `<path d="m7.5 4.27 9 5.15M3.27 6.96 12 12l8.73-5.04M12 22V12"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>`,
  tags: `<path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4L12 22l10-10Z"/><circle cx="7.5" cy="7.5" r="1.5"/>`,
  "clipboard-list": `<rect width="14" height="18" x="5" y="3" rx="2"/><path d="M9 3V1h6v2M9 11h6M9 15h6"/>`,
  wallet: `<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h2"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.93V21h-4v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10.07 3H14v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>`,
  mail: `<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>`,
  activity: `<path d="M3 12h4l3-9 4 18 3-9h4"/>`,
  "layout-dashboard": `<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>`,
  database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>`,
  refresh: `<path d="M21 12a9 9 0 0 0-15.2-6.5L3 8M3 3v5h5M3 12a9 9 0 0 0 15.2 6.5L21 16M16 16h5v5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>`,
  eye: `<path d="M2.1 12a10.7 10.7 0 0 1 19.8 0 10.7 10.7 0 0 1-19.8 0Z"/><circle cx="12" cy="12" r="3"/>`,
  pencil: `<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>`,
  trash: `<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>`,
  check: `<path d="m20 6-11 11-5-5"/>`,
  login: `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>`
};

const ADMIN_VIEW_ICONS = {
  customers: "users", sales: "user-round", logistics: "truck", production: "package", "production-access": "users", "production-commissions": "coins", "production-materials": "package", "production-product-stock": "package", "production-stock": "package", "production-stock-parameters": "settings", "production-movements": "activity", "production-purchasing": "clipboard-list", "production-recipes": "clipboard-list", "production-costs": "coins", "production-suppliers": "building", commissions: "coins", distributors: "building",
  products: "package", prices: "tags", orders: "clipboard-list", "unfulfilled-demand": "activity", "production-valuation": "coins", accounts: "wallet", settings: "settings", backups: "database",
  emails: "mail", security: "shield", analytics: "activity", operation: "layout-dashboard"
};

function adminIconSvg(name) {
  const paths = ADMIN_ICON_PATHS[name] || ADMIN_ICON_PATHS.plus;
  return `<svg class="admin-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function adminIconName(element) {
  if (element.matches?.("[data-toggle-password], .seller-qty button")) return "";
  if (element.dataset?.adminView) return ADMIN_VIEW_ICONS[element.dataset.adminView] || "layout-dashboard";
  if (element.dataset?.orderScope === "active") return "clipboard-list";
  if (element.dataset?.orderScope === "history") return "activity";
  if (element.classList?.contains("toolbar-refresh-button")) return "refresh";
  if (element.classList?.contains("danger-button") || element.classList?.contains("danger-soft")) return "trash";
  const text = String(element.textContent || "").trim().toLocaleLowerCase("es");
  if (/^(cerrar|cancelar|ocultar)/.test(text)) return "x";
  if (/^(actualizar|reintentar)/.test(text)) return "refresh";
  if (/^(crear|nuevo|agregar)/.test(text)) return "plus";
  if (/^(guardar|programar)/.test(text)) return "save";
  if (/^(confirmar|aprobar|registrar|enviar)/.test(text)) return "check";
  if (/^(ver|abrir|detalle)/.test(text)) return "eye";
  if (/^editar/.test(text)) return "pencil";
  if (/^(eliminar|borrar|limpiar)/.test(text)) return "trash";
  if (/^ingresar/.test(text)) return "login";
  return "";
}

function decorateAdminIcons(root = document) {
  const elements = [];
  if (root.matches?.("button, a.ghost-button, a.primary-button")) elements.push(root);
  elements.push(...(root.querySelectorAll?.("button, a.ghost-button, a.primary-button") || []));
  elements.forEach((element) => {
    if (element.querySelector(":scope > .admin-ui-icon")) return;
    const icon = adminIconName(element);
    if (!icon) return;
    element.insertAdjacentHTML("afterbegin", adminIconSvg(icon));
    element.classList.add("admin-icon-button");
    const text = String(element.textContent || "").trim().toLocaleLowerCase("es");
    if (/^(confirmar|aprobar|registrar|enviar)/.test(text)) element.classList.add("admin-action-success");
    if (/^(ver|abrir|detalle)/.test(text)) element.classList.add("admin-action-info");
  });
}

function observeAdminIcons() {
  decorateAdminIcons(document);
  new MutationObserver((records) => records.forEach((record) => {
    if (record.target instanceof Element) decorateAdminIcons(record.target);
  })).observe(document.body, { childList: true, subtree: true });
}

const orderStageLabels = {
  review_availability: "Revisar disponibilidad",
  awaiting_acceptance: "Esperando aceptación",
  awaiting_payment: "Esperando pago",
  ready_to_prepare: "Listo para preparar",
  preparing: "En preparación logística",
  prepared: "Preparado para despacho",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado"
};

const orderStageClasses = {
  review_availability: "info",
  awaiting_acceptance: "warning",
  awaiting_payment: "warning",
  ready_to_prepare: "success",
  preparing: "success",
  prepared: "success",
  shipped: "progress",
  delivered: "done",
  cancelled: "danger"
};

const adminEls = Object.fromEntries([
  "adminSession", "adminEmail", "adminLoginPanel", "adminLoginForm", "adminLoginMessage",
  "adminWorkspace", "adminNavToggle", "adminTabs", "customerSearch", "customerStatusFilter", "customerStats", "customerList", "toggleCustomerCreate",
  "customerCreatePanel", "customerCreateForm", "customerCreateMessage", "cancelCustomerCreate", "ordersTableBody",
  "orderSearch", "orderStageFilter", "orderPaymentFilter", "orderOpsStats", "orderScopeTabs", "activeOrdersCount", "historyOrdersCount",
  "unfulfilledDemandSearch", "unfulfilledDemandFrom", "unfulfilledDemandTo", "unfulfilledDemandReason", "reloadUnfulfilledDemand", "unfulfilledDemandSummary", "unfulfilledDemandList",
  "orderDetailPanel", "orderDetailTitle", "orderDetailSummary", "orderDetailActions", "orderNextStep", "orderItemsBody",
  "orderHistoryPanel",
  "availabilityForm", "availabilityPaymentCondition", "availabilityTermsField", "availabilityMessage", "paymentReviewPanel", "fulfillmentForm", "fulfillmentQuickActions", "fulfillmentSubmit", "fulfillmentMessage",
  "orderStatusForm", "orderStatusMessage", "orderAdvancedPanel",
  "productSearch", "productFamilyFilter", "productStatusFilter", "productsTableBody", "productListPanel", "productResultCount", "productForm",
  "productFormTitle", "productMessage", "closeProductForm", "familyNameOptions", "productImageInput", "productImages",
  "productImagesNote", "settingsForm", "settingsMessage", "paymentAccountForm", "paymentAccountMessage", "paymentAccountList",
  "reloadPrices", "priceModeButtons", "individualPricePanel", "linearPricePanel", "priceEffectiveDate", "fillUnchangedPrices",
  "clearPriceDraft", "saveIndividualPrices", "priceUpdateStats", "priceUpdateFilters", "priceUpdateList", "priceUpdateMessage", "priceProfitConditions",
  "linearPriceEffectiveDate", "linearPricePercent", "linearPricePreview", "linearPriceMessage", "saveLinearPrices", "priceUpdateHistory",
  "salesRepPicker", "salesRepStatusFilter", "reloadSalesReps", "salesPanelNav", "salesRepAdminSummary", "salesRepForm", "salesRepFormTitle",
  "salesRepMessage", "salesRepsTableBody", "salesRepDashboard", "salesRepProfile", "commissionSalesRepFilter", "commissionNotes", "reloadCommissions",
  "createCommissionSettlement", "commissionSummary", "commissionsTableBody", "selectAllCommissions", "commissionSettlements",
  "distributorSearch", "distributorStatusFilter", "reloadDistributors", "distributorForm", "distributorFormTitle", "distributorMessage", "distributorsTableBody",
  "emailSearch", "emailStats", "emailConfigStatus", "emailsTableBody",
  "securitySearch", "securityStats", "securityTableBody", "currentAccountSearch", "currentAccountDashboard",
  "logisticsOperatorsList", "logisticsOperatorForm", "logisticsOperatorFormTitle", "logisticsOperatorMessage",
  "analyticsDays", "analyticsDashboard", "operationDashboard", "operationMonth", "operationReportTabs", "backupDashboard", "deleteTestOrdersForm", "deleteTestOrdersMessage", "adminToast"
].map((id) => [id, document.querySelector(`#${id}`)]));

async function initAdmin() {
  observeAdminIcons();
  bindAdminEvents();
  syncOrderScopeControls();
  try {
    const { user } = await adminApi("/api/me");
    if (user.role !== "admin") throw new Error("Esta cuenta no tiene permisos administrativos.");
    adminState.user = user;
    await enterWorkspace();
  } catch (error) {
    adminEls.adminLoginMessage.textContent = error.status === 401 ? "" : error.message;
  }
}

function bindAdminEvents() {
  const on = (element, eventName, handler) => element?.addEventListener?.(eventName, handler);
  const byId = (selector) => document.querySelector(selector);

  setupAdminPasswordToggles();
  on(adminEls.adminNavToggle, "click", () => setAdminNavOpen(adminEls.adminNavToggle.getAttribute("aria-expanded") !== "true"));
  on(adminEls.adminLoginForm, "submit", loginAdmin);
  on(byId("#adminLogout"), "click", logoutAdmin);
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showAdminView(button.dataset.adminView)));
  on(window, "hashchange", () => showAdminView(currentAdminView(), false));
  on(adminEls.customerSearch, "input", debounce(loadCustomers, 250));
  on(adminEls.customerStatusFilter, "change", loadCustomers);
  on(byId("#reloadCustomers"), "click", loadCustomers);
  on(adminEls.toggleCustomerCreate, "click", toggleCustomerCreatePanel);
  on(adminEls.cancelCustomerCreate, "click", () => toggleCustomerCreatePanel(false));
  on(adminEls.customerCreateForm, "submit", createCustomerFromAdmin);
  on(adminEls.customerCreateForm?.elements.paymentCondition, "change", syncCustomerCreatePaymentForm);
  on(adminEls.productSearch, "input", debounce(loadProducts, 250));
  on(adminEls.productFamilyFilter, "change", loadProducts);
  on(adminEls.productStatusFilter, "change", loadProducts);
  on(byId("#reloadProducts"), "click", loadProducts);
  on(byId("#newProduct"), "click", openNewProductEditor);
  on(byId("#resetProductForm"), "click", resetProductForm);
  on(adminEls.closeProductForm, "click", closeProductEditor);
  on(adminEls.productForm, "submit", saveProduct);
  on(productField("familyName"), "change", syncSelectedFamilyDescription);
  on(productField("familyName"), "blur", syncSelectedFamilyDescription);
  on(adminEls.productImageInput, "change", uploadProductImages);
  on(adminEls.reloadPrices, "click", loadPriceUpdates);
  on(adminEls.priceModeButtons, "click", handlePriceModeClick);
  on(adminEls.priceUpdateFilters, "click", handlePriceFilterClick);
  on(adminEls.priceUpdateList, "input", handlePriceUpdateChange);
  on(adminEls.priceUpdateList, "input", handlePriceProfitTargetChange);
  on(adminEls.fillUnchangedPrices, "click", fillUnchangedPriceDraft);
  on(adminEls.clearPriceDraft, "click", clearPriceDraft);
  on(adminEls.saveIndividualPrices, "click", saveIndividualPriceUpdate);
  on(adminEls.linearPricePercent, "input", renderLinearPricePreview);
  on(adminEls.linearPriceEffectiveDate, "change", renderLinearPricePreview);
  on(adminEls.saveLinearPrices, "click", saveLinearPriceUpdate);
  on(adminEls.priceUpdateHistory, "click", openScheduledPriceList);
  on(adminEls.orderSearch, "input", debounce(loadOrders, 250));
  on(adminEls.logisticsOperatorForm, "submit", saveLogisticsOperator);
  on(byId("#reloadLogisticsOperators"), "click", loadLogisticsOperators);
  on(byId("#resetLogisticsOperatorForm"), "click", resetLogisticsOperatorForm);
  on(byId("#copyLogisticsPassword"), "click", copyLogisticsPassword);
  on(adminEls.logisticsOperatorsList, "click", editLogisticsOperator);
  on(adminEls.orderScopeTabs, "click", handleOrderScopeClick);
  on(adminEls.orderStageFilter, "change", loadOrders);
  on(adminEls.orderPaymentFilter, "change", loadOrders);
  on(byId("#reloadOrders"), "click", loadOrders);
  on(adminEls.ordersTableBody, "click", handleOrdersTableClick);
  on(adminEls.unfulfilledDemandSearch, "input", debounce(loadUnfulfilledDemand, 250));
  on(adminEls.unfulfilledDemandFrom, "change", loadUnfulfilledDemand);
  on(adminEls.unfulfilledDemandTo, "change", loadUnfulfilledDemand);
  on(adminEls.unfulfilledDemandReason, "change", loadUnfulfilledDemand);
  on(adminEls.reloadUnfulfilledDemand, "click", loadUnfulfilledDemand);
  on(adminEls.unfulfilledDemandList, "click", (event) => {
    const button = event.target.closest("[data-demand-order]");
    if (!button) return;
    showAdminView("orders");
    openOrderDetail(Number(button.dataset.demandOrder));
  });
  on(byId("#closeOrderDetail"), "click", closeOrderDetail);
  on(adminEls.availabilityForm, "submit", saveAvailability);
  on(adminEls.availabilityPaymentCondition, "change", syncAvailabilityPaymentFields);
  on(adminEls.fulfillmentForm, "submit", saveFulfillment);
  on(adminEls.orderStatusForm, "submit", saveOrderStatus);
  on(adminEls.emailSearch, "input", debounce(loadEmails, 250));
  on(byId("#reloadEmails"), "click", loadEmails);
  on(byId("#flushEmails"), "click", flushEmails);
  on(adminEls.securitySearch, "input", debounce(loadSecurityEvents, 250));
  on(byId("#reloadSecurity"), "click", loadSecurityEvents);
  on(adminEls.analyticsDays, "change", loadAnalyticsDashboard);
  on(byId("#reloadAnalyticsDashboard"), "click", loadAnalyticsDashboard);
  on(adminEls.analyticsDashboard, "click", handleAnalyticsDashboardClick);
  on(adminEls.salesRepPicker, "change", renderSalesReps);
  on(adminEls.salesRepStatusFilter, "change", loadSalesReps);
  on(adminEls.reloadSalesReps, "click", loadSalesReps);
  on(adminEls.salesRepForm, "submit", saveSalesRep);
  on(adminEls.salesRepForm?.elements.portalAccessEnabled, "change", syncSalesRepPortalAccess);
  on(adminEls.salesRepForm?.elements.portalPassword, "input", syncSalesRepPortalAccess);
  on(adminEls.salesRepForm?.elements.portalPasswordConfirmation, "input", syncSalesRepPortalAccess);
  on(byId("#copySalesRepPassword"), "click", copySalesRepPassword);
  on(adminEls.salesPanelNav, "click", handleSalesPanelNavClick);
  on(adminEls.salesRepDashboard, "click", handleSalesRepDashboardClick);
  on(adminEls.salesRepProfile, "click", handleSalesRepProfileClick);
  on(byId("#resetSalesRepForm"), "click", resetSalesRepForm);
  on(adminEls.commissionSalesRepFilter, "change", loadSalesCommissions);
  on(adminEls.reloadCommissions, "click", loadSalesCommissions);
  on(adminEls.createCommissionSettlement, "click", createCommissionSettlement);
  on(adminEls.selectAllCommissions, "change", toggleAllCommissions);
  on(adminEls.commissionsTableBody, "change", renderCommissionSummary);
  on(adminEls.commissionSettlements, "click", handleCommissionSettlementClick);
  setSalesPanel(adminState.salesPanel);
  on(adminEls.distributorSearch, "input", debounce(loadDistributors, 250));
  on(adminEls.distributorStatusFilter, "change", loadDistributors);
  on(adminEls.reloadDistributors, "click", loadDistributors);
  on(adminEls.distributorForm, "submit", saveDistributor);
  on(adminEls.distributorsTableBody, "click", handleDistributorsTableClick);
  on(byId("#resetDistributorForm"), "click", resetDistributorForm);
  on(byId("#reloadSettings"), "click", loadSettings);
  on(adminEls.settingsForm, "submit", saveSettings);
  on(adminEls.paymentAccountForm, "submit", savePaymentAccount);
  on(byId("#resetPaymentAccountForm"), "click", resetPaymentAccountForm);
  on(adminEls.paymentAccountList, "click", handlePaymentAccountListClick);
  on(adminEls.currentAccountSearch, "input", debounce(() => renderCurrentAccountDashboard(), 200));
  on(byId("#reloadCurrentAccounts"), "click", loadOperationDashboard);
  on(adminEls.currentAccountDashboard, "click", handleCurrentAccountClick);
  on(adminEls.currentAccountDashboard, "submit", handleCurrentAccountSubmit);
  on(byId("#reloadOperationDashboard"), "click", loadOperationDashboard);
  on(adminEls.operationMonth, "change", () => { adminState.operationMonth = adminEls.operationMonth.value; loadOperationDashboard(); });
  on(adminEls.operationReportTabs, "click", (event) => { const button=event.target.closest("[data-operation-tab]"); if(!button)return; adminState.operationTab=button.dataset.operationTab; renderOperationDashboard(adminState.operationDashboard); });
  on(adminEls.operationDashboard, "click", handleOperationDashboardClick);
  on(adminEls.operationDashboard, "input", debounce((event) => { if(!event.target.matches("[data-operation-product-search]"))return; adminState.operationProductSearch=event.target.value; renderOperationDashboard(adminState.operationDashboard); adminEls.operationDashboard.querySelector("[data-operation-product-search]")?.focus(); }, 180));
  on(byId("#reloadBackups"), "click", loadOperationDashboard);
  on(adminEls.backupDashboard, "click", handleBackupDashboardClick);
  on(adminEls.deleteTestOrdersForm, "submit", deleteTestOrders);
  on(document, "click", (event) => {
    if (adminEls.adminNavToggle?.getAttribute("aria-expanded") !== "true") return;
    if (event.target.closest("#adminNavToggle, #adminTabs")) return;
    setAdminNavOpen(false);
  });
  on(document, "keydown", (event) => {
    if (event.key === "Escape") closeAdminExpandedContent();
  });
}

function setAdminNavOpen(open) {
  const isOpen = Boolean(open);
  adminEls.adminTabs?.classList.toggle("is-open", isOpen);
  adminEls.adminNavToggle?.setAttribute("aria-expanded", String(isOpen));
  if (adminEls.adminNavToggle) {
    adminEls.adminNavToggle.innerHTML = `${adminIconSvg(isOpen ? "x" : "menu")}${isOpen ? "Cerrar" : "Secciones"}`;
    adminEls.adminNavToggle.classList.add("admin-icon-button");
  }
}

function closeAdminExpandedContent() {
  setAdminNavOpen(false);
  document.querySelectorAll("details[open]").forEach((details) => { details.open = false; });
  if (adminEls.productForm && !adminEls.productForm.hidden) closeProductEditor();
  if (adminEls.customerCreatePanel && !adminEls.customerCreatePanel.hidden) toggleCustomerCreatePanel(false);
  if (adminState.selectedOrder) closeOrderDetail();
  if (adminState.currentAccountOrderId) {
    adminState.currentAccountOrderId = null;
    adminState.currentAccountPaymentsOpen = false;
    renderCurrentAccountDashboard();
  }
}

function setupAdminPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(button.dataset.togglePassword || "");
      if (!input) return;
      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      button.textContent = willShow ? "Ocultar" : "Ver";
      button.setAttribute("aria-label", willShow ? "Ocultar contrasena" : "Mostrar contrasena");
      button.setAttribute("aria-pressed", String(willShow));
      button.title = willShow ? "Ocultar contrasena" : "Mostrar contrasena";
    });
  });
}

async function loginAdmin(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.adminLoginForm));
  setBusy(adminEls.adminLoginForm, true);
  try {
    const { user } = await adminApi("/api/auth/login", { method: "POST", body: values });
    if (user.role !== "admin") {
      await adminApi("/api/auth/logout", { method: "POST" });
      throw new Error("Esta cuenta no tiene permisos administrativos.");
    }
    adminState.user = user;
    adminEls.adminLoginMessage.textContent = "";
    await enterWorkspace();
  } catch (error) {
    window.KMForms?.showApiError(adminEls.adminLoginForm, error, adminEls.adminLoginMessage);
  } finally {
    setBusy(adminEls.adminLoginForm, false);
  }
}

async function enterWorkspace() {
  adminEls.adminLoginPanel.hidden = true;
  adminEls.adminWorkspace.hidden = false;
  adminEls.adminSession.hidden = false;
  adminEls.adminEmail.textContent = adminState.user.email;
  await loadAdminSection("vendedores", loadSalesReps);
  await Promise.all([
    ["clientes", loadCustomers],
    ["distribuidores", loadDistributors],
    ["productos", loadProducts],
    ["precios", loadPriceUpdates],
    ["pedidos", loadOrders],
    ["demanda no atendida", loadUnfulfilledDemand],
    ["operarios", loadLogisticsOperators],
    ["configuracion", loadSettings],
    ["emails", loadEmails],
    ["seguridad", loadSecurityEvents],
    ["actividad", loadAnalyticsDashboard],
    ["operacion", loadOperationDashboard]
  ].map(([label, loader]) => loadAdminSection(label, loader)));
  showAdminView(currentAdminView(), false);
  const requestedOrderId = Number(new URLSearchParams(window.location.search).get("order") || 0);
  if (requestedOrderId) await openOrderDetail(requestedOrderId);
  resetProductForm();
  closeProductEditor();
  resetSalesRepForm();
  resetLogisticsOperatorForm();
  resetDistributorForm();
}

async function loadAdminSection(label, loader) {
  try {
    await loader();
  } catch (error) {
    console.warn(`No se pudo cargar ${label}:`, error);
    showAdminToast(`No se pudo cargar ${label}. Actualiza esa seccion.`);
  }
}

async function logoutAdmin() {
  await adminApi("/api/auth/logout", { method: "POST" });
  adminState.user = null;
  adminEls.adminWorkspace.hidden = true;
  adminEls.adminSession.hidden = true;
  adminEls.adminLoginPanel.hidden = false;
  adminEls.adminLoginForm.reset();
}

function currentAdminView() {
  const view = window.location.hash.replace("#", "");
  return adminViews.has(view) ? view : "customers";
}

function showAdminView(view, updateHash = true) {
  const targetView = adminViews.has(view) ? view : "customers";
  setAdminNavOpen(false);
  document.querySelectorAll("details[open]").forEach((details) => { details.open = false; });
  if (targetView !== "products" && adminEls.productForm && !adminEls.productForm.hidden) closeProductEditor();
  if (updateHash && window.location.hash !== `#${targetView}`) window.location.hash = targetView;
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === targetView));
  document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== `${targetView}View`; });
  document.dispatchEvent(new CustomEvent("admin:viewchange", { detail: { view: targetView } }));
  document.querySelectorAll(`#${targetView}View .orders-table-wrap, #${targetView}View .customer-table-wrap`).forEach((container) => {
    container.scrollLeft = 0;
  });
  if (targetView === "commissions") loadSalesCommissions().catch((error) => showAdminToast(error.message));
  if (targetView === "prices" && !adminState.priceProducts.length) loadPriceUpdates().catch((error) => showAdminToast(error.message));
  if (targetView === "unfulfilled-demand") loadUnfulfilledDemand().catch((error) => showAdminToast(error.message));
}

async function loadCustomers() {
  const params = new URLSearchParams();
  if (adminEls.customerSearch.value.trim()) params.set("q", adminEls.customerSearch.value.trim());
  if (adminEls.customerStatusFilter.value) params.set("status", adminEls.customerStatusFilter.value);
  const { customers } = await adminApi(`/api/admin/customers${params.toString() ? `?${params}` : ""}`);
  adminState.customers = customers;
  if (adminState.selectedCustomerId && !customers.some((customer) => customer.id === adminState.selectedCustomerId)) {
    adminState.selectedCustomerId = null;
  }
  renderCustomerStats();
  renderCustomers();
}

async function loadSalesReps() {
  const params = new URLSearchParams();
  if (adminEls.salesRepStatusFilter?.value) params.set("status", adminEls.salesRepStatusFilter.value);
  const { salesReps } = await adminApi(`/api/admin/sales-reps${params.toString() ? `?${params}` : ""}`);
  adminState.salesReps = salesReps;
  renderSalesRepPicker();
  refreshCustomerCreateSalesReps();
  renderSalesRepAdminSummary();
  renderSalesReps();
  renderCommissionSalesRepFilter();
  if (currentAdminView() === "commissions") await loadSalesCommissions();
  renderCustomers();
}

async function loadLogisticsOperators() {
  if (!adminEls.logisticsOperatorsList) return;
  const { operators } = await adminApi("/api/admin/logistics-operators");
  adminState.logisticsOperators = operators || [];
  adminEls.logisticsOperatorsList.innerHTML = adminState.logisticsOperators.length ? adminState.logisticsOperators.map((operator) => `
    <article class="sales-rep-card">
      <div><strong>${escapeAdmin(operator.name)}</strong><span>${escapeAdmin(operator.email)}</span><small>${operator.status === "active" ? "Activo" : "Inactivo"} · ${operator.has_portal_access ? "Acceso habilitado" : "Sin acceso"}</small></div>
      <button class="ghost-button" type="button" data-edit-logistics="${operator.id}">Editar</button>
    </article>`).join("") : `<p class="admin-note">Todavía no hay operarios registrados.</p>`;
}

function editLogisticsOperator(event) {
  const button = event.target.closest("[data-edit-logistics]");
  if (!button) return;
  const operator = adminState.logisticsOperators.find((row) => row.id === Number(button.dataset.editLogistics));
  if (!operator) return;
  const form = adminEls.logisticsOperatorForm;
  form.elements.id.value = operator.id;
  form.elements.name.value = operator.name;
  form.elements.email.value = operator.email;
  form.elements.phone.value = operator.phone || "";
  form.elements.status.value = operator.status;
  form.elements.portalAccessEnabled.checked = Boolean(operator.has_portal_access);
  form.elements.portalPassword.value = "";
  form.elements.portalPasswordConfirmation.value = "";
  form.elements.notes.value = operator.notes || "";
  adminEls.logisticsOperatorFormTitle.textContent = `Editar ${operator.name}`;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetLogisticsOperatorForm() {
  const form = adminEls.logisticsOperatorForm;
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.status.value = "active";
  form.elements.portalAccessEnabled.checked = true;
  adminEls.logisticsOperatorFormTitle.textContent = "Nuevo operario";
  adminEls.logisticsOperatorMessage.textContent = "";
}

async function copyLogisticsPassword() {
  const password = adminEls.logisticsOperatorForm?.elements.portalPassword?.value || "";
  if (!password) return showAdminToast("Ingresá una clave antes de copiarla.");
  try { await navigator.clipboard.writeText(password); showAdminToast("Clave copiada."); }
  catch { adminEls.logisticsOperatorForm.elements.portalPassword.type = "text"; adminEls.logisticsOperatorForm.elements.portalPassword.select(); }
}

async function saveLogisticsOperator(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  if (values.portalPassword !== values.portalPasswordConfirmation) {
    form.elements.portalPasswordConfirmation.setCustomValidity("Las claves no coinciden.");
    form.reportValidity();
    form.elements.portalPasswordConfirmation.setCustomValidity("");
    return;
  }
  setBusy(form, true);
  try {
    await adminApi("/api/admin/logistics-operators", { method: "POST", body: {
      id: values.id ? Number(values.id) : undefined, name: values.name, email: values.email, phone: values.phone,
      status: values.status, notes: values.notes, portalPassword: values.portalPassword,
      portalAccessEnabled: form.elements.portalAccessEnabled.checked
    }});
    resetLogisticsOperatorForm();
    adminEls.logisticsOperatorMessage.textContent = "Operario guardado correctamente.";
    adminEls.logisticsOperatorMessage.classList.add("is-success");
    await loadLogisticsOperators();
  } catch (error) { window.KMForms?.showApiError(form, error, adminEls.logisticsOperatorMessage); }
  finally { setBusy(form, false); }
}

function handleSalesPanelNavClick(event) {
  const button = event.target.closest("[data-sales-panel-target]");
  if (!button) return;
  setSalesPanel(button.dataset.salesPanelTarget);
}

function setSalesPanel(panel = "overview") {
  adminState.salesPanel = panel;
  document.querySelectorAll("[data-sales-panel]").forEach((section) => {
    section.hidden = section.dataset.salesPanel !== panel;
  });
  adminEls.salesPanelNav?.querySelectorAll("[data-sales-panel-target]").forEach((button) => {
    const isActive = button.dataset.salesPanelTarget === panel;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderSalesReps() {
  if (!adminEls.salesRepsTableBody) return;
  const selectedRepId = Number(adminEls.salesRepPicker?.value || 0);
  const reps = selectedRepId ? adminState.salesReps.filter((rep) => rep.id === selectedRepId) : adminState.salesReps;
  adminEls.salesRepsTableBody.innerHTML = reps.length ? reps.map((rep) => `
    <article class="sales-rep-admin-card" data-sales-rep-id="${rep.id}">
      <div class="sales-rep-card-main">
        <div>
          <p class="eyebrow">Vendedor</p>
          <h4>${escapeAdmin(rep.name)}</h4>
          <p>${escapeAdmin(rep.email)}</p>
        </div>
        <div class="sales-rep-card-badges">
          <span class="status-badge ${rep.status === "active" ? "approved" : "suspended"}">${rep.status === "active" ? "Activo" : "Inactivo"}</span>
          <span class="status-badge ${Number(rep.has_portal_access || 0) ? "approved" : "pending"}">${Number(rep.has_portal_access || 0) ? "Portal activo" : "Sin clave"}</span>
        </div>
      </div>
      <div class="sales-rep-card-grid">
        <div><span>Telefono</span><strong>${escapeAdmin(rep.phone || "-")}</strong></div>
        <div><span>WhatsApp</span><strong>${escapeAdmin(rep.whatsapp || "-")}</strong></div>
        <div><span>Comision general</span><strong>${formatBps(rep.default_commission_bps)}</strong></div>
        <div><span>Banco</span><strong>${escapeAdmin(rep.bank_name || "Sin banco")}</strong><small>${escapeAdmin(rep.bank_alias || rep.bank_cbu || "-")}</small></div>
      </div>
      <div class="sales-rep-card-actions">
        <button class="ghost-button toolbar-create-button" type="button" data-edit-sales-rep="${rep.id}">Editar vendedor</button>
      </div>
    </article>
  `).join("") : `<p class="admin-note">No hay vendedores para el filtro seleccionado.</p>`;
  adminEls.salesRepsTableBody.querySelectorAll("[data-edit-sales-rep]").forEach((button) => button.addEventListener("click", editSalesRep));
}

function renderSalesRepPicker() {
  if (!adminEls.salesRepPicker) return;
  const current = adminEls.salesRepPicker.value;
  adminEls.salesRepPicker.innerHTML = [
    `<option value="">Todos los vendedores</option>`,
    ...adminState.salesReps.map((rep) => `<option value="${rep.id}">${escapeAdmin(rep.name)}${rep.status === "active" ? "" : " - inactivo"}</option>`)
  ].join("");
  adminEls.salesRepPicker.value = adminState.salesReps.some((rep) => String(rep.id) === current) ? current : "";
}

function renderSalesRepAdminSummary() {
  if (!adminEls.salesRepAdminSummary) return;
  const total = adminState.salesReps.length;
  const active = adminState.salesReps.filter((rep) => rep.status === "active").length;
  const inactive = adminState.salesReps.filter((rep) => rep.status !== "active").length;
  const portal = adminState.salesReps.filter((rep) => Number(rep.has_portal_access || 0)).length;
  const missingBank = adminState.salesReps.filter((rep) => !rep.bank_name && !rep.bank_cbu && !rep.bank_alias).length;
  adminEls.salesRepAdminSummary.innerHTML = `
    <div><span>Total</span><strong>${total}</strong><small>Vendedores registrados</small></div>
    <div><span>Activos</span><strong>${active}</strong><small>Disponibles para asignar clientes</small></div>
    <div><span>Inactivos</span><strong>${inactive}</strong><small>Fuera de operacion</small></div>
    <div><span>Portal</span><strong>${portal}</strong><small>Con clave de acceso</small></div>
    <div><span>Banco</span><strong>${missingBank}</strong><small>Sin datos de liquidacion</small></div>
  `;
}

async function loadSalesRepDashboard() {
  if (!adminEls.salesRepDashboard) return;
  const { dashboard } = await adminApi("/api/admin/sales-reps/dashboard");
  adminState.salesRepDashboard = dashboard;
  const reps = dashboard.reps || [];
  if (adminState.selectedSalesRepId && !reps.some((rep) => rep.id === adminState.selectedSalesRepId)) {
    adminState.selectedSalesRepId = null;
  }
  if (!adminState.selectedSalesRepId && reps.length) adminState.selectedSalesRepId = reps[0].id;
  renderSalesRepDashboard();
  if (adminState.selectedSalesRepId) await loadSalesRepProfile(adminState.selectedSalesRepId);
  else renderSalesRepProfile(null);
}

function renderSalesRepDashboard() {
  if (!adminEls.salesRepDashboard) return;
  const dashboard = adminState.salesRepDashboard;
  if (!dashboard) {
    adminEls.salesRepDashboard.innerHTML = "";
    return;
  }
  const summary = dashboard.summary || {};
  const reps = dashboard.reps || [];
  adminEls.salesRepDashboard.innerHTML = `
    <div class="sales-dashboard-cards">
      ${salesDashboardCard("Vendedores activos", summary.activeSalesReps || 0, "Equipo disponible")}
      ${salesDashboardCard("Clientes asignados", summary.assignedCustomers || 0, "Cartera comercial")}
      ${salesDashboardCard("Ventas del mes", adminMoney.format((summary.monthTotalCents || 0) / 100), `${summary.monthOrders || 0} pedidos`)}
      ${salesDashboardCard("Cobrado del mes", adminMoney.format((summary.monthPaidCents || 0) / 100), "Importe acreditado")}
      ${salesDashboardCard("Pendiente liquidar", adminMoney.format((summary.pendingCommissionCents || 0) / 100), "Comisiones cobradas")}
      ${salesDashboardCard("Liquidado mes", adminMoney.format((summary.settledCommissionCents || 0) / 100), "Comisiones cerradas")}
    </div>
    <section class="sales-ranking-panel">
      <div class="panel-heading">
        <p class="eyebrow">Tablero comercial</p>
        <h3>Resumen por vendedor</h3>
      </div>
      <div class="sales-ranking-list">
        ${reps.length ? reps.map(renderSalesRepDashboardRow).join("") : `<p class="admin-note">Todavia no hay vendedores para analizar.</p>`}
      </div>
    </section>
  `;
}

function salesDashboardCard(label, value, note) {
  return `
    <div>
      <span>${escapeAdmin(label)}</span>
      <strong>${escapeAdmin(String(value))}</strong>
      <small>${escapeAdmin(note)}</small>
    </div>
  `;
}

function renderSalesRepDashboardRow(rep) {
  const lastActivity = rep.lastOrderAt
    ? `Ultimo pedido ${formatDate(rep.lastOrderAt)}`
    : "Sin pedidos este mes";
  const activeClass = rep.id === adminState.selectedSalesRepId ? " active" : "";
  return `
    <button class="sales-ranking-row${activeClass}" type="button" data-sales-profile="${rep.id}">
      <div>
        <strong>${escapeAdmin(rep.name)}</strong>
        <small>${escapeAdmin(rep.email)} · ${rep.status === "active" ? "Activo" : "Inactivo"} · ${formatBps(rep.defaultCommissionBps || 0)}</small>
      </div>
      <div><span>Clientes</span><strong>${rep.customerCount || 0}</strong><small>${rep.approvedCustomerCount || 0} aprobados</small></div>
      <div><span>Venta mes</span><strong>${adminMoney.format((rep.monthTotalCents || 0) / 100)}</strong><small>${rep.monthOrders || 0} pedidos</small></div>
      <div><span>Cobrado</span><strong>${adminMoney.format((rep.monthPaidCents || 0) / 100)}</strong><small>${escapeAdmin(lastActivity)}</small></div>
      <div><span>Pendiente</span><strong>${adminMoney.format((rep.pendingCommissionCents || 0) / 100)}</strong><small>${rep.pendingOrders || 0} para liquidar</small></div>
      <div><span>Liquidado</span><strong>${adminMoney.format((rep.settledCommissionCents || 0) / 100)}</strong><small>${rep.settlementsCount || 0} liquidaciones</small></div>
    </button>
  `;
}

async function handleSalesRepDashboardClick(event) {
  const button = event.target.closest("[data-sales-profile]");
  if (!button) return;
  adminState.selectedSalesRepId = Number(button.dataset.salesProfile);
  renderSalesRepDashboard();
  await loadSalesRepProfile(adminState.selectedSalesRepId);
  setSalesPanel("profile");
}

function handleSalesRepProfileClick(event) {
  const editButton = event.target.closest("[data-profile-edit-sales-rep]");
  if (!editButton) return;
  editSalesRepById(Number(editButton.dataset.profileEditSalesRep));
}

async function loadSalesRepProfile(salesRepId) {
  if (!adminEls.salesRepProfile || !salesRepId) return;
  adminEls.salesRepProfile.hidden = false;
  adminEls.salesRepProfile.innerHTML = `<p class="admin-note">Cargando ficha del vendedor...</p>`;
  const { profile } = await adminApi(`/api/admin/sales-reps/${salesRepId}/profile`);
  adminState.salesRepProfile = profile;
  renderSalesRepProfile(profile);
}

function renderSalesRepProfile(profile) {
  if (!adminEls.salesRepProfile) return;
  if (!profile) {
    adminEls.salesRepProfile.hidden = true;
    adminEls.salesRepProfile.innerHTML = "";
    return;
  }
  const rep = profile.salesRep;
  const summary = profile.summary || {};
  adminEls.salesRepProfile.hidden = false;
  adminEls.salesRepProfile.innerHTML = `
    <section class="sales-profile-shell">
      <header class="sales-profile-header">
        <div>
          <p class="eyebrow">Ficha del vendedor</p>
          <h3>${escapeAdmin(rep.name)}</h3>
          <p>${escapeAdmin(rep.email)}${rep.whatsapp ? ` - WhatsApp ${escapeAdmin(rep.whatsapp)}` : ""}</p>
        </div>
        <div class="sales-profile-actions">
          <span class="status-badge ${rep.status === "active" ? "approved" : "suspended"}">${rep.status === "active" ? "Activo" : "Inactivo"}</span>
          <button class="ghost-button" type="button" data-profile-edit-sales-rep="${rep.id}">Editar vendedor</button>
        </div>
      </header>
      <div class="sales-profile-metrics">
        ${salesProfileMetric("Clientes", summary.customerCount || 0, `${summary.approvedCustomerCount || 0} aprobados`)}
        ${salesProfileMetric("Pedidos abiertos", summary.openOrders || 0, `${summary.totalOrders || 0} historicos`)}
        ${salesProfileMetric("Venta mes", adminMoney.format((summary.monthTotalCents || 0) / 100), "Total reservado")}
        ${salesProfileMetric("Cobrado mes", adminMoney.format((summary.monthPaidCents || 0) / 100), "Pagos acreditados")}
        ${salesProfileMetric("Pendiente liquidar", adminMoney.format((summary.pendingCommissionCents || 0) / 100), `${summary.pendingOrders || 0} pedidos`)}
        ${salesProfileMetric("Liquidado", adminMoney.format((summary.settledCommissionCents || 0) / 100), `${summary.settlementsCount || 0} liquidaciones`)}
      </div>
      <div class="sales-profile-grid">
        <section class="sales-profile-card">
          <div class="panel-heading">
            <p class="eyebrow">Cartera</p>
            <h4>Clientes asignados</h4>
          </div>
          <div class="sales-profile-list">
            ${profile.customers.length ? profile.customers.slice(0, 8).map(renderSalesProfileCustomer).join("") : `<p class="admin-note">Sin clientes asignados.</p>`}
          </div>
        </section>
        <section class="sales-profile-card">
          <div class="panel-heading">
            <p class="eyebrow">Operacion</p>
            <h4>Pedidos recientes</h4>
          </div>
          <div class="sales-profile-list">
            ${profile.recentOrders.length ? profile.recentOrders.slice(0, 8).map(renderSalesProfileOrder).join("") : `<p class="admin-note">Sin pedidos recientes.</p>`}
          </div>
        </section>
        <section class="sales-profile-card">
          <div class="panel-heading">
            <p class="eyebrow">Banco</p>
            <h4>Datos para liquidacion</h4>
          </div>
          ${renderSalesProfileBank(rep)}
        </section>
        <section class="sales-profile-card">
          <div class="panel-heading">
            <p class="eyebrow">Liquidaciones</p>
            <h4>Historial reciente</h4>
          </div>
          <div class="sales-profile-list">
            ${profile.settlements.length ? profile.settlements.map(renderSalesProfileSettlement).join("") : `<p class="admin-note">Todavia no hay liquidaciones.</p>`}
          </div>
        </section>
      </div>
    </section>
  `;
}

function salesProfileMetric(label, value, note) {
  return `
    <div>
      <span>${escapeAdmin(label)}</span>
      <strong>${escapeAdmin(String(value))}</strong>
      <small>${escapeAdmin(note)}</small>
    </div>
  `;
}

function renderSalesProfileCustomer(customer) {
  const location = [customer.city, customer.province].filter(Boolean).join(", ") || "Sin localidad";
  return `
    <article>
      <div>
        <strong>${escapeAdmin(customer.business_name)}</strong>
        <small>${escapeAdmin(customer.email)} - ${escapeAdmin(location)}</small>
      </div>
      <span class="status-badge ${customer.approval_status === "approved" ? "approved" : "pending"}">${escapeAdmin(statusLabels[customer.approval_status] || customer.approval_status)}</span>
    </article>
  `;
}

function renderSalesProfileOrder(order) {
  return `
    <article>
      <div>
        <strong>${escapeAdmin(order.order_number)}</strong>
        <small>${escapeAdmin(order.business_name)} - ${formatDate(order.created_at)}</small>
      </div>
      <div class="sales-profile-order-states">
        ${stateBadge(orderStatusText(order.status), orderStateClasses[order.status])}
        ${stateBadge(paymentStatusText(order.payment_status), paymentStateClasses[order.payment_status])}
        <strong>${adminMoney.format((order.sales_commission_cents || 0) / 100)}</strong>
      </div>
    </article>
  `;
}

function renderSalesProfileBank(rep) {
  const rows = [
    ["Banco", rep.bankName || "Sin banco"],
    ["Titular", rep.bankAccountHolder || "Sin titular"],
    ["CUIT", rep.bankTaxId || "-"],
    ["Tipo", rep.bankAccountType || "-"],
    ["CBU", rep.bankCbu || "-"],
    ["Alias", rep.bankAlias || "-"]
  ];
  return `
    <dl class="sales-profile-bank">
      ${rows.map(([label, value]) => `<div><dt>${escapeAdmin(label)}</dt><dd>${escapeAdmin(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function renderSalesProfileSettlement(settlement) {
  return `
    <article>
      <div>
        <strong>${escapeAdmin(settlement.settlement_number)}</strong>
        <small>${formatDate(settlement.created_at)} - ${settlement.orders_count || 0} pedidos</small>
      </div>
      <strong>${adminMoney.format((settlement.commission_cents || 0) / 100)}</strong>
    </article>
  `;
}

function editSalesRep(event) {
  editSalesRepById(Number(event.currentTarget.dataset.editSalesRep));
}

function editSalesRepById(id) {
  const rep = adminState.salesReps.find((item) => item.id === id);
  if (!rep) return;
  adminEls.salesRepFormTitle.textContent = `Editar ${rep.name}`;
  adminEls.salesRepForm.elements.id.value = rep.id;
  adminEls.salesRepForm.elements.name.value = rep.name;
  adminEls.salesRepForm.elements.email.value = rep.email;
  adminEls.salesRepForm.elements.phone.value = rep.phone || "";
  adminEls.salesRepForm.elements.whatsapp.value = rep.whatsapp || "";
  adminEls.salesRepForm.elements.bankName.value = rep.bank_name || "";
  adminEls.salesRepForm.elements.bankAccountHolder.value = rep.bank_account_holder || "";
  adminEls.salesRepForm.elements.bankTaxId.value = rep.bank_tax_id || "";
  adminEls.salesRepForm.elements.bankAccountType.value = rep.bank_account_type || "";
  adminEls.salesRepForm.elements.bankCbu.value = rep.bank_cbu || "";
  adminEls.salesRepForm.elements.bankAlias.value = rep.bank_alias || "";
  adminEls.salesRepForm.elements.defaultCommission.value = rep.default_commission_bps / 100;
  adminEls.salesRepForm.elements.status.value = rep.status;
  adminEls.salesRepForm.elements.portalAccessEnabled.checked = Boolean(rep.has_portal_access);
  adminEls.salesRepForm.dataset.hasPortalAccess = String(Boolean(rep.has_portal_access));
  adminEls.salesRepForm.elements.portalPassword.value = "";
  adminEls.salesRepForm.elements.portalPasswordConfirmation.value = "";
  adminEls.salesRepForm.elements.notes.value = rep.notes || "";
  adminEls.salesRepMessage.textContent = "";
  syncSalesRepPortalAccess();
  adminEls.salesRepForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  adminEls.salesRepForm?.elements.name?.focus({ preventScroll: true });
}

function resetSalesRepForm({ preserveMessage = false } = {}) {
  if (!adminEls.salesRepForm) return;
  adminEls.salesRepForm.reset();
  delete adminEls.salesRepForm.dataset.hasPortalAccess;
  adminEls.salesRepForm.elements.id.value = "";
  adminEls.salesRepForm.elements.defaultCommission.value = "0";
  adminEls.salesRepForm.elements.status.value = "active";
  adminEls.salesRepForm.elements.portalAccessEnabled.checked = true;
  adminEls.salesRepForm.elements.portalPassword.value = "";
  adminEls.salesRepForm.elements.portalPasswordConfirmation.value = "";
  if (adminEls.salesRepFormTitle) adminEls.salesRepFormTitle.textContent = "Nuevo vendedor";
  if (adminEls.salesRepMessage && !preserveMessage) adminEls.salesRepMessage.textContent = "";
  adminEls.salesRepForm.querySelectorAll("[aria-invalid='true']").forEach((input) => window.KMForms?.clearFieldError(input));
  syncSalesRepPortalAccess();
}

function syncSalesRepPortalAccess() {
  const form = adminEls.salesRepForm;
  if (!form) return;
  const enabled = form.elements.portalAccessEnabled.checked;
  const password = form.elements.portalPassword;
  const confirmation = form.elements.portalPasswordConfirmation;
  const isNew = !form.elements.id.value;
  const alreadyEnabled = form.dataset.hasPortalAccess === "true";
  const passwordRequired = enabled && (isNew || !alreadyEnabled);
  document.querySelectorAll("[data-portal-password-field]").forEach((node) => { node.hidden = !enabled; });
  password.disabled = !enabled;
  confirmation.disabled = !enabled;
  password.required = passwordRequired;
  confirmation.required = passwordRequired || Boolean(password.value);
  if (!enabled) {
    password.value = "";
    confirmation.value = "";
    password.setCustomValidity("");
    confirmation.setCustomValidity("");
  } else if (confirmation.value && password.value === confirmation.value) {
    confirmation.setCustomValidity("");
  }
  const status = document.querySelector("#salesRepPortalStatus");
  if (!status) return;
  if (!enabled) status.textContent = "El vendedor se guardará sin acceso al portal.";
  else if (!isNew && alreadyEnabled) status.textContent = "Acceso configurado. Dejá la clave vacía para conservar la actual.";
  else status.textContent = "Ingresá y confirmá una clave de al menos 10 caracteres para habilitar el acceso.";
}

async function copySalesRepPassword() {
  const password = String(adminEls.salesRepForm?.elements.portalPassword?.value || "");
  if (!password) {
    window.KMForms?.showFieldError(adminEls.salesRepForm?.elements.portalPassword, "Ingresá una clave antes de copiarla.");
    adminEls.salesRepForm?.elements.portalPassword?.focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(password);
    showAdminToast("Clave copiada. Guardala en un lugar seguro.");
  } catch {
    adminEls.salesRepForm.elements.portalPassword.type = "text";
    adminEls.salesRepForm.elements.portalPassword.select();
    showAdminToast("Seleccionamos la clave para que puedas copiarla.");
  }
}

async function saveSalesRep(event) {
  event.preventDefault();
  const password = adminEls.salesRepForm.elements.portalPassword;
  const confirmation = adminEls.salesRepForm.elements.portalPasswordConfirmation;
  confirmation.setCustomValidity("");
  if (adminEls.salesRepForm.elements.portalAccessEnabled.checked && password.value !== confirmation.value) {
    confirmation.setCustomValidity("Las claves no coinciden.");
    adminEls.salesRepForm.reportValidity();
    return;
  }
  const values = Object.fromEntries(new FormData(adminEls.salesRepForm));
  setBusy(adminEls.salesRepForm, true);
  try {
    await adminApi("/api/admin/sales-reps", {
      method: "POST",
      body: {
        id: values.id ? Number(values.id) : undefined,
        name: values.name,
        email: values.email,
        phone: values.phone,
        whatsapp: values.whatsapp,
        bankName: values.bankName,
        bankAccountHolder: values.bankAccountHolder,
        bankTaxId: values.bankTaxId,
        bankAccountType: values.bankAccountType,
        bankCbu: values.bankCbu,
        bankAlias: values.bankAlias,
        defaultCommissionBps: Math.round(Number(values.defaultCommission || 0) * 100),
        status: values.status,
        portalAccessEnabled: adminEls.salesRepForm.elements.portalAccessEnabled.checked,
        portalPassword: values.portalPassword,
        notes: values.notes
      }
    });
    adminEls.salesRepMessage.textContent = "Vendedor guardado correctamente.";
    adminEls.salesRepMessage.classList.add("is-success");
    adminEls.salesRepMessage.classList.remove("is-error");
    resetSalesRepForm({ preserveMessage: true });
    await loadSalesReps();
  } catch (error) {
    window.KMForms?.showApiError(adminEls.salesRepForm, error, adminEls.salesRepMessage);
  } finally {
    setBusy(adminEls.salesRepForm, false);
  }
}

function renderCommissionSalesRepFilter() {
  if (!adminEls.commissionSalesRepFilter) return;
  const current = adminEls.commissionSalesRepFilter.value;
  adminEls.commissionSalesRepFilter.innerHTML = [
    `<option value="">Todos los vendedores</option>`,
    ...adminState.salesReps
      .filter((rep) => rep.status === "active")
      .map((rep) => `<option value="${rep.id}">${escapeAdmin(rep.name)}</option>`)
  ].join("");
  adminEls.commissionSalesRepFilter.value = current;
}

async function loadSalesCommissions() {
  if (!adminEls.commissionsTableBody) return;
  const params = new URLSearchParams();
  if (adminEls.commissionSalesRepFilter?.value) params.set("salesRepId", adminEls.commissionSalesRepFilter.value);
  const { pending, settlements } = await adminApi(`/api/admin/sales-commissions${params.toString() ? `?${params}` : ""}`);
  adminState.pendingCommissions = pending || [];
  adminState.commissionSettlements = settlements || [];
  renderCommissions();
}

function renderCommissions() {
  if (!adminEls.commissionsTableBody || !adminEls.selectAllCommissions || !adminEls.commissionSettlements) return;
  adminEls.selectAllCommissions.checked = false;
  adminEls.commissionsTableBody.innerHTML = adminState.pendingCommissions.length ? adminState.pendingCommissions.map((row) => `
    <article class="commission-order-card">
      <label class="commission-order-check">
        <input type="checkbox" data-commission-order="${row.id}" />
        <span>
          <strong>${escapeAdmin(row.order_number)}</strong>
          <small>${formatDate(row.updated_at || row.created_at)}</small>
        </span>
      </label>
      <div class="commission-order-main">
        <div><span>Cliente</span><strong>${escapeAdmin(row.business_name || "-")}</strong></div>
        <div><span>Vendedor</span><strong>${escapeAdmin(row.sales_rep_name || "Sin vendedor")}</strong><small>${escapeAdmin(row.sales_rep_email || "")}</small></div>
        <div><span>Base</span><strong>${adminMoney.format((row.sales_commission_base_cents || row.subtotal_net_cents || 0) / 100)}</strong><small>${formatBps(row.sales_commission_bps || 0)}</small></div>
        <div><span>Comision</span><strong>${adminMoney.format((row.sales_commission_cents || 0) / 100)}</strong></div>
      </div>
    </article>
  `).join("") : `<p class="admin-note">No hay comisiones cobradas pendientes de liquidar.</p>`;
  renderCommissionSummary();
  renderCommissionSettlements();
}

function renderCommissionSummary() {
  const selectedIds = selectedCommissionOrderIds();
  const selectedRows = adminState.pendingCommissions.filter((row) => selectedIds.includes(row.id));
  const total = selectedRows.reduce((sum, row) => sum + Number(row.sales_commission_cents || 0), 0);
  const pendingTotal = adminState.pendingCommissions.reduce((sum, row) => sum + Number(row.sales_commission_cents || 0), 0);
  adminEls.commissionSummary.innerHTML = `
    <div><span>Pendientes</span><strong>${adminState.pendingCommissions.length}</strong><small>${adminMoney.format(pendingTotal / 100)}</small></div>
    <div><span>Seleccionadas</span><strong>${selectedRows.length}</strong><small>${adminMoney.format(total / 100)}</small></div>
  `;
  adminEls.createCommissionSettlement.disabled = selectedRows.length === 0;
}

function renderCommissionSettlements() {
  adminEls.commissionSettlements.innerHTML = adminState.commissionSettlements.length ? `
    <div class="panel-heading"><p class="eyebrow">Historial</p><h3>Ultimas liquidaciones</h3></div>
    <div class="operation-list">
      ${adminState.commissionSettlements.slice(0, 8).map((settlement) => `
        <button class="operation-row" type="button" data-settlement-id="${settlement.id}">
          <span><strong>${escapeAdmin(settlement.settlement_number)}</strong><small>${escapeAdmin(settlement.sales_rep_name)} - ${settlement.orders_count} pedidos</small></span>
          <span><strong>${adminMoney.format((settlement.commission_cents || 0) / 100)}</strong><small>${formatDate(settlement.created_at)}</small></span>
        </button>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay liquidaciones generadas.</p>`;
}

function selectedCommissionOrderIds() {
  return [...adminEls.commissionsTableBody.querySelectorAll("[data-commission-order]:checked")]
    .map((checkbox) => Number(checkbox.dataset.commissionOrder));
}

function toggleAllCommissions() {
  adminEls.commissionsTableBody.querySelectorAll("[data-commission-order]").forEach((checkbox) => {
    checkbox.checked = adminEls.selectAllCommissions.checked;
  });
  renderCommissionSummary();
}

async function createCommissionSettlement() {
  const orderIds = selectedCommissionOrderIds();
  if (!orderIds.length) return;
  const salesRepIds = [...new Set(adminState.pendingCommissions.filter((row) => orderIds.includes(row.id)).map((row) => row.sales_rep_id))];
  if (salesRepIds.length !== 1) {
    showAdminToast("Selecciona pedidos de un solo vendedor para liquidar.");
    return;
  }
  setBusy(document.querySelector(".commission-panel"), true);
  try {
    const { settlement } = await adminApi("/api/admin/sales-commission-settlements", {
      method: "POST",
      body: { salesRepId: salesRepIds[0], orderIds, notes: adminEls.commissionNotes.value }
    });
    adminEls.commissionNotes.value = "";
    showAdminToast("Liquidacion generada.");
    await loadSalesCommissions();
    window.open(`./commission-settlement.html?settlement=${settlement.id}`, "_blank", "noopener");
    await Promise.all([loadOrders(), loadOperationDashboard()]);
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(document.querySelector(".commission-panel"), false);
  }
}

function handleCommissionSettlementClick(event) {
  const button = event.target.closest("[data-settlement-id]");
  if (!button) return;
  window.open(`./commission-settlement.html?settlement=${button.dataset.settlementId}`, "_blank", "noopener");
}

async function loadDistributors() {
  if (!adminEls.distributorsTableBody) return;
  const params = new URLSearchParams();
  const search = adminEls.distributorSearch.value.trim();
  if (search) params.set("q", search);
  if (adminEls.distributorStatusFilter.value) params.set("status", adminEls.distributorStatusFilter.value);
  const query = params.toString();
  const { distributors } = await adminApi(`/api/admin/distributors${query ? `?${query}` : ""}`);
  adminState.distributors = distributors || [];
  renderDistributors();
}

function renderDistributors() {
  if (!adminEls.distributorsTableBody) return;
  adminEls.distributorsTableBody.innerHTML = adminState.distributors.length ? adminState.distributors.map((distributor) => `
    <tr>
      <td data-label="Distribuidor">
        <strong>${escapeAdmin(distributor.name)}</strong>
        <br><span>${escapeAdmin(distributor.coverage || "Sin cobertura cargada")}</span>
      </td>
      <td data-label="Zona">
        ${escapeAdmin([distributor.city, distributor.province].filter(Boolean).join(", ") || "Sin zona")}
        <br><span>${escapeAdmin(distributor.address || "")}</span>
      </td>
      <td data-label="Contacto">
        ${escapeAdmin(distributor.contactPerson || "Sin contacto")}
        <br><span>${escapeAdmin([
          distributor.whatsapp ? `WhatsApp ${distributor.whatsapp}` : "",
          distributor.email
        ].filter(Boolean).join(" | ") || "Sin datos")}</span>
      </td>
      <td data-label="Estado">
        <span class="state-badge ${distributor.isPublished ? "success" : "neutral"}">${distributor.isPublished ? "Publicado" : "No publicado"}</span>
        <br><span>Orden ${Number(distributor.sortOrder || 0)}</span>
      </td>
      <td class="distributor-actions-cell" data-label="Acciones">
        <button class="ghost-button small-button toolbar-create-button" type="button" data-edit-distributor="${distributor.id}">Editar</button>
        <button class="ghost-button danger small-button distributor-danger-button" type="button" data-delete-distributor="${distributor.id}">Eliminar</button>
      </td>
    </tr>
  `).join("") : `<tr><td class="admin-empty-cell" colspan="5">Todavia no hay distribuidores cargados.</td></tr>`;
}

function distributorField(name) {
  return adminEls.distributorForm?.elements?.[name];
}

function resetDistributorForm() {
  if (!adminEls.distributorForm) return;
  adminEls.distributorForm.reset();
  distributorField("id").value = "";
  distributorField("sortOrder").value = "0";
  adminEls.distributorFormTitle.textContent = "Nuevo distribuidor";
  adminEls.distributorMessage.textContent = "";
}

function fillDistributorForm(distributor) {
  if (!distributor || !adminEls.distributorForm) return;
  adminEls.distributorFormTitle.textContent = `Editar ${distributor.name}`;
  distributorField("id").value = distributor.id;
  distributorField("name").value = distributor.name || "";
  distributorField("province").value = distributor.province || "";
  distributorField("city").value = distributor.city || "";
  distributorField("sortOrder").value = distributor.sortOrder || 0;
  distributorField("address").value = distributor.address || "";
  distributorField("phone").value = distributor.phone || "";
  distributorField("whatsapp").value = distributor.whatsapp || "";
  distributorField("email").value = distributor.email || "";
  distributorField("website").value = distributor.website || "";
  distributorField("contactPerson").value = distributor.contactPerson || "";
  distributorField("coverage").value = distributor.coverage || "";
  distributorField("notes").value = distributor.notes || "";
  distributorField("isPublished").checked = Boolean(distributor.isPublished);
  adminEls.distributorMessage.textContent = "";
  adminEls.distributorForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveDistributor(event) {
  event.preventDefault();
  const formData = new FormData(adminEls.distributorForm);
  const id = Number(formData.get("id") || 0);
  const body = {
    name: formData.get("name"),
    province: formData.get("province"),
    city: formData.get("city"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    website: formData.get("website"),
    contactPerson: formData.get("contactPerson"),
    coverage: formData.get("coverage"),
    notes: formData.get("notes"),
    sortOrder: Number(formData.get("sortOrder") || 0),
    isPublished: formData.has("isPublished")
  };
  setBusy(adminEls.distributorForm, true);
  try {
    await adminApi(id ? `/api/admin/distributors/${id}` : "/api/admin/distributors", {
      method: id ? "PUT" : "POST",
      body
    });
    resetDistributorForm();
    adminEls.distributorMessage.textContent = "Distribuidor guardado.";
    await loadDistributors();
  } catch (error) {
    adminEls.distributorMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.distributorForm, false);
  }
}

async function handleDistributorsTableClick(event) {
  const editButton = event.target.closest("[data-edit-distributor]");
  if (editButton) {
    const distributor = adminState.distributors.find((item) => item.id === Number(editButton.dataset.editDistributor));
    fillDistributorForm(distributor);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-distributor]");
  if (!deleteButton) return;
  const id = Number(deleteButton.dataset.deleteDistributor);
  const distributor = adminState.distributors.find((item) => item.id === id);
  if (!confirm(`Eliminar ${distributor?.name || "distribuidor"}?`)) return;
  await adminApi(`/api/admin/distributors/${id}`, { method: "DELETE" });
  if (Number(distributorField("id")?.value || 0) === id) resetDistributorForm();
  await loadDistributors();
}

function adminTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseAdminMoneyToCents(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let normalized = raw.replace(/\s/g, "").replace(/\$/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (hasComma) normalized = normalized.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function parseAdminPercentBps(value) {
  const raw = String(value ?? "").trim().replace("%", "").replace(",", ".");
  if (!raw) return null;
  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent === 0 || percent <= -90 || percent > 1000) return null;
  return Math.round(percent * 100);
}

function formatAdminPercentBps(bps) {
  return `${(Number(bps || 0) / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

function getProductBasePriceCents(product) {
  return Number(product.basePriceCents ?? product.base_price_cents ?? 0);
}

function getProductKmCode(product) {
  return product.kmCode || product.km_code || "";
}

function getProductName(product) {
  return product.name || product.article || "";
}

async function loadPriceUpdates() {
  const [productsData, batchesData, costsData] = await Promise.all([
    adminApi("/api/admin/products?status=active"),
    adminApi("/api/admin/price-updates"),
    adminApi("/api/admin/production/costs")
  ]);
  adminState.priceProducts = productsData.products || [];
  adminState.priceBatches = batchesData.batches || [];
  adminState.priceCosts = costsData.costs || null;
  if (adminEls.priceEffectiveDate && !adminEls.priceEffectiveDate.value) adminEls.priceEffectiveDate.value = adminTodayIso();
  if (adminEls.linearPriceEffectiveDate && !adminEls.linearPriceEffectiveDate.value) adminEls.linearPriceEffectiveDate.value = adminTodayIso();
  renderPriceUpdatePage();
}

function handlePriceModeClick(event) {
  const button = event.target.closest("[data-price-mode]");
  if (!button) return;
  adminState.priceMode = button.dataset.priceMode;
  renderPriceUpdatePage();
}

function handlePriceFilterClick(event) {
  const button = event.target.closest("[data-price-filter]");
  if (!button) return;
  adminState.priceFilter = button.dataset.priceFilter;
  renderPriceUpdateTool();
}

function priceDraftState(product) {
  const raw = adminState.priceDraft[String(product.id)] ?? "";
  const cents = parseAdminMoneyToCents(raw);
  const oldPriceCents = getProductBasePriceCents(product);
  const reviewed = raw.trim() !== "" && cents !== null;
  const changed = reviewed && cents !== oldPriceCents;
  return {
    raw,
    cents,
    reviewed,
    changed,
    up: changed && cents > oldPriceCents,
    down: changed && cents < oldPriceCents
  };
}

function priceCardClass(product) {
  const state = priceDraftState(product);
  if (!state.reviewed) return "price-card pending";
  if (state.up) return "price-card changed up";
  if (state.down) return "price-card changed down";
  return state.changed ? "price-card changed" : "price-card reviewed";
}

function renderPriceUpdatePage() {
  document.querySelectorAll("[data-price-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.priceMode === adminState.priceMode);
  });
  if (adminEls.individualPricePanel) adminEls.individualPricePanel.hidden = adminState.priceMode !== "individual";
  if (adminEls.linearPricePanel) adminEls.linearPricePanel.hidden = adminState.priceMode !== "linear";
  renderPriceUpdateStats();
  renderPriceUpdateTool();
  renderLinearPricePreview();
  renderPriceUpdateHistory();
}

function renderPriceUpdateStats() {
  if (!adminEls.priceUpdateStats) return;
  const products = adminState.priceProducts || [];
  const states = products.map(priceDraftState);
  const reviewed = states.filter((state) => state.reviewed).length;
  const changed = states.filter((state) => state.changed).length;
  adminEls.priceUpdateStats.innerHTML = [
    ["Activos", products.length],
    ["Revisados", reviewed],
    ["Modificados", changed],
    ["Pendientes", Math.max(0, products.length - reviewed)]
  ].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderPriceUpdateTool() {
  if (!adminEls.priceUpdateList) return;
  document.querySelectorAll("[data-price-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.priceFilter === adminState.priceFilter);
  });
  const products = adminState.priceProducts || [];
  const costSettings = adminState.priceCosts?.settings || {};
  const costByProduct = new Map((adminState.priceCosts?.products || []).map((item) => [Number(item.productId), item]));
  if (adminEls.priceProfitConditions) adminEls.priceProfitConditions.textContent = `Cada tarjeta parte de 50% y puede modificarse. Se consideran ${formatAdminPercentBps(costSettings.maximumDiscountBps)} de bonificación máxima y ${formatAdminPercentBps(costSettings.maximumCommissionBps)} de comisión máxima.`;
  const filtered = products.filter((product) => {
    const state = priceDraftState(product);
    if (adminState.priceFilter === "pending") return !state.reviewed;
    if (adminState.priceFilter === "changed") return state.changed;
    if (adminState.priceFilter === "up") return state.up;
    if (adminState.priceFilter === "down") return state.down;
    return true;
  });
  adminEls.priceUpdateList.innerHTML = filtered.map((product) => {
    const oldPriceCents = getProductBasePriceCents(product);
    const raw = adminState.priceDraft[String(product.id)] ?? "";
    const cost = costByProduct.get(Number(product.id));
    const targetProfit = priceProfitTarget(product.id);
    return `
      <article class="${priceCardClass(product)}" data-product-id="${product.id}">
        <div class="price-card-main">
          <span class="price-code">${escapeAdmin(getProductKmCode(product))}</span>
          <strong>${escapeAdmin(getProductName(product))}</strong>
        </div>
        <div class="price-card-values">
          <span class="price-card-current"><small>Precio actual</small><strong>${adminMoney.format(oldPriceCents / 100)}</strong>${currentProfitMarkup(cost)}</span>
          <label class="price-card-target">
            <small>Rentabilidad objetivo</small>
            <span><input data-price-profit-target="${product.id}" type="number" min="0" max="99.99" step="0.01" value="${escapeAdmin(targetProfit)}" inputmode="decimal" /><b>%</b></span>
          </label>
          <span class="price-card-suggestion" data-price-guidance="${product.id}">${priceSuggestionMarkup(cost, targetProfit, costSettings)}</span>
          <label>
            <small>Nuevo precio</small>
            <input class="price-card-input" data-price-product-id="${product.id}" inputmode="decimal" value="${escapeAdmin(raw)}" placeholder="${formatAdminMoneyInput(oldPriceCents)}" />
          </label>
        </div>
      </article>
    `;
  }).join("") || `<p class="empty-state">No hay productos para este filtro.</p>`;
}

function priceProfitTarget(productId) {
  return adminState.priceProfitTargets[String(productId)] ?? "50";
}

function currentProfitMarkup(cost) {
  if (cost?.profitabilityPercent === null || cost?.profitabilityPercent === undefined) return '<span class="price-profit-pending">Utilidad actual pendiente</span>';
  const percent = Number(cost.profitabilityPercent);
  const tone = percent < 0 ? "is-negative" : "is-positive";
  return `<span class="price-current-profit ${tone}">Utilidad actual ${percent.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%</span>`;
}

function priceSuggestionMarkup(cost, targetProfit, settings) {
  const rawTarget = String(targetProfit ?? "").trim();
  const target = rawTarget ? Number(rawTarget) : Number.NaN;
  const discount = Number(settings.maximumDiscountBps || 0) / 10_000;
  const commission = Number(settings.maximumCommissionBps || 0) / 10_000;
  const divisor = (1 - discount) * (1 - commission) * (1 - target / 100);
  if (!Number.isFinite(target) || target < 0 || target >= 100) return '<small>Precio sugerido</small><strong class="price-profit-pending">Objetivo inválido</strong>';
  if (!cost?.complete) return '<small>Precio sugerido</small><strong class="price-profit-pending">Costo incompleto</strong>';
  if (divisor <= 0) return '<small>Precio sugerido</small><strong class="price-profit-pending">Revisar parámetros</strong>';
  const suggestedPrice = Math.ceil(Number(cost.totalCostArs || 0) / divisor);
  return `<small>Precio sugerido</small><strong>${adminMoney.format(suggestedPrice)}</strong><span>Costo ${adminMoney.format(Number(cost.totalCostArs || 0))}</span>`;
}

function handlePriceProfitTargetChange(event) {
  const input = event.target.closest("[data-price-profit-target]");
  if (!input) return;
  const productId = String(input.dataset.priceProfitTarget);
  adminState.priceProfitTargets[productId] = input.value;
  const cost = adminState.priceCosts?.products?.find((item) => String(item.productId) === productId);
  const guidance = input.closest(".price-card")?.querySelector(`[data-price-guidance="${productId}"]`);
  if (guidance) guidance.innerHTML = priceSuggestionMarkup(cost, input.value, adminState.priceCosts?.settings || {});
}

function handlePriceUpdateChange(event) {
  const input = event.target.closest("[data-price-product-id]");
  if (!input) return;
  const productId = String(input.dataset.priceProductId);
  adminState.priceDraft[productId] = input.value;
  const product = (adminState.priceProducts || []).find((item) => String(item.id) === productId);
  if (product) {
    const card = input.closest(".price-card");
    if (card) card.className = priceCardClass(product);
  }
  renderPriceUpdateStats();
}

function fillUnchangedPriceDraft() {
  for (const product of adminState.priceProducts || []) {
    const key = String(product.id);
    if (!String(adminState.priceDraft[key] || "").trim()) {
      adminState.priceDraft[key] = formatAdminMoneyInput(getProductBasePriceCents(product));
    }
  }
  renderPriceUpdatePage();
}

function clearPriceDraft() {
  adminState.priceDraft = {};
  if (adminEls.priceUpdateMessage) adminEls.priceUpdateMessage.textContent = "";
  renderPriceUpdatePage();
}

async function saveIndividualPriceUpdate() {
  if (!adminEls.saveIndividualPrices) return;
  const products = adminState.priceProducts || [];
  const items = [];
  for (const product of products) {
    const state = priceDraftState(product);
    if (!state.reviewed) {
      adminEls.priceUpdateMessage.textContent = "Revisa todos los productos antes de programar.";
      return;
    }
    items.push({ productId: product.id, newPriceCents: state.cents });
  }
  adminEls.saveIndividualPrices.disabled = true;
  try {
    const result = await adminApi("/api/admin/price-updates/individual", {
      method: "POST",
      body: { effectiveDate: adminEls.priceEffectiveDate.value, items }
    });
    adminState.priceBatches = result.batches || [];
    adminState.priceDraft = {};
    if (adminEls.priceUpdateMessage) adminEls.priceUpdateMessage.textContent = "Actualizacion programada correctamente.";
    await loadProducts();
    await loadPriceUpdates();
    showAdminToast("Precios programados");
  } catch (error) {
    if (adminEls.priceUpdateMessage) adminEls.priceUpdateMessage.textContent = error.message;
  } finally {
    adminEls.saveIndividualPrices.disabled = false;
  }
}

function renderLinearPricePreview() {
  if (!adminEls.linearPricePreview) return;
  const percentBps = parseAdminPercentBps(adminEls.linearPricePercent?.value);
  const products = adminState.priceProducts || [];
  if (!percentBps) {
    adminEls.linearPricePreview.innerHTML = `<p class="empty-state">Carga un porcentaje para ver la vista previa.</p>`;
    return;
  }
  const preview = products.slice(0, 8).map((product) => {
    const oldPrice = getProductBasePriceCents(product);
    const nextPrice = Math.max(0, Math.round((oldPrice * (10000 + percentBps)) / 10000));
    return `<div><strong>${escapeAdmin(getProductKmCode(product))}</strong><span>${adminMoney.format(oldPrice / 100)} &rarr; ${adminMoney.format(nextPrice / 100)}</span></div>`;
  }).join("");
  adminEls.linearPricePreview.innerHTML = `
    <div class="linear-summary"><strong>${formatAdminPercentBps(percentBps)}</strong><span>${products.length} productos activos</span></div>
    ${preview}
  `;
}

async function saveLinearPriceUpdate() {
  if (!adminEls.saveLinearPrices) return;
  const percentBps = parseAdminPercentBps(adminEls.linearPricePercent.value);
  if (!percentBps) {
    adminEls.linearPriceMessage.textContent = "Ingresa un porcentaje valido.";
    return;
  }
  adminEls.saveLinearPrices.disabled = true;
  try {
    const result = await adminApi("/api/admin/price-updates/linear", {
      method: "POST",
      body: { effectiveDate: adminEls.linearPriceEffectiveDate.value, percentBps }
    });
    adminState.priceBatches = result.batches || [];
    adminEls.linearPricePercent.value = "";
    if (adminEls.linearPriceMessage) adminEls.linearPriceMessage.textContent = "Aumento lineal programado correctamente.";
    await loadProducts();
    await loadPriceUpdates();
    showAdminToast("Aumento programado");
  } catch (error) {
    if (adminEls.linearPriceMessage) adminEls.linearPriceMessage.textContent = error.message;
  } finally {
    adminEls.saveLinearPrices.disabled = false;
  }
}

function renderPriceUpdateHistory() {
  if (!adminEls.priceUpdateHistory) return;
  const batches = adminState.priceBatches || [];
  if (!batches.length) {
    adminEls.priceUpdateHistory.innerHTML = `<p class="empty-state">Todavia no hay actualizaciones programadas.</p>`;
    return;
  }
  adminEls.priceUpdateHistory.innerHTML = batches.map((batch) => {
    const status = batch.status === "applied" ? "Aplicada" : batch.status === "cancelled" ? "Cancelada" : "Programada";
    const type = batch.type === "linear" ? `Lineal ${formatAdminPercentBps(batch.percentBps)}` : "Uno a uno";
    const dateLabel = formatAdminDate(batch.effectiveDate) || batch.effectiveDate;
    const sample = (batch.items || []).map((item) => (
      `${escapeAdmin(item.kmCode)} ${adminMoney.format((item.oldPriceCents || 0) / 100)} -> ${adminMoney.format((item.newPriceCents || 0) / 100)}`
    )).join(" | ");
    return `
      <article class="price-history-card">
        <div>
          <span class="status-pill ${batch.status === "applied" ? "ok" : "warning"}">${status}</span>
          <strong>${type}</strong>
          <p>${batch.changedCount || 0} modificados de ${batch.productCount || 0} productos - Implementa ${escapeAdmin(dateLabel)}</p>
          ${sample ? `<small>${sample}</small>` : ""}
        </div>
        <button class="ghost-button" type="button" data-price-list-batch="${batch.id}">Generar lista PDF</button>
      </article>
    `;
  }).join("");
}

function openScheduledPriceList(event) {
  const button = event.target.closest("[data-price-list-batch]");
  if (!button) return;
  window.open(`./price-update-list.html?batch=${encodeURIComponent(button.dataset.priceListBatch)}`, "_blank", "noopener,noreferrer");
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (adminEls.productSearch.value.trim()) params.set("q", adminEls.productSearch.value.trim());
  if (adminEls.productFamilyFilter.value) params.set("family", adminEls.productFamilyFilter.value);
  if (adminEls.productStatusFilter.value) params.set("status", adminEls.productStatusFilter.value);
  const [{ products }, { families }] = await Promise.all([
    adminApi(`/api/admin/products${params.toString() ? `?${params}` : ""}`),
    adminApi("/api/admin/product-families")
  ]);
  adminState.products = products;
  adminState.families = families;
  renderProductFamilies();
  renderProducts();
}

function renderProductFamilies() {
  const current = adminEls.productFamilyFilter.value;
  adminEls.productFamilyFilter.innerHTML = `<option value="">Todas las familias</option>${adminState.families.map((family) => (
    `<option value="${escapeAdmin(family.slug)}">${escapeAdmin(family.name)}</option>`
  )).join("")}`;
  adminEls.productFamilyFilter.value = current;
  adminEls.familyNameOptions.innerHTML = adminState.families.map((family) => `<option value="${escapeAdmin(family.name)}"></option>`).join("");
}

function syncSelectedFamilyDescription() {
  const familyName = productField("familyName")?.value?.trim();
  if (!familyName) return;
  const family = adminState.families.find((item) => item.name.toLowerCase() === familyName.toLowerCase());
  if (family && !productField("familyDescription").value.trim()) {
    productField("familyDescription").value = family.description || "";
  }
}

function renderProducts() {
  if (adminEls.productResultCount) {
    const count = adminState.products.length;
    adminEls.productResultCount.textContent = `${count} producto${count === 1 ? "" : "s"}`;
  }
  adminEls.productsTableBody.innerHTML = adminState.products.length ? adminState.products.map((product) => `
    <tr data-product-id="${product.id}">
      <td data-label="KM"><strong>${escapeAdmin(product.kmCode)}</strong>${adminPromotionBadge(product.promotion?.current)}<br><span>${escapeAdmin(product.ean13)}</span></td>
      <td data-label="Producto">${escapeAdmin(product.name)}${product.measure ? `<br><span>${escapeAdmin(product.measure)}</span>` : ""}${product.warehouseLocation ? `<br><span>Ubicacion: ${escapeAdmin(product.warehouseLocation)}</span>` : ""}</td>
      <td data-label="Familia">${escapeAdmin(product.family.name)}</td>
      <td data-label="Precio lista">${adminMoney.format(product.basePriceCents / 100)}</td>
      <td data-label="Estado"><span class="status-badge ${product.active ? "approved" : "suspended"}">${product.active ? "Activo" : "Inactivo"}</span>${product.imageCount ? `<br><span>${product.imageCount} img.</span>` : ""}</td>
      <td data-label="Editar"><button class="ghost-button row-button toolbar-create-button" type="button" data-edit-product="${product.id}">Editar</button></td>
    </tr>
  `).join("") : `<tr><td class="admin-empty-cell" colspan="6">No hay productos para este filtro.</td></tr>`;
  adminEls.productsTableBody.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", editProduct));
}

function adminPromotionBadge(promotion) {
  if (!promotion?.active || !promotion.bps) return "";
  return ` <span class="promo-badge small">PROMO -${formatBps(promotion.bps)}</span>`;
}

function editProduct(event) {
  const product = adminState.products.find((item) => item.id === Number(event.currentTarget.dataset.editProduct));
  if (!product) return;
  adminState.selectedProductId = product.id;
  adminEls.productFormTitle.textContent = `Editar ${product.kmCode}`;
  productField("kmCode").value = product.kmCode;
  productField("ean13").value = product.ean13;
  productField("name").value = product.name;
  productField("familyName").value = product.family.name;
  productField("familyDescription").value = product.family.description || "";
  productField("subfamily").value = product.subfamily || "";
  productField("familySortOrder").value = product.family.sortOrder || 0;
  productField("webSortOrder").value = product.webSortOrder || 0;
  productField("basePrice").value = (product.basePriceCents / 100).toFixed(2);
  productField("priceEffectiveFrom").value = normalizeDateInput(product.priceEffectiveFrom);
  productField("promotionPercent").value = product.promotion?.bps ? (product.promotion.bps / 100).toFixed(2) : "";
  productField("promotionLabel").value = product.promotion?.label || "";
  productField("promotionStartsAt").value = normalizeDateInput(product.promotion?.startsAt || "");
  productField("promotionEndsAt").value = normalizeDateInput(product.promotion?.endsAt || "");
  productField("promotionActive").checked = Boolean(product.promotion?.active);
  productField("active").checked = product.active;
  productField("imageFilename").value = product.imageFilename || "";
  productField("warehouseLocation").value = product.warehouseLocation || "";
  productField("material").value = product.material || "";
  productField("color").value = product.color || "";
  productField("measure").value = product.measure || "";
  productField("cutLevel").value = product.cutLevel || "";
  productField("attachmentSystem").value = product.attachmentSystem || "";
  productField("compatibleMachine").value = product.compatibleMachine || "";
  productField("recommendedUse").value = product.recommendedUse || "";
  productField("technicalDescription").value = product.technicalDescription || "";
  adminEls.productMessage.textContent = "";
  openProductEditor();
  loadProductImages(product.id);
  adminEls.productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewProductEditor() {
  resetProductForm();
  openProductEditor();
  productField("kmCode")?.focus();
}

function openProductEditor() {
  if (!adminEls.productForm) return;
  adminEls.productForm.hidden = false;
  if (adminEls.productListPanel) adminEls.productListPanel.hidden = true;
  document.querySelector("#productsView")?.classList.add("product-editor-open");
}

function closeProductEditor() {
  if (!adminEls.productForm) return;
  adminEls.productForm.hidden = true;
  if (adminEls.productListPanel) adminEls.productListPanel.hidden = false;
  document.querySelector("#productsView")?.classList.remove("product-editor-open");
}

function resetProductForm() {
  if (!adminEls.productForm) return;
  adminState.selectedProductId = null;
  adminEls.productForm.reset();
  if (adminEls.productFormTitle) adminEls.productFormTitle.textContent = "Nuevo producto";
  productField("active").checked = true;
  productField("familySortOrder").value = 0;
  productField("familyDescription").value = "";
  productField("webSortOrder").value = 0;
  productField("warehouseLocation").value = "";
  productField("priceEffectiveFrom").value = new Date().toISOString().slice(0, 10);
  productField("promotionPercent").value = "";
  productField("promotionLabel").value = "";
  productField("promotionStartsAt").value = "";
  productField("promotionEndsAt").value = "";
  productField("promotionActive").checked = false;
  if (adminEls.productMessage) adminEls.productMessage.textContent = "";
  adminState.productImages = [];
  renderProductImages();
}

async function saveProduct(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.productForm));
  const body = {
    kmCode: values.kmCode,
    ean13: values.ean13,
    name: values.name,
    familyName: values.familyName,
    familyDescription: values.familyDescription,
    subfamily: values.subfamily,
    familySortOrder: Number(values.familySortOrder || 0),
    webSortOrder: Number(values.webSortOrder || 0),
    basePriceCents: Math.round(Number(values.basePrice || 0) * 100),
    priceEffectiveFrom: values.priceEffectiveFrom,
    promotionBps: Math.round(Number(values.promotionPercent || 0) * 100),
    promotionLabel: values.promotionLabel,
    promotionStartsAt: values.promotionStartsAt,
    promotionEndsAt: values.promotionEndsAt,
    promotionActive: productField("promotionActive").checked,
    active: productField("active").checked,
    imageFilename: values.imageFilename,
    warehouseLocation: values.warehouseLocation,
    material: values.material,
    color: values.color,
    measure: values.measure,
    cutLevel: values.cutLevel,
    attachmentSystem: values.attachmentSystem,
    compatibleMachine: values.compatibleMachine,
    recommendedUse: values.recommendedUse,
    technicalDescription: values.technicalDescription
  };
  setBusy(adminEls.productForm, true);
  try {
    const { product } = await adminApi("/api/admin/products", { method: "POST", body });
    adminEls.productMessage.textContent = `Producto ${product.km_code || body.kmCode} guardado.`;
    await loadProducts();
    const updated = adminState.products.find((item) => item.kmCode === String(body.kmCode).trim().toUpperCase());
    if (updated) {
      adminState.selectedProductId = updated.id;
      adminEls.productFormTitle.textContent = `Editar ${updated.kmCode}`;
      await loadProductImages(updated.id);
    }
  } catch (error) {
    adminEls.productMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.productForm, false);
  }
}

async function loadProductImages(productId) {
  adminEls.productImagesNote.textContent = "Cargando imagenes...";
  try {
    const { images } = await adminApi(`/api/admin/products/${productId}/images`);
    adminState.productImages = images;
    renderProductImages();
  } catch (error) {
    adminState.productImages = [];
    renderProductImages(error.message);
  }
}

function renderProductImages(errorMessage = "") {
  const hasProduct = Boolean(adminState.selectedProductId);
  adminEls.productImageInput.disabled = !hasProduct;
  if (!hasProduct) {
    adminEls.productImagesNote.textContent = "Guarda o selecciona un producto para cargar imagenes.";
    adminEls.productImages.innerHTML = "";
    return;
  }
  if (errorMessage) {
    adminEls.productImagesNote.textContent = errorMessage;
  } else {
    adminEls.productImagesNote.textContent = adminState.productImages.length
      ? "La imagen marcada como principal se muestra primero en la tienda."
      : "Todavia no hay imagenes cargadas para este producto.";
  }
  adminEls.productImages.innerHTML = adminState.productImages.map((image, index) => `
    <article class="product-image-card ${image.isPrimary ? "is-primary" : ""}">
      <figure class="product-image-preview">
        <img src="${escapeAdmin(image.url)}" alt="${escapeAdmin(image.altText || image.originalFilename)}" loading="lazy" />
      </figure>
      <div class="product-image-meta" title="${escapeAdmin(image.originalFilename)}">
        <strong>${image.isPrimary ? "Principal" : "Galeria"}</strong>
        <span>Imagen ${index + 1}</span>
      </div>
      <div class="image-actions">
        <button class="ghost-button" type="button" data-primary-image="${image.id}" ${image.isPrimary ? "disabled" : ""}>Principal</button>
        <button class="ghost-button danger" type="button" data-delete-image="${image.id}">Eliminar</button>
      </div>
    </article>
  `).join("");
  adminEls.productImages.querySelectorAll("[data-primary-image]").forEach((button) => button.addEventListener("click", setPrimaryProductImage));
  adminEls.productImages.querySelectorAll("[data-delete-image]").forEach((button) => button.addEventListener("click", deleteProductImage));
}

async function uploadProductImages(event) {
  const files = Array.from(event.currentTarget.files || []);
  event.currentTarget.value = "";
  if (!adminState.selectedProductId || !files.length) return;
  adminEls.productImagesNote.textContent = `Subiendo ${files.length} imagen${files.length === 1 ? "" : "es"}...`;
  adminEls.productImageInput.disabled = true;
  try {
    for (const file of files) {
      if (!PRODUCT_UPLOAD_ALLOWED_TYPES.has(file.type)) throw new Error(`${file.name}: formato no permitido.`);
      if (file.size > PRODUCT_UPLOAD_MAX_BYTES) throw new Error(`${file.name}: maximo 5 MB.`);
      const prepared = await prepareProductImageForUpload(file);
      const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images`, {
        method: "POST",
        body: { originalFilename: prepared.filename, mimeType: prepared.mimeType, dataBase64: prepared.dataBase64 }
      });
      adminState.productImages = images;
    }
    renderProductImages();
    await loadProducts();
    showAdminToast("Imagenes cargadas.");
  } catch (error) {
    renderProductImages(error.message);
  } finally {
    adminEls.productImageInput.disabled = false;
  }
}

async function setPrimaryProductImage(event) {
  const imageId = Number(event.currentTarget.dataset.primaryImage);
  event.currentTarget.disabled = true;
  try {
    const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images/${imageId}/primary`, { method: "PATCH" });
    adminState.productImages = images;
    renderProductImages();
    await loadProducts();
  } catch (error) {
    renderProductImages(error.message);
  }
}

async function deleteProductImage(event) {
  const imageId = Number(event.currentTarget.dataset.deleteImage);
  event.currentTarget.disabled = true;
  try {
    const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images/${imageId}`, { method: "DELETE" });
    adminState.productImages = images;
    renderProductImages();
    await loadProducts();
  } catch (error) {
    renderProductImages(error.message);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
    reader.addEventListener("error", () => reject(new Error(`No se pudo leer ${file.name}.`)));
    reader.readAsDataURL(file);
  });
}

async function prepareProductImageForUpload(file) {
  if (file.type === "image/webp" && file.size <= PRODUCT_UPLOAD_TARGET_BYTES) {
    return { filename: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) };
  }
  try {
    const image = await loadUploadImage(file);
    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("Imagen sin dimensiones validas.");
    const scale = Math.min(1, PRODUCT_UPLOAD_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    if (typeof image.close === "function") image.close();
    const preferredBlob = await canvasToBlob(canvas, "image/webp", PRODUCT_UPLOAD_WEBP_QUALITY);
    const fallbackBlob = preferredBlob || await canvasToBlob(canvas, "image/jpeg", PRODUCT_UPLOAD_JPEG_QUALITY);
    if (!fallbackBlob) throw new Error("No se pudo comprimir la imagen.");
    const useOriginal = file.size <= PRODUCT_UPLOAD_TARGET_BYTES && fallbackBlob.size >= file.size;
    if (useOriginal) {
      return { filename: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) };
    }
    const dataUrl = await blobToDataUrl(fallbackBlob);
    const mimeType = fallbackBlob.type || "image/jpeg";
    return {
      filename: productUploadFilename(file.name, mimeType),
      mimeType,
      dataBase64: String(dataUrl).split(",")[1] || ""
    };
  } catch (error) {
    return { filename: file.name, mimeType: file.type, dataBase64: await fileToBase64(file) };
  }
}

function loadUploadImage(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`No se pudo procesar ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  if (!canvas.toBlob) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen optimizada.")));
    reader.readAsDataURL(blob);
  });
}

function productUploadFilename(filename, mimeType) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const cleanName = String(filename || "producto").replace(/\.[^.]+$/, "");
  return `${cleanName}.${extension}`;
}

function productField(name) {
  return adminEls.productForm.querySelector(`[name="${name}"]`);
}

function toggleCustomerCreatePanel(forceOpen) {
  const open = typeof forceOpen === "boolean" ? forceOpen : adminEls.customerCreatePanel.hidden;
  adminEls.customerCreatePanel.hidden = !open;
  adminEls.toggleCustomerCreate.textContent = open ? "Cerrar alta" : "Crear cliente";
  if (open) {
    refreshCustomerCreateSalesReps();
    syncCustomerCreatePaymentForm();
    adminEls.customerCreateMessage.textContent = "";
    adminEls.customerCreateForm.elements.email?.focus();
  }
}

function refreshCustomerCreateSalesReps() {
  const select = adminEls.customerCreateForm?.elements.salesRepId;
  if (!select) return;
  const selected = Number(select.value || 0);
  select.innerHTML = salesRepOptions(selected);
}

function syncCustomerCreatePaymentForm() {
  const form = adminEls.customerCreateForm;
  if (!form) return;
  const isCredit = normalizeCustomerPaymentCondition(form.elements.paymentCondition?.value) === "credit_account";
  const field = form.querySelector("[data-create-payment-terms]");
  const input = form.elements.paymentTermsDays;
  if (field) field.hidden = !isCredit;
  if (input) {
    input.disabled = !isCredit;
    if (isCredit && !input.value) input.value = "15";
  }
}

async function createCustomerFromAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const body = {
    email: values.email,
    password: values.password,
    businessName: values.businessName,
    taxId: values.taxId,
    taxCondition: values.taxCondition,
    customerType: values.customerType,
    firstName: values.firstName,
    lastName: values.lastName,
    contactPerson: values.contactPerson,
    industry: values.industry,
    province: values.province,
    city: values.city,
    postalCode: values.postalCode,
    address: values.address,
    phone: values.phone,
    whatsapp: values.whatsapp,
    commercialClass: values.commercialClass,
    paymentCondition: values.paymentCondition,
    paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : 0,
    salesRepId: values.salesRepId ? Number(values.salesRepId) : null,
    commissionBps: values.commission === "" ? null : Math.round(Number(values.commission || 0) * 100),
    discount1Bps: Math.round(Number(values.discount1 || 0) * 100),
    discount2Bps: Math.round(Number(values.discount2 || 0) * 100),
    discount3Bps: Math.round(Number(values.discount3 || 0) * 100),
    notes: values.notes || ""
  };
  setBusy(form, true);
  adminEls.customerCreateMessage.textContent = "";
  try {
    const { customer } = await adminApi("/api/admin/customers", { method: "POST", body });
    adminState.selectedCustomerId = customer?.id || null;
    form.reset();
    syncCustomerCreatePaymentForm();
    toggleCustomerCreatePanel(false);
    await loadCustomers();
    showAdminToast("Cliente creado y aprobado.");
  } catch (error) {
    window.KMForms?.showApiError(adminEls.customerCreateForm, error, adminEls.customerCreateMessage);
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

function renderCustomerStats() {
  const counts = Object.fromEntries(Object.keys(statusLabels).map((status) => [status, adminState.customers.filter((customer) => customer.approval_status === status).length]));
  const creditAccounts = adminState.customers.filter((customer) => normalizeCustomerPaymentCondition(customer.payment_condition) === "credit_account").length;
  const withoutSalesRep = adminState.customers.filter((customer) => customer.approval_status === "approved" && !customer.sales_rep_id).length;
  adminEls.customerStats.innerHTML = [
    ["Total", adminState.customers.length],
    ["Pendientes", counts.pending],
    ["Aprobados", counts.approved],
    ["Cuenta corriente", creditAccounts],
    ["Sin vendedor", withoutSalesRep]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderCustomers() {
  const selectedCustomer = adminState.customers.find((customer) => customer.id === adminState.selectedCustomerId);
  if (!adminState.customers.length) {
    adminEls.customerList.innerHTML = `<p class="admin-empty">No hay clientes para este filtro.</p>`;
    return;
  }
  adminEls.customerList.innerHTML = `
    <div class="orders-table-wrap customer-table-wrap">
      <table class="admin-table customer-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Estado</th>
            <th>B/N</th>
            <th>Condicion de pago</th>
            <th>Vendedor</th>
            <th>Ubicacion</th>
            <th>Descuentos</th>
            <th>Ultimo pedido</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${adminState.customers.map((customer) => renderCustomerRow(customer)).join("")}
        </tbody>
      </table>
    </div>
    <div class="customer-mobile-list">
      ${adminState.customers.map((customer) => renderCustomerCard(customer)).join("")}
    </div>
    <div class="customer-detail-panel">
      ${selectedCustomer ? renderCustomerDetail(selectedCustomer) : `<p class="admin-empty">Selecciona un cliente para editar condiciones comerciales.</p>`}
    </div>`;

  bindCustomerControls();
}

function renderCustomerRow(customer) {
  const isSelected = customer.id === adminState.selectedCustomerId;
  return `<tr class="${isSelected ? "selected" : ""}">
    <td class="customer-table-primary"><strong>${escapeAdmin(customer.business_name)}</strong><span>${escapeAdmin(customer.tax_id)}</span><small>${escapeAdmin(customer.email)}</small></td>
    <td>${stateBadge(statusLabels[customer.approval_status] || customer.approval_status, customer.approval_status === "approved" ? "success" : customer.approval_status === "pending" ? "warning" : "neutral")}</td>
    <td>${customerClassBadge(customer.commercial_class)}</td>
    <td class="customer-payment-cell">${customerPaymentTableSummary(customer)}</td>
    <td>${escapeAdmin(customer.sales_rep_name || "Sin vendedor")}<span>${escapeAdmin(customerCommissionText(customer))}</span></td>
    <td class="customer-location-cell"><strong>${escapeAdmin(customer.province || "Sin provincia")}</strong><span>${escapeAdmin(customer.city || "Sin ciudad")}</span><small>${customer.postal_code ? `CP ${escapeAdmin(customer.postal_code)}` : "Sin código postal"}</small></td>
    <td class="customer-discount-cell">${customerDiscountTableSummary(customer)}</td>
    <td class="customer-last-order-cell">${customer.last_order_number ? `<strong>${escapeAdmin(customer.last_order_number)}</strong>${formatOrderListDate(customer.last_order_at)}` : `<span>Sin pedidos</span>`}</td>
    <td><button class="ghost-button row-button customer-action-button" type="button" data-view-customer="${customer.id}">${isSelected ? "Cerrar" : "Editar"}</button></td>
  </tr>`;
}

function renderCustomerCard(customer) {
  const isSelected = customer.id === adminState.selectedCustomerId;
  const statusTone = customer.approval_status === "approved" ? "success" : customer.approval_status === "pending" ? "warning" : "neutral";
  return `
    <article class="customer-mobile-card ${isSelected ? "selected" : ""}">
      <div class="customer-card-top">
        <div class="customer-card-title">
          <strong>${escapeAdmin(customer.business_name)}</strong>
          <span>${escapeAdmin(customer.tax_id)} · ${escapeAdmin(customer.email)}</span>
        </div>
        <div class="customer-card-badges">
          ${customerClassBadge(customer.commercial_class)}
          ${stateBadge(statusLabels[customer.approval_status] || customer.approval_status, statusTone)}
        </div>
      </div>
      <div class="customer-card-meta">
        <div><span>Pago</span><strong>${escapeAdmin(customerPaymentConditionText(customer))}</strong></div>
        <div><span>Vendedor</span><strong>${escapeAdmin(customer.sales_rep_name || "Sin vendedor")}</strong></div>
        <div><span>Ubicacion</span><strong>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)}</strong></div>
        <div><span>Descuentos</span><strong>${escapeAdmin(customerDiscountText(customer))}</strong></div>
      </div>
      <div class="customer-card-footer">
        <span>${customer.last_order_number ? `Ultimo pedido ${escapeAdmin(customer.last_order_number)}` : "Sin pedidos"}</span>
        <button class="ghost-button customer-action-button" type="button" data-view-customer="${customer.id}">${isSelected ? "Cerrar" : "Editar"}</button>
      </div>
    </article>`;
}

function renderCustomerDetail(customer) {
  return `
    <article class="customer-row customer-detail-card customer-editor-card" data-customer-id="${customer.id}">
      <section class="customer-editor-overview">
        <div class="customer-heading customer-editor-heading">
          <div>
            <p class="eyebrow">Ficha comercial</p>
            <strong>${escapeAdmin(customer.business_name)}</strong>
            <span>${escapeAdmin(customer.email)}</span>
          </div>
          <div class="customer-editor-badges">
            ${customerClassBadge(customer.commercial_class)}
            <span class="status-badge ${customer.approval_status}">${statusLabels[customer.approval_status]}</span>
          </div>
        </div>
        <dl class="customer-data customer-editor-data">
          <div><dt>CUIT</dt><dd>${escapeAdmin(customer.tax_id)}</dd></div><div><dt>Condicion fiscal</dt><dd>${escapeAdmin(customer.tax_condition)}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeAdmin(customer.customer_type)}</dd></div><div><dt>Rubro</dt><dd>${escapeAdmin(customer.industry)}</dd></div>
          <div><dt>Ubicacion</dt><dd>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)} ${escapeAdmin(customer.postal_code || "")}</dd></div><div><dt>Contacto</dt><dd>${escapeAdmin(customer.contact_person)}</dd></div>
          <div><dt>Telefono</dt><dd>${escapeAdmin(customer.phone)}</dd></div><div><dt>WhatsApp</dt><dd>${escapeAdmin(customer.whatsapp)}</dd></div>
          <div><dt>Vendedor</dt><dd>${escapeAdmin(customer.sales_rep_name || "Sin asignar")}</dd></div><div><dt>Comision</dt><dd>${escapeAdmin(customerCommissionText(customer))}</dd></div>
          <div><dt>Condicion de pago</dt><dd>${escapeAdmin(customerPaymentConditionText(customer))}</dd></div><div><dt>Descuentos</dt><dd>${escapeAdmin(customerDiscountText(customer))}</dd></div>
        </dl>
        <div class="customer-status-panel">
          <div>
            <p class="eyebrow">Estado global</p>
            <strong>Alta comercial</strong>
            <span>Aproba, rechaza o suspende la cuenta completa.</span>
          </div>
          <div class="status-actions">
            ${renderCustomerStatusActions(customer.approval_status)}
          </div>
        </div>
      </section>
      <section class="customer-config-sections">
        <div class="customer-config-card customer-data-card">
          <div class="customer-config-title">
            <span>1</span>
            <div><strong>Datos del cliente</strong><small>Datos comerciales, contacto y domicilio principal.</small></div>
          </div>
          <form class="customer-data-form">
            <label class="span-2"><span>Razon social</span><input name="businessName" maxlength="180" value="${escapeAdmin(customer.business_name)}" required /></label>
            <label class="span-2"><span>Email de acceso</span><input name="email" type="email" value="${escapeAdmin(customer.email)}" required /></label>
            <label><span>CUIT</span><input name="taxId" value="${escapeAdmin(customer.tax_id)}" required /></label>
            <label><span>Condicion fiscal</span><select name="taxCondition">${renderOptions(CUSTOMER_TAX_CONDITIONS, customer.tax_condition)}</select></label>
            <label><span>Tipo</span><select name="customerType">${renderOptions(CUSTOMER_TYPES, customer.customer_type)}</select></label>
            <label><span>Rubro</span><input name="industry" maxlength="120" value="${escapeAdmin(customer.industry)}" required /></label>
            <label><span>Nombre</span><input name="firstName" maxlength="120" value="${escapeAdmin(customer.first_name)}" required /></label>
            <label><span>Apellido</span><input name="lastName" maxlength="120" value="${escapeAdmin(customer.last_name)}" required /></label>
            <label class="span-2"><span>Contacto comercial</span><input name="contactPerson" maxlength="160" value="${escapeAdmin(customer.contact_person)}" required /></label>
            <label><span>Provincia</span><select name="province">${renderOptions(ARGENTINA_PROVINCES, customer.province)}</select></label>
            <label><span>Localidad</span><input name="city" maxlength="80" value="${escapeAdmin(customer.city)}" required /></label>
            <label><span>Codigo postal</span><input name="postalCode" maxlength="12" value="${escapeAdmin(customer.postal_code || "")}" required /></label>
            <label class="span-2"><span>Direccion</span><input name="address" maxlength="240" value="${escapeAdmin(customer.address)}" required /></label>
            <label><span>Telefono</span><input name="phone" value="${escapeAdmin(customer.phone)}" required /></label>
            <label><span>WhatsApp</span><input name="whatsapp" value="${escapeAdmin(customer.whatsapp)}" required /></label>
            <label class="wide"><span>Notas internas</span><textarea name="notes" rows="3" maxlength="2000">${escapeAdmin(customer.notes || "")}</textarea></label>
            <button class="ghost-button wide" type="submit">Guardar datos del cliente</button>
          </form>
        </div>
        ${renderAdminShippingAddresses(customer)}
        <div class="customer-config-card customer-discount-card">
          <div class="customer-config-title">
            <span>3</span>
            <div><strong>Descuentos globales</strong><small>Descuentos comerciales generales para toda la cuenta.</small></div>
          </div>
          <form class="discount-form">
            <label><span>Desc. 1 (%)</span><input name="discount1" type="number" min="0" max="100" step="0.01" value="${customer.discount_1_bps / 100}" /></label>
            <label><span>Desc. 2 (%)</span><input name="discount2" type="number" min="0" max="100" step="0.01" value="${customer.discount_2_bps / 100}" /></label>
            <label><span>Desc. 3 (%)</span><input name="discount3" type="number" min="0" max="100" step="0.01" value="${customer.discount_3_bps / 100}" /></label>
            <button class="ghost-button" type="submit">Guardar descuentos</button>
          </form>
        </div>
        <div class="customer-config-card customer-product-discount-card">
          <div class="customer-config-title">
            <span>4</span>
            <div><strong>Descuentos por productos</strong><small>Condiciones especiales adicionales por codigo KM.</small></div>
          </div>
          <form class="product-discount-form">
            <label><span>Codigo KM</span><input name="kmCode" placeholder="Ej: CP171K" required /></label>
            <label><span>Desc. adicional (%)</span><input name="discountPercent" type="number" min="0.01" max="100" step="0.01" required /></label>
            <label><span>Desde</span><input name="startsAt" type="date" /></label>
            <label><span>Hasta</span><input name="endsAt" type="date" /></label>
            <label class="checkbox-label"><input name="active" type="checkbox" checked /><span>Activo</span></label>
            <label class="wide"><span>Nota interna</span><input name="note" maxlength="500" placeholder="Ej: acuerdo especial julio" /></label>
            <button class="ghost-button wide" type="submit">Guardar precio especial</button>
          </form>
          <div class="customer-special-discounts">
            ${renderCustomerProductDiscounts(customer)}
          </div>
        </div>
        <div class="customer-config-card customer-sales-card">
          <div class="customer-config-title">
            <span>5</span>
            <div><strong>Asignacion vendedor y comisiones</strong><small>Vendedor asociado y porcentaje aplicado a la cuenta.</small></div>
          </div>
          <form class="sales-assignment-form">
            <div class="sales-summary wide">Asignacion comercial: <strong>${escapeAdmin(customer.sales_rep_name || "sin vendedor")}</strong></div>
            <label><span>Vendedor</span><select name="salesRepId">${salesRepOptions(customer.sales_rep_id)}</select></label>
            <label><span>Comision cliente (%)</span><input name="commission" type="number" min="0" max="100" step="0.01" value="${customer.sales_commission_bps === null || customer.sales_commission_bps === undefined ? "" : customer.sales_commission_bps / 100}" placeholder="General" /></label>
            <button class="ghost-button" type="submit">Guardar vendedor</button>
          </form>
        </div>
        <div class="customer-config-card customer-class-card">
          <div class="customer-config-title">
            <span>6</span>
            <div><strong>Categorizacion B/N</strong><small>Marca interna visible en pedidos y gestion comercial.</small></div>
          </div>
          <form class="customer-class-form">
            <div class="sales-summary wide">Marca interna: ${customerClassBadge(customer.commercial_class)}</div>
            <label><span>B / N</span><select name="commercialClass">${customerClassOptions(customer.commercial_class)}</select></label>
            <button class="ghost-button" type="submit">Guardar</button>
          </form>
        </div>
        <div class="customer-config-card customer-payment-card">
          <div class="customer-config-title">
            <span>7</span>
            <div><strong>Condicion de pago</strong><small>Condicion sugerida al recibir nuevos pedidos.</small></div>
          </div>
          <form class="customer-payment-form">
            <div class="sales-summary wide">Condicion de pago: <strong>${escapeAdmin(customerPaymentConditionText(customer))}</strong></div>
            <label><span>Condicion</span><select name="paymentCondition">${customerPaymentOptions(customer.payment_condition)}</select></label>
            <label data-payment-terms-field ${normalizeCustomerPaymentCondition(customer.payment_condition) === "credit_account" ? "" : "hidden"}><span>Dias cta. cte.</span><input name="paymentTermsDays" type="number" min="1" max="365" step="1" value="${customer.payment_terms_days || 15}" ${normalizeCustomerPaymentCondition(customer.payment_condition) === "credit_account" ? "" : "disabled"} /></label>
            <button class="ghost-button" type="submit">Guardar condicion</button>
          </form>
        </div>
        <div class="customer-config-card customer-accounts-card">
          <div class="customer-config-title">
            <span>8</span>
            <div><strong>Asignacion cuenta de cobro</strong><small>Cuentas habilitadas para transferencias de este cliente.</small></div>
          </div>
          <form class="customer-payment-accounts-form">
            <div class="sales-summary wide">Cuentas de cobro habilitadas</div>
            ${renderCustomerPaymentAccounts(customer)}
            <button class="ghost-button wide" type="submit">Guardar cuentas</button>
          </form>
        </div>
      </section>
    </article>`;
}

function renderAdminShippingAddresses(customer) {
  const addresses = adminState.customerShippingAddresses[customer.id];
  const editing = (addresses || []).find((address) => Number(address.id) === Number(adminState.editingCustomerShippingAddress[customer.id])) || {};
  return `<div class="customer-config-card customer-shipping-card">
    <div class="customer-config-title">
      <span>2</span>
      <div><strong>Lugares de entrega</strong><small>Direcciones que pueden usar KM, el vendedor y el cliente al generar pedidos.</small></div>
    </div>
    ${!addresses ? `<p class="admin-note">Cargando lugares de entrega...</p>` : `
      <div class="customer-shipping-list">
        ${addresses.map((address) => `<article class="customer-shipping-row">
          <div><strong>${escapeAdmin(address.label)}</strong>${address.isDefault ? stateBadge("Principal", "success") : ""}</div>
          <span>${escapeAdmin(address.recipient)} · ${escapeAdmin(address.address)}, ${escapeAdmin(address.city)}, ${escapeAdmin(address.province)} (${escapeAdmin(address.postalCode)})</span>
          <small>${escapeAdmin(address.contactPhone)}${address.preferredTransport ? ` · ${escapeAdmin(address.preferredTransport)}` : ""}</small>
          <div class="status-actions">
            <button type="button" data-admin-edit-shipping="${address.id}">Editar</button>
            ${address.isDefault ? "" : `<button type="button" data-admin-default-shipping="${address.id}">Hacer principal</button>`}
            ${addresses.length > 1 ? `<button type="button" data-admin-delete-shipping="${address.id}">Eliminar</button>` : ""}
          </div>
        </article>`).join("")}
      </div>
      <form class="customer-shipping-form">
        <input name="addressId" type="hidden" value="${editing.id || ""}" />
        <label><span>Nombre del lugar</span><input name="label" maxlength="80" value="${escapeAdmin(editing.label || "")}" placeholder="Principal, Deposito..." required /></label>
        <label><span>Quien recibe</span><input name="recipient" maxlength="120" value="${escapeAdmin(editing.recipient || "")}" required /></label>
        <label class="span-2"><span>Direccion</span><input name="address" maxlength="180" value="${escapeAdmin(editing.address || "")}" required /></label>
        <label><span>Localidad</span><input name="city" maxlength="80" value="${escapeAdmin(editing.city || "")}" required /></label>
        <label><span>Provincia</span><select name="province" required>${renderOptions(ARGENTINA_PROVINCES, editing.province)}</select></label>
        <label><span>Codigo postal</span><input name="postalCode" maxlength="12" value="${escapeAdmin(editing.postalCode || "")}" required /></label>
        <label><span>Telefono de recepcion</span><input name="contactPhone" value="${escapeAdmin(editing.contactPhone || "")}" required /></label>
        <label><span>Transporte preferido</span><input name="preferredTransport" maxlength="120" value="${escapeAdmin(editing.preferredTransport || "")}" /></label>
        <label class="span-2"><span>Indicaciones de entrega</span><textarea name="notes" maxlength="500">${escapeAdmin(editing.notes || "")}</textarea></label>
        <div class="customer-shipping-actions span-2">
          <button class="ghost-button" type="submit">${editing.id ? "Guardar cambios" : "Agregar lugar"}</button>
          ${editing.id ? `<button class="ghost-button" type="button" data-admin-cancel-shipping>Cancelar</button>` : ""}
        </div>
      </form>`}
  </div>`;
}

function renderCustomerStatusActions(status) {
  const currentStatus = status || "pending";
  const currentLabels = {
    approved: "Aprobado",
    rejected: "Rechazado",
    suspended: "Suspendido"
  };
  return [
    { value: "approved", label: "Aprobar", className: "approve" },
    { value: "rejected", label: "Rechazar", className: "" },
    { value: "suspended", label: "Suspender", className: "" }
  ].map((action) => {
    const isCurrent = action.value === currentStatus;
    const classes = [action.className, isCurrent ? "is-current" : ""].filter(Boolean).join(" ");
    const disabled = isCurrent ? ` disabled aria-disabled="true"` : "";
    const label = isCurrent ? currentLabels[action.value] : action.label;
    return `<button class="${classes}" type="button" data-customer-status="${action.value}"${disabled}>${label}</button>`;
  }).join("");
}

function bindCustomerControls() {
  adminEls.customerList.querySelectorAll("[data-view-customer]").forEach((button) => button.addEventListener("click", viewCustomerDetail));
  adminEls.customerList.querySelectorAll("[data-customer-status]").forEach((button) => button.addEventListener("click", updateCustomerStatus));
  adminEls.customerList.querySelectorAll(".customer-data-form").forEach((form) => form.addEventListener("submit", saveCustomerProfile));
  adminEls.customerList.querySelectorAll(".discount-form").forEach((form) => form.addEventListener("submit", saveDiscounts));
  adminEls.customerList.querySelectorAll(".sales-assignment-form").forEach((form) => form.addEventListener("submit", saveCustomerSalesRep));
  adminEls.customerList.querySelectorAll(".customer-class-form").forEach((form) => form.addEventListener("submit", saveCustomerClass));
  adminEls.customerList.querySelectorAll(".customer-payment-form").forEach((form) => {
    form.addEventListener("submit", saveCustomerPaymentTerms);
    form.elements.paymentCondition?.addEventListener("change", () => syncCustomerPaymentForm(form));
    syncCustomerPaymentForm(form);
  });
  adminEls.customerList.querySelectorAll(".customer-payment-accounts-form").forEach((form) => form.addEventListener("submit", saveCustomerPaymentAccounts));
  adminEls.customerList.querySelectorAll(".product-discount-form").forEach((form) => form.addEventListener("submit", saveCustomerProductDiscount));
  adminEls.customerList.querySelectorAll("[data-delete-product-discount]").forEach((button) => button.addEventListener("click", deleteCustomerProductDiscount));
  adminEls.customerList.querySelectorAll(".customer-shipping-form").forEach((form) => form.addEventListener("submit", saveAdminShippingAddress));
  adminEls.customerList.querySelectorAll("[data-admin-edit-shipping]").forEach((button) => button.addEventListener("click", editAdminShippingAddress));
  adminEls.customerList.querySelectorAll("[data-admin-cancel-shipping]").forEach((button) => button.addEventListener("click", cancelAdminShippingAddress));
  adminEls.customerList.querySelectorAll("[data-admin-default-shipping]").forEach((button) => button.addEventListener("click", defaultAdminShippingAddress));
  adminEls.customerList.querySelectorAll("[data-admin-delete-shipping]").forEach((button) => button.addEventListener("click", deleteAdminShippingAddress));
}

async function viewCustomerDetail(event) {
  const customerId = Number(event.currentTarget.dataset.viewCustomer);
  if (adminState.selectedCustomerId === customerId) {
    adminState.selectedCustomerId = null;
    renderCustomers();
    return;
  }
  adminState.selectedCustomerId = customerId;
  renderCustomers();
  await Promise.all([
    loadCustomerProductDiscounts(adminState.selectedCustomerId, false),
    loadCustomerPaymentAccounts(adminState.selectedCustomerId, false),
    loadAdminShippingAddresses(adminState.selectedCustomerId, false)
  ]);
  renderCustomers();
}

async function loadCustomerProductDiscounts(customerId, shouldRender = true) {
  const { discounts } = await adminApi(`/api/admin/customers/${customerId}/product-discounts`);
  adminState.customerProductDiscounts[customerId] = discounts || [];
  if (shouldRender) renderCustomers();
}

async function loadCustomerPaymentAccounts(customerId, shouldRender = true) {
  adminState.customerPaymentAccounts[customerId] = await adminApi(`/api/admin/customers/${customerId}/payment-accounts`);
  if (shouldRender) renderCustomers();
}

function renderCustomerPaymentAccounts(customer) {
  const assignment = adminState.customerPaymentAccounts[customer.id];
  if (!assignment) return `<p class="admin-note wide">Abrir cliente para cargar cuentas de cobro.</p>`;
  const accounts = assignment.accounts || [];
  if (!accounts.length) return `<p class="admin-note wide">No hay cuentas de cobro activas en configuracion.</p>`;
  return `
    <div class="customer-payment-account-grid wide">
      ${accounts.map((account) => `
        <label class="customer-payment-account-option ${account.assigned ? "selected" : ""}">
          <input type="checkbox" name="accountIds" value="${account.id}" ${account.assigned ? "checked" : ""} />
          <span>
            <strong>${escapeAdmin(account.name)}</strong>
            <small>${escapeAdmin(paymentAccountSummary(account))}</small>
          </span>
          <span class="primary-choice">
            <input type="radio" name="primaryAccountId" value="${account.id}" ${account.isPrimary ? "checked" : ""} />
            Principal
          </span>
        </label>
      `).join("")}
    </div>
    <p class="admin-note wide">Si no marcas ninguna cuenta, el cliente usara la cuenta general activa.</p>`;
}

async function saveCustomerPaymentAccounts(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const accountIds = [...form.querySelectorAll("input[name='accountIds']:checked")].map((input) => Number(input.value));
  let primaryAccountId = Number(form.querySelector("input[name='primaryAccountId']:checked")?.value || 0);
  if (primaryAccountId && !accountIds.includes(primaryAccountId)) primaryAccountId = accountIds[0] || 0;
  setBusy(form, true);
  try {
    adminState.customerPaymentAccounts[customerId] = await adminApi(`/api/admin/customers/${customerId}/payment-accounts`, {
      method: "PUT",
      body: { accountIds, primaryAccountId: primaryAccountId || null }
    });
    showAdminToast("Cuentas de cobro guardadas.");
    renderCustomers();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

function renderCustomerProductDiscounts(customer) {
  const discounts = adminState.customerProductDiscounts[customer.id];
  if (!discounts) return `<p class="admin-note">Abrir cliente para cargar condiciones especiales por producto.</p>`;
  if (!discounts.length) return `<p class="admin-note">Sin precios especiales por producto.</p>`;
  return `
    <div class="special-discount-list">
      ${discounts.map((discount) => `
        <div class="special-discount-row ${discount.active ? "" : "inactive"}">
          <div>
            <strong>${escapeAdmin(discount.kmCode)} <span>${formatBps(discount.discountBps)}</span></strong>
            <small>${escapeAdmin(discount.productName)}</small>
            <small>${escapeAdmin(productDiscountValidityText(discount))}${discount.note ? ` · ${escapeAdmin(discount.note)}` : ""}</small>
          </div>
          <button class="ghost-button danger-button" type="button" data-delete-product-discount="${discount.id}">Eliminar</button>
        </div>
      `).join("")}
    </div>`;
}

function productDiscountValidityText(discount) {
  const dates = [];
  if (discount.startsAt) dates.push(`desde ${discount.startsAt}`);
  if (discount.endsAt) dates.push(`hasta ${discount.endsAt}`);
  return `${discount.active ? "Activo" : "Inactivo"}${dates.length ? ` · ${dates.join(" ")}` : " · sin vencimiento"}`;
}

function salesRepOptions(selectedId) {
  return [
    `<option value="">Sin vendedor</option>`,
    ...adminState.salesReps
      .filter((rep) => rep.status === "active" || rep.id === selectedId)
      .map((rep) => `<option value="${rep.id}" ${rep.id === selectedId ? "selected" : ""}>${escapeAdmin(rep.name)} - ${formatBps(rep.default_commission_bps)}</option>`)
  ].join("");
}

function customerCommissionText(customer) {
  if (!customer.sales_rep_id) return "Sin vendedor";
  if (customer.sales_commission_bps !== null && customer.sales_commission_bps !== undefined) return `${formatBps(customer.sales_commission_bps)} especial`;
  return `${formatBps(customer.sales_rep_default_commission_bps || 0)} general`;
}

function customerDiscountText(customer) {
  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps]
    .filter((value) => Number(value || 0) > 0)
    .map((value) => formatBps(value));
  return discounts.length ? discounts.join(" + ") : "Sin descuentos";
}

function customerClassOptions(selectedClass) {
  const selected = normalizeCustomerClass(selectedClass);
  return ["B", "N"].map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function normalizeCustomerClass(value) {
  return String(value || "B").toUpperCase() === "N" ? "N" : "B";
}

function customerClassBadge(value) {
  const letter = normalizeCustomerClass(value);
  return `<span class="customer-class-badge ${letter.toLowerCase()}">${letter}</span>`;
}

function customerPaymentTableSummary(customer) {
  const condition = normalizeCustomerPaymentCondition(customer.payment_condition);
  if (condition === "credit_account") {
    return `<span class="customer-table-stack"><strong>Cuenta corriente</strong><small>${Number(customer.payment_terms_days || 15)} días</small></span>`;
  }
  return `<span class="customer-table-stack"><strong>Pago anticipado</strong><small>Sin plazo</small></span>`;
}

function customerDiscountTableSummary(customer) {
  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps]
    .filter((value) => Number(value || 0) > 0)
    .map((value) => formatBps(value));
  if (!discounts.length) return `<span class="customer-table-stack"><strong>Sin descuentos</strong><small>Condición general</small></span>`;
  const firstLine = discounts.slice(0, 2).join(" + ");
  const secondLine = discounts.length > 2 ? `+ ${discounts[2]}` : `${discounts.length} nivel${discounts.length === 1 ? "" : "es"}`;
  return `<span class="customer-table-stack"><strong>${escapeAdmin(firstLine)}</strong><small>${escapeAdmin(secondLine)}</small></span>`;
}

async function loadAdminShippingAddresses(customerId, shouldRender = true) {
  const payload = await adminApi(`/api/admin/customers/${customerId}/shipping-addresses`);
  adminState.customerShippingAddresses[customerId] = payload.addresses || [];
  if (shouldRender) renderCustomers();
}

function editAdminShippingAddress(event) {
  const customerId = Number(event.currentTarget.closest("[data-customer-id]").dataset.customerId);
  adminState.editingCustomerShippingAddress[customerId] = Number(event.currentTarget.dataset.adminEditShipping);
  renderCustomers();
}

function cancelAdminShippingAddress(event) {
  const customerId = Number(event.currentTarget.closest("[data-customer-id]").dataset.customerId);
  adminState.editingCustomerShippingAddress[customerId] = null;
  renderCustomers();
}

async function saveAdminShippingAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const body = Object.fromEntries(new FormData(form).entries());
  const addressId = body.addressId;
  delete body.addressId;
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/shipping-addresses${addressId ? `/${addressId}` : ""}`, {
      method: addressId ? "PUT" : "POST",
      body
    });
    adminState.editingCustomerShippingAddress[customerId] = null;
    await loadAdminShippingAddresses(customerId, false);
    showAdminToast(addressId ? "Lugar de entrega actualizado." : "Lugar de entrega agregado.");
    renderCustomers();
  } catch (error) {
    showAdminToast(error.message || "No se pudo guardar el lugar de entrega.");
    setBusy(form, false);
  }
}

async function defaultAdminShippingAddress(event) {
  const button = event.currentTarget;
  const customerId = Number(button.closest("[data-customer-id]").dataset.customerId);
  try {
    await adminApi(`/api/admin/customers/${customerId}/shipping-addresses/${button.dataset.adminDefaultShipping}/default`, { method: "PATCH", body: {} });
    await loadAdminShippingAddresses(customerId, false);
    showAdminToast("Lugar de entrega principal actualizado.");
    renderCustomers();
  } catch (error) {
    showAdminToast(error.message || "No se pudo cambiar el lugar principal.");
  }
}

async function deleteAdminShippingAddress(event) {
  const button = event.currentTarget;
  const customerId = Number(button.closest("[data-customer-id]").dataset.customerId);
  if (!window.confirm("Eliminar este lugar de entrega?")) return;
  try {
    await adminApi(`/api/admin/customers/${customerId}/shipping-addresses/${button.dataset.adminDeleteShipping}`, { method: "DELETE" });
    adminState.editingCustomerShippingAddress[customerId] = null;
    await loadAdminShippingAddresses(customerId, false);
    showAdminToast("Lugar de entrega eliminado.");
    renderCustomers();
  } catch (error) {
    showAdminToast(error.message || "No se pudo eliminar el lugar de entrega.");
  }
}

function renderOptions(values, selectedValue) {
  const selected = String(selectedValue || "");
  const options = selected && !values.includes(selected) ? [selected, ...values] : values;
  return options.map((value) => `<option value="${escapeAdmin(value)}" ${value === selected ? "selected" : ""}>${escapeAdmin(value)}</option>`).join("");
}

function normalizeCustomerPaymentCondition(value) {
  const normalized = String(value || "advance_payment").trim();
  return normalized === "credit_account" ? "credit_account" : "advance_payment";
}

function customerPaymentOptions(selectedCondition) {
  const selected = normalizeCustomerPaymentCondition(selectedCondition);
  return [
    ["advance_payment", "Pago anticipado"],
    ["credit_account", "Cuenta corriente"]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function customerPaymentConditionText(customer) {
  const condition = normalizeCustomerPaymentCondition(customer.payment_condition);
  if (condition === "credit_account") return `Cuenta corriente ${customer.payment_terms_days || 15} dias`;
  return "Pago anticipado";
}

function syncCustomerPaymentForm(form) {
  const isCredit = normalizeCustomerPaymentCondition(form.elements.paymentCondition?.value) === "credit_account";
  const field = form.querySelector("[data-payment-terms-field]");
  const input = form.elements.paymentTermsDays;
  if (field) field.hidden = !isCredit;
  if (input) {
    input.disabled = !isCredit;
    if (!isCredit) input.value = "";
    if (isCredit && !input.value) input.value = "15";
  }
}

async function saveCustomerProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/profile`, {
      method: "PATCH",
      body: {
        businessName: values.businessName,
        email: values.email,
        taxId: values.taxId,
        taxCondition: values.taxCondition,
        customerType: values.customerType,
        firstName: values.firstName,
        lastName: values.lastName,
        contactPerson: values.contactPerson,
        industry: values.industry,
        province: values.province,
        city: values.city,
        postalCode: values.postalCode,
        address: values.address,
        phone: values.phone,
        whatsapp: values.whatsapp,
        notes: values.notes || ""
      }
    });
    showAdminToast("Datos del cliente guardados.");
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function updateCustomerStatus(event) {
  const row = event.currentTarget.closest("[data-customer-id]");
  const customerId = Number(row.dataset.customerId);
  const status = event.currentTarget.dataset.customerStatus;
  const commercialClass = row.querySelector(".customer-class-form select[name='commercialClass']")?.value || "B";
  event.currentTarget.disabled = true;
  try {
    await adminApi(`/api/admin/customers/${customerId}/status`, { method: "PATCH", body: { status, commercialClass } });
    showAdminToast(`Cliente ${statusLabels[status].toLowerCase()}.`);
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
    event.currentTarget.disabled = false;
  }
}

async function saveCustomerClass(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/commercial-class`, {
      method: "PATCH",
      body: { commercialClass: values.commercialClass }
    });
    showAdminToast("Marca interna guardada.");
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function saveCustomerPaymentTerms(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  const paymentCondition = normalizeCustomerPaymentCondition(values.paymentCondition);
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/payment-terms`, {
      method: "PATCH",
      body: {
        paymentCondition,
        paymentTermsDays: paymentCondition === "credit_account" ? Number(values.paymentTermsDays || 15) : 0
      }
    });
    showAdminToast("Condicion de pago guardada.");
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function saveDiscounts(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  const discountsBps = [values.discount1, values.discount2, values.discount3].map((value) => Math.round(Number(value || 0) * 100));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/discounts`, { method: "PATCH", body: { discountsBps } });
    showAdminToast("Descuentos guardados en cascada.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function saveCustomerProductDiscount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/product-discounts`, {
      method: "POST",
      body: {
        kmCode: values.kmCode,
        discountBps: Math.round(Number(values.discountPercent || 0) * 100),
        startsAt: values.startsAt || "",
        endsAt: values.endsAt || "",
        active: Boolean(form.elements.active.checked),
        note: values.note || ""
      }
    });
    form.reset();
    form.elements.active.checked = true;
    showAdminToast("Precio especial guardado.");
    await loadCustomerProductDiscounts(customerId);
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function deleteCustomerProductDiscount(event) {
  const button = event.currentTarget;
  const customerId = Number(button.closest("[data-customer-id]").dataset.customerId);
  const discountId = Number(button.dataset.deleteProductDiscount);
  button.disabled = true;
  try {
    await adminApi(`/api/admin/customers/${customerId}/product-discounts/${discountId}`, { method: "DELETE" });
    showAdminToast("Precio especial eliminado.");
    await loadCustomerProductDiscounts(customerId);
  } catch (error) {
    showAdminToast(error.message);
    button.disabled = false;
  }
}

async function saveCustomerSalesRep(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/sales-rep`, {
      method: "PATCH",
      body: {
        salesRepId: values.salesRepId ? Number(values.salesRepId) : null,
        commissionBps: values.commission === "" ? null : Math.round(Number(values.commission || 0) * 100)
      }
    });
    showAdminToast("Vendedor asignado al cliente.");
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

function handleOrderScopeClick(event) {
  const button = event.target.closest("[data-order-scope]");
  if (!button || !adminEls.orderScopeTabs.contains(button)) return;
  const nextScope = button.dataset.orderScope === "history" ? "history" : "active";
  if (nextScope === adminState.orderScope) return;
  adminState.orderSearches[adminState.orderScope] = adminEls.orderSearch.value.trim();
  adminState.orderScope = nextScope;
  adminEls.orderSearch.value = adminState.orderSearches[nextScope] || "";
  adminEls.orderStageFilter.value = "";
  adminEls.orderPaymentFilter.value = "";
  closeOrderDetail();
  syncOrderScopeControls();
  loadOrders();
}

function syncOrderScopeControls() {
  const isHistory = adminState.orderScope === "history";
  adminEls.orderScopeTabs?.querySelectorAll("[data-order-scope]").forEach((button) => {
    const selected = button.dataset.orderScope === adminState.orderScope;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  if (adminEls.orderSearch) {
    adminEls.orderSearch.placeholder = isHistory ? "Buscar en el histórico" : "Buscar en pedidos activos";
    adminEls.orderSearch.setAttribute("aria-label", `${isHistory ? "Buscar en el histórico" : "Buscar en pedidos activos"} por número, cliente o CUIT`);
  }
  if (adminEls.orderStageFilter) {
    adminEls.orderStageFilter.options[0].textContent = isHistory ? "Todos los históricos" : "Todas las etapas";
    [...adminEls.orderStageFilter.options].slice(1).forEach((option) => {
      const visible = option.dataset.orderScope === adminState.orderScope;
      option.hidden = !visible;
      option.disabled = !visible;
    });
  }
  if (adminEls.orderOpsStats) adminEls.orderOpsStats.hidden = isHistory;
}

async function loadOrders() {
  const requestedScope = adminState.orderScope;
  const params = new URLSearchParams();
  params.set("scope", requestedScope);
  if (adminEls.orderSearch.value.trim()) params.set("q", adminEls.orderSearch.value.trim());
  if (adminEls.orderStageFilter.value) params.set("stage", adminEls.orderStageFilter.value);
  if (adminEls.orderPaymentFilter.value) params.set("payment", adminEls.orderPaymentFilter.value);
  const { orders, scopes = {} } = await adminApi(`/api/admin/orders?${params}`);
  if (requestedScope !== adminState.orderScope) return;
  adminState.orderSearches[adminState.orderScope] = adminEls.orderSearch.value.trim();
  adminEls.activeOrdersCount.textContent = Number(scopes.active || 0);
  adminEls.historyOrdersCount.textContent = Number(scopes.history || 0);
  adminState.orders = orders;
  if (adminState.orderScope === "active") renderOrderOpsStats(orders);
  adminEls.ordersTableBody.innerHTML = orders.length ? orders.map((order) => {
    const nextAction = orderNextAction(order.stage, order.payment_status, order.balance_cents);
    return `
    <tr class="order-list-card ${escapeAdmin(nextAction.tone)}"><td data-label="Pedido"><div class="order-code-cell">${customerClassBadge(order.commercial_class)}<strong>${escapeAdmin(order.order_number)}</strong></div></td><td class="order-customer-cell" data-label="Cliente"><strong>${escapeAdmin(order.business_name)}</strong></td>
      <td data-label="Origen">${orderOriginBadge(order)}</td>
      <td class="order-list-next-action ${escapeAdmin(nextAction.tone)}" data-label="Próxima acción"><strong>${escapeAdmin(nextAction.short)}</strong></td>
      <td data-label="Pago">${stateBadge(paymentStatusText(order.payment_status), paymentStateClasses[order.payment_status])}</td>
      <td data-label="Total">${adminMoney.format(order.total_cents / 100)}</td><td data-label="Fecha">${formatOrderListDate(order.created_at)}</td>
      <td data-label="Detalle"><button class="ghost-button row-button" type="button" data-view-order="${order.id}">Ver</button></td></tr>`;
  }).join("") : `<tr><td colspan="8">${adminState.orderScope === "history" ? "No hay pedidos históricos para esta búsqueda." : "No hay pedidos activos para este filtro."}</td></tr>`;
}

async function loadUnfulfilledDemand() {
  if (!adminEls.unfulfilledDemandList) return;
  const params = new URLSearchParams();
  if (adminEls.unfulfilledDemandSearch?.value.trim()) params.set("q", adminEls.unfulfilledDemandSearch.value.trim());
  if (adminEls.unfulfilledDemandFrom?.value) params.set("from", adminEls.unfulfilledDemandFrom.value);
  if (adminEls.unfulfilledDemandTo?.value) params.set("to", adminEls.unfulfilledDemandTo.value);
  if (adminEls.unfulfilledDemandReason?.value) params.set("reason", adminEls.unfulfilledDemandReason.value);
  const report = await adminApi(`/api/admin/unfulfilled-demand${params.toString() ? `?${params}` : ""}`);
  adminState.unfulfilledDemand = report;
  if (adminEls.unfulfilledDemandReason && adminEls.unfulfilledDemandReason.options.length === 1) {
    adminEls.unfulfilledDemandReason.insertAdjacentHTML("beforeend", report.reasons.map((reason) => `<option value="${escapeAdmin(reason.code)}">${escapeAdmin(reason.label)}</option>`).join(""));
  }
  const summary = report.summary || {};
  adminEls.unfulfilledDemandSummary.innerHTML = [
    ["Líneas afectadas", summary.affectedLines || 0],
    ["Unidades solicitadas", summary.requestedUnits || 0],
    ["Unidades no atendidas", summary.unfulfilledUnits || 0],
    ["Cumplimiento", `${Number(summary.fulfillmentPercent || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`],
    ["Valor potencial", adminMoney.format(Number(summary.unfulfilledValueCents || 0) / 100)]
  ].map(([label, value]) => `<div><span>${escapeAdmin(label)}</span><strong>${escapeAdmin(value)}</strong></div>`).join("");
  adminEls.unfulfilledDemandList.innerHTML = report.rows.length ? report.rows.map((row) => `
    <tr>
      <td data-label="Pedido / cliente"><strong>${escapeAdmin(row.orderNumber)}</strong><small>${escapeAdmin(row.customer)} · ${formatDate(row.date)}</small><button class="ghost-button compact-button" type="button" data-demand-order="${row.orderId}">Ver pedido</button></td>
      <td data-label="Producto"><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)} · ${escapeAdmin(row.family)}</small></td>
      <td data-label="Solicitado">${row.requestedQuantity} u.</td>
      <td data-label="Confirmado">${row.confirmedQuantity} u.</td>
      <td class="unfulfilled-quantity" data-label="No atendido"><strong>${row.unfulfilledQuantity} u.</strong></td>
      <td data-label="Cumplimiento">${Number(row.fulfillmentPercent || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</td>
      <td data-label="Valor potencial">${adminMoney.format(row.unfulfilledValueCents / 100)}</td>
      <td data-label="Motivo"><strong>${escapeAdmin(row.reasonLabel)}</strong>${row.note ? `<small>${escapeAdmin(row.note)}</small>` : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="8">No hay diferencias de disponibilidad para estos filtros.</td></tr>`;
}

function orderStageText(stage) {
  return orderStageLabels[stage] || "En seguimiento";
}

function orderNextAction(stage, paymentStatus = "", balanceCents = 0) {
  if (stage === "cancelled") return {
    title: "Pedido cancelado",
    short: "Sin acciones pendientes",
    body: "No hay acciones operativas pendientes. Los ajustes manuales quedan bloqueados para preservar el historial.",
    tone: "danger"
  };
  if (stage === "delivered") return {
    title: "Pedido recibido por el cliente",
    short: "Operación finalizada",
    body: "El cliente confirmó la recepción. La operación queda cerrada como historial y no hay acciones de despacho pendientes.",
    tone: "done"
  };
  if (stage === "shipped") return {
    title: "Esperando recepción del cliente",
    short: "Esperar confirmación de recepción",
    body: "El pedido ya fue despachado. No hay acciones operativas pendientes hasta que el cliente confirme la recepción desde Mis compras.",
    tone: "done"
  };
  if (stage === "review_availability") return {
    title: "Próxima acción: preparar y confirmar disponibilidad",
    short: "Confirmar disponibilidad",
    body: "Imprimí la preparación, controlá los artículos disponibles, ajustá parciales si corresponde y confirmá la disponibilidad al cliente.",
    tone: "info"
  };
  if (stage === "awaiting_acceptance") return {
    title: "Próxima acción: esperar aceptación del cliente",
    short: "Esperar aceptación del cliente",
    body: "El pedido tuvo cambios de cantidades o artículos. El cliente debe aceptar la propuesta antes de avanzar con el pago o la preparación.",
    tone: "warning"
  };
  if (paymentStatus === "overdue") return {
    title: "Saldo vencido",
    short: "Revisar saldo vencido",
    body: `El pedido tiene saldo vencido por ${adminMoney.format((balanceCents || 0) / 100)}. Revisá la condición comercial antes de avanzar.`,
    tone: "danger"
  };
  if (paymentStatus === "receipt_uploaded") return {
    title: "Próxima acción: revisar comprobante",
    short: "Revisar comprobante de pago",
    body: "Hay un comprobante cargado. Aceptalo si el pago está acreditado o rechazalo indicando el motivo.",
    tone: "progress"
  };
  if (paymentStatus === "rejected") return {
    title: "Próxima acción: corregir pago",
    short: "Coordinar corrección del pago",
    body: "El último comprobante fue rechazado. Esperá una nueva carga del cliente o coordiná la corrección por WhatsApp o email.",
    tone: "danger"
  };
  if (stage === "awaiting_payment") return {
    title: "Próxima acción: esperar comprobante de pago",
    short: "Esperar comprobante de pago",
    body: "La disponibilidad ya fue confirmada. El cliente debe cargar o enviar el comprobante para avanzar con la preparación y el despacho.",
    tone: "warning"
  };
  if (stage === "ready_to_prepare") return {
    title: "Próxima acción: preparar pedido",
    short: "Preparar pedido",
    body: "Imprimí la preparación, controlá artículos y bultos, y marcá el pedido como preparado para despacho.",
    tone: "success"
  };
  if (stage === "preparing") return {
    title: "Logística está preparando el pedido",
    short: "Preparación, embalaje y rotulado",
    body: "El pedido está asignado a un operario y se encuentra en preparación.",
    tone: "success"
  };
  if (stage === "prepared") return {
    title: "Próxima acción: despachar pedido",
    short: "Completar datos y despachar",
    body: "Cargá modalidad, transporte, guía o remito y fecha de salida. Luego marcá el pedido como despachado.",
    tone: "progress"
  };
  return {
    title: "Pedido en seguimiento",
    short: "Revisar estado del pedido",
    body: "No hay una acción automática sugerida para esta combinación de estados. Usá ajustes avanzados solo si necesitás corregir el flujo.",
    tone: "neutral"
  };
}

function detailedOrderStage(order) {
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "delivered" || fulfillmentStatus === "delivered") return "delivered";
  if (fulfillmentStatus === "shipped") return "shipped";
  if (fulfillmentStatus === "ready") return "prepared";
  if (order.status === "order_created") return "review_availability";
  if (order.modifiedAcceptanceRequired) return "awaiting_acceptance";
  if (!["paid", "credit_account", "settled_adjustment"].includes(order.paymentStatus)) return "awaiting_payment";
  if (order.logisticsStatus === "preparing") return "preparing";
  return "ready_to_prepare";
}

function renderOrderOpsStats(orders) {
  const buckets = [
    { key: "received", label: "Recibidos", hint: "Confirmar disponibilidad", tone: "info", test: (order) => order.status === "order_created" },
    { key: "receipt", label: "Comprobantes", hint: "Revisar pagos", tone: "progress", test: (order) => order.payment_status === "receipt_uploaded" },
    {
      key: "payment",
      label: "Para cobrar",
      hint: "Esperando pago o vencido",
      tone: "warning",
      test: (order) => ["pending_payment", "rejected", "overdue"].includes(order.payment_status) && order.status !== "order_created" && !isClosedOrderRow(order)
    },
    {
      key: "prepare",
      label: "Preparacion",
      hint: "Imprimir y preparar",
      tone: "success",
      test: (order) => canPrepareOrderRow(order)
    },
    { key: "dispatch", label: "Despacho", hint: "Cargar guia y salida", tone: "progress", test: (order) => normalizedFulfillmentStatus(order.fulfillment_status) === "ready" },
    { key: "transit", label: "En transito", hint: "Esperando recepcion", tone: "done", test: (order) => normalizedFulfillmentStatus(order.fulfillment_status) === "shipped" }
  ].map((bucket) => {
    const matching = orders.filter(bucket.test);
    return {
      ...bucket,
      count: matching.length,
      totalCents: matching.reduce((sum, order) => sum + Number(order.total_cents || 0), 0)
    };
  });

  adminEls.orderOpsStats.innerHTML = buckets.map((bucket) => `
    <div class="order-ops-card ${bucket.tone}">
      <span>${escapeAdmin(bucket.label)}</span>
      <strong>${bucket.count}</strong>
      <small>${escapeAdmin(bucket.hint)}</small>
      <em>${adminMoney.format(bucket.totalCents / 100)}</em>
    </div>
  `).join("");
}

function isClosedOrderRow(order) {
  return order.status === "delivered" || order.status === "cancelled" || normalizedFulfillmentStatus(order.fulfillment_status) === "delivered";
}

function canPrepareOrderRow(order) {
  const availabilityConfirmed = ["availability_confirmed", "confirmed", "in_preparation", "ready"].includes(order.status);
  const paymentAllowsFulfillment = ["paid", "credit_account", "settled_adjustment"].includes(order.payment_status);
  return availabilityConfirmed && paymentAllowsFulfillment && normalizedFulfillmentStatus(order.fulfillment_status) === "pending" && !isClosedOrderRow(order);
}

function handleOrdersTableClick(event) {
  const button = event.target.closest("[data-view-order]");
  if (!button || !adminEls.ordersTableBody.contains(button)) return;
  openOrderDetail(Number(button.dataset.viewOrder), button);
}

async function openOrderDetail(orderId, triggerButton = null) {
  if (!orderId) return;
  if (triggerButton) triggerButton.disabled = true;
  try {
    const { order } = await adminApi(`/api/admin/orders/${orderId}`);
    adminState.selectedOrder = order;
    renderOrderDetail();
    adminEls.orderDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    if (triggerButton && triggerButton.isConnected) triggerButton.disabled = false;
  }
}

function renderOrderDetail() {
  const order = adminState.selectedOrder;
  if (!order) return closeOrderDetail();
  adminEls.orderDetailPanel.hidden = false;
  adminEls.orderDetailTitle.textContent = `${order.orderNumber} - ${order.businessName}`;
  adminEls.orderDetailSummary.innerHTML = renderOrderSummary(order);
  renderOrderActionBar(order);
  adminEls.orderItemsBody.innerHTML = order.items.map((item) => `
    <tr data-order-item-id="${item.id}" data-unit-cents="${item.finalUnitPriceCents}">
      <td data-label="KM"><strong>${escapeAdmin(item.kmCode)}</strong><br><span>EAN ${escapeAdmin(item.ean13)}</span></td>
      <td data-label="Producto">${escapeAdmin(item.productName)}${item.warehouseLocation ? `<br><span>Ubicacion: ${escapeAdmin(item.warehouseLocation)}</span>` : ""}${item.availabilityNote ? `<br><span>${escapeAdmin(item.availabilityNote)}</span>` : ""}</td>
      <td data-label="Pedido">${item.quantity}</td>
      <td data-label="Disponible"><input class="confirmed-qty-input" name="confirmedQuantity-${item.id}" type="number" min="0" max="${item.quantity}" step="1" value="${item.confirmedQuantity || 0}" /></td>
      <td data-label="Precio final">${adminMoney.format(item.finalUnitPriceCents / 100)}</td>
      <td data-label="Subtotal" data-confirmed-subtotal>${adminMoney.format((item.confirmedSubtotalNetCents || 0) / 100)}</td>
      <td data-label="Motivo diferencia"><select name="unfulfilledReasonCode-${item.id}" aria-label="Motivo de cantidad no confirmada">${unfulfilledReasonOptions(item.unfulfilledReasonCode || "")}</select></td>
      <td data-label="Nota"><input name="availabilityNote-${item.id}" value="${escapeAdmin(item.availabilityNote || "")}" placeholder="${item.confirmedQuantity ? "" : "Motivo si no disponible"}" /></td>
    </tr>
  `).join("");
  adminEls.orderItemsBody.querySelectorAll(".confirmed-qty-input").forEach((input) => input.addEventListener("input", updateConfirmedSubtotalPreview));
  adminEls.availabilityForm.elements.reason.value = "";
  adminEls.availabilityMessage.textContent = "";
  renderPaymentReceipts(order);
  renderFulfillment(order);
  renderOrderWorkflow(order);
  renderOrderHistory(order);
  adminEls.orderStatusForm.elements.status.value = order.status;
  adminEls.orderStatusForm.elements.paymentStatus.value = order.paymentStatus;
  adminEls.orderStatusForm.elements.reason.value = "";
  adminEls.orderStatusMessage.textContent = "";
}

function unfulfilledReasonOptions(selected = "") {
  return `<option value="">No corresponde</option>${Object.entries(UNFULFILLED_REASON_LABELS).map(([code, label]) => `<option value="${code}" ${selected === code ? "selected" : ""}>${escapeAdmin(label)}</option>`).join("")}`;
}

function renderOrderSummary(order) {
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  const sections = [
    {
      title: "Estado de operacion",
      items: [
        { label: "", value: customerClassBadge(order.commercialClass), html: true },
        { label: "Comercial", value: stateBadge(orderStatusText(order.status), orderStateClasses[order.status]), html: true },
        { label: "Origen", value: orderOriginBadge(order), html: true },
        { label: "Pago", value: stateBadge(paymentStatusText(order.paymentStatus), paymentStateClasses[order.paymentStatus]), html: true },
        { label: "Logistica", value: stateBadge(fulfillmentStatusText(fulfillmentStatus), fulfillmentStateClasses[fulfillmentStatus]), html: true },
        { label: "Precio reservado", value: formatDate(order.priceReservedAt) }
      ]
    },
    {
      title: "Cliente y entrega",
      items: [
        { label: "Cliente", value: `${order.businessName} (${order.email})` },
        { label: "Contacto", value: `${order.contactPerson || "-"} | WhatsApp ${order.customerWhatsapp || "-"}` },
        { label: "Entrega solicitada", value: shippingText(order.shipping), wide: true },
        { label: "Despacho", value: fulfillmentText(order.fulfillment), wide: true }
      ]
    },
    {
      title: "Importes",
      items: [
        { label: "Total", value: adminMoney.format(order.totalCents / 100) },
        { label: "Pagado", value: adminMoney.format((order.paidCents || 0) / 100) },
        ...(order.commercialAdjustmentCents > 0
          ? [{ label: "Ajuste comercial", value: adminMoney.format(order.commercialAdjustmentCents / 100) }]
          : []),
        { label: "Saldo", value: adminMoney.format((order.balanceCents || 0) / 100) },
        { label: "Vencimiento", value: order.paymentDueDate ? formatAdminDate(order.paymentDueDate) : "Sin vencimiento" },
        { label: "Subtotal neto", value: adminMoney.format(order.subtotalNetCents / 100) },
        { label: "IVA", value: `${(order.vatBps / 100).toFixed(2)}% - ${adminMoney.format(order.vatCents / 100)}` },
        { label: "Descuentos", value: discountText(order.discountsBps) }
      ]
    },
    {
      title: "Equipo comercial",
      items: [
        { label: "Vendedor", value: order.salesRep?.name ? `${order.salesRep.name} (${order.salesRep.email})` : "Sin vendedor" },
        { label: "Comision", value: order.salesRep?.email ? `${formatBps(order.salesRep.commissionBps)} - ${adminMoney.format((order.salesRep.commissionCents || 0) / 100)}` : "Sin comision" }
      ]
    }
  ];

  return sections.map((section) => `
    <div class="summary-section-heading"><span>${escapeAdmin(section.title)}</span></div>
    ${section.items.map((item) => `
      <div class="${item.html ? "state-summary-card" : ""}${item.wide ? " summary-wide" : ""}">
        <span>${escapeAdmin(item.label)}</span>
        <strong>${item.html ? item.value : escapeAdmin(item.value)}</strong>
      </div>
    `).join("")}
  `).join("");
}

function renderOrderActionBar(order) {
  const customerWhatsapp = cleanPhone(order.customerWhatsapp);
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  const isClosed = order.status === "delivered" || fulfillmentStatus === "delivered" || order.status === "cancelled";
  if (isClosed) {
    adminEls.orderDetailActions.innerHTML = `<p class="admin-note">Pedido cerrado. No hay acciones operativas pendientes.</p>`;
    return;
  }
  const canOperateDocuments = canPrepareOrDispatchOrder(order);
  const isInitialReview = order.status === "order_created";
  const preparationAction = (isInitialReview || canOperateDocuments)
    ? `<button class="ghost-button" type="button" id="openPickingList">Imprimir preparacion</button>`
    : "";
  const documentActions = canOperateDocuments ? `
    ${preparationAction}
    <button class="ghost-button" type="button" id="openDeliveryNote">Detalle para caja</button>
    <form class="shipping-label-form">
      <label><span>Bultos</span><input name="packages" type="number" min="1" max="99" step="1" value="1" /></label>
      <button class="ghost-button" type="submit">Generar etiquetas A4</button>
    </form>
  ` : preparationAction;
  const whatsappAction = customerWhatsapp
    ? `<a class="primary-link" target="_blank" rel="noreferrer" href="https://wa.me/${customerWhatsapp}?text=${encodeURIComponent(orderCustomerWhatsappText(order))}">WhatsApp al cliente</a>`
    : `<p class="admin-note">Este cliente no tiene WhatsApp cargado.</p>`;
  const accountAction = order.paymentStatus === "credit_account" && (order.balanceCents || 0) > 0
    ? `<button class="ghost-button account-link-button" type="button" id="openCurrentAccountFromOrder">Ver en Cta. corriente</button>`
    : "";
  adminEls.orderDetailActions.innerHTML = isInitialReview
    ? documentActions
    : fulfillmentStatus === "shipped"
    ? `${whatsappAction}${documentActions}${accountAction}`
    : `${documentActions}${accountAction}${customerWhatsapp && canOperateDocuments ? whatsappAction : ""}${!canOperateDocuments ? whatsappAction : ""}`;
  const pickingButton = adminEls.orderDetailActions.querySelector("#openPickingList");
  if (pickingButton) pickingButton.addEventListener("click", openPickingList);
  const deliveryButton = adminEls.orderDetailActions.querySelector("#openDeliveryNote");
  if (deliveryButton) deliveryButton.addEventListener("click", openDeliveryNote);
  const accountButton = adminEls.orderDetailActions.querySelector("#openCurrentAccountFromOrder");
  if (accountButton) accountButton.addEventListener("click", openCurrentAccountFromOrder);
  const labelsForm = adminEls.orderDetailActions.querySelector(".shipping-label-form");
  if (labelsForm) labelsForm.addEventListener("submit", openShippingLabels);
}

function openShippingLabels(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const packages = Math.max(1, Math.min(99, Number(values.packages || 1)));
  window.open(`./labels.html?order=${adminState.selectedOrder.id}&packages=${packages}`, "_blank", "noopener,noreferrer");
}

function openPickingList() {
  if (!adminState.selectedOrder) return;
  window.open(`./picking.html?order=${adminState.selectedOrder.id}`, "_blank", "noopener,noreferrer");
}

function openDeliveryNote() {
  if (!adminState.selectedOrder) return;
  window.open(`./delivery-note.html?order=${adminState.selectedOrder.id}`, "_blank", "noopener,noreferrer");
}

async function openCurrentAccountFromOrder() {
  adminState.currentAccountOrderId = adminState.selectedOrder?.id || null;
  adminState.currentAccountFilter = "open";
  showAdminView("accounts");
  if (!adminState.operationDashboard) {
    try {
      await loadOperationDashboard();
    } catch (error) {
      showAdminToast(error.message);
      return;
    }
  } else {
    renderCurrentAccountDashboard();
  }
  setTimeout(() => {
    const target = adminEls.currentAccountDashboard?.querySelector(".current-account-detail") || adminEls.currentAccountDashboard;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function renderFulfillment(order) {
  const form = adminEls.fulfillmentForm.elements;
  const fulfillment = order.fulfillment || {};
  const status = normalizedFulfillmentStatus(fulfillment.status);
  form.fulfillmentStatus.value = status;
  form.fulfillmentMethod.value = fulfillment.method || "";
  form.fulfillmentCarrier.value = fulfillment.carrier || "";
  form.fulfillmentTracking.value = fulfillment.tracking || "";
  form.fulfillmentEstimatedDate.value = normalizeDateInput(fulfillment.estimatedDate);
  form.fulfillmentNotes.value = fulfillment.notes || "";
  adminEls.fulfillmentForm.dataset.stage = status;
  setFulfillmentFormReadonly(false);
  adminEls.fulfillmentSubmit.hidden = false;
  adminEls.fulfillmentSubmit.disabled = false;
  const statusField = adminEls.fulfillmentForm.querySelector(".fulfillment-status-field");
  if (statusField) statusField.hidden = true;
  const dispatchFields = adminEls.fulfillmentForm.querySelectorAll(".dispatch-field");
  dispatchFields.forEach((field) => {
    field.hidden = status === "pending";
  });
  adminEls.fulfillmentQuickActions.innerHTML = "";
  adminEls.fulfillmentQuickActions.hidden = true;
  if (status === "pending") {
    form.fulfillmentStatus.value = "ready";
    adminEls.fulfillmentSubmit.textContent = "Marcar preparado para despacho";
  } else if (status === "ready") {
    form.fulfillmentStatus.value = "shipped";
    adminEls.fulfillmentSubmit.textContent = "Marcar despachado";
    adminEls.fulfillmentQuickActions.hidden = false;
    adminEls.fulfillmentQuickActions.innerHTML = `<p class="admin-note">Completa modalidad, transporte, guia/remito y fecha para registrar la salida del pedido.</p>`;
  } else {
    form.fulfillmentStatus.value = "shipped";
    adminEls.fulfillmentSubmit.hidden = true;
    adminEls.fulfillmentSubmit.disabled = true;
    setFulfillmentFormReadonly(true);
    adminEls.fulfillmentQuickActions.hidden = false;
    adminEls.fulfillmentQuickActions.innerHTML = `<p class="admin-note">Pedido despachado. Esperando que el cliente confirme la recepcion. Los datos quedan como consulta y seguimiento.</p>`;
  }
  adminEls.fulfillmentMessage.textContent = "";
}

function setFulfillmentFormReadonly(readonly) {
  adminEls.fulfillmentForm.querySelectorAll("input, select, textarea").forEach((field) => {
    field.disabled = readonly;
  });
}

function renderOrderWorkflow(order) {
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  const isCancelled = order.status === "cancelled";
  const isClosed = order.status === "delivered" || fulfillmentStatus === "delivered";
  const canConfirmAvailability = order.status === "order_created";
  const availabilityConfirmed = ["availability_confirmed", "confirmed", "in_preparation", "ready", "delivered"].includes(order.status);
  const isCreditAccount = order.paymentStatus === "credit_account";
  const canManageOpenBalance = availabilityConfirmed && (order.balanceCents || 0) > 0 && !isCreditAccount;
  const canManageFulfillment = canPrepareOrDispatchOrder(order);
  const needsPaymentAction = !isCreditAccount && (["receipt_uploaded", "rejected", "overdue"].includes(order.paymentStatus)
    || (availabilityConfirmed && order.paymentStatus === "pending_payment")
    || canManageOpenBalance);

  adminEls.availabilityForm.hidden = !canConfirmAvailability;
  adminEls.paymentReviewPanel.hidden = isCancelled || !needsPaymentAction;
  adminEls.fulfillmentForm.hidden = !canManageFulfillment;
  adminEls.orderAdvancedPanel.hidden = isCancelled || isClosed;
  adminEls.orderAdvancedPanel.open = false;
  if (canConfirmAvailability) resetAvailabilityPaymentFields(order);
  const nextAction = orderNextAction(detailedOrderStage(order), order.paymentStatus, order.balanceCents);
  renderNextStep(nextAction.title, nextAction.body, nextAction.tone);
}

function renderOrderHistory(order) {
  const events = Array.isArray(order.events) ? order.events : [];
  adminEls.orderHistoryPanel.innerHTML = `
    <div class="panel-heading"><p class="eyebrow">Historial</p><h3>Actividad del pedido</h3></div>
    ${events.length ? `
      <ol class="order-history-list">
        ${events.map((event) => `
          <li>
            <span class="history-dot" aria-hidden="true"></span>
            <div>
              <strong>${escapeAdmin(orderEventText(event.type))}</strong>
              <span>${escapeAdmin(formatDate(event.createdAt))}${event.actorEmail ? ` | ${escapeAdmin(actorText(event))}` : ""}</span>
              ${event.reason ? `<p>${escapeAdmin(event.reason)}</p>` : ""}
            </div>
          </li>
        `).join("")}
      </ol>
    ` : `<p class="admin-note">Todavia no hay actividad registrada para este pedido.</p>`}
  `;
}

function orderEventText(type) {
  return {
    order_created: "Pedido creado",
    status_updated: "Estado actualizado",
    availability_confirmed: "Disponibilidad confirmada",
    payment_receipt_uploaded: "Comprobante cargado",
    payment_receipt_reviewed: "Comprobante revisado",
    mercadopago_payment_approved: "Pago Mercado Pago acreditado",
    mercadopago_payment_updated: "Pago Mercado Pago actualizado",
    current_account_payment_registered: "Cobro registrado en cuenta corriente",
    credit_authorized: "Cuenta corriente autorizada",
    commercial_adjustment_applied: "Ajuste comercial aplicado",
    commission_settled: "Comision liquidada",
    fulfillment_updated: "Despacho actualizado",
    customer_reaccepted: "Cliente acepto modificacion",
    customer_received: "Cliente confirmo recepcion"
  }[type] || type || "Actividad";
}

function actorText(event) {
  const role = event.actorRole === "admin" ? "KM" : event.actorRole === "customer" ? "Cliente" : "Sistema";
  return `${role}: ${event.actorEmail}`;
}

function setFulfillmentPreset(event) {
  const preset = event.currentTarget.dataset.fulfillmentPreset;
  adminEls.fulfillmentForm.elements.fulfillmentStatus.value = preset;
  if (preset === "ready" && !adminEls.fulfillmentForm.elements.fulfillmentNotes.value.trim()) {
    adminEls.fulfillmentForm.elements.fulfillmentNotes.value = "Pedido listo para despacho.";
  }
  if (preset === "shipped" && !adminEls.fulfillmentForm.elements.fulfillmentNotes.value.trim()) {
    adminEls.fulfillmentForm.elements.fulfillmentNotes.value = "Pedido despachado.";
  }
}

function canFulfillOrder(order) {
  const availabilityConfirmed = ["availability_confirmed", "confirmed", "in_preparation", "ready"].includes(order.status);
  const isReceivedByCustomer = order.status === "delivered" || order.fulfillment?.status === "delivered";
  const paymentAllowsFulfillment = ["paid", "credit_account", "settled_adjustment"].includes(order.paymentStatus);
  return paymentAllowsFulfillment && availabilityConfirmed && !order.modifiedAcceptanceRequired && !isReceivedByCustomer && order.status !== "cancelled";
}

function canPrepareOrDispatchOrder(order) {
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  return canFulfillOrder(order) && ["pending", "ready"].includes(fulfillmentStatus);
}

function resetAvailabilityPaymentFields(order) {
  if (!adminEls.availabilityForm?.elements) return;
  const paymentCondition = normalizeCustomerPaymentCondition(order.requestedPaymentCondition || "advance_payment");
  adminEls.availabilityForm.elements.paymentCondition.value = paymentCondition;
  adminEls.availabilityForm.elements.paymentTermsDays.value = order.paymentTermsDays || 15;
  syncAvailabilityPaymentFields();
}

function syncAvailabilityPaymentFields() {
  if (!adminEls.availabilityPaymentCondition || !adminEls.availabilityTermsField) return;
  const isCredit = adminEls.availabilityPaymentCondition.value === "credit_account";
  adminEls.availabilityTermsField.hidden = !isCredit;
}

function normalizedFulfillmentStatus(status) {
  return status || "pending";
}

function renderNextStep(title, body, tone = "neutral") {
  adminEls.orderNextStep.className = `order-next-step ${escapeAdmin(tone)}`;
  adminEls.orderNextStep.innerHTML = `<strong>${escapeAdmin(title)}</strong><span>${escapeAdmin(body)}</span>`;
}

async function saveFulfillment(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.fulfillmentForm));
  setBusy(adminEls.fulfillmentForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/fulfillment`, {
      method: "PATCH",
      body: values
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadOperationDashboard();
    renderOrderDetail();
    adminEls.fulfillmentMessage.textContent = values.fulfillmentStatus === "shipped"
      ? "Pedido despachado y cliente notificado."
      : "Pedido preparado. El cliente será notificado cuando se registre el despacho.";
  } catch (error) {
    adminEls.fulfillmentMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.fulfillmentForm, false);
  }
}

function renderPaymentReceipts(order) {
  const receipts = order.paymentReceipts || [];
  const balanceCents = order.balanceCents ?? Math.max(0, order.totalCents - (order.paidCents || 0));
  const commercialAdjustmentCents = order.commercialAdjustmentCents || 0;
  const defaultPaymentAmount = Math.max(0, balanceCents || order.totalCents);
  const pendingReceipts = receipts.filter((receipt) => receipt.status === "received");
  const reviewedReceipts = receipts.filter((receipt) => receipt.status !== "received");
  const needsAmountRegularization = reviewedReceipts.some((receipt) => receipt.status === "accepted" && !receipt.amountCents);
  const canAuthorizeBalance = balanceCents > 0 && order.paymentStatus !== "credit_account" && !pendingReceipts.length && !needsAmountRegularization;
  const canApplyCommercialAdjustment = balanceCents > 0 && order.paymentStatus !== "settled_adjustment" && order.paymentStatus !== "credit_account";
  const defaultTermsDays = order.paymentTermsDays || 15;
  const defaultTermsDueDate = calculateDueDateFromDays(defaultTermsDays);
  adminEls.paymentReviewPanel.innerHTML = `
    <div class="panel-heading"><p class="eyebrow">Pago</p><h3>Comprobantes</h3></div>
    <div class="payment-balance-grid">
      <div><span>Total</span><strong>${adminMoney.format(order.totalCents / 100)}</strong></div>
      <div><span>Acreditado</span><strong>${adminMoney.format((order.paidCents || 0) / 100)}</strong></div>
      <div><span>Ajuste comercial</span><strong>${adminMoney.format(commercialAdjustmentCents / 100)}</strong></div>
      <div><span>Saldo</span><strong>${adminMoney.format(balanceCents / 100)}</strong></div>
      <div><span>Vencimiento</span><strong>${order.paymentDueDate ? formatAdminDate(order.paymentDueDate) : "Sin fecha"}</strong></div>
    </div>
    ${pendingReceipts.length ? `
      <section class="payment-section">
        <p class="eyebrow">Pendiente de revision</p>
        ${pendingReceipts.map((receipt) => renderPendingReceipt(receipt, order, defaultPaymentAmount)).join("")}
      </section>
    ` : ""}
    ${reviewedReceipts.length ? `
      <section class="payment-section">
        <p class="eyebrow">Historial de comprobantes</p>
        ${reviewedReceipts.map((receipt) => renderReviewedReceipt(receipt, order, defaultPaymentAmount)).join("")}
      </section>
    ` : ""}
    ${!receipts.length ? `<p class="admin-note">Todavia no hay comprobantes cargados.</p>` : ""}
    ${pendingReceipts.length ? `<p class="admin-note">Primero revisa el comprobante cargado. Si queda saldo, despues podes autorizar vencimiento o cuenta corriente.</p>` : ""}
    ${needsAmountRegularization ? `<p class="admin-note warning">Hay un comprobante aceptado sin importe acreditado. Regulariza el importe antes de autorizar saldo.</p>` : ""}
    ${canAuthorizeBalance ? `
      <form class="payment-terms-form">
        <div>
          <p class="eyebrow">Cuenta corriente / saldo</p>
          <h4>Autorizar cuenta corriente</h4>
          <p>Usar cuando el pedido puede prepararse con saldo pendiente autorizado a fecha.</p>
        </div>
        <label><span>Dias de plazo</span><input name="paymentTermsDays" type="number" min="1" max="365" step="1" value="${defaultTermsDays}" data-due-days /></label>
        <div class="due-preview"><span>Vence</span><strong data-due-preview>${formatAdminDate(defaultTermsDueDate)}</strong></div>
        <label class="wide"><span>Nota interna</span><input name="reason" value="Cuenta corriente autorizada" /></label>
        <button class="primary-button" type="submit">Autorizar saldo</button>
      </form>
    ` : ""}
    ${canApplyCommercialAdjustment ? `
      <form class="commercial-adjustment-form">
        <div>
          <p class="eyebrow">Ajuste comercial</p>
          <h4>Compensar saldo interno</h4>
          <p>Uso interno KM. Cierra el saldo pendiente sin registrar pago ni enviar email al cliente.</p>
        </div>
        <div class="due-preview"><span>Saldo a compensar</span><strong>${adminMoney.format(balanceCents / 100)}</strong></div>
        <input type="hidden" name="amountCents" value="${balanceCents}" />
        <label class="wide"><span>Motivo interno</span><input name="reason" value="Ajuste comercial autorizado" required /></label>
        <button class="ghost-button" type="submit">Aplicar ajuste</button>
      </form>
    ` : ""}
  `;
  adminEls.paymentReviewPanel.querySelectorAll(".receipt-review-form").forEach((form) => form.addEventListener("submit", reviewReceipt));
  const termsForm = adminEls.paymentReviewPanel.querySelector(".payment-terms-form");
  if (termsForm) termsForm.addEventListener("submit", authorizePaymentTerms);
  const adjustmentForm = adminEls.paymentReviewPanel.querySelector(".commercial-adjustment-form");
  if (adjustmentForm) adjustmentForm.addEventListener("submit", applyCommercialAdjustment);
  adminEls.paymentReviewPanel.querySelectorAll("[data-due-days]").forEach((input) => {
    input.addEventListener("input", updateDuePreview);
    updateDuePreview({ currentTarget: input });
  });
}

function renderPendingReceipt(receipt, order, defaultPaymentAmount) {
  const defaultTermsDays = order.paymentTermsDays || 15;
  const dueDate = calculateDueDateFromDays(defaultTermsDays);
  return `
    <article class="payment-receipt-row pending">
      ${renderReceiptInfo(receipt)}
      <form class="receipt-review-form">
        <input type="hidden" name="receiptId" value="${receipt.id}" />
        <label><span>Importe acreditado</span><input name="amount" type="number" min="0" step="0.01" value="${defaultPaymentAmount / 100}" /></label>
        <label><span>Dias saldo</span><input name="paymentTermsDays" type="number" min="0" max="365" step="1" value="${defaultTermsDays}" data-due-days /></label>
        <div class="due-preview"><span>Vence</span><strong data-due-preview>${formatAdminDate(dueDate)}</strong></div>
        <a class="ghost-button receipt-view-link" href="/api/admin/payment-receipts/${receipt.id}/file" target="_blank" rel="noreferrer">Ver comprobante</a>
        <button class="ghost-button" type="submit" name="status" value="accepted">Aceptar pago</button>
        <button class="ghost-button danger" type="submit" name="status" value="rejected">Rechazar</button>
      </form>
    </article>
  `;
}

function renderReviewedReceipt(receipt, order, defaultPaymentAmount) {
  const needsAmount = receipt.status === "accepted" && !receipt.amountCents;
  const defaultTermsDays = order.paymentTermsDays || 15;
  const dueDate = calculateDueDateFromDays(defaultTermsDays);
  return `
    <article class="payment-receipt-row reviewed ${needsAmount ? "needs-amount" : ""}">
      ${renderReceiptInfo(receipt, needsAmount ? "Importe pendiente de regularizar" : "")}
      ${needsAmount ? `
        <form class="receipt-review-form compact">
          <input type="hidden" name="receiptId" value="${receipt.id}" />
          <label><span>Importe acreditado</span><input name="amount" type="number" min="0" step="0.01" value="${defaultPaymentAmount / 100}" /></label>
          <label><span>Dias saldo</span><input name="paymentTermsDays" type="number" min="0" max="365" step="1" value="${defaultTermsDays}" data-due-days /></label>
          <div class="due-preview"><span>Vence</span><strong data-due-preview>${formatAdminDate(dueDate)}</strong></div>
          <a class="ghost-button receipt-view-link" href="/api/admin/payment-receipts/${receipt.id}/file" target="_blank" rel="noreferrer">Ver comprobante</a>
          <button class="ghost-button" type="submit" name="status" value="accepted">Regularizar importe</button>
        </form>
      ` : `
        <div class="receipt-reviewed-actions">
          <a class="ghost-button receipt-view-link" href="/api/admin/payment-receipts/${receipt.id}/file" target="_blank" rel="noreferrer">Ver comprobante</a>
        </div>
      `}
    </article>
  `;
}

function renderReceiptInfo(receipt, note = "") {
  const status = receiptStatusText(receipt.status);
  const amount = receipt.amountCents ? ` - ${adminMoney.format(receipt.amountCents / 100)}` : "";
  return `
    <div class="receipt-info">
      <strong>${escapeAdmin(receipt.originalFilename)}</strong>
      <span>${escapeAdmin(status)} - ${formatDate(receipt.createdAt)}${amount}</span>
      ${note ? `<em>${escapeAdmin(note)}</em>` : ""}
    </div>
  `;
}

async function reviewReceipt(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const receiptId = Number(values.receiptId);
  const status = submitter?.value || "accepted";
  setBusy(form, true);
  try {
    const { order } = await adminApi(`/api/admin/payment-receipts/${receiptId}`, {
      method: "PATCH",
      body: {
        status,
        amountCents: Math.round(Number(values.amount || 0) * 100),
        paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : 0,
        reason: status === "accepted" ? "Comprobante aceptado por administracion" : "Comprobante rechazado por administracion"
      }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadOperationDashboard();
    renderOrderDetail();
    showAdminToast(status === "accepted" ? "Pago aceptado." : "Comprobante rechazado.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function authorizePaymentTerms(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/payment-terms`, {
      method: "PATCH",
      body: {
        paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : 0,
        reason: values.reason || "Cuenta corriente autorizada"
      }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadOperationDashboard();
    renderOrderDetail();
    showAdminToast("Saldo autorizado.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function applyCommercialAdjustment(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  setBusy(form, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/commercial-adjustment`, {
      method: "PATCH",
      body: {
        amountCents: Number(values.amountCents || 0),
        reason: values.reason || "Ajuste comercial autorizado"
      }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadOperationDashboard();
    renderOrderDetail();
    showAdminToast("Ajuste comercial aplicado. No se envio email al cliente.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

function updateConfirmedSubtotalPreview(event) {
  const row = event.currentTarget.closest("[data-order-item-id]");
  const unitCents = Number(row.dataset.unitCents || 0);
  const quantity = Math.max(0, Number(event.currentTarget.value || 0));
  row.querySelector("[data-confirmed-subtotal]").textContent = adminMoney.format(unitCents * quantity / 100);
}

async function saveAvailability(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.availabilityForm));
  const items = adminState.selectedOrder.items.map((item) => ({
    id: item.id,
    confirmedQuantity: Number(values[`confirmedQuantity-${item.id}`] || 0),
    unfulfilledReasonCode: values[`unfulfilledReasonCode-${item.id}`] || "",
    availabilityNote: values[`availabilityNote-${item.id}`] || ""
  }));
  setBusy(adminEls.availabilityForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/availability`, {
      method: "PATCH",
      body: {
        items,
        reason: values.reason,
        paymentCondition: values.paymentCondition || "advance_payment",
        paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : 0
      }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadUnfulfilledDemand();
    await loadOperationDashboard();
    renderOrderDetail();
    adminEls.availabilityMessage.textContent = "Disponibilidad confirmada y email enviado.";
  } catch (error) {
    adminEls.availabilityMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.availabilityForm, false);
  }
}

function closeOrderDetail() {
  adminState.selectedOrder = null;
  adminEls.orderDetailPanel.hidden = true;
  adminEls.orderDetailTitle.textContent = "";
  adminEls.orderDetailSummary.innerHTML = "";
  adminEls.orderDetailActions.innerHTML = "";
  adminEls.orderNextStep.innerHTML = "";
  adminEls.orderHistoryPanel.innerHTML = "";
  adminEls.orderItemsBody.innerHTML = "";
  adminEls.availabilityMessage.textContent = "";
  adminEls.fulfillmentMessage.textContent = "";
  adminEls.orderStatusMessage.textContent = "";
}

async function saveOrderStatus(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.orderStatusForm));
  setBusy(adminEls.orderStatusForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}`, {
      method: "PATCH",
      body: { status: values.status, paymentStatus: values.paymentStatus, reason: values.reason }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    await loadOperationDashboard();
    renderOrderDetail();
    adminEls.orderStatusMessage.textContent = "Pedido actualizado.";
  } catch (error) {
    adminEls.orderStatusMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.orderStatusForm, false);
  }
}

async function loadSettings() {
  const { settings } = await adminApi("/api/admin/settings");
  adminState.settings = settings;
  adminState.paymentAccounts = settings.paymentAccounts || [];
  const form = adminEls.settingsForm.elements;
  form.vatPercent.value = settings.vatBps / 100;
  form.whatsappNumber.value = settings.whatsappNumber;
  form.usdExchangeRate.value = settings.usdExchangeRate;
  form.productionHourlyCostArs.value = settings.productionHourlyCostArs;
  form.maximumDiscountPercent.value = settings.maximumDiscountBps / 100;
  form.maximumCommissionPercent.value = settings.maximumCommissionBps / 100;
  form.profitMarginMinimumPercent.value = settings.profitMarginMinimumBps / 100;
  form.profitMarginMediumPercent.value = settings.profitMarginMediumBps / 100;
  form.profitMarginMaximumPercent.value = settings.profitMarginMaximumBps / 100;
  if (adminEls.salesRepForm?.elements.defaultCommission) adminEls.salesRepForm.elements.defaultCommission.max = String(settings.maximumCommissionBps / 100);
  renderPaymentAccounts();
}

async function loadEmails() {
  const params = new URLSearchParams();
  const search = adminEls.emailSearch.value.trim();
  if (search) params.set("q", search);
  const { enabled, provider, summary, emails } = await adminApi(`/api/admin/emails${params.size ? `?${params}` : ""}`);
  adminState.emailEnabled = Boolean(enabled);
  adminState.emailProvider = provider || "";
  adminState.emailSummary = summary;
  adminState.emails = emails;
  renderEmails();
}

async function flushEmails() {
  const button = document.querySelector("#flushEmails");
  button.disabled = true;
  try {
    const { result } = await adminApi("/api/admin/emails/flush", { method: "POST" });
    await loadEmails();
    showAdminToast(result.enabled ? `Emails enviados: ${result.sent}.` : "SMTP no esta configurado en el servidor.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderEmails() {
  const summary = adminState.emailSummary || {};
  adminEls.emailStats.innerHTML = [
    ["Total", summary.total || 0],
    ["Pendientes", summary.pending || 0],
    ["Enviados", summary.sent || 0],
    ["Con error", summary.withErrors || 0]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  adminEls.emailConfigStatus.textContent = adminState.emailEnabled
    ? `Proveedor configurado: ${adminState.emailProvider}. Los envios pendientes se procesan automaticamente y tambien se pueden reintentar desde este panel.`
    : "SMTP no esta configurado en el servidor. Los emails quedaran en cola hasta cargar las variables de correo.";
  adminEls.emailsTableBody.innerHTML = adminState.emails.length ? adminState.emails.map((email) => {
    const hasError = Boolean(email.last_error);
    const statusClass = hasError ? "danger" : email.status;
    const statusLabel = hasError ? "Con error" : email.status === "sent" ? "Enviado" : "Pendiente";
    return `
      <div class="email-card ${hasError ? "has-error" : ""}">
        <div class="email-card-date">
          <span>Fecha</span>
          <strong>${formatDate(email.created_at)}</strong>
        </div>
        <div class="email-card-content">
          <strong>${escapeAdmin(email.subject || "Sin asunto")}</strong>
          <p>${escapeAdmin(email.recipient || "Sin destinatario")}</p>
        </div>
        <div class="email-card-meta">
          <span>Tipo</span>
          <strong>${escapeAdmin(email.event_type || "-")}</strong>
          <span>Intentos</span>
          <strong>${Number(email.attempts || 0)}</strong>
        </div>
        <span class="email-card-status status-badge ${statusClass}">${statusLabel}</span>
        ${hasError ? `<p class="email-error">${escapeAdmin(email.last_error)}</p>` : ""}
      </div>
    `;
  }).join("") : `<div class="empty-state">Todavia no hay emails registrados.</div>`;
}

async function loadSecurityEvents() {
  const params = new URLSearchParams();
  const search = adminEls.securitySearch.value.trim();
  if (search) params.set("q", search);
  const { summary, events } = await adminApi(`/api/admin/security-events${params.size ? `?${params}` : ""}`);
  adminState.securitySummary = summary || {};
  adminState.securityEvents = events || [];
  renderSecurityEvents();
}

function renderSecurityEvents() {
  const summary = adminState.securitySummary || {};
  adminEls.securityStats.innerHTML = [
    ["Ingresos correctos 24h", summary.login_success || 0],
    ["Fallidos 24h", summary.login_failed || 0],
    ["Bloqueados 24h", summary.rate_limited || 0],
    ["Eventos listados", adminState.securityEvents.length || 0]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  adminEls.securityTableBody.innerHTML = adminState.securityEvents.length ? adminState.securityEvents.map((event) => {
    const route = `${event.method || ""} ${event.path || ""}`.trim() || "-";
    return `
      <div class="security-card ${securityEventClass(event.event_type)}">
        <div class="security-card-main">
          <span class="status-badge ${securityEventClass(event.event_type)}">${securityEventLabel(event.event_type)}</span>
          <strong>${escapeAdmin(event.email || "Sin email")}</strong>
          <p>${formatDate(event.created_at)}</p>
        </div>
        <div class="security-card-grid">
          <span><small>Rol</small><strong>${escapeAdmin(event.role || "-")}</strong></span>
          <span><small>IP</small><strong>${escapeAdmin(event.ip_address || "-")}</strong></span>
          <span><small>Ruta</small><strong>${escapeAdmin(route)}</strong></span>
          <span><small>Navegador</small><strong>${escapeAdmin(shortUserAgent(event.user_agent || "") || "-")}</strong></span>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty-state">Todavia no hay eventos de seguridad registrados.</div>`;
}

function securityEventLabel(type) {
  return ({
    login_success: "Ingreso correcto",
    login_failed: "Login fallido",
    rate_limited: "Bloqueado"
  })[type] || type;
}

function securityEventClass(type) {
  return ({
    login_success: "approved",
    login_failed: "rejected",
    rate_limited: "suspended"
  })[type] || "pending";
}

function shortUserAgent(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/Mozilla\/5\.0\s*/i, "")
    .slice(0, 120);
}

async function saveSettings(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.settingsForm));
  const body = {
    vatBps: Math.round(Number(values.vatPercent) * 100),
    whatsappNumber: values.whatsappNumber,
    usdExchangeRate: Number(values.usdExchangeRate),
    productionHourlyCostArs: Number(values.productionHourlyCostArs),
    maximumDiscountBps: Math.round(Number(values.maximumDiscountPercent) * 100),
    maximumCommissionBps: Math.round(Number(values.maximumCommissionPercent) * 100),
    profitMarginMinimumBps: Math.round(Number(values.profitMarginMinimumPercent) * 100),
    profitMarginMediumBps: Math.round(Number(values.profitMarginMediumPercent) * 100),
    profitMarginMaximumBps: Math.round(Number(values.profitMarginMaximumPercent) * 100)
  };
  setBusy(adminEls.settingsForm, true);
  try {
    const { settings } = await adminApi("/api/admin/settings", { method: "PATCH", body });
    adminState.settings = settings;
    if (adminEls.salesRepForm?.elements.defaultCommission) adminEls.salesRepForm.elements.defaultCommission.max = String(settings.maximumCommissionBps / 100);
    adminEls.settingsMessage.textContent = "Configuracion guardada.";
  } catch (error) {
    adminEls.settingsMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.settingsForm, false);
  }
}

function renderPaymentAccounts() {
  const accounts = adminState.paymentAccounts || [];
  adminEls.paymentAccountList.innerHTML = accounts.length ? `
    <div class="payment-account-cards">
      ${accounts.map((account) => `
        <article class="payment-account-card ${account.active ? "" : "inactive"}">
          <div>
            <strong>${escapeAdmin(account.name)}</strong>
            <span>${paymentAccountMethodText(account.method)}${account.isDefault ? " | Cuenta general" : ""}${account.active ? "" : " | Inactiva"}</span>
            <small>${escapeAdmin(paymentAccountSummary(account))}</small>
          </div>
          <button class="ghost-button row-button" type="button" data-edit-payment-account="${account.id}">Editar</button>
        </article>
      `).join("")}
    </div>` : `<p class="admin-empty">Todavia no hay cuentas de cobro cargadas.</p>`;
}

function handlePaymentAccountListClick(event) {
  const button = event.target.closest("[data-edit-payment-account]");
  if (!button) return;
  const account = adminState.paymentAccounts.find((item) => item.id === Number(button.dataset.editPaymentAccount));
  if (!account) return;
  const form = adminEls.paymentAccountForm.elements;
  for (const key of ["id", "name", "method", "bankName", "accountHolder", "taxId", "accountType", "cbu", "alias", "instructions", "sortOrder"]) {
    form[key].value = account[key] ?? "";
  }
  form.active.checked = Boolean(account.active);
  form.isDefault.checked = Boolean(account.isDefault);
  adminEls.paymentAccountMessage.textContent = `Editando ${account.name}.`;
  adminEls.paymentAccountForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function savePaymentAccount(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.paymentAccountForm));
  const body = {
    id: values.id ? Number(values.id) : undefined,
    name: values.name,
    method: values.method,
    bankName: values.bankName,
    accountHolder: values.accountHolder,
    taxId: values.taxId,
    accountType: values.accountType,
    cbu: values.cbu,
    alias: values.alias,
    instructions: values.instructions,
    sortOrder: Number(values.sortOrder || 0),
    active: Boolean(values.active),
    isDefault: Boolean(values.isDefault)
  };
  setBusy(adminEls.paymentAccountForm, true);
  try {
    const { settings } = await adminApi("/api/admin/payment-accounts", { method: "POST", body });
    adminState.settings = settings;
    adminState.paymentAccounts = settings.paymentAccounts || [];
    resetPaymentAccountForm();
    renderPaymentAccounts();
    if (adminState.selectedCustomerId) await loadCustomerPaymentAccounts(adminState.selectedCustomerId);
    adminEls.paymentAccountMessage.textContent = "Cuenta guardada.";
  } catch (error) {
    adminEls.paymentAccountMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.paymentAccountForm, false);
  }
}

function resetPaymentAccountForm() {
  adminEls.paymentAccountForm.reset();
  adminEls.paymentAccountForm.elements.id.value = "";
  adminEls.paymentAccountForm.elements.active.checked = true;
  adminEls.paymentAccountMessage.textContent = "";
}

function paymentAccountSummary(account = {}) {
  const parts = [
    account.bankName,
    account.alias ? `Alias ${account.alias}` : "",
    account.cbu ? `CBU/CVU ${account.cbu}` : ""
  ].filter(Boolean);
  return parts.join(" | ") || "Sin datos bancarios visibles";
}

function paymentAccountMethodText(method) {
  return ({
    bank_transfer: "Transferencia",
    mercadopago: "MercadoPago",
    other: "Otro"
  })[method] || method || "Cuenta";
}

async function deleteTestOrders(event) {
  event.preventDefault();
  const confirmation = String(new FormData(adminEls.deleteTestOrdersForm).get("confirmation") || "").trim();
  if (confirmation !== "BORRAR PEDIDOS") {
    adminEls.deleteTestOrdersMessage.textContent = "Escribi BORRAR PEDIDOS para confirmar.";
    return;
  }
  const accepted = window.confirm("Esta accion borra todos los pedidos de prueba y sus comprobantes. Clientes, productos y configuracion quedan intactos. ¿Continuar?");
  if (!accepted) return;

  setBusy(adminEls.deleteTestOrdersForm, true);
  try {
    const { result } = await adminApi("/api/admin/operation/delete-test-orders", { method: "POST", body: { confirmation } });
    adminEls.deleteTestOrdersForm.reset();
    adminEls.deleteTestOrdersMessage.textContent = [
      `Pedidos borrados: ${result.deleted.orders}.`,
      `Articulos: ${result.deleted.items}.`,
      `Comprobantes: ${result.deleted.receipts}.`,
      `Correos operativos: ${result.deleted.emails}.`
    ].join(" ");
    showAdminToast("Pedidos de prueba eliminados.");
    await loadOrders();
    await loadOperationDashboard();
    closeOrderDetail();
  } catch (error) {
    adminEls.deleteTestOrdersMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.deleteTestOrdersForm, false);
  }
}

async function loadOperationDashboard() {
  if (adminEls.operationMonth && !adminEls.operationMonth.value) adminEls.operationMonth.value = adminState.operationMonth;
  const { dashboard } = await adminApi(`/api/admin/operation/dashboard?month=${encodeURIComponent(adminState.operationMonth)}`);
  adminState.operationDashboard = dashboard;
  renderOperationDashboard(dashboard);
  renderCurrentAccountDashboard(dashboard);
  renderBackupDashboard(dashboard);
}

async function loadAnalyticsDashboard() {
  if (!adminEls.analyticsDashboard) return;
  const days = adminEls.analyticsDays?.value || 30;
  const { dashboard } = await adminApi(`/api/admin/analytics/dashboard?days=${encodeURIComponent(days)}`);
  adminState.analyticsDashboard = dashboard;
  renderAnalyticsDashboard(dashboard);
}

function renderAnalyticsDashboard(dashboard) {
  if (!adminEls.analyticsDashboard) return;
  if (!dashboard) {
    adminEls.analyticsDashboard.innerHTML = `<p class="admin-note">No hay actividad registrada todavia.</p>`;
    return;
  }
  const summary = dashboard.summary || {};
  const latestHumanVisit = summary.latestHumanVisitAt ? formatAdminDate(summary.latestHumanVisitAt) : "Sin registros";
  adminEls.analyticsDashboard.innerHTML = `
    <div class="operation-metrics">
      ${metricCard("Sesiones de personas", summary.humanSessions || 0, `Periodo ${dashboard.days || 30} días`)}
      ${metricCard("Visitantes anónimos", summary.anonymousSessions || 0, "Sin cuenta identificada")}
      ${metricCard("Clientes activos", summary.activeCustomers || 0, "Cuentas que navegaron")}
      ${metricCard("Robots y vistas previas", summary.botSessions || 0, "Separados del público real")}
      ${metricCard("Páginas vistas", summary.pageViews || 0, "Navegación registrada")}
      ${metricCard("Última visita", latestHumanVisit, "Última persona registrada")}
      ${metricCard("Abrieron acceso", summary.accountOpens || 0, "Login o solicitud")}
      ${metricCard("Solicitudes", summary.registrationSubmits || 0, "Altas enviadas")}
      ${metricCard("Vistas productos", summary.productViews || 0, "Fichas e imagenes")}
      ${metricCard("Agregados", summary.cartAdds || 0, "Productos al carrito")}
      ${metricCard("Pedidos", summary.ordersCreated || 0, "Pedidos generados")}
    </div>
    <div class="operation-layout">
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Visitantes</p><h3>Sesiones recientes</h3></div>
        ${renderAnalyticsVisitorRows(dashboard.visitorSessions || [])}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Origen</p><h3>De donde llegan</h3></div>
        ${renderAnalyticsSourceRows(dashboard.sources || [])}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Dispositivo</p><h3>Como navegan</h3></div>
        ${renderAnalyticsDeviceRows(dashboard.devices || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Paginas</p><h3>Mas visitadas</h3></div>
        ${renderAnalyticsPathRows(dashboard.paths || [])}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Productos</p><h3>Mas vistos</h3></div>
        ${renderAnalyticsProductRows(dashboard.productsViewed || [], "views", "vistas")}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Carrito</p><h3>Mas agregados</h3></div>
        ${renderAnalyticsProductRows(dashboard.productsAdded || [], "units", "unidades")}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Busqueda</p><h3>Terminos frecuentes</h3></div>
        ${renderAnalyticsSearchRows(dashboard.searches || [])}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Oportunidad</p><h3>Busquedas sin resultado</h3></div>
        ${renderAnalyticsNoResultRows(dashboard.noResultSearches || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Conversion</p><h3>Vista, carrito y pedido</h3></div>
        ${renderAnalyticsConversionRows(dashboard.productConversion || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Oportunidad</p><h3>Interes sin pedido</h3></div>
        ${renderAnalyticsInterestRows(dashboard.interestWithoutOrder || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Reciente</p><h3>Ultima actividad</h3></div>
        ${renderAnalyticsRecentRows(dashboard.recent || [])}
      </section>
    </div>
  `;
}

function renderAnalyticsVisitorRows(rows) {
  return rows.length ? `
    <div class="operation-list analytics-visitors">
      ${rows.slice(0, 30).map((row) => `
        <div class="operation-row static analytics-visitor-row">
          <span>
            <strong>${escapeAdmin(row.isBot ? "Robot / vista previa" : (row.identity || "Visitante anónimo"))}</strong>
            <small>${escapeAdmin(row.source || "Directo")} | ${escapeAdmin(row.device || "Sin dato")} | ${escapeAdmin(row.browser || "Sin navegador")} | IP ${escapeAdmin(row.ipAddress || "-")}</small>
            <small>Entrada ${escapeAdmin(row.entryPath || "/")} | Ultima ${escapeAdmin(row.lastPath || "/")}</small>
          </span>
          <span>
            <strong>${escapeAdmin(formatAdminDate(row.lastSeen))}</strong>
            <small>${row.events || 0} eventos | ${row.productViews || 0} productos | ${row.searches || 0} busquedas</small>
            <small>${row.cartAdds || 0} carrito | ${row.ordersCreated || 0} pedidos</small>
          </span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay sesiones registradas.</p>`;
}

function renderAnalyticsSourceRows(rows) {
  return renderAnalyticsCountRows(rows, "label", "sessions", "sesiones", "Sin origen registrado.");
}

function renderAnalyticsDeviceRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 12).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.device || "Sin dato")}</strong><small>${escapeAdmin(row.browser || "Sin navegador")}</small></span>
          <span><strong>${row.sessions || 0}</strong><small>${row.events || 0} eventos</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin dispositivos registrados.</p>`;
}

function renderAnalyticsPathRows(rows) {
  return rows.length ? `
    <div class="operation-list product-rank">
      ${rows.slice(0, 16).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.path || "/")}</strong><small>Pagina o seccion visitada</small></span>
          <span><strong>${row.views || 0}</strong><small>${row.sessions || 0} sesiones</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin paginas visitadas registradas.</p>`;
}

function renderAnalyticsCountRows(rows, labelKey, valueKey, valueLabel, emptyText) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 12).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row[labelKey] || "-")}</strong><small>${row.events || 0} eventos</small></span>
          <span><strong>${row[valueKey] || 0}</strong><small>${escapeAdmin(valueLabel)}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">${escapeAdmin(emptyText)}</p>`;
}

function renderAnalyticsProductRows(rows, valueKey, valueLabel) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 12).map((row) => `
        <button type="button" class="operation-row" data-analytics-product="${row.id}">
          <span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small></span>
          <span><strong>${row[valueKey] || 0}</strong><small>${escapeAdmin(valueLabel)}</small></span>
        </button>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay datos suficientes.</p>`;
}

function renderAnalyticsSearchRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 12).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.query)}</strong><small>Busqueda en catalogo</small></span>
          <span><strong>${row.count || 0}</strong><small>${Number(row.minResults || 0) === 0 ? "incluye sin resultado" : "veces"}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay busquedas registradas.</p>`;
}

function renderAnalyticsNoResultRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 12).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.query)}</strong><small>No encontro productos</small></span>
          <span><strong>${row.count || 0}</strong><small>veces</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">No hay busquedas sin resultado. Buen signo.</p>`;
}

function renderAnalyticsConversionRows(rows) {
  return rows.length ? `
    <div class="operation-list product-rank">
      ${rows.slice(0, 12).map((row) => `
        <button type="button" class="operation-row" data-analytics-product="${row.id}">
          <span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small></span>
          <span><strong>${row.views || 0} / ${row.addedUnits || 0} / ${row.orderedUnits || 0}</strong><small>${row.cartRate || 0}% carrito | ${row.orderRate || 0}% pedido</small></span>
        </button>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay conversion registrada.</p>`;
}

function renderAnalyticsInterestRows(rows) {
  return rows.length ? `
    <div class="operation-list product-rank">
      ${rows.slice(0, 12).map((row) => `
        <button type="button" class="operation-row" data-analytics-product="${row.id}">
          <span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small></span>
          <span><strong>${row.views || 0} vistas</strong><small>${row.addedUnits || 0} unidades en carrito | 0 pedidos</small></span>
        </button>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin productos con interes pendiente por ahora.</p>`;
}

function renderAnalyticsRecentRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 20).map((row) => `
        <div class="operation-row static">
          <span>
            <strong>${escapeAdmin(analyticsEventLabel(row.eventType))}</strong>
            <small>${escapeAdmin(row.businessName || "Visitante")} ${row.kmCode ? `| ${escapeAdmin(row.kmCode)}` : ""}</small>
          </span>
          <span><strong>${escapeAdmin(formatAdminDate(row.createdAt))}</strong><small>${escapeAdmin(row.metadata?.query || row.metadata?.orderNumber || row.path || "")}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin actividad reciente.</p>`;
}

function analyticsEventLabel(type) {
  return ({
    page_view: "Vista de pagina",
    product_view: "Producto visto",
    product_zoom: "Imagen ampliada",
    search: "Busqueda",
    add_to_cart: "Agregado al carrito",
    cart_open: "Carrito abierto",
    checkout_start: "Inicio de pedido",
    order_created: "Pedido creado",
    price_list_download: "Lista descargada",
    account_open: "Acceso abierto",
    registration_submitted: "Solicitud enviada"
  })[type] || type;
}

function handleAnalyticsDashboardClick(event) {
  const button = event.target.closest("[data-analytics-product]");
  if (!button || !adminEls.analyticsDashboard.contains(button)) return;
  showAdminView("products");
  adminEls.productSearch.value = "";
  const product = adminState.products.find((item) => item.id === Number(button.dataset.analyticsProduct));
  if (product) editProduct(product);
}

function renderOperationDashboard(dashboard) {
  if (!dashboard) {
    adminEls.operationDashboard.innerHTML = `<p class="admin-note">No hay datos operativos disponibles.</p>`;
    return;
  }
  const report=dashboard.monthlyReport||{}; const articles=report.articles||{}; const finance=report.finance||{};
  if(adminEls.operationMonth) adminEls.operationMonth.value=report.month||adminState.operationMonth;
  adminEls.operationReportTabs?.querySelectorAll("[data-operation-tab]").forEach((button)=>button.classList.toggle("active",button.dataset.operationTab===adminState.operationTab));
  if(adminState.operationTab==="articles") { adminEls.operationDashboard.innerHTML=renderMonthlyArticles(report); return; }
  if(adminState.operationTab==="profit") { adminEls.operationDashboard.innerHTML=renderMonthlyProfit(report); return; }
  adminEls.operationDashboard.innerHTML=`
    <section class="dashboard-section-head"><div><p class="eyebrow">Actividad de ${escapeAdmin(report.label||"")}</p><h2>Movimiento de artículos</h2></div><p>Las unidades cobradas corresponden a pedidos pagados completamente durante el mes.</p></section>
    <div class="operation-metrics dashboard-article-metrics">
      ${metricCard("Vendidos",articles.sold||0,"Disponibilidad confirmada")}${metricCard("Producidos",articles.produced||0,"Partes aprobados")}${metricCard("Despachados",articles.dispatched||0,"Salida de stock")}${metricCard("Entregados",articles.delivered||0,"Recepción confirmada")}${metricCard("Cobrados",articles.paid||0,"Pedidos totalmente pagados")}
    </div>
    <section class="dashboard-section-head"><div><p class="eyebrow">Resultado económico</p><h2>Resumen del mes</h2></div><p>Importes netos sin IVA. La utilidad descuenta costo industrial y comisión comercial real.</p></section>
    <div class="operation-metrics dashboard-finance-metrics">
      ${metricCard("Ventas netas",moneyCents(finance.netSalesCents),"Sin IVA y con descuentos reales")}${metricCard("Cobros",moneyCents(finance.collectionsCents),"Incluye cobros parciales")}${metricCard("Saldo generado",moneyCents(finance.balanceGeneratedCents),"Pendiente de ventas del mes")}${metricCard("Costo industrial",moneyCents(finance.industrialCostCents),"Materiales, trabajo y comisión de producción")}${metricCard("Comisiones de venta",moneyCents(finance.salesCommissionCents),"Comisión comercial real")}${metricCard("Utilidad",moneyCents(finance.utilityCents),formatPercent(finance.marginPercent)+" sobre venta neta")}
    </div>`;
}

function renderMonthlyArticles(report){const products=(report.products||[]).filter((row)=>{const q=adminState.operationProductSearch.toLowerCase();return !q||`${row.kmCode} ${row.productName} ${row.familyName}`.toLowerCase().includes(q);});return `<section class="dashboard-section-head"><div><p class="eyebrow">Detalle de ${escapeAdmin(report.label||"")}</p><h2>Artículos por producto</h2></div><input class="dashboard-product-search" type="search" data-operation-product-search placeholder="Buscar código, producto o familia" value="${escapeAdmin(adminState.operationProductSearch)}"></section><div class="dashboard-table-wrap"><div class="dashboard-product-table dashboard-product-head"><span>Producto</span><span>Vendidos</span><span>Producidos</span><span>Despachados</span><span>Entregados</span><span>Cobrados</span></div>${products.length?products.map((row)=>`<div class="dashboard-product-table"><span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small><em>${escapeAdmin(row.familyName)}</em></span><b>${row.sold}</b><b>${row.produced}</b><b>${row.dispatched}</b><b>${row.delivered}</b><b>${row.paid}</b></div>`).join(""):`<p class="admin-note">No hay artículos para mostrar.</p>`}</div>`;}

function renderMonthlyProfit(report){const finance=report.finance||{};const trend=report.trend||[];const max=Math.max(1,...trend.map((row)=>Math.max(row.netSalesCents,row.industrialCostCents)));return `<div class="operation-metrics dashboard-profit-summary">${metricCard("Utilidad mensual",moneyCents(finance.utilityCents),formatPercent(finance.marginPercent)+" de margen")}${metricCard("Venta neta",moneyCents(finance.netSalesCents),"Base del cálculo")}${metricCard("Costos + comisiones",moneyCents(Number(finance.industrialCostCents||0)+Number(finance.salesCommissionCents||0)),"Egresos asociados")}</div><section class="operation-panel dashboard-trend-panel"><div class="panel-heading"><p class="eyebrow">Evolución</p><h3>Ventas, costos y utilidad — 12 meses</h3></div><div class="dashboard-trend">${trend.map((row)=>`<div class="dashboard-trend-month"><div class="dashboard-bars"><i style="height:${Math.max(2,row.netSalesCents/max*100)}%" title="Venta ${moneyCents(row.netSalesCents)}"></i><i style="height:${Math.max(2,row.industrialCostCents/max*100)}%" title="Costo ${moneyCents(row.industrialCostCents)}"></i></div><strong>${escapeAdmin(row.label.split(" de ")[0].slice(0,3))}</strong><small>${formatPercent(row.marginPercent)}</small></div>`).join("")}</div><div class="dashboard-legend"><span>Venta neta</span><span>Costo industrial</span></div></section><div class="dashboard-table-wrap"><div class="dashboard-profit-table dashboard-product-head"><span>Producto</span><span>Venta neta</span><span>Costo</span><span>Comisión</span><span>Utilidad</span><span>Margen</span></div>${(report.products||[]).filter((row)=>row.sold).map((row)=>`<div class="dashboard-profit-table"><span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small></span><b>${moneyCents(row.netSalesCents)}</b><b>${moneyCents(row.industrialCostCents)}</b><b>${moneyCents(row.salesCommissionCents)}</b><b class="${row.utilityCents<0?'negative':'positive'}">${moneyCents(row.utilityCents)}</b><b>${formatPercent(row.marginPercent)}</b></div>`).join("")}</div>`;}

function moneyCents(value){return adminMoney.format(Number(value||0)/100)}
function formatPercent(value){return value===null||value===undefined?"Sin datos":`${Number(value).toLocaleString("es-AR",{minimumFractionDigits:1,maximumFractionDigits:1})}%`}

function renderBackupDashboard(dashboard = adminState.operationDashboard) {
  if (!adminEls.backupDashboard) return;
  if (!dashboard) {
    adminEls.backupDashboard.innerHTML = `<p class="admin-note">No hay información de almacenamiento disponible.</p>`;
    return;
  }
  adminEls.backupDashboard.innerHTML = `
    <section class="operation-panel backup-panel">
      <div class="panel-heading">
        <p class="eyebrow">Estado del sistema</p>
        <h2>Respaldo de datos y archivos</h2>
        <p>Generá una copia completa para guardarla fuera del servidor y revisá la persistencia de Railway.</p>
      </div>
      ${renderStorageStatus(dashboard.storage || {})}
    </section>
  `;
}

function metricCard(label, value, hint) {
  return `<div class="operation-metric"><span>${escapeAdmin(label)}</span><strong>${escapeAdmin(String(value))}</strong><small>${escapeAdmin(hint)}</small></div>`;
}

function renderAccountRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 10).map((row) => `
        <button type="button" class="operation-row" data-dashboard-order="${row.id}">
          <span><strong>${escapeAdmin(row.orderNumber)}</strong><small>${escapeAdmin(row.businessName)}</small></span>
          <span><strong>${adminMoney.format((row.balanceCents || 0) / 100)}</strong><small>${row.dueDate ? `Vence ${escapeAdmin(formatAdminDate(row.dueDate))}` : "Sin vencimiento"}</small></span>
        </button>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin saldos para mostrar.</p>`;
}

function renderRankRows(rows, labelKey, amountKey) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 8).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row[labelKey] || "-")}</strong><small>${row.orders || 0} pedidos</small></span>
          <span><strong>${adminMoney.format((row[amountKey] || 0) / 100)}</strong><small>Saldo ${adminMoney.format((row.balanceCents || 0) / 100)}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Todavia no hay movimiento del mes.</p>`;
}

function renderSalesRepRows(rows) {
  return rows.length ? `
    <div class="operation-list">
      ${rows.slice(0, 8).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.name || "Sin vendedor")}</strong><small>${escapeAdmin(row.email || "General")}</small></span>
          <span><strong>${adminMoney.format((row.commissionCents || 0) / 100)}</strong><small>${adminMoney.format((row.totalCents || 0) / 100)}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin vendedores asociados este mes.</p>`;
}

function renderProductRankRows(rows) {
  return rows.length ? `
    <div class="operation-list product-rank">
      ${rows.slice(0, 12).map((row) => `
        <div class="operation-row static">
          <span><strong>${escapeAdmin(row.kmCode)}</strong><small>${escapeAdmin(row.productName)}</small></span>
          <span><strong>${row.quantity}</strong><small>${adminMoney.format((row.subtotalCents || 0) / 100)}</small></span>
        </div>
      `).join("")}
    </div>
  ` : `<p class="admin-note">Sin productos vendidos para mostrar.</p>`;
}

function renderStorageStatus(storage = {}) {
  const latest = storage.backups?.latest;
  const warnings = storage.warnings || [];
  const statusLabel = storage.health === "ok" ? "Correcto" : "Revisar";
  const statusClass = storage.health === "ok" ? "ok" : "warning";
  const backupCount = Number(storage.backups?.count || 0);
  return `
    <div class="storage-status ${statusClass}">
      <div>
        <span class="storage-status-badge">${escapeAdmin(statusLabel)}</span>
        <strong>${latest ? `Ultimo backup: ${escapeAdmin(formatAdminDate(latest.createdAt))}` : "Sin backup registrado"}</strong>
        <small>${escapeAdmin(backupCount)} backups (${formatFileSize(storage.backups?.bytes || 0)}) | ${escapeAdmin(storage.uploads?.files || 0)} archivos subidos | ${formatFileSize(storage.uploads?.bytes || 0)}</small>
      </div>
      <div class="storage-status-grid">
        <span><strong>Base</strong><small>${formatFileSize(storage.database?.bytes || 0)}</small></span>
        <span><strong>Uploads</strong><small>${escapeAdmin(storage.uploads?.exists ? "Disponible" : "No encontrado")}</small></span>
        <span><strong>Persistencia</strong><small>${storage.persistent?.databaseInData && storage.persistent?.uploadsInData ? "Volumen /data" : "Verificar Railway"}</small></span>
      </div>
      <div class="storage-actions">
        <button type="button" class="toolbar-create-button" data-download-backup>Descargar backup completo (.zip)</button>
        ${backupCount > 1 ? `<button type="button" class="ghost-button" data-prune-backups>Limpiar backups antiguos</button>` : ""}
      </div>
      ${warnings.length ? `<div class="storage-warnings">${warnings.map((warning) => `<small>${escapeAdmin(warning)}</small>`).join("")}</div>` : ""}
    </div>
  `;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function handleOperationDashboardClick(event) {
  const button = event.target.closest("[data-dashboard-order]");
  if (!button || !adminEls.operationDashboard.contains(button)) return;
  showAdminView("orders");
  openOrderDetail(Number(button.dataset.dashboardOrder), button);
}

function handleBackupDashboardClick(event) {
  const downloadButton = event.target.closest("[data-download-backup]");
  if (downloadButton && adminEls.backupDashboard.contains(downloadButton)) {
    downloadExternalBackup(downloadButton);
    return;
  }
  const pruneButton = event.target.closest("[data-prune-backups]");
  if (pruneButton && adminEls.backupDashboard.contains(pruneButton)) pruneBackups(pruneButton);
}

async function downloadExternalBackup(button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando copia...";
  try {
    const response = await fetch("/api/admin/operation/backups/download", {
      method: "POST",
      credentials: "same-origin"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se pudo generar el backup.");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("El backup generado esta vacio.");
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `km-detail-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    showAdminToast(`Backup listo: ${filename}`);
    await loadOperationDashboard();
  } catch (error) {
    showAdminToast(error.message || "No se pudo descargar el backup.");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function pruneBackups(button) {
  if (!confirm("Se conservara el ultimo backup y se eliminaran los backups antiguos. No se borran productos, clientes ni imagenes activas. Continuar?")) return;
  setBusy(button, true);
  try {
    const { result } = await adminApi("/api/admin/operation/prune-backups", { method: "POST", body: { keepLatest: 1 } });
    adminState.operationDashboard = {
      ...adminState.operationDashboard,
      storage: result.storage
    };
    renderBackupDashboard(adminState.operationDashboard);
    showAdminToast(`Backups eliminados: ${result.deleted?.length || 0}. Espacio liberado: ${formatFileSize(result.deletedBytes || 0)}.`);
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function renderCurrentAccountDashboard(dashboard = adminState.operationDashboard) {
  if (!adminEls.currentAccountDashboard) return;
  if (!dashboard) {
    adminEls.currentAccountDashboard.innerHTML = `<p class="admin-note">No hay informacion de cuenta corriente disponible.</p>`;
    return;
  }
  const accounts = dashboard.currentAccounts || {};
  const openRows = accounts.open || [];
  const overdueRows = accounts.overdue || [];
  const dueSoonRows = accounts.dueSoon || [];
  const noDueRows = openRows.filter((row) => !row.dueDate);
  const summary = dashboard.summary || {};
  const filters = [
    { key: "open", label: "Abiertos", value: openRows.length, amount: summary.openBalanceCents || 0 },
    { key: "overdue", label: "Vencidos", value: overdueRows.length, amount: summary.overdueBalanceCents || 0 },
    { key: "dueSoon", label: "Vencen pronto", value: dueSoonRows.length, amount: summary.dueSoonBalanceCents || 0 },
    { key: "noDue", label: "Sin vencimiento", value: noDueRows.length, amount: sumClientRows(noDueRows, "balanceCents") }
  ];
  const selectedRows = {
    open: openRows,
    overdue: overdueRows,
    dueSoon: dueSoonRows,
    noDue: noDueRows
  }[adminState.currentAccountFilter] || openRows;
  const query = (adminEls.currentAccountSearch?.value || "").trim().toLowerCase();
  const rows = selectedRows.filter((row) => accountRowMatches(row, query));
  const selectedAccount = findCurrentAccountRow(dashboard, adminState.currentAccountOrderId);
  if (adminState.currentAccountOrderId && !selectedAccount) {
    adminState.currentAccountOrderId = null;
    adminState.currentAccountPaymentsOpen = false;
  }

  adminEls.currentAccountDashboard.innerHTML = `
    <div class="current-account-actions" role="tablist" aria-label="Filtros de cuenta corriente">
      ${filters.map((filter) => `
        <button class="${filter.key === adminState.currentAccountFilter ? "active" : ""}" type="button" data-account-filter="${filter.key}">
          <strong>${filter.value}</strong>
          <span>${escapeAdmin(filter.label)}</span>
          <small>${adminMoney.format(filter.amount / 100)}</small>
        </button>
      `).join("")}
    </div>
    ${selectedAccount ? renderCurrentAccountDetail(selectedAccount) : ""}
    <section class="current-account-panel">
      <div class="panel-heading">
        <p class="eyebrow">Seguimiento</p>
        <h3>${escapeAdmin(accountFilterTitle(adminState.currentAccountFilter))}</h3>
      </div>
      ${rows.length ? `
        <div class="current-account-table">
          <div class="current-account-head">
            <span>Pedido / cliente</span><span>Vendedor</span><span>Total</span><span>Pagado</span><span>Saldo</span><span>Vencimiento</span><span></span>
          </div>
          ${rows.map(renderCurrentAccountRow).join("")}
        </div>
      ` : `<p class="admin-empty">No hay saldos para este filtro.</p>`}
    </section>
  `;
}

function renderCurrentAccountRow(row) {
  const due = accountDueState(row);
  const selected = Number(row.id) === Number(adminState.currentAccountOrderId) ? " selected" : "";
  return `
    <button class="current-account-row ${due.className}${selected}" type="button" data-account-order="${row.id}">
      <span><strong>${escapeAdmin(row.orderNumber)}</strong><small>${escapeAdmin(row.businessName || "-")}</small></span>
      <span><strong>${escapeAdmin(row.salesRepName || "Sin vendedor")}</strong><small>${escapeAdmin(row.salesRepEmail || "General")}</small></span>
      <span><strong>${adminMoney.format((row.totalCents || 0) / 100)}</strong><small>Total pedido</small></span>
      <span><strong>${adminMoney.format((row.paidCents || 0) / 100)}</strong><small>Acreditado</small></span>
      <span><strong>${adminMoney.format((row.balanceCents || 0) / 100)}</strong><small>Saldo</small></span>
      <span><strong>${escapeAdmin(due.label)}</strong><small>${escapeAdmin(due.hint)}</small></span>
      <span><em>Abrir</em></span>
    </button>
  `;
}

function handleCurrentAccountClick(event) {
  const clearButton = event.target.closest("[data-account-clear]");
  if (clearButton && adminEls.currentAccountDashboard.contains(clearButton)) {
    adminState.currentAccountOrderId = null;
    adminState.currentAccountPaymentsOpen = false;
    renderCurrentAccountDashboard();
    return;
  }
  const filterButton = event.target.closest("[data-account-filter]");
  if (filterButton && adminEls.currentAccountDashboard.contains(filterButton)) {
    adminState.currentAccountFilter = filterButton.dataset.accountFilter;
    adminState.currentAccountPaymentsOpen = false;
    renderCurrentAccountDashboard();
    return;
  }
  const historyButton = event.target.closest("[data-account-history-toggle]");
  if (historyButton && adminEls.currentAccountDashboard.contains(historyButton)) {
    adminState.currentAccountPaymentsOpen = !adminState.currentAccountPaymentsOpen;
    renderCurrentAccountDashboard();
    return;
  }
  const rowButton = event.target.closest("[data-account-order]");
  if (!rowButton || !adminEls.currentAccountDashboard.contains(rowButton)) return;
  const nextOrderId = Number(rowButton.dataset.accountOrder);
  if (adminState.currentAccountOrderId !== nextOrderId) adminState.currentAccountPaymentsOpen = false;
  adminState.currentAccountOrderId = nextOrderId;
  renderCurrentAccountDashboard();
  setTimeout(() => adminEls.currentAccountDashboard?.querySelector(".current-account-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
}

async function handleCurrentAccountSubmit(event) {
  const form = event.target.closest("[data-account-payment-form]");
  if (!form || !adminEls.currentAccountDashboard.contains(form)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const amount = String(values.amount || "").trim();
  if (!amount) {
    showAdminToast("Ingresa un importe valido.");
    return;
  }
  setBusy(form, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${form.dataset.accountPaymentForm}/account-payments`, {
      method: "POST",
      body: {
        amount,
        method: values.method || "bank_transfer",
        reference: values.reference || "",
        note: values.note || ""
      }
    });
    if (adminState.selectedOrder?.id === order.id) adminState.selectedOrder = order;
    showAdminToast("Cobro registrado en cuenta corriente.");
    await loadOperationDashboard();
    const hasBalance = Number(order.balanceCents || 0) > 0;
    adminState.currentAccountOrderId = hasBalance ? order.id : null;
    adminState.currentAccountPaymentsOpen = hasBalance;
    renderCurrentAccountDashboard();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

const currentAccountPaymentMethods = [
  ["bank_transfer", "Transferencia"],
  ["cash", "Efectivo"],
  ["physical_check", "Cheque fisico"],
  ["e_check", "E-cheq"]
];

const currentAccountPaymentHistoryLabels = {
  approved_receipt: "Comprobante aprobado",
  mercadopago: "Mercado Pago",
  previous_credit: "Pago registrado"
};

function currentAccountPaymentMethodLabel(method) {
  const entry = currentAccountPaymentMethods.find(([value]) => value === method);
  return entry ? entry[1] : currentAccountPaymentHistoryLabels[method] || method || "Sin metodo";
}

function findCurrentAccountRow(dashboard, orderId) {
  if (!dashboard || !orderId) return null;
  const accounts = dashboard.currentAccounts || {};
  const rows = [
    ...(accounts.open || []),
    ...(accounts.overdue || []),
    ...(accounts.dueSoon || [])
  ];
  return rows.find((row) => Number(row.id) === Number(orderId)) || null;
}

function renderCurrentAccountDetail(row) {
  const due = accountDueState(row);
  const balanceCents = Number(row.balanceCents || 0);
  const payments = currentAccountPaymentHistory(row);
  return `
    <section class="current-account-detail ${due.className}">
      <div class="current-account-detail-header">
        <div>
          <p class="eyebrow">Cobro de cuenta corriente</p>
          <h3>${escapeAdmin(row.orderNumber)} - ${escapeAdmin(row.businessName || "-")}</h3>
          <p>Registra aca el cobro interno del pedido. No se envia email automatico al cliente.</p>
        </div>
        <button class="ghost-button" type="button" data-account-clear>Cerrar</button>
      </div>
      <div class="current-account-detail-grid">
        <span><small>Total</small><strong>${adminMoney.format((row.totalCents || 0) / 100)}</strong></span>
        <span><small>Pagado</small><strong>${adminMoney.format((row.paidCents || 0) / 100)}</strong></span>
        <span><small>Saldo</small><strong>${adminMoney.format(balanceCents / 100)}</strong></span>
        <span><small>Vencimiento</small><strong>${escapeAdmin(due.label)}</strong><em>${escapeAdmin(due.hint)}</em></span>
      </div>
      <form class="current-account-payment-form" data-account-payment-form="${row.id}">
        <label>
          <span>Importe cobrado</span>
          <input name="amount" inputmode="decimal" autocomplete="off" value="${escapeAdmin(formatAdminMoneyInput(balanceCents))}" />
        </label>
        <label>
          <span>Forma de cobro</span>
          <select name="method">
            ${currentAccountPaymentMethods.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Referencia</span>
          <input name="reference" maxlength="120" placeholder="Banco, cheque o referencia" />
        </label>
        <label>
          <span>Nota interna</span>
          <input name="note" maxlength="300" value="Cobro registrado en cuenta corriente" />
        </label>
        <button class="toolbar-create-button" type="submit">Registrar cobro</button>
      </form>
      <div class="current-account-detail-tools">
        <button class="current-account-history-toggle" type="button" data-account-history-toggle>
          ${adminState.currentAccountPaymentsOpen ? "Ocultar historial de pagos" : `Ver historial de pagos (${payments.length})`}
        </button>
      </div>
      ${adminState.currentAccountPaymentsOpen ? renderCurrentAccountPaymentHistory(payments) : ""}
    </section>
  `;
}

function currentAccountPaymentHistory(row) {
  return (row.accountPayments || []).map((payment) => ({
    id: payment.id,
    amountCents: Number(payment.amountCents || 0),
    method: currentAccountPaymentMethodLabel(payment.method),
    reference: payment.reference || "",
    note: payment.note || "",
    createdAt: payment.createdAt || ""
  }));
}

function renderCurrentAccountPaymentHistory(payments) {
  if (!payments.length) {
    return `<div class="current-account-history empty">Todavia no hay cobros registrados para este pedido.</div>`;
  }
  return `
    <div class="current-account-history">
      ${payments.map((payment) => `
        <div class="current-account-history-row">
          <span>
            <strong>${escapeAdmin(payment.method)}</strong>
            <small>${escapeAdmin(formatAccountPaymentDate(payment.createdAt))}${payment.reference ? ` | Ref: ${escapeAdmin(payment.reference)}` : ""}</small>
            ${payment.note ? `<small>${escapeAdmin(payment.note)}</small>` : ""}
          </span>
          <em>${adminMoney.format(payment.amountCents / 100)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function formatAccountPaymentDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatAdminDate(value);
  return date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function accountRowMatches(row, query) {
  if (!query) return true;
  return [
    row.orderNumber,
    row.businessName,
    row.salesRepName,
    row.salesRepEmail,
    paymentStatusText(row.paymentStatus)
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function accountDueState(row) {
  if (!row.dueDate) return { className: "no-due", label: "Sin fecha", hint: "Revisar condicion" };
  const days = Number(row.daysToDue);
  if (days < 0) return { className: "overdue", label: formatAdminDate(row.dueDate), hint: `Vencido hace ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}` };
  if (days === 0) return { className: "due-today", label: formatAdminDate(row.dueDate), hint: "Vence hoy" };
  if (days <= 2) return { className: "due-soon", label: formatAdminDate(row.dueDate), hint: `Faltan ${days} dia${days === 1 ? "" : "s"}` };
  return { className: "open", label: formatAdminDate(row.dueDate), hint: `Faltan ${days} dias` };
}

function accountFilterTitle(filter) {
  return {
    open: "Saldos abiertos",
    overdue: "Saldos vencidos",
    dueSoon: "Vencimientos proximos",
    noDue: "Saldos sin vencimiento"
  }[filter] || "Saldos abiertos";
}

function sumClientRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function formatAdminMoneyInput(cents) {
  return (Number(cents || 0) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function adminApi(url, { method = "GET", body } = {}) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operacion.");
    error.status = response.status;
    error.details = payload.details || {};
    throw error;
  }
  return payload;
}

function setBusy(form, busy) {
  form.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = busy; });
}

function showAdminToast(message) {
  adminEls.adminToast.textContent = message;
  adminEls.adminToast.classList.add("show");
  clearTimeout(showAdminToast.timer);
  showAdminToast.timer = setTimeout(() => adminEls.adminToast.classList.remove("show"), 2500);
}

function formatDate(value) {
  if (!value) return "";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(normalized));
}

function formatOrderListDate(value) {
  if (!value) return "";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return escapeAdmin(String(value));
  const day = new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(date);
  const time = new Intl.DateTimeFormat("es-AR", { timeStyle: "short" }).format(date);
  return `<span class="order-list-date"><strong>${escapeAdmin(day)}</strong><small>${escapeAdmin(time)}</small></span>`;
}

function formatAdminDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function defaultDueDate(days = 15) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateDueDateFromDays(days = 0) {
  const numericDays = Math.max(0, Number(days || 0));
  return defaultDueDate(numericDays);
}

function updateDuePreview(event) {
  const input = event.currentTarget;
  const container = input.closest("form");
  const preview = container?.querySelector("[data-due-preview]");
  if (!preview) return;
  const days = Number(input.value || 0);
  preview.textContent = days > 0 ? formatAdminDate(calculateDueDateFromDays(days)) : "Sin plazo";
}

function receiptStatusText(status) {
  return ({ received: "Recibido", accepted: "Aceptado", rejected: "Rechazado" })[status] || status || "";
}

function discountText(discountsBps = []) {
  const labels = discountsBps.filter(Boolean).map((value) => `${(value / 100).toFixed(2)}%`);
  return labels.length ? labels.join(" + ") : "Sin descuentos";
}

function formatBps(value = 0) {
  return `${(Number(value || 0) / 100).toFixed(2)}%`;
}

function shippingText(shipping = {}) {
  return [
    shipping.recipient,
    shipping.address,
    shipping.city && shipping.province ? `${shipping.city}, ${shipping.province}` : shipping.city || shipping.province,
    shipping.postalCode ? `CP ${shipping.postalCode}` : "",
    shipping.preferredTransport ? `Transporte: ${shipping.preferredTransport}` : "",
    shipping.contactPhone ? `Tel: ${shipping.contactPhone}` : "",
    shipping.notes ? `Notas: ${shipping.notes}` : ""
  ].filter(Boolean).join(" | ");
}

function fulfillmentText(fulfillment = {}) {
  return [
    fulfillmentStatusText(fulfillment.status || "pending"),
    fulfillment.method,
    fulfillment.carrier,
    fulfillment.tracking ? `Guia/remito: ${fulfillment.tracking}` : "",
    fulfillment.estimatedDate ? `Fecha: ${fulfillment.estimatedDate}` : "",
    fulfillment.notes
  ].filter(Boolean).join(" | ");
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function orderCustomerWhatsappText(order) {
  return [
    `Hola ${order.contactPerson || order.businessName}, te contactamos de KM Detail Line.`,
    "",
    `Pedido: ${order.orderNumber}`,
    `Estado: ${orderStatusText(order.status)}`,
    `Pago: ${paymentStatusText(order.paymentStatus)}`,
    `Despacho: ${fulfillmentStatusText(order.fulfillment?.status || "pending")}`,
    `Total: ${adminMoney.format(order.totalCents / 100)}`,
    "",
    "Cualquier informacion adicional la coordinamos por este medio."
  ].join("\n");
}

function orderStatusText(status) {
  return orderStatusLabels[status] || status || "";
}

function paymentStatusText(status) {
  return paymentStatusLabels[status] || status || "";
}

function fulfillmentStatusText(status) {
  return fulfillmentStatusLabels[status] || status || "";
}

function stateBadge(label, className = "neutral") {
  return `<span class="state-badge ${escapeAdmin(className)}">${escapeAdmin(label)}</span>`;
}

function orderOriginText(order = {}) {
  const createdBy = order.createdBy || {};
  const role = order.createdByRole || order.created_by_role || createdBy.role || "customer";
  if (role === "sales_rep") {
    const salesRepName = createdBy.salesRepName || order.sales_rep_name || order.salesRepName || "";
    return salesRepName ? `Vendedor: ${salesRepName}` : "Vendedor";
  }
  if (role === "admin") return "KM";
  return "Cliente";
}

function orderOriginBadge(order = {}) {
  const role = order.createdByRole || order.created_by_role || order.createdBy?.role || "customer";
  const tone = role === "sales_rep" ? "info" : role === "admin" ? "warning" : "neutral";
  return stateBadge(orderOriginText(order), tone);
}

function normalizeDateInput(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function debounce(callback, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), waitMs);
  };
}

function escapeAdmin(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

initAdmin();
