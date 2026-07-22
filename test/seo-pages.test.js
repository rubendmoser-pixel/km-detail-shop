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
    attachmentSystem: "Velcro",
    primaryImageUrl: "/media/products/seo.webp",
    updatedAt: "2026-06-18 10:30:00",
    images: [{ url: "/media/products/seo.webp", altText: "Producto SEO", updatedAt: "2026-06-19 11:00:00" }]
  }
];

test("product directory exposes crawlable product and family links", () => {
  const html = renderProductDirectoryPage(products);
  assert.match(html, /<h1>Productos profesionales KM Detail Line<\/h1>/);
  assert.match(html, /<h2>Familia SEO<\/h2>/);
  assert.match(html, /href="\/producto\/seo001k-producto-seo"/);
  assert.match(html, /"numberOfItems":1/);
});

test("technical landing pages link relevant products without exposing prices", () => {
  const html = renderSeoLandingPage("/pads-de-espuma-para-pulido", [{
    ...products[0],
    ean13: "7790000000001",
    family: { name: "Pad poliespuma con velcro" }
  }]);
  assert.match(html, /Productos de esta linea/);
  assert.match(html, /href="\/producto\/seo001k-producto-seo"/);
  assert.match(html, /EAN 7790000000001/);
  assert.match(html, /"@type":"ItemList"/);
  assert.doesNotMatch(html, /"@type":"Product"/);
  assert.doesNotMatch(html, /"offers"|priceCurrency|Precio/);
});

test("sitemap uses real product modification dates instead of today's date", () => {
  const sitemap = renderSitemap(products);
  const productEntry = sitemap.match(/<url>\s*<loc>https:\/\/www\.km-detail\.com\/producto\/seo001k-producto-seo<\/loc>[\s\S]*?<\/url>/)?.[0] || "";
  assert.match(productEntry, /<lastmod>2026-06-19<\/lastmod>/);
});
