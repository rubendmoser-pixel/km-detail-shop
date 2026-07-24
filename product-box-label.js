const root = document.querySelector("#boxLabelRoot");
const actions = document.querySelector("#screenActions");
const summary = document.querySelector("#documentSummary");
const printButton = document.querySelector("#printLabel");
const productId = Number(new URLSearchParams(location.search).get("product") || 0);

load();

async function load() {
  if (!Number.isInteger(productId) || productId <= 0) return renderError("No se indic\u00f3 un producto v\u00e1lido.");
  try {
    const response = await fetch(`/api/admin/products/${productId}/box-label`);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return renderError("La sesi\u00f3n administrativa venci\u00f3. Ingres\u00e1 nuevamente para generar la etiqueta.");
    if (!response.ok || !payload.label) throw new Error(payload.error || "No pudimos cargar la etiqueta.");
    renderLabel(payload.label);
  } catch (error) {
    renderError(error.message);
  }
}

function renderLabel(label) {
  const complete = label.unitWeightGrams > 0 && label.unitsPerBox > 0 && label.boxDescription;
  root.innerHTML = `
    <article class="box-sheet ${complete ? "" : "incomplete"}">
      <section class="code-block">
        <strong>${escapeHtml(label.kmCode)}</strong>
      </section>
      <section class="quantity-block">
        <span>CONTENIDO</span>
        <strong>${formatNumber(label.unitsPerBox, 0)} UNIDADES</strong>
      </section>
      <section class="product-detail">
        <h1>${escapeHtml(label.name)}</h1>
        ${label.measure ? `<p>${escapeHtml(label.measure)}</p>` : ""}
      </section>
      <section class="box-detail">
        <div><span>CAJA UTILIZADA</span><strong>${escapeHtml(label.boxDescription || "SIN DEFINIR")}</strong></div>
        <div><span>PESO POR UNIDAD</span><strong>${formatWeight(label.unitWeightGrams)}</strong></div>
        <div><span>PESO NETO ESTIMADO</span><strong>${formatWeight(label.netWeightGrams)}</strong></div>
        <div><span>EAN</span><strong>${escapeHtml(label.ean13 || "SIN EAN")}</strong></div>
      </section>
      ${complete ? "" : `<p class="warning">Complet&aacute; peso, unidades por caja y caja utilizada antes de usar esta etiqueta.</p>`}
    </article>`;
  document.title = `${label.kmCode} - Etiqueta de caja`;
  summary.textContent = `${label.kmCode} · ${label.unitsPerBox || 0} unidades`;
  actions.hidden = false;
  printButton.disabled = !complete;
  printButton.title = complete ? "" : "Faltan datos de embalaje en la ficha del producto.";
  printButton.addEventListener("click", () => window.print());
}

function formatWeight(grams) {
  const value = Number(grams || 0);
  if (value >= 1000) return `${formatNumber(value / 1000, 3)} kg`;
  return `${formatNumber(value, 3)} g`;
}

function formatNumber(value, decimals) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimals }).format(Number(value || 0));
}

function renderError(message) {
  actions.hidden = true;
  root.innerHTML = `<section class="error"><h1>No se pudo generar la etiqueta</h1><p>${escapeHtml(message)}</p><a href="./admin.html#products">Volver a productos</a></section>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
