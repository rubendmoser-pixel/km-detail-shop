import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun,
  Packer, PageNumber, Paragraph, Table, TableCell, TableLayoutType,
  TableRow, TextRun, VerticalAlign, WidthType
} from "docx";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const columns = [2800, 4450, 2250];
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Only local product uploads are eligible. Never fetch URLs from product data.
async function productImage(filename, uploadsPath) {
  if (!filename || !uploadsPath || !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:png|jpe?g|webp)$/i.test(filename)) return null;
  try {
    const directory = await fs.realpath(path.join(uploadsPath, "products"));
    const imagePath = await fs.realpath(path.join(directory, filename));
    if (path.dirname(imagePath) !== directory) return null;
    const stat = await fs.stat(imagePath);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return null;
    return await sharp(await fs.readFile(imagePath), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 480, height: 320, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // A missing or damaged photo must not prevent downloading the other products.
    return null;
  }
}

function paragraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 70 },
    ...options,
    children: [new TextRun({ text: String(text ?? ""), ...(options.run || {}) })]
  });
}

function imageRun(image, maxWidth, maxHeight, label) {
  const scale = Math.min(maxWidth / image.info.width, maxHeight / image.info.height);
  return new ImageRun({
    data: image.data,
    type: "jpg",
    transformation: { width: Math.max(1, Math.round(image.info.width * scale)), height: Math.max(1, Math.round(image.info.height * scale)) },
    altText: { name: label, title: label, description: label }
  });
}

function cell(children, width, { header = false, shaded = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    borders: { top: border, bottom: border, left: border, right: border },
    shading: { fill: header ? "292D32" : shaded ? "F5F6F7" : "FFFFFF" },
    children
  });
}

async function productRow(item, uploadsPath, index) {
  const filenames = [item.primaryImageFilename, item.secondaryImageFilename].filter(Boolean);
  const images = [];
  // Keep image decoding sequential to bound memory use on the production server.
  for (const filename of filenames) images.push(await productImage(filename, uploadsPath));
  const imageChildren = [];
  for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
    if (!images[imageIndex]) continue;
    if (imageChildren.length) imageChildren.push(new TextRun(" "));
    imageChildren.push(imageRun(images[imageIndex], filenames.length > 1 ? 78 : 160, 105, `${item.kmCode} - imagen ${imageIndex + 1}`));
  }
  const photoParagraphs = imageChildren.length
    ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: imageChildren })]
    : [];
  if (!filenames.length || images.some((image) => !image)) {
    photoParagraphs.push(paragraph(filenames.length ? "Imagen no disponible" : "Sin imagen", {
      alignment: AlignmentType.CENTER, run: { size: 18, color: "666666" }
    }));
  }
  const details = [
    paragraph(item.kmCode, { run: { bold: true, size: 22 } }),
    paragraph(item.name || "Producto KM", { run: { size: 21 } })
  ];
  if (item.measure) details.push(paragraph(`Medida: ${item.measure}`, { run: { size: 18 } }));
  if (item.ean13) details.push(paragraph(`EAN: ${item.ean13}`, { run: { size: 18, color: "555555" } }));
  const shaded = index % 2 === 1;
  return new TableRow({
    cantSplit: true,
    children: [
      cell(photoParagraphs, columns[0], { shaded }),
      cell(details, columns[1], { shaded }),
      cell([
        paragraph(money.format(Number(item.newPriceCents || 0) / 100), { alignment: AlignmentType.RIGHT, run: { bold: true, size: 22 } }),
        paragraph("+ IVA", { alignment: AlignmentType.RIGHT, run: { size: 18, color: "555555" } })
      ], columns[2], { shaded })
    ]
  });
}

export async function createScheduledPriceListWord(batch, { uploadsPath } = {}) {
  const items = Array.isArray(batch?.items) ? batch.items : [];
  const effectiveDate = String(batch?.effectiveDate || "").slice(0, 10);
  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    ? effectiveDate.split("-").reverse().join("/") : "Sin fecha";
  const children = [];
  const logo = await sharp(path.join(projectRoot, "assets/km-logo-solid-black-v2.png"))
    .resize({ width: 360, height: 100, fit: "inside" })
    .flatten({ background: "#ffffff" }).jpeg().toBuffer({ resolveWithObject: true });
  children.push(new Paragraph({ spacing: { after: 120 }, children: [imageRun(logo, 180, 50, "KM Detail Line")] }));
  children.push(paragraph("Lista de precios", { heading: HeadingLevel.TITLE }));
  children.push(paragraph(`Vigencia desde ${formattedDate}`, { run: { bold: true } }));
  children.push(paragraph("Precios de lista en pesos argentinos + IVA", { run: { size: 20 } }));

  const families = new Map();
  for (const item of items) {
    const family = item.familyName || "KM Detail Line";
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(item);
  }
  let familyIndex = 0;
  for (const [family, products] of families) {
    children.push(paragraph(family, {
      heading: HeadingLevel.HEADING_1, pageBreakBefore: familyIndex++ > 0,
      keepNext: true, spacing: { before: 160, after: 120 }
    }));
    const rows = [new TableRow({
      tableHeader: true, cantSplit: true,
      children: ["Imágenes", "Producto", "Precio de lista"].map((title, index) => cell([
        paragraph(title, { alignment: index === 2 ? AlignmentType.RIGHT : AlignmentType.LEFT, run: { bold: true, color: "FFFFFF", size: 20 } })
      ], columns[index], { header: true }))
    })];
    for (let index = 0; index < products.length; index += 1) rows.push(await productRow(products[index], uploadsPath, index));
    children.push(new Table({ rows, width: { size: 9500, type: WidthType.DXA }, columnWidths: columns, layout: TableLayoutType.FIXED }));
    children.push(new Paragraph({ spacing: { after: 0 } }));
  }
  if (!items.length) children.push(paragraph("La lista no contiene productos."));

  const document = new Document({
    creator: "KM Detail Line", title: "Lista de precios KM Detail Line",
    description: "Lista de precios con imágenes", language: "es-AR",
    styles: {
      default: { document: { run: { font: "Arial", size: 21, color: "000000" }, paragraph: { spacing: { after: 70 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 36, bold: true, color: "000000" }, paragraph: { spacing: { after: 160 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 27, bold: true, color: "000000" } }
      ]
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1203, right: 1203, footer: 450 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "KM Detail Line · Página ", size: 17 }), new TextRun({ children: [PageNumber.CURRENT], size: 17 }), new TextRun({ text: " de ", size: 17 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17 })]
      })] }) },
      children
    }]
  });
  return {
    buffer: await Packer.toBuffer(document),
    filename: `Lista-precios-KM-${/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ? effectiveDate : "programada"}.docx`,
    contentType: WORD_MIME
  };
}
