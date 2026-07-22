import assert from "node:assert/strict";
import test from "node:test";
import { renderProductDirectoryPage, renderSitemap } from "../server/seo-pages.js";

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

test("sitemap uses real product modification dates instead of today's date", () => {
  const sitemap = renderSitemap(products);
  const productEntry = sitemap.match(/<url>\s*<loc>https:\/\/www\.km-detail\.com\/producto\/seo001k-producto-seo<\/loc>[\s\S]*?<\/url>/)?.[0] || "";
  assert.match(productEntry, /<lastmod>2026-06-19<\/lastmod>/);
});
