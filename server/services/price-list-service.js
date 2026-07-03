import { Buffer } from "node:buffer";
import { listProducts } from "./product-service.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function createCustomerPriceList(db, user, { publicBaseUrl = "https://www.km-detail.com", now = new Date() } = {}) {
  const products = listProducts(db, user);
  const customerName = user.businessName || user.email || "cliente";
  const generatedDate = now.toISOString().slice(0, 10);
  const rows = products.map((product) => productPriceRow(product, publicBaseUrl));
  const files = workbookFiles({
    title: "KM Detail Line - Lista de precios",
    customerName,
    generatedDate,
    rows
  });

  return {
    buffer: createZip(files),
    filename: `KM-Detail-Line-lista-precios-${filenamePart(customerName)}-${generatedDate}.xlsx`,
    contentType: XLSX_MIME
  };
}

function productPriceRow(product, publicBaseUrl) {
  const discounts = (product.discountsBps || []).filter(Boolean).map(formatBps).join(" + ");
  const promotion = product.promotion?.active ? promotionText(product.promotion) : "";
  return [
    product.kmCode,
    product.ean13,
    product.name,
    product.family?.name,
    product.measure,
    product.attachmentSystem,
    product.cutLevel,
    centsToPesos(product.basePriceCents),
    discounts,
    promotion,
    centsToPesos(product.finalPriceCents),
    "No incluido",
    product.priceEffectiveFrom || "",
    absoluteUrl(publicBaseUrl, product.publicUrl)
  ];
}

function promotionText(promotion) {
  const label = String(promotion.label || "").trim();
  const discount = promotion.bps ? `-${formatBps(promotion.bps)}` : "";
  const range = [promotion.startsAt, promotion.endsAt].filter(Boolean).join(" a ");
  return [label || "Promo", discount, range ? `vigencia ${range}` : ""].filter(Boolean).join(" ");
}

function workbookFiles({ title, customerName, generatedDate, rows }) {
  const headers = [
    "Codigo KM", "EAN", "Producto", "Familia", "Medida", "Sistema", "Corte",
    "Precio lista neto", "Descuentos activos", "Promocion vigente", "Precio final neto",
    "IVA", "Vigencia", "URL producto"
  ];
  const sheetRows = [
    row([title], 1, 1),
    row([`Cliente: ${customerName}`], 2, 2),
    row([`Generada: ${generatedDate}`], 3, 2),
    row(["Precios netos en pesos argentinos. IVA no incluido."], 4, 2),
    row(headers, 5, 3),
    ...rows.map((values, index) => row(values, index + 6, 0))
  ];
  const lastRow = rows.length + 5;
  return [
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: relsXml() },
    { name: "docProps/app.xml", data: appXml() },
    { name: "docProps/core.xml", data: coreXml(generatedDate) },
    { name: "xl/workbook.xml", data: workbookXml() },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml() },
    { name: "xl/styles.xml", data: stylesXml() },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(sheetRows, lastRow) }
  ];
}

function row(values, rowNumber, style) {
  return `<row r="${rowNumber}">${values.map((value, index) => cell(index, rowNumber, value, style, index)).join("")}</row>`;
}

function cell(columnIndex, rowNumber, value, rowStyle, indexInRow) {
  const ref = `${columnName(columnIndex)}${rowNumber}`;
  const moneyColumns = new Set([7, 10]);
  if (moneyColumns.has(columnIndex) && typeof value === "number") {
    return `<c r="${ref}" s="4"><v>${value.toFixed(2)}</v></c>`;
  }
  const style = rowStyle ? ` s="${rowStyle}"` : indexInRow === 0 ? " s=\"5\"" : "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value ?? "")}</t></is></c>`;
}

function sheetXml(sheetRows, lastRow) {
  return xmlHeader(`worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`) + `
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="17" customWidth="1"/>
    <col min="3" max="3" width="52" customWidth="1"/><col min="4" max="7" width="18" customWidth="1"/>
    <col min="8" max="11" width="18" customWidth="1"/><col min="12" max="13" width="18" customWidth="1"/>
    <col min="14" max="14" width="48" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows.join("")}</sheetData>
  <autoFilter ref="A5:N${Math.max(lastRow, 5)}"/>
</worksheet>`;
}

function stylesXml() {
  return xmlHeader(`styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`) + `
  <numFmts count="1"><numFmt numFmtId="164" formatCode="$ #,##0.00"/></numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="18"/><name val="Arial"/></font>
    <font><sz val="11"/><color rgb="FF666666"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111315"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"><color rgb="FFDDDDDD"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
  </cellXfs>
</styleSheet>`;
}

function workbookXml() {
  return xmlHeader(`workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`) +
    `<sheets><sheet name="Lista de precios" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelsXml() {
  return xmlHeader(`Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"`) +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml() {
  return xmlHeader(`Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"`) +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function relsXml() {
  return xmlHeader(`Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"`) +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function appXml() {
  return xmlHeader(`Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"`) +
    `<Application>KM Detail Line</Application></Properties>`;
}

function coreXml(generatedDate) {
  const timestamp = `${generatedDate}T00:00:00Z`;
  return xmlHeader(`cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`) +
    `<dc:title>KM Detail Line - Lista de precios</dc:title><dc:creator>KM Detail Line</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = dosDateTime(new Date());
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function dosDateTime(dateValue) {
  const year = Math.max(dateValue.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((dateValue.getMonth() + 1) << 5) | dateValue.getDate(),
    time: (dateValue.getHours() << 11) | (dateValue.getMinutes() << 5) | Math.floor(dateValue.getSeconds() / 2)
  };
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function xmlHeader(root) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${root}>`;
}

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  }[char]));
}

function centsToPesos(cents) {
  return Number(cents || 0) / 100;
}

function formatBps(bps) {
  return `${(Number(bps || 0) / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

function absoluteUrl(baseUrl, relativeUrl) {
  return new URL(relativeUrl || "/", baseUrl).toString();
}

function filenamePart(value) {
  return String(value || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "cliente";
}
