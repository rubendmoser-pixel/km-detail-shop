const adminState = {
  user: null, customers: [], products: [], families: [], selectedProductId: null, productImages: [],
  orders: [], selectedOrder: null, settings: null, emails: [], emailSummary: null, emailEnabled: false, emailProvider: "",
  securityEvents: [], securitySummary: null, salesReps: [], distributors: [], salesRepDashboard: null, salesRepProfile: null, selectedSalesRepId: null, pendingCommissions: [], commissionSettlements: [], selectedCustomerId: null,
  operationDashboard: null, analyticsDashboard: null, currentAccountFilter: "open", customerProductDiscounts: {}, paymentAccounts: [], customerPaymentAccounts: {}
};
const adminMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const adminViews = new Set(["customers", "sales", "distributors", "products", "orders", "accounts", "settings", "emails", "security", "analytics", "operation"]);
const statusLabels = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
  suspended: "Suspendido", inactive: "Inactivo"
};
const orderStatusLabels = {
  order_created: "Pedido recibido",
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
  pending: "Pendiente de preparacion",
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

const adminEls = Object.fromEntries([
  "adminSession", "adminEmail", "adminLoginPanel", "adminLoginForm", "adminLoginMessage",
  "adminWorkspace", "customerSearch", "customerStatusFilter", "customerStats", "customerList", "toggleCustomerCreate",
  "customerCreatePanel", "customerCreateForm", "customerCreateMessage", "cancelCustomerCreate", "ordersTableBody",
  "orderSearch", "orderStatusFilter", "orderPaymentFilter", "orderFulfillmentFilter", "orderOpsStats",
  "orderDetailPanel", "orderDetailTitle", "orderDetailSummary", "orderDetailActions", "orderNextStep", "orderItemsBody",
  "orderHistoryPanel",
  "availabilityForm", "availabilityPaymentCondition", "availabilityTermsField", "availabilityMessage", "paymentReviewPanel", "fulfillmentForm", "fulfillmentQuickActions", "fulfillmentSubmit", "fulfillmentMessage",
  "orderStatusForm", "orderStatusMessage", "orderAdvancedPanel",
  "productSearch", "productFamilyFilter", "productStatusFilter", "productsTableBody", "productForm",
  "productFormTitle", "productMessage", "familyNameOptions", "productImageInput", "productImages",
  "productImagesNote", "settingsForm", "settingsMessage", "paymentAccountForm", "paymentAccountMessage", "paymentAccountList",
  "salesRepSearch", "salesRepStatusFilter", "reloadSalesReps", "salesRepForm", "salesRepFormTitle",
  "salesRepMessage", "salesRepsTableBody", "salesRepDashboard", "salesRepProfile", "commissionSalesRepFilter", "commissionNotes", "reloadCommissions",
  "createCommissionSettlement", "commissionSummary", "commissionsTableBody", "selectAllCommissions", "commissionSettlements",
  "distributorSearch", "distributorStatusFilter", "reloadDistributors", "distributorForm", "distributorFormTitle", "distributorMessage", "distributorsTableBody",
  "emailSearch", "emailStats", "emailConfigStatus", "emailsTableBody",
  "securitySearch", "securityStats", "securityTableBody", "currentAccountSearch", "currentAccountDashboard",
  "analyticsDays", "analyticsDashboard", "operationDashboard", "deleteTestOrdersForm", "deleteTestOrdersMessage", "adminToast"
].map((id) => [id, document.querySelector(`#${id}`)]));

async function initAdmin() {
  bindAdminEvents();
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
  adminEls.adminLoginForm.addEventListener("submit", loginAdmin);
  document.querySelector("#adminLogout").addEventListener("click", logoutAdmin);
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showAdminView(button.dataset.adminView)));
  window.addEventListener("hashchange", () => showAdminView(currentAdminView(), false));
  adminEls.customerSearch.addEventListener("input", debounce(loadCustomers, 250));
  adminEls.customerStatusFilter.addEventListener("change", loadCustomers);
  document.querySelector("#reloadCustomers").addEventListener("click", loadCustomers);
  adminEls.toggleCustomerCreate?.addEventListener("click", toggleCustomerCreatePanel);
  adminEls.cancelCustomerCreate?.addEventListener("click", () => toggleCustomerCreatePanel(false));
  adminEls.customerCreateForm?.addEventListener("submit", createCustomerFromAdmin);
  adminEls.customerCreateForm?.elements.paymentCondition?.addEventListener("change", syncCustomerCreatePaymentForm);
  adminEls.productSearch.addEventListener("input", debounce(loadProducts, 250));
  adminEls.productFamilyFilter.addEventListener("change", loadProducts);
  adminEls.productStatusFilter.addEventListener("change", loadProducts);
  document.querySelector("#reloadProducts").addEventListener("click", loadProducts);
  document.querySelector("#newProduct").addEventListener("click", resetProductForm);
  document.querySelector("#resetProductForm").addEventListener("click", resetProductForm);
  adminEls.productForm.addEventListener("submit", saveProduct);
  productField("familyName")?.addEventListener("change", syncSelectedFamilyDescription);
  productField("familyName")?.addEventListener("blur", syncSelectedFamilyDescription);
  adminEls.productImageInput.addEventListener("change", uploadProductImages);
  adminEls.orderSearch.addEventListener("input", debounce(loadOrders, 250));
  adminEls.orderStatusFilter.addEventListener("change", loadOrders);
  adminEls.orderPaymentFilter.addEventListener("change", loadOrders);
  adminEls.orderFulfillmentFilter.addEventListener("change", loadOrders);
  document.querySelector("#reloadOrders").addEventListener("click", loadOrders);
  adminEls.ordersTableBody.addEventListener("click", handleOrdersTableClick);
  document.querySelector("#closeOrderDetail").addEventListener("click", closeOrderDetail);
  adminEls.availabilityForm.addEventListener("submit", saveAvailability);
  adminEls.availabilityPaymentCondition?.addEventListener("change", syncAvailabilityPaymentFields);
  adminEls.fulfillmentForm.addEventListener("submit", saveFulfillment);
  adminEls.orderStatusForm.addEventListener("submit", saveOrderStatus);
  adminEls.emailSearch.addEventListener("input", debounce(loadEmails, 250));
  document.querySelector("#reloadEmails").addEventListener("click", loadEmails);
  document.querySelector("#flushEmails").addEventListener("click", flushEmails);
  adminEls.securitySearch.addEventListener("input", debounce(loadSecurityEvents, 250));
  document.querySelector("#reloadSecurity").addEventListener("click", loadSecurityEvents);
  adminEls.analyticsDays?.addEventListener("change", loadAnalyticsDashboard);
  document.querySelector("#reloadAnalyticsDashboard")?.addEventListener("click", loadAnalyticsDashboard);
  adminEls.analyticsDashboard?.addEventListener("click", handleAnalyticsDashboardClick);
  adminEls.salesRepSearch.addEventListener("input", debounce(loadSalesReps, 250));
  adminEls.salesRepStatusFilter.addEventListener("change", loadSalesReps);
  adminEls.reloadSalesReps.addEventListener("click", loadSalesReps);
  adminEls.salesRepForm.addEventListener("submit", saveSalesRep);
  adminEls.salesRepDashboard?.addEventListener("click", handleSalesRepDashboardClick);
  adminEls.salesRepProfile?.addEventListener("click", handleSalesRepProfileClick);
  document.querySelector("#resetSalesRepForm").addEventListener("click", resetSalesRepForm);
  adminEls.commissionSalesRepFilter.addEventListener("change", loadSalesCommissions);
  adminEls.reloadCommissions.addEventListener("click", loadSalesCommissions);
  adminEls.createCommissionSettlement.addEventListener("click", createCommissionSettlement);
  adminEls.selectAllCommissions.addEventListener("change", toggleAllCommissions);
  adminEls.commissionsTableBody.addEventListener("change", renderCommissionSummary);
  adminEls.commissionSettlements.addEventListener("click", handleCommissionSettlementClick);
  adminEls.distributorSearch.addEventListener("input", debounce(loadDistributors, 250));
  adminEls.distributorStatusFilter.addEventListener("change", loadDistributors);
  adminEls.reloadDistributors.addEventListener("click", loadDistributors);
  adminEls.distributorForm.addEventListener("submit", saveDistributor);
  adminEls.distributorsTableBody.addEventListener("click", handleDistributorsTableClick);
  document.querySelector("#resetDistributorForm").addEventListener("click", resetDistributorForm);
  adminEls.settingsForm.addEventListener("submit", saveSettings);
  adminEls.paymentAccountForm.addEventListener("submit", savePaymentAccount);
  document.querySelector("#resetPaymentAccountForm").addEventListener("click", resetPaymentAccountForm);
  adminEls.paymentAccountList.addEventListener("click", handlePaymentAccountListClick);
  adminEls.currentAccountSearch.addEventListener("input", debounce(() => renderCurrentAccountDashboard(), 200));
  document.querySelector("#reloadCurrentAccounts").addEventListener("click", loadOperationDashboard);
  adminEls.currentAccountDashboard.addEventListener("click", handleCurrentAccountClick);
  document.querySelector("#reloadOperationDashboard").addEventListener("click", loadOperationDashboard);
  adminEls.operationDashboard.addEventListener("click", handleOperationDashboardClick);
  adminEls.deleteTestOrdersForm.addEventListener("submit", deleteTestOrders);
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
    adminEls.adminLoginMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.adminLoginForm, false);
  }
}

async function enterWorkspace() {
  adminEls.adminLoginPanel.hidden = true;
  adminEls.adminWorkspace.hidden = false;
  adminEls.adminSession.hidden = false;
  adminEls.adminEmail.textContent = adminState.user.email;
  await loadSalesReps();
  await Promise.all([loadCustomers(), loadDistributors(), loadProducts(), loadOrders(), loadSettings(), loadEmails(), loadSecurityEvents(), loadAnalyticsDashboard(), loadOperationDashboard()]);
  showAdminView(currentAdminView(), false);
  resetProductForm();
  resetSalesRepForm();
  resetDistributorForm();
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
  if (updateHash && window.location.hash !== `#${targetView}`) window.location.hash = targetView;
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === targetView));
  document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== `${targetView}View`; });
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
  if (adminEls.salesRepSearch.value.trim()) params.set("q", adminEls.salesRepSearch.value.trim());
  if (adminEls.salesRepStatusFilter.value) params.set("status", adminEls.salesRepStatusFilter.value);
  const { salesReps } = await adminApi(`/api/admin/sales-reps${params.toString() ? `?${params}` : ""}`);
  adminState.salesReps = salesReps;
  refreshCustomerCreateSalesReps();
  renderSalesReps();
  renderCommissionSalesRepFilter();
  await loadSalesCommissions();
  await loadSalesRepDashboard();
  renderCustomers();
}

function renderSalesReps() {
  adminEls.salesRepsTableBody.innerHTML = adminState.salesReps.length ? adminState.salesReps.map((rep) => `
    <tr data-sales-rep-id="${rep.id}">
      <td><strong>${escapeAdmin(rep.name)}</strong><br><span>${escapeAdmin(rep.email)}</span></td>
      <td>${escapeAdmin(rep.phone || "-")}<br><span>WhatsApp ${escapeAdmin(rep.whatsapp || "-")}</span></td>
      <td>${escapeAdmin(rep.bank_name || "Sin banco")}<br><span>${escapeAdmin(rep.bank_alias || rep.bank_cbu || "-")}</span></td>
      <td>${formatBps(rep.default_commission_bps)}</td>
      <td><span class="status-badge ${rep.status === "active" ? "approved" : "suspended"}">${rep.status === "active" ? "Activo" : "Inactivo"}</span></td>
      <td><span class="status-badge ${Number(rep.has_portal_access || 0) ? "approved" : "pending"}">${Number(rep.has_portal_access || 0) ? "Activo" : "Sin clave"}</span></td>
      <td><button class="ghost-button row-button" type="button" data-edit-sales-rep="${rep.id}">Editar</button></td>
    </tr>
  `).join("") : `<tr><td colspan="7">Todavia no hay vendedores cargados.</td></tr>`;
  adminEls.salesRepsTableBody.querySelectorAll("[data-edit-sales-rep]").forEach((button) => button.addEventListener("click", editSalesRep));
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
  adminEls.salesRepForm.elements.portalPassword.value = "";
  adminEls.salesRepForm.elements.notes.value = rep.notes || "";
  adminEls.salesRepMessage.textContent = "";
}

function resetSalesRepForm() {
  adminEls.salesRepForm.reset();
  adminEls.salesRepForm.elements.id.value = "";
  adminEls.salesRepForm.elements.defaultCommission.value = "0";
  adminEls.salesRepForm.elements.status.value = "active";
  adminEls.salesRepForm.elements.portalPassword.value = "";
  adminEls.salesRepFormTitle.textContent = "Nuevo vendedor";
  adminEls.salesRepMessage.textContent = "";
}

async function saveSalesRep(event) {
  event.preventDefault();
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
        portalPassword: values.portalPassword,
        notes: values.notes
      }
    });
    adminEls.salesRepMessage.textContent = "Vendedor guardado.";
    resetSalesRepForm();
    await loadSalesReps();
  } catch (error) {
    adminEls.salesRepMessage.textContent = error.message;
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
  if (adminEls.commissionSalesRepFilter.value) params.set("salesRepId", adminEls.commissionSalesRepFilter.value);
  const { pending, settlements } = await adminApi(`/api/admin/sales-commissions${params.toString() ? `?${params}` : ""}`);
  adminState.pendingCommissions = pending || [];
  adminState.commissionSettlements = settlements || [];
  renderCommissions();
}

function renderCommissions() {
  adminEls.selectAllCommissions.checked = false;
  adminEls.commissionsTableBody.innerHTML = adminState.pendingCommissions.length ? adminState.pendingCommissions.map((row) => `
    <tr>
      <td><input type="checkbox" data-commission-order="${row.id}" /></td>
      <td><strong>${escapeAdmin(row.order_number)}</strong><br><span>${formatDate(row.updated_at || row.created_at)}</span></td>
      <td>${escapeAdmin(row.business_name || "-")}</td>
      <td>${escapeAdmin(row.sales_rep_name || "Sin vendedor")}<br><span>${escapeAdmin(row.sales_rep_email || "")}</span></td>
      <td>${adminMoney.format((row.sales_commission_base_cents || row.subtotal_net_cents || 0) / 100)}<br><span>${formatBps(row.sales_commission_bps || 0)}</span></td>
      <td><strong>${adminMoney.format((row.sales_commission_cents || 0) / 100)}</strong></td>
    </tr>
  `).join("") : `<tr><td colspan="6">No hay comisiones cobradas pendientes de liquidar.</td></tr>`;
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
      <td>
        <strong>${escapeAdmin(distributor.name)}</strong>
        <br><span>${escapeAdmin(distributor.coverage || "Sin cobertura cargada")}</span>
      </td>
      <td>
        ${escapeAdmin([distributor.city, distributor.province].filter(Boolean).join(", ") || "Sin zona")}
        <br><span>${escapeAdmin(distributor.address || "")}</span>
      </td>
      <td>
        ${escapeAdmin(distributor.contactPerson || "Sin contacto")}
        <br><span>${escapeAdmin([
          distributor.whatsapp ? `WhatsApp ${distributor.whatsapp}` : "",
          distributor.email
        ].filter(Boolean).join(" | ") || "Sin datos")}</span>
      </td>
      <td>
        <span class="state-badge ${distributor.isPublished ? "success" : "neutral"}">${distributor.isPublished ? "Publicado" : "No publicado"}</span>
        <br><span>Orden ${Number(distributor.sortOrder || 0)}</span>
      </td>
      <td>
        <button class="ghost-button small-button" type="button" data-edit-distributor="${distributor.id}">Editar</button>
        <button class="ghost-button danger small-button" type="button" data-delete-distributor="${distributor.id}">Eliminar</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5">Todavia no hay distribuidores cargados.</td></tr>`;
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
  adminEls.productsTableBody.innerHTML = adminState.products.length ? adminState.products.map((product) => `
    <tr data-product-id="${product.id}">
      <td><strong>${escapeAdmin(product.kmCode)}</strong>${adminPromotionBadge(product.promotion?.current)}<br><span>${escapeAdmin(product.ean13)}</span></td>
      <td>${escapeAdmin(product.name)}${product.measure ? `<br><span>${escapeAdmin(product.measure)}</span>` : ""}${product.warehouseLocation ? `<br><span>Ubicacion: ${escapeAdmin(product.warehouseLocation)}</span>` : ""}</td>
      <td>${escapeAdmin(product.family.name)}</td>
      <td>${adminMoney.format(product.basePriceCents / 100)}</td>
      <td><span class="status-badge ${product.active ? "approved" : "suspended"}">${product.active ? "Activo" : "Inactivo"}</span>${product.imageCount ? `<br><span>${product.imageCount} img.</span>` : ""}</td>
      <td><button class="ghost-button row-button" type="button" data-edit-product="${product.id}">Editar</button></td>
    </tr>
  `).join("") : `<tr><td colspan="6">No hay productos para este filtro.</td></tr>`;
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
  loadProductImages(product.id);
  adminEls.productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  adminState.selectedProductId = null;
  adminEls.productForm.reset();
  adminEls.productFormTitle.textContent = "Nuevo producto";
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
  adminEls.productMessage.textContent = "";
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
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}: formato no permitido.`);
      if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: maximo 5 MB.`);
      const dataBase64 = await fileToBase64(file);
      const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images`, {
        method: "POST",
        body: { originalFilename: file.name, mimeType: file.type, dataBase64 }
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
    adminEls.customerCreateMessage.textContent = error.message;
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
    <div class="customer-detail-panel">
      ${selectedCustomer ? renderCustomerDetail(selectedCustomer) : `<p class="admin-empty">Selecciona un cliente para editar condiciones comerciales.</p>`}
    </div>`;

  bindCustomerControls();
}

function renderCustomerRow(customer) {
  const isSelected = customer.id === adminState.selectedCustomerId;
  return `<tr class="${isSelected ? "selected" : ""}">
    <td><strong>${escapeAdmin(customer.business_name)}</strong><span>${escapeAdmin(customer.tax_id)} · ${escapeAdmin(customer.email)}</span></td>
    <td>${stateBadge(statusLabels[customer.approval_status] || customer.approval_status, customer.approval_status === "approved" ? "success" : customer.approval_status === "pending" ? "warning" : "neutral")}</td>
    <td>${customerClassBadge(customer.commercial_class)}</td>
    <td><strong>${escapeAdmin(customerPaymentConditionText(customer))}</strong></td>
    <td>${escapeAdmin(customer.sales_rep_name || "Sin vendedor")}<span>${escapeAdmin(customerCommissionText(customer))}</span></td>
    <td>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)}<span>${escapeAdmin(customer.postal_code || "")}</span></td>
    <td>${escapeAdmin(customerDiscountText(customer))}</td>
    <td>${customer.last_order_number ? `<strong>${escapeAdmin(customer.last_order_number)}</strong><span>${formatDate(customer.last_order_at)}</span>` : `<span>Sin pedidos</span>`}</td>
    <td><button class="ghost-button row-button" type="button" data-view-customer="${customer.id}">${isSelected ? "Abierto" : "Ver"}</button></td>
  </tr>`;
}

function renderCustomerDetail(customer) {
  return `
    <article class="customer-row customer-detail-card" data-customer-id="${customer.id}">
      <div class="customer-main">
        <div class="customer-heading">
          <div>
            <p class="eyebrow">Detalle comercial</p>
            <strong>${escapeAdmin(customer.business_name)}</strong>
            <span>${escapeAdmin(customer.email)}</span>
          </div>
          <span class="status-badge ${customer.approval_status}">${statusLabels[customer.approval_status]}</span>
        </div>
        <dl class="customer-data">
          <div><dt>CUIT</dt><dd>${escapeAdmin(customer.tax_id)}</dd></div><div><dt>Condicion fiscal</dt><dd>${escapeAdmin(customer.tax_condition)}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeAdmin(customer.customer_type)}</dd></div><div><dt>Rubro</dt><dd>${escapeAdmin(customer.industry)}</dd></div>
          <div><dt>Ubicacion</dt><dd>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)} ${escapeAdmin(customer.postal_code || "")}</dd></div><div><dt>Contacto</dt><dd>${escapeAdmin(customer.contact_person)}</dd></div>
          <div><dt>Telefono</dt><dd>${escapeAdmin(customer.phone)}</dd></div><div><dt>WhatsApp</dt><dd>${escapeAdmin(customer.whatsapp)}</dd></div>
          <div><dt>Vendedor</dt><dd>${escapeAdmin(customer.sales_rep_name || "Sin asignar")}</dd></div><div><dt>Comision</dt><dd>${escapeAdmin(customerCommissionText(customer))}</dd></div>
          <div><dt>Condicion de pago</dt><dd>${escapeAdmin(customerPaymentConditionText(customer))}</dd></div><div><dt>Descuentos</dt><dd>${escapeAdmin(customerDiscountText(customer))}</dd></div>
        </dl>
      </div>
      <div class="customer-controls">
        <div class="status-actions">
          <button class="approve" type="button" data-customer-status="approved">Aprobar</button>
          <button type="button" data-customer-status="rejected">Rechazar</button>
          <button type="button" data-customer-status="suspended">Suspender</button>
        </div>
        <form class="discount-form">
          <label><span>Desc. 1 (%)</span><input name="discount1" type="number" min="0" max="100" step="0.01" value="${customer.discount_1_bps / 100}" /></label>
          <label><span>Desc. 2 (%)</span><input name="discount2" type="number" min="0" max="100" step="0.01" value="${customer.discount_2_bps / 100}" /></label>
          <label><span>Desc. 3 (%)</span><input name="discount3" type="number" min="0" max="100" step="0.01" value="${customer.discount_3_bps / 100}" /></label>
          <button class="ghost-button" type="submit">Guardar descuentos</button>
        </form>
        <form class="sales-assignment-form">
          <div class="sales-summary wide">Asignacion comercial: <strong>${escapeAdmin(customer.sales_rep_name || "sin vendedor")}</strong></div>
          <label><span>Vendedor</span><select name="salesRepId">${salesRepOptions(customer.sales_rep_id)}</select></label>
          <label><span>Comision cliente (%)</span><input name="commission" type="number" min="0" max="100" step="0.01" value="${customer.sales_commission_bps === null || customer.sales_commission_bps === undefined ? "" : customer.sales_commission_bps / 100}" placeholder="General" /></label>
          <button class="ghost-button" type="submit">Guardar vendedor</button>
        </form>
        <form class="customer-class-form">
          <div class="sales-summary wide">Marca interna: ${customerClassBadge(customer.commercial_class)}</div>
          <label><span>B / N</span><select name="commercialClass">${customerClassOptions(customer.commercial_class)}</select></label>
          <button class="ghost-button" type="submit">Guardar</button>
        </form>
        <form class="customer-payment-form">
          <div class="sales-summary wide">Condicion de pago: <strong>${escapeAdmin(customerPaymentConditionText(customer))}</strong></div>
          <label><span>Condicion</span><select name="paymentCondition">${customerPaymentOptions(customer.payment_condition)}</select></label>
          <label data-payment-terms-field ${normalizeCustomerPaymentCondition(customer.payment_condition) === "credit_account" ? "" : "hidden"}><span>Dias cta. cte.</span><input name="paymentTermsDays" type="number" min="1" max="365" step="1" value="${customer.payment_terms_days || 15}" ${normalizeCustomerPaymentCondition(customer.payment_condition) === "credit_account" ? "" : "disabled"} /></label>
          <button class="ghost-button" type="submit">Guardar condicion</button>
        </form>
        <form class="customer-payment-accounts-form">
          <div class="sales-summary wide">Cuentas de cobro habilitadas</div>
          ${renderCustomerPaymentAccounts(customer)}
          <button class="ghost-button wide" type="submit">Guardar cuentas</button>
        </form>
        <form class="product-discount-form">
          <div class="sales-summary wide">Condiciones especiales por producto</div>
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
    </article>`;
}

function bindCustomerControls() {
  adminEls.customerList.querySelectorAll("[data-view-customer]").forEach((button) => button.addEventListener("click", viewCustomerDetail));
  adminEls.customerList.querySelectorAll("[data-customer-status]").forEach((button) => button.addEventListener("click", updateCustomerStatus));
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
}

async function viewCustomerDetail(event) {
  adminState.selectedCustomerId = Number(event.currentTarget.dataset.viewCustomer);
  renderCustomers();
  await Promise.all([
    loadCustomerProductDiscounts(adminState.selectedCustomerId, false),
    loadCustomerPaymentAccounts(adminState.selectedCustomerId, false)
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

async function loadOrders() {
  const params = new URLSearchParams();
  if (adminEls.orderSearch.value.trim()) params.set("q", adminEls.orderSearch.value.trim());
  if (adminEls.orderStatusFilter.value) params.set("status", adminEls.orderStatusFilter.value);
  if (adminEls.orderPaymentFilter.value) params.set("payment", adminEls.orderPaymentFilter.value);
  if (adminEls.orderFulfillmentFilter.value) params.set("fulfillment", adminEls.orderFulfillmentFilter.value);
  const { orders } = await adminApi(`/api/admin/orders${params.toString() ? `?${params}` : ""}`);
  adminState.orders = orders;
  renderOrderOpsStats(orders);
  adminEls.ordersTableBody.innerHTML = orders.length ? orders.map((order) => `
    <tr><td><div class="order-code-cell">${customerClassBadge(order.commercial_class)}<strong>${escapeAdmin(order.order_number)}</strong></div></td><td>${escapeAdmin(order.business_name)}</td>
      <td>${stateBadge(orderStatusText(order.status), orderStateClasses[order.status])}</td>
      <td>${stateBadge(paymentStatusText(order.payment_status), paymentStateClasses[order.payment_status])}</td>
      <td>${stateBadge(fulfillmentStatusText(normalizedFulfillmentStatus(order.fulfillment_status)), fulfillmentStateClasses[normalizedFulfillmentStatus(order.fulfillment_status)])}</td>
      <td>${adminMoney.format(order.total_cents / 100)}</td><td>${formatDate(order.created_at)}</td>
      <td><button class="ghost-button row-button" type="button" data-view-order="${order.id}">Ver</button></td></tr>
  `).join("") : `<tr><td colspan="8">No hay pedidos para este filtro.</td></tr>`;
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
      <td><strong>${escapeAdmin(item.kmCode)}</strong><br><span>EAN ${escapeAdmin(item.ean13)}</span></td>
      <td>${escapeAdmin(item.productName)}${item.warehouseLocation ? `<br><span>Ubicacion: ${escapeAdmin(item.warehouseLocation)}</span>` : ""}${item.availabilityNote ? `<br><span>${escapeAdmin(item.availabilityNote)}</span>` : ""}</td>
      <td>${item.quantity}</td>
      <td><input class="confirmed-qty-input" name="confirmedQuantity-${item.id}" type="number" min="0" max="${item.quantity}" step="1" value="${item.confirmedQuantity || 0}" /></td>
      <td>${adminMoney.format(item.finalUnitPriceCents / 100)}</td>
      <td data-confirmed-subtotal>${adminMoney.format((item.confirmedSubtotalNetCents || 0) / 100)}</td>
      <td><input name="availabilityNote-${item.id}" value="${escapeAdmin(item.availabilityNote || "")}" placeholder="${item.confirmedQuantity ? "" : "Motivo si no disponible"}" /></td>
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

function renderOrderSummary(order) {
  const fulfillmentStatus = normalizedFulfillmentStatus(order.fulfillment?.status);
  const sections = [
    {
      title: "Estado de operacion",
      items: [
        { label: "", value: customerClassBadge(order.commercialClass), html: true },
        { label: "Comercial", value: stateBadge(orderStatusText(order.status), orderStateClasses[order.status]), html: true },
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
  adminEls.orderDetailActions.innerHTML = isInitialReview
    ? documentActions
    : fulfillmentStatus === "shipped"
    ? `${whatsappAction}${documentActions}`
    : `${documentActions}${customerWhatsapp && canOperateDocuments ? whatsappAction : ""}${!canOperateDocuments ? whatsappAction : ""}`;
  const pickingButton = adminEls.orderDetailActions.querySelector("#openPickingList");
  if (pickingButton) pickingButton.addEventListener("click", openPickingList);
  const deliveryButton = adminEls.orderDetailActions.querySelector("#openDeliveryNote");
  if (deliveryButton) deliveryButton.addEventListener("click", openDeliveryNote);
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
  const canManageOpenBalance = availabilityConfirmed && (order.balanceCents || 0) > 0;
  const canManageFulfillment = canPrepareOrDispatchOrder(order);
  const needsPaymentAction = ["receipt_uploaded", "rejected", "overdue"].includes(order.paymentStatus)
    || (availabilityConfirmed && order.paymentStatus === "pending_payment")
    || canManageOpenBalance;

  adminEls.availabilityForm.hidden = !canConfirmAvailability;
  adminEls.paymentReviewPanel.hidden = isCancelled || !needsPaymentAction;
  adminEls.fulfillmentForm.hidden = !canManageFulfillment;
  adminEls.orderAdvancedPanel.hidden = isCancelled || isClosed;
  adminEls.orderAdvancedPanel.open = false;

  if (isCancelled) {
    renderNextStep("Pedido cancelado", "No hay acciones operativas pendientes. Los ajustes manuales quedan bloqueados para preservar el historial.", "danger");
    return;
  }
  if (isClosed) {
    renderNextStep("Pedido recibido por el cliente", "El cliente confirmo la recepcion. La operacion queda cerrada como historial y no hay acciones de despacho pendientes.", "done");
    return;
  }
  if (canConfirmAvailability) {
    resetAvailabilityPaymentFields(order);
    renderNextStep("Proxima accion: preparar y confirmar disponibilidad", "Imprimi la preparacion, controla articulos disponibles, ajusta parciales si corresponde y confirma disponibilidad al cliente.", "info");
    return;
  }
  if (availabilityConfirmed && order.paymentStatus === "pending_payment") {
    renderNextStep("Proxima accion: esperar comprobante de pago", "La disponibilidad ya fue confirmada. El cliente debe cargar o enviar el comprobante para avanzar con preparacion y despacho.", "warning");
    return;
  }
  if (order.paymentStatus === "overdue") {
    renderNextStep("Saldo vencido", `El pedido tiene saldo vencido por ${adminMoney.format((order.balanceCents || 0) / 100)}. Revisar condicion comercial antes de avanzar.`, "danger");
    return;
  }
  if (order.paymentStatus === "receipt_uploaded") {
    renderNextStep("Proxima accion: revisar comprobante", "Hay un comprobante cargado. Aceptalo si el pago esta acreditado o rechazalo indicando el motivo.", "progress");
    return;
  }
  if (order.paymentStatus === "rejected") {
    renderNextStep("Proxima accion: corregir pago", "El ultimo comprobante fue rechazado. Espera una nueva carga del cliente o coordina la correccion por WhatsApp/email.", "danger");
    return;
  }
  if (fulfillmentStatus === "shipped") {
    renderNextStep("Esperando recepcion del cliente", "El pedido ya fue despachado. No hay acciones operativas pendientes hasta que el cliente confirme la recepcion desde Mis compras.", "done");
    return;
  }
  if (canManageFulfillment) {
    if (fulfillmentStatus === "pending") {
      renderNextStep("Proxima accion: preparar pedido", "Imprimi preparacion, controla articulos y bultos, y marca el pedido como preparado para despacho.", "success");
      return;
    }
    if (fulfillmentStatus === "ready") {
      renderNextStep("Proxima accion: despachar pedido", "Carga modalidad, transporte, guia/remito y fecha de salida. Luego marca el pedido como despachado.", "progress");
      return;
    }
    renderNextStep("Proxima accion: preparar despacho", "El pedido esta habilitado para logistica.", "success");
    return;
  }
  renderNextStep("Pedido en seguimiento", "No hay una accion automatica sugerida para esta combinacion de estados. Usa ajustes avanzados solo si necesitas corregir el flujo.", "neutral");
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
  return paymentAllowsFulfillment && availabilityConfirmed && !isReceivedByCustomer && order.status !== "cancelled";
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
    adminEls.fulfillmentMessage.textContent = "Despacho guardado y email enviado.";
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
  const canAuthorizeBalance = balanceCents > 0 && !pendingReceipts.length && !needsAmountRegularization;
  const canApplyCommercialAdjustment = balanceCents > 0 && order.paymentStatus !== "settled_adjustment";
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
  adminEls.emailsTableBody.innerHTML = adminState.emails.length ? adminState.emails.map((email) => `
    <tr>
      <td>${formatDate(email.created_at)}</td>
      <td>${escapeAdmin(email.event_type)}</td>
      <td>${escapeAdmin(email.recipient)}</td>
      <td>${escapeAdmin(email.subject)}</td>
      <td><span class="status-badge ${email.status}">${email.status === "sent" ? "Enviado" : "Pendiente"}</span></td>
      <td>${email.attempts}</td>
      <td class="email-error">${escapeAdmin(email.last_error || "")}</td>
    </tr>
  `).join("") : `<tr><td colspan="7">Todavia no hay emails registrados.</td></tr>`;
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
  adminEls.securityTableBody.innerHTML = adminState.securityEvents.length ? adminState.securityEvents.map((event) => `
    <tr>
      <td>${formatDate(event.created_at)}</td>
      <td><span class="status-badge ${securityEventClass(event.event_type)}">${securityEventLabel(event.event_type)}</span></td>
      <td>${escapeAdmin(event.email || "")}</td>
      <td>${escapeAdmin(event.role || "")}</td>
      <td>${escapeAdmin(event.ip_address || "")}</td>
      <td>${escapeAdmin(`${event.method || ""} ${event.path || ""}`.trim())}</td>
      <td class="security-agent">${escapeAdmin(shortUserAgent(event.user_agent || ""))}</td>
    </tr>
  `).join("") : `<tr><td colspan="7">Todavia no hay eventos de seguridad registrados.</td></tr>`;
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
    whatsappNumber: values.whatsappNumber
  };
  setBusy(adminEls.settingsForm, true);
  try {
    const { settings } = await adminApi("/api/admin/settings", { method: "PATCH", body });
    adminState.settings = settings;
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
  const { dashboard } = await adminApi("/api/admin/operation/dashboard");
  adminState.operationDashboard = dashboard;
  renderOperationDashboard(dashboard);
  renderCurrentAccountDashboard(dashboard);
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
  adminEls.analyticsDashboard.innerHTML = `
    <div class="operation-metrics">
      ${metricCard("Sesiones", summary.sessions || 0, `Periodo ${dashboard.days || 30} dias`)}
      ${metricCard("Anonimos", summary.anonymousSessions || 0, "Sin cuenta identificada")}
      ${metricCard("Clientes activos", summary.activeCustomers || 0, "Cuentas que navegaron")}
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
            <strong>${escapeAdmin(row.identity || "Visitante anonimo")}</strong>
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
  const summary = dashboard.summary || {};
  const currentAccounts = dashboard.currentAccounts || {};
  const storage = dashboard.storage || {};
  adminEls.operationDashboard.innerHTML = `
    <div class="operation-metrics">
      ${metricCard("Pedidos activos", summary.activeOrders || 0, "En curso operativo")}
      ${metricCard("Ventas del mes", adminMoney.format((summary.monthTotalCents || 0) / 100), "Total confirmado")}
      ${metricCard("Cobrado del mes", adminMoney.format((summary.monthPaidCents || 0) / 100), "Pagos acreditados")}
      ${metricCard("Saldo abierto", adminMoney.format((summary.openBalanceCents || 0) / 100), "Cuenta corriente y pagos pendientes")}
      ${metricCard("Vencido", adminMoney.format((summary.overdueBalanceCents || 0) / 100), "Requiere seguimiento")}
      ${metricCard("Por despachar", summary.pendingDispatch || 0, "Pedidos listos")}
    </div>
    <div class="operation-layout">
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Cuenta corriente</p><h3>Saldos abiertos</h3></div>
        ${renderAccountRows(currentAccounts.open || [])}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Vencimientos</p><h3>Alertas comerciales</h3></div>
        <div class="operation-alerts">
          <div><span>Vencen pronto</span><strong>${adminMoney.format((summary.dueSoonBalanceCents || 0) / 100)}</strong></div>
          <div><span>Vencidos</span><strong>${adminMoney.format((summary.overdueBalanceCents || 0) / 100)}</strong></div>
        </div>
        ${renderAccountRows([...(currentAccounts.overdue || []), ...(currentAccounts.dueSoon || [])].slice(0, 8))}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Clientes</p><h3>Ranking del mes</h3></div>
        ${renderRankRows(dashboard.sales?.byCustomer || [], "businessName", "totalCents")}
      </section>
      <section class="operation-panel">
        <div class="panel-heading"><p class="eyebrow">Vendedores</p><h3>Comisiones del mes</h3></div>
        ${renderSalesRepRows(dashboard.sales?.bySalesRep || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Productos</p><h3>Mas vendidos</h3></div>
        ${renderProductRankRows(dashboard.products || [])}
      </section>
      <section class="operation-panel wide">
        <div class="panel-heading"><p class="eyebrow">Sistema</p><h3>Respaldo y datos</h3></div>
        ${renderStorageStatus(storage)}
      </section>
    </div>
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
      ${backupCount > 1 ? `
        <div class="storage-actions">
          <button type="button" class="ghost-button" data-prune-backups>Limpiar backups antiguos</button>
        </div>
      ` : ""}
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
  const pruneButton = event.target.closest("[data-prune-backups]");
  if (pruneButton && adminEls.operationDashboard.contains(pruneButton)) {
    pruneBackups(pruneButton);
    return;
  }
  const button = event.target.closest("[data-dashboard-order]");
  if (!button || !adminEls.operationDashboard.contains(button)) return;
  showAdminView("orders");
  openOrderDetail(Number(button.dataset.dashboardOrder), button);
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
    renderOperationDashboard(adminState.operationDashboard);
    showToast(`Backups eliminados: ${result.deleted?.length || 0}. Espacio liberado: ${formatFileSize(result.deletedBytes || 0)}.`);
  } catch (error) {
    showToast(error.message, "error");
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
  return `
    <button class="current-account-row ${due.className}" type="button" data-account-order="${row.id}">
      <span><strong>${escapeAdmin(row.orderNumber)}</strong><small>${escapeAdmin(row.businessName || "-")}</small></span>
      <span><strong>${escapeAdmin(row.salesRepName || "Sin vendedor")}</strong><small>${escapeAdmin(row.salesRepEmail || "General")}</small></span>
      <span><strong>${adminMoney.format((row.totalCents || 0) / 100)}</strong><small>Total pedido</small></span>
      <span><strong>${adminMoney.format((row.paidCents || 0) / 100)}</strong><small>Acreditado</small></span>
      <span><strong>${adminMoney.format((row.balanceCents || 0) / 100)}</strong><small>Saldo</small></span>
      <span><strong>${escapeAdmin(due.label)}</strong><small>${escapeAdmin(due.hint)}</small></span>
      <span><em>Ver</em></span>
    </button>
  `;
}

function handleCurrentAccountClick(event) {
  const filterButton = event.target.closest("[data-account-filter]");
  if (filterButton && adminEls.currentAccountDashboard.contains(filterButton)) {
    adminState.currentAccountFilter = filterButton.dataset.accountFilter;
    renderCurrentAccountDashboard();
    return;
  }
  const rowButton = event.target.closest("[data-account-order]");
  if (!rowButton || !adminEls.currentAccountDashboard.contains(rowButton)) return;
  showAdminView("orders");
  openOrderDetail(Number(rowButton.dataset.accountOrder), rowButton);
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

async function adminApi(url, { method = "GET", body } = {}) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operacion.");
    error.status = response.status;
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
