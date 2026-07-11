const state = {
  salesRep: null,
  dashboard: null,
  quotes: [],
  quoteDetails: {},
  orderDetails: {},
  openQuoteId: null,
  openOrderId: null,
  mode: "order",
  order: {
    customerId: "",
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
  session: document.getElementById("sellerSession"),
  title: document.getElementById("sellerTitle"),
  subtitle: document.getElementById("sellerSubtitle"),
  stats: document.getElementById("sellerStats"),
  customers: document.getElementById("sellerCustomers"),
  orders: document.getElementById("sellerOrders"),
  refresh: document.getElementById("refreshSellerDashboard"),
  orderForm: document.getElementById("sellerOrderForm"),
  orderCustomer: document.getElementById("sellerOrderCustomer"),
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
  customerRequestForm: document.getElementById("sellerCustomerRequestForm"),
  customerRequestMessage: document.getElementById("sellerCustomerRequestMessage")
};

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
    throw new Error(payload.error || "No se pudo completar la operacion");
  }
  return payload;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function quoteShareText(quote) {
  const customerName = quote.customerContact || quote.businessName || "cliente";
  const lines = [
    `Hola ${customerName}, te envio el presupuesto ${quote.quoteNumber || ""} de KM Detail Line.`,
    "",
    `Cliente: ${quote.businessName || ""}`,
    `Total: ${money(quote.totalCents || 0)}`,
    quote.validUntil ? `Valido hasta: ${shortDate(quote.validUntil)}` : "",
    "",
    "Detalle:"
  ].filter(Boolean);
  (quote.items || []).slice(0, 25).forEach((item) => {
    lines.push(`- ${item.quantity} x ${item.kmCode} - ${item.productName}`);
  });
  if ((quote.items || []).length > 25) lines.push("- Ver detalle completo en el presupuesto.");
  if (quote.notes) {
    lines.push("", `Nota: ${quote.notes}`);
  }
  lines.push("", "Para confirmar o consultar, respondeme este mensaje.");
  return lines.join("\n");
}

async function getQuoteDetail(quoteId) {
  if (state.quoteDetails[quoteId]) return state.quoteDetails[quoteId];
  const payload = await sellerApi(`/api/sales/quotes/${encodeURIComponent(quoteId)}`);
  state.quoteDetails[quoteId] = payload.quote;
  return payload.quote;
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
    ["Clientes", summary.customerCount || 0],
    ["Aprobados", summary.approvedCustomerCount || 0],
    ["Pedidos abiertos", summary.openOrders || 0],
    ["Pedidos del mes", summary.monthOrders || 0],
    ["Venta mes", money(summary.monthTotalCents || 0)],
    ["Comision pendiente", money(summary.pendingCommissionCents || 0)]
  ];
  nodes.stats.innerHTML = stats.map(([label, value]) => `
    <article class="seller-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join("");
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
      </article>
    `;
  }).join("");
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
  if (!orders.length) {
    nodes.orders.innerHTML = `<div class="empty-state">Todavia no hay pedidos asociados a tu cartera.</div>`;
    return;
  }
  nodes.orders.innerHTML = orders.map((order) => {
    const total = money(order.total_cents || 0);
    const balance = money(order.balance_cents || 0);
    const commission = money(order.sales_commission_cents || 0);
    const commissionStatus = order.sales_commission_settlement_id
      ? badge("Comision liquidada", "green")
      : Number(order.sales_commission_cents || 0) > 0 && Number(order.balance_cents || 0) === 0
        ? badge("Comision pendiente", "gold")
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
  }).join("");
}

function quoteTone(status) {
  if (status === "converted") return "green";
  if (status === "expired" || status === "cancelled") return "";
  return "blue";
}

function renderQuotes() {
  if (!nodes.quotes) return;
  if (!state.quotes.length) {
    nodes.quotes.innerHTML = `<div class="empty-state">Todavia no hay presupuestos generados.</div>`;
    return;
  }
  nodes.quotes.innerHTML = state.quotes.map((quote) => `
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
      </div>
      ${quote.validUntil ? `<div class="seller-meta">Valido hasta ${shortDate(quote.validUntil)}</div>` : ""}
      <div class="quote-actions">
        <button class="ghost-button compact" type="button" data-view-quote="${quote.id}">
          ${String(state.openQuoteId) === String(quote.id) ? "Cerrar detalle" : "Ver"}
        </button>
        <button class="ghost-button compact" type="button" data-share-quote-whatsapp="${quote.id}" ${onlyDigits(quote.customerWhatsapp).length ? "" : "disabled"}>
          WhatsApp cliente
        </button>
        <button class="ghost-button compact" type="button" data-share-quote-email="${quote.id}" ${quote.customerEmail ? "" : "disabled"}>
          Email cliente
        </button>
      </div>
      ${String(state.openQuoteId) === String(quote.id) ? renderQuoteDetail(quote.id) : ""}
    </article>
  `).join("");
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
  renderProductResults();
  renderOrderItems();
}

function renderBuilderMode() {
  const isQuote = state.mode === "quote";
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
  const products = state.order.products
    .filter((product) => !query || productSearchText(product).includes(query))
    .slice(0, query ? 12 : 8);
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
  renderOrderItems();
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
          <span>${item.quantity}</span>
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
  nodes.title.textContent = "Gestion de ventas";
  nodes.subtitle.textContent = `${state.salesRep?.name || "Vendedor"} | ${state.dashboard?.customers?.length || 0} clientes asignados. Periodo ${shortDate(state.dashboard?.period?.from)} al ${shortDate(state.dashboard?.period?.to)}.`;
  renderSession();
  renderStats(state.dashboard?.summary || {});
  renderCustomers(state.dashboard?.customers || []);
  renderOrders(state.dashboard?.orders || []);
  renderQuotes();
  renderOrderBuilder();
  nodes.login.classList.add("hidden");
  nodes.dashboard.classList.remove("hidden");
  if (state.order.customerId && !state.order.products.length && !state.order.loadingProducts) {
    loadSellerProducts(state.order.customerId);
  }
  loadQuotes();
}

function showLogin(message = "") {
  state.salesRep = null;
  state.dashboard = null;
  renderSession();
  nodes.loginMessage.textContent = message;
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
  nodes.loginMessage.textContent = "";
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
    nodes.loginMessage.textContent = error.message || "No se pudo ingresar";
  } finally {
    button.disabled = false;
  }
});

nodes.customerRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  nodes.customerRequestMessage.textContent = "";
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const payload = await sellerApi("/api/sales/customer-requests", { method: "POST", body });
    nodes.customerRequestMessage.textContent = payload.message || "Solicitud enviada a KM.";
    event.currentTarget.reset();
    await loadDashboard();
  } catch (error) {
    nodes.customerRequestMessage.textContent = error.message || "No se pudo enviar la solicitud.";
  } finally {
    button.disabled = false;
  }
});

nodes.refresh?.addEventListener("click", loadDashboard);

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
  await loadSellerProducts(state.order.customerId);
  renderOrderItems();
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
      state.quoteDetails[quoteId] = payload.quote;
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
    const text = quoteShareText(quote);
    if (whatsappButton) {
      const phone = onlyDigits(quote.customerWhatsapp);
      if (!phone) throw new Error("El cliente no tiene WhatsApp cargado.");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } else {
      if (!quote.customerEmail) throw new Error("El cliente no tiene email cargado.");
      const subject = `Presupuesto ${quote.quoteNumber || ""} | KM Detail Line`;
      window.location.href = `mailto:${encodeURIComponent(quote.customerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
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

loadDashboard();
