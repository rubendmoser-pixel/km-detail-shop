const FIELD_LABELS = {
  name: "nombre",
  email: "email",
  password: "contraseña",
  token: "enlace de recuperación",
  firstName: "nombre",
  lastName: "apellido",
  businessName: "razón social",
  taxId: "CUIT",
  taxCondition: "condición fiscal",
  customerType: "tipo de cliente",
  industry: "rubro",
  city: "localidad",
  province: "provincia",
  postalCode: "código postal",
  address: "dirección",
  phone: "teléfono",
  whatsapp: "WhatsApp",
  contactPerson: "persona de contacto",
  notes: "observaciones",
  status: "estado",
  customerId: "cliente",
  productId: "producto",
  imageId: "imagen",
  salesRepId: "vendedor",
  portalPassword: "clave del vendedor",
  defaultCommissionBps: "comisión general",
  maximumDiscountBps: "descuento máximo",
  maximumCommissionBps: "comisión máxima",
  commissionBps: "comisión",
  paymentTermsDays: "días de cuenta corriente",
  paymentDueDate: "fecha de vencimiento",
  paymentCondition: "condición de pago",
  primaryAccountId: "cuenta principal",
  accountIds: "cuenta de cobro",
  method: "medio de pago",
  amountCents: "importe",
  quantity: "cantidad"
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] || String(field || "campo").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

export class AuthError extends Error {
  constructor(message = "Tenés que iniciar sesión para continuar", statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends Error {
  constructor(message = "No encontramos el recurso solicitado") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

export function requiredText(value, field, { min = 1, max = 300 } = {}) {
  const label = fieldLabel(field);
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`Completá ${label}.`, { field, code: "required" });
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    const message = min === max
      ? `${capitalize(label)} debe tener exactamente ${min} caracteres.`
      : `${capitalize(label)} debe tener entre ${min} y ${max} caracteres.`;
    throw new ValidationError(message, { field, code: "length", min, max });
  }
  return normalized;
}

export function optionalText(value, field, { max = 2000 } = {}) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) {
    throw new ValidationError(`Revisá ${fieldLabel(field)}.`, { field, code: "invalid" });
  }
  return value.trim();
}

export function normalizeEmail(value) {
  const email = requiredText(value, "email", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Ingresá un email válido, por ejemplo nombre@empresa.com.", { field: "email", code: "invalid_email" });
  }
  return email;
}

export function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${capitalize(fieldLabel(field))} debe ser un número entero mayor que cero.`, { field, code: "positive_integer" });
  }
  return value;
}

export function basisPoints(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError(`${capitalize(fieldLabel(field))} debe estar entre 0 y 100%.`, { field, code: "range", min: 0, max: 10_000 });
  }
  return value;
}

export function publicErrorMessage(error, statusCode = error?.statusCode || 500) {
  if (statusCode >= 500) return "Ocurrió un error interno. Intentá nuevamente en unos minutos.";
  const message = String(error?.message || "").trim();
  const exact = ERROR_TRANSLATIONS.get(message);
  if (exact) return exact;

  let match = message.match(/^(.+) is required$/i);
  if (match) return `Completá ${fieldLabel(match[1])}.`;
  match = message.match(/^(.+) is invalid$/i);
  if (match) return `Revisá ${fieldLabel(match[1])}.`;
  match = message.match(/^(.+) must be between (\d+) and (\d+)$/i);
  if (match) return `${capitalize(fieldLabel(match[1]))} debe estar entre ${match[2]} y ${match[3]}.`;
  match = message.match(/^(.+) must be YYYY-MM-DD$/i);
  if (match) return `${capitalize(fieldLabel(match[1]))} debe tener formato día/mes/año.`;
  match = message.match(/^(.+) not found$/i);
  if (match) return `No encontramos ${fieldLabel(match[1])}.`;
  match = message.match(/^Product (\d+) appears more than once$/i);
  if (match) return `El producto ${match[1]} está repetido en el pedido.`;
  match = message.match(/^Product (\d+) is unavailable$/i);
  if (match) return `El producto ${match[1]} no está disponible.`;
  match = message.match(/^Order item (\d+) is invalid$/i);
  if (match) return `El producto del pedido ${match[1]} no es válido.`;
  if (message.endsWith(": order is closed")) return `${message.slice(0, -17)}: el pedido está cerrado.`;

  if (looksEnglish(message)) {
    if (statusCode === 401) return "El email o la contraseña no son correctos.";
    if (statusCode === 403) return "No tenés permisos para realizar esta acción.";
    if (statusCode === 404) return "No encontramos el recurso solicitado.";
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  return message || "No se pudo completar la operación.";
}

function looksEnglish(message) {
  return /\b(the|is|are|must|cannot|requires?|required|invalid|not found|already|between|before|after|only|more than|one or more|permission|account|customer|order|product|password|status|quantity|availability|payment|receipt|shipping)\b/i.test(message);
}

function capitalize(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "El campo";
}

const ERROR_TRANSLATIONS = new Map([
  ["Authentication required", "Tenés que iniciar sesión para continuar."],
  ["Resource not found", "No encontramos el recurso solicitado."],
  ["API route not found", "La función solicitada no está disponible."],
  ["Not found", "No encontramos el recurso solicitado."],
  ["Password must contain between 10 and 200 characters", "La contraseña debe tener entre 10 y 200 caracteres."],
  ["Terms and privacy policy must be accepted", "Tenés que aceptar los términos comerciales y la política de privacidad."],
  ["Email or tax ID is already registered", "Ya existe una cuenta registrada con ese email o CUIT."],
  ["Email or CUIT already registered", "Ya existe una cuenta registrada con ese email o CUIT."],
  ["Invalid email or password", "El email o la contraseña no son correctos."],
  ["User is not active", "La cuenta está inactiva. Contactá a KM Detail Line."],
  ["Password reset link is invalid or expired", "El enlace de recuperación es inválido o venció. Solicitá uno nuevo."],
  ["Administrator permission required", "Necesitás permisos de administrador para realizar esta acción."],
  ["Approved customer account required", "La cuenta de cliente debe estar aprobada para continuar."],
  ["Invalid sales rep status", "El estado del vendedor no es válido."],
  ["Invalid customer status", "El estado del cliente no es válido."],
  ["Invalid customer class", "La categoría comercial del cliente no es válida."],
  ["Invalid customer payment condition", "La condición de pago del cliente no es válida."],
  ["Customer not found", "No encontramos el cliente."],
  ["Sales rep not found", "No encontramos el vendedor."],
  ["Product not found", "No encontramos el producto."],
  ["Order not found", "No encontramos el pedido."],
  ["Shipping address not found", "No encontramos el domicilio de entrega."],
  ["Payment account not found", "No encontramos la cuenta de cobro."],
  ["Payment receipt not found", "No encontramos el comprobante de pago."],
  ["Payment receipt file not found", "No encontramos el archivo del comprobante de pago."],
  ["Special discount not found", "No encontramos el descuento especial."],
  ["email is invalid", "Ingresá un email válido, por ejemplo nombre@empresa.com."],
  ["postalCode is invalid", "Ingresá un código postal argentino válido."],
  ["Order requires at least one item", "Agregá al menos un producto al pedido."],
  ["Order contains too many items", "El pedido contiene demasiados productos."],
  ["Customer is not approved", "El cliente todavía no está aprobado."],
  ["items are required", "Agregá al menos un producto."],
  ["quantity must be a positive integer", "La cantidad debe ser un número entero mayor que cero."],
  ["startsAt cannot be after endsAt", "La fecha de inicio no puede ser posterior a la fecha de finalización."],
  ["discountBps must be greater than zero", "El descuento debe ser mayor que cero."],
  ["primaryAccountId must be assigned to customer", "La cuenta principal debe estar asignada al cliente."],
  ["One or more payment accounts are inactive or invalid", "Una o más cuentas de cobro están inactivas o no son válidas."],
  ["method is invalid", "El medio de pago no es válido."]
  ,["Availability can only be confirmed for received orders", "La disponibilidad solo puede confirmarse en pedidos recibidos."]
  ,["paymentTermsDays is required for credit account", "Indicá los días de cuenta corriente."]
  ,["Order availability must be confirmed before uploading a receipt", "Primero tenés que confirmar la disponibilidad del pedido antes de cargar un comprobante."]
  ,["mimeType must be application/pdf, image/jpeg or image/png", "El comprobante debe ser PDF, JPG o PNG."]
  ,["receipt must be between 1 byte and 8 MB", "El comprobante no puede estar vacío ni superar los 8 MB."]
  ,["status must be accepted or rejected", "El estado del comprobante debe ser aceptado o rechazado."]
  ,["amountCents cannot exceed pending balance", "El importe no puede superar el saldo pendiente."]
  ,["paymentTermsDays is required when a payment leaves pending balance", "Indicá los días de cuenta corriente cuando queda saldo pendiente."]
  ,["Order has no pending balance", "El pedido no tiene saldo pendiente."]
  ,["Availability must be confirmed before authorizing credit account", "Primero tenés que confirmar la disponibilidad antes de autorizar la cuenta corriente."]
  ,["paymentDueDate or paymentTermsDays is required", "Indicá una fecha de vencimiento o los días de cuenta corriente."]
  ,["Closed orders cannot receive commercial adjustments", "No se pueden realizar ajustes comerciales sobre un pedido cerrado."]
  ,["Commercial adjustment must compensate the full pending balance", "El ajuste comercial debe cubrir todo el saldo pendiente."]
  ,["Order does not require acceptance", "El pedido no requiere una nueva aceptación."]
  ,["Order is not shipped yet", "El pedido todavía no fue despachado."]
  ,["Delivered orders must be closed by customer reception", "Los pedidos entregados deben cerrarse con la confirmación de recepción del cliente."]
  ,["Payment closure requires confirmed availability", "Para cerrar el pago primero tenés que confirmar la disponibilidad."]
  ,["Ready orders require paid, credit account or commercial adjustment status", "Para preparar el pedido, el pago, la cuenta corriente o el ajuste comercial deben estar resueltos."]
  ,["Customer reception must close delivered orders", "La recepción del cliente debe cerrar los pedidos entregados."]
  ,["Shipped orders wait for customer reception and cannot be edited from dispatch", "Los pedidos despachados esperan la recepción del cliente y ya no pueden editarse desde despacho."]
  ,["Fulfillment cannot move backwards to pending", "La preparación del pedido no puede volver al estado pendiente."]
  ,["Order must be prepared before dispatch", "El pedido debe estar preparado antes de despacharlo."]
  ,["Order is already prepared for dispatch", "El pedido ya está preparado para despacho."]
  ,["Availability must be confirmed before preparing dispatch", "Primero tenés que confirmar la disponibilidad antes de preparar el despacho."]
  ,["Payment, credit account or commercial adjustment must be resolved before dispatch", "Antes del despacho debe resolverse el pago, la cuenta corriente o el ajuste comercial."]
  ,["Dispatch requires modality, carrier, tracking and dispatch date", "Para despachar completá modalidad, transporte, seguimiento y fecha de despacho."]
  ,["confirmedQuantity must be between 0 and ordered quantity", "La cantidad confirmada debe estar entre cero y la cantidad pedida."]
  ,["packages must be between 1 and 99", "La cantidad de bultos debe estar entre 1 y 99."]
  ,["paymentTermsDays must be between 0 and 365", "Los días de cuenta corriente deben estar entre 0 y 365."]
  ,["paymentDueDate must be YYYY-MM-DD", "Ingresá una fecha de vencimiento válida."]
  ,["paymentCondition must be advance_payment or credit_account", "La condición de pago debe ser pago anticipado o cuenta corriente."]
  ,["mimeType must be image/jpeg, image/png or image/webp", "La imagen debe ser JPG, PNG o WebP."]
  ,["dataBase64 is invalid", "No pudimos leer la imagen seleccionada."]
  ,["image must be between 1 byte and 5 MB", "La imagen no puede estar vacía ni superar los 5 MB."]
  ,["basePriceCents must be a non-negative integer", "El precio base debe ser un importe válido igual o mayor que cero."]
  ,["ean13 must contain exactly 13 digits", "El código EAN-13 debe tener exactamente 13 números."]
]);
