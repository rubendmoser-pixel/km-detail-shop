import { calculateLine, calculateOrderTotals } from "../domain/pricing.js";
import { NotFoundError, ValidationError, optionalText, positiveInteger } from "../domain/validation.js";
import { transaction } from "../db.js";
import { activeCustomerProductDiscountsByProduct, getCustomerPricingContext } from "./customer-service.js";
import { activeCustomerProductSpecialDiscount, activeProductPromotion } from "./product-service.js";
import { getCommercialSettings } from "./settings-service.js";

export function createSalesQuote(db, salesRep, customerId, input = {}) {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new ValidationError("El presupuesto requiere al menos un producto");
  if (input.items.length > 200) throw new ValidationError("El presupuesto contiene demasiados productos");

  const customer = getCustomerPricingContext(db, customerId);
  if (!customer || customer.approval_status !== "approved") throw new ValidationError("El cliente no esta aprobado");

  const discounts = [customer.discount_1_bps, customer.discount_2_bps, customer.discount_3_bps];
  const settings = getCommercialSettings(db);
  const notes = optionalText(input.notes, "notes", { max: 1000 });
  const validUntil = optionalDate(input.validUntil, "validUntil");

  return transaction(db, () => {
    const productQuery = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1");
    const specialDiscountsByProduct = activeCustomerProductDiscountsByProduct(db, customerId);
    const seen = new Set();
    const lines = input.items.map((item, index) => {
      const productId = positiveInteger(Number(item.productId), `items[${index}].productId`);
      const quantity = positiveInteger(Number(item.quantity), `items[${index}].quantity`);
      if (seen.has(productId)) throw new ValidationError(`El producto ${productId} esta duplicado`);
      seen.add(productId);
      const product = productQuery.get(productId);
      if (!product) throw new NotFoundError(`Producto ${productId} no disponible`);
      const promotion = activeProductPromotion(product);
      const specialDiscount = activeCustomerProductSpecialDiscount(product, specialDiscountsByProduct);
      return {
        product,
        promotion,
        specialDiscount,
        ...calculateLine({
          basePriceCents: product.base_price_cents,
          quantity,
          discountsBps: [...discounts, specialDiscount.bps, promotion.bps]
        })
      };
    });
    const totals = calculateOrderTotals(lines, settings.vatBps);

    const quote = db.prepare(`
      INSERT INTO sales_quotes (
        customer_id, sales_rep_id, sales_rep_name, sales_rep_email,
        discount_1_bps, discount_2_bps, discount_3_bps, commercial_class,
        subtotal_net_cents, vat_bps, vat_cents, total_cents, valid_until, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      customerId,
      salesRep.id,
      salesRep.name || "",
      salesRep.email || "",
      ...discounts,
      customer.commercial_class || "B",
      totals.subtotalNetCents,
      totals.vatBps,
      totals.vatCents,
      totals.totalCents,
      validUntil,
      notes
    );
    const quoteNumber = `PR-${new Date().getUTCFullYear()}-${String(quote.id).padStart(6, "0")}`;
    db.prepare("UPDATE sales_quotes SET quote_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(quoteNumber, quote.id);

    const insertItem = db.prepare(`
      INSERT INTO sales_quote_items (
        quote_id, product_id, km_code, ean13, product_name, quantity, base_price_cents,
        discount_1_bps, discount_2_bps, discount_3_bps, special_discount_bps, special_discount_note,
        promotion_bps, promotion_label, final_unit_price_cents, subtotal_net_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of lines) {
      insertItem.run(
        quote.id,
        line.product.id,
        line.product.km_code,
        line.product.ean13,
        line.product.name,
        line.quantity,
        line.basePriceCents,
        ...discounts,
        line.specialDiscount.bps,
        line.specialDiscount.note || "",
        line.promotion.bps,
        line.promotion.label || "",
        line.finalUnitPriceCents,
        line.subtotalNetCents
      );
    }
    return getSalesQuote(db, quote.id, salesRep.id);
  });
}

export function listSalesQuotesForSalesRep(db, salesRepId) {
  const id = positiveInteger(Number(salesRepId), "salesRepId");
  const rows = db.prepare(`
    SELECT q.*, c.business_name, c.contact_person AS customer_contact,
           c.whatsapp AS customer_whatsapp, u.email AS customer_email,
           (SELECT COUNT(*) FROM sales_quote_items qi WHERE qi.quote_id = q.id) AS item_count
    FROM sales_quotes q
    JOIN customers c ON c.id = q.customer_id
    JOIN users u ON u.id = c.user_id
    WHERE q.sales_rep_id = ?
    ORDER BY q.created_at DESC, q.id DESC
    LIMIT 80
  `).all(id);
  return rows.map((row) => mapQuote(row, [], Number(row.item_count || 0)));
}

export function getSalesQuote(db, quoteId, salesRepId = null) {
  const id = positiveInteger(Number(quoteId), "quoteId");
  const params = [id];
  let whereSalesRep = "";
  if (salesRepId !== null) {
    whereSalesRep = " AND q.sales_rep_id = ?";
    params.push(positiveInteger(Number(salesRepId), "salesRepId"));
  }
  const quote = db.prepare(`
    SELECT q.*, c.business_name, c.contact_person AS customer_contact,
           c.whatsapp AS customer_whatsapp, u.email AS customer_email
    FROM sales_quotes q
    JOIN customers c ON c.id = q.customer_id
    JOIN users u ON u.id = c.user_id
    WHERE q.id = ?${whereSalesRep}
  `).get(...params);
  if (!quote) throw new NotFoundError("Presupuesto no encontrado");
  const items = db.prepare("SELECT * FROM sales_quote_items WHERE quote_id = ? ORDER BY id").all(id);
  return mapQuote(quote, items, items.length);
}

export function markSalesQuoteConverted(db, quoteId, salesRepId = null) {
  const quote = getSalesQuote(db, quoteId, salesRepId);
  if (quote.status === "converted") return quote;
  if (quote.status !== "generated") throw new ValidationError("Solo se puede generar un pedido desde un presupuesto vigente");
  db.prepare("UPDATE sales_quotes SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(quote.id);
  return getSalesQuote(db, quote.id, salesRepId);
}

export function markSalesQuoteShared(db, quoteId, salesRepId = null, channel = "") {
  const quote = getSalesQuote(db, quoteId, salesRepId);
  if (quote.status !== "generated") throw new ValidationError("El presupuesto ya fue convertido o no esta vigente");
  if (channel === "email") {
    db.prepare("UPDATE sales_quotes SET email_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(quote.id);
    return getSalesQuote(db, quote.id, salesRepId);
  }
  if (channel === "whatsapp") {
    db.prepare("UPDATE sales_quotes SET whatsapp_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(quote.id);
    return getSalesQuote(db, quote.id, salesRepId);
  }
  throw new ValidationError("Canal de envio no valido");
}

function optionalDate(value, field) {
  const text = optionalText(value, field, { max: 10 });
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${field} debe tener formato YYYY-MM-DD`);
  return text;
}

function mapQuote(row, items = [], itemCount = 0) {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    customerId: row.customer_id,
    businessName: row.business_name,
    customerContact: row.customer_contact,
    customerWhatsapp: row.customer_whatsapp,
    customerEmail: row.customer_email,
    salesRepId: row.sales_rep_id,
    salesRepName: row.sales_rep_name,
    salesRepEmail: row.sales_rep_email,
    status: row.status,
    currency: row.currency,
    discount1Bps: row.discount_1_bps,
    discount2Bps: row.discount_2_bps,
    discount3Bps: row.discount_3_bps,
    commercialClass: row.commercial_class,
    subtotalNetCents: row.subtotal_net_cents,
    vatBps: row.vat_bps,
    vatCents: row.vat_cents,
    totalCents: row.total_cents,
    validUntil: row.valid_until,
    notes: row.notes,
    emailSentAt: row.email_sent_at,
    whatsappSentAt: row.whatsapp_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount,
    items: items.map(mapQuoteItem)
  };
}

function mapQuoteItem(row) {
  return {
    id: row.id,
    quoteId: row.quote_id,
    productId: row.product_id,
    kmCode: row.km_code,
    ean13: row.ean13,
    productName: row.product_name,
    quantity: row.quantity,
    basePriceCents: row.base_price_cents,
    discount1Bps: row.discount_1_bps,
    discount2Bps: row.discount_2_bps,
    discount3Bps: row.discount_3_bps,
    specialDiscountBps: row.special_discount_bps,
    specialDiscountNote: row.special_discount_note,
    promotionBps: row.promotion_bps,
    promotionLabel: row.promotion_label,
    finalUnitPriceCents: row.final_unit_price_cents,
    subtotalNetCents: row.subtotal_net_cents
  };
}
