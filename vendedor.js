const state = {
  salesRep: null,
  dashboard: null
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
  refresh: document.getElementById("refreshSellerDashboard")
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

const customerStatusLabels = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  inactive: "Inactivo"
};

const orderStatusLabels = {
  order_created: "Pedido recibido",
  availability_confirmed: "Disponibilidad confirmada",
  ready_to_ship: "Preparado para despacho",
  customer_received: "Recibido por cliente",
  cancelled: "Cancelado"
};

const paymentStatusLabels = {
  pending_payment: "Pago pendiente",
  pending_review: "Pago en revision",
  paid: "Pago acreditado",
  rejected: "Pago rechazado",
  current_account: "Cuenta corriente",
  settled_adjustment: "Ajuste comercial"
};

const fulfillmentStatusLabels = {
  pending: "Pendiente",
  pending_preparation: "Pendiente de preparacion",
  ready_to_ship: "Preparado para despacho",
  shipped: "Despachado",
  delivered: "Recibido por cliente",
  customer_received: "Recibido por cliente"
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
      </article>
    `;
  }).join("");
}

function renderDashboard(payload) {
  state.salesRep = payload.salesRep;
  state.dashboard = payload.dashboard;
  nodes.title.textContent = state.salesRep?.name || "Mi cartera";
  nodes.subtitle.textContent = `${state.dashboard?.customers?.length || 0} clientes asignados. Periodo ${shortDate(state.dashboard?.period?.from)} al ${shortDate(state.dashboard?.period?.to)}.`;
  renderSession();
  renderStats(state.dashboard?.summary || {});
  renderCustomers(state.dashboard?.customers || []);
  renderOrders(state.dashboard?.orders || []);
  nodes.login.classList.add("hidden");
  nodes.dashboard.classList.remove("hidden");
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

nodes.refresh?.addEventListener("click", loadDashboard);

loadDashboard();
