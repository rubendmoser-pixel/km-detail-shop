const SITE_URL = "https://km-detail.com";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

const state = {
  products: [],
  user: null,
  orders: [],
  settings: { vatBps: 2100, whatsappNumber: "" },
  category: "Todos",
  search: "",
  cut: "",
  size: "",
  sort: "featured",
  cart: readCart()
};

const els = Object.fromEntries([
  "categoryFilters", "cutFilter", "sizeFilter", "searchInput", "sortSelect", "productGrid",
  "resultCount", "productTotal", "catalogNotice", "cartCount", "cartDrawer", "cartItems",
  "cartEmpty", "cartTotals", "cartSubtotal", "cartVatLabel", "cartVat", "cartTotal",
  "goToOrder", "toast", "orderAccess", "orderForm", "orderResult", "customerOrders", "openAccount",
  "accountDialog", "accountTitle", "loginForm", "registerForm", "accountMessage",
  "showLogin", "showRegister", "sessionPanel", "sessionBusiness", "sessionStatus",
  "imageLightbox", "imageLightboxImage", "imageLightboxCaption", "closeImageLightbox", "closeImageLightboxBackdrop"
].map((id) => [id, document.querySelector(`#${id}`)]));

async function init() {
  bindEvents();
  await Promise.all([loadSession(), loadSettings()]);
  await loadProducts();
  if (isApprovedCustomer()) await loadCustomerOrders();
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function bindEvents() {
  document.querySelectorAll("[data-category-link]").forEach((link) => {
    link.addEventListener("click", () => {
      const match = state.products.find((product) => product.family.name.toLowerCase().includes(link.dataset.categoryLink.toLowerCase()));
      state.category = match?.family.name || "Todos";
      renderCategoryFilters();
      renderProducts();
    });
  });
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });
  els.cutFilter.addEventListener("change", (event) => {
    state.cut = event.target.value;
    renderProducts();
  });
  els.sizeFilter.addEventListener("change", (event) => {
    state.size = event.target.value;
    renderProducts();
  });
  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderProducts();
  });
  document.querySelector("#clearFilters").addEventListener("click", clearFilters);
  document.querySelector("#openCart").addEventListener("click", openCart);
  document.querySelector("#closeCart").addEventListener("click", closeCart);
  els.cartDrawer.addEventListener("click", (event) => {
    if (event.target === els.cartDrawer) closeCart();
  });
  document.querySelector("#clearCart").addEventListener("click", clearCart);
  els.goToOrder.addEventListener("click", closeCart);
  document.querySelector("#copyOrder").addEventListener("click", copyOrderSummary);
  els.orderForm.addEventListener("submit", submitOrder);

  [els.openAccount, document.querySelector("#openAccountHero"), document.querySelector("#orderLogin")]
    .forEach((button) => button.addEventListener("click", () => openAccount(button.id !== "openAccount")));
  document.querySelectorAll("[data-open-account]").forEach((button) => {
    button.addEventListener("click", () => openAccount(button.dataset.openAccount === "register"));
  });
  document.querySelector("#closeAccount").addEventListener("click", () => els.accountDialog.close());
  els.showLogin.addEventListener("click", () => setAccountMode("login"));
  els.showRegister.addEventListener("click", () => setAccountMode("register"));
  els.loginForm.addEventListener("submit", submitLogin);
  els.registerForm.addEventListener("submit", submitRegistration);
  document.querySelector("#logoutButton").addEventListener("click", logout);
  els.closeImageLightbox.addEventListener("click", closeImageLightbox);
  els.closeImageLightboxBackdrop.addEventListener("click", closeImageLightbox);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.imageLightbox.hidden) closeImageLightbox();
  });
}

async function loadSession() {
  try {
    state.user = (await api("/api/me")).user;
  } catch (error) {
    if (error.status !== 401) showToast(error.message);
    state.user = null;
  }
}

async function loadSettings() {
  try {
    state.settings = (await api("/api/public-settings")).settings;
  } catch {
    state.settings = { vatBps: 2100, whatsappNumber: "" };
  }
}

async function loadProducts() {
  try {
    state.products = (await api("/api/products")).products;
    pruneCart();
  } catch (error) {
    state.products = [];
    showToast(error.message);
  }
}

function renderAll() {
  els.productTotal.textContent = state.products.length;
  renderAccountState();
  renderCategoryFilters();
  renderSelectOptions();
  renderProducts();
  renderCart();
  renderCustomerOrders();
}

function renderAccountState() {
  const approved = isApprovedCustomer();
  els.openAccount.textContent = state.user ? state.user.businessName || state.user.email : "Ingresar";
  els.catalogNotice.textContent = approved
    ? "Precios netos personalizados. IVA no incluido."
    : state.user?.approvalStatus === "pending"
      ? "Tu cuenta comercial esta pendiente de aprobacion."
      : "Inicia sesion para consultar precios comerciales.";
  els.orderAccess.hidden = approved;
  els.orderForm.hidden = !approved;
}

function renderCategoryFilters() {
  const categories = ["Todos", ...new Set(state.products.map((product) => product.family.name))];
  if (!categories.includes(state.category)) state.category = "Todos";
  els.categoryFilters.innerHTML = categories.map((category) => `
    <button type="button" class="${category === state.category ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
  `).join("");
  els.categoryFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderCategoryFilters();
      renderProducts();
    });
  });
}

function renderSelectOptions() {
  const cuts = [...new Set(state.products.map((product) => product.cutLevel).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));
  const sizes = [...new Set(state.products.map((product) => product.measure).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  els.cutFilter.innerHTML = `<option value="">Todos</option>${cuts.map((cut) => `<option value="${escapeHtml(cut)}">${escapeHtml(cut)}</option>`).join("")}`;
  els.sizeFilter.innerHTML = `<option value="">Todas</option>${sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join("")}`;
}

function renderProducts() {
  let filtered = state.products.filter((product) => {
    const haystack = [product.kmCode, product.ean13, product.name, product.family.name, product.subfamily,
      product.material, product.color, product.attachmentSystem].join(" ").toLowerCase();
    return (state.category === "Todos" || product.family.name === state.category)
      && (!state.search || haystack.includes(state.search))
      && (!state.cut || product.cutLevel === state.cut)
      && (!state.size || product.measure === state.size);
  });
  filtered = sortProducts(filtered);
  els.resultCount.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;
  els.productGrid.innerHTML = filtered.length
    ? filtered.map(renderProductCard).join("")
    : `<article class="product-card empty-card"><div class="product-body"><h3>Sin resultados</h3><p>Proba cambiar la busqueda o limpiar los filtros.</p></div></article>`;

  els.productGrid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.add);
      const input = els.productGrid.querySelector(`[data-qty="${id}"]`);
      addToCart(id, Number(input.value || 1));
    });
  });
  els.productGrid.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = els.productGrid.querySelector(`[data-qty="${button.dataset.productId}"]`);
      input.value = Math.max(1, Number(input.value || 1) + Number(button.dataset.step));
    });
  });
  els.productGrid.querySelectorAll("[data-gallery-image]").forEach((button) => {
    button.addEventListener("click", () => selectProductImage(button));
  });
  els.productGrid.querySelectorAll("[data-zoom-image]").forEach((button) => {
    button.addEventListener("click", () => openImageLightbox(button.dataset.zoomImage, button.dataset.zoomAlt, button.dataset.zoomCaption));
  });
}

function renderProductCard(product) {
  const approved = isApprovedCustomer();
  const cut = product.cutLevel ? `<span class="tag yellow">Corte ${escapeHtml(product.cutLevel)}</span>` : "";
  const familyClass = tagClass(product);
  const images = product.images?.length ? product.images : (product.primaryImageUrl ? [{ url: product.primaryImageUrl, altText: product.name }] : []);
  const gallery = images.length > 1 ? `<div class="product-gallery-thumbs" aria-label="Galeria de ${escapeHtml(product.kmCode)}">
    ${images.slice(0, 5).map((image, index) => `
      <button class="${index === 0 ? "active" : ""}" type="button" data-gallery-image="${escapeHtml(image.url)}" data-gallery-alt="${escapeHtml(image.altText || product.name)}" aria-label="Ver imagen ${index + 1} de ${escapeHtml(product.kmCode)}">
        <img src="${escapeHtml(image.url)}" alt="" loading="lazy" />
      </button>
    `).join("")}
  </div>` : "";
  const mainAlt = images[0]?.altText || product.name;
  const zoomCaption = `${product.kmCode} · ${product.name}`;
  const visual = images.length
    ? `<div class="product-visual has-image"><div class="product-visual-head"><span class="product-code">${escapeHtml(product.kmCode)}</span></div><figure><button class="product-image-zoom" type="button" data-zoom-image="${escapeHtml(images[0].url)}" data-zoom-alt="${escapeHtml(mainAlt)}" data-zoom-caption="${escapeHtml(zoomCaption)}" aria-label="Ampliar imagen de ${escapeHtml(product.kmCode)}"><img src="${escapeHtml(images[0].url)}" alt="${escapeHtml(mainAlt)}" loading="lazy" /></button></figure>${gallery}</div>`
    : `<div class="product-visual ${familyClass}"><span class="product-code">${escapeHtml(product.kmCode)}</span></div>`;
  const pricing = approved ? `
    <div class="price-block">
      <span>Lista neta <s>${money.format(product.basePriceCents / 100)}</s></span>
      <strong>${money.format(product.finalPriceCents / 100)}</strong>
      <small>${discountText(product.discountsBps)} Precio neto. IVA no incluido.</small>
    </div>
    <div class="product-actions">
      <div class="qty-control">
        <button type="button" data-step="-1" data-product-id="${product.id}" aria-label="Restar cantidad">-</button>
        <input data-qty="${product.id}" value="1" inputmode="numeric" aria-label="Cantidad para ${escapeHtml(product.kmCode)}" />
        <button type="button" data-step="1" data-product-id="${product.id}" aria-label="Sumar cantidad">+</button>
      </div>
      <button class="add-button" type="button" data-add="${product.id}">Agregar</button>
    </div>` : `
    <div class="private-price">
      <span>${state.user ? "Precio disponible al aprobar la cuenta" : "Precio disponible con cuenta comercial aprobada"}</span>
    </div>`;
  return `
    <article class="product-card family-${familyClass}">
      ${visual}
      <div class="product-body">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.family.name)} · ${escapeHtml(product.attachmentSystem || "Sin especificar")} · EAN ${escapeHtml(product.ean13)}</p>
        <div class="meta-line">
          <span class="tag ${familyClass}">${escapeHtml(product.material || product.family.name)}</span>
          ${product.measure ? `<span class="tag">${escapeHtml(product.measure)}</span>` : ""}
          ${cut}
          ${product.color ? `<span class="tag">${escapeHtml(product.color)}</span>` : ""}
        </div>
        ${pricing}
      </div>
    </article>`;
}

function selectProductImage(button) {
  const visual = button.closest(".product-visual");
  const image = visual?.querySelector("figure img");
  if (!visual || !image) return;
  image.src = button.dataset.galleryImage;
  image.alt = button.dataset.galleryAlt || image.alt;
  const zoomButton = visual.querySelector("[data-zoom-image]");
  if (zoomButton) {
    zoomButton.dataset.zoomImage = button.dataset.galleryImage;
    zoomButton.dataset.zoomAlt = button.dataset.galleryAlt || image.alt;
  }
  visual.querySelectorAll("[data-gallery-image]").forEach((item) => item.classList.toggle("active", item === button));
}

function openImageLightbox(src, alt = "", caption = "") {
  if (!src) return;
  els.imageLightboxImage.src = src;
  els.imageLightboxImage.alt = alt;
  els.imageLightboxCaption.textContent = caption || alt;
  els.imageLightbox.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageLightbox() {
  els.imageLightbox.hidden = true;
  els.imageLightboxImage.removeAttribute("src");
  els.imageLightboxImage.alt = "";
  els.imageLightboxCaption.textContent = "";
  document.body.classList.remove("modal-open");
}

function renderCart() {
  const lines = cartLines();
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  els.cartCount.textContent = totalQuantity;
  els.cartEmpty.hidden = lines.length > 0;
  els.cartItems.innerHTML = lines.map(({ product, quantity }) => `
    <div class="cart-line">
      <div><strong>${quantity} x ${escapeHtml(product.kmCode)}</strong><span>${escapeHtml(product.name)}</span>
      <b>${money.format(product.finalPriceCents * quantity / 100)}</b></div>
      <button type="button" data-remove="${product.id}" aria-label="Quitar ${escapeHtml(product.kmCode)}">x</button>
    </div>`).join("");
  els.cartItems.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(Number(button.dataset.remove)));
  });

  const subtotal = lines.reduce((sum, line) => sum + line.product.finalPriceCents * line.quantity, 0);
  const vat = Math.round(subtotal * state.settings.vatBps / 10_000);
  els.cartTotals.hidden = lines.length === 0;
  els.cartSubtotal.textContent = money.format(subtotal / 100);
  els.cartVatLabel.textContent = `IVA ${formatPercent(state.settings.vatBps)}`;
  els.cartVat.textContent = money.format(vat / 100);
  els.cartTotal.textContent = money.format((subtotal + vat) / 100);
  els.goToOrder.classList.toggle("disabled", lines.length === 0 || !isApprovedCustomer());
}

function openAccount(preferRegister = false) {
  els.accountMessage.textContent = "";
  if (state.user) {
    els.accountTitle.textContent = "Mi cuenta";
    document.querySelector(".account-tabs").hidden = true;
    els.loginForm.hidden = true;
    els.registerForm.hidden = true;
    els.sessionPanel.hidden = false;
    els.sessionBusiness.textContent = state.user.businessName || state.user.email;
    els.sessionStatus.textContent = accountStatusText(state.user);
    document.querySelector("#adminPanelLink").hidden = state.user.role !== "admin";
  } else {
    document.querySelector(".account-tabs").hidden = false;
    els.sessionPanel.hidden = true;
    setAccountMode(preferRegister ? "register" : "login");
  }
  els.accountDialog.showModal();
}

function setAccountMode(mode) {
  const register = mode === "register";
  els.accountTitle.textContent = register ? "Solicitar alta" : "Ingresar";
  els.loginForm.hidden = register;
  els.registerForm.hidden = !register;
  els.showLogin.classList.toggle("active", !register);
  els.showRegister.classList.toggle("active", register);
  els.accountMessage.textContent = "";
}

async function submitLogin(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.loginForm));
  setFormBusy(els.loginForm, true);
  try {
    state.user = (await api("/api/auth/login", { method: "POST", body: values })).user;
    await loadProducts();
    await loadCustomerOrders();
    els.accountDialog.close();
    renderAll();
    showToast(`Bienvenido, ${state.user.businessName || state.user.email}.`);
  } catch (error) {
    els.accountMessage.textContent = error.message;
  } finally {
    setFormBusy(els.loginForm, false);
  }
}

async function submitRegistration(event) {
  event.preventDefault();
  const formData = new FormData(els.registerForm);
  const values = Object.fromEntries(formData);
  values.acceptTerms = formData.has("acceptTerms");
  values.acceptPrivacy = formData.has("acceptPrivacy");
  setFormBusy(els.registerForm, true);
  try {
    await api("/api/auth/register", { method: "POST", body: values });
    state.user = (await api("/api/auth/login", { method: "POST", body: { email: values.email, password: values.password } })).user;
    await loadProducts();
    await loadCustomerOrders();
    els.registerForm.reset();
    els.accountDialog.close();
    renderAll();
    showToast("Solicitud recibida. La cuenta quedo pendiente de aprobacion.");
  } catch (error) {
    els.accountMessage.textContent = error.message;
  } finally {
    setFormBusy(els.registerForm, false);
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.orders = [];
  clearCart();
  await loadProducts();
  els.accountDialog.close();
  renderAll();
  showToast("Sesion cerrada.");
}

async function submitOrder(event) {
  event.preventDefault();
  const lines = cartLines();
  if (!lines.length) return showToast("Agrega productos antes de confirmar el pedido.");
  const shipping = Object.fromEntries(new FormData(els.orderForm));
  setFormBusy(els.orderForm, true);
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: { items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })), shipping }
    });
    state.cart = {};
    saveCart();
    renderCart();
    renderOrderResult(result.order);
    await loadCustomerOrders();
    renderCustomerOrders();
    showToast(`Pedido ${result.order.orderNumber} confirmado.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    setFormBusy(els.orderForm, false);
  }
}

async function loadCustomerOrders() {
  if (!isApprovedCustomer()) {
    state.orders = [];
    return;
  }
  try {
    state.orders = (await api("/api/orders")).orders;
  } catch {
    state.orders = [];
  }
}

function renderOrderResult(order) {
  const whatsapp = state.settings.whatsappNumber
    ? `<a class="primary-link" target="_blank" rel="noreferrer" href="https://wa.me/${state.settings.whatsappNumber}?text=${encodeURIComponent(orderSummary(order))}">Enviar pedido por WhatsApp a KM</a>`
    : "";
  els.orderResult.hidden = false;
  els.orderResult.innerHTML = `
    <h3>Pedido ${escapeHtml(order.orderNumber)}</h3>
    <p>Pedido recibido. KM confirmara disponibilidad y te enviara el importe final para pago y despacho.</p>
    <dl>
      <div><dt>Subtotal neto</dt><dd>${money.format(order.subtotalNetCents / 100)}</dd></div>
      <div><dt>IVA ${formatPercent(order.vatBps)}</dt><dd>${money.format(order.vatCents / 100)}</dd></div>
      <div><dt>Total</dt><dd>${money.format(order.totalCents / 100)}</dd></div>
    </dl>
    <p>No realices el pago hasta recibir la confirmacion comercial de disponibilidad.</p>
    ${whatsapp ? `<p>Para agilizar la gestion, envia el resumen por WhatsApp.</p>` : ""}
    ${whatsapp}`;
}

function renderCustomerOrders() {
  const approved = isApprovedCustomer();
  els.customerOrders.hidden = !approved;
  if (!approved) {
    els.customerOrders.innerHTML = "";
    return;
  }
  const visibleOrders = state.orders.slice(0, 10);
  els.customerOrders.innerHTML = `
    <div class="section-title compact"><p class="eyebrow">Operacion</p><h3>Mis pedidos</h3></div>
    ${visibleOrders.length ? visibleOrders.map(renderCustomerOrder).join("") : `<p class="muted">Todavia no hay pedidos registrados.</p>`}
  `;
  els.customerOrders.querySelectorAll("[data-receipt-input]").forEach((input) => input.addEventListener("change", uploadReceipt));
}

function renderCustomerOrder(order) {
  const latestReceipt = order.paymentReceipts?.[0];
  const canUpload = ["availability_confirmed", "confirmed"].includes(order.status) && order.paymentStatus !== "paid";
  const bank = order.bank || {};
  const confirmedItems = order.items.filter((item) => item.confirmedQuantity > 0);
  const unavailableItems = order.items.filter((item) => item.lineStatus === "unavailable" || item.lineStatus === "cancelled");
  return `
    <article class="customer-order-card">
      <div class="customer-order-head">
        <div><strong>${escapeHtml(order.orderNumber)}</strong><span>${formatDate(order.createdAt)}</span></div>
        <div class="order-status-pills"><span>${escapeHtml(orderStatusText(order.status))}</span><span>${escapeHtml(paymentStatusText(order.paymentStatus))}</span></div>
      </div>
      <dl>
        <div><dt>Total confirmado</dt><dd>${money.format(order.totalCents / 100)}</dd></div>
        <div><dt>Alias</dt><dd>${escapeHtml(bank.alias || "-")}</dd></div>
        <div><dt>CBU</dt><dd>${escapeHtml(bank.cbu || "-")}</dd></div>
      </dl>
      <div class="customer-order-lines">
        <strong>Articulos confirmados</strong>
        ${confirmedItems.length ? confirmedItems.map((item) => `<span>${item.confirmedQuantity} x ${escapeHtml(item.kmCode)} - ${escapeHtml(item.productName)}</span>`).join("") : `<span>Pendiente de confirmacion comercial.</span>`}
        ${unavailableItems.length ? `<strong>No disponibles</strong>${unavailableItems.map((item) => `<span>${escapeHtml(item.kmCode)} - ${escapeHtml(item.productName)}${item.availabilityNote ? ` (${escapeHtml(item.availabilityNote)})` : ""}</span>`).join("")}` : ""}
      </div>
      ${order.fulfillment?.status && order.fulfillment.status !== "pending" ? `<p>Despacho: ${escapeHtml(customerFulfillmentText(order.fulfillment))}</p>` : ""}
      ${bank.instructions ? `<p>${escapeHtml(bank.instructions)}</p>` : ""}
      ${latestReceipt ? `<p>Comprobante: ${escapeHtml(latestReceipt.originalFilename)} (${escapeHtml(latestReceipt.status)})</p>` : ""}
      ${canUpload ? `<label class="receipt-upload"><span>Subir comprobante</span><input type="file" accept="application/pdf,image/jpeg,image/png" data-receipt-input="${order.id}" /></label>` : paymentHelperText(order)}
    </article>
  `;
}

function paymentHelperText(order) {
  if (order.paymentStatus === "paid") return `<p>Pago acreditado.</p>`;
  if (!["availability_confirmed", "confirmed"].includes(order.status)) return `<p>KM confirmara disponibilidad antes de habilitar el pago.</p>`;
  return "";
}

async function uploadReceipt(event) {
  const file = event.currentTarget.files?.[0];
  const orderId = Number(event.currentTarget.dataset.receiptInput);
  event.currentTarget.value = "";
  if (!file || !orderId) return;
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return showToast("Formato no permitido. Usa PDF, JPG o PNG.");
  if (file.size > 8 * 1024 * 1024) return showToast("El comprobante no puede superar 8 MB.");
  try {
    const dataBase64 = await fileToBase64(file);
    await api(`/api/orders/${orderId}/payment-receipts`, {
      method: "POST",
      body: { originalFilename: file.name, mimeType: file.type, dataBase64 }
    });
    showToast("Comprobante cargado. KM lo revisara.");
    await loadCustomerOrders();
    renderCustomerOrders();
  } catch (error) {
    showToast(error.message);
  }
}

function copyOrderSummary() {
  const text = cartSummary();
  if (!text) return showToast("Agrega productos para copiar el resumen.");
  navigator.clipboard.writeText(text).then(
    () => showToast("Resumen copiado."),
    () => showToast("No se pudo copiar automaticamente.")
  );
}

function cartSummary() {
  const lines = cartLines();
  if (!lines.length) return "";
  const subtotal = lines.reduce((sum, line) => sum + line.product.finalPriceCents * line.quantity, 0);
  const vat = Math.round(subtotal * state.settings.vatBps / 10_000);
  return ["Pedido KM Detail Line", `Web: ${SITE_URL}`, `Cliente: ${state.user?.businessName || ""}`, "",
    ...lines.map(({ product, quantity }) => `- ${quantity} x ${product.kmCode} | ${product.name} | ${money.format(product.finalPriceCents * quantity / 100)}`),
    "", `Subtotal neto: ${money.format(subtotal / 100)}`, `IVA ${formatPercent(state.settings.vatBps)}: ${money.format(vat / 100)}`,
    `Total: ${money.format((subtotal + vat) / 100)}`].join("\n");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
    reader.addEventListener("error", () => reject(new Error(`No se pudo leer ${file.name}.`)));
    reader.readAsDataURL(file);
  });
}

function customerFulfillmentText(fulfillment = {}) {
  return [
    fulfillment.status,
    fulfillment.method,
    fulfillment.carrier,
    fulfillment.tracking ? `Guia/remito: ${fulfillment.tracking}` : "",
    fulfillment.estimatedDate ? `Fecha estimada: ${fulfillment.estimatedDate}` : "",
    fulfillment.notes
  ].filter(Boolean).join(" | ");
}

function orderStatusText(status) {
  return ({
    order_created: "Recibido",
    availability_confirmed: "Disponibilidad confirmada",
    confirmed: "Confirmado",
    in_preparation: "En preparacion",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado"
  })[status] || status;
}

function paymentStatusText(status) {
  return ({
    pending_payment: "Pago pendiente",
    receipt_uploaded: "Comprobante cargado",
    paid: "Pagado",
    rejected: "Pago rechazado",
    refunded: "Reintegrado"
  })[status] || status;
}

function orderSummary(order) {
  return [`Pedido ${order.orderNumber}`, `Cliente: ${order.businessName}`, `Email: ${state.user?.email || ""}`, "",
    ...order.items.map((item) => `- ${item.quantity} x ${item.kmCode} | ${item.productName}`),
    "",
    `Subtotal neto: ${money.format(order.subtotalNetCents / 100)}`,
    `IVA ${formatPercent(order.vatBps)}: ${money.format(order.vatCents / 100)}`,
    `Total: ${money.format(order.totalCents / 100)}`,
    "",
    `Entrega: ${order.shipping.recipient} | ${order.shipping.address} | ${order.shipping.city}, ${order.shipping.province}`,
    order.shipping.preferredTransport ? `Transporte: ${order.shipping.preferredTransport}` : "",
    order.shipping.notes ? `Notas: ${order.shipping.notes}` : ""
  ].filter(Boolean).join("\n");
}

function addToCart(productId, quantity) {
  if (!isApprovedCustomer()) return openAccount(false);
  state.cart[productId] = (state.cart[productId] || 0) + Math.max(1, Math.floor(quantity));
  saveCart();
  renderCart();
  showToast("Producto agregado al pedido.");
}

function removeFromCart(productId) {
  delete state.cart[productId];
  saveCart();
  renderCart();
}

function clearCart() {
  state.cart = {};
  saveCart();
  renderCart();
}

function cartLines() {
  if (!isApprovedCustomer()) return [];
  return Object.entries(state.cart).map(([id, quantity]) => ({
    product: state.products.find((product) => product.id === Number(id)),
    quantity: Number(quantity)
  })).filter((line) => line.product && line.quantity > 0);
}

function pruneCart() {
  const ids = new Set(state.products.map((product) => product.id));
  state.cart = Object.fromEntries(Object.entries(state.cart).filter(([id, quantity]) => ids.has(Number(id)) && Number(quantity) > 0));
  saveCart();
}

function clearFilters() {
  Object.assign(state, { category: "Todos", search: "", cut: "", size: "", sort: "featured" });
  els.searchInput.value = "";
  els.cutFilter.value = "";
  els.sizeFilter.value = "";
  els.sortSelect.value = "featured";
  renderCategoryFilters();
  renderProducts();
}

function sortProducts(products) {
  const sorted = [...products];
  if (state.sort === "code") sorted.sort((a, b) => a.kmCode.localeCompare(b.kmCode));
  if (state.sort === "cut-desc") sorted.sort((a, b) => Number(b.cutLevel || 0) - Number(a.cutLevel || 0));
  if (state.sort === "cut-asc") sorted.sort((a, b) => Number(a.cutLevel || 0) - Number(b.cutLevel || 0));
  return sorted;
}

async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operacion.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setFormBusy(form, busy) {
  form.querySelectorAll("button, input, select, textarea").forEach((control) => { control.disabled = busy; });
}

function isApprovedCustomer() {
  return state.user?.role === "customer" && state.user.approvalStatus === "approved";
}

function accountStatusText(user) {
  if (user.role === "admin") return "Administrador";
  const labels = { pending: "Pendiente de aprobacion", approved: "Cliente aprobado", rejected: "Solicitud rechazada", suspended: "Cuenta suspendida", inactive: "Cuenta inactiva" };
  return labels[user.approvalStatus] || user.approvalStatus;
}

function discountText(discounts = []) {
  const active = discounts.filter(Boolean).map(formatPercent);
  return active.length ? `Descuentos en cascada: ${active.join(" · ")}.` : "Sin descuentos.";
}

function formatPercent(bps) {
  return `${Number(bps) / 100}%`;
}

function tagClass(product) {
  const text = `${product.family.name} ${product.material}`.toLowerCase();
  if (text.includes("poliespuma")) return "poliespuma";
  if (text.includes("lana")) return "lana";
  if (text.includes("taco")) return "tacos";
  return "accesorios";
}

function openCart() {
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function readCart() {
  try { return JSON.parse(localStorage.getItem("kmCartV2") || "{}"); } catch { return {}; }
}

function saveCart() {
  localStorage.setItem("kmCartV2", JSON.stringify(state.cart));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

init();
