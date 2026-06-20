const WHATSAPP_NUMBER = "5490000000000";
const SITE_URL = "https://km-detail.com";

const products = [
  { code: "CP171K", ean: "0781100144695", name: "Pad 100% lana corte 95 - 7,5 IN", category: "Lana", family: "Panos hibridos", size: "7,5 IN", cut: 95, color: "Natural", system: "Sin backing" },
  { code: "CP172K", ean: "0781100144701", name: "Pad lana y acrilico corte 80 - 7,5 IN", category: "Lana", family: "Panos hibridos", size: "7,5 IN", cut: 80, color: "Mixto", system: "Sin backing" },
  { code: "CP671K", ean: "0764451541467", name: "Pad 100% lana corte 95 - 7,5 IN con backing", category: "Lana", family: "Panos hibridos", size: "7,5 IN", cut: 95, color: "Natural", system: "Con backing" },
  { code: "CP672K", ean: "0764451541450", name: "Pad lana y acrilico corte 80 - 7,5 IN con backing", category: "Lana", family: "Panos hibridos", size: "7,5 IN", cut: 80, color: "Mixto", system: "Con backing" },
  { code: "CP271K", ean: "0781100144718", name: "Pad poliespuma blanca corte 85 - 7,5 IN", category: "Poliespuma", family: "Panos hibridos", size: "7,5 IN", cut: 85, color: "Blanco", system: "Sin backing" },
  { code: "CP272K", ean: "0781100144725", name: "Pad poliespuma violeta corte 65 - 7,5 IN", category: "Poliespuma", family: "Panos hibridos", size: "7,5 IN", cut: 65, color: "Violeta", system: "Sin backing" },

  { code: "PA166K", ean: "0734191447008", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "6,5 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA165K", ean: "0734191447015", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "6 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA164K", ean: "0734191447022", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "5 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA163K", ean: "0734191447039", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "4 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA162K", ean: "0734191447046", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "3 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA161K", ean: "0736372495204", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "2 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PA160K", ean: "0736372495211", name: "Pad con backing 100% lana corte 90", category: "Lana", family: "Linea PA", size: "1 IN", cut: 90, color: "Natural", system: "Rosca 14 x 2" },
  { code: "PX866K", ean: "0764451541542", name: "Pad con backing 100% lana corte 98", category: "Lana", family: "Linea PA", size: "6 IN", cut: 98, color: "Natural", system: "Rosca 14 x 2" },

  { code: "DC152K", ean: "0764451541344", name: "Pad 100% lana prelavada - 5 IN 130mm", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 98, color: "Violeta", system: "Rotativa" },
  { code: "DC154K", ean: "0764451541368", name: "Pad 100% lana prelavada - 5 IN 130mm", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 90, color: "Naranja", system: "Rotativa" },
  { code: "DC156K", ean: "0764451541375", name: "Pad 100% lana prelavada - 5 IN 130mm", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 95, color: "Verde", system: "Rotativa" },
  { code: "DC151K", ean: "0764451541337", name: "Pad 100% lana prelavada - 5 IN 130/25", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 98, color: "Violeta", system: "Roto orbital" },
  { code: "DC153K", ean: "0764451541351", name: "Pad 100% lana prelavada - 5 IN 130/30", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 90, color: "Naranja", system: "Roto orbital" },
  { code: "DC155K", ean: "0764451541382", name: "Pad 100% lana prelavada - 5 IN 130/25", category: "Lana", family: "Lana prelavada", size: "5 IN", cut: 95, color: "Verde", system: "Roto orbital" },
  { code: "DC132K", ean: "0764451541399", name: "Pad 100% lana prelavada - 3 IN 75mm", category: "Lana", family: "Lana prelavada", size: "3 IN", cut: 98, color: "Violeta", system: "Rotativa / roto orbital" },
  { code: "DC134K", ean: "0764451541405", name: "Pad 100% lana prelavada - 3 IN 75mm", category: "Lana", family: "Lana prelavada", size: "3 IN", cut: 90, color: "Naranja", system: "Rotativa / roto orbital" },
  { code: "DC136K", ean: "0764451541412", name: "Pad 100% lana prelavada - 3 IN 75mm", category: "Lana", family: "Lana prelavada", size: "3 IN", cut: 95, color: "Verde", system: "Rotativa / roto orbital" },

  { code: "PB171K", ean: "0736372495273", name: "Pad poliespuma blanco corte 85 - 6,5 IN", category: "Poliespuma", family: "Con backing", size: "6,5 IN", cut: 85, color: "Blanco", system: "Rosca 14 x 2" },
  { code: "PB172K", ean: "0736372495280", name: "Pad poliespuma celeste corte 60 - 6,5 IN", category: "Poliespuma", family: "Con backing", size: "6,5 IN", cut: 60, color: "Celeste", system: "Rosca 14 x 2" },
  { code: "PB173K", ean: "0736372495440", name: "Pad poliespuma negro corte 40 - 6,5 IN", category: "Poliespuma", family: "Con backing", size: "6,5 IN", cut: 40, color: "Negro", system: "Rosca 14 x 2" },
  { code: "PB161K", ean: "0736372495389", name: "Pad poliespuma blanco corte 85 - 6 IN", category: "Poliespuma", family: "Con backing", size: "6 IN", cut: 85, color: "Blanco", system: "Rosca 14 x 2" },
  { code: "PB162K", ean: "0736372495396", name: "Pad poliespuma celeste corte 60 - 6 IN", category: "Poliespuma", family: "Con backing", size: "6 IN", cut: 60, color: "Celeste", system: "Rosca 14 x 2" },
  { code: "PB163K", ean: "0736372495402", name: "Pad poliespuma negro corte 40 - 6 IN", category: "Poliespuma", family: "Con backing", size: "6 IN", cut: 40, color: "Negro", system: "Rosca 14 x 2" },
  { code: "PB151K", ean: "0736372495358", name: "Pad poliespuma blanco corte 85 - 5 IN", category: "Poliespuma", family: "Con backing", size: "5 IN", cut: 85, color: "Blanco", system: "Rosca 14 x 2" },
  { code: "PB152K", ean: "0736372495365", name: "Pad poliespuma celeste corte 60 - 5 IN", category: "Poliespuma", family: "Con backing", size: "5 IN", cut: 60, color: "Celeste", system: "Rosca 14 x 2" },
  { code: "PB153K", ean: "0736372495372", name: "Pad poliespuma negro corte 40 - 5 IN", category: "Poliespuma", family: "Con backing", size: "5 IN", cut: 40, color: "Negro", system: "Rosca 14 x 2" },
  { code: "DL267K", ean: "0734191446810", name: "Pad poliespuma blanco corte 85 - 6,5 IN", category: "Poliespuma", family: "Sin backing", size: "6,5 IN", cut: 85, color: "Blanco", system: "Velcro" },
  { code: "DL268K", ean: "0734191446827", name: "Pad poliespuma celeste corte 60 - 6,5 IN", category: "Poliespuma", family: "Sin backing", size: "6,5 IN", cut: 60, color: "Celeste", system: "Velcro" },
  { code: "DL269K", ean: "0734191446834", name: "Pad poliespuma negro corte 40 - 6,5 IN", category: "Poliespuma", family: "Sin backing", size: "6,5 IN", cut: 40, color: "Negro", system: "Velcro" },
  { code: "DL251K", ean: "0788115794068", name: "Pad poliespuma blanco corte 85 - 5 IN", category: "Poliespuma", family: "Sin backing", size: "5 IN", cut: 85, color: "Blanco", system: "Velcro" },
  { code: "DL252K", ean: "0788115794075", name: "Pad poliespuma celeste corte 60 - 5 IN", category: "Poliespuma", family: "Sin backing", size: "5 IN", cut: 60, color: "Celeste", system: "Velcro" },
  { code: "DL253K", ean: "0788115794082", name: "Pad poliespuma negro corte 40 - 5 IN", category: "Poliespuma", family: "Sin backing", size: "5 IN", cut: 40, color: "Negro", system: "Velcro" },
  { code: "DL221K", ean: "0734191446674", name: "Pad poliespuma blanco corte 85 - 2 IN x 3 UN", category: "Poliespuma", family: "Sin backing", size: "2 IN", cut: 85, color: "Blanco", system: "Velcro" },
  { code: "DL222K", ean: "0734191446681", name: "Pad poliespuma celeste corte 60 - 2 IN x 3 UN", category: "Poliespuma", family: "Sin backing", size: "2 IN", cut: 60, color: "Celeste", system: "Velcro" },
  { code: "DL223K", ean: "0734191446698", name: "Pad poliespuma negro corte 40 - 2 IN x 3 UN", category: "Poliespuma", family: "Sin backing", size: "2 IN", cut: 40, color: "Negro", system: "Velcro" },
  { code: "DL201K", ean: "0734191446711", name: "Pad poliespuma blanco corte 85 - 1 IN x 10 UN", category: "Poliespuma", family: "Sin backing", size: "1 IN", cut: 85, color: "Blanco", system: "Velcro" },
  { code: "DL202K", ean: "0734191446728", name: "Pad poliespuma celeste corte 60 - 1 IN x 10 UN", category: "Poliespuma", family: "Sin backing", size: "1 IN", cut: 60, color: "Celeste", system: "Velcro" },
  { code: "DL203K", ean: "0734191446735", name: "Pad poliespuma negro corte 40 - 1 IN x 10 UN", category: "Poliespuma", family: "Sin backing", size: "1 IN", cut: 40, color: "Negro", system: "Velcro" },

  { code: "DL166K", ean: "0734191446803", name: "Pad respaldo poliespuma 100% lana corte 90", category: "Lana", family: "Respaldo poliespuma", size: "6,5 IN", cut: 90, color: "Natural", system: "Velcro rotativa" },
  { code: "DL151K", ean: "0788115794099", name: "Pad respaldo poliespuma 100% lana corte 90", category: "Lana", family: "Respaldo poliespuma", size: "5 IN", cut: 90, color: "Natural", system: "Velcro rotativa" },
  { code: "DN251K", ean: "0736372495235", name: "Pad 100% lana corte 90 - 5 IN roto orbital", category: "Lana", family: "Respaldo poliespuma", size: "5 IN", cut: 90, color: "Natural", system: "Roto orbital" },
  { code: "DN252K", ean: "0736372495228", name: "Pad 100% lana corte 90 - 3 IN roto orbital", category: "Lana", family: "Respaldo poliespuma", size: "3 IN", cut: 90, color: "Natural", system: "Roto orbital" },

  { code: "SI614A", ean: "0788115794105", name: "Interfaz de espuma con velcro 6 IN x 12mm", category: "Accesorios", family: "Interfaces", size: "6 IN", cut: null, color: "Espuma", system: "Velcro" },
  { code: "SI514A", ean: "0734191446902", name: "Interfaz de espuma con velcro 5 IN x 12mm", category: "Accesorios", family: "Interfaces", size: "5 IN", cut: null, color: "Espuma", system: "Velcro" },
  { code: "SI314A", ean: "0734191446919", name: "Interfaz de espuma con velcro 3 IN x 12mm", category: "Accesorios", family: "Interfaces", size: "3 IN", cut: null, color: "Espuma", system: "Velcro" },
  { code: "DB011K", ean: "0734191446742", name: "Backing estandar rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "1 IN", cut: null, color: "Negro", system: "Rosca 14 x 2" },
  { code: "DB031K", ean: "0734191446766", name: "Backing estandar rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "3 IN", cut: null, color: "Negro", system: "Rosca 14 x 2" },
  { code: "DB051K", ean: "0734191446780", name: "Backing estandar rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "5 IN", cut: null, color: "Negro", system: "Rosca 14 x 2" },
  { code: "DB061K", ean: "0734191446797", name: "Backing estandar rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "6 IN", cut: null, color: "Negro", system: "Rosca 14 x 2" },
  { code: "DB151K", ean: "0764451541313", name: "Backing Flex rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "5 IN", cut: null, color: "Negro", system: "Flex" },
  { code: "DB251K", ean: "0764451541320", name: "Backing Ultra Flex rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "5 IN", cut: null, color: "Negro", system: "Ultra Flex" },
  { code: "DB131K", ean: "0764451541306", name: "Backing Ultra Flex rosca 14 x 2 mm", category: "Accesorios", family: "Backings", size: "3 IN", cut: null, color: "Negro", system: "Ultra Flex" },
  { code: "DL045H", ean: "0734191446872", name: "Aplicador poliespuma para cera con velcro 95 x 30mm", category: "Accesorios", family: "Aplicadores", size: "95 x 30mm", cut: null, color: "Espuma", system: "Velcro" },
  { code: "DL046H", ean: "0734191446889", name: "Kit 3 aplicadores + 1 soporte", category: "Accesorios", family: "Aplicadores", size: "Kit", cut: null, color: "Mixto", system: "Velcro" },
  { code: "DL112K", ean: "0764451541474", name: "Pad aplicador 100 x 12 verde uso general", category: "Accesorios", family: "Aplicadores", size: "100 x 12", cut: null, color: "Verde", system: "Manual" },
  { code: "DL114K", ean: "0764451541481", name: "Pad aplicador 100 x 20 celeste", category: "Accesorios", family: "Aplicadores", size: "100 x 20", cut: null, color: "Celeste", system: "Manual" },
  { code: "DL116K", ean: "0764451541498", name: "Pad aplicador 100 x 20 negro", category: "Accesorios", family: "Aplicadores", size: "100 x 20", cut: null, color: "Negro", system: "Manual" },

  { code: "AA131K", ean: "0734191446926", name: "Taco de lijado N1 con velcro", category: "Tacos", family: "Tacos azules", size: "70 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AA132K", ean: "0734191446933", name: "Taco de lijado N2 con velcro", category: "Tacos", family: "Tacos azules", size: "140 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AA133K", ean: "0734191446940", name: "Taco de lijado N3 con velcro", category: "Tacos", family: "Tacos azules", size: "210 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AA134K", ean: "0734191446957", name: "Taco de lijado N4 con velcro", category: "Tacos", family: "Tacos azules", size: "280 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AA135K", ean: "0734191446964", name: "Taco de lijado N5 con velcro", category: "Tacos", family: "Tacos azules", size: "350 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AA136K", ean: "0734191446971", name: "Taco de lijado N6 con velcro", category: "Tacos", family: "Tacos azules", size: "420 x 70mm", cut: null, color: "Azul", system: "Velcro" },
  { code: "AB132K", ean: "0736372495242", name: "Taco de lijado N2 base goma", category: "Tacos", family: "Tacos amarillos", size: "140 x 70mm", cut: null, color: "Amarillo", system: "Adhesivo" },
  { code: "AB133K", ean: "0736372495259", name: "Taco de lijado N3 base goma", category: "Tacos", family: "Tacos amarillos", size: "210 x 70mm", cut: null, color: "Amarillo", system: "Adhesivo" },
  { code: "AB136K", ean: "0736372495266", name: "Taco de lijado N6 base goma", category: "Tacos", family: "Tacos amarillos", size: "420 x 70mm", cut: null, color: "Amarillo", system: "Adhesivo" }
];

const promos = [
  {
    title: "Kit corte intenso",
    subtitle: "Para correccion inicial en repintado y marcas de lijado.",
    badge: "Taller chapa y pintura",
    products: ["PX866K", "PA165K", "DB061K"]
  },
  {
    title: "Kit terminacion completa",
    subtitle: "Blanco, celeste y negro para pasar de correccion a brillo final.",
    badge: "Pulido profesional",
    products: ["PB151K", "PB152K", "PB153K"]
  },
  {
    title: "Kit detailing y accesorios",
    subtitle: "Soporte, aplicadores e interfaz para trabajos de acabado.",
    badge: "Detalle y mantenimiento",
    products: ["DL046H", "SI514A", "DB251K"]
  }
];

const state = {
  category: "Todos",
  search: "",
  cut: "",
  size: "",
  sort: "featured",
  cart: JSON.parse(localStorage.getItem("kmCart") || "{}")
};

const els = {
  categoryFilters: document.querySelector("#categoryFilters"),
  cutFilter: document.querySelector("#cutFilter"),
  sizeFilter: document.querySelector("#sizeFilter"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  productGrid: document.querySelector("#productGrid"),
  promoGrid: document.querySelector("#promoGrid"),
  resultCount: document.querySelector("#resultCount"),
  productTotal: document.querySelector("#productTotal"),
  cartCount: document.querySelector("#cartCount"),
  cartDrawer: document.querySelector("#cartDrawer"),
  cartItems: document.querySelector("#cartItems"),
  cartEmpty: document.querySelector("#cartEmpty"),
  whatsAppLink: document.querySelector("#whatsAppLink"),
  toast: document.querySelector("#toast")
};

function init() {
  els.productTotal.textContent = products.length;
  renderCategoryFilters();
  renderSelectOptions();
  renderPromos();
  renderProducts();
  renderCart();
  bindEvents();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

function bindEvents() {
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

  document.querySelector("#clearFilters").addEventListener("click", () => {
    state.category = "Todos";
    state.search = "";
    state.cut = "";
    state.size = "";
    state.sort = "featured";
    els.searchInput.value = "";
    els.cutFilter.value = "";
    els.sizeFilter.value = "";
    els.sortSelect.value = "featured";
    renderCategoryFilters();
    renderProducts();
  });

  document.querySelector("#openCart").addEventListener("click", openCart);
  document.querySelector("#closeCart").addEventListener("click", closeCart);
  els.cartDrawer.addEventListener("click", (event) => {
    if (event.target === els.cartDrawer) closeCart();
  });
  document.querySelector("#clearCart").addEventListener("click", () => {
    state.cart = {};
    saveCart();
    renderCart();
  });
  document.querySelector("#copyOrder").addEventListener("click", copyOrderSummary);
  document.querySelector("#orderForm").addEventListener("submit", submitOrder);
}

function renderCategoryFilters() {
  const categories = ["Todos", ...new Set(products.map((product) => product.category))];
  els.categoryFilters.innerHTML = categories
    .map((category) => `<button type="button" class="${category === state.category ? "active" : ""}" data-category="${category}">${category}</button>`)
    .join("");
  els.categoryFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderCategoryFilters();
      renderProducts();
    });
  });
}

function renderSelectOptions() {
  const cuts = [...new Set(products.map((product) => product.cut).filter(Boolean))].sort((a, b) => b - a);
  const sizes = [...new Set(products.map((product) => product.size))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  els.cutFilter.innerHTML = `<option value="">Todos</option>${cuts.map((cut) => `<option value="${cut}">${cut}</option>`).join("")}`;
  els.sizeFilter.innerHTML = `<option value="">Todas</option>${sizes.map((size) => `<option value="${size}">${size}</option>`).join("")}`;
}

function renderPromos() {
  els.promoGrid.innerHTML = promos
    .map((promo) => {
      const items = promo.products.map(findProduct).filter(Boolean);
      return `
        <article class="promo-card">
          <div>
            <strong>${promo.badge}</strong>
            <h3>${promo.title}</h3>
            <p>${promo.subtitle}</p>
          </div>
          <div class="promo-products">
            ${items.map((item) => `<span class="tag ${tagClass(item)}">${item.code}</span>`).join("")}
          </div>
          <button class="add-button" type="button" data-promo="${promo.title}">Agregar kit</button>
        </article>
      `;
    })
    .join("");

  els.promoGrid.querySelectorAll("[data-promo]").forEach((button) => {
    button.addEventListener("click", () => {
      const promo = promos.find((item) => item.title === button.dataset.promo);
      promo.products.forEach((code) => addToCart(code, 1));
      openCart();
      showToast("Kit agregado al pedido.");
    });
  });
}

function renderProducts() {
  let filtered = products.filter((product) => {
    const haystack = `${product.code} ${product.ean} ${product.name} ${product.family} ${product.category} ${product.color} ${product.system}`.toLowerCase();
    const categoryMatch = state.category === "Todos" || product.category === state.category;
    const searchMatch = !state.search || haystack.includes(state.search);
    const cutMatch = !state.cut || String(product.cut) === state.cut;
    const sizeMatch = !state.size || product.size === state.size;
    return categoryMatch && searchMatch && cutMatch && sizeMatch;
  });

  filtered = sortProducts(filtered);
  els.resultCount.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    els.productGrid.innerHTML = `<article class="product-card"><div class="product-body"><h3>Sin resultados</h3><p>Proba cambiar la busqueda o limpiar los filtros.</p></div></article>`;
    return;
  }

  els.productGrid.innerHTML = filtered.map(renderProductCard).join("");
  els.productGrid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.add;
      const input = document.querySelector(`[data-qty="${code}"]`);
      addToCart(code, Number(input.value || 1));
      showToast(`${code} agregado al pedido.`);
    });
  });
  els.productGrid.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`[data-qty="${button.dataset.code}"]`);
      const next = Math.max(1, Number(input.value || 1) + Number(button.dataset.step));
      input.value = next;
    });
  });
}

function renderProductCard(product) {
  const cut = product.cut ? `<span class="tag yellow">Corte ${product.cut}</span>` : "";
  return `
    <article class="product-card">
      <div class="product-visual ${product.category.toLowerCase()}">
        <span class="product-code">${product.code}</span>
      </div>
      <div class="product-body">
        <h3>${product.name}</h3>
        <p>${product.family} - ${product.system}. EAN ${product.ean}.</p>
        <div class="meta-line">
          <span class="tag ${tagClass(product)}">${product.category}</span>
          <span class="tag">${product.size}</span>
          ${cut}
          <span class="tag">${product.color}</span>
        </div>
      </div>
      <div class="product-actions">
        <div class="qty-control">
          <button type="button" data-step="-1" data-code="${product.code}" aria-label="Restar cantidad">-</button>
          <input data-qty="${product.code}" value="1" inputmode="numeric" aria-label="Cantidad para ${product.code}" />
          <button type="button" data-step="1" data-code="${product.code}" aria-label="Sumar cantidad">+</button>
        </div>
        <button class="add-button" type="button" data-add="${product.code}">Agregar</button>
      </div>
    </article>
  `;
}

function sortProducts(items) {
  const sorted = [...items];
  if (state.sort === "code") sorted.sort((a, b) => a.code.localeCompare(b.code));
  if (state.sort === "cut-desc") sorted.sort((a, b) => (b.cut || 0) - (a.cut || 0));
  if (state.sort === "cut-asc") sorted.sort((a, b) => (a.cut || 0) - (b.cut || 0));
  return sorted;
}

function addToCart(code, qty = 1) {
  state.cart[code] = (state.cart[code] || 0) + Math.max(1, qty);
  saveCart();
  renderCart();
}

function removeFromCart(code) {
  delete state.cart[code];
  saveCart();
  renderCart();
}

function saveCart() {
  localStorage.setItem("kmCart", JSON.stringify(state.cart));
}

function renderCart() {
  const lines = Object.entries(state.cart)
    .map(([code, qty]) => ({ ...findProduct(code), qty }))
    .filter((item) => item.code);

  const totalQty = lines.reduce((sum, item) => sum + item.qty, 0);
  els.cartCount.textContent = totalQty;
  els.cartEmpty.hidden = lines.length > 0;

  els.cartItems.innerHTML = lines
    .map((item) => `
      <div class="cart-line">
        <div>
          <strong>${item.qty} x ${item.code}</strong>
          <span>${item.name}</span>
        </div>
        <button type="button" data-remove="${item.code}" aria-label="Quitar ${item.code}">x</button>
      </div>
    `)
    .join("");

  els.cartItems.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeFromCart(button.dataset.remove));
  });

  const summary = buildOrderSummary();
  els.whatsAppLink.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
  els.whatsAppLink.classList.toggle("disabled", !lines.length);
}

function buildOrderSummary() {
  const lines = Object.entries(state.cart)
    .map(([code, qty]) => {
      const product = findProduct(code);
      return product ? `- ${qty} x ${product.code} | ${product.name}` : "";
    })
    .filter(Boolean);

  const name = document.querySelector("#customerName")?.value?.trim();
  const phone = document.querySelector("#customerPhone")?.value?.trim();
  const area = document.querySelector("#customerArea")?.value?.trim();
  const notes = document.querySelector("#customerNotes")?.value?.trim();

  return [
    "Pedido KM Detail Line",
    `Web: ${SITE_URL}`,
    name ? `Cliente: ${name}` : "",
    phone ? `Telefono: ${phone}` : "",
    area ? `Zona: ${area}` : "",
    "",
    ...lines,
    "",
    notes ? `Observaciones: ${notes}` : "Solicito cotizacion y disponibilidad."
  ].filter((line, index, arr) => line || arr[index - 1]).join("\n");
}

function copyOrderSummary() {
  const summary = buildOrderSummary();
  navigator.clipboard.writeText(summary).then(
    () => showToast("Resumen copiado."),
    () => showToast("No se pudo copiar automaticamente.")
  );
}

function submitOrder(event) {
  event.preventDefault();
  const summary = buildOrderSummary();
  if (!Object.keys(state.cart).length) {
    showToast("Agrega productos antes de preparar el pedido.");
    return;
  }
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`, "_blank", "noopener,noreferrer");
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
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function findProduct(code) {
  return products.find((product) => product.code === code);
}

function tagClass(product) {
  if (product.category === "Poliespuma") return "blue";
  if (product.category === "Lana") return "green";
  if (product.category === "Accesorios") return "violet";
  if (product.category === "Tacos") return "yellow";
  return "";
}

init();
