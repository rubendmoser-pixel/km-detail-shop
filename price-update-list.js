const root = document.querySelector("#priceUpdateListRoot");
const actions = document.querySelector("#screenActions");
const summary = document.querySelector("#documentSummary");
const printButton = document.querySelector("#printPriceList");
const batchId = Number(new URLSearchParams(location.search).get("batch") || 0);
const productsPerPage = 10;

load();

async function load() {
  if (!Number.isInteger(batchId) || batchId <= 0) return renderError("No se indicó una programación de precios válida.");
  try {
    const response = await fetch(`/api/admin/price-updates/${batchId}`);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      renderError("La sesión administrativa venció. Ingresá nuevamente para generar la lista.");
      return;
    }
    if (!response.ok || !payload.batch) throw new Error(payload.error || "No pudimos cargar la lista programada.");
    renderDocument(payload.batch);
  } catch (error) {
    renderError(error.message);
  }
}

function renderDocument(batch) {
  const items = Array.isArray(batch.items) ? batch.items : [];
  if (!items.length) return renderError("La programación seleccionada no contiene productos.");
  const pages = chunk(items, productsPerPage);
  const effectiveDate = formatDate(batch.effectiveDate);
  document.title = `KM Detail Line - Lista de precios ${effectiveDate.replaceAll("/", "-")}`;
  root.innerHTML = pages.map((itemsOnPage, index) => pageMarkup({
    batch,
    items: itemsOnPage,
    pageNumber: index + 1,
    pageCount: pages.length,
    effectiveDate
  })).join("");
  summary.textContent = `${items.length} productos · Vigencia ${effectiveDate}`;
  actions.hidden = false;
  printButton.addEventListener("click", printWhenImagesAreReady, { once: false });
}

function pageMarkup({ batch, items, pageNumber, pageCount, effectiveDate }) {
  return `
    <section class="price-sheet">
      <header class="sheet-header">
        <div class="brand">
          <img src="./assets/km-metal-logo-small.png" alt="KM Detail Line">
          <div><p>Información comercial</p><h1>Lista de precios</h1></div>
        </div>
        <div class="validity"><span>Vigencia desde</span><strong>${escapeHtml(effectiveDate)}</strong><small>Precios de lista + IVA</small></div>
      </header>
      <div class="sheet-intro">
        <p>Actualización programada de precios KM Detail Line.</p>
        <span>${batch.type === "linear" ? `Actualización general ${formatPercent(batch.percentBps)}` : "Actualización de lista"}</span>
      </div>
      <div class="product-grid">
        ${items.map(productCard).join("")}
      </div>
      <footer class="sheet-footer">
        <span>KM Detail Line · www.km-detail.com</span>
        <span>Página ${pageNumber} de ${pageCount}</span>
      </footer>
    </section>
  `;
}

function productCard(item) {
  const image = item.primaryImageUrl
    ? `<img src="${escapeHtml(item.primaryImageUrl)}" alt="${escapeHtml(item.name || item.kmCode)}">`
    : `<div class="image-placeholder"><span>KM</span><small>Sin imagen activa</small></div>`;
  return `
    <article class="product-card">
      <div class="product-image">${image}</div>
      <div class="product-copy">
        <div class="product-code"><strong>${escapeHtml(item.kmCode)}</strong>${item.ean13 ? `<small>EAN ${escapeHtml(item.ean13)}</small>` : ""}</div>
        <h2>${escapeHtml(item.name || "Producto KM")}</h2>
        <p>${escapeHtml(item.familyName || "KM Detail Line")}</p>
        <div class="product-price"><span>Precio de lista</span><strong>${formatMoney(item.newPriceCents)}</strong><small>+ IVA</small></div>
      </div>
    </article>
  `;
}

async function printWhenImagesAreReady() {
  printButton.disabled = true;
  printButton.textContent = "Preparando imágenes...";
  await Promise.all([...document.images].map((image) => image.complete
    ? Promise.resolve()
    : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  printButton.disabled = false;
  printButton.textContent = "Guardar PDF / Imprimir";
  window.print();
}

function renderError(message) {
  actions.hidden = true;
  root.innerHTML = `<section class="error"><h1>No se pudo generar la lista</h1><p>${escapeHtml(message)}</p><a href="./admin.html#prices">Volver a precios</a></section>`;
}

function chunk(values, size) {
  const pages = [];
  for (let index = 0; index < values.length; index += size) pages.push(values.slice(index, index + size));
  return pages;
}

function formatMoney(cents) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value || "-");
}

function formatPercent(bps) {
  return `${(Number(bps || 0) / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
