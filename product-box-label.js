const root = document.querySelector("#boxLabelRoot");
const actions = document.querySelector("#screenActions");
const summary = document.querySelector("#documentSummary");
const printButton = document.querySelector("#printLabel");
const productId = Number(new URLSearchParams(location.search).get("product") || 0);
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
      </header>
      <section class="box-code-block">
        <strong>${escapeHtml(label.boxCode || "SIN C&Oacute;DIGO")}</strong>
        <div class="barcode box-barcode">${code39Svg(label.boxCode || "")}</div>
      </section>
      <section class="product-detail">
        <div class="product-code"><span>PRODUCTO</span><strong>${escapeHtml(label.kmCode)}</strong><div class="barcode product-barcode">${code39Svg(label.kmCode)}</div></div>
        <div class="product-name"><h1>${escapeHtml(label.name)}</h1>${label.measure ? `<p>${escapeHtml(label.measure)}</p>` : ""}</div>
      </section>
      <section class="commercial-data">
        <div class="quantity"><span>CONTENIDO</span><strong>${formatNumber(label.unitsPerBox, 0)}</strong><b>UNIDADES</b></div>
        <div class="weight"><span>PESO BRUTO ESTIMADO</span><strong>${formatWeight(label.grossWeightGrams)}</strong></div>
      </section>
      <section class="ean-detail">
        <div><span>EAN DEL PRODUCTO</span><strong>${escapeHtml(label.ean13 || "SIN EAN")}</strong></div>
        <div class="barcode ean-barcode">${code39Svg(label.ean13 || "")}</div>
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

function code39Svg(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9 ./$+%-]/g, "-");
  if (!normalized) return "";
  const text = `*${normalized}*`;
  const narrow = 2;
  const wide = 5;
  const gap = narrow;
  let x = 0;
  const bars = [];
  for (const character of text) {
    const pattern = CODE39[character] || CODE39["-"];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "1" ? wide : narrow;
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="100" />`);
      x += width;
    }
    x += gap;
  }
  return `<svg viewBox="0 0 ${x} 100" role="img" aria-label="C&oacute;digo de barras ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg"><rect width="${x}" height="100" fill="#fff"/><g fill="#08090b">${bars.join("")}</g></svg>`;
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
