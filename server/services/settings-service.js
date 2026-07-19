import { basisPoints, optionalText, ValidationError } from "../domain/validation.js";
import { listPaymentAccounts } from "./payment-account-service.js";

export function getCommercialSettings(db) {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row) => [row.key, row.value]));
  const bank = db.prepare("SELECT * FROM bank_settings WHERE id = 1").get();
  return {
    vatBps: Number(settings.vat_bps || 2100),
    whatsappNumber: settings.whatsapp_number || "",
    usdExchangeRate: Number(settings.usd_exchange_rate || 1400),
    productionHourlyCostArs: Number(settings.production_hourly_cost_ars || 0),
    maximumDiscountBps: Number(settings.maximum_discount_bps ?? 3000),
    maximumCommissionBps: Number(settings.maximum_commission_bps ?? 10000),
    profitMarginMinimumBps: Number(settings.profit_margin_minimum_bps ?? 0),
    profitMarginMediumBps: Number(settings.profit_margin_medium_bps ?? 0),
    profitMarginMaximumBps: Number(settings.profit_margin_maximum_bps ?? 0),
    bank: publicBank(bank),
    paymentAccounts: listPaymentAccounts(db, { includeInactive: true })
  };
}

export function getPublicSettings(db) {
  const settings = getCommercialSettings(db);
  return {
    vatBps: settings.vatBps,
    whatsappNumber: settings.whatsappNumber,
    maximumDiscountBps: settings.maximumDiscountBps
  };
}

export function updateCommercialSettings(db, input, adminUserId) {
  const currentSettings = getCommercialSettings(db);
  const profitMarginMinimumBps = basisPoints(Number(input.profitMarginMinimumBps ?? currentSettings.profitMarginMinimumBps), "profitMarginMinimumBps");
  const profitMarginMediumBps = basisPoints(Number(input.profitMarginMediumBps ?? currentSettings.profitMarginMediumBps), "profitMarginMediumBps");
  const profitMarginMaximumBps = basisPoints(Number(input.profitMarginMaximumBps ?? currentSettings.profitMarginMaximumBps), "profitMarginMaximumBps");
  if (profitMarginMinimumBps > profitMarginMediumBps || profitMarginMediumBps > profitMarginMaximumBps) {
    throw new ValidationError("Los márgenes deben respetar el orden: mínimo, medio y máximo.", { field: "profitMargins", code: "order" });
  }
  if (input.vatBps !== undefined) {
    basisPoints(input.vatBps, "vatBps");
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('vat_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(input.vatBps), adminUserId);
  }
  if (input.whatsappNumber !== undefined) {
    const number = String(input.whatsappNumber).replace(/\D/g, "");
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('whatsapp_number', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(number, adminUserId);
  }
  if (input.usdExchangeRate !== undefined) {
    const exchangeRate = Number(input.usdExchangeRate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 10_000_000) {
      throw new ValidationError("Ingresá un tipo de cambio válido mayor que cero.");
    }
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('usd_exchange_rate', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(exchangeRate), adminUserId);
  }
  if (input.productionHourlyCostArs !== undefined) {
    const hourlyCost = Number(input.productionHourlyCostArs);
    if (!Number.isFinite(hourlyCost) || hourlyCost < 0 || hourlyCost > 1_000_000_000) {
      throw new ValidationError("Ingresá un costo por hora de producción válido, igual o mayor que cero.");
    }
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('production_hourly_cost_ars', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(hourlyCost), adminUserId);
  }
  if (input.maximumDiscountBps !== undefined) {
    const maximumDiscountBps = basisPoints(Number(input.maximumDiscountBps), "maximumDiscountBps");
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('maximum_discount_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(maximumDiscountBps), adminUserId);
  }
  if (input.maximumCommissionBps !== undefined) {
    const maximumCommissionBps = basisPoints(Number(input.maximumCommissionBps), "maximumCommissionBps");
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('maximum_commission_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(maximumCommissionBps), adminUserId);
  }
  if (input.profitMarginMinimumBps !== undefined) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('profit_margin_minimum_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(profitMarginMinimumBps), adminUserId);
  }
  if (input.profitMarginMediumBps !== undefined) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('profit_margin_medium_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(profitMarginMediumBps), adminUserId);
  }
  if (input.profitMarginMaximumBps !== undefined) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_by) VALUES ('profit_margin_maximum_bps', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by
    `).run(String(profitMarginMaximumBps), adminUserId);
  }
  if (input.bank) {
    const bank = input.bank;
    db.prepare(`
      UPDATE bank_settings SET bank_name = ?, account_holder = ?, tax_id = ?, cbu = ?, alias = ?,
        account_type = ?, instructions = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = 1
    `).run(
      optionalText(bank.bankName, "bankName"), optionalText(bank.accountHolder, "accountHolder"),
      optionalText(bank.taxId, "bankTaxId"), optionalText(bank.cbu, "cbu"),
      optionalText(bank.alias, "alias"), optionalText(bank.accountType, "accountType"),
      optionalText(bank.instructions, "instructions"), adminUserId
    );
    syncLegacyBankToDefaultPaymentAccount(db, bank, adminUserId);
  }
  return getCommercialSettings(db);
}

function syncLegacyBankToDefaultPaymentAccount(db, bank, adminUserId) {
  const existing = db.prepare("SELECT id FROM payment_accounts WHERE is_default = 1 ORDER BY id LIMIT 1").get()
    || db.prepare("SELECT id FROM payment_accounts ORDER BY id LIMIT 1").get();
  const values = {
    bankName: optionalText(bank.bankName, "bankName"),
    accountHolder: optionalText(bank.accountHolder, "accountHolder"),
    taxId: optionalText(bank.taxId, "bankTaxId"),
    cbu: optionalText(bank.cbu, "cbu"),
    alias: optionalText(bank.alias, "alias"),
    accountType: optionalText(bank.accountType, "accountType"),
    instructions: optionalText(bank.instructions, "instructions")
  };
  if (existing) {
    db.prepare(`
      UPDATE payment_accounts
      SET bank_name = ?, account_holder = ?, tax_id = ?, cbu = ?, alias = ?, account_type = ?,
        instructions = ?, is_default = 1, active = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE id = ?
    `).run(
      values.bankName, values.accountHolder, values.taxId, values.cbu, values.alias, values.accountType,
      values.instructions, adminUserId, existing.id
    );
    db.prepare("UPDATE payment_accounts SET is_default = 0 WHERE id <> ?").run(existing.id);
    return;
  }
  db.prepare(`
    INSERT INTO payment_accounts (
      name, method, bank_name, account_holder, tax_id, account_type, cbu, alias, instructions,
      active, is_default, sort_order, updated_by
    ) VALUES ('Cuenta principal KM', 'bank_transfer', ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?)
  `).run(
    values.bankName, values.accountHolder, values.taxId, values.accountType, values.cbu,
    values.alias, values.instructions, adminUserId
  );
}

function publicBank(bank) {
  return {
    bankName: bank.bank_name,
    accountHolder: bank.account_holder,
    taxId: bank.tax_id,
    cbu: bank.cbu,
    alias: bank.alias,
    accountType: bank.account_type,
    instructions: bank.instructions
  };
}
