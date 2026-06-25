const root = document.querySelector("#deliveryNoteRoot");
const params = new URLSearchParams(window.location.search);
const orderId = Number(params.get("order") || 0);
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

initDeliveryNote();

async function initDeliveryNote() {
  if (!orderId) return renderError("Faltan datos para generar el detalle de pedido.");
  try {
    const payload = await api(`/api/admin/orders/${orderId}/delivery-note`);
    renderDeliveryNote(payload);
  } catch (error) {
    renderError(error.message);
  }
}

async function api(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo cargar el detalle de pedido.");
  return payload;
}

function renderDeliveryNote(payload) {
  const { order, generatedAt } = payload;
  const shipping = order.shipping || {};
  root.innerHTML = `
    <div class="screen-actions">
      <a href="./admin.html#orders">Volver al panel</a>
      <div><strong>${escapeHtml(order.orderNumber)}</strong> - ${order.items.length} linea${order.items.length === 1 ? "" : "s"}</div>
      <button type="button" id="printDeliveryNote">Imprimir detalle</button>
    </div>
    <section class="note-sheet">
      <header class="note-header">
        <div class="brand-block">
          <img src="./assets/km-metal-logo-small.png" alt="KM Detail Line" />
          <div>
            <p class="eyebrow">Documento comercial no fiscal</p>
            <h1>Detalle de pedido</h1>
          </div>
        </div>
        <div class="document-box">
          <span>Pedido</span>
          <strong>${escapeHtml(order.orderNumber)}</strong>
          <small>${formatDate(generatedAt)}</small>
        </div>
      </header>
      <section class="warning-strip">Documento no valido como factura</section>
      <section class="issuer-strip">
        <div>
          <span>Emisor</span>
          <strong>KM Detail Line - Lopez Karina Marisel</strong>
          <small>CUIT 27-28000765-5 | Responsable inscripto | IIBB 0215237899</small>
        </div>
        <div>
          <span>Oficina comercial</span>
          <strong>Cordoba 645, piso 10, oficina 7</strong>
          <small>Rosario (CP 2000), Santa Fe, Argentina</small>
        </div>
        <div>
          <span>Contacto KM</span>
          <strong>ventas@km-detail.com</strong>
          <small>WhatsApp +54 9 341 253 1269 | www.km-detail.com</small>
        </div>
      </section>
      <section class="note-meta">
        <div>
          <span>Cliente</span>
          <strong>${escapeHtml(order.businessName)}</strong>
          <small>${escapeHtml(order.contactPerson || "")}</small>
        </div>
        <div>
          <span>Entrega</span>
          <strong>${escapeHtml(shippingLine(shipping))}</strong>
          <small>${escapeHtml([shipping.address, shipping.recipient ? `Recibe: ${shipping.recipient}` : ""].filter(Boolean).join(" - "))}</small>
        </div>
        <div>
          <span>Contacto</span>
          <strong>${escapeHtml(order.email || "-")}</strong>
          <small>${escapeHtml(order.customerWhatsapp ? `WhatsApp ${order.customerWhatsapp}` : "")}</small>
        </div>
      </section>
      <table class="note-table">
        <colgroup>
          <col class="code-col" />
          <col class="product-col" />
          <col class="qty-col" />
          <col class="price-col" />
          <col class="subtotal-col" />
        </colgroup>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Producto</th>
            <th class="numeric">Cant.</th>
            <th class="numeric">Precio unit.</th>
            <th class="numeric">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.kmCode)}</strong><br><span>EAN ${escapeHtml(item.ean13)}</span></td>
              <td>${escapeHtml(item.productName)}${item.availabilityNote ? `<br><span>${escapeHtml(item.availabilityNote)}</span>` : ""}</td>
              <td class="numeric"><strong>${item.quantity}</strong></td>
              <td class="numeric">${money.format(item.unitPriceCents / 100)}</td>
              <td class="numeric"><strong>${money.format(item.subtotalNetCents / 100)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <section class="note-bottom">
        <div class="notes-box">
          <span>Observaciones</span>
          <p>Los precios informados corresponden a importes netos en pesos argentinos. La operacion fiscal se documenta por comprobante oficial emitido por KM Detail Line.</p>
        </div>
        <div class="totals-box">
          <div><span>Subtotal neto</span><strong>${money.format(order.subtotalNetCents / 100)}</strong></div>
          <div><span>IVA ${(order.vatBps / 100).toFixed(2)}%</span><strong>${money.format(order.vatCents / 100)}</strong></div>
          <div class="grand-total"><span>Total</span><strong>${money.format(order.totalCents / 100)}</strong></div>
        </div>
      </section>
      <footer class="note-footer">
        <div><span>Preparado por</span></div>
        <div><span>Controlado por</span></div>
        <div><span>Recibido por</span></div>
      </footer>
    </section>
  `;
  document.querySelector("#printDeliveryNote").addEventListener("click", () => window.print());
}

function shippingLine(shipping = {}) {
  return [shipping.city, shipping.province, shipping.postalCode ? `CP ${shipping.postalCode}` : ""].filter(Boolean).join(" - ") || "A coordinar";
}

function renderError(message) {
  root.innerHTML = `<section class="screen-panel"><h1>No se pudo generar el detalle</h1><p>${escapeHtml(message)}</p><p><a href="./admin.html#orders">Volver al panel</a></p></section>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
