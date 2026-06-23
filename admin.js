const adminState = {
  user: null, customers: [], products: [], families: [], selectedProductId: null, productImages: [],
  orders: [], selectedOrder: null, settings: null, emails: [], emailSummary: null, emailEnabled: false, emailProvider: ""
};
const adminMoney = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const adminViews = new Set(["customers", "products", "orders", "settings", "emails"]);
const statusLabels = {
  pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado",
  suspended: "Suspendido", inactive: "Inactivo"
};

const adminEls = Object.fromEntries([
  "adminSession", "adminEmail", "adminLoginPanel", "adminLoginForm", "adminLoginMessage",
  "adminWorkspace", "customerSearch", "customerStatusFilter", "customerStats", "customerList", "ordersTableBody",
  "orderSearch", "orderStatusFilter", "orderPaymentFilter", "orderFulfillmentFilter",
  "orderDetailPanel", "orderDetailTitle", "orderDetailSummary", "orderDetailActions", "orderItemsBody",
  "availabilityForm", "availabilityMessage", "paymentReviewPanel", "fulfillmentForm", "fulfillmentMessage",
  "orderStatusForm", "orderStatusMessage",
  "productSearch", "productFamilyFilter", "productStatusFilter", "productsTableBody", "productForm",
  "productFormTitle", "productMessage", "familyNameOptions", "productImageInput", "productImages",
  "productImagesNote", "settingsForm", "settingsMessage",
  "emailSearch", "emailStats", "emailConfigStatus", "emailsTableBody", "adminToast"
].map((id) => [id, document.querySelector(`#${id}`)]));

async function initAdmin() {
  bindAdminEvents();
  try {
    const { user } = await adminApi("/api/me");
    if (user.role !== "admin") throw new Error("Esta cuenta no tiene permisos administrativos.");
    adminState.user = user;
    await enterWorkspace();
  } catch (error) {
    adminEls.adminLoginMessage.textContent = error.status === 401 ? "" : error.message;
  }
}

function bindAdminEvents() {
  adminEls.adminLoginForm.addEventListener("submit", loginAdmin);
  document.querySelector("#adminLogout").addEventListener("click", logoutAdmin);
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => showAdminView(button.dataset.adminView)));
  window.addEventListener("hashchange", () => showAdminView(currentAdminView(), false));
  adminEls.customerSearch.addEventListener("input", debounce(loadCustomers, 250));
  adminEls.customerStatusFilter.addEventListener("change", loadCustomers);
  document.querySelector("#reloadCustomers").addEventListener("click", loadCustomers);
  adminEls.productSearch.addEventListener("input", debounce(loadProducts, 250));
  adminEls.productFamilyFilter.addEventListener("change", loadProducts);
  adminEls.productStatusFilter.addEventListener("change", loadProducts);
  document.querySelector("#reloadProducts").addEventListener("click", loadProducts);
  document.querySelector("#newProduct").addEventListener("click", resetProductForm);
  document.querySelector("#resetProductForm").addEventListener("click", resetProductForm);
  adminEls.productForm.addEventListener("submit", saveProduct);
  adminEls.productImageInput.addEventListener("change", uploadProductImages);
  adminEls.orderSearch.addEventListener("input", debounce(loadOrders, 250));
  adminEls.orderStatusFilter.addEventListener("change", loadOrders);
  adminEls.orderPaymentFilter.addEventListener("change", loadOrders);
  adminEls.orderFulfillmentFilter.addEventListener("change", loadOrders);
  document.querySelector("#reloadOrders").addEventListener("click", loadOrders);
  document.querySelector("#closeOrderDetail").addEventListener("click", closeOrderDetail);
  adminEls.availabilityForm.addEventListener("submit", saveAvailability);
  adminEls.fulfillmentForm.addEventListener("submit", saveFulfillment);
  adminEls.orderStatusForm.addEventListener("submit", saveOrderStatus);
  adminEls.emailSearch.addEventListener("input", debounce(loadEmails, 250));
  document.querySelector("#reloadEmails").addEventListener("click", loadEmails);
  document.querySelector("#flushEmails").addEventListener("click", flushEmails);
  adminEls.settingsForm.addEventListener("submit", saveSettings);
}

async function loginAdmin(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.adminLoginForm));
  setBusy(adminEls.adminLoginForm, true);
  try {
    const { user } = await adminApi("/api/auth/login", { method: "POST", body: values });
    if (user.role !== "admin") {
      await adminApi("/api/auth/logout", { method: "POST" });
      throw new Error("Esta cuenta no tiene permisos administrativos.");
    }
    adminState.user = user;
    adminEls.adminLoginMessage.textContent = "";
    await enterWorkspace();
  } catch (error) {
    adminEls.adminLoginMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.adminLoginForm, false);
  }
}

async function enterWorkspace() {
  adminEls.adminLoginPanel.hidden = true;
  adminEls.adminWorkspace.hidden = false;
  adminEls.adminSession.hidden = false;
  adminEls.adminEmail.textContent = adminState.user.email;
  await Promise.all([loadCustomers(), loadProducts(), loadOrders(), loadSettings(), loadEmails()]);
  showAdminView(currentAdminView(), false);
  resetProductForm();
}

async function logoutAdmin() {
  await adminApi("/api/auth/logout", { method: "POST" });
  adminState.user = null;
  adminEls.adminWorkspace.hidden = true;
  adminEls.adminSession.hidden = true;
  adminEls.adminLoginPanel.hidden = false;
  adminEls.adminLoginForm.reset();
}

function currentAdminView() {
  const view = window.location.hash.replace("#", "");
  return adminViews.has(view) ? view : "customers";
}

function showAdminView(view, updateHash = true) {
  const targetView = adminViews.has(view) ? view : "customers";
  if (updateHash && window.location.hash !== `#${targetView}`) window.location.hash = targetView;
  document.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === targetView));
  document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== `${targetView}View`; });
}

async function loadCustomers() {
  const params = new URLSearchParams();
  if (adminEls.customerSearch.value.trim()) params.set("q", adminEls.customerSearch.value.trim());
  if (adminEls.customerStatusFilter.value) params.set("status", adminEls.customerStatusFilter.value);
  const { customers } = await adminApi(`/api/admin/customers${params.toString() ? `?${params}` : ""}`);
  adminState.customers = customers;
  renderCustomerStats();
  renderCustomers();
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (adminEls.productSearch.value.trim()) params.set("q", adminEls.productSearch.value.trim());
  if (adminEls.productFamilyFilter.value) params.set("family", adminEls.productFamilyFilter.value);
  if (adminEls.productStatusFilter.value) params.set("status", adminEls.productStatusFilter.value);
  const [{ products }, { families }] = await Promise.all([
    adminApi(`/api/admin/products${params.toString() ? `?${params}` : ""}`),
    adminApi("/api/admin/product-families")
  ]);
  adminState.products = products;
  adminState.families = families;
  renderProductFamilies();
  renderProducts();
}

function renderProductFamilies() {
  const current = adminEls.productFamilyFilter.value;
  adminEls.productFamilyFilter.innerHTML = `<option value="">Todas las familias</option>${adminState.families.map((family) => (
    `<option value="${escapeAdmin(family.slug)}">${escapeAdmin(family.name)}</option>`
  )).join("")}`;
  adminEls.productFamilyFilter.value = current;
  adminEls.familyNameOptions.innerHTML = adminState.families.map((family) => `<option value="${escapeAdmin(family.name)}"></option>`).join("");
}

function renderProducts() {
  adminEls.productsTableBody.innerHTML = adminState.products.length ? adminState.products.map((product) => `
    <tr data-product-id="${product.id}">
      <td><strong>${escapeAdmin(product.kmCode)}</strong><br><span>${escapeAdmin(product.ean13)}</span></td>
      <td>${escapeAdmin(product.name)}${product.measure ? `<br><span>${escapeAdmin(product.measure)}</span>` : ""}</td>
      <td>${escapeAdmin(product.family.name)}</td>
      <td>${adminMoney.format(product.basePriceCents / 100)}</td>
      <td><span class="status-badge ${product.active ? "approved" : "suspended"}">${product.active ? "Activo" : "Inactivo"}</span>${product.imageCount ? `<br><span>${product.imageCount} img.</span>` : ""}</td>
      <td><button class="ghost-button row-button" type="button" data-edit-product="${product.id}">Editar</button></td>
    </tr>
  `).join("") : `<tr><td colspan="6">No hay productos para este filtro.</td></tr>`;
  adminEls.productsTableBody.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", editProduct));
}

function editProduct(event) {
  const product = adminState.products.find((item) => item.id === Number(event.currentTarget.dataset.editProduct));
  if (!product) return;
  adminState.selectedProductId = product.id;
  adminEls.productFormTitle.textContent = `Editar ${product.kmCode}`;
  productField("kmCode").value = product.kmCode;
  productField("ean13").value = product.ean13;
  productField("name").value = product.name;
  productField("familyName").value = product.family.name;
  productField("subfamily").value = product.subfamily || "";
  productField("familySortOrder").value = product.family.sortOrder || 0;
  productField("webSortOrder").value = product.webSortOrder || 0;
  productField("basePrice").value = (product.basePriceCents / 100).toFixed(2);
  productField("priceEffectiveFrom").value = normalizeDateInput(product.priceEffectiveFrom);
  productField("active").checked = product.active;
  productField("imageFilename").value = product.imageFilename || "";
  productField("material").value = product.material || "";
  productField("color").value = product.color || "";
  productField("measure").value = product.measure || "";
  productField("cutLevel").value = product.cutLevel || "";
  productField("attachmentSystem").value = product.attachmentSystem || "";
  productField("compatibleMachine").value = product.compatibleMachine || "";
  productField("recommendedUse").value = product.recommendedUse || "";
  productField("technicalDescription").value = product.technicalDescription || "";
  adminEls.productMessage.textContent = "";
  loadProductImages(product.id);
  adminEls.productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  adminState.selectedProductId = null;
  adminEls.productForm.reset();
  adminEls.productFormTitle.textContent = "Nuevo producto";
  productField("active").checked = true;
  productField("familySortOrder").value = 0;
  productField("webSortOrder").value = 0;
  productField("priceEffectiveFrom").value = new Date().toISOString().slice(0, 10);
  adminEls.productMessage.textContent = "";
  adminState.productImages = [];
  renderProductImages();
}

async function saveProduct(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.productForm));
  const body = {
    kmCode: values.kmCode,
    ean13: values.ean13,
    name: values.name,
    familyName: values.familyName,
    subfamily: values.subfamily,
    familySortOrder: Number(values.familySortOrder || 0),
    webSortOrder: Number(values.webSortOrder || 0),
    basePriceCents: Math.round(Number(values.basePrice || 0) * 100),
    priceEffectiveFrom: values.priceEffectiveFrom,
    active: productField("active").checked,
    imageFilename: values.imageFilename,
    material: values.material,
    color: values.color,
    measure: values.measure,
    cutLevel: values.cutLevel,
    attachmentSystem: values.attachmentSystem,
    compatibleMachine: values.compatibleMachine,
    recommendedUse: values.recommendedUse,
    technicalDescription: values.technicalDescription
  };
  setBusy(adminEls.productForm, true);
  try {
    const { product } = await adminApi("/api/admin/products", { method: "POST", body });
    adminEls.productMessage.textContent = `Producto ${product.km_code || body.kmCode} guardado.`;
    await loadProducts();
    const updated = adminState.products.find((item) => item.kmCode === String(body.kmCode).trim().toUpperCase());
    if (updated) {
      adminState.selectedProductId = updated.id;
      adminEls.productFormTitle.textContent = `Editar ${updated.kmCode}`;
      await loadProductImages(updated.id);
    }
  } catch (error) {
    adminEls.productMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.productForm, false);
  }
}

async function loadProductImages(productId) {
  adminEls.productImagesNote.textContent = "Cargando imagenes...";
  try {
    const { images } = await adminApi(`/api/admin/products/${productId}/images`);
    adminState.productImages = images;
    renderProductImages();
  } catch (error) {
    adminState.productImages = [];
    renderProductImages(error.message);
  }
}

function renderProductImages(errorMessage = "") {
  const hasProduct = Boolean(adminState.selectedProductId);
  adminEls.productImageInput.disabled = !hasProduct;
  if (!hasProduct) {
    adminEls.productImagesNote.textContent = "Guarda o selecciona un producto para cargar imagenes.";
    adminEls.productImages.innerHTML = "";
    return;
  }
  if (errorMessage) {
    adminEls.productImagesNote.textContent = errorMessage;
  } else {
    adminEls.productImagesNote.textContent = adminState.productImages.length
      ? "La imagen marcada como principal se muestra primero en la tienda."
      : "Todavia no hay imagenes cargadas para este producto.";
  }
  adminEls.productImages.innerHTML = adminState.productImages.map((image, index) => `
    <article class="product-image-card ${image.isPrimary ? "is-primary" : ""}">
      <figure class="product-image-preview">
        <img src="${escapeAdmin(image.url)}" alt="${escapeAdmin(image.altText || image.originalFilename)}" loading="lazy" />
      </figure>
      <div class="product-image-meta" title="${escapeAdmin(image.originalFilename)}">
        <strong>${image.isPrimary ? "Principal" : "Galeria"}</strong>
        <span>Imagen ${index + 1}</span>
      </div>
      <div class="image-actions">
        <button class="ghost-button" type="button" data-primary-image="${image.id}" ${image.isPrimary ? "disabled" : ""}>Principal</button>
        <button class="ghost-button danger" type="button" data-delete-image="${image.id}">Eliminar</button>
      </div>
    </article>
  `).join("");
  adminEls.productImages.querySelectorAll("[data-primary-image]").forEach((button) => button.addEventListener("click", setPrimaryProductImage));
  adminEls.productImages.querySelectorAll("[data-delete-image]").forEach((button) => button.addEventListener("click", deleteProductImage));
}

async function uploadProductImages(event) {
  const files = Array.from(event.currentTarget.files || []);
  event.currentTarget.value = "";
  if (!adminState.selectedProductId || !files.length) return;
  adminEls.productImagesNote.textContent = `Subiendo ${files.length} imagen${files.length === 1 ? "" : "es"}...`;
  adminEls.productImageInput.disabled = true;
  try {
    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}: formato no permitido.`);
      if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: maximo 5 MB.`);
      const dataBase64 = await fileToBase64(file);
      const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images`, {
        method: "POST",
        body: { originalFilename: file.name, mimeType: file.type, dataBase64 }
      });
      adminState.productImages = images;
    }
    renderProductImages();
    await loadProducts();
    showAdminToast("Imagenes cargadas.");
  } catch (error) {
    renderProductImages(error.message);
  } finally {
    adminEls.productImageInput.disabled = false;
  }
}

async function setPrimaryProductImage(event) {
  const imageId = Number(event.currentTarget.dataset.primaryImage);
  event.currentTarget.disabled = true;
  try {
    const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images/${imageId}/primary`, { method: "PATCH" });
    adminState.productImages = images;
    renderProductImages();
    await loadProducts();
  } catch (error) {
    renderProductImages(error.message);
  }
}

async function deleteProductImage(event) {
  const imageId = Number(event.currentTarget.dataset.deleteImage);
  event.currentTarget.disabled = true;
  try {
    const { images } = await adminApi(`/api/admin/products/${adminState.selectedProductId}/images/${imageId}`, { method: "DELETE" });
    adminState.productImages = images;
    renderProductImages();
    await loadProducts();
  } catch (error) {
    renderProductImages(error.message);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
    reader.addEventListener("error", () => reject(new Error(`No se pudo leer ${file.name}.`)));
    reader.readAsDataURL(file);
  });
}

function productField(name) {
  return adminEls.productForm.querySelector(`[name="${name}"]`);
}

function renderCustomerStats() {
  const counts = Object.fromEntries(Object.keys(statusLabels).map((status) => [status, adminState.customers.filter((customer) => customer.approval_status === status).length]));
  adminEls.customerStats.innerHTML = [
    ["Total", adminState.customers.length], ["Pendientes", counts.pending], ["Aprobados", counts.approved], ["Suspendidos", counts.suspended]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderCustomers() {
  if (!adminState.customers.length) {
    adminEls.customerList.innerHTML = `<p class="admin-empty">No hay clientes para este filtro.</p>`;
    return;
  }
  adminEls.customerList.innerHTML = adminState.customers.map((customer) => `
    <article class="customer-row" data-customer-id="${customer.id}">
      <div class="customer-main">
        <div class="customer-heading"><div><strong>${escapeAdmin(customer.business_name)}</strong><span>${escapeAdmin(customer.email)}</span></div><span class="status-badge ${customer.approval_status}">${statusLabels[customer.approval_status]}</span></div>
        <dl class="customer-data">
          <div><dt>CUIT</dt><dd>${escapeAdmin(customer.tax_id)}</dd></div><div><dt>Condicion</dt><dd>${escapeAdmin(customer.tax_condition)}</dd></div>
          <div><dt>Tipo</dt><dd>${escapeAdmin(customer.customer_type)}</dd></div><div><dt>Rubro</dt><dd>${escapeAdmin(customer.industry)}</dd></div>
          <div><dt>Ubicacion</dt><dd>${escapeAdmin(customer.city)}, ${escapeAdmin(customer.province)}</dd></div><div><dt>Contacto</dt><dd>${escapeAdmin(customer.contact_person)}</dd></div>
          <div><dt>Telefono</dt><dd>${escapeAdmin(customer.phone)}</dd></div><div><dt>WhatsApp</dt><dd>${escapeAdmin(customer.whatsapp)}</dd></div>
        </dl>
      </div>
      <div class="customer-controls">
        <div class="status-actions">
          <button class="approve" type="button" data-customer-status="approved">Aprobar</button>
          <button type="button" data-customer-status="rejected">Rechazar</button>
          <button type="button" data-customer-status="suspended">Suspender</button>
        </div>
        <form class="discount-form">
          <label><span>Desc. 1 (%)</span><input name="discount1" type="number" min="0" max="100" step="0.01" value="${customer.discount_1_bps / 100}" /></label>
          <label><span>Desc. 2 (%)</span><input name="discount2" type="number" min="0" max="100" step="0.01" value="${customer.discount_2_bps / 100}" /></label>
          <label><span>Desc. 3 (%)</span><input name="discount3" type="number" min="0" max="100" step="0.01" value="${customer.discount_3_bps / 100}" /></label>
          <button class="ghost-button" type="submit">Guardar descuentos</button>
        </form>
      </div>
    </article>`).join("");

  adminEls.customerList.querySelectorAll("[data-customer-status]").forEach((button) => button.addEventListener("click", updateCustomerStatus));
  adminEls.customerList.querySelectorAll(".discount-form").forEach((form) => form.addEventListener("submit", saveDiscounts));
}

async function updateCustomerStatus(event) {
  const row = event.currentTarget.closest("[data-customer-id]");
  const customerId = Number(row.dataset.customerId);
  const status = event.currentTarget.dataset.customerStatus;
  event.currentTarget.disabled = true;
  try {
    await adminApi(`/api/admin/customers/${customerId}/status`, { method: "PATCH", body: { status } });
    showAdminToast(`Cliente ${statusLabels[status].toLowerCase()}.`);
    await loadCustomers();
  } catch (error) {
    showAdminToast(error.message);
    event.currentTarget.disabled = false;
  }
}

async function saveDiscounts(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerId = Number(form.closest("[data-customer-id]").dataset.customerId);
  const values = Object.fromEntries(new FormData(form));
  const discountsBps = [values.discount1, values.discount2, values.discount3].map((value) => Math.round(Number(value || 0) * 100));
  setBusy(form, true);
  try {
    await adminApi(`/api/admin/customers/${customerId}/discounts`, { method: "PATCH", body: { discountsBps } });
    showAdminToast("Descuentos guardados en cascada.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function loadOrders() {
  const params = new URLSearchParams();
  if (adminEls.orderSearch.value.trim()) params.set("q", adminEls.orderSearch.value.trim());
  if (adminEls.orderStatusFilter.value) params.set("status", adminEls.orderStatusFilter.value);
  if (adminEls.orderPaymentFilter.value) params.set("payment", adminEls.orderPaymentFilter.value);
  if (adminEls.orderFulfillmentFilter.value) params.set("fulfillment", adminEls.orderFulfillmentFilter.value);
  const { orders } = await adminApi(`/api/admin/orders${params.toString() ? `?${params}` : ""}`);
  adminState.orders = orders;
  adminEls.ordersTableBody.innerHTML = orders.length ? orders.map((order) => `
    <tr><td><strong>${escapeAdmin(order.order_number)}</strong></td><td>${escapeAdmin(order.business_name)}</td>
      <td>${escapeAdmin(order.status)}</td><td>${escapeAdmin(order.payment_status)}</td>
      <td>${escapeAdmin(order.fulfillment_status || "pending")}</td>
      <td>${adminMoney.format(order.total_cents / 100)}</td><td>${formatDate(order.created_at)}</td>
      <td><button class="ghost-button row-button" type="button" data-view-order="${order.id}">Ver</button></td></tr>
  `).join("") : `<tr><td colspan="8">No hay pedidos para este filtro.</td></tr>`;
  adminEls.ordersTableBody.querySelectorAll("[data-view-order]").forEach((button) => button.addEventListener("click", openOrderDetail));
}

async function openOrderDetail(event) {
  const orderId = Number(event.currentTarget.dataset.viewOrder);
  event.currentTarget.disabled = true;
  try {
    const { order } = await adminApi(`/api/admin/orders/${orderId}`);
    adminState.selectedOrder = order;
    renderOrderDetail();
    adminEls.orderDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    event.currentTarget.disabled = false;
  }
}

function renderOrderDetail() {
  const order = adminState.selectedOrder;
  if (!order) return closeOrderDetail();
  adminEls.orderDetailPanel.hidden = false;
  adminEls.orderDetailTitle.textContent = `${order.orderNumber} - ${order.businessName}`;
  adminEls.orderDetailSummary.innerHTML = [
    ["Cliente", `${order.businessName} (${order.email})`],
    ["Contacto", `${order.contactPerson || "-"} | WhatsApp ${order.customerWhatsapp || "-"}`],
    ["Estado", `${order.status} / ${order.paymentStatus}`],
    ["Descuentos", discountText(order.discountsBps)],
    ["Subtotal neto", adminMoney.format(order.subtotalNetCents / 100)],
    ["IVA", `${(order.vatBps / 100).toFixed(2)}% - ${adminMoney.format(order.vatCents / 100)}`],
    ["Total", adminMoney.format(order.totalCents / 100)],
    ["Precio reservado", formatDate(order.priceReservedAt)],
    ["Entrega solicitada", shippingText(order.shipping)],
    ["Despacho", fulfillmentText(order.fulfillment)]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${escapeAdmin(value)}</strong></div>`).join("");
  const customerWhatsapp = cleanPhone(order.customerWhatsapp);
  adminEls.orderDetailActions.innerHTML = customerWhatsapp
    ? `<a class="primary-link" target="_blank" rel="noreferrer" href="https://wa.me/${customerWhatsapp}?text=${encodeURIComponent(orderCustomerWhatsappText(order))}">WhatsApp al cliente</a>`
    : `<p class="admin-note">Este cliente no tiene WhatsApp cargado.</p>`;
  adminEls.orderItemsBody.innerHTML = order.items.map((item) => `
    <tr data-order-item-id="${item.id}" data-unit-cents="${item.finalUnitPriceCents}">
      <td><strong>${escapeAdmin(item.kmCode)}</strong><br><span>EAN ${escapeAdmin(item.ean13)}</span></td>
      <td>${escapeAdmin(item.productName)}${item.availabilityNote ? `<br><span>${escapeAdmin(item.availabilityNote)}</span>` : ""}</td>
      <td>${item.quantity}</td>
      <td><input class="confirmed-qty-input" name="confirmedQuantity-${item.id}" type="number" min="0" max="${item.quantity}" step="1" value="${item.confirmedQuantity || 0}" /></td>
      <td>${adminMoney.format(item.finalUnitPriceCents / 100)}</td>
      <td data-confirmed-subtotal>${adminMoney.format((item.confirmedSubtotalNetCents || 0) / 100)}</td>
      <td><input name="availabilityNote-${item.id}" value="${escapeAdmin(item.availabilityNote || "")}" placeholder="${item.confirmedQuantity ? "" : "Motivo si no disponible"}" /></td>
    </tr>
  `).join("");
  adminEls.orderItemsBody.querySelectorAll(".confirmed-qty-input").forEach((input) => input.addEventListener("input", updateConfirmedSubtotalPreview));
  adminEls.availabilityForm.elements.reason.value = "";
  adminEls.availabilityMessage.textContent = "";
  renderPaymentReceipts(order);
  renderFulfillment(order);
  adminEls.orderStatusForm.elements.status.value = order.status;
  adminEls.orderStatusForm.elements.paymentStatus.value = order.paymentStatus;
  adminEls.orderStatusForm.elements.reason.value = "";
  adminEls.orderStatusMessage.textContent = "";
}

function renderFulfillment(order) {
  const form = adminEls.fulfillmentForm.elements;
  const fulfillment = order.fulfillment || {};
  form.fulfillmentStatus.value = fulfillment.status || "pending";
  form.fulfillmentMethod.value = fulfillment.method || "";
  form.fulfillmentCarrier.value = fulfillment.carrier || "";
  form.fulfillmentTracking.value = fulfillment.tracking || "";
  form.fulfillmentEstimatedDate.value = normalizeDateInput(fulfillment.estimatedDate);
  form.fulfillmentNotes.value = fulfillment.notes || "";
  adminEls.fulfillmentMessage.textContent = "";
}

async function saveFulfillment(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.fulfillmentForm));
  setBusy(adminEls.fulfillmentForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/fulfillment`, {
      method: "PATCH",
      body: values
    });
    adminState.selectedOrder = order;
    await loadOrders();
    renderOrderDetail();
    adminEls.fulfillmentMessage.textContent = "Despacho guardado y email enviado.";
  } catch (error) {
    adminEls.fulfillmentMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.fulfillmentForm, false);
  }
}

function renderPaymentReceipts(order) {
  const receipts = order.paymentReceipts || [];
  adminEls.paymentReviewPanel.innerHTML = `
    <div class="panel-heading"><p class="eyebrow">Pago</p><h3>Comprobantes</h3></div>
    ${receipts.length ? receipts.map((receipt) => `
      <article class="payment-receipt-row">
        <div><strong>${escapeAdmin(receipt.originalFilename)}</strong><span>${escapeAdmin(receipt.status)} - ${formatDate(receipt.createdAt)}</span></div>
        <div class="image-actions">
          <button class="ghost-button" type="button" data-review-receipt="${receipt.id}" data-receipt-status="accepted" ${receipt.status === "accepted" ? "disabled" : ""}>Aceptar</button>
          <button class="ghost-button danger" type="button" data-review-receipt="${receipt.id}" data-receipt-status="rejected" ${receipt.status === "rejected" ? "disabled" : ""}>Rechazar</button>
        </div>
      </article>
    `).join("") : `<p class="admin-note">Todavia no hay comprobantes cargados.</p>`}
  `;
  adminEls.paymentReviewPanel.querySelectorAll("[data-review-receipt]").forEach((button) => button.addEventListener("click", reviewReceipt));
}

async function reviewReceipt(event) {
  const receiptId = Number(event.currentTarget.dataset.reviewReceipt);
  const status = event.currentTarget.dataset.receiptStatus;
  event.currentTarget.disabled = true;
  try {
    const { order } = await adminApi(`/api/admin/payment-receipts/${receiptId}`, {
      method: "PATCH",
      body: { status, reason: status === "accepted" ? "Comprobante aceptado por administracion" : "Comprobante rechazado por administracion" }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    renderOrderDetail();
    showAdminToast(status === "accepted" ? "Pago aceptado." : "Comprobante rechazado.");
  } catch (error) {
    showAdminToast(error.message);
  }
}

function updateConfirmedSubtotalPreview(event) {
  const row = event.currentTarget.closest("[data-order-item-id]");
  const unitCents = Number(row.dataset.unitCents || 0);
  const quantity = Math.max(0, Number(event.currentTarget.value || 0));
  row.querySelector("[data-confirmed-subtotal]").textContent = adminMoney.format(unitCents * quantity / 100);
}

async function saveAvailability(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.availabilityForm));
  const items = adminState.selectedOrder.items.map((item) => ({
    id: item.id,
    confirmedQuantity: Number(values[`confirmedQuantity-${item.id}`] || 0),
    availabilityNote: values[`availabilityNote-${item.id}`] || ""
  }));
  setBusy(adminEls.availabilityForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}/availability`, {
      method: "PATCH",
      body: { items, reason: values.reason }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    renderOrderDetail();
    adminEls.availabilityMessage.textContent = "Disponibilidad confirmada y email enviado.";
  } catch (error) {
    adminEls.availabilityMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.availabilityForm, false);
  }
}

function closeOrderDetail() {
  adminState.selectedOrder = null;
  adminEls.orderDetailPanel.hidden = true;
}

async function saveOrderStatus(event) {
  event.preventDefault();
  if (!adminState.selectedOrder) return;
  const values = Object.fromEntries(new FormData(adminEls.orderStatusForm));
  setBusy(adminEls.orderStatusForm, true);
  try {
    const { order } = await adminApi(`/api/admin/orders/${adminState.selectedOrder.id}`, {
      method: "PATCH",
      body: { status: values.status, paymentStatus: values.paymentStatus, reason: values.reason }
    });
    adminState.selectedOrder = order;
    await loadOrders();
    renderOrderDetail();
    adminEls.orderStatusMessage.textContent = "Pedido actualizado.";
  } catch (error) {
    adminEls.orderStatusMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.orderStatusForm, false);
  }
}

async function loadSettings() {
  const { settings } = await adminApi("/api/admin/settings");
  adminState.settings = settings;
  const form = adminEls.settingsForm.elements;
  form.vatPercent.value = settings.vatBps / 100;
  form.whatsappNumber.value = settings.whatsappNumber;
  for (const key of ["bankName", "accountHolder", "taxId", "cbu", "alias", "accountType", "instructions"]) form[key].value = settings.bank[key] || "";
}

async function loadEmails() {
  const params = new URLSearchParams();
  const search = adminEls.emailSearch.value.trim();
  if (search) params.set("q", search);
  const { enabled, provider, summary, emails } = await adminApi(`/api/admin/emails${params.size ? `?${params}` : ""}`);
  adminState.emailEnabled = Boolean(enabled);
  adminState.emailProvider = provider || "";
  adminState.emailSummary = summary;
  adminState.emails = emails;
  renderEmails();
}

async function flushEmails() {
  const button = document.querySelector("#flushEmails");
  button.disabled = true;
  try {
    const { result } = await adminApi("/api/admin/emails/flush", { method: "POST" });
    await loadEmails();
    showAdminToast(result.enabled ? `Emails enviados: ${result.sent}.` : "SMTP no esta configurado en el servidor.");
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderEmails() {
  const summary = adminState.emailSummary || {};
  adminEls.emailStats.innerHTML = [
    ["Total", summary.total || 0],
    ["Pendientes", summary.pending || 0],
    ["Enviados", summary.sent || 0],
    ["Con error", summary.withErrors || 0]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  adminEls.emailConfigStatus.textContent = adminState.emailEnabled
    ? `Proveedor configurado: ${adminState.emailProvider}. Los envios pendientes se procesan automaticamente y tambien se pueden reintentar desde este panel.`
    : "SMTP no esta configurado en el servidor. Los emails quedaran en cola hasta cargar las variables de correo.";
  adminEls.emailsTableBody.innerHTML = adminState.emails.length ? adminState.emails.map((email) => `
    <tr>
      <td>${formatDate(email.created_at)}</td>
      <td>${escapeAdmin(email.event_type)}</td>
      <td>${escapeAdmin(email.recipient)}</td>
      <td>${escapeAdmin(email.subject)}</td>
      <td><span class="status-badge ${email.status}">${email.status === "sent" ? "Enviado" : "Pendiente"}</span></td>
      <td>${email.attempts}</td>
      <td class="email-error">${escapeAdmin(email.last_error || "")}</td>
    </tr>
  `).join("") : `<tr><td colspan="7">Todavia no hay emails registrados.</td></tr>`;
}

async function saveSettings(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminEls.settingsForm));
  const body = {
    vatBps: Math.round(Number(values.vatPercent) * 100),
    whatsappNumber: values.whatsappNumber,
    bank: Object.fromEntries(["bankName", "accountHolder", "taxId", "cbu", "alias", "accountType", "instructions"].map((key) => [key, values[key]]))
  };
  setBusy(adminEls.settingsForm, true);
  try {
    const { settings } = await adminApi("/api/admin/settings", { method: "PATCH", body });
    adminState.settings = settings;
    adminEls.settingsMessage.textContent = "Configuracion guardada.";
  } catch (error) {
    adminEls.settingsMessage.textContent = error.message;
  } finally {
    setBusy(adminEls.settingsForm, false);
  }
}

async function adminApi(url, { method = "GET", body } = {}) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la operacion.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setBusy(form, busy) {
  form.querySelectorAll("button,input,select,textarea").forEach((control) => { control.disabled = busy; });
}

function showAdminToast(message) {
  adminEls.adminToast.textContent = message;
  adminEls.adminToast.classList.add("show");
  clearTimeout(showAdminToast.timer);
  showAdminToast.timer = setTimeout(() => adminEls.adminToast.classList.remove("show"), 2500);
}

function formatDate(value) {
  if (!value) return "";
  const normalized = /z$/i.test(String(value)) ? String(value) : `${value}Z`;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(normalized));
}

function discountText(discountsBps = []) {
  const labels = discountsBps.filter(Boolean).map((value) => `${(value / 100).toFixed(2)}%`);
  return labels.length ? labels.join(" + ") : "Sin descuentos";
}

function shippingText(shipping = {}) {
  return [
    shipping.recipient,
    shipping.address,
    shipping.city && shipping.province ? `${shipping.city}, ${shipping.province}` : shipping.city || shipping.province,
    shipping.postalCode ? `CP ${shipping.postalCode}` : "",
    shipping.preferredTransport ? `Transporte: ${shipping.preferredTransport}` : "",
    shipping.contactPhone ? `Tel: ${shipping.contactPhone}` : "",
    shipping.notes ? `Notas: ${shipping.notes}` : ""
  ].filter(Boolean).join(" | ");
}

function fulfillmentText(fulfillment = {}) {
  return [
    fulfillment.status && fulfillment.status !== "pending" ? fulfillment.status : "Pendiente",
    fulfillment.method,
    fulfillment.carrier,
    fulfillment.tracking ? `Guia/remito: ${fulfillment.tracking}` : "",
    fulfillment.estimatedDate ? `Fecha: ${fulfillment.estimatedDate}` : "",
    fulfillment.notes
  ].filter(Boolean).join(" | ");
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function orderCustomerWhatsappText(order) {
  return [
    `Hola ${order.contactPerson || order.businessName}, te contactamos de KM Detail Line.`,
    "",
    `Pedido: ${order.orderNumber}`,
    `Estado: ${order.status}`,
    `Pago: ${order.paymentStatus}`,
    `Total: ${adminMoney.format(order.totalCents / 100)}`,
    "",
    "Cualquier informacion adicional la coordinamos por este medio."
  ].join("\n");
}

function normalizeDateInput(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function debounce(callback, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), waitMs);
  };
}

function escapeAdmin(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

initAdmin();
