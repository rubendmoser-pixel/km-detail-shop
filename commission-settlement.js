const root = document.querySelector("#commissionSettlementRoot");
const params = new URLSearchParams(window.location.search);
const settlementId = Number(params.get("settlement") || 0);
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

initCommissionSettlement();

async function initCommissionSettlement() {
  if (!settlementId) return renderError("Faltan datos para generar la liquidacion.");
  try {
    const { settlement } = await api(`/api/admin/sales-commission-settlements/${settlementId}`);
    renderSettlement(settlement);
  } catch (error) {
    renderError(error.message);
  }
}

async function api(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo cargar la liquidacion.");
  return payload;
}

function renderSettlement(settlement) {
  const bank = settlement.bank || {};
  root.innerHTML = `
    <div class="screen-actions">
      <a href="./admin.html#sales">Volver al panel</a>
      <div><strong>${escapeHtml(settlement.settlement_number)}</strong> - ${settlement.orders_count} pedido${settlement.orders_count === 1 ? "" : "s"}</div>
      <button type="button" id="printSettlement">Imprimir liquidacion</button>
    </div>
    <section class="settlement-sheet">
      <header class="settlement-header">
        <div class="brand-block">
          <img src="./assets/km-metal-logo-small.png" alt="KM Detail Line" />
          <div>
            <p class="eyebrow">Documento interno de administracion</p>
            <h1>Liquidacion de comisiones</h1>
          </div>
        </div>
        <div class="settlement-box">
          <span>Liquidacion</span>
          <strong>${escapeHtml(settlement.settlement_number)}</strong>
          <small>${formatDate(settlement.created_at)}</small>
        </div>
      </header>

      <section class="meta-grid">
        <div class="meta-card">
          <span>Vendedor</span>
          <strong>${escapeHtml(settlement.sales_rep_name)}</strong>
          <small>${escapeHtml(settlement.sales_rep_email)}</small>
        </div>
        <div class="meta-card">
          <span>Periodo liquidado</span>
          <strong>${escapeHtml(formatPlainDate(settlement.period_from))} al ${escapeHtml(formatPlainDate(settlement.period_to))}</strong>
          <small>${settlement.orders_count} pedido${settlement.orders_count === 1 ? "" : "s"} cobrado${settlement.orders_count === 1 ? "" : "s"}</small>
        </div>
        <div class="meta-card">
          <span>Datos bancarios</span>
          <strong>${escapeHtml(bank.bankName || "Sin banco informado")}</strong>
          <small>${escapeHtml([
            bank.accountHolder ? `Titular: ${bank.accountHolder}` : "",
            bank.accountType ? `Cuenta: ${bank.accountType}` : "",
            bank.cbu ? `CBU/CVU: ${bank.cbu}` : "",
            bank.alias ? `Alias: ${bank.alias}` : ""
          ].filter(Boolean).join(" | "))}</small>
        </div>
      </section>

      <table class="settlement-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Fecha cobro</th>
            <th class="numeric">Base comision</th>
            <th class="numeric">%</th>
            <th class="numeric">Comision</th>
          </tr>
        </thead>
        <tbody>
          ${settlement.items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.order_number)}</strong></td>
              <td>${escapeHtml(item.business_name)}</td>
              <td>${escapeHtml(formatDate(item.order_paid_at || item.order_created_at))}</td>
              <td class="numeric">${money.format((item.subtotal_net_cents || 0) / 100)}</td>
              <td class="numeric">${formatBps(item.commission_bps || 0)}</td>
              <td class="numeric"><strong>${money.format((item.commission_cents || 0) / 100)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <section class="totals">
        <div class="totals-box">
          <div><span>Base liquidada</span><strong>${money.format((settlement.commission_base_cents || 0) / 100)}</strong></div>
          <div class="grand-total"><span>Total comisiones</span><strong>${money.format((settlement.commission_cents || 0) / 100)}</strong></div>
        </div>
      </section>

      ${settlement.notes ? `<section class="settlement-notes"><strong>Nota interna</strong><p>${escapeHtml(settlement.notes)}</p></section>` : ""}

      <footer class="settlement-footer">
        <div class="control-box"><span>Preparado por</span></div>
        <div class="control-box"><span>Autorizado por</span></div>
        <div class="control-box"><span>Recibido / conformidad</span></div>
      </footer>
    </section>
  `;
  document.querySelector("#printSettlement").addEventListener("click", () => window.print());
}

function renderError(message) {
  root.innerHTML = `<section class="screen-panel"><h1>No se pudo generar la liquidacion</h1><p>${escapeHtml(message)}</p><p><a href="./admin.html#sales">Volver al panel</a></p></section>`;
}

function formatDate(value) {
  if (!value) return "-";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(normalized));
}

function formatPlainDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatBps(value) {
  return `${(Number(value || 0) / 100).toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
