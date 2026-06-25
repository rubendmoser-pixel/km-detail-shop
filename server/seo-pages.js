const SITE_URL = "https://www.km-detail.com";
const DEFAULT_IMAGE = `${SITE_URL}/assets/km-linea-profesional.png`;

export const seoLandingPages = new Map([
  ["/panos-para-pulir-autos", {
    title: "Panos para pulir autos | KM Detail Line",
    description: "Panos, boinas y pads fabricados para pulido automotriz profesional. Corte, correccion, abrillantado y terminacion KM Detail Line.",
    eyebrow: "Pulido automotriz",
    heading: "Panos para pulir autos",
    lead: "Linea profesional de panos, boinas y pads fabricados para pulido automotriz, correccion, abrillantado y terminacion. Comercializacion a traves de distribuidores, pinturerias y comercios especializados.",
    sections: [
      {
        title: "Corte, correccion y terminacion",
        body: "KM Detail Line organiza los panos por funcion dentro del proceso: corte inicial, correccion de pintura, pulido intermedio, abrillantado y acabado final. Esta lectura tecnica ayuda a elegir el producto correcto segun superficie, herramienta y nivel de terminacion."
      },
      {
        title: "Vocabulario real del rubro",
        body: "En el mercado se buscan como panos para pulir, boinas para pulidora, gorros de lana, pads de lana, panos de corte, panos de brillo o panos para detailing. La linea KM ordena esas busquedas dentro de familias tecnicas claras."
      },
      {
        title: "Canal comercial especializado",
        body: "Los productos son para uso profesional y la comercializacion se realiza a traves de distribuidores, pinturerias y comercios especializados. Los clientes comerciales aprobados acceden al catalogo operativo, precios netos y condiciones comerciales desde la plataforma."
      }
    ],
    faq: [
      ["Que diferencia hay entre pano, boina y pad?", "Son nombres que el mercado usa para productos de pulido. La diferencia concreta depende de material, medida, sistema de sujecion y funcion dentro del proceso."],
      ["KM Detail Line vende al consumidor final?", "No. KM fabrica productos para uso profesional y los comercializa a traves de distribuidores, pinturerias y comercios especializados."]
    ],
    keywords: ["pano para pulir auto", "panos para pulido automotriz", "boina para pulidora", "gorro de lana", "pad de lana", "pano de corte", "pano de abrillantado", "pano de terminacion", "pulido automotriz profesional"]
  }],
  ["/gorros-de-lana-para-pulidora", {
    title: "Gorros de lana para pulidora | KM Detail Line",
    description: "Gorros, boinas, panos y pads de lana para pulidora rotativa. Alto corte para pulido automotriz, repintado y detailing profesional.",
    eyebrow: "Lana profesional",
    heading: "Gorros de lana para pulidora",
    lead: "Productos de lana para procesos de alto corte, correccion de pintura y trabajo profesional con pulidora en chapa-pintura, repintado automotriz y detailing.",
    sections: [
      {
        title: "Lana para corte controlado",
        body: "La linea de lana KM incluye soluciones para corte inicial, correccion pesada y trabajo sobre pinturas que requieren remocion eficiente de marcas. Tambien contempla alternativas con backing integrado, velcro o rosca segun la herramienta utilizada."
      },
      {
        title: "Gorro, boina, pad o pano",
        body: "En el mercado se usan distintos nombres para productos similares: gorro de lana, boina de lana, pad de lana o pano de lana. KM estructura la informacion para identificar rapido la funcion, medida y sistema de sujecion de cada producto profesional."
      },
      {
        title: "Aplicacion profesional",
        body: "Las lanas trabajan en procesos donde importan corte, temperatura, control de marcas y preparacion para etapas posteriores de pulido, abrillantado o terminacion."
      }
    ],
    faq: [
      ["Para que se usa una boina de lana?", "Se utiliza principalmente para corte y correccion en procesos de pulido profesional."],
      ["Que herramientas usan estos productos?", "Segun el producto, pueden utilizarse con pulidoras rotativas o sistemas compatibles con velcro, backing o rosca."]
    ],
    keywords: ["gorro de lana para pulidora", "boina de lana para pulidora", "pad de lana para pulido", "lana para pulidora", "gorro de lana alto corte", "pano de lana", "boina de corte", "lana para detailing"]
  }],
  ["/pads-de-espuma-para-pulido", {
    title: "Pads de espuma para pulido | KM Detail Line",
    description: "Pads de espuma, poliespumas y esponjas fabricadas para pulido, abrillantado y terminacion automotriz profesional.",
    eyebrow: "Poliespumas",
    heading: "Pads de espuma para pulido",
    lead: "Poliespumas, pads de espuma y esponjas para etapas de corte medio, pulido intermedio, abrillantado y terminacion sin hologramas en procesos profesionales.",
    sections: [
      {
        title: "Espumas por etapa de trabajo",
        body: "Las poliespumas KM se integran al sistema de pulido para controlar corte, temperatura, acabado y terminacion. La seleccion correcta permite reducir marcas, mejorar brillo y ordenar el proceso de trabajo."
      },
      {
        title: "Corte, brillo y acabado final",
        body: "El mercado profesional busca pads de corte, pads de pulido, pads de terminacion, esponjas para pulidora, poliespumas de abrillantado y accesorios para detailing. KM agrupa estas variantes dentro de una linea tecnica fabricada para procesos profesionales."
      },
      {
        title: "Detalle tecnico para el canal",
        body: "Cada producto puede identificarse por familia, medida, corte, sistema de sujecion y uso recomendado. El objetivo es que el canal comercial pueda vender y asesorar una linea tecnica pensada para usuarios profesionales."
      }
    ],
    faq: [
      ["Como elegir un pad de espuma?", "La eleccion depende de la etapa de trabajo: corte, correccion, pulido intermedio, abrillantado o terminacion."],
      ["Las poliespumas son para uso profesional?", "Si. La linea esta fabricada para procesos profesionales de pulido, abrillantado y terminacion automotriz."]
    ],
    keywords: ["pad de espuma para pulido", "poliespuma para pulido", "esponja para pulidora", "pad de abrillantado", "pad de terminacion", "pad para eliminar hologramas", "pad para detailing", "pad de corte medio"]
  }],
  ["/backings-para-pulidora", {
    title: "Backings para pulidora | KM Detail Line",
    description: "Backings, platos y soportes para pulidora. Rosca 14 x 2, velcro, flexibles y ultra flex para pulido automotriz profesional.",
    eyebrow: "Soportes",
    heading: "Backings para pulidora",
    lead: "Backings, platos soporte y bases para pulidora pensados para controlar apoyo, flexibilidad, sujecion y estabilidad durante el pulido profesional.",
    sections: [
      {
        title: "Rosca, velcro y flexibilidad",
        body: "La linea de backings KM contempla alternativas con rosca 14 x 2, velcro, modelos flexibles y ultra flex para adaptarse a distintas superficies, herramientas y etapas de trabajo."
      },
      {
        title: "Parte del sistema de pulido",
        body: "El backing no es un accesorio aislado: define como trabaja el pad o pano sobre la superficie. Por eso KM lo integra dentro de un sistema tecnico junto con lanas, poliespumas e interfaces."
      },
      {
        title: "Busqueda por nombre tecnico y comercial",
        body: "El mercado tambien busca plato para pulidora, soporte para pad, base velcro, respaldo para pulidora o backing flexible. La pagina esta preparada para cubrir esas variantes sin duplicar contenido."
      }
    ],
    faq: [
      ["Que significa rosca 14 x 2?", "Es una medida de rosca estandar utilizada en accesorios y platos para pulidora compatibles."],
      ["Para que sirve un backing flexible?", "Permite mejorar el apoyo del pad o pano sobre superficies con curvaturas o zonas de trabajo delicadas."]
    ],
    keywords: ["backing para pulidora", "plato para pulidora", "soporte para pad", "backing rosca 14", "backing flexible", "backing ultra flex", "base velcro para pulidora", "respaldo para pulidora"]
  }],
  ["/tacos-de-lijado-automotriz", {
    title: "Tacos de lijado automotriz | KM Detail Line",
    description: "Tacos de lijado automotriz para chapa-pintura, repintado y preparacion de superficies. Canal profesional KM Detail Line.",
    eyebrow: "Lijado tecnico",
    heading: "Tacos de lijado automotriz",
    lead: "Tacos de lijado para preparacion de superficies, chapa-pintura, repintado automotriz y trabajos tecnicos donde el control manual es clave.",
    sections: [
      {
        title: "Lijado manual profesional",
        body: "Los tacos de lijado ayudan a controlar presion, apoyo y terminacion en procesos de preparacion, primer, barniz y correccion previa al acabado final."
      },
      {
        title: "Compatibilidad con sistemas abrasivos",
        body: "La linea contempla soluciones para lija, velcro, adhesivo reposicionable y formatos tecnicos orientados al uso profesional en preparacion de superficies y repintado automotriz."
      },
      {
        title: "Preparacion y terminacion",
        body: "El lijado automotriz se vincula con chapa-pintura, repintado, correccion de defectos, acabado manual y preparacion de superficies antes del pulido final."
      }
    ],
    faq: [
      ["Para que sirve un taco de lijado?", "Sirve para controlar el apoyo y la presion de la lija durante trabajos de preparacion o terminacion."],
      ["Se usa en chapa-pintura?", "Si. Es una herramienta de apoyo para procesos de repintado y preparacion de superficies."]
    ],
    keywords: ["taco de lijado automotriz", "taco para lija", "taco para chapa y pintura", "taco con velcro", "taco 70 mm", "taco para repintado", "lijado automotriz", "preparacion de superficies"]
  }],
  ["/insumos-para-chapa-y-pintura", {
    title: "Insumos para chapa y pintura | KM Detail Line",
    description: "Insumos profesionales para chapa-pintura, repintado automotriz, pulido, lijado y terminacion. Venta por canal especializado.",
    eyebrow: "Chapa-pintura",
    heading: "Insumos para chapa y pintura",
    lead: "Linea tecnica fabricada para procesos profesionales de repintado, correccion, pulido y terminacion en chapa-pintura.",
    sections: [
      {
        title: "Productos para repintado automotriz",
        body: "KM Detail Line integra panos, pads, poliespumas, interfaces, backings, aplicadores y tacos de lijado para acompanar distintas etapas del proceso de chapa-pintura."
      },
      {
        title: "Del lijado al acabado final",
        body: "La propuesta cubre preparacion de superficies, soporte de herramientas, correccion, pulido intermedio, abrillantado y aplicacion manual dentro de procesos profesionales."
      },
      {
        title: "Venta exclusiva por canal",
        body: "La plataforma esta pensada para cuentas comerciales aprobadas. KM fabrica productos para uso profesional y desarrolla su comercializacion a traves de distribuidores, pinturerias y comercios especializados."
      }
    ],
    faq: [
      ["KM fabrica insumos para uso profesional?", "Si. KM Detail Line fabrica una linea tecnica para procesos profesionales de pulido, chapa-pintura, repintado y detailing."],
      ["Los precios publicados incluyen IVA?", "Los precios comerciales de la plataforma no incluyen IVA y se muestran solo a cuentas aprobadas."]
    ],
    keywords: ["productos para chapa y pintura", "insumos para chapa y pintura", "productos para repintado automotriz", "pads para chapa y pintura", "interfaces para lijado", "productos para talleres de pintura", "insumos para pinturerias", "pulido para repintado"]
  }],
  ["/productos-para-detailing-profesional", {
    title: "Productos para detailing profesional | KM Detail Line",
    description: "Productos e insumos fabricados para detailing profesional, pulido automotriz, abrillantado, terminacion y aplicacion.",
    eyebrow: "Detailing profesional",
    heading: "Productos para detailing profesional",
    lead: "Insumos profesionales para detailing, pulido, abrillantado, terminacion, aplicacion y mantenimiento de procesos tecnicos sobre pintura automotriz.",
    sections: [
      {
        title: "Sistema para procesos de detailing",
        body: "La linea KM permite ordenar productos por funcion: corte, correccion, pulido intermedio, brillo, terminacion, soporte y aplicacion. Esto ayuda a trabajar procesos profesionales con criterio tecnico."
      },
      {
        title: "No son productos aislados",
        body: "El objetivo es construir una lectura por proceso: que producto usar, en que etapa, con que soporte y para que nivel de acabado. Esa organizacion mejora el uso profesional y la venta tecnica en comercios especializados."
      },
      {
        title: "Fabricante y canal especializado",
        body: "KM Detail Line fabrica productos para uso profesional y busca fortalecer su red comercial en Argentina y Sudamerica junto a distribuidores, pinturerias y comercios especializados."
      }
    ],
    faq: [
      ["Que productos incluye la linea para detailing?", "Incluye panos, pads, poliespumas, backings, interfaces, aplicadores y productos de soporte para procesos de terminacion."],
      ["Como se opera comercialmente?", "Los clientes aprobados consultan precios netos y arman pedidos desde la plataforma. La coordinacion se realiza por email y WhatsApp."]
    ],
    keywords: ["productos para detailing profesional", "insumos para detailing", "pads para detailing", "panos para detailing", "aplicadores para detailing", "productos para pulido detailing", "abrillantado automotriz", "terminacion automotriz"]
  }]
]);

export function renderSeoLandingPage(pathname) {
  const page = seoLandingPages.get(pathname);
  if (!page) return null;
  const url = `${SITE_URL}${pathname}`;
  const graph = [
    organizationSchema(),
    websiteSchema(),
    breadcrumbSchema([
      ["Inicio", SITE_URL],
      [page.heading, url]
    ]),
    {
      "@type": "CollectionPage",
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      image: DEFAULT_IMAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "es-AR",
      keywords: page.keywords.join(", ")
    },
    faqSchema(page.faq)
  ].filter(Boolean);

  return layout({
    title: page.title,
    description: page.description,
    url,
    image: DEFAULT_IMAGE,
    schemaGraph: graph,
    main: `
      <section class="section company-section commercial-section seo-landing">
        <div class="section-visual company-visual">
          <img src="/assets/km-linea-profesional.png" alt="${escapeHtml(page.heading)}" />
          <div class="section-visual-content">
            <div class="company-heading">
              <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
              <h1>${escapeHtml(page.heading)}</h1>
              <p>${escapeHtml(page.lead)}</p>
            </div>
            <div class="company-story">
              ${page.sections.map((section) => `<article><strong>${escapeHtml(section.title)}</strong><p>${escapeHtml(section.body)}</p></article>`).join("")}
              <article class="seo-keyword-card">
                <strong>Busquedas relacionadas</strong>
                <p>${page.keywords.map(escapeHtml).join(" | ")}</p>
              </article>
            </div>
            ${renderFaq(page.faq)}
            ${renderSeoLinks(pathname)}
          </div>
        </div>
      </section>`
  });
}

export function renderProductPage(product) {
  if (!product) return null;
  const url = `${SITE_URL}${product.publicUrl}`;
  const image = absoluteUrl(product.primaryImageUrl) || DEFAULT_IMAGE;
  const title = `${product.kmCode} | ${product.name} | KM Detail Line`;
  const description = [
    product.name,
    product.family?.name,
    product.measure,
    product.attachmentSystem,
    product.ean13 ? `EAN ${product.ean13}` : "",
    "Producto profesional fabricado por KM Detail Line."
  ].filter(Boolean).join(" - ");
  const specs = [
    ["Codigo KM", product.kmCode],
    ["EAN", product.ean13],
    ["Familia", product.family?.name],
    ["Subfamilia", product.subfamily],
    ["Material", product.material],
    ["Medida", product.measure],
    ["Corte", product.cutLevel],
    ["Sistema", product.attachmentSystem],
    ["Color", product.color],
    ["Maquina compatible", product.compatibleMachine]
  ].filter(([, value]) => Boolean(value));
  const gallery = product.images?.length ? product.images : (product.primaryImageUrl ? [{ url: product.primaryImageUrl, altText: product.name }] : []);
  const relatedProducts = product.relatedProducts || [];
  const hasGallery = gallery.length > 0;
  const mediaBlock = hasGallery ? `
          <div class="product-seo-media">
            <figure><img src="${escapeHtml(gallery[0].url)}" alt="${escapeHtml(gallery[0].altText || product.name)}" /></figure>
            ${gallery.length > 1 ? `<div class="product-seo-thumbs">${gallery.slice(0, 6).map((item) => `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.altText || product.name)}" />`).join("")}</div>` : ""}
          </div>` : "";
  const graph = [
    organizationSchema(),
    websiteSchema(),
    breadcrumbSchema([
      ["Inicio", SITE_URL],
      ["Productos", `${SITE_URL}/productos`],
      [product.name, url]
    ]),
    {
      "@type": "Product",
      "@id": `${url}#product`,
      name: product.name,
      sku: product.kmCode,
      gtin13: product.ean13,
      brand: { "@type": "Brand", name: "KM Detail Line" },
      manufacturer: { "@id": `${SITE_URL}/#organization` },
      category: product.family?.name,
      description,
      image: gallery.map((item) => absoluteUrl(item.url)).filter(Boolean),
      url,
      additionalProperty: specs.map(([name, value]) => ({
        "@type": "PropertyValue",
        name,
        value
      })),
      audience: {
        "@type": "BusinessAudience",
        audienceType: "Usuarios profesionales de pulido automotriz, chapa-pintura, repintado y detailing"
      }
    },
    relatedProducts.length ? {
      "@type": "ItemList",
      "@id": `${url}#related-products`,
      name: `Productos relacionados con ${product.kmCode}`,
      itemListElement: relatedProducts.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${item.publicUrl}`,
        name: item.name
      }))
    } : null
  ].filter(Boolean);
  return layout({
    title,
    description,
    url,
    image,
    schemaGraph: graph,
    main: `
      <section class="section product-seo-page">
        <div class="product-seo-shell${hasGallery ? "" : " product-seo-shell-single"}">
          ${mediaBlock}
          <article class="product-seo-content">
            <div class="product-seo-kicker">
              <span class="product-code">${escapeHtml(product.kmCode)}</span>
              <p class="eyebrow">Ficha tecnica KM Detail Line</p>
            </div>
            <h1>${escapeHtml(product.name)}</h1>
            <p class="section-lead">${escapeHtml(description)}</p>
            <div class="meta-line">
              ${product.family?.name ? `<span class="tag">${escapeHtml(product.family.name)}</span>` : ""}
              ${product.measure ? `<span class="tag">${escapeHtml(product.measure)}</span>` : ""}
              ${product.cutLevel ? `<span class="tag yellow">Corte ${escapeHtml(product.cutLevel)}</span>` : ""}
              ${product.attachmentSystem ? `<span class="tag">${escapeHtml(product.attachmentSystem)}</span>` : ""}
            </div>
            <dl class="product-seo-specs">
              ${specs.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
            </dl>
            ${product.recommendedUse ? `<h2>Uso recomendado</h2><p>${escapeHtml(product.recommendedUse)}</p>` : ""}
            ${product.technicalDescription ? `<h2>Descripcion tecnica</h2><p>${escapeHtml(product.technicalDescription)}</p>` : ""}
            <div class="seo-commercial-note">
              <strong>Producto de uso profesional</strong>
              <p>Producto fabricado por KM Detail Line para procesos profesionales. La comercializacion se realiza por canal especializado y los precios comerciales se muestran solo con cuenta aprobada. No incluyen IVA.</p>
              <a class="primary-link" href="/productos">Ver catalogo operativo</a>
            </div>
            ${renderRelatedProducts(relatedProducts)}
          </article>
        </div>
      </section>`
  });
}

export function renderSitemap(products = []) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ["https://www.km-detail.com/", "weekly", "1.0"],
    ["https://www.km-detail.com/empresa", "monthly", "0.7"],
    ["https://www.km-detail.com/productos", "weekly", "0.9"],
    ["https://www.km-detail.com/catalogo-2026", "monthly", "0.8"],
    ["https://www.km-detail.com/distribuidores", "monthly", "0.8"],
    ["https://www.km-detail.com/contacto", "monthly", "0.6"],
    ...[...seoLandingPages.keys()].map((path) => [`${SITE_URL}${path}`, "monthly", "0.8"]),
    ...products.map((product) => [`${SITE_URL}${product.publicUrl}`, "monthly", "0.7"]),
    ["https://www.km-detail.com/assets/catalogo-km-detail-2026.pdf", "monthly", "0.5"]
  ];
  const unique = [...new Map(urls.map((item) => [item[0], item])).values()];
  const productsByUrl = new Map(products.map((product) => [`${SITE_URL}${product.publicUrl}`, product]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${unique.map(([loc, changefreq, priority]) => {
    const product = productsByUrl.get(loc);
    const images = product?.images?.length ? product.images.slice(0, 6) : [];
    const imageNodes = images.map((item) => `    <image:image>\n      <image:loc>${escapeXml(absoluteUrl(item.url))}</image:loc>\n      <image:title>${escapeXml(item.altText || product.name)}</image:title>\n    </image:image>`).join("\n");
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>${imageNodes ? `\n${imageNodes}` : ""}\n  </url>`;
  }).join("\n")}\n</urlset>\n`;
}

function layout({ title, description, url, image, schemaGraph, main }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#111318" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:locale" content="es_AR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="stylesheet" href="/styles.css?v=37" />
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": schemaGraph })}</script>
  </head>
  <body>
    ${header()}
    <main>${main}</main>
  </body>
</html>`;
}

function header() {
  return `<header class="app-header">
      <a class="brand" href="/" aria-label="KM Detail Line">
        <img class="brand-logo" src="/assets/km-metal-logo-small.png" alt="KM" />
        <span class="brand-divider" aria-hidden="true"></span>
        <span><strong>Detail Line</strong></span>
      </a>
      <nav class="top-nav" aria-label="Principal">
        <a href="/">Inicio</a>
        <a href="/empresa">Empresa</a>
        <a href="/productos">Productos</a>
        <a href="/catalogo-2026">Catalogo 2026</a>
        <a href="/distribuidores">Distribuidores</a>
        <a href="/contacto">Contacto</a>
      </nav>
      <div class="header-actions">
        <a class="account-button" href="/productos">Ver productos</a>
      </div>
    </header>`;
}

function renderFaq(faq = []) {
  if (!faq.length) return "";
  return `<div class="seo-faq">
    <p class="eyebrow">Preguntas tecnicas</p>
    <div class="company-story">
      ${faq.map(([question, answer]) => `<article><strong>${escapeHtml(question)}</strong><p>${escapeHtml(answer)}</p></article>`).join("")}
    </div>
  </div>`;
}

function renderSeoLinks(currentPath) {
  const links = [...seoLandingPages.entries()]
    .filter(([path]) => path !== currentPath)
    .slice(0, 6)
    .map(([path, page]) => `<a href="${path}">${escapeHtml(page.heading)}</a>`)
    .join("");
  return `<nav class="seo-related-links" aria-label="Paginas tecnicas relacionadas">
    <span>Tambien puede interesarte</span>
    ${links}
  </nav>`;
}

function renderRelatedProducts(products = []) {
  if (!products.length) return "";
  return `<section class="product-seo-related" aria-label="Productos relacionados">
    <div>
      <p class="eyebrow">Misma linea tecnica</p>
      <h2>Productos relacionados</h2>
    </div>
    <div class="product-seo-related-grid">
      ${products.map((product) => `<a href="${escapeHtml(product.publicUrl)}">
        <span class="product-code">${escapeHtml(product.kmCode)}</span>
        <strong>${escapeHtml(product.name)}</strong>
        <small>${escapeHtml([product.family?.name, product.measure, product.attachmentSystem].filter(Boolean).join(" · "))}</small>
      </a>`).join("")}
    </div>
  </section>`;
}

function organizationSchema() {
  return {
    "@type": ["Organization", "Brand"],
    "@id": `${SITE_URL}/#organization`,
    name: "KM Detail Line",
    description: "Fabricante de insumos profesionales para pulido automotriz, chapa-pintura, repintado y detailing.",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/assets/km-metal-logo.png`,
    email: "ventas@km-detail.com",
    telephone: "+54 9 341 253 1269",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Cordoba 645, piso 10, oficina 7",
      addressLocality: "Rosario",
      addressRegion: "Santa Fe",
      postalCode: "2000",
      addressCountry: "AR"
    },
    areaServed: ["Argentina", "Sudamerica"]
  };
}

function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: "KM Detail Line",
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "es-AR"
  };
}

function breadcrumbSchema(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item
    }))
  };
}

function faqSchema(faq = []) {
  if (!faq.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: faq.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };
}

function absoluteUrl(value) {
  if (!value) return "";
  return value.startsWith("http") ? value : `${SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function escapeXml(value) {
  return escapeHtml(value);
}
