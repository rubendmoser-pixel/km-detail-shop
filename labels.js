const root = document.querySelector("#labelsRoot");
const params = new URLSearchParams(window.location.search);
const orderId = Number(params.get("order") || 0);
const packageCount = Number(params.get("packages") || 1);

const CODE39 = {
  "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
  "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
  "8": "110100101101", "9": "101100101101", "A": "110101001011", "B": "101101001011",
  "C": "110110100101", "D": "101011001011", "E": "110101100101", "F": "101101100101",
  "G": "101010011011", "H": "110101001101", "I": "101101001101", "J": "101011001101",
  "K": "110101010011", "L": "101101010011", "M": "110110101001", "N": "101011010011",
  "O": "110101101001", "P": "101101101001", "Q": "101010110011", "R": "110101011001",
  "S": "101101011001", "T": "101011011001", "U": "110010101011", "V": "100110101011",
  "W": "110011010101", "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
  "-": "100101011011", ".": "110010101101", " ": "100110101101", "$": "100100100101",
  "/": "100100101001", "+": "100101001001", "%": "101001001001", "*": "100101101101"
};

initLabels();

async function initLabels() {
  if (!orderId || !Number.isInteger(packageCount) || packageCount < 1 || packageCount > 99) {
    return renderError("Faltan datos para generar etiquetas.");
  }
  try {
    const payload = await api(`/api/admin/orders/${orderId}/shipping-labels?packages=${packageCount}`);
    renderLabels(payload);
  } catch (error) {
    renderError(error.message);
  }
}

async function api(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las etiquetas.");
  return payload;
}

function renderLabels(payload) {
  const { order, packages } = payload;
  root.innerHTML = `
    <div class="screen-actions">
      <a href="./admin.html#orders">Volver al panel</a>
      <div><strong>${escapeHtml(order.orderNumber)}</strong> · ${packages.length} bulto${packages.length === 1 ? "" : "s"}</div>
      <button type="button" id="printLabels">Imprimir etiquetas</button>
    </div>
    ${packages.map((pack) => labelSheet(order, pack)).join("")}
  `;
  document.querySelector("#printLabels").addEventListener("click", () => window.print());
}

function labelSheet(order, pack) {
  const shipping = order.shipping || {};
  const cityLine = [shipping.city, shipping.province, shipping.postalCode ? `CP ${shipping.postalCode}` : ""].filter(Boolean).join(" · ");
  const contactLine = [
    shipping.recipient ? `Recibe: ${shipping.recipient}` : "",
    shipping.contactPhone ? `Tel: ${shipping.contactPhone}` : "",
    order.customerWhatsapp ? `WhatsApp: ${order.customerWhatsapp}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <section class="label-sheet">
      <article class="shipping-label">
        <header class="label-topbar">
          <div class="label-brand">
            <img src="./assets/km-metal-logo-small.png" alt="KM Detail Line" />
            <span>Despacho comercial</span>
          </div>
          <div class="package-count"><span>Bulto</span><strong>${pack.number} / ${pack.total}</strong></div>
        </header>
        <div class="order-strip">
          <div><span>Pedido</span><strong>${escapeHtml(order.orderNumber)}</strong></div>
          <div><span>Fecha</span><strong>${formatDate(new Date())}</strong></div>
        </div>
        <div class="label-body">
          <div>
            <section class="label-section">
              <span>Destinatario</span>
              <div class="recipient">${escapeHtml(order.businessName)}</div>
              <div class="address">${escapeHtml(shipping.address || "")}<br />${escapeHtml(cityLine)}</div>
              <div class="contact">${escapeHtml(contactLine)}</div>
            </section>
            <section class="label-section">
              <span>Transporte / modalidad</span>
              <div class="notes">${escapeHtml(shipping.preferredTransport || order.fulfillment?.carrier || order.fulfillment?.method || "A coordinar")}</div>
            </section>
            <section class="label-section">
              <span>Contenido del pedido</span>
              <ul class="items-list">${order.items.slice(0, 9).map((item) => (
                `<li>${item.quantity} x ${escapeHtml(item.kmCode)} · ${escapeHtml(item.productName)}</li>`
              )).join("")}${order.items.length > 9 ? `<li>Ver pedido completo en sistema KM.</li>` : ""}</ul>
            </section>
          </div>
          <aside class="barcode-panel">
            ${code39Svg(pack.code)}
            <div class="package-code">${escapeHtml(pack.code)}</div>
          </aside>
        </div>
        <footer class="label-footer">
          <div>Control deposito</div>
          <div>Firma / recepcion</div>
        </footer>
      </article>
    </section>
  `;
}

function code39Svg(value) {
  const text = `*${String(value).toUpperCase().replace(/[^A-Z0-9 ./$+%-]/g, "-")}*`;
  const narrow = 2;
  const wide = 5;
  const gap = narrow;
  let x = 0;
  const bars = [];
  for (const character of text) {
    const pattern = CODE39[character] || CODE39["-"];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "1" ? wide : narrow;
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="94" />`);
      x += width;
    }
    x += gap;
  }
  return `<svg viewBox="0 0 ${x} 118" role="img" aria-label="Codigo de barras ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${x}" height="118" fill="#fff" />
    <g fill="#0b0c0e">${bars.join("")}</g>
    <text x="${x / 2}" y="112" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700">${escapeHtml(value)}</text>
  </svg>`;
}

function renderError(message) {
  root.innerHTML = `<section class="screen-panel"><h1>No se pudieron generar las etiquetas</h1><p>${escapeHtml(message)}</p><p><a href="./admin.html#orders">Volver al panel</a></p></section>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
