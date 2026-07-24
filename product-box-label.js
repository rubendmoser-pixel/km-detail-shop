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
  const complete = label.unitWeightGrams > 0
    && label.unitsPerBox > 0
    && label.boxDescription
    && label.boxTareWeightGrams > 0
    && label.boxCode;
  root.innerHTML = `
    <article class="box-sheet ${complete ? "" : "incomplete"}">
      <header class="commercial-header">
        <img src="./assets/km-logo-solid-black-v2.png" alt="KM">
        <div><span>PRESENTACI&Oacute;N COMERCIAL</span><strong>PRODUCTO EN CAJA</strong></div>
      </header>
      <section class="box-code-block">
        <span>C&Oacute;DIGO DE CAJA</span>
        <strong>${escapeHtml(label.boxCode || "SIN C&Oacute;DIGO")}</strong>
      </section>
      <section class="product-detail">
        <div class="product-code"><span>PRODUCTO</span><strong>${escapeHtml(label.kmCode)}</strong></div>
        <div class="product-name"><h1>${escapeHtml(label.name)}</h1>${label.measure ? `<p>${escapeHtml(label.measure)}</p>` : ""}</div>
      </section>
      <section class="commercial-data">
        <div class="quantity"><span>CONTENIDO</span><strong>${formatNumber(label.unitsPerBox, 0)}</strong><b>UNIDADES</b></div>
        <div class="weight"><span>PESO BRUTO ESTIMADO</span><strong>${formatWeight(label.grossWeightGrams)}</strong></div>
      </section>
      <section class="ean-detail">
        <span>EAN DEL PRODUCTO</span>
        <strong>${escapeHtml(label.ean13 || "SIN EAN")}</strong>
      </section>
      ${complete ? "" : `<p class="warning">Complet&aacute; peso unitario, cantidad, caja utilizada, peso de la caja y c&oacute;digo de caja antes de imprimir.</p>`}
    </article>`;
  document.title = `${label.kmCode} - Etiqueta de caja`;
  summary.textContent = `${label.boxCode || label.kmCode} · ${label.unitsPerBox || 0} unidades`;
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
