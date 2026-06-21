import { basisPoints, optionalText } from "../domain/validation.js";

export function getCommercialSettings(db) {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((row) => [row.key, row.value]));
  const bank = db.prepare("SELECT * FROM bank_settings WHERE id = 1").get();
  return {
    vatBps: Number(settings.vat_bps || 2100),
    whatsappNumber: settings.whatsapp_number || "",
    bank: publicBank(bank)
  };
}

export function getPublicSettings(db) {
  const settings = getCommercialSettings(db);
  return {
    vatBps: settings.vatBps,
    whatsappNumber: settings.whatsappNumber
  };
}

export function updateCommercialSettings(db, input, adminUserId) {
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
  }
  return getCommercialSettings(db);
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
