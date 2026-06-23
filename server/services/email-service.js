import nodemailer from "nodemailer";

export function createEmailService({ db, config }) {
  const enabled = Boolean(config.smtpUser && config.smtpPassword);
  const transporter = enabled ? nodemailer.createTransport({
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
        `Condicion fiscal: ${customer.tax_condition}`,
        `Tipo de cliente: ${customer.customer_type}`,
        `Rubro: ${customer.industry}`,
        `Ubicacion: ${customer.city}, ${customer.province}`,
        `Contacto: ${customer.contact_person}`,
        `Email: ${customer.email}`,
        `Telefono: ${customer.phone}`,
        `WhatsApp: ${customer.whatsapp}`,
        "",
        "Estado: pendiente de aprobacion"
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
      "La cuenta se encuentra pendiente de revision por nuestro equipo.",
      "",
      "Cuando la solicitud sea aprobada, recibiras un nuevo correo y podras ingresar para consultar tus precios, descuentos y realizar pedidos.",
      "",
      "Si necesitas agregar informacion, podes responder este mensaje.",
      "",
      "Gracias por elegir KM Detail Line.",
      "Productos profesionales para pulido automotriz, chapa y pintura y detailing.",
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
      status === "approved" ? "Ya podes ingresar para consultar tus precios y realizar pedidos." : "Para mas informacion, comunicate con KM Detail Line.",
      "", config.publicBaseUrl
    ].join("\n");
    queue("customer_status", customer.email, `Cuenta comercial ${label} | KM Detail Line`, textBody);
  }

  function queuePasswordReset(userId, token) {
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
    if (!user) return;
    const resetUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/reset.html?token=${encodeURIComponent(token)}`;
    const textBody = [
      "Recibimos una solicitud para cambiar tu contrasena de KM Detail Line.", "",
      "El enlace vence en una hora y puede utilizarse una sola vez:", resetUrl, "",
      "Si no solicitaste el cambio, ignora este mensaje."
    ].join("\n");
    queue("password_reset", user.email, "Recuperar contrasena | KM Detail Line", textBody);
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
          await transporter.sendMail({
            from: `KM Detail Line <${config.smtpUser}>`,
            to: message.recipient,
            subject: message.subject,
            text: message.text_body
          });
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
    await transporter.verify();
    return { enabled: true, connected: true };
  }

  async function sendTest(recipient = config.notificationEmail) {
    if (!enabled) throw new Error("SMTP is not configured");
    if (!recipient) throw new Error("Test recipient is not configured");
    const result = await transporter.sendMail({
      from: `KM Detail Line <${config.smtpUser}>`,
      to: recipient,
      subject: "Prueba de correo | KM Detail Line",
      text: [
        "La conexion de correo de KM Detail Line funciona correctamente.",
        "",
        `Fecha de prueba: ${new Date().toISOString()}`,
        "Origen: plataforma comercial local"
      ].join("\n")
    });
    return { messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
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
    queueCustomerRegistration,
    queueCustomerStatus,
    queuePasswordReset,
    flush,
    verify,
    sendTest,
    listOutbox,
    summarizeOutbox
  };
}
