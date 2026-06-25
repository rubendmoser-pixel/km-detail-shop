const root = document.querySelector("#pickingRoot");
const params = new URLSearchParams(window.location.search);
const orderId = Number(params.get("order") || 0);

initPicking();

async function initPicking() {
  if (!orderId) return renderError("Faltan datos para generar la hoja de preparacion.");
  try {
    const payload = await api(`/api/admin/orders/${orderId}/picking-list`);
    renderPicking(payload);
  } catch (error) {
    renderError(error.message);
  }
}

async function api(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo cargar la hoja de preparacion.");
  return payload;
}

function renderPicking(payload) {
  const { order, generatedAt } = payload;
  root.innerHTML = `
    <div class="screen-actions">
      <a href="./admin.html#orders">Volver al panel</a>
      <div><strong>${escapeHtml(order.orderNumber)}</strong> - ${order.items.length} linea${order.items.length === 1 ? "" : "s"}</div>
      <button type="button" id="printPicking">Imprimir preparacion</button>
    </div>
    <section class="pick-sheet">
      <header class="pick-header">
        <img src="./assets/km-metal-logo-small.png" alt="KM Detail Line" />
        <div>
          <p class="eyebrow">Preparacion interna de deposito</p>
          <h1>Hoja de pedido</h1>
        </div>
        <div class="order-number">${escapeHtml(order.orderNumber)}</div>
      </header>
      <section class="pick-meta">
        <div><span>Cliente</span><strong>${escapeHtml(order.businessName)}</strong></div>
        <div><span>Entrega</span><strong>${escapeHtml(shippingLine(order.shipping))}</strong></div>
        <div><span>Fecha</span><strong>${formatDate(generatedAt)}</strong></div>
      </section>
      <table class="pick-table">
        <thead>
          <tr>
            <th>Ubicacion</th>
            <th>Codigo</th>
            <th>Producto</th>
            <th class="qty">Cantidad</th>
            <th class="check">Control</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map((item) => `
            <tr>
              <td class="pick-location">${escapeHtml(item.warehouseLocation || "Sin ubicacion")}</td>
              <td class="pick-code">${escapeHtml(item.kmCode)}<br><span>EAN ${escapeHtml(item.ean13)}</span></td>
              <td>${escapeHtml(item.productName)}${item.availabilityNote ? `<br><span>${escapeHtml(item.availabilityNote)}</span>` : ""}</td>
              <td class="qty"><strong>${item.pickQuantity}</strong></td>
              <td class="check"><span class="check-box"></span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <footer class="pick-footer">
        <div class="control-box"><span>Preparo</span></div>
        <div class="control-box"><span>Controlo</span></div>
        <div class="control-box"><span>Observaciones</span></div>
      </footer>
    </section>
  `;
  document.querySelector("#printPicking").addEventListener("click", () => window.print());
}

function shippingLine(shipping = {}) {
  return [shipping.city, shipping.province, shipping.postalCode ? `CP ${shipping.postalCode}` : ""].filter(Boolean).join(" - ") || "A coordinar";
}

function renderError(message) {
  root.innerHTML = `<section class="screen-panel"><h1>No se pudo generar la preparacion</h1><p>${escapeHtml(message)}</p><p><a href="./admin.html#orders">Volver al panel</a></p></section>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
