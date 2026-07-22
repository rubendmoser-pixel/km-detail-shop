const root = document.querySelector("#locationLabelRoot");
const actions = document.querySelector("#screenActions");
const summary = document.querySelector("#documentSummary");
const printButton = document.querySelector("#printLabel");
const productId = Number(new URLSearchParams(location.search).get("product") || 0);

load();

async function load() {
  if (!Number.isInteger(productId) || productId <= 0) return renderError("No se indic\u00f3 un producto v\u00e1lido.");
  try {
    const response = await fetch(`/api/admin/products/${productId}/location-label`);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return renderError("La sesi\u00f3n administrativa venci\u00f3. Ingres\u00e1 nuevamente para generar la etiqueta.");
    if (!response.ok || !payload.label) throw new Error(payload.error || "No pudimos cargar la etiqueta.");
    renderLabel(payload.label);
  } catch (error) {
    renderError(error.message);
  }
}

function renderLabel(label) {
  const location = label.warehouseLocation?.trim() || "SIN UBICACI&Oacute;N ASIGNADA";
  const locationSizeClass = label.warehouseLocation && location.length > 12 ? "compact" : "";
  const codeSizeClass = String(label.kmCode || "").length > 9 ? "compact" : "";
  const images = Array.isArray(label.images) ? label.images.slice(0, 2) : [];
  const imageMarkup = images.length
    ? images.map((image, index) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.altText || `${label.name} - imagen ${index + 1}`)}"></figure>`).join("")
    : `<div class="image-placeholder"><span>Sin im&aacute;genes activas</span></div>`;
  root.innerHTML = `
    <article class="location-sheet">
      <section class="location-block ${label.warehouseLocation ? locationSizeClass : "missing"}">
        <h1>${escapeHtml(location)}</h1>
      </section>
      <section class="product-block">
        <div class="code-line ${codeSizeClass}"><strong>${escapeHtml(label.kmCode)}</strong></div>
        <div class="secondary-details">
          <div class="product-description"><span>Producto</span><h2>${escapeHtml(label.name)}</h2>${label.measure ? `<p class="measure">${escapeHtml(label.measure)}</p>` : ""}</div>
          <div class="product-meta">
            <div><span>EAN</span><strong>${escapeHtml(label.ean13 || "Sin EAN")}</strong></div>
            <div><span>Familia</span><strong>${escapeHtml(label.familyName || "-")}</strong></div>
          </div>
        </div>
      </section>
      <section class="product-images ${images.length === 1 ? "single" : ""}">${imageMarkup}</section>
    </article>`;
  document.title = `${label.kmCode} - Etiqueta de dep&oacute;sito`;
  summary.textContent = `${label.kmCode} · ${label.warehouseLocation?.trim() || "SIN UBICACI\u00d3N ASIGNADA"}`;
  actions.hidden = false;
  printButton.addEventListener("click", printWhenImagesAreReady);
}

async function printWhenImagesAreReady() {
  printButton.disabled = true;
  printButton.textContent = "Preparando im\u00e1genes...";
  await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  })));
  printButton.disabled = false;
  printButton.textContent = "Guardar PDF / Imprimir";
  window.print();
}

function renderError(message) {
  actions.hidden = true;
  root.innerHTML = `<section class="error"><h1>No se pudo generar la etiqueta</h1><p>${escapeHtml(message)}</p><a href="./admin.html#products">Volver a productos</a></section>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
