import nodemailer from "nodemailer";

export function createEmailService({ db, config }) {
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
  const provider = config.emailProvider === "resend" ? "resend" : "smtp";
  const enabled = provider === "resend"
    ? Boolean(config.resendApiKey && config.resendFrom)
    : Boolean(config.smtpUser && config.smtpPassword);
  const transporter = provider === "smtp" && enabled ? nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword }
  }) : null;
  let flushing = false;

  function queueCustomerRegistration(customerId) {
    const customer = db.prepare(`
      SELECT c.business_name, c.tax_id, c.tax_condition, c.customer_type, c.industry,
             c.city, c.province, c.postal_code, c.phone, c.whatsapp, c.contact_person, c.created_at, u.email
      FROM customers c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(customerId);
    if (!customer) return;

    if (config.notificationEmail) {
      const textBody = [
        "Nueva solicitud de alta comercial en KM Detail Line",
        "",
        `Empresa: ${customer.business_name}`,
        `CUIT: ${customer.tax_id}`,
        `Condición fiscal: ${customer.tax_condition}`,
        `Tipo de cliente: ${customer.customer_type}`,
        `Rubro: ${customer.industry}`,
        `Ubicación: ${customer.city}, ${customer.province} ${customer.postal_code}`,
        `Contacto: ${customer.contact_person}`,
        `Email: ${customer.email}`,
        `Teléfono: ${customer.phone}`,
        `WhatsApp: ${customer.whatsapp}`,
        "",
        "Estado: pendiente de aprobación"
      ].join("\n");

      queue("customer_registration", config.notificationEmail, `Nueva alta comercial: ${customer.business_name}`, textBody);
    }

    const welcomeBody = [
      `Hola ${customer.contact_person},`,
      "",
      "Bienvenido a KM Detail Line.",
      "",
      `Recibimos la solicitud de alta comercial de ${customer.business_name}.`,
      "La cuenta se encuentra pendiente de revisión por nuestro equipo.",
      "",
      "Cuando la solicitud sea aprobada, recibirás un nuevo correo y podrás ingresar para consultar tus precios, descuentos y realizar pedidos.",
      "",
      "Si necesitás agregar información, podés responder este mensaje.",
      "",
      "Gracias por elegir KM Detail Line.",
      "Productos profesionales para pulido automotriz, chapa-pintura y detailing.",
      "",
      config.publicBaseUrl
    ].join("\n");
    queue("customer_welcome", customer.email, "Recibimos tu solicitud | KM Detail Line", welcomeBody);
  }

  function queueCustomerStatus(customerId, status) {
    const customer = db.prepare(`
      SELECT c.business_name, u.email FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?
    `).get(customerId);
    if (!customer) return;
    const labels = {
      approved: "aprobada", rejected: "rechazada", suspended: "suspendida", inactive: "inactiva", pending: "pendiente"
    };
    const label = labels[status] || status;
    const textBody = [
      `Hola, ${customer.business_name}.`, "",
      `Tu cuenta comercial de KM Detail Line fue ${label}.`,
      status === "approved" ? "Ya podés ingresar para consultar tus precios y realizar pedidos." : "Para más información, comunicate con KM Detail Line.",
      "", config.publicBaseUrl
    ].join("\n");
    queue("customer_status", customer.email, `Cuenta comercial ${label} | KM Detail Line`, textBody);
  }

  function queuePasswordReset(userId, token) {
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
    if (!user) return;
    const resetUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/reset.html?token=${encodeURIComponent(token)}`;
    const textBody = [
      "Recibimos una solicitud para cambiar tu contraseña de KM Detail Line.", "",
      "El enlace vence en una hora y puede utilizarse una sola vez:", resetUrl, "",
      "Si no solicitaste el cambio, ignora este mensaje."
    ].join("\n");
    queue("password_reset", user.email, "Recuperar contraseña | KM Detail Line", textBody);
  }

  function queueOrderCreated(orderId) {
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, c.whatsapp, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
    const shipping = JSON.parse(order.shipping_snapshot_json);
    const itemLines = items.map((item) => (
      `- ${item.quantity} x ${item.km_code} | ${item.product_name} | ${money.format(item.subtotal_net_cents / 100)}`
    ));
    const totals = [
      `Subtotal neto: ${money.format(order.subtotal_net_cents / 100)}`,
      `IVA ${(order.vat_bps / 100).toFixed(2)}%: ${money.format(order.vat_cents / 100)}`,
      `Total: ${money.format(order.total_cents / 100)}`
    ];
    const shippingText = [
      shipping.recipient,
      shipping.address,
      `${shipping.city}, ${shipping.province}`,
      shipping.postalCode ? `CP ${shipping.postalCode}` : "",
      shipping.preferredTransport ? `Transporte: ${shipping.preferredTransport}` : "",
      shipping.contactPhone ? `Telefono: ${shipping.contactPhone}` : "",
      shipping.notes ? `Notas: ${shipping.notes}` : ""
    ].filter(Boolean).join(" | ");

    if (config.notificationEmail) {
      queue("order_internal", config.notificationEmail, `Nuevo pedido ${order.order_number} | ${order.business_name}`, [
        `Nuevo pedido confirmado en KM Detail Line: ${order.order_number}`,
        "",
        `Cliente: ${order.business_name}`,
        `Contacto: ${order.contact_person}`,
        `Email: ${order.email}`,
        `WhatsApp: ${order.whatsapp}`,
        "",
        "Items:",
        ...itemLines,
        "",
        ...totals,
        "",
        `Entrega: ${shippingText}`,
        "",
        `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
      ].join("\n"));
    }

    queueSalesRep(order, "order_sales_rep", `Copia de pedido ${order.order_number} | ${order.business_name}`, [
      `Hola ${order.sales_rep_name},`,
      "",
      `Recibiste copia del pedido ${order.order_number} de ${order.business_name}.`,
      "",
      `Contacto: ${order.contact_person}`,
      `Email: ${order.email}`,
      `WhatsApp: ${order.whatsapp}`,
      "",
      "Items:",
      ...itemLines,
      "",
      ...totals,
      "",
      `Comision estimada: ${formatCommission(order)}`,
      "",
      `Entrega: ${shippingText}`,
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].join("\n"));

    queue("order_customer", order.email, `Recibimos tu pedido ${order.order_number} | KM Detail Line`, [
      `Hola ${order.contact_person},`,
      "",
      `Recibimos tu pedido ${order.order_number}.`,
      "El pedido queda pendiente de confirmacion comercial de disponibilidad.",
      "No realices el pago hasta recibir el importe final confirmado para despacho.",
      "",
      "Detalle:",
      ...itemLines,
      "",
      ...totals,
      "",
      `Entrega: ${shippingText}`,
      "",
      "Si necesitas agregar informacion, podes responder este correo o comunicarte por WhatsApp.",
      "",
      "KM Detail Line",
      "Productos profesionales para pulido automotriz, chapa-pintura y detailing.",
      "",
      config.publicBaseUrl
    ].join("\n"));
  }

  function queueOrderStatusUpdated(orderId, reason = "") {
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    const statusLabels = {
      order_created: "pedido creado",
      availability_confirmed: "disponibilidad confirmada",
      confirmed: "confirmado",
      in_preparation: "en preparacion",
      ready: "listo",
      delivered: "entregado",
      cancelled: "cancelado"
    };
    const paymentLabels = {
      pending_payment: "pago pendiente",
      receipt_uploaded: "comprobante cargado",
      paid: "pagado",
      rejected: "pago rechazado",
      refunded: "reintegrado"
    };
    const status = statusLabels[order.status] || order.status;
    const paymentStatus = paymentLabels[order.payment_status] || order.payment_status;
    queue("order_status_customer", order.email, `Actualizacion de pedido ${order.order_number} | KM Detail Line`, [
      `Hola ${order.contact_person},`,
      "",
      `Actualizamos el estado de tu pedido ${order.order_number}.`,
      "",
      `Estado del pedido: ${status}`,
      `Estado del pago: ${paymentStatus}`,
      `Total: ${money.format(order.total_cents / 100)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      "Si necesitas consultar algo, podes responder este correo o comunicarte por WhatsApp.",
      "",
      "KM Detail Line",
      config.publicBaseUrl
    ].filter(Boolean).join("\n"));
    queueSalesRep(order, "order_status_sales_rep", `Seguimiento ${order.order_number} | ${order.business_name}`, [
      `Pedido ${order.order_number} actualizado.`,
      "",
      `Cliente: ${order.business_name}`,
      `Estado del pedido: ${status}`,
      `Estado del pago: ${paymentStatus}`,
      `Total: ${money.format(order.total_cents / 100)}`,
      `Comision estimada: ${formatCommission(order)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].filter(Boolean).join("\n"));
  }

  function queueOrderAvailabilityConfirmed(orderId, reason = "") {
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId);
    const confirmed = items.filter((item) => item.confirmed_quantity > 0);
    const unavailable = items.filter((item) => item.confirmed_quantity === 0);
    const customerConfirmedLines = confirmed.length ? confirmed.flatMap((item, index) => [
      `${index + 1}. ${item.km_code} - ${item.product_name}`,
      `   Cantidad confirmada: ${item.confirmed_quantity} de ${item.quantity}`,
      `   Subtotal neto: ${money.format(item.confirmed_subtotal_net_cents / 100)}`,
      item.availability_note ? `   Observacion: ${item.availability_note}` : ""
    ]).filter(Boolean) : ["No hay articulos disponibles para despacho en esta confirmacion."];
    const unavailableLines = unavailable.flatMap((item, index) => [
      `${index + 1}. ${item.km_code} - ${item.product_name}`,
      `   Cantidad solicitada: ${item.quantity}`,
      item.availability_note ? `   Observacion: ${item.availability_note}` : ""
    ]).filter(Boolean);
    queue("order_availability_customer", order.email, `Pedido ${order.order_number}: disponibilidad confirmada`, [
      `Hola ${order.contact_person},`,
      "",
      `Confirmamos la disponibilidad comercial de tu pedido ${order.order_number}.`,
      "El importe final para pago y despacho corresponde solo a los articulos confirmados.",
      "",
      "Resumen del pedido",
      `Articulos confirmados: ${confirmed.length}`,
      `Subtotal neto confirmado: ${money.format(order.subtotal_net_cents / 100)}`,
      `IVA ${(order.vat_bps / 100).toFixed(2)}%: ${money.format(order.vat_cents / 100)}`,
      `Total para pago y despacho: ${money.format(order.total_cents / 100)}`,
      "",
      "Detalle de articulos confirmados",
      ...customerConfirmedLines,
      unavailable.length ? "" : null,
      unavailable.length ? "Articulos no disponibles:" : null,
      ...unavailableLines,
      reason ? `Nota: ${reason}` : "",
      "",
      "Podes responder este correo si necesitas consultar algo.",
      "Tambien podes ingresar a la plataforma para revisar el pedido y cargar el comprobante de pago.",
      "",
      "KM Detail Line",
      config.publicBaseUrl
    ].filter(Boolean).join("\n"));
    queueSalesRep(order, "order_availability_sales_rep", `Disponibilidad ${order.order_number} | ${order.business_name}`, [
      `Disponibilidad confirmada para el pedido ${order.order_number}.`,
      "",
      `Cliente: ${order.business_name}`,
      "",
      "Articulos confirmados:",
      ...(confirmed.length ? confirmed.map((item) => (
        `- ${item.km_code} - ${item.product_name}. Cantidad confirmada: ${item.confirmed_quantity} de ${item.quantity}. Subtotal neto: ${money.format(item.confirmed_subtotal_net_cents / 100)}`
      )) : ["- No hay articulos disponibles para despacho en esta confirmacion."]),
      "",
      `Total confirmado: ${money.format(order.total_cents / 100)}`,
      `Comision estimada: ${formatCommission(order)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].filter(Boolean).join("\n"));
  }

  function queuePaymentReceiptUploaded(orderId) {
    if (!config.notificationEmail) return;
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    queue("payment_receipt_internal", config.notificationEmail, `Comprobante cargado ${order.order_number} | ${order.business_name}`, [
      `El cliente cargo un comprobante para el pedido ${order.order_number}.`,
      "",
      `Cliente: ${order.business_name}`,
      `Contacto: ${order.contact_person}`,
      `Email: ${order.email}`,
      `Total del pedido: ${money.format(order.total_cents / 100)}`,
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].join("\n"));
  }

  function queuePaymentReceiptReviewed(orderId, status, reason = "") {
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    const accepted = status === "accepted";
    queue("payment_receipt_customer", order.email, `${accepted ? "Pago acreditado" : "Comprobante observado"} ${order.order_number} | KM Detail Line`, [
      `Hola ${order.contact_person},`,
      "",
      accepted
        ? `Acreditamos el pago del pedido ${order.order_number}.`
        : `Revisamos el comprobante del pedido ${order.order_number} y necesita revision.`,
      "",
      `Total: ${money.format(order.total_cents / 100)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      accepted ? "KM continuara con la preparacion y despacho del pedido." : "Podes responder este correo o comunicarte por WhatsApp para corregirlo.",
      "",
      "KM Detail Line",
      config.publicBaseUrl
    ].filter(Boolean).join("\n"));
    queueSalesRep(order, "payment_receipt_sales_rep", `Pago ${order.order_number} | ${order.business_name}`, [
      `Actualizacion de pago para el pedido ${order.order_number}.`,
      "",
      `Cliente: ${order.business_name}`,
      `Estado: ${accepted ? "Pago acreditado" : "Comprobante observado"}`,
      `Total: ${money.format(order.total_cents / 100)}`,
      `Comision estimada: ${formatCommission(order)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].filter(Boolean).join("\n"));
  }

  function queueOrderFulfillmentUpdated(orderId) {
    const order = db.prepare(`
      SELECT o.*, c.business_name, c.contact_person, u.email
      FROM orders o JOIN customers c ON c.id = o.customer_id JOIN users u ON u.id = c.user_id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return;
    const labels = { pending: "pendiente", ready: "listo para despacho", shipped: "despachado", delivered: "entregado" };
    queue("order_fulfillment_customer", order.email, `Despacho ${order.order_number} | KM Detail Line`, [
      `Hola ${order.contact_person},`,
      "",
      `Actualizamos la informacion de envio/despacho de tu pedido ${order.order_number}.`,
      "",
      `Estado: ${labels[order.fulfillment_status] || order.fulfillment_status}`,
      order.fulfillment_method ? `Modalidad: ${order.fulfillment_method}` : "",
      order.fulfillment_carrier ? `Transporte: ${order.fulfillment_carrier}` : "",
      order.fulfillment_tracking ? `Guia/remito: ${order.fulfillment_tracking}` : "",
      order.fulfillment_estimated_date ? `Fecha estimada: ${order.fulfillment_estimated_date}` : "",
      order.fulfillment_notes ? `Observaciones: ${order.fulfillment_notes}` : "",
      "",
      "KM Detail Line",
      config.publicBaseUrl
    ].filter(Boolean).join("\n"));
    queueSalesRep(order, "order_fulfillment_sales_rep", `Despacho ${order.order_number} | ${order.business_name}`, [
      `Actualizacion de despacho para el pedido ${order.order_number}.`,
      "",
      `Cliente: ${order.business_name}`,
      `Estado: ${labels[order.fulfillment_status] || order.fulfillment_status}`,
      order.fulfillment_method ? `Modalidad: ${order.fulfillment_method}` : "",
      order.fulfillment_carrier ? `Transporte: ${order.fulfillment_carrier}` : "",
      order.fulfillment_tracking ? `Guia/remito: ${order.fulfillment_tracking}` : "",
      order.fulfillment_estimated_date ? `Fecha estimada: ${order.fulfillment_estimated_date}` : "",
      order.fulfillment_notes ? `Observaciones: ${order.fulfillment_notes}` : "",
      "",
      `${config.publicBaseUrl.replace(/\/$/, "")}/admin.html`
    ].filter(Boolean).join("\n"));
  }

  function queueSalesRep(order, eventType, subject, textBody) {
    if (!order.sales_rep_email) return;
    queue(eventType, order.sales_rep_email, subject, textBody);
  }

  function formatCommission(order) {
    if (!order.sales_rep_email || !order.sales_commission_bps) return "Sin vendedor/comision asignada";
    return `${(order.sales_commission_bps / 100).toFixed(2)}% sobre ${money.format((order.sales_commission_base_cents || order.subtotal_net_cents) / 100)} = ${money.format((order.sales_commission_cents || 0) / 100)}`;
  }

  function queue(eventType, recipient, subject, textBody) {
    if (!recipient) return;
    const normalizedText = Array.isArray(textBody) ? textBody.filter(Boolean).join("\n") : String(textBody || "");
    const htmlBody = renderEmailHtml({
      subject,
      textBody: normalizedText,
      eventType,
      publicBaseUrl: config.publicBaseUrl
    });
    db.prepare(`
      INSERT INTO email_outbox (event_type, recipient, subject, text_body, html_body) VALUES (?, ?, ?, ?, ?)
    `).run(eventType, recipient, subject, normalizedText, htmlBody);
    void flush();
  }

  async function flush() {
    if (!enabled || flushing) return { enabled, sent: 0 };
    flushing = true;
    let sent = 0;
    try {
      const messages = db.prepare(`
        SELECT * FROM email_outbox WHERE status = 'pending' AND attempts < 10
        ORDER BY created_at LIMIT 20
      `).all();
      for (const message of messages) {
        try {
          await sendMail(message);
          db.prepare(`
            UPDATE email_outbox SET status = 'sent', attempts = attempts + 1,
              last_error = NULL, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(message.id);
          sent += 1;
        } catch (error) {
          db.prepare(`
            UPDATE email_outbox SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(String(error.message || error).slice(0, 1000), message.id);
        }
      }
      return { enabled, sent };
    } finally {
      flushing = false;
    }
  }

  async function verify() {
    if (!enabled) return { enabled: false, connected: false };
    if (provider === "smtp") await transporter.verify();
    return { enabled: true, connected: true, provider };
  }

  async function sendTest(recipient = config.notificationEmail) {
    if (!enabled) throw new Error("Email provider is not configured");
    if (!recipient) throw new Error("Test recipient is not configured");
    const result = await sendMail({
      recipient,
      subject: "Prueba de correo | KM Detail Line",
      text_body: [
        "La conexión de correo de KM Detail Line funciona correctamente.",
        "",
        `Fecha de prueba: ${new Date().toISOString()}`,
        `Origen: plataforma comercial (${provider})`
      ].join("\n")
    });
    return result;
  }

  async function sendMail(message) {
    if (provider === "resend") return sendWithResend(message);
    const result = await transporter.sendMail({
      from: `KM Detail Line <${config.smtpUser}>`,
      to: message.recipient,
      subject: message.subject,
      text: message.text_body,
      html: message.html_body || renderEmailHtml({
        subject: message.subject,
        textBody: message.text_body,
        eventType: message.event_type,
        publicBaseUrl: config.publicBaseUrl
      })
    });
    return { provider, messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
  }

  async function sendWithResend(message) {
    const payload = {
      from: config.resendFrom,
      to: [message.recipient],
      subject: message.subject,
      text: message.text_body,
      html: message.html_body || renderEmailHtml({
        subject: message.subject,
        textBody: message.text_body,
        eventType: message.event_type,
        publicBaseUrl: config.publicBaseUrl
      })
    };
    if (config.resendReplyTo) payload.reply_to = config.resendReplyTo;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.message || body.error || `Resend request failed with status ${response.status}`;
      throw new Error(message);
    }
    return { provider, messageId: body.id };
  }

  function listOutbox(options = 50) {
    const limit = typeof options === "object" ? options.limit : options;
    const search = typeof options === "object" ? String(options.search || "").trim() : "";
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const searchClause = search
      ? `WHERE event_type LIKE ? OR recipient LIKE ? OR subject LIKE ? OR status LIKE ? OR last_error LIKE ? OR text_body LIKE ?`
      : "";
    const params = search ? Array(6).fill(`%${search}%`) : [];
    return db.prepare(`
      SELECT id, event_type, recipient, subject, status, attempts, last_error,
             created_at, updated_at, sent_at
      FROM email_outbox
      ${searchClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, boundedLimit);
  }

  function summarizeOutbox() {
    return db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'pending' AND last_error IS NOT NULL THEN 1 ELSE 0 END) AS withErrors
      FROM email_outbox
    `).get();
  }

  function renderEmailHtml({ subject, textBody, eventType, publicBaseUrl }) {
    const lines = String(textBody || "").split("\n");
    const blocks = [];
    let paragraph = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p style="margin:0 0 16px;color:#d6d9de;line-height:1.58;font-size:15px;">${paragraph.map(escapeHtml).join("<br>")}</p>`);
      paragraph = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        continue;
      }
      if (isEmailSectionTitle(trimmed)) {
        flushParagraph();
        blocks.push(`<h2 style="margin:24px 0 12px;color:#f4f5f6;font-size:16px;line-height:1.25;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(trimmed)}</h2>`);
        continue;
      }
      if (isUrlLine(trimmed)) {
        flushParagraph();
        blocks.push(`<p style="margin:22px 0 0;"><a href="${escapeAttribute(trimmed)}" style="display:inline-block;padding:13px 18px;background:#d8dde3;color:#09090a;text-decoration:none;font-weight:800;border-radius:4px;">Ingresar a KM Detail Line</a></p>`);
        continue;
      }
      if (isKeyValueLine(trimmed)) {
        flushParagraph();
        const [label, ...rest] = trimmed.split(":");
        const value = rest.join(":").trim();
        const important = /total|pago|estado|subtotal|iva/i.test(label);
        blocks.push(renderKeyValueRow(label, value, important));
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed) || /^-\s+/.test(trimmed)) {
        flushParagraph();
        blocks.push(`<div style="margin:10px 0;padding:14px 16px;background:#14161a;border:1px solid #30343a;border-left:4px solid #8fb7d6;border-radius:4px;color:#f2f4f6;font-size:15px;line-height:1.48;">${escapeHtml(trimmed)}</div>`);
        continue;
      }
      paragraph.push(trimmed);
    }
    flushParagraph();

    const preheader = emailPreheader(eventType);
    const year = new Date().getFullYear();
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#09090a;color:#f4f5f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090a;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#101114;border:1px solid #30343a;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#050506;border-bottom:1px solid #30343a;">
                <div style="color:#f4f5f6;font-size:26px;font-weight:900;letter-spacing:.02em;">KM <span style="color:#b6bcc4;font-weight:700;">Detail Line</span></div>
                <div style="margin-top:8px;color:#aeb4bb;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;">Canal profesional</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 18px;color:#ffffff;font-size:26px;line-height:1.15;">${escapeHtml(subject)}</h1>
                ${blocks.join("\n")}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;background:#0b0c0e;border-top:1px solid #30343a;color:#aeb4bb;font-size:12px;line-height:1.55;">
                KM Detail Line<br>
                Productos profesionales para pulido automotriz, chapa-pintura y detailing.<br>
                ${escapeHtml((publicBaseUrl || "").replace(/\/$/, ""))}<br>
                &copy; ${year}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  function isEmailSectionTitle(line) {
    return [
      "Resumen del pedido",
      "Detalle de articulos confirmados",
      "Articulos confirmados",
      "Articulos no disponibles:",
      "Detalle:",
      "Items:"
    ].includes(line);
  }

  function renderKeyValueRow(label, value, important) {
    const labelStyle = "padding:12px 12px 12px 0;border-bottom:1px solid #30343a;color:#9fa5ad;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;line-height:1.35;vertical-align:top;";
    const valueStyle = `padding:12px 0 12px 12px;border-bottom:1px solid #30343a;color:${important ? "#ffffff" : "#d6d9de"};font-size:${important ? "18px" : "15px"};font-weight:800;line-height:1.35;text-align:right;vertical-align:top;`;
    return `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td width="52%" style="${labelStyle}">${escapeHtml(label)}</td>
          <td width="48%" style="${valueStyle}">${escapeHtml(value)}</td>
        </tr>
      </table>
    `;
  }

  function isKeyValueLine(line) {
    return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 /().-]{2,45}:\s+.+/.test(line) && !/^https?:\/\//i.test(line);
  }

  function isUrlLine(line) {
    return /^https?:\/\/\S+$/i.test(line);
  }

  function emailPreheader(eventType) {
    if (eventType === "order_availability_customer") return "Disponibilidad confirmada y total para pago.";
    if (eventType === "order_customer") return "Recibimos tu pedido en KM Detail Line.";
    if (eventType === "payment_receipt_customer") return "Actualizacion del pago de tu pedido.";
    if (eventType === "order_fulfillment_customer") return "Actualizacion de despacho de tu pedido.";
    return "Notificacion de KM Detail Line.";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  return {
    enabled,
    provider,
    queueCustomerRegistration,
    queueCustomerStatus,
    queuePasswordReset,
    queueOrderCreated,
    queueOrderStatusUpdated,
    queueOrderAvailabilityConfirmed,
    queuePaymentReceiptUploaded,
    queuePaymentReceiptReviewed,
    queueOrderFulfillmentUpdated,
    flush,
    verify,
    sendTest,
    listOutbox,
    summarizeOutbox
  };
}
