import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

export const config = {
  port: Number(process.env.PORT || 4180),
  host: process.env.HOST || "127.0.0.1",
  databasePath: process.env.DATABASE_PATH || path.join(projectRoot, "data", "km-detail.sqlite"),
  uploadsPath: process.env.UPLOADS_PATH || path.join(projectRoot, "uploads"),
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  secureCookies: process.env.NODE_ENV === "production",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  whatsappNumber: process.env.WHATSAPP_NUMBER || "",
  notificationEmail: process.env.NOTIFICATION_EMAIL || "ventas@km-detail.com",
  smtpHost: process.env.SMTP_HOST || "smtp.zoho.com",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://km-detail.com"
};
