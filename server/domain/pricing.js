export const BASIS_POINTS = 10_000;

export function assertMoney(value, field = "amount") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer in cents`);
  }
}

export function assertBasisPoints(value, field = "percentage") {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS) {
    throw new TypeError(`${field} must be between 0 and 10000 basis points`);
  }
}

export function applyDiscounts(basePriceCents, discountsBps = []) {
  assertMoney(basePriceCents, "basePriceCents");

  return discountsBps.reduce((current, discount, index) => {
    assertBasisPoints(discount, `discountsBps[${index}]`);
    return Math.round((current * (BASIS_POINTS - discount)) / BASIS_POINTS);
  }, basePriceCents);
}

export function calculateLine({ basePriceCents, quantity, discountsBps = [] }) {
  assertMoney(basePriceCents, "basePriceCents");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new TypeError("quantity must be a positive integer");
  }

  const finalUnitPriceCents = applyDiscounts(basePriceCents, discountsBps);
  return {
    basePriceCents,
    discountsBps: [...discountsBps],
    finalUnitPriceCents,
    quantity,
    subtotalNetCents: finalUnitPriceCents * quantity
  };
}

export function calculateOrderTotals(lines, vatBps = 2100) {
  assertBasisPoints(vatBps, "vatBps");
  const subtotalNetCents = lines.reduce((total, line) => {
    assertMoney(line.subtotalNetCents, "line.subtotalNetCents");
    return total + line.subtotalNetCents;
  }, 0);
  const vatCents = Math.round((subtotalNetCents * vatBps) / BASIS_POINTS);

  return {
    subtotalNetCents,
    vatBps,
    vatCents,
    totalCents: subtotalNetCents + vatCents
  };
}

export function formatArs(cents) {
  assertMoney(cents, "cents");
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2
  }).format(cents / 100);
}
