import assert from "node:assert/strict";
import test from "node:test";
import { renderProductDirectoryPage, renderSeoLandingPage, renderSitemap } from "../server/seo-pages.js";

const products = [
  {
    kmCode: "SEO001K",
    name: "Producto SEO",
    publicUrl: "/producto/seo001k-producto-seo",
    family: { name: "Familia SEO" },
    measure: "6 IN",
    material: "Lana 100%",
    cutLevel: "95",
    attachmentSystem: "Velcro",
    ean13: "7790000000001",
    primaryImageUrl: "/media/products/seo.webp",
    updatedAt: "2026-06-18 10:30:00",
    images: [
      { url: "/media/products/seo.webp", altText: "Producto SEO", updatedAt: "2026-06-19 11:00:00" },
      { url: "/media/products/seo-2.webp", altText: "Producto SEO vista secundaria", updatedAt: "2026-06-19 11:00:00" }
    ]
  }
];

test("product directory exposes product cards without publishing individual technical sheets", () => {
  const html = renderProductDirectoryPage(products);
  assert.match(html, /<h1>Productos profesionales KM Detail Line<\/h1>/);
  assert.match(html, /<h2>Familia SEO<\/h2>/);
  assert.match(html, /id="producto-seo001k"/);
  assert.doesNotMatch(html, /href="\/producto\//);
  assert.doesNotMatch(html, /ficha tecnica/i);
  assert.match(html, /"numberOfItems":1/);
  assert.match(html, /class="seo-product-directory-main-image"/);
  assert.match(html, /seo-2\.webp/);
  assert.match(html, /Lana 100%/);
  assert.match(html, /Corte 95/);
  assert.match(html, /EAN 7790000000001/);
  assert.doesNotMatch(html, /Precio|\$|priceCurrency|"offers"/);
});

test("technical landing pages show relevant cards without individual product links or prices", () => {
  const html = renderSeoLandingPage("/pads-de-espuma-para-pulido", [{
    ...products[0],
    ean13: "7790000000001",
    family: { name: "Pad poliespuma con velcro" }
  }]);
  assert.match(html, /Productos de esta linea/);
  assert.match(html, /id="producto-seo001k"/);
  assert.doesNotMatch(html, /href="\/producto\//);
  assert.match(html, /EAN 7790000000001/);
  assert.match(html, /"@type":"ItemList"/);
  assert.doesNotMatch(html, /"@type":"Product"/);
  assert.doesNotMatch(html, /"offers"|priceCurrency|Precio/);
});

test("sitemap removes individual technical sheets and keeps their images in the directory", () => {
  const sitemap = renderSitemap(products);
  assert.doesNotMatch(sitemap, /\/producto\//);
  const directoryEntry = sitemap.match(/<url>\s*<loc>https:\/\/www\.km-detail\.com\/productos<\/loc>[\s\S]*?<\/url>/)?.[0] || "";
  assert.match(directoryEntry, /seo\.webp/);
  assert.match(directoryEntry, /seo-2\.webp/);
});
