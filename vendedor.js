const state = {
  salesRep: null,
  dashboard: null,
  quotes: [],
  quoteDetails: {},
  orderDetails: {},
  customerAddresses: {},
  openCustomerAddressesId: null,
  editingCustomerAddressId: null,
  openQuoteId: null,
  openOrderId: null,
  activeView: "summary",
  mode: "order",
  summaryDateFrom: "",
  summaryDateTo: "",
  quoteSearch: "",
  quoteStatus: "",
  quoteDateFrom: "",
  quoteDateTo: "",
  orderSearch: "",
  orderStatus: "",
  orderDateFrom: "",
  orderDateTo: "",
  passwordResetToken: new URLSearchParams(window.location.search).get("reset") || "",
  order: {
    customerId: "",
    addresses: [],
    shippingAddressId: "",
    loadingAddresses: false,
    products: [],
    loadingProducts: false,
    items: []
  }
};

const nodes = {
  login: document.getElementById("sellerLogin"),
  dashboard: document.getElementById("sellerDashboard"),
  loginForm: document.getElementById("sellerLoginForm"),
  loginMessage: document.getElementById("sellerLoginMessage"),
  forgotOpen: document.getElementById("sellerForgotOpen"),
  forgotForm: document.getElementById("sellerForgotForm"),
  forgotBack: document.getElementById("sellerForgotBack"),
  forgotMessage: document.getElementById("sellerForgotMessage"),
  resetForm: document.getElementById("sellerResetForm"),
  resetBack: document.getElementById("sellerResetBack"),
  resetMessage: document.getElementById("sellerResetMessage"),
  changePasswordForm: document.getElementById("sellerChangePasswordForm"),
  changePasswordMessage: document.getElementById("sellerChangePasswordMessage"),
  session: document.getElementById("sellerSession"),
  title: document.getElementById("sellerTitle"),
  subtitle: document.getElementById("sellerSubtitle"),
  stats: document.getElementById("sellerStats"),
  summaryDateFrom: document.getElementById("sellerSummaryDateFrom"),
  summaryDateTo: document.getElementById("sellerSummaryDateTo"),
  customers: document.getElementById("sellerCustomers"),
  orders: document.getElementById("sellerOrders"),
  refresh: document.getElementById("refreshSellerDashboard"),
  orderForm: document.getElementById("sellerOrderForm"),
  orderCustomer: document.getElementById("sellerOrderCustomer"),
  orderShipping: document.getElementById("sellerOrderShipping"),
  orderShippingField: document.getElementById("sellerOrderShippingField"),
  productSearch: document.getElementById("sellerProductSearch"),
  productResults: document.getElementById("sellerProductResults"),
  orderItems: document.getElementById("sellerOrderItems"),
  orderTotal: document.getElementById("sellerOrderTotal"),
  orderMessage: document.getElementById("sellerOrderMessage"),
  clearOrder: document.getElementById("clearSellerOrder"),
  modeButtons: document.querySelectorAll("[data-seller-mode]"),
  builderTitle: document.getElementById("sellerBuilderTitle"),
  itemsLabel: document.getElementById("sellerItemsLabel"),
  orderSubmit: document.getElementById("sellerOrderSubmit"),
  quotes: document.getElementById("sellerQuotes"),
  quoteSearch: document.getElementById("sellerQuoteSearch"),
  quoteStatus: document.getElementById("sellerQuoteStatus"),
  quoteDateFrom: document.getElementById("sellerQuoteDateFrom"),
  quoteDateTo: document.getElementById("sellerQuoteDateTo"),
  orderSearch: document.getElementById("sellerOrderSearch"),
  orderStatus: document.getElementById("sellerOrderStatus"),
  orderDateFrom: document.getElementById("sellerOrderDateFrom"),
  orderDateTo: document.getElementById("sellerOrderDateTo"),
  customerRequestForm: document.getElementById("sellerCustomerRequestForm"),
  customerRequestMessage: document.getElementById("sellerCustomerRequestMessage"),
  customerRequestPanel: document.querySelector(".seller-request-panel"),
  customerRequestToggleText: document.getElementById("sellerRequestToggleText"),
  shippingSameAsCommercial: document.querySelector("[name='shippingSameAsCommercial']"),
  shippingFields: document.querySelector(".seller-shipping-fields"),
  viewButtons: document.querySelectorAll("[data-seller-view-button]"),
  views: document.querySelectorAll("[data-seller-view]")
};

const SELLER_LIST_LIMIT = 20;
const SELLER_PROVINCES = [
  "Buenos Aires", "Ciudad Autonoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Cordoba", "Corrientes",
  "Entre Rios", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquen", "Rio Negro",
  "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucuman"
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sellerApi(path, options = {}) {
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: hasBody
      ? { "content-type": "application/json", ...(options.headers || {}) }
      : (options.headers || {}),
    body: hasBody ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operación");
    error.status = response.status;
    error.details = payload.details || {};
    throw error;
  }
  return payload;
}

function setFormMessage(node, message = "", type = "") {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", type === "error");
  node.classList.toggle("is-success", type === "success");
}

function showLoginMode(mode = "login", message = "", type = "") {
  nodes.loginForm?.classList.toggle("hidden", mode !== "login");
  nodes.forgotForm?.classList.toggle("hidden", mode !== "forgot");
  nodes.resetForm?.classList.toggle("hidden", mode !== "reset");
  setFormMessage(nodes.loginMessage, mode === "login" ? message : "", mode === "login" ? type : "");
  setFormMessage(nodes.forgotMessage, mode === "forgot" ? message : "", mode === "forgot" ? type : "");
  setFormMessage(nodes.resetMessage, mode === "reset" ? message : "", mode === "reset" ? type : "");
}

function setupPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(button.dataset.togglePassword || "");
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      button.textContent = isHidden ? "Ocultar" : "Ver";
      button.setAttribute("aria-label", isHidden ? "Ocultar clave" : "Mostrar clave");
    });
  });
}

function validatePasswordPair(form, messageNode) {
  const password = String(new FormData(form).get("password") || "");
  const confirm = String(new FormData(form).get("passwordConfirm") || "");
  if (password.length < 10) {
    setFormMessage(messageNode, "La clave debe tener al menos 10 caracteres.", "error");
    return null;
  }
  if (password !== confirm) {
    setFormMessage(messageNode, "Las claves no coinciden.", "error");
    return null;
  }
  return password;
}

function money(cents) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2
  });
}

function shortDate(value) {
  if (!value) return "Sin fecha";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateKey(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function matchesDateRange(value, from, to) {
  const key = dateKey(value);
  if (!key) return true;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function quoteShareText(quote) {
  const customerName = quote.customerContact || quote.businessName || "cliente";
  const vatBps = Number(quote.vatBps || 0);
  const vatLabel = vatBps ? `IVA ${(vatBps / 100).toFixed(2).replace(".", ",")}%` : "IVA";
  const lines = [
    "*KM Detail Line*",
    "*Presupuesto comercial*",
    "",
    `Hola ${customerName}, te envio el presupuesto ${quote.quoteNumber || ""}.`,
    quote.businessName ? `Cliente: ${quote.businessName}` : "",
    quote.validUntil ? `Validez: ${shortDate(quote.validUntil)}` : "",
    "",
    "*Articulos cotizados*"
  ].filter(Boolean);
  (quote.items || []).slice(0, 25).forEach((item) => {
    lines.push(
      "",
      `${item.quantity} x ${item.kmCode} - ${item.productName}`,
      `Precio unitario sin IVA: ${money(item.finalUnitPriceCents || 0)}`,
      `Subtotal sin IVA: ${money(item.subtotalNetCents || 0)}`
    );
  });
  if ((quote.items || []).length > 25) lines.push("", "El presupuesto incluye mas articulos. Consultar detalle completo.");
  lines.push(
    "",
    "*Resumen del presupuesto*",
    `Subtotal sin IVA: ${money(quote.subtotalNetCents || 0)}`,
    `${vatLabel}: ${money(quote.vatCents || 0)}`,
    `*Total con IVA: ${money(quote.totalCents || 0)}*`,
    "",
    "Importes expresados en pesos argentinos."
  );
  if (quote.notes) {
    lines.push("", `Nota: ${quote.notes}`);
  }
  lines.push("", "Para confirmar o consultar este presupuesto, respondeme este mensaje.");
  return lines.join("\n");
}

async function getQuoteDetail(quoteId) {
  if (state.quoteDetails[quoteId]) return state.quoteDetails[quoteId];
  const payload = await sellerApi(`/api/sales/quotes/${encodeURIComponent(quoteId)}`);
  state.quoteDetails[quoteId] = payload.quote;
  return payload.quote;
}

function updateQuoteState(quote) {
  if (!quote?.id) return;
  state.quoteDetails[quote.id] = quote;
  state.quotes = state.quotes.map((current) =>
    Number(current.id) === Number(quote.id) ? { ...current, ...quote } : current
  );
}

async function getOrderDetail(orderId) {
  if (state.orderDetails[orderId]) return state.orderDetails[orderId];
  const payload = await sellerApi(`/api/sales/orders/${encodeURIComponent(orderId)}`);
  state.orderDetails[orderId] = payload.order;
  return payload.order;
}

const customerStatusLabels = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  inactive: "Inactivo"
};

const orderStatusLabels = {
  order_created: "Pedido recibido",
  availability_confirmed: "Disponibilidad confirmada",
  confirmed: "Pedido confirmado",
  in_preparation: "Pendiente de preparacion",
  ready: "Preparado para despacho",
  ready_to_ship: "Preparado para despacho",
  delivered: "Compra finalizada",
  customer_received: "Recibido por cliente",
  cancelled: "Cancelado"
};

const paymentStatusLabels = {
  pending_payment: "Pago pendiente",
  pending_review: "Pago en revision",
  receipt_uploaded: "Comprobante cargado",
  paid: "Pago acreditado",
  rejected: "Pago rechazado",
  credit_account: "Cuenta corriente",
  current_account: "Cuenta corriente",
  settled_adjustment: "Ajuste comercial",
  overdue: "Saldo vencido",
  refunded: "Reintegrado"
};

const fulfillmentStatusLabels = {
  pending: "Pendiente",
  pending_preparation: "Pendiente de preparacion",
  ready: "Preparado para despacho",
  ready_to_ship: "Preparado para despacho",
  shipped: "Despachado",
  delivered: "Recibido por cliente",
  customer_received: "Recibido por cliente"
};

const quoteStatusLabels = {
  generated: "Generado",
  converted: "Convertido",
  cancelled: "Cancelado",
  expired: "Vencido"
};

function badge(label, tone = "") {
  return `<span class="seller-badge ${tone}">${escapeHtml(label)}</span>`;
}

function orderTone(order) {
  if (["customer_received", "delivered"].includes(order.fulfillment_status)) return "green";
  if (order.payment_status === "paid" || order.payment_status === "settled_adjustment") return "green";
  if (order.payment_status === "current_account") return "blue";
  if (order.balance_cents > 0) return "gold";
  return "";
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function orderMatchesStatus(order) {
  if (!state.orderStatus) return true;
  const payment = order.payment_status || "";
  const fulfillment = order.fulfillment_status || "";
  if (state.orderStatus === "to_collect") return Number(order.balance_cents || 0) > 0;
  if (state.orderStatus === "shipped") return ["shipped", "ready", "ready_to_ship"].includes(fulfillment);
  if (state.orderStatus === "closed") return ["customer_received", "delivered"].includes(fulfillment);
  if (state.orderStatus === "open") {
    return !["customer_received", "delivered"].includes(fulfillment)
      && !["cancelled", "refunded"].includes(payment);
  }
  return true;
}

function summaryForPeriod(dashboard = {}) {
  const summary = dashboard.summary || {};
  const orders = (dashboard.orders || []).filter((order) =>
    matchesDateRange(order.created_at || order.createdAt, state.summaryDateFrom, state.summaryDateTo)
  );
  if (!state.summaryDateFrom && !state.summaryDateTo) return summary;
  const commissionToSettleCents = orders
    .filter((order) => Number(order.sales_commission_cents || 0) > 0
      && !order.sales_commission_settlement_id
      && Number(order.balance_cents || 0) === 0
      && ["paid", "settled_adjustment"].includes(order.payment_status))
    .reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0);
  const settledCommissionCents = orders
    .filter((order) => order.sales_commission_settlement_id)
    .reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0);
  return {
    ...summary,
    generatedSalesCents: orders.reduce((total, order) => total + Number(order.total_cents || 0), 0),
    generatedCommissionCents: orders.reduce((total, order) => total + Number(order.sales_commission_cents || 0), 0),
    commissionToSettleCents,
    settledCommissionCents,
    settlementBalanceCents: commissionToSettleCents
  };
}

function filterOrders(orders = []) {
  const query = normalizedText(state.orderSearch);
  return orders.filter((order) => {
    if (!orderMatchesStatus(order)) return false;
    if (!matchesDateRange(order.created_at || order.createdAt, state.orderDateFrom, state.orderDateTo)) return false;
    if (!query) return true;
    return normalizedText([
      order.order_number,
      order.business_name,
      order.payment_status,
      order.fulfillment_status,
      order.status
    ].join(" ")).includes(query);
  });
}

function filterQuotes(quotes = []) {
  const query = normalizedText(state.quoteSearch);
  return quotes.filter((quote) => {
    if (state.quoteStatus && quote.status !== state.quoteStatus) return false;
    if (!matchesDateRange(quote.createdAt || quote.created_at, state.quoteDateFrom, state.quoteDateTo)) return false;
    if (!query) return true;
    return normalizedText([
      quote.quoteNumber,
      quote.businessName,
      quote.status
    ].join(" ")).includes(query);
  });
}

function renderSession() {
  if (!state.salesRep) {
    nodes.session.innerHTML = "";
    return;
  }
  nodes.session.innerHTML = `
    <span>${escapeHtml(state.salesRep.name)}</span>
    <button class="ghost-button compact" type="button" id="sellerLogout">Cerrar sesion</button>
  `;
  document.getElementById("sellerLogout")?.addEventListener("click", logout);
}

function renderStats(summary = {}) {
  const stats = [
    ["Ventas generadas", money(summary.generatedSalesCents ?? summary.monthTotalCents ?? 0)],
    ["Comisiones generadas", money(summary.generatedCommissionCents || 0)],
    ["Comisiones a liquidar", money(summary.commissionToSettleCents ?? summary.pendingCommissionCents ?? 0)],
    ["Comisiones liquidadas", money(summary.settledCommissionCents || 0)],
    ["Saldo pendiente de liquidacion", money(summary.settlementBalanceCents ?? summary.pendingCommissionCents ?? 0)]
  ];
  nodes.stats.innerHTML = stats.map(([label, value]) => `
    <article class="seller-stat commission-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join("");
}

function renderSellerView() {
  nodes.viewButtons?.forEach((button) => {
    button.classList.toggle("active", button.dataset.sellerViewButton === state.activeView);
  });
  nodes.views?.forEach((view) => {
    view.classList.toggle("active", view.dataset.sellerView === state.activeView);
  });
}

function renderCustomers(customers = []) {
  if (!customers.length) {
    nodes.customers.innerHTML = `<div class="empty-state">Todavia no hay clientes asignados a este vendedor.</div>`;
    return;
  }
  nodes.customers.innerHTML = customers.map((customer) => {
    const status = customerStatusLabels[customer.approval_status] || customer.approval_status || "Sin estado";
    const tone = customer.approval_status === "approved" ? "green" : "gold";
    const location = [customer.city, customer.province].filter(Boolean).join(", ");
    const contact = [customer.contact_person, customer.whatsapp || customer.phone].filter(Boolean).join(" | ");
    return `
      <article class="seller-card">
        <div class="seller-card-top">
          <div>
            <strong>${escapeHtml(customer.business_name)}</strong>
            <div class="seller-meta">${escapeHtml(customer.email || "")}</div>
          </div>
          ${badge(status, tone)}
        </div>
        <div class="seller-meta">${escapeHtml(location || "Sin localidad cargada")}</div>
        <div class="seller-meta">${escapeHtml(contact || "Sin contacto cargado")}</div>
        <div class="quote-actions">
          <button class="ghost-button compact" type="button" data-manage-addresses="${customer.id}">
            ${String(state.openCustomerAddressesId) === String(customer.id) ? "Cerrar lugares de entrega" : "Lugares de entrega"}
          </button>
        </div>
        ${String(state.openCustomerAddressesId) === String(customer.id) ? renderSellerAddressManager(customer) : ""}
      </article>
    `;
  }).join("");
}

function sellerProvinceOptions(selected = "") {
  return `<option value="">Seleccionar</option>${SELLER_PROVINCES.map((province) =>
    `<option ${province === selected ? "selected" : ""}>${escapeHtml(province)}</option>`
  ).join("")}`;
}

function renderSellerAddressManager(customer) {
  const addresses = state.customerAddresses[customer.id];
  if (!addresses) return `<div class="seller-address-manager"><div class="empty-state">Cargando lugares de entrega...</div></div>`;
  const editing = addresses.find((address) => Number(address.id) === Number(state.editingCustomerAddressId)) || {};
  return `<div class="seller-address-manager">
    <div class="seller-address-list">
      ${addresses.map((address) => `<article class="seller-address-card">
        <div><strong>${escapeHtml(address.label)}</strong>${address.isDefault ? badge("Principal", "green") : ""}</div>
        <span>${escapeHtml(address.recipient)} · ${escapeHtml(address.address)}, ${escapeHtml(address.city)}, ${escapeHtml(address.province)} (${escapeHtml(address.postalCode)})</span>
        <small>${escapeHtml(address.contactPhone)}${address.preferredTransport ? ` · ${escapeHtml(address.preferredTransport)}` : ""}</small>
        <div class="quote-actions">
          <button class="ghost-button compact" type="button" data-edit-address="${address.id}">Editar</button>
          ${address.isDefault ? "" : `<button class="ghost-button compact" type="button" data-default-address="${address.id}">Hacer principal</button>`}
          ${addresses.length > 1 ? `<button class="ghost-button compact" type="button" data-delete-address="${address.id}">Eliminar</button>` : ""}
        </div>
      </article>`).join("")}
    </div>
    <form class="seller-address-form" data-customer-id="${customer.id}">
      <h3>${editing.id ? "Editar lugar de entrega" : "Agregar lugar de entrega"}</h3>
      <input name="addressId" type="hidden" value="${editing.id || ""}" />
      <div class="seller-form-grid">
        <label class="seller-field"><span>Nombre del lugar</span><input name="label" maxlength="80" value="${escapeHtml(editing.label || "")}" placeholder="Principal, Deposito..." required /></label>
        <label class="seller-field"><span>Quien recibe</span><input name="recipient" maxlength="120" value="${escapeHtml(editing.recipient || "")}" required /></label>
        <label class="seller-field"><span>Direccion</span><input name="address" maxlength="180" value="${escapeHtml(editing.address || "")}" required /></label>
        <label class="seller-field"><span>Localidad</span><input name="city" maxlength="80" value="${escapeHtml(editing.city || "")}" required /></label>
        <label class="seller-field"><span>Provincia</span><select name="province" required>${sellerProvinceOptions(editing.province)}</select></label>
        <label class="seller-field"><span>Codigo postal</span><input name="postalCode" maxlength="12" value="${escapeHtml(editing.postalCode || "")}" required /></label>
        <label class="seller-field"><span>Telefono de recepcion</span><input name="contactPhone" value="${escapeHtml(editing.contactPhone || "")}" required /></label>
        <label class="seller-field"><span>Transporte preferido</span><input name="preferredTransport" maxlength="120" value="${escapeHtml(editing.preferredTransport || "")}" /></label>
        <label class="seller-field seller-shipping-notes"><span>Indicaciones</span><textarea name="notes" maxlength="500">${escapeHtml(editing.notes || "")}</textarea></label>
      </div>
      <div class="seller-actions">
        <button class="primary-button compact" type="submit">${editing.id ? "Guardar cambios" : "Agregar lugar"}</button>
        ${editing.id ? `<button class="ghost-button compact" type="button" data-cancel-address-edit>Cancelar</button>` : ""}
      </div>
      <p class="form-message" role="status"></p>
    </form>
  </div>`;
}

async function loadSellerCustomerAddresses(customerId, shouldRender = true) {
  const payload = await sellerApi(`/api/sales/customers/${encodeURIComponent(customerId)}/shipping-addresses`);
  state.customerAddresses[customerId] = payload.addresses || [];
  if (shouldRender) renderCustomers(state.dashboard?.customers || []);
  return state.customerAddresses[customerId];
}

function renderDetailItems(items = []) {
  if (!items.length) return `<div class="seller-detail-empty">Sin productos cargados.</div>`;
  return `
    <div class="seller-detail-items">
      ${items.map((item) => {
        const hasAvailability = item.lineStatus && item.lineStatus !== "pending_confirmation";
        const quantity = hasAvailability ? item.confirmedQuantity : item.quantity;
        return `
          <div class="seller-detail-row">
            <strong>${escapeHtml(item.kmCode || "")}</strong>
            <span>${escapeHtml(item.productName || "")}</span>
            <b>${Number(quantity ?? 0)} u.</b>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderOrderDetail(orderId) {
  const order = state.orderDetails[orderId];
  if (!order) return `<div class="seller-detail">Cargando detalle...</div>`;
  return `
    <div class="seller-detail">
      <div class="seller-detail-grid">
        <div>
          <span>Cliente</span>
          <strong>${escapeHtml(order.businessName || "")}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${money(order.totalCents || 0)}</strong>
        </div>
        <div>
          <span>Saldo</span>
          <strong>${money(order.balanceCents || 0)}</strong>
        </div>
        <div>
          <span>Entrega</span>
          <strong>${escapeHtml([order.shipping?.city, order.shipping?.province].filter(Boolean).join(", ") || "Sin dato")}</strong>
        </div>
      </div>
      ${renderDetailItems(order.items || [])}
    </div>
  `;
}

function renderQuoteDetail(quoteId) {
  const quote = state.quoteDetails[quoteId];
  if (!quote) return `<div class="seller-detail">Cargando detalle...</div>`;
  const canCreateOrder = quote.status === "generated";
  return `
    <div class="seller-detail">
      <div class="seller-detail-grid">
        <div>
          <span>Cliente</span>
          <strong>${escapeHtml(quote.businessName || "")}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${money(quote.totalCents || 0)}</strong>
        </div>
        <div>
          <span>Validez</span>
          <strong>${quote.validUntil ? shortDate(quote.validUntil) : "Sin fecha"}</strong>
        </div>
        <div>
          <span>Estado</span>
          <strong>${escapeHtml(quoteStatusLabels[quote.status] || quote.status || "Generado")}</strong>
        </div>
      </div>
      ${renderDetailItems(quote.items || [])}
      <div class="quote-actions">
        <button class="primary-button compact" type="button" data-create-order-from-quote="${quote.id}" ${canCreateOrder ? "" : "disabled"}>
          Generar pedido
        </button>
      </div>
    </div>
  `;
}

function renderOrders(orders = []) {
  const filteredOrders = filterOrders(orders);
  const visibleOrders = filteredOrders.slice(0, SELLER_LIST_LIMIT);
  if (!filteredOrders.length) {
    nodes.orders.innerHTML = `<div class="empty-state">Todavia no hay pedidos asociados a tu cartera.</div>`;
    return;
  }
  nodes.orders.innerHTML = visibleOrders.map((order) => {
    const total = money(order.total_cents || 0);
    const balance = money(order.balance_cents || 0);
    const commission = money(order.sales_commission_cents || 0);
    const origin = sellerOrderOrigin(order);
    const commissionStatus = order.sales_commission_settlement_id
      ? badge("Comision liquidada", "green")
      : Number(order.sales_commission_cents || 0) > 0 && Number(order.balance_cents || 0) === 0
        ? badge("Comision a liquidar", "gold")
        : "";
    return `
      <article class="seller-card order-card">
        <div class="seller-card-top">
          <div>
            <strong>${escapeHtml(order.order_number)}</strong>
            <div class="seller-meta">${escapeHtml(order.business_name)} | ${shortDate(order.created_at)}</div>
          </div>
          <div class="order-money">
            <strong>${total}</strong>
            <small>Saldo ${balance}</small>
          </div>
        </div>
        <div class="seller-badges">
          ${badge(origin.label, origin.tone)}
          ${badge(orderStatusLabels[order.status] || order.status || "Pedido", orderTone(order))}
          ${badge(paymentStatusLabels[order.payment_status] || order.payment_status || "Pago", order.payment_status === "paid" ? "green" : "gold")}
          ${badge(fulfillmentStatusLabels[order.fulfillment_status] || order.fulfillment_status || "Logistica", order.fulfillment_status === "shipped" ? "blue" : "")}
          ${commissionStatus}
        </div>
        <div class="seller-meta">Comision estimada: ${commission}</div>
        <div class="quote-actions">
          <button class="ghost-button compact" type="button" data-view-order="${order.id}">
            ${String(state.openOrderId) === String(order.id) ? "Cerrar detalle" : "Ver"}
          </button>
        </div>
        ${String(state.openOrderId) === String(order.id) ? renderOrderDetail(order.id) : ""}
      </article>
    `;
  }).join("") + (filteredOrders.length > visibleOrders.length
    ? `<div class="seller-list-note">Mostrando ${visibleOrders.length} de ${filteredOrders.length}. Ajusta la busqueda o el estado para encontrar un pedido puntual.</div>`
    : "");
}

function sellerOrderOrigin(order = {}) {
  const role = String(order.created_by_role || "").toLowerCase();
  if (role === "sales_rep") return { label: "Generado por vos", tone: "blue" };
  if (role === "customer") return { label: "Generado por cliente", tone: "green" };
  if (role === "admin") return { label: "Generado por KM", tone: "" };
  return { label: "Origen KM", tone: "" };
}

function quoteTone(status) {
  if (status === "converted") return "green";
  if (status === "expired" || status === "cancelled") return "";
  return "blue";
}

function renderQuotes() {
  if (!nodes.quotes) return;
  const filteredQuotes = filterQuotes(state.quotes);
  const visibleQuotes = filteredQuotes.slice(0, SELLER_LIST_LIMIT);
  if (!filteredQuotes.length) {
    nodes.quotes.innerHTML = `<div class="empty-state">Todavia no hay presupuestos generados.</div>`;
    return;
  }
  nodes.quotes.innerHTML = visibleQuotes.map((quote) => {
    const canShareQuote = quote.status === "generated";
    return `
      <article class="seller-card quote-card">
        <div class="seller-card-top">
          <div>
            <strong>${escapeHtml(quote.quoteNumber || "Presupuesto")}</strong>
            <div class="seller-meta">${escapeHtml(quote.businessName || "")} | ${shortDate(quote.createdAt)}</div>
          </div>
          <div class="order-money">
            <strong>${money(quote.totalCents || 0)}</strong>
            <small>Neto ${money(quote.subtotalNetCents || 0)} + IVA</small>
          </div>
        </div>
        <div class="seller-badges">
          ${badge(quoteStatusLabels[quote.status] || quote.status || "Generado", quoteTone(quote.status))}
          ${badge(`${quote.itemCount || 0} productos`)}
          ${quote.emailSentAt ? badge(`Email enviado ${shortDate(quote.emailSentAt)}`, "green") : ""}
          ${quote.whatsappSentAt ? badge(`WhatsApp abierto ${shortDate(quote.whatsappSentAt)}`, "blue") : ""}
        </div>
        ${quote.validUntil ? `<div class="seller-meta">Valido hasta ${shortDate(quote.validUntil)}</div>` : ""}
        <div class="quote-actions">
          <button class="ghost-button compact" type="button" data-view-quote="${quote.id}">
            ${String(state.openQuoteId) === String(quote.id) ? "Cerrar detalle" : "Ver"}
          </button>
          ${canShareQuote ? `
            <button class="ghost-button compact" type="button" data-share-quote-whatsapp="${quote.id}" ${onlyDigits(quote.customerWhatsapp).length ? "" : "disabled"}>
              WhatsApp cliente
            </button>
            <button class="ghost-button compact" type="button" data-share-quote-email="${quote.id}" ${quote.customerEmail ? "" : "disabled"}>
              Email cliente
            </button>
          ` : ""}
        </div>
        ${String(state.openQuoteId) === String(quote.id) ? renderQuoteDetail(quote.id) : ""}
      </article>
    `;
  }).join("") + (filteredQuotes.length > visibleQuotes.length
    ? `<div class="seller-list-note">Mostrando ${visibleQuotes.length} de ${filteredQuotes.length}. Ajusta la busqueda o el estado para encontrar un presupuesto puntual.</div>`
    : "");
}

async function loadQuotes() {
  if (!nodes.quotes) return;
  try {
    const payload = await sellerApi("/api/sales/quotes");
    state.quotes = payload.quotes || [];
    renderQuotes();
  } catch (error) {
    nodes.quotes.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "No se pudieron cargar presupuestos.")}</div>`;
  }
}

function approvedCustomers() {
  return (state.dashboard?.customers || []).filter((customer) => customer.approval_status === "approved");
}

function findProduct(productId) {
  return state.order.products.find((product) => Number(product.id) === Number(productId));
}

function productSearchText(product) {
  return [
    product.kmCode,
    product.ean13,
    product.name,
    product.family?.name,
    product.subfamily,
    product.material,
    product.measure
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderOrderBuilder() {
  renderBuilderMode();
  const customers = approvedCustomers();
  if (!customers.length) {
    nodes.orderCustomer.innerHTML = `<option value="">Sin clientes aprobados</option>`;
    if (nodes.orderShipping) nodes.orderShipping.innerHTML = `<option value="">Sin lugares de entrega</option>`;
    nodes.productResults.innerHTML = `<div class="empty-state">No hay clientes aprobados para cargar pedidos.</div>`;
    nodes.orderItems.innerHTML = `<div class="empty-state">Selecciona un cliente aprobado.</div>`;
    nodes.orderTotal.textContent = "";
    return;
  }

  if (!state.order.customerId || !customers.some((customer) => String(customer.id) === String(state.order.customerId))) {
    state.order.customerId = String(customers[0].id);
  }

  nodes.orderCustomer.innerHTML = customers.map((customer) => `
    <option value="${customer.id}" ${String(customer.id) === String(state.order.customerId) ? "selected" : ""}>
      ${escapeHtml(customer.business_name)}
    </option>
  `).join("");
  renderOrderShipping();
  renderProductResults();
  renderOrderItems();
}

function renderBuilderMode() {
  const isQuote = state.mode === "quote";
  nodes.orderShippingField?.classList.toggle("hidden", isQuote);
  if (nodes.orderShipping) nodes.orderShipping.required = !isQuote;
  nodes.modeButtons?.forEach((button) => {
    button.classList.toggle("active", button.dataset.sellerMode === state.mode);
  });
  if (nodes.builderTitle) {
    nodes.builderTitle.textContent = isQuote
      ? "Generar presupuesto para cliente asignado"
      : "Cargar pedido para cliente asignado";
  }
  if (nodes.itemsLabel) {
    nodes.itemsLabel.textContent = isQuote ? "Presupuesto en armado" : "Pedido en armado";
  }
  if (nodes.orderSubmit) {
    nodes.orderSubmit.textContent = isQuote ? "Generar presupuesto" : "Enviar pedido a KM";
  }
}

function renderOrderShipping() {
  if (!nodes.orderShipping) return;
  if (state.order.loadingAddresses) {
    nodes.orderShipping.innerHTML = `<option value="">Cargando lugares...</option>`;
    nodes.orderShipping.disabled = true;
    return;
  }
  nodes.orderShipping.disabled = false;
  if (!state.order.addresses.length) {
    nodes.orderShipping.innerHTML = `<option value="">Sin lugares de entrega cargados</option>`;
    state.order.shippingAddressId = "";
    return;
  }
  if (!state.order.addresses.some((address) => String(address.id) === String(state.order.shippingAddressId))) {
    state.order.shippingAddressId = String(state.order.addresses.find((address) => address.isDefault)?.id || state.order.addresses[0].id);
  }
  nodes.orderShipping.innerHTML = state.order.addresses.map((address) => `
    <option value="${address.id}" ${String(address.id) === String(state.order.shippingAddressId) ? "selected" : ""}>
      ${escapeHtml(address.label)} — ${escapeHtml(address.address)}, ${escapeHtml(address.city)}${address.isDefault ? " (principal)" : ""}
    </option>
  `).join("");
}

async function loadSellerAddresses(customerId) {
  if (!customerId) return;
  state.order.loadingAddresses = true;
  state.order.addresses = [];
  state.order.shippingAddressId = "";
  renderOrderShipping();
  try {
    state.order.addresses = await loadSellerCustomerAddresses(customerId, false);
  } catch (error) {
    nodes.orderMessage.textContent = error.message || "No se pudieron cargar los lugares de entrega.";
  } finally {
    state.order.loadingAddresses = false;
  }
  renderOrderShipping();
}

async function loadSellerProducts(customerId) {
  if (!customerId) return;
  state.order.loadingProducts = true;
  state.order.products = [];
  renderProductResults();
  try {
    const payload = await sellerApi(`/api/sales/products?customerId=${encodeURIComponent(customerId)}`);
    state.order.products = payload.products || [];
  } catch (error) {
    nodes.productResults.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "No se pudieron cargar productos.")}</div>`;
    return;
  } finally {
    state.order.loadingProducts = false;
  }
  renderProductResults();
}

function renderProductResults() {
  if (state.order.loadingProducts) {
    nodes.productResults.innerHTML = `<div class="empty-state">Cargando productos...</div>`;
    return;
  }
  if (!state.order.products.length) {
    nodes.productResults.innerHTML = `<div class="empty-state">Selecciona un cliente para ver productos.</div>`;
    return;
  }
  const query = (nodes.productSearch.value || "").trim().toLowerCase();
  if (!query) {
    nodes.productResults.innerHTML = `<div class="empty-state">Busca por codigo, producto o EAN para agregar articulos.</div>`;
    return;
  }
  const products = state.order.products
    .filter((product) => productSearchText(product).includes(query))
    .slice(0, 12);
  if (!products.length) {
    nodes.productResults.innerHTML = `<div class="empty-state">No encontramos productos para esa busqueda.</div>`;
    return;
  }
  nodes.productResults.innerHTML = products.map((product) => `
    <article class="seller-product-row">
      <div>
        <strong>${escapeHtml(product.kmCode)} - ${escapeHtml(product.name)}</strong>
        <div class="seller-meta">${escapeHtml(product.family?.name || "")} ${product.ean13 ? `| EAN ${escapeHtml(product.ean13)}` : ""}</div>
        <div class="seller-meta">${money(product.finalPriceCents || 0)} + IVA</div>
      </div>
      <button class="ghost-button compact" type="button" data-add-product="${product.id}">Agregar</button>
    </article>
  `).join("");
}

function addOrderItem(productId) {
  const product = findProduct(productId);
  if (!product) return;
  const existing = state.order.items.find((item) => Number(item.productId) === Number(productId));
  if (existing) existing.quantity += 1;
  else state.order.items.push({ productId: Number(productId), quantity: 1 });
  nodes.orderMessage.textContent = "";
  nodes.productSearch.value = "";
  renderProductResults();
  renderOrderItems();
  focusOrderQuantity(productId);
}

function updateOrderItem(productId, delta) {
  const item = state.order.items.find((entry) => Number(entry.productId) === Number(productId));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.order.items = state.order.items.filter((entry) => Number(entry.productId) !== Number(productId));
  }
  renderOrderItems();
}

function updateOrderQuantity(productId, value) {
  const item = state.order.items.find((entry) => Number(entry.productId) === Number(productId));
  if (!item) return;
  const quantity = Math.max(1, Number.parseInt(value, 10) || 1);
  item.quantity = quantity;
  renderOrderItems();
  focusOrderQuantity(productId);
}

function focusOrderQuantity(productId) {
  window.requestAnimationFrame(() => {
    const input = nodes.orderItems.querySelector(`[data-qty-product="${Number(productId)}"]`);
    if (!input) return;
    input.closest(".seller-order-row")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    input.focus();
    input.select();
  });
}

function renderOrderItems() {
  if (!state.order.items.length) {
    nodes.orderItems.innerHTML = `<div class="empty-state">Todavia no agregaste productos.</div>`;
    nodes.orderTotal.textContent = "";
    return;
  }
  let total = 0;
  nodes.orderItems.innerHTML = state.order.items.map((item) => {
    const product = findProduct(item.productId);
    if (!product) return "";
    const lineTotal = Number(product.finalPriceCents || 0) * Number(item.quantity || 0);
    total += lineTotal;
    return `
      <article class="seller-order-row">
        <div>
          <strong>${escapeHtml(product.kmCode)} - ${escapeHtml(product.name)}</strong>
          <div class="seller-meta">${item.quantity} x ${money(product.finalPriceCents || 0)} = ${money(lineTotal)}</div>
        </div>
        <div class="seller-qty">
          <button type="button" data-dec-product="${product.id}">-</button>
          <input class="seller-qty-input" type="number" min="1" step="1" value="${item.quantity}" data-qty-product="${product.id}" aria-label="Cantidad ${escapeHtml(product.kmCode)}" />
          <button type="button" data-inc-product="${product.id}">+</button>
        </div>
      </article>
    `;
  }).join("");
  nodes.orderTotal.textContent = state.mode === "quote"
    ? `Subtotal neto presupuestado: ${money(total)} + IVA`
    : `Subtotal neto estimado: ${money(total)} + IVA`;
}

function renderDashboard(payload) {
  state.salesRep = payload.salesRep;
  state.dashboard = payload.dashboard;
  if (!state.summaryDateFrom && state.dashboard?.period?.from) state.summaryDateFrom = dateKey(state.dashboard.period.from);
  if (!state.summaryDateTo && state.dashboard?.period?.to) state.summaryDateTo = dateKey(state.dashboard.period.to);
  if (nodes.summaryDateFrom) nodes.summaryDateFrom.value = state.summaryDateFrom;
  if (nodes.summaryDateTo) nodes.summaryDateTo.value = state.summaryDateTo;
  nodes.title.textContent = "Gestion de ventas";
  nodes.subtitle.textContent = `${state.salesRep?.name || "Vendedor"} | ${state.dashboard?.customers?.length || 0} clientes asignados. Periodo ${shortDate(state.summaryDateFrom)} al ${shortDate(state.summaryDateTo)}.`;
  renderSession();
  renderStats(summaryForPeriod(state.dashboard || {}));
  renderCustomers(state.dashboard?.customers || []);
  renderOrders(state.dashboard?.orders || []);
  renderQuotes();
  renderOrderBuilder();
  renderSellerView();
  nodes.login.classList.add("hidden");
  nodes.dashboard.classList.remove("hidden");
  if (state.order.customerId && !state.order.products.length && !state.order.loadingProducts) {
    loadSellerProducts(state.order.customerId);
  }
  if (state.order.customerId && !state.order.addresses.length && !state.order.loadingAddresses) {
    loadSellerAddresses(state.order.customerId);
  }
  loadQuotes();
}

function showLogin(message = "") {
  state.salesRep = null;
  state.dashboard = null;
  renderSession();
  showLoginMode("login", message, message ? "success" : "");
  nodes.dashboard.classList.add("hidden");
  nodes.login.classList.remove("hidden");
}

async function loadDashboard() {
  try {
    const payload = await sellerApi("/api/sales/dashboard");
    renderDashboard(payload);
  } catch (error) {
    showLogin("");
  }
}

async function logout() {
  try {
    await sellerApi("/api/sales/logout", { method: "POST", body: {} });
  } finally {
    showLogin("");
  }
}

nodes.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage(nodes.loginMessage, "");
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const payload = await sellerApi("/api/sales/login", {
      method: "POST",
      body: {
        email: form.get("email"),
        password: form.get("password")
      }
    });
    renderDashboard({ salesRep: payload.salesRep, dashboard: (await sellerApi("/api/sales/dashboard")).dashboard });
  } catch (error) {
    window.KMForms?.showApiError(event.currentTarget, error, nodes.loginMessage);
  } finally {
    button.disabled = false;
  }
});

nodes.forgotOpen?.addEventListener("click", () => {
  showLoginMode("forgot");
});

nodes.forgotBack?.addEventListener("click", () => {
  showLoginMode("login");
});

nodes.resetBack?.addEventListener("click", () => {
  state.passwordResetToken = "";
  window.history.replaceState({}, "", "/vendedor.html");
  showLoginMode("login");
});

nodes.forgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage(nodes.forgotMessage, "");
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const payload = await sellerApi("/api/sales/forgot-password", {
      method: "POST",
      body: { email: form.get("email") }
    });
    setFormMessage(nodes.forgotMessage, payload.message || "Si existe una cuenta activa, enviamos un enlace al email.", "success");
    event.currentTarget.reset();
  } catch (error) {
    window.KMForms?.showApiError(event.currentTarget, error, nodes.forgotMessage);
  } finally {
    button.disabled = false;
  }
});

nodes.resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage(nodes.resetMessage, "");
  const password = validatePasswordPair(event.currentTarget, nodes.resetMessage);
  if (!password) return;
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await sellerApi("/api/sales/reset-password", {
      method: "POST",
      body: { token: state.passwordResetToken, password }
    });
    state.passwordResetToken = "";
    window.history.replaceState({}, "", "/vendedor.html");
    event.currentTarget.reset();
    showLogin("Clave actualizada. Ingresa nuevamente con la nueva clave.");
  } catch (error) {
    window.KMForms?.showApiError(event.currentTarget, error, nodes.resetMessage);
  } finally {
    button.disabled = false;
  }
});

nodes.changePasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage(nodes.changePasswordMessage, "");
  const form = new FormData(event.currentTarget);
  const password = validatePasswordPair(event.currentTarget, nodes.changePasswordMessage);
  if (!password) return;
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await sellerApi("/api/sales/change-password", {
      method: "POST",
      body: {
        currentPassword: form.get("currentPassword"),
        password
      }
    });
    event.currentTarget.reset();
    setFormMessage(nodes.changePasswordMessage, "Clave actualizada correctamente.", "success");
  } catch (error) {
    window.KMForms?.showApiError(event.currentTarget, error, nodes.changePasswordMessage);
  } finally {
    button.disabled = false;
  }
});

function syncCommercialShippingFields() {
  const same = Boolean(nodes.shippingSameAsCommercial?.checked);
  if (nodes.shippingFields) nodes.shippingFields.hidden = same;
  nodes.shippingFields?.querySelectorAll("input, select, textarea").forEach((field) => {
    field.disabled = same;
    if (["shippingLabel", "shippingRecipient", "shippingAddress", "shippingCity", "shippingProvince", "shippingPostalCode", "shippingContactPhone"].includes(field.name)) {
      field.required = !same;
    }
  });
}

nodes.shippingSameAsCommercial?.addEventListener("change", syncCommercialShippingFields);
syncCommercialShippingFields();

nodes.customerRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  nodes.customerRequestMessage.textContent = "";
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const sameShipping = nodes.shippingSameAsCommercial?.checked;
    body.shipping = sameShipping ? {
      label: "Principal",
      recipient: body.contactPerson || body.businessName,
      address: body.address,
      city: body.city,
      province: body.province,
      postalCode: body.postalCode,
      contactPhone: body.whatsapp || body.phone,
      preferredTransport: "",
      notes: "",
      isDefault: true
    } : {
      label: body.shippingLabel,
      recipient: body.shippingRecipient,
      address: body.shippingAddress,
      city: body.shippingCity,
      province: body.shippingProvince,
      postalCode: body.shippingPostalCode,
      contactPhone: body.shippingContactPhone,
      preferredTransport: body.shippingPreferredTransport,
      notes: body.shippingNotes,
      isDefault: true
    };
    const payload = await sellerApi("/api/sales/customer-requests", { method: "POST", body });
    nodes.customerRequestMessage.textContent = payload.message || "Solicitud enviada a KM.";
    event.currentTarget.reset();
    syncCommercialShippingFields();
    await loadDashboard();
  } catch (error) {
    nodes.customerRequestMessage.textContent = error.message || "No se pudo enviar la solicitud.";
  } finally {
    button.disabled = false;
  }
});

nodes.refresh?.addEventListener("click", loadDashboard);

nodes.customerRequestPanel?.addEventListener("toggle", () => {
  if (!nodes.customerRequestToggleText) return;
  nodes.customerRequestToggleText.textContent = nodes.customerRequestPanel.open
    ? "Cerrar formulario"
    : "Abrir formulario";
});

function refreshSummaryPeriod() {
  nodes.subtitle.textContent = `${state.salesRep?.name || "Vendedor"} | ${state.dashboard?.customers?.length || 0} clientes asignados. Periodo ${shortDate(state.summaryDateFrom)} al ${shortDate(state.summaryDateTo)}.`;
  renderStats(summaryForPeriod(state.dashboard || {}));
}

nodes.summaryDateFrom?.addEventListener("change", (event) => {
  state.summaryDateFrom = event.currentTarget.value;
  refreshSummaryPeriod();
});

nodes.summaryDateTo?.addEventListener("change", (event) => {
  state.summaryDateTo = event.currentTarget.value;
  refreshSummaryPeriod();
});

nodes.quoteSearch?.addEventListener("input", (event) => {
  state.quoteSearch = event.currentTarget.value;
  state.openQuoteId = null;
  renderQuotes();
});

nodes.quoteStatus?.addEventListener("change", (event) => {
  state.quoteStatus = event.currentTarget.value;
  state.openQuoteId = null;
  renderQuotes();
});

nodes.quoteDateFrom?.addEventListener("change", (event) => {
  state.quoteDateFrom = event.currentTarget.value;
  state.openQuoteId = null;
  renderQuotes();
});

nodes.quoteDateTo?.addEventListener("change", (event) => {
  state.quoteDateTo = event.currentTarget.value;
  state.openQuoteId = null;
  renderQuotes();
});

nodes.orderSearch?.addEventListener("input", (event) => {
  state.orderSearch = event.currentTarget.value;
  state.openOrderId = null;
  renderOrders(state.dashboard?.orders || []);
});

nodes.orderStatus?.addEventListener("change", (event) => {
  state.orderStatus = event.currentTarget.value;
  state.openOrderId = null;
  renderOrders(state.dashboard?.orders || []);
});

nodes.orderDateFrom?.addEventListener("change", (event) => {
  state.orderDateFrom = event.currentTarget.value;
  state.openOrderId = null;
  renderOrders(state.dashboard?.orders || []);
});

nodes.orderDateTo?.addEventListener("change", (event) => {
  state.orderDateTo = event.currentTarget.value;
  state.openOrderId = null;
  renderOrders(state.dashboard?.orders || []);
});

nodes.viewButtons?.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.sellerViewButton || "summary";
    nodes.orderMessage.textContent = "";
    renderSellerView();
  });
});

nodes.modeButtons?.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.sellerMode === "quote" ? "quote" : "order";
    nodes.orderMessage.textContent = "";
    renderBuilderMode();
    renderOrderItems();
  });
});

nodes.orderCustomer?.addEventListener("change", async (event) => {
  state.order.customerId = event.currentTarget.value;
  state.order.items = [];
  nodes.orderMessage.textContent = "";
  await Promise.all([loadSellerProducts(state.order.customerId), loadSellerAddresses(state.order.customerId)]);
  renderOrderItems();
});

nodes.orderShipping?.addEventListener("change", (event) => {
  state.order.shippingAddressId = event.currentTarget.value;
});

nodes.customers?.addEventListener("click", async (event) => {
  const manage = event.target.closest("[data-manage-addresses]");
  const edit = event.target.closest("[data-edit-address]");
  const setDefault = event.target.closest("[data-default-address]");
  const remove = event.target.closest("[data-delete-address]");
  const cancel = event.target.closest("[data-cancel-address-edit]");
  const customerCard = event.target.closest(".seller-card");
  if (manage) {
    const customerId = manage.dataset.manageAddresses;
    state.openCustomerAddressesId = String(state.openCustomerAddressesId) === String(customerId) ? null : customerId;
    state.editingCustomerAddressId = null;
    renderCustomers(state.dashboard?.customers || []);
    if (state.openCustomerAddressesId && !state.customerAddresses[customerId]) {
      try { await loadSellerCustomerAddresses(customerId); } catch (error) { nodes.orderMessage.textContent = error.message; }
    }
    return;
  }
  const customerId = state.openCustomerAddressesId || customerCard?.querySelector("[data-manage-addresses]")?.dataset.manageAddresses;
  if (!customerId) return;
  if (edit || cancel) {
    state.editingCustomerAddressId = edit?.dataset.editAddress || null;
    renderCustomers(state.dashboard?.customers || []);
    return;
  }
  try {
    if (setDefault) {
      await sellerApi(`/api/sales/customers/${customerId}/shipping-addresses/${setDefault.dataset.defaultAddress}/default`, { method: "PATCH", body: {} });
      await loadSellerCustomerAddresses(customerId);
      if (String(state.order.customerId) === String(customerId)) await loadSellerAddresses(customerId);
      return;
    }
    if (remove) {
      if (!window.confirm("Eliminar este lugar de entrega?")) return;
      await sellerApi(`/api/sales/customers/${customerId}/shipping-addresses/${remove.dataset.deleteAddress}`, { method: "DELETE" });
      state.editingCustomerAddressId = null;
      await loadSellerCustomerAddresses(customerId);
      if (String(state.order.customerId) === String(customerId)) await loadSellerAddresses(customerId);
    }
  } catch (error) {
    nodes.orderMessage.textContent = error.message || "No se pudo actualizar el lugar de entrega.";
  }
});

nodes.customers?.addEventListener("submit", async (event) => {
  const form = event.target.closest(".seller-address-form");
  if (!form) return;
  event.preventDefault();
  const customerId = form.dataset.customerId;
  const values = Object.fromEntries(new FormData(form).entries());
  const addressId = values.addressId;
  delete values.addressId;
  const message = form.querySelector(".form-message");
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await sellerApi(`/api/sales/customers/${customerId}/shipping-addresses${addressId ? `/${addressId}` : ""}`, {
      method: addressId ? "PUT" : "POST",
      body: values
    });
    state.editingCustomerAddressId = null;
    await loadSellerCustomerAddresses(customerId);
    if (String(state.order.customerId) === String(customerId)) await loadSellerAddresses(customerId);
  } catch (error) {
    setFormMessage(message, error.message || "No se pudo guardar el lugar de entrega.", "error");
    button.disabled = false;
  }
});

nodes.productSearch?.addEventListener("input", renderProductResults);

nodes.productResults?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-product]");
  if (!button) return;
  addOrderItem(button.dataset.addProduct);
});

nodes.orders?.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view-order]");
  if (!viewButton) return;
  const orderId = viewButton.dataset.viewOrder;
  nodes.orderMessage.textContent = "";
  if (String(state.openOrderId) === String(orderId)) {
    state.openOrderId = null;
    renderOrders(state.dashboard?.orders || []);
    return;
  }
  state.openOrderId = orderId;
  renderOrders(state.dashboard?.orders || []);
  try {
    await getOrderDetail(orderId);
  } catch (error) {
    nodes.orderMessage.textContent = error.message || "No se pudo cargar el detalle del pedido.";
  }
  renderOrders(state.dashboard?.orders || []);
});

nodes.orderItems?.addEventListener("click", (event) => {
  const dec = event.target.closest("[data-dec-product]");
  const inc = event.target.closest("[data-inc-product]");
  if (dec) updateOrderItem(dec.dataset.decProduct, -1);
  if (inc) updateOrderItem(inc.dataset.incProduct, 1);
});

nodes.orderItems?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-qty-product]");
  if (!input) return;
  updateOrderQuantity(input.dataset.qtyProduct, input.value);
});

nodes.orderItems?.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-qty-product]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  input.blur();
});

nodes.quotes?.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view-quote]");
  const createOrderButton = event.target.closest("[data-create-order-from-quote]");
  const whatsappButton = event.target.closest("[data-share-quote-whatsapp]");
  const emailButton = event.target.closest("[data-share-quote-email]");
  if (!viewButton && !createOrderButton && !whatsappButton && !emailButton) return;
  if (viewButton) {
    const quoteId = viewButton.dataset.viewQuote;
    nodes.orderMessage.textContent = "";
    if (String(state.openQuoteId) === String(quoteId)) {
      state.openQuoteId = null;
      renderQuotes();
      return;
    }
    state.openQuoteId = quoteId;
    renderQuotes();
    try {
      await getQuoteDetail(quoteId);
    } catch (error) {
      nodes.orderMessage.textContent = error.message || "No se pudo cargar el detalle del presupuesto.";
    }
    renderQuotes();
    return;
  }
  if (createOrderButton) {
    const quoteId = createOrderButton.dataset.createOrderFromQuote;
    createOrderButton.disabled = true;
    nodes.orderMessage.textContent = "";
    try {
      const payload = await sellerApi(`/api/sales/quotes/${encodeURIComponent(quoteId)}/order`, {
        method: "POST",
        body: {}
      });
      updateQuoteState(payload.quote);
      if (payload.order?.id) state.orderDetails[payload.order.id] = payload.order;
      nodes.orderMessage.textContent = `Pedido ${payload.order?.orderNumber || ""} generado desde presupuesto.`;
      await loadDashboard();
      await loadQuotes();
    } catch (error) {
      nodes.orderMessage.textContent = error.message || "No se pudo generar el pedido desde el presupuesto.";
      renderQuotes();
    } finally {
      createOrderButton.disabled = false;
    }
    return;
  }
  const button = whatsappButton || emailButton;
  const quoteId = whatsappButton?.dataset.shareQuoteWhatsapp || emailButton?.dataset.shareQuoteEmail;
  button.disabled = true;
  try {
    const quote = await getQuoteDetail(quoteId);
    if (quote.status !== "generated") {
      throw new Error("El presupuesto ya fue convertido o no esta vigente.");
    }
    if (whatsappButton) {
      const text = quoteShareText(quote);
      const phone = onlyDigits(quote.customerWhatsapp);
      if (!phone) throw new Error("El cliente no tiene WhatsApp cargado.");
      nodes.orderMessage.textContent = "Abriendo WhatsApp del cliente...";
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      const payload = await sellerApi(`/api/sales/quotes/${encodeURIComponent(quoteId)}/whatsapp`, {
        method: "POST",
        body: {}
      });
      updateQuoteState(payload.quote);
      nodes.orderMessage.textContent = payload.message || "WhatsApp abierto y registrado.";
      renderQuotes();
    } else {
      if (!quote.customerEmail) throw new Error("El cliente no tiene email cargado.");
      nodes.orderMessage.textContent = "Enviando presupuesto por email...";
      const payload = await sellerApi(`/api/sales/quotes/${encodeURIComponent(quoteId)}/email`, {
        method: "POST",
        body: {}
      });
      updateQuoteState(payload.quote);
      nodes.orderMessage.textContent = payload.message || "Presupuesto enviado por email.";
      renderQuotes();
    }
  } catch (error) {
    nodes.orderMessage.textContent = error.message || "No se pudo compartir el presupuesto.";
  } finally {
    button.disabled = false;
  }
});

nodes.clearOrder?.addEventListener("click", () => {
  state.order.items = [];
  nodes.orderMessage.textContent = "";
  renderOrderItems();
});

nodes.orderForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  nodes.orderMessage.textContent = "";
  if (!state.order.items.length) {
    nodes.orderMessage.textContent = "Agrega productos antes de enviar el pedido.";
    return;
  }
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const isQuote = state.mode === "quote";
    const payload = await sellerApi(isQuote ? "/api/sales/quotes" : "/api/sales/orders", {
      method: "POST",
      body: {
        customerId: Number(state.order.customerId),
        shippingAddressId: isQuote ? undefined : Number(state.order.shippingAddressId),
        items: state.order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      }
    });
    state.order.items = [];
    nodes.orderMessage.textContent = isQuote
      ? `Presupuesto ${payload.quote?.quoteNumber || ""} generado.`
      : `Pedido ${payload.order?.orderNumber || ""} enviado a KM.`;
    await loadDashboard();
  } catch (error) {
    nodes.orderMessage.textContent = error.message || "No se pudo completar la operacion.";
  } finally {
    button.disabled = false;
  }
});

setupPasswordToggles();
if (state.passwordResetToken) {
  nodes.dashboard?.classList.add("hidden");
  nodes.login?.classList.remove("hidden");
  showLoginMode("reset");
} else {
  showLoginMode("login");
  loadDashboard();
}
