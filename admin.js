const adminState = { user: null, customers: [], orders: [], settings: null, emails: [], emailSummary: null, emailEnabled: false, emailProvider: "" };
const adminMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const statusLabels = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
  suspended: "Suspendido", inactive: "Inactivo"
};

const adminEls = Object.fromEntries([
  "adminSession", "adminEmail", "adminLoginPanel", "adminLoginForm", "adminLoginMessage",
  "adminWorkspace", "customerStatusFilter", "customerStats", "customerList", "ordersTableBody",
  "settingsForm", "settingsMessage", "emailStats", "emailConfigStatus", "emailsTableBody", "adminToast"
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
  adminEls.customerStatusFilter.addEventListener("change", loadCustomers);
  document.querySelector("#reloadCustomers").addEventListener("click", loadCustomers);
  document.querySelector("#reloadOrders").addEventListener("click", loadOrders);
  document.querySelector("#reloadEmails").addEventListener("click", loadEmails);
  document.querySelector("#flushEmails").addEventListener("click", flushEmails);
  adminEls.settingsForm.addEventListener("submit", saveSettings);
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
  await Promise.all([loadCustomers(), loadOrders(), loadSettings(), loadEmails()]);
}

async function logoutAdmin() {
  await adminApi("/api/auth/logout", { method: "POST" });
  adminState.user = null;
  adminEls.adminWorkspace.hidden = true;
  adminEls.adminSession.hidden = true;
  adminEls.adminLoginPanel.hidden = false;
  adminEls.adminLoginForm.reset();
}

function showAdminView(view) {
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === view));
  document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== `${view}View`; });
}

async function loadCustomers() {
  const status = adminEls.customerStatusFilter.value;
  const { customers } = await adminApi(`/api/admin/customers${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  adminState.customers = customers;
  renderCustomerStats();
  renderCustomers();
}

function renderCustomerStats() {
  const counts = Object.fromEntries(Object.keys(statusLabels).map((status) => [status, adminState.customers.filter((customer) => customer.approval_status === status).length]));
  adminEls.customerStats.innerHTML = [
    ["Total", adminState.customers.length], ["Pendientes", counts.pending], ["Aprobados", counts.approved], ["Suspendidos", counts.suspended]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderCustomers() {
  if (!adminState.customers.length) {
    adminEls.customerList.innerHTML = `<p class="admin-empty">No hay clientes para este filtro.</p>`;
    return;
  }
  adminEls.customerList.innerHTML = adminState.customers.map((customer) => `
    <article class="customer-row" data-customer-id="${customer.id}">
      <div class="customer-main">
        <div class="customer-heading"><div><strong>${escapeAdmin(customer.business_name)}</strong><span>${escapeAdmin(customer.email)}</span></div><span class="status-badge ${customer.approval_status}">${statusLabels[customer.approval_status]}</span></div>
        <dl class="customer-data">
          <div><dt>CUIT</dt><dd>${escapeAdmin(customer.tax_id)}</dd></div><div><dt>Condicion</dt><dd>${escapeAdmin(customer.tax_condition)}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeAdmin(customer.customer_type)}</dd></div><div><dt>Rubro</dt><dd>${escapeAdmin(customer.industry)}</dd></div>
          <div><dt>Ubicacion</dt><dd>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)}</dd></div><div><dt>Contacto</dt><dd>${escapeAdmin(customer.contact_person)}</dd></div>
          <div><dt>Telefono</dt><dd>${escapeAdmin(customer.phone)}</dd></div><div><dt>WhatsApp</dt><dd>${escapeAdmin(customer.whatsapp)}</dd></div>
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
      </div>
    </article>`).join("");

  adminEls.customerList.querySelectorAll("[data-customer-status]").forEach((button) => button.addEventListener("click", updateCustomerStatus));
  adminEls.customerList.querySelectorAll(".discount-form").forEach((form) => form.addEventListener("submit", saveDiscounts));
}

async function updateCustomerStatus(event) {
  const row = event.currentTarget.closest("[data-customer-id]");
  const customerId = Number(row.dataset.customerId);
  const status = event.currentTarget.dataset.customerStatus;
  event.currentTarget.disabled = true;
  try {
    await adminApi(`/api/admin/customers/${customerId}/status`, { method: "PATCH", body: { status } });
    showAdminToast(`Cliente ${statusLabels[status].toLowerCase()}.`);
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
    event.currentTarget.disabled = false;
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

async function loadOrders() {
  const { orders } = await adminApi("/api/admin/orders");
  adminState.orders = orders;
  adminEls.ordersTableBody.innerHTML = orders.length ? orders.map((order) => `
    <tr><td><strong>${escapeAdmin(order.order_number)}</strong></td><td>${escapeAdmin(order.business_name)}</td>
      <td>${escapeAdmin(order.status)}</td><td>${escapeAdmin(order.payment_status)}</td>
      <td>${adminMoney.format(order.total_cents / 100)}</td><td>${formatDate(order.created_at)}</td></tr>
  `).join("") : `<tr><td colspan="6">Todavia no hay pedidos.</td></tr>`;
}

async function loadSettings() {
  const { settings } = await adminApi("/api/admin/settings");
  adminState.settings = settings;
  const form = adminEls.settingsForm.elements;
  form.vatPercent.value = settings.vatBps / 100;
  form.whatsappNumber.value = settings.whatsappNumber;
  for (const key of ["bankName", "accountHolder", "taxId", "cbu", "alias", "accountType", "instructions"]) form[key].value = settings.bank[key] || "";
}

async function loadEmails() {
  const { enabled, provider, summary, emails } = await adminApi("/api/admin/emails");
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
    const { result, summary, emails } = await adminApi("/api/admin/emails/flush", { method: "POST" });
    adminState.emailSummary = summary;
    adminState.emails = emails;
    renderEmails();
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

async function saveSettings(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.settingsForm));
  const body = {
    vatBps: Math.round(Number(values.vatPercent) * 100),
    whatsappNumber: values.whatsappNumber,
    bank: Object.fromEntries(["bankName", "accountHolder", "taxId", "cbu", "alias", "accountType", "instructions"].map((key) => [key, values[key]]))
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
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(`${value}Z`));
}

function escapeAdmin(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

initAdmin();
