import { createSessionToken, hashPassword, hashToken, verifyPassword } from "../security.js";
import { transaction } from "../db.js";
import { AuthError, ValidationError, normalizeEmail, optionalText, requiredText } from "../domain/validation.js";

const CUSTOMER_FIELDS = [
  "firstName", "lastName", "businessName", "taxId", "taxCondition", "customerType",
  "industry", "city", "province", "postalCode", "address", "phone", "whatsapp", "contactPerson"
];

const TAX_CONDITIONS = new Set([
  "Responsable inscripto",
  "Monotributo",
  "Exento",
  "No responsable"
]);

const CUSTOMER_TYPES = new Set([
  "Distribuidor",
  "Pintureria",
  "Comercio especializado",
  "Mayorista"
]);

export const ARGENTINA_PROVINCES = new Set([
  "Buenos Aires", "Ciudad Autonoma de Buenos Aires", "Catamarca", "Chaco", "Chubut",
  "Cordoba", "Corrientes", "Entre Rios", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquen", "Rio Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucuman"
]);

export async function registerCustomer(db, input) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  if (input.acceptTerms !== true || input.acceptPrivacy !== true) {
    throw new ValidationError("Terms and privacy policy must be accepted");
  }

  const customer = Object.fromEntries(CUSTOMER_FIELDS.map((field) => [field, requiredText(input[field], field)]));
  customer.taxId = normalizeArgentineTaxId(customer.taxId);
  customer.taxCondition = allowedValue(customer.taxCondition, TAX_CONDITIONS, "taxCondition");
  customer.customerType = allowedValue(customer.customerType, CUSTOMER_TYPES, "customerType");
  customer.province = allowedValue(customer.province, ARGENTINA_PROVINCES, "province");
  customer.city = requiredText(customer.city, "city", { min: 2, max: 80 });
  customer.postalCode = normalizePostalCode(customer.postalCode);
  customer.phone = normalizePhone(customer.phone, "phone");
  customer.whatsapp = normalizePhone(customer.whatsapp, "whatsapp");
  customer.notes = optionalText(input.notes, "notes");
  const acceptedAt = new Date().toISOString();

  try {
    return transaction(db, () => {
      const user = db.prepare(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'customer') RETURNING id, email, role, status"
      ).get(email, passwordHash);

      const created = db.prepare(`
        INSERT INTO customers (
          user_id, first_name, last_name, business_name, tax_id, tax_condition, customer_type,
          industry, city, province, postal_code, address, phone, whatsapp, contact_person, notes,
          terms_accepted_at, privacy_accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, approval_status
      `).get(
        user.id, customer.firstName, customer.lastName, customer.businessName, customer.taxId,
        customer.taxCondition, customer.customerType, customer.industry, customer.city,
        customer.province, customer.postalCode, customer.address, customer.phone, customer.whatsapp,
        customer.contactPerson, customer.notes, acceptedAt, acceptedAt
      );
      db.prepare("INSERT INTO customer_discounts (customer_id) VALUES (?)").run(created.id);
      return { user, customer: created };
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      throw new ValidationError("Email or tax ID is already registered");
    }
    throw error;
  }
}

export function allowedValue(value, allowed, field) {
  if (!allowed.has(value)) throw new ValidationError(`${field} is invalid`);
  return value;
}

function normalizeArgentineTaxId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits)) throw new ValidationError("CUIT debe tener 11 digitos");
  const prefix = digits.slice(0, 2);
  if (!["20", "23", "24", "27", "30", "33", "34"].includes(prefix)) throw new ValidationError("CUIT tiene un prefijo invalido");
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  let expected = 11 - (sum % 11);
  if (expected === 11) expected = 0;
  if (expected === 10) expected = 9;
  if (expected !== Number(digits[10])) throw new ValidationError("CUIT no es valido");
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function normalizePhone(value, field) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new ValidationError(`${field} debe tener entre 8 y 15 digitos`);
  return digits;
}

export function normalizePostalCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^([A-Z]\d{4}[A-Z]{3}|\d{4})$/.test(normalized)) throw new ValidationError("postalCode is invalid");
  return normalized;
}

export async function login(db, { email: rawEmail, password }, sessionDays, config = {}) {
  const email = normalizeEmail(rawEmail);
  let user = db.prepare(`
    SELECT u.*, c.id AS customer_id, c.approval_status, c.business_name
    FROM users u LEFT JOIN customers c ON c.user_id = u.id
    WHERE u.email = ?
  `).get(email);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    user = await repairAdminLogin(db, email, password, config);
    if (!user) throw new AuthError("Invalid email or password");
  }
  if (user.status !== "active") throw new AuthError("User is not active", 403);

  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .run(user.id, tokenHash, expiresAt);

  return { token, expiresAt, user: publicUser(user) };
}

async function repairAdminLogin(db, email, password, config) {
  const configuredEmail = String(config.adminEmail || "").trim().toLowerCase();
  const configuredPassword = String(config.adminPassword || "");
  if (!configuredEmail || !configuredPassword || email !== configuredEmail || password !== configuredPassword) return null;

  const passwordHash = await hashPassword(password);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, existing.id);
  } else {
    db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(email, passwordHash);
  }
  return db.prepare(`
    SELECT u.*, c.id AS customer_id, c.approval_status, c.business_name
    FROM users u LEFT JOIN customers c ON c.user_id = u.id
    WHERE u.email = ?
  `).get(email);
}

export function authenticate(db, token) {
  if (!token) return null;
  const user = db.prepare(`
    SELECT u.id, u.email, u.role, u.status, c.id AS customer_id,
           c.approval_status, c.business_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN customers c ON c.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).get(hashToken(token), new Date().toISOString());
  return user ? publicUser(user) : null;
}

export function logout(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export async function createPasswordReset(db, rawEmail, config = {}) {
  const email = normalizeEmail(rawEmail);
  let user = db.prepare("SELECT id, email, role, status FROM users WHERE email = ?").get(email);
  if (!user && isConfiguredAdminEmail(email, config)) {
    const temporaryPassword = createSessionToken().token;
    db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')")
      .run(email, await hashPassword(temporaryPassword));
    user = db.prepare("SELECT id, email, role, status FROM users WHERE email = ?").get(email);
  }
  if (user && isConfiguredAdminEmail(email, config) && (user.role !== "admin" || user.status !== "active")) {
    db.prepare("UPDATE users SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    user = { ...user, role: "admin", status: "active" };
  }
  if (!user || user.status !== "active") return null;

  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  transaction(db, () => {
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?").run(user.id, new Date().toISOString());
    db.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
      .run(user.id, tokenHash, expiresAt);
  });
  return { userId: user.id, email: user.email, token, expiresAt };
}

export async function resetPassword(db, token, password, config = {}) {
  const normalizedToken = requiredText(token, "token", { min: 20, max: 500 });
  const reset = db.prepare(`
    SELECT prt.*, u.email
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?
  `).get(hashToken(normalizedToken), new Date().toISOString());
  if (!reset) throw new ValidationError("Password reset link is invalid or expired");
  const passwordHash = await hashPassword(password);
  transaction(db, () => {
    if (isConfiguredAdminEmail(reset.email, config)) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, reset.user_id);
    } else {
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, reset.user_id);
    }
    db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(reset.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id);
  });
  return { ok: true };
}

function isConfiguredAdminEmail(email, config = {}) {
  const configuredEmail = String(config.adminEmail || "").trim().toLowerCase();
  return Boolean(configuredEmail) && String(email || "").trim().toLowerCase() === configuredEmail;
}

export function requireUser(user) {
  if (!user) throw new AuthError();
  return user;
}

export function requireAdmin(user) {
  requireUser(user);
  if (user.role !== "admin") throw new AuthError("Administrator permission required", 403);
  return user;
}

export function requireApprovedCustomer(user) {
  requireUser(user);
  if (user.role !== "customer" || user.approvalStatus !== "approved") {
    throw new AuthError("Approved customer account required", 403);
  }
  return user;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    customerId: user.customer_id ?? null,
    approvalStatus: user.approval_status ?? null,
    businessName: user.business_name ?? null
  };
}
