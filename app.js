const SITE_URL = "https://km-detail.com";
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const catalogPages = [
  "1_DETAIL-LINE.png",
  "2_INDICE.png",
  "3_KM-DETAIL-LINE-Presentacion.png",
  "4_SISTEMA-DE-PULIDO-KM.png",
  "5_GUIA-DE-NIVEL-DE-CORTE-KM.png",
  "6_SISTEMA-DE-PANOS-HIBRIDOS-KM.png",
  "7_PANOS-HIBRIDOS-PRODUCTOS-75-IN.png",
  "8_LINEA-PA-100percent-LANA-CON-BACKING-INTEGRADO.png",
  "9_LINEA-PA-PRODUCTOS.png",
  "10_LANA-PRELAVADA-Y-PEINADA-KM.png",
  "11_LANA-PRELAVADA-Y-PEINADA-PRODUCTOS.png",
  "12_SISTEMA-DE-POLIESPUMAS-KM.png",
  "13_POLIESPUMAS-CON-BACKING-ROSCA-14-x-2-mm.png",
  "14_POLIESPUMAS-CON-VELCRO-SIN-BACKING.png",
  "15_POLIESPUMAS-PARA-ROTO-ORBITALES.png",
  "16_PADS-100percent-LANA-CON-RESPALDO-DE-POLIESPUMA.png",
  "17_INTERFACES-DE-ESPUMA-CON-VELCRO-KM.png",
  "18_INTERFACES-DE-ESPUMA-PRODUCTOS.png",
  "19_SISTEMA-DE-BACKINGS-KM.png",
  "20_BACKINGS-KM-PRODUCTOS.png",
  "21_APLICADORES-DE-CERA-Y-LIMPIEZA-KM.png",
  "22_APLICADORES-PRODUCTOS.png",
  "23_SISTEMA-DE-TACOS-DE-LIJADO-KM.png",
  "24_TACOS-DE-LIJADO-PRODUCTOS.png",
  "25_CATALOGO-DE-PRODUCTOS-2026.png"
];

const routeSections = new Map([
  ["/empresa", "empresa"],
  ["/productos", "catalogo"],
  ["/catalogo-2026", "catalogo-pdf"],
  ["/distribuidores", "distribuidores"],
  ["/contacto", "contacto"]
]);

const state = {
  products: [],
  user: null,
  orders: [],
  shippingAddresses: [],
  selectedShippingAddressId: null,
  shippingAddressConfigOpen: false,
  purchaseFilter: "all",
  purchaseVisibleCount: 10,
  settings: { vatBps: 2100, whatsappNumber: "" },
  category: "Todos",
  search: "",
  cut: "",
  size: "",
  sort: "featured",
  catalogPage: 0,
  cart: readCart()
};

const els = Object.fromEntries([
  "categoryFilters", "cutFilter", "sizeFilter", "searchInput", "sortSelect", "productGrid",
  "resultCount", "catalogNotice", "cartCount", "cartDrawer", "cartItems",
  "cartEmpty", "cartSummaryText", "cartTotals", "cartSubtotal", "cartVatLabel", "cartVat", "cartTotal",
  "goToOrder", "toast", "orderAccess", "orderForm", "orderResult", "customerOrders", "openAccount",
  "navPurchases", "topNav", "mobileMenuToggle",
  "activeShippingAddress", "configureShippingAddresses", "shippingAddressManager",
  "shippingAddressList", "shippingAddressForm", "shippingAddressFormTitle", "shippingAddressMessage",
  "accountDialog", "accountTitle", "loginForm", "registerForm", "accountMessage",
  "showLogin", "showRegister", "sessionPanel", "sessionBusiness", "sessionStatus",
  "imageLightbox", "imageLightboxImage", "imageLightboxCaption", "closeImageLightbox", "closeImageLightboxBackdrop",
  "catalogPrev", "catalogNext", "catalogPageLabel", "catalogPageImage", "catalogThumbs"
].map((id) => [id, document.querySelector(`#${id}`)]));

async function init() {
  normalizeInitialRoute();
  bindEvents();
  await Promise.all([loadSession(), loadSettings()]);
  await loadProducts();
  if (isApprovedCustomer()) await Promise.all([loadCustomerOrders(), loadShippingAddresses()]);
  renderAll();
  await handleHashNavigation();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function normalizeInitialRoute() {
  const section = routeSections.get(window.location.pathname);
  if (section && !window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}#${section}`);
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
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href='#mis-compras']");
    if (link) openPurchases(event);
  });
  els.mobileMenuToggle?.addEventListener("click", toggleMobileMenu);
  els.topNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMobileMenu(false));
  });
  window.addEventListener("hashchange", () => {
    handleHashNavigation().catch((error) => showToast(error.message || "No se pudo abrir la seccion."));
  });
  document.querySelector("#configureShippingAddresses").addEventListener("click", toggleShippingAddressManager);
  document.querySelector("#newShippingAddress").addEventListener("click", () => openShippingAddressForm());
  document.querySelector("#editShippingAddress").addEventListener("click", editSelectedShippingAddress);
  document.querySelector("#defaultShippingAddress").addEventListener("click", setSelectedShippingDefault);
  document.querySelector("#deleteShippingAddress").addEventListener("click", deleteSelectedShippingAddress);
  document.querySelector("#cancelShippingAddress").addEventListener("click", closeShippingAddressForm);
  els.shippingAddressForm.addEventListener("submit", saveShippingAddress);
  els.catalogPrev?.addEventListener("click", () => setCatalogPage(state.catalogPage - 1));
  els.catalogNext?.addEventListener("click", () => setCatalogPage(state.catalogPage + 1));

  [els.openAccount, document.querySelector("#openAccountHero"), document.querySelector("#orderLogin")]
    .filter(Boolean)
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
  renderAccountState();
  renderShippingAddresses();
  renderCategoryFilters();
  renderSelectOptions();
  renderCatalogBook();
  renderProducts();
  renderCart();
  renderCustomerOrders();
}

function renderCatalogBook() {
  if (!els.catalogThumbs) return;
  els.catalogThumbs.innerHTML = catalogPages.map((page, index) => `
    <button class="${index === state.catalogPage ? "active" : ""}" type="button" data-catalog-page="${index}" aria-label="Ver pagina ${index + 1}">
      <img src="${catalogPageUrl(page)}" alt="" loading="lazy" />
      <span>${index + 1}</span>
    </button>
  `).join("");
  els.catalogThumbs.querySelectorAll("[data-catalog-page]").forEach((button) => {
    button.addEventListener("click", () => setCatalogPage(Number(button.dataset.catalogPage)));
  });
  updateCatalogBook();
}

function setCatalogPage(index) {
  state.catalogPage = Math.min(Math.max(index, 0), catalogPages.length - 1);
  updateCatalogBook();
}

function updateCatalogBook() {
  const page = catalogPages[state.catalogPage];
  if (!page || !els.catalogPageImage) return;
  els.catalogPageImage.src = catalogPageUrl(page);
  els.catalogPageImage.alt = `Pagina ${state.catalogPage + 1} del catalogo KM Detail Line 2026`;
  els.catalogPageLabel.textContent = `Pagina ${state.catalogPage + 1} de ${catalogPages.length}`;
  els.catalogPrev.disabled = state.catalogPage === 0;
  els.catalogNext.disabled = state.catalogPage === catalogPages.length - 1;
  els.catalogThumbs.querySelectorAll("[data-catalog-page]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.catalogPage) === state.catalogPage);
  });
}

function catalogPageUrl(page) {
  return `./assets/catalogo-2026/${page}`;
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
  if (els.navPurchases) els.navPurchases.hidden = !approved;
  document.querySelectorAll("[data-nav-audience='public']").forEach((link) => {
    link.hidden = approved;
  });
  document.querySelectorAll("[data-nav-audience='operational']").forEach((link) => {
    link.hidden = link.id === "navPurchases" ? !approved : false;
  });
  document.querySelectorAll(".public-section").forEach((section) => {
    section.hidden = approved;
  });
  if (approved && isPublicHash(window.location.hash)) {
    history.replaceState(null, "", "#catalogo");
  }
}

function isPublicHash(hash) {
  return !hash || ["#inicio", "#empresa", "#contacto"].includes(hash);
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
  const productUrl = product.publicUrl || `/producto/${encodeURIComponent(product.slug || product.kmCode.toLowerCase())}`;
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
        <h3><a class="product-title-link" href="${escapeHtml(productUrl)}">${escapeHtml(product.name)}</a></h3>
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
  els.cartSummaryText.textContent = lines.length
    ? `${lines.length} referencias | ${totalQuantity} unidades`
    : "Sin productos cargados";
  els.cartEmpty.hidden = lines.length > 0;
  els.cartItems.innerHTML = lines.map(({ product, quantity }) => `
    <div class="cart-line">
      <div class="cart-line-main">
        <span class="product-code">${escapeHtml(product.kmCode)}</span>
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.family.name)}${product.measure ? ` | ${escapeHtml(product.measure)}` : ""}${product.ean13 ? ` | EAN ${escapeHtml(product.ean13)}` : ""}</span>
      </div>
      <div class="cart-line-controls">
        <div class="qty-control cart-qty">
          <button type="button" data-cart-step="-1" data-product-id="${product.id}" aria-label="Restar ${escapeHtml(product.kmCode)}">-</button>
          <input data-cart-qty="${product.id}" value="${quantity}" inputmode="numeric" aria-label="Cantidad en carrito para ${escapeHtml(product.kmCode)}" />
          <button type="button" data-cart-step="1" data-product-id="${product.id}" aria-label="Sumar ${escapeHtml(product.kmCode)}">+</button>
        </div>
        <div class="cart-line-price">
          <span>${money.format(product.finalPriceCents / 100)} c/u</span>
          <b>${money.format(product.finalPriceCents * quantity / 100)}</b>
        </div>
        <button class="cart-remove" type="button" data-remove="${product.id}" aria-label="Quitar ${escapeHtml(product.kmCode)}">Quitar</button>
      </div>
    </div>`).join("");
  els.cartItems.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(Number(button.dataset.remove)));
  });
  els.cartItems.querySelectorAll("[data-cart-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.productId);
      updateCartQuantity(productId, (state.cart[productId] || 0) + Number(button.dataset.cartStep));
    });
  });
  els.cartItems.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", () => updateCartQuantity(Number(input.dataset.cartQty), input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        updateCartQuantity(Number(input.dataset.cartQty), input.value);
      }
    });
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
    await Promise.all([loadCustomerOrders(), loadShippingAddresses()]);
    els.accountDialog.close();
    renderAll();
    if (isApprovedCustomer()) {
      history.replaceState(null, "", "#catalogo");
      document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
      await handleHashNavigation();
    }
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
    await Promise.all([loadCustomerOrders(), loadShippingAddresses()]);
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
  state.shippingAddresses = [];
  state.selectedShippingAddressId = null;
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
  if (!state.selectedShippingAddressId) return showToast("Selecciona o carga un lugar de recepcion.");
  setFormBusy(els.orderForm, true);
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: {
        items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        shippingAddressId: state.selectedShippingAddressId
      }
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

async function loadShippingAddresses() {
  if (!isApprovedCustomer()) {
    state.shippingAddresses = [];
    state.selectedShippingAddressId = null;
    return;
  }
  try {
    state.shippingAddresses = (await api("/api/shipping-addresses")).addresses;
    const preferred = state.shippingAddresses.find((address) => address.isDefault) || state.shippingAddresses[0];
    if (!state.shippingAddresses.some((address) => address.id === state.selectedShippingAddressId)) {
      state.selectedShippingAddressId = preferred?.id || null;
    }
  } catch (error) {
    state.shippingAddresses = [];
    state.selectedShippingAddressId = null;
    showToast(error.message);
  }
}

function renderShippingAddresses() {
  if (!els.shippingAddressList) return;
  if (!isApprovedCustomer()) {
    els.activeShippingAddress.innerHTML = "";
    els.shippingAddressList.innerHTML = "";
    els.shippingAddressManager.hidden = true;
    els.shippingAddressForm.hidden = true;
    return;
  }
  const selected = selectedShippingAddress();
  if (!state.shippingAddresses.length) state.shippingAddressConfigOpen = true;
  els.activeShippingAddress.innerHTML = selected ? `
    <div class="shipping-address-card active">
      <span>
        <strong>${escapeHtml(selected.label)}${selected.isDefault ? ` <em>Preferida</em>` : ""}</strong>
        <small>${escapeHtml(selected.recipient)} | ${escapeHtml(selected.address)} | ${escapeHtml(selected.city)}, ${escapeHtml(selected.province)} | CP ${escapeHtml(selected.postalCode)}</small>
        <small>Tel: ${escapeHtml(selected.contactPhone)}${selected.preferredTransport ? ` | Transporte: ${escapeHtml(selected.preferredTransport)}` : ""}</small>
      </span>
    </div>
  ` : `<p class="muted">Todavia no hay lugares de recepcion cargados.</p>`;
  els.configureShippingAddresses.textContent = state.shippingAddressConfigOpen ? "Cerrar configuracion" : (selected ? "Configurar entrega" : "Agregar lugar de entrega");
  els.shippingAddressManager.hidden = !state.shippingAddressConfigOpen;
  els.shippingAddressList.innerHTML = state.shippingAddresses.length ? state.shippingAddresses.map((address) => `
    <label class="shipping-address-card ${address.id === state.selectedShippingAddressId ? "selected" : ""}">
      <input type="radio" name="shippingAddressId" value="${address.id}" ${address.id === state.selectedShippingAddressId ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(address.label)}${address.isDefault ? ` <em>Preferida</em>` : ""}</strong>
        <small>${escapeHtml(address.recipient)} | ${escapeHtml(address.address)} | ${escapeHtml(address.city)}, ${escapeHtml(address.province)} | CP ${escapeHtml(address.postalCode)}</small>
        <small>Tel: ${escapeHtml(address.contactPhone)}${address.preferredTransport ? ` | Transporte: ${escapeHtml(address.preferredTransport)}` : ""}</small>
      </span>
    </label>
  `).join("") : `<p class="muted">Todavia no hay lugares de recepcion cargados.</p>`;
  els.shippingAddressList.querySelectorAll("[name='shippingAddressId']").forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedShippingAddressId = Number(input.value);
      renderShippingAddresses();
    });
  });
}

function toggleShippingAddressManager() {
  state.shippingAddressConfigOpen = !state.shippingAddressConfigOpen;
  if (!state.shippingAddressConfigOpen) closeShippingAddressForm();
  renderShippingAddresses();
  if (state.shippingAddressConfigOpen && !state.shippingAddresses.length) openShippingAddressForm();
}

function openShippingAddressForm(address = null) {
  state.shippingAddressConfigOpen = true;
  els.shippingAddressManager.hidden = false;
  els.shippingAddressForm.hidden = false;
  els.shippingAddressForm.reset();
  els.shippingAddressMessage.textContent = "";
  els.shippingAddressFormTitle.textContent = address ? "Editar lugar de recepcion" : "Nuevo lugar de recepcion";
  const fields = els.shippingAddressForm.elements;
  fields.id.value = address?.id || "";
  fields.label.value = address?.label || "";
  fields.recipient.value = address?.recipient || state.user?.businessName || "";
  fields.contactPhone.value = address?.contactPhone || "";
  fields.address.value = address?.address || "";
  fields.city.value = address?.city || "";
  fields.province.value = address?.province || "";
  fields.postalCode.value = address?.postalCode || "";
  fields.preferredTransport.value = address?.preferredTransport || "";
  fields.notes.value = address?.notes || "";
  fields.isDefault.checked = Boolean(address?.isDefault || !state.shippingAddresses.length);
  els.shippingAddressForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function editSelectedShippingAddress() {
  const address = selectedShippingAddress();
  if (!address) return showToast("Selecciona un lugar de recepcion.");
  openShippingAddressForm(address);
}

function closeShippingAddressForm() {
  els.shippingAddressForm.hidden = true;
  els.shippingAddressMessage.textContent = "";
}

async function saveShippingAddress(event) {
  event.preventDefault();
  const formData = new FormData(els.shippingAddressForm);
  const values = Object.fromEntries(formData);
  values.isDefault = formData.has("isDefault");
  const id = Number(values.id || 0);
  delete values.id;
  setFormBusy(els.shippingAddressForm, true);
  try {
    const result = await api(id ? `/api/shipping-addresses/${id}` : "/api/shipping-addresses", {
      method: id ? "PUT" : "POST",
      body: values
    });
    state.selectedShippingAddressId = result.address.id;
    await loadShippingAddresses();
    state.shippingAddressConfigOpen = false;
    renderShippingAddresses();
    closeShippingAddressForm();
    showToast("Lugar de recepcion guardado.");
  } catch (error) {
    els.shippingAddressMessage.textContent = error.message;
  } finally {
    setFormBusy(els.shippingAddressForm, false);
  }
}

async function setSelectedShippingDefault() {
  const address = selectedShippingAddress();
  if (!address) return showToast("Selecciona un lugar de recepcion.");
  try {
    await api(`/api/shipping-addresses/${address.id}/default`, { method: "POST" });
    await loadShippingAddresses();
    state.selectedShippingAddressId = address.id;
    renderShippingAddresses();
    showToast("Direccion preferida actualizada.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteSelectedShippingAddress() {
  const address = selectedShippingAddress();
  if (!address) return showToast("Selecciona un lugar de recepcion.");
  if (state.shippingAddresses.length <= 1) return showToast("Debe quedar al menos un lugar de recepcion.");
  if (!confirm(`Eliminar ${address.label}?`)) return;
  try {
    await api(`/api/shipping-addresses/${address.id}`, { method: "DELETE" });
    await loadShippingAddresses();
    renderShippingAddresses();
    showToast("Lugar eliminado.");
  } catch (error) {
    showToast(error.message);
  }
}

function selectedShippingAddress() {
  return state.shippingAddresses.find((address) => address.id === state.selectedShippingAddressId) || null;
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
    <div class="result-actions">
      ${whatsapp}
      <a class="secondary-link" href="#mis-compras">Ver mis compras</a>
    </div>`;
}

function renderCustomerOrders() {
  const approved = isApprovedCustomer();
  els.customerOrders.hidden = !approved;
  if (!approved) {
    els.customerOrders.innerHTML = "";
    return;
  }
  const metrics = purchaseMetrics(state.orders);
  const filteredOrders = filterPurchases(state.orders);
  const visibleOrders = filteredOrders.slice(0, state.purchaseVisibleCount);
  const orderCards = visibleOrders.map(renderCustomerOrder).join("");
  const remainingOrders = Math.max(0, filteredOrders.length - visibleOrders.length);
  els.customerOrders.innerHTML = `
    <div class="purchases-header">
      <div class="section-title compact">
        <p class="eyebrow">Cuenta comercial</p>
        <h2>Mis compras</h2>
        <p>Historial de pedidos, disponibilidad, pagos y despacho.</p>
      </div>
      <label class="purchase-filter">
        <span>Ver</span>
        <select id="purchaseStatusFilter">
          <option value="all" ${state.purchaseFilter === "all" ? "selected" : ""}>Todas las compras</option>
          <option value="active" ${state.purchaseFilter === "active" ? "selected" : ""}>En curso</option>
          <option value="pay" ${state.purchaseFilter === "pay" ? "selected" : ""}>Para pagar</option>
          <option value="shipment" ${state.purchaseFilter === "shipment" ? "selected" : ""}>Despacho</option>
          <option value="closed" ${state.purchaseFilter === "closed" ? "selected" : ""}>Finalizadas</option>
        </select>
      </label>
    </div>
    <div class="purchase-metrics" aria-label="Resumen de compras">
      <article><strong>${metrics.total}</strong><span>compras</span></article>
      <article><strong>${metrics.active}</strong><span>en curso</span></article>
      <article><strong>${metrics.toPay}</strong><span>para pagar</span></article>
      <article><strong>${metrics.shipments}</strong><span>en despacho</span></article>
    </div>
    <div class="purchase-list">
      ${filteredOrders.length ? orderCards : `<article class="empty-purchases"><strong>Sin compras para este filtro</strong><span>Cambia el filtro o arma un pedido desde Productos.</span></article>`}
    </div>
    ${remainingOrders ? `<button class="secondary-link purchase-more" type="button" id="loadMorePurchases">Ver ${Math.min(10, remainingOrders)} compras mas</button>` : ""}
  `;
  els.customerOrders.querySelector("#purchaseStatusFilter")?.addEventListener("change", (event) => {
    state.purchaseFilter = event.currentTarget.value;
    state.purchaseVisibleCount = 10;
    renderCustomerOrders();
  });
  els.customerOrders.querySelector("#loadMorePurchases")?.addEventListener("click", () => {
    state.purchaseVisibleCount += 10;
    renderCustomerOrders();
  });
  els.customerOrders.querySelectorAll("[data-receipt-input]").forEach((input) => input.addEventListener("change", uploadReceipt));
  els.customerOrders.querySelectorAll("[data-accept-order]").forEach((button) => {
    button.addEventListener("click", () => acceptOrder(Number(button.dataset.acceptOrder)));
  });
}

function renderCustomerOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const fulfillment = order.fulfillment || {};
  const shipping = order.shipping || {};
  const latestReceipt = order.paymentReceipts?.[0];
  const needsAcceptance = order.modifiedAcceptanceRequired && ["availability_confirmed", "confirmed"].includes(order.status);
  const canUpload = ["availability_confirmed", "confirmed"].includes(order.status) && order.paymentStatus !== "paid" && !needsAcceptance && (order.balanceCents || order.totalCents) > 0;
  const bank = order.bank || {};
  const visibleItems = items.filter((item) => order.status === "order_created" || item.confirmedQuantity > 0).slice(0, 5);
  const unavailableItems = items.filter((item) => item.lineStatus === "unavailable" || item.lineStatus === "cancelled");
  const statusClass = purchaseStatusClass(order);
  const itemCount = items.reduce((sum, item) => sum + (Number(item.confirmedQuantity) > 0 ? Number(item.confirmedQuantity) : Number(item.quantity || 0)), 0);
  return `
    <article class="customer-order-card ${statusClass}">
      <details class="purchase-detail">
        <summary class="customer-order-summary">
          <div class="purchase-summary-main">
            <strong>${escapeHtml(order.orderNumber)}</strong>
            <span>${formatDate(order.createdAt)} | ${itemCount} unidad${itemCount === 1 ? "" : "es"}</span>
          </div>
          <div class="order-status-pills">
            <span class="${statusClass}">${escapeHtml(orderStatusText(order.status))}</span>
            <span class="${paymentStatusClass(order.paymentStatus)}">${escapeHtml(paymentStatusText(order.paymentStatus))}</span>
            <span class="${fulfillmentStatusClass(fulfillment.status)}">${escapeHtml(fulfillmentStatusText(fulfillment.status))}</span>
          </div>
          <div class="purchase-summary-total">
            <strong>${money.format(order.totalCents / 100)}</strong>
            <b class="purchase-toggle"><span class="toggle-closed">Ver detalle</span><span class="toggle-open">Cerrar detalle</span></b>
          </div>
        </summary>
        <div class="purchase-detail-body">
          ${renderPurchaseTimeline(order)}
          <div class="purchase-card-grid">
            <dl>
              <div><dt>Total</dt><dd>${money.format(order.totalCents / 100)}</dd></div>
              <div><dt>Pagado</dt><dd>${money.format((order.paidCents || 0) / 100)}</dd></div>
              <div><dt>Saldo</dt><dd>${money.format((order.balanceCents || 0) / 100)}</dd></div>
              ${order.paymentDueDate ? `<div><dt>Vencimiento</dt><dd>${formatShortDate(order.paymentDueDate)}</dd></div>` : ""}
              <div><dt>Subtotal neto</dt><dd>${money.format(order.subtotalNetCents / 100)}</dd></div>
              <div><dt>IVA ${formatPercent(order.vatBps)}</dt><dd>${money.format(order.vatCents / 100)}</dd></div>
            </dl>
            <div class="purchase-shipping">
              <strong>Entrega</strong>
              <span>${escapeHtml(shipping.recipient || "-")}</span>
              <span>${escapeHtml(shipping.address || "-")}</span>
              <span>${escapeHtml([shipping.city, shipping.province].filter(Boolean).join(", "))}</span>
            </div>
          </div>
          <div class="customer-order-lines">
            <strong>${order.status === "order_created" ? "Articulos solicitados" : "Articulos confirmados"}</strong>
            ${visibleItems.length ? visibleItems.map(renderPurchaseLine).join("") : `<span>Pendiente de confirmacion comercial.</span>`}
            ${items.length > visibleItems.length ? `<span>+ ${items.length - visibleItems.length} articulo${items.length - visibleItems.length === 1 ? "" : "s"} mas</span>` : ""}
            ${unavailableItems.length ? `<strong>No disponibles</strong>${unavailableItems.map((item) => `<span>${escapeHtml(item.kmCode)} - ${escapeHtml(item.productName)}${item.availabilityNote ? ` (${escapeHtml(item.availabilityNote)})` : ""}</span>`).join("")}` : ""}
          </div>
          <div class="purchase-actions">
            ${needsAcceptance ? `<button class="primary-button" type="button" data-accept-order="${order.id}">Aceptar disponibilidad</button>` : ""}
            ${canUpload ? `<label class="receipt-upload"><span>Subir comprobante</span><input type="file" accept="application/pdf,image/jpeg,image/png" data-receipt-input="${order.id}" /></label>` : paymentHelperText(order)}
            ${latestReceipt ? `<p>Comprobante: ${escapeHtml(latestReceipt.originalFilename)} (${escapeHtml(receiptStatusText(latestReceipt.status))})</p>` : ""}
          </div>
          ${canUpload ? renderBankSummary(bank) : ""}
          ${fulfillment.status && fulfillment.status !== "pending" ? `<p class="purchase-note">Despacho: ${escapeHtml(customerFulfillmentText(fulfillment))}</p>` : ""}
        </div>
      </details>
    </article>
  `;
}

function renderPurchaseLine(item) {
  const quantity = item.confirmedQuantity > 0 ? item.confirmedQuantity : item.quantity;
  const suffix = item.confirmedQuantity > 0 && item.confirmedQuantity !== item.quantity ? ` de ${item.quantity}` : "";
  return `<span>${quantity}${suffix} x ${escapeHtml(item.kmCode)} - ${escapeHtml(item.productName)}</span>`;
}

function renderBankSummary(bank = {}) {
  return `
    <div class="purchase-bank">
      <strong>Datos para transferencia</strong>
      <span>Alias: ${escapeHtml(bank.alias || "-")}</span>
      <span>CBU: ${escapeHtml(bank.cbu || "-")}</span>
      ${bank.instructions ? `<small>${escapeHtml(bank.instructions)}</small>` : ""}
    </div>
  `;
}

function renderPurchaseTimeline(order) {
  const steps = [
    { key: "received", label: "Pedido recibido", done: true },
    { key: "availability", label: "Disponibilidad", done: ["availability_confirmed", "confirmed", "in_preparation", "ready", "delivered"].includes(order.status) },
    { key: "payment", label: "Pago", done: ["paid", "partial_payment", "credit_account"].includes(order.paymentStatus) },
    { key: "shipment", label: "Despacho", done: ["shipped", "delivered"].includes(order.fulfillment?.status) }
  ];
  return `<ol class="purchase-timeline">${steps.map((step) => `<li class="${step.done ? "done" : ""}"><span></span>${step.label}</li>`).join("")}</ol>`;
}

function purchaseMetrics(orders) {
  return {
    total: orders.length,
    active: orders.filter((order) => purchaseGroup(order) === "active").length,
    toPay: orders.filter((order) => purchaseGroup(order) === "pay").length,
    shipments: orders.filter((order) => purchaseGroup(order) === "shipment").length
  };
}

function filterPurchases(orders) {
  if (state.purchaseFilter === "all") return orders;
  return orders.filter((order) => purchaseGroup(order) === state.purchaseFilter);
}

function purchaseGroup(order) {
  if (["delivered", "cancelled"].includes(order.status) || order.fulfillment?.status === "delivered") return "closed";
  if (["shipped", "ready"].includes(order.fulfillment?.status)) return "shipment";
  if (order.paymentStatus === "overdue") return "pay";
  if (["availability_confirmed", "confirmed"].includes(order.status) && !["paid", "credit_account"].includes(order.paymentStatus)) return "pay";
  return "active";
}

function paymentHelperText(order) {
  if (order.paymentStatus === "paid") return `<p>Pago acreditado.</p>`;
  if (order.paymentStatus === "credit_account") return `<p>Pedido autorizado en cuenta corriente${order.paymentDueDate ? ` con vencimiento ${formatShortDate(order.paymentDueDate)}` : ""}.</p>`;
  if (order.paymentStatus === "partial_payment") return `<p>Pago parcial acreditado. Saldo pendiente: ${money.format((order.balanceCents || 0) / 100)}${order.paymentDueDate ? `, vence ${formatShortDate(order.paymentDueDate)}` : ""}.</p>`;
  if (order.paymentStatus === "overdue") return `<p>Saldo vencido: ${money.format((order.balanceCents || 0) / 100)}.</p>`;
  if (order.modifiedAcceptanceRequired) return `<p>Revisa y acepta la disponibilidad confirmada para continuar.</p>`;
  if (!["availability_confirmed", "confirmed"].includes(order.status)) return `<p>KM confirmara disponibilidad antes de habilitar el pago.</p>`;
  return "";
}

async function openPurchases(event) {
  event?.preventDefault?.();
  if (!isApprovedCustomer()) return openAccount(false);
  try {
    await loadCustomerOrders();
    renderCustomerOrders();
  } catch (error) {
    els.customerOrders.hidden = false;
    els.customerOrders.innerHTML = `
      <div class="purchases-header">
        <div class="section-title compact">
          <p class="eyebrow">Cuenta comercial</p>
          <h2>Mis compras</h2>
          <p>No pudimos cargar el historial en este momento. Volve a intentar en unos segundos.</p>
        </div>
      </div>
    `;
    showToast(error.message || "No se pudo abrir Mis compras.");
  }
  setMobileMenu(false);
  history.replaceState(null, "", "#mis-compras");
  requestAnimationFrame(() => els.customerOrders.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function handleHashNavigation() {
  if (window.location.hash !== "#mis-compras") return;
  await openPurchases();
}

function toggleMobileMenu() {
  setMobileMenu(!els.topNav.classList.contains("open"));
}

function setMobileMenu(open) {
  els.topNav?.classList.toggle("open", open);
  els.mobileMenuToggle?.setAttribute("aria-expanded", open ? "true" : "false");
}

async function acceptOrder(orderId) {
  try {
    await api(`/api/orders/${orderId}/accept`, { method: "POST" });
    await loadCustomerOrders();
    renderCustomerOrders();
    showToast("Disponibilidad aceptada. Ya podes continuar con el pago.");
  } catch (error) {
    showToast(error.message);
  }
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
    fulfillmentStatusText(fulfillment.status),
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

function purchaseStatusClass(order) {
  if (order.status === "cancelled") return "status-danger";
  if (["availability_confirmed", "confirmed"].includes(order.status)) return "status-info";
  if (["in_preparation", "ready"].includes(order.status)) return "status-warn";
  if (order.status === "delivered") return "status-success";
  return "status-neutral";
}

function paymentStatusText(status) {
  return ({
    pending_payment: "Pago pendiente",
    receipt_uploaded: "Comprobante cargado",
    partial_payment: "Pago parcial",
    credit_account: "Cuenta corriente",
    overdue: "Vencido",
    paid: "Pagado",
    rejected: "Pago rechazado",
    refunded: "Reintegrado"
  })[status] || status;
}

function paymentStatusClass(status) {
  return ({
    pending_payment: "status-warn",
    receipt_uploaded: "status-info",
    partial_payment: "status-warn",
    credit_account: "status-info",
    overdue: "status-danger",
    paid: "status-success",
    rejected: "status-danger",
    refunded: "status-neutral"
  })[status] || "status-neutral";
}

function fulfillmentStatusText(status) {
  return ({
    pending: "Despacho pendiente",
    ready: "Listo para despacho",
    shipped: "Despachado",
    delivered: "Entregado"
  })[status] || status || "";
}

function fulfillmentStatusClass(status) {
  return ({
    pending: "status-neutral",
    ready: "status-warn",
    shipped: "status-info",
    delivered: "status-success"
  })[status] || "status-neutral";
}

function receiptStatusText(status) {
  return ({
    received: "recibido",
    accepted: "aceptado",
    rejected: "rechazado"
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

function updateCartQuantity(productId, quantity) {
  const normalized = Math.floor(Number(quantity));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    removeFromCart(productId);
    return;
  }
  state.cart[productId] = Math.min(normalized, 9999);
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

function formatDate(value) {
  if (!value) return "";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(normalized));
}

function formatShortDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
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
