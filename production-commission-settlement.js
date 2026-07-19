const root = document.querySelector("#productionCommissionSettlementRoot");
const settlementId = Number(new URLSearchParams(window.location.search).get("settlement") || 0);
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

loadSettlement();

async function loadSettlement() {
  if (!settlementId) return renderError("Falta el número de liquidación.");
  try {
    const response = await fetch(`/api/admin/production/commission-settlements/${settlementId}`, { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo cargar la liquidación.");
    renderSettlement(payload.settlement);
  } catch (error) {
    renderError(error.message);
  }
}

function renderSettlement(settlement) {
  root.innerHTML = `
    <div class="screen-actions">
      <a href="./admin.html#production-commissions">Volver a comisiones</a>
      <div><strong>${escapeHtml(settlement.settlementNumber)}</strong> · ${formatNumber(settlement.totalProducts)} producto${Number(settlement.totalProducts) === 1 ? "" : "s"}</div>
      <button type="button" id="printSettlement">Imprimir liquidación</button>
    </div>
    <section class="settlement-sheet">
      <header class="settlement-header">
        <div class="brand-block"><img src="./assets/km-metal-logo-small.png" alt="KM Detail Line"><div><p class="eyebrow">Documento interno de administración</p><h1>Liquidación de producción</h1></div></div>
        <div class="settlement-box"><span>Liquidación</span><strong>${escapeHtml(settlement.settlementNumber)}</strong><small>${formatDateTime(settlement.settledAt)}</small></div>
      </header>
      <section class="meta-grid">
        <div class="meta-card"><span>Operario</span><strong>${escapeHtml(settlement.operatorName)}</strong><small>${escapeHtml(settlement.operatorEmail || "")}</small></div>
        <div class="meta-card"><span>Total de productos</span><strong>${formatNumber(settlement.totalProducts)}</strong><small>Unidades buenas confirmadas por Administración</small></div>
        <div class="meta-card"><span>Registrado por</span><strong>Administración KM</strong><small>${escapeHtml(settlement.settledByEmail || "")}</small></div>
      </section>
      <table class="settlement-table">
        <thead><tr><th>Fecha</th><th>Parte</th><th>Producto</th><th class="numeric">Buenas</th><th class="numeric">Valor/u.</th><th class="numeric">Importe</th></tr></thead>
        <tbody>${settlement.items.map((item) => `<tr><td>${formatPlainDate(item.productionDate)}</td><td><strong>${escapeHtml(item.reportNumber)}</strong></td><td><strong>${escapeHtml(item.kmCode)}</strong><br><small>${escapeHtml(item.productName)}</small></td><td class="numeric">${formatNumber(item.goodQuantity)}</td><td class="numeric">${money.format(item.unitCommissionArs || 0)}</td><td class="numeric"><strong>${money.format(item.amountArs || 0)}</strong></td></tr>`).join("")}</tbody>
      </table>
      <section class="totals"><div class="totals-box"><div class="grand-total"><span>Total liquidación</span><strong>${money.format(settlement.totalArs || 0)}</strong></div></div></section>
      ${settlement.notes ? `<section class="settlement-notes"><strong>Nota de liquidación</strong><p>${escapeHtml(settlement.notes)}</p></section>` : ""}
      <footer class="settlement-footer"><div class="control-box"><span>Preparado por</span></div><div class="control-box"><span>Autorizado por</span></div><div class="control-box"><span>Recibido / conformidad</span></div></footer>
    </section>`;
  document.querySelector("#printSettlement").addEventListener("click", () => window.print());
}

function renderError(message) {
  root.innerHTML = `<section class="screen-panel"><h1>No se pudo generar la liquidación</h1><p>${escapeHtml(message)}</p><p><a href="./admin.html#production-commissions">Volver a comisiones</a></p></section>`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(normalized));
}

function formatPlainDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatNumber(value) { return Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 }); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
