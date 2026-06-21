export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

export class AuthError extends Error {
  constructor(message = "Authentication required", statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

export function requiredText(value, field, { min = 1, max = 300 } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field} must contain between ${min} and ${max} characters`);
  }
  return normalized;
}

export function optionalText(value, field, { max = 2000 } = {}) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value.trim();
}

export function normalizeEmail(value) {
  const email = requiredText(value, "email", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("email is invalid");
  return email;
}

export function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${field} must be a positive integer`);
  return value;
}

export function basisPoints(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError(`${field} must be between 0 and 10000`);
  }
  return value;
}
