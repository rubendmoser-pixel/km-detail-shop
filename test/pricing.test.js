import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscounts, calculateLine, calculateOrderTotals } from "../server/domain/pricing.js";

test("applies three customer discounts in cascade", () => {
  const basePriceCents = 100_000 * 100;
  const finalPriceCents = applyDiscounts(basePriceCents, [3000, 2000, 1000]);
  assert.equal(finalPriceCents, 50_400 * 100);
});

test("calculates line subtotal and configurable VAT", () => {
  const line = calculateLine({ basePriceCents: 10_000, quantity: 3, discountsBps: [1000, 0, 0] });
  assert.deepEqual(line, {
    basePriceCents: 10_000,
    discountsBps: [1000, 0, 0],
    finalUnitPriceCents: 9_000,
    quantity: 3,
    subtotalNetCents: 27_000
  });
  assert.deepEqual(calculateOrderTotals([line], 2100), {
    subtotalNetCents: 27_000,
    vatBps: 2100,
    vatCents: 5_670,
    totalCents: 32_670
  });
});

test("rejects invalid quantities and percentages", () => {
  assert.throws(() => calculateLine({ basePriceCents: 100, quantity: 0 }), /positive integer/);
  assert.throws(() => applyDiscounts(100, [10_001]), /between 0 and 10000/);
});
