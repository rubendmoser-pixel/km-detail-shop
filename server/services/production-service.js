import { AuthError, NotFoundError, ValidationError, normalizeEmail, optionalText, requiredText } from "../domain/validation.js";
import { createSessionToken, hashPassword, hashToken, verifyPassword } from "../security.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function listProductionOperators(db) {
  return db.prepare(`SELECT id,name,email,phone,status,notes,created_at,updated_at,
    CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM production_operators ORDER BY status='active' DESC,name COLLATE NOCASE`).all();
}

export async function upsertProductionOperator(db, input = {}) {
  const id = Number(input.id || 0);
  const existing = id ? db.prepare("SELECT id,password_hash FROM production_operators WHERE id=?").get(id) : null;
  if (id && !existing) throw new NotFoundError("Operario de producción no encontrado.");
  const name = requiredText(input.name, "name", { min: 2, max: 160 });
  const email = normalizeEmail(input.email);
  const phone = optionalText(input.phone, "phone", { max: 60 });
  const notes = optionalText(input.notes, "notes", { max: 1000 });
  const status = input.status === "inactive" ? "inactive" : "active";
  const enabled = input.portalAccessEnabled !== false;
  const password = optionalText(input.portalPassword, "portalPassword", { max: 200 });
  if (enabled && !password && !existing?.password_hash) throw new ValidationError("Ingresá una clave de al menos 10 caracteres para habilitar el acceso.");
  let passwordHash = enabled ? (existing?.password_hash || "") : "";
  if (enabled && password) {
    try { passwordHash = await hashPassword(password); }
    catch { throw new ValidationError("La clave debe tener entre 10 y 200 caracteres."); }
  }
  try {
    if (id) {
      db.prepare(`UPDATE production_operators SET name=?,email=?,phone=?,status=?,notes=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, email, phone, status, notes, passwordHash, id);
      if (status !== "active" || !passwordHash) db.prepare("DELETE FROM production_sessions WHERE operator_id=?").run(id);
    } else {
      const row = db.prepare(`INSERT INTO production_operators(name,email,phone,status,notes,password_hash) VALUES(?,?,?,?,?,?) RETURNING id`)
        .get(name, email, phone, status, notes, passwordHash);
      return listProductionOperators(db).find((operator) => operator.id === row.id);
    }
    return listProductionOperators(db).find((operator) => operator.id === id);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe un operario de producción con ese email.");
    throw error;
  }
}

export async function loginProductionOperator(db, input = {}, sessionDays = 30) {
  const email = normalizeEmail(input.email);
  const password = requiredText(input.password, "password", { min: 1, max: 200 });
  const row = db.prepare("SELECT * FROM production_operators WHERE email=?").get(email);
  if (!row || row.status !== "active" || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("El email o la clave no son correctos.", 401);
  }
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare("INSERT INTO production_sessions(operator_id,token_hash,expires_at) VALUES(?,?,?)").run(row.id, tokenHash, expiresAt);
  return { operator: publicOperator(row), token, expiresAt };
}

export function authenticateProductionOperator(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT o.* FROM production_sessions s JOIN production_operators o ON o.id=s.operator_id
    WHERE s.token_hash=? AND s.expires_at>? AND o.status='active'`).get(hashToken(token), new Date().toISOString());
  return row ? publicOperator(row) : null;
}

export function requireProductionOperator(operator) {
  if (!operator) throw new AuthError("Iniciá sesión como operario de producción.", 401);
  return operator;
}

export function logoutProductionOperator(db, token) {
  if (token) db.prepare("DELETE FROM production_sessions WHERE token_hash=?").run(hashToken(token));
}

export function saveProductionPlan(db, input = {}, adminId) {
  const weekStart = validDate(input.weekStart, "semana");
  const notes = optionalText(input.notes, "notes", { max: 1500 });
  const items = normalizePlanItems(db, input.items);
  if (!items.length) throw new ValidationError("Agregá al menos un producto a la planificación.");
  db.exec("BEGIN IMMEDIATE");
  try {
    let plan = db.prepare("SELECT * FROM production_plans WHERE week_start=?").get(weekStart);
    if (plan?.status === "closed") throw new ValidationError("La planificación de esa semana ya está cerrada.");
    if (!plan) {
      plan = db.prepare(`INSERT INTO production_plans(week_start,notes,created_by) VALUES(?,?,?) RETURNING *`).get(weekStart, notes, adminId);
    } else {
      db.prepare("UPDATE production_plans SET notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(notes, plan.id);
      const productIds = items.map((item) => item.productId);
      db.prepare(`DELETE FROM production_plan_items WHERE plan_id=? AND product_id NOT IN (${productIds.map(() => "?").join(",")})`).run(plan.id, ...productIds);
    }
    const insert = db.prepare(`INSERT INTO production_plan_items(plan_id,product_id,suggested_quantity,target_quantity,adjustment_note,sort_order) VALUES(?,?,?,?,?,?)
      ON CONFLICT(plan_id,product_id) DO UPDATE SET suggested_quantity=excluded.suggested_quantity,target_quantity=excluded.target_quantity,
      adjustment_note=excluded.adjustment_note,sort_order=excluded.sort_order`);
    items.forEach((item, index) => insert.run(plan.id, item.productId, item.suggestedQuantity, item.targetQuantity, item.adjustmentNote, index));
    db.exec("COMMIT");
    return getProductionPlan(db, plan.id);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function approveProductionPlan(db, planId, adminId) {
  const result = db.prepare(`UPDATE production_plans SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status IN ('draft','approved','in_progress')`).run(adminId, positiveId(planId));
  if (!result.changes) throw new NotFoundError("Planificación no encontrada.");
  return getProductionPlan(db, planId);
}

export function listProductionPlans(db) {
  return db.prepare("SELECT id FROM production_plans ORDER BY week_start DESC LIMIT 26").all().map((row) => getProductionPlan(db, row.id));
}

export function getCurrentProductionDashboard(db) {
  const plan = db.prepare(`SELECT id FROM production_plans WHERE status IN ('approved','in_progress') ORDER BY week_start DESC LIMIT 1`).get();
  return { plan: plan ? getProductionPlan(db, plan.id) : null, reports: listProductionReports(db, { limit: 14 }) };
}

export function getProductionPlan(db, planId) {
  const plan = db.prepare("SELECT * FROM production_plans WHERE id=?").get(positiveId(planId));
  if (!plan) throw new NotFoundError("Planificación no encontrada.");
  const items = db.prepare(`SELECT pi.id,pi.product_id,pi.suggested_quantity,pi.target_quantity,pi.adjustment_note,
      p.km_code,p.ean13,p.name,p.warehouse_location,
      COALESCE(SUM(CASE WHEN r.status='confirmed' THEN ri.good_quantity ELSE 0 END),0) AS produced_quantity
    FROM production_plan_items pi JOIN products p ON p.id=pi.product_id
    LEFT JOIN production_daily_report_items ri ON ri.plan_item_id=pi.id
    LEFT JOIN production_daily_reports r ON r.id=ri.report_id
    WHERE pi.plan_id=? GROUP BY pi.id ORDER BY pi.sort_order,p.km_code`).all(plan.id).map((row) => ({
      id: row.id, productId: row.product_id, kmCode: row.km_code, ean13: row.ean13, name: row.name,
      warehouseLocation: row.warehouse_location || "", suggestedQuantity: row.suggested_quantity,
      targetQuantity: row.target_quantity, producedQuantity: row.produced_quantity,
      remainingQuantity: Math.max(0, row.target_quantity - row.produced_quantity), adjustmentNote: row.adjustment_note || ""
    }));
  return { id: plan.id, weekStart: plan.week_start, status: plan.status, notes: plan.notes, approvedAt: plan.approved_at, items };
}

export function saveDailyProductionReport(db, input = {}, operator) {
  const productionDate = validDate(input.productionDate, "fecha de producción");
  const notes = optionalText(input.notes, "notes", { max: 1500 });
  const items = normalizeReportItems(db, input.items);
  if (!items.length || !items.some((item) => item.goodQuantity || item.rejectedQuantity)) throw new ValidationError("Cargá al menos una cantidad fabricada o rechazada.");
  db.exec("BEGIN IMMEDIATE");
  try {
    let report = db.prepare("SELECT * FROM production_daily_reports WHERE production_date=?").get(productionDate);
    if (report && !["draft", "returned"].includes(report.status)) throw new ValidationError("El parte de ese día ya fue enviado y no puede modificarse.");
    if (!report) {
      const number = `PF-${productionDate.replaceAll("-", "")}`;
      report = db.prepare(`INSERT INTO production_daily_reports(report_number,production_date,operator_id,notes) VALUES(?,?,?,?) RETURNING *`)
        .get(number, productionDate, operator.id, notes);
    } else {
      db.prepare(`UPDATE production_daily_reports SET operator_id=?,notes=?,status='draft',return_reason='',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(operator.id, notes, report.id);
      db.prepare("DELETE FROM production_daily_report_items WHERE report_id=?").run(report.id);
    }
    const planItems = new Map(db.prepare(`SELECT pi.product_id,pi.id FROM production_plan_items pi WHERE pi.plan_id=(
      SELECT id FROM production_plans WHERE status IN ('approved','in_progress') ORDER BY week_start DESC LIMIT 1)`).all().map((row) => [row.product_id, row.id]));
    const insert = db.prepare(`INSERT INTO production_daily_report_items(report_id,plan_item_id,product_id,good_quantity,rejected_quantity,notes) VALUES(?,?,?,?,?,?)`);
    items.forEach((item) => insert.run(report.id, planItems.get(item.productId) || null, item.productId, item.goodQuantity, item.rejectedQuantity, item.notes));
    db.exec("COMMIT");
    return getProductionReport(db, report.id);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function submitDailyProductionReport(db, reportId, operator) {
  const report = db.prepare("SELECT * FROM production_daily_reports WHERE id=?").get(positiveId(reportId));
  if (!report) throw new NotFoundError("Parte diario no encontrado.");
  if (!["draft", "returned"].includes(report.status)) throw new ValidationError("Este parte ya fue enviado.");
  db.prepare(`UPDATE production_daily_reports SET status='submitted',operator_id=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(operator.id, report.id);
  return getProductionReport(db, report.id);
}

export function returnDailyProductionReport(db, reportId, reason) {
  const returnReason = requiredText(reason, "motivo", { min: 3, max: 500 });
  const result = db.prepare(`UPDATE production_daily_reports SET status='returned',return_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='submitted'`).run(returnReason, positiveId(reportId));
  if (!result.changes) throw new ValidationError("El parte no está pendiente de revisión.");
  return getProductionReport(db, reportId);
}

export function confirmDailyProductionReport(db, reportId, adminId) {
  const report = db.prepare("SELECT * FROM production_daily_reports WHERE id=?").get(positiveId(reportId));
  if (!report || report.status !== "submitted") throw new ValidationError("El parte no está pendiente de confirmación.");
  const items = db.prepare("SELECT * FROM production_daily_report_items WHERE report_id=?").all(report.id);
  const warnings = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of items) {
      const product = db.prepare("SELECT km_code,name FROM products WHERE id=?").get(row.product_id);
      db.prepare(`INSERT OR IGNORE INTO inventory_items(item_code,name,item_type,unit,product_id) VALUES(?,?,'finished_product','unidad',?)`)
        .run(`PT-${product.km_code}`, product.name, row.product_id);
      const finished = db.prepare("SELECT id FROM inventory_items WHERE product_id=?").get(row.product_id);
      ensureBalance(db, finished.id);
      if (row.good_quantity > 0) addMovement(db, finished.id, row.good_quantity, "production_in", report.id, `Ingreso confirmado ${report.report_number}`, adminId);
      const attempted = row.good_quantity + row.rejected_quantity;
      const bom = db.prepare("SELECT component_item_id,quantity FROM product_bom WHERE product_id=? AND active=1").all(row.product_id);
      if (!bom.length) warnings.push(`${product.km_code}: receta pendiente de importar; no se descontaron insumos.`);
      for (const component of bom) addMovement(db, component.component_item_id, -(component.quantity * attempted), "production_consumption", report.id, `Consumo ${report.report_number} / ${product.km_code}`, adminId);
    }
    db.prepare(`UPDATE production_daily_reports SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(adminId, report.id);
    db.prepare(`UPDATE production_plans SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE id IN (
      SELECT DISTINCT pi.plan_id FROM production_daily_report_items ri JOIN production_plan_items pi ON pi.id=ri.plan_item_id WHERE ri.report_id=?)`).run(report.id);
    db.exec("COMMIT");
    return { report: getProductionReport(db, report.id), warnings };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function listProductionReports(db, { status = "", limit = 60 } = {}) {
  const rows = status ? db.prepare("SELECT id FROM production_daily_reports WHERE status=? ORDER BY production_date DESC LIMIT ?").all(status, limit)
    : db.prepare("SELECT id FROM production_daily_reports ORDER BY production_date DESC LIMIT ?").all(limit);
  return rows.map((row) => getProductionReport(db, row.id));
}

export function getProductionReport(db, reportId) {
  const report = db.prepare(`SELECT r.*,o.name AS operator_name FROM production_daily_reports r JOIN production_operators o ON o.id=r.operator_id WHERE r.id=?`).get(positiveId(reportId));
  if (!report) throw new NotFoundError("Parte diario no encontrado.");
  const items = db.prepare(`SELECT ri.*,p.km_code,p.ean13,p.name FROM production_daily_report_items ri JOIN products p ON p.id=ri.product_id WHERE ri.report_id=? ORDER BY p.km_code`).all(report.id);
  return { id: report.id, reportNumber: report.report_number, productionDate: report.production_date, status: report.status,
    notes: report.notes, returnReason: report.return_reason, operatorId: report.operator_id, operatorName: report.operator_name,
    submittedAt: report.submitted_at, confirmedAt: report.confirmed_at,
    items: items.map((row) => ({ id: row.id, productId: row.product_id, planItemId: row.plan_item_id, kmCode: row.km_code,
      ean13: row.ean13, name: row.name, goodQuantity: row.good_quantity, rejectedQuantity: row.rejected_quantity, notes: row.notes })) };
}

function normalizePlanItems(db, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map((item) => {
    const productId = positiveId(item.productId);
    if (seen.has(productId)) throw new ValidationError("No repitas productos en la planificación.");
    if (!db.prepare("SELECT id FROM products WHERE id=? AND active=1").get(productId)) throw new ValidationError("Uno de los productos no está activo.");
    seen.add(productId);
    const targetQuantity = nonNegativeInteger(item.targetQuantity, "cantidad objetivo");
    if (!targetQuantity) throw new ValidationError("La cantidad objetivo debe ser mayor que cero.");
    return { productId, targetQuantity, suggestedQuantity: nonNegativeInteger(item.suggestedQuantity || 0, "cantidad sugerida"), adjustmentNote: optionalText(item.adjustmentNote, "ajuste", { max: 300 }) };
  });
}

function normalizeReportItems(db, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map((item) => {
    const productId = positiveId(item.productId);
    if (seen.has(productId)) throw new ValidationError("No repitas productos en el parte diario.");
    if (!db.prepare("SELECT id FROM products WHERE id=?").get(productId)) throw new ValidationError("Producto no encontrado.");
    seen.add(productId);
    return { productId, goodQuantity: nonNegativeInteger(item.goodQuantity || 0, "cantidad fabricada"), rejectedQuantity: nonNegativeInteger(item.rejectedQuantity || 0, "cantidad rechazada"), notes: optionalText(item.notes, "observaciones", { max: 300 }) };
  });
}

function addMovement(db, itemId, delta, movementType, reportId, notes, adminId) {
  ensureBalance(db, itemId);
  db.prepare("UPDATE inventory_balances SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE item_id=?").run(delta, itemId);
  db.prepare(`INSERT INTO inventory_movements(item_id,quantity_delta,movement_type,reference_type,reference_id,notes,actor_user_id) VALUES(?,? ,?,'production_report',?,?,?)`)
    .run(itemId, delta, movementType, reportId, notes, adminId);
}
function ensureBalance(db, itemId) { db.prepare("INSERT OR IGNORE INTO inventory_balances(item_id,quantity) VALUES(?,0)").run(itemId); }
function publicOperator(row) { return { id: row.id, name: row.name, email: row.email, phone: row.phone || "", status: row.status }; }
function positiveId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Identificador inválido."); return id; }
function nonNegativeInteger(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new ValidationError(`${label} debe ser un número entero igual o mayor que cero.`); return number; }
function validDate(value, label) { if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new ValidationError(`Revisá ${label}.`); return value; }
