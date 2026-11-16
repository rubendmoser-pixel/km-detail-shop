import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { createScheduledPriceListWord } from "../server/services/price-list-word-service.js";

test("Word embeds PNG, JPEG and WebP photos and keeps prices editable", async (t) => {
  const uploadsPath = await fs.mkdtemp(path.join(os.tmpdir(), "km-word-"));
  t.after(() => fs.rm(uploadsPath, { recursive: true, force: true }));
  await fs.mkdir(path.join(uploadsPath, "products"));
  for (const [extension, background] of [["png", "red"], ["jpg", "blue"], ["webp", "green"]]) {
    await sharp({ create: { width: 120, height: 240, channels: 3, background } })
      .toFile(path.join(uploadsPath, "products", `product.${extension}`));
  }
  const { buffer, filename, contentType } = await createScheduledPriceListWord({
    effectiveDate: "2026-11-16",
    items: [
      { kmCode: "KM001", name: "Pad & espuma <fino>", familyName: "Pulido", measure: '6 pulgadas', ean13: "7791234567890", newPriceCents: 123456, primaryImageFilename: "product.png", secondaryImageFilename: "product.jpg" },
      { kmCode: "KM002", name: "Cera", familyName: "Terminación", newPriceCents: 234567, primaryImageFilename: "product.webp" }
    ]
  }, { uploadsPath });
  assert.equal(filename, "Lista-precios-KM-2026-11-16.docx");
  assert.match(contentType, /wordprocessingml/);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /Pad &amp; espuma &lt;fino&gt;/);
  assert.match(xml, /1\.234,56/);
  assert.match(xml, /2\.345,67/);
  assert.match(xml, /16\/11\/2026/);
  assert.match(xml, /7791234567890/);
  assert.match(xml, /Terminación/);
  const media = Object.keys(zip.files).filter((name) => /^word\/media\/.+\.jpg$/.test(name));
  assert.equal(media.length, 4, "logo and all three product images must be embedded");
  for (const name of media) {
    const metadata = await sharp(await zip.file(name).async("nodebuffer")).metadata();
    assert.equal(metadata.format, "jpeg");
  }
  const relationships = await zip.file("word/_rels/document.xml.rels").async("string");
  assert.doesNotMatch(relationships, /TargetMode="External"/);
  assert.doesNotMatch(xml, /Imagen no disponible|Sin imagen/);
});

test("Word tolerates missing photos and rejects paths outside product uploads", async (t) => {
  const uploadsPath = await fs.mkdtemp(path.join(os.tmpdir(), "km-word-missing-"));
  t.after(() => fs.rm(uploadsPath, { recursive: true, force: true }));
  await fs.mkdir(path.join(uploadsPath, "products"));
  await sharp({ create: { width: 30, height: 30, channels: 3, background: "red" } }).png().toFile(path.join(uploadsPath, "private.png"));
  await fs.writeFile(path.join(uploadsPath, "products", "broken.png"), "not an image");
  const { buffer } = await createScheduledPriceListWord({
    effectiveDate: "2026-11-16",
    items: [
      { kmCode: "A", newPriceCents: 100, primaryImageFilename: "../private.png" },
      { kmCode: "B", newPriceCents: 200, primaryImageFilename: "missing.png" },
      { kmCode: "C", newPriceCents: 300, primaryImageFilename: "broken.png" },
      { kmCode: "D", newPriceCents: 400 }
    ]
  }, { uploadsPath });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");
  assert.equal((xml.match(/Imagen no disponible/g) || []).length, 3);
  assert.match(xml, /Sin imagen/);
  assert.equal(Object.keys(zip.files).filter((name) => /^word\/media\/.+\.jpg$/.test(name)).length, 1);
});
