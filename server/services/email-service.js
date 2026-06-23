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
             c.city, c.province, c.phone, c.whatsapp, c.contact_person, c.created_at, u.email
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
        `Ubicación: ${customer.city}, ${customer.province}`,
        `Contacto: ${customer.contact_person}`,
        `Email: ${customer.email}`,
        `Teléfono: ${customer.phone}`,
        `WhatsApp: ${customer.whatsapp}`,
        "",
        "Estado: pendiente de aprobación"
      ].join("\n");

      db.prepare(`
        INSERT INTO email_outbox (event_type, recipient, subject, text_body)
        VALUES ('customer_registration', ?, ?, ?)
      `).run(config.notificationEmail, `Nueva alta comercial: ${customer.business_name}`, textBody);
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
    queue("order_availability_customer", order.email, `Disponibilidad confirmada ${order.order_number} | KM Detail Line`, [
      `Hola ${order.contact_person},`,
      "",
      `Confirmamos la disponibilidad comercial de tu pedido ${order.order_number}.`,
      "El importe final para pago y despacho corresponde solo a los articulos confirmados.",
      "",
      "Articulos confirmados:",
      ...(confirmed.length ? confirmed.map((item) => (
        `- ${item.confirmed_quantity} de ${item.quantity} x ${item.km_code} | ${item.product_name} | ${money.format(item.confirmed_subtotal_net_cents / 100)}`
      )) : ["- No hay articulos disponibles para despacho en esta confirmacion."]),
      unavailable.length ? "" : null,
      unavailable.length ? "Articulos no disponibles:" : null,
      ...unavailable.map((item) => `- ${item.quantity} x ${item.km_code} | ${item.product_name}${item.availability_note ? ` | ${item.availability_note}` : ""}`),
      "",
      `Subtotal neto confirmado: ${money.format(order.subtotal_net_cents / 100)}`,
      `IVA ${(order.vat_bps / 100).toFixed(2)}%: ${money.format(order.vat_cents / 100)}`,
      `Total a pagar: ${money.format(order.total_cents / 100)}`,
      reason ? `Nota: ${reason}` : "",
      "",
      "Si necesitas consultar algo, podes responder este correo o comunicarte por WhatsApp.",
      "",
      "KM Detail Line",
      config.publicBaseUrl
    ].filter(Boolean).join("\n"));
  }

  function queue(eventType, recipient, subject, textBody) {
    if (!recipient) return;
    db.prepare(`
      INSERT INTO email_outbox (event_type, recipient, subject, text_body) VALUES (?, ?, ?, ?)
    `).run(eventType, recipient, subject, textBody);
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
      text: message.text_body
    });
    return { provider, messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
  }

  async function sendWithResend(message) {
    const payload = {
      from: config.resendFrom,
      to: [message.recipient],
      subject: message.subject,
      text: message.text_body
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

  function listOutbox(limit = 50) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return db.prepare(`
      SELECT id, event_type, recipient, subject, status, attempts, last_error,
             created_at, updated_at, sent_at
      FROM email_outbox
      ORDER BY created_at DESC
      LIMIT ?
    `).all(boundedLimit);
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

  return {
    enabled,
    provider,
    queueCustomerRegistration,
    queueCustomerStatus,
    queuePasswordReset,
    queueOrderCreated,
    queueOrderStatusUpdated,
    queueOrderAvailabilityConfirmed,
    flush,
    verify,
    sendTest,
    listOutbox,
    summarizeOutbox
  };
}
