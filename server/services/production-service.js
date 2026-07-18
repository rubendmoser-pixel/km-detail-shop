import { AuthError, NotFoundError, ValidationError, normalizeEmail, optionalText, requiredText } from "../domain/validation.js";
import { createSessionToken, hashPassword, hashToken, verifyPassword } from "../security.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function listProductionOperators(db) {
  return db.prepare(`SELECT id,name,email,phone,status,notes,created_at,updated_at,
    CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_portal_access
    FROM production_operators ORDER BY status='active' DESC,name COLLATE NOCASE`).all();
}

export function searchProductionProducts(db, query = "") {
  const search = String(query || "").trim().toUpperCase().slice(0, 30);
  if (!search) return [];
  return db.prepare(`SELECT id,km_code,ean13,name FROM products
    WHERE active=1 AND UPPER(km_code) LIKE ?
    ORDER BY CASE WHEN UPPER(km_code)=? THEN 0 WHEN UPPER(km_code) LIKE ? THEN 1 ELSE 2 END,km_code
    LIMIT 12`).all(`%${search}%`, search, `${search}%`).map((row) => ({
      id: row.id, kmCode: row.km_code, ean13: row.ean13, name: row.name
    }));
}

export function listProductionRecipes(db, { query = "", status = "" } = {}) {
  const search = String(query || "").trim().slice(0, 100);
  const clauses = ["p.active=1"];
  const params = [];
  if (search) {
    clauses.push("(p.km_code LIKE ? OR p.ean13 LIKE ? OR p.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status === "complete") clauses.push("EXISTS(SELECT 1 FROM product_bom bx WHERE bx.product_id=p.id AND bx.active=1)");
  if (status === "missing") clauses.push("NOT EXISTS(SELECT 1 FROM product_bom bx WHERE bx.product_id=p.id AND bx.active=1)");
  return db.prepare(`SELECT p.id,p.km_code,p.ean13,p.name FROM products p WHERE ${clauses.join(" AND ")}
    ORDER BY p.km_code COLLATE NOCASE`).all(...params).map((row) => publicRecipe(row, db));
}

export function upsertProductionRecipe(db, input = {}) {
  const productId = positiveId(input.productId);
  const product = db.prepare("SELECT id,km_code,ean13,name FROM products WHERE id=? AND active=1").get(productId);
  if (!product) throw new NotFoundError("Producto activo no encontrado.");
  const kmCode = requiredText(input.kmCode, "código KM", { min: 2, max: 40 }).toUpperCase();
  const ean13 = String(input.ean13 || "").replace(/\D/g, "");
  if (product.km_code.toUpperCase() !== kmCode || String(product.ean13 || "").replace(/\D/g, "") !== ean13) {
    throw new ValidationError("El código KM o el EAN no coinciden con el producto seleccionado.");
  }
  if (!Array.isArray(input.components) || !input.components.length) throw new ValidationError("Agregá al menos un insumo a la receta.");
  const seen = new Set();
  const components = input.components.map((component) => {
    const itemId = positiveId(component.itemId);
    if (seen.has(itemId)) throw new ValidationError("No repitas insumos en la receta.");
    const item = db.prepare("SELECT id FROM inventory_items WHERE id=? AND product_id IS NULL AND active=1").get(itemId);
    if (!item) throw new ValidationError("Uno de los insumos no existe o está inactivo.");
    seen.add(itemId);
    return { itemId, quantity: positiveNumber(component.quantity, "cantidad del insumo") };
  });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM product_bom WHERE product_id=?").run(productId);
    const insert = db.prepare("INSERT INTO product_bom(product_id,component_item_id,quantity,active) VALUES(?,?,?,1)");
    for (const component of components) insert.run(productId, component.itemId, component.quantity);
    db.exec("COMMIT");
    return publicRecipe(product, db);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  const preview = getProductionReportImpact(db, report.id);
  const warnings = [...preview.warnings];
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
      const bom = db.prepare(`SELECT b.component_item_id,b.quantity FROM product_bom b
        JOIN inventory_items i ON i.id=b.component_item_id WHERE b.product_id=? AND b.active=1 AND i.tracks_stock=1`).all(row.product_id);
      for (const component of bom) addMovement(db, component.component_item_id, -(component.quantity * attempted), "production_consumption", report.id, `Consumo ${report.report_number} / ${product.km_code}`, adminId);
    }
    db.prepare(`UPDATE production_daily_reports SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(adminId, report.id);
    db.prepare(`UPDATE production_plans SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE id IN (
      SELECT DISTINCT pi.plan_id FROM production_daily_report_items ri JOIN production_plan_items pi ON pi.id=ri.plan_item_id WHERE ri.report_id=?)`).run(report.id);
    db.exec("COMMIT");
    return { report: getProductionReport(db, report.id), warnings, impact: getProductionReportImpact(db, report.id) };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function getProductionReportImpact(db, reportId) {
  const report = db.prepare("SELECT id,status,report_number FROM production_daily_reports WHERE id=?").get(positiveId(reportId));
  if (!report) throw new NotFoundError("Parte diario no encontrado.");
  const inventoryInitialized = db.prepare("SELECT value FROM settings WHERE key='inventory_initial_stock_loaded'").get()?.value === "1";
  const reportItems = db.prepare(`SELECT ri.product_id,ri.good_quantity,ri.rejected_quantity,p.km_code,p.name
    FROM production_daily_report_items ri JOIN products p ON p.id=ri.product_id WHERE ri.report_id=? ORDER BY p.km_code`).all(report.id);
  if (report.status === "confirmed") {
    const movements = db.prepare(`SELECT m.id,m.quantity_delta,m.movement_type,m.reference_type,m.reference_id,m.notes,m.balance_after,m.created_at,
      i.item_code,i.name,i.item_type,i.unit,COALESCE(b.quantity,0) AS current_balance
      FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
      LEFT JOIN inventory_balances b ON b.item_id=i.id
      WHERE m.reference_type='production_report' AND m.reference_id=? ORDER BY m.id`).all(report.id).map(publicMovement);
    return {
      mode: "applied", inventoryInitialized, reportNumber: report.report_number,
      products: reportItems.map(publicReportImpactItem),
      components: movements.filter((movement) => movement.movementType === "production_consumption"),
      outputs: movements.filter((movement) => movement.movementType === "production_in"),
      warnings: []
    };
  }

  const products = [];
  const componentTotals = new Map();
  const warnings = [];
  for (const row of reportItems) {
    const finished = db.prepare(`SELECT i.id,i.item_code,i.name,i.unit,COALESCE(b.quantity,0) AS balance
      FROM inventory_items i LEFT JOIN inventory_balances b ON b.item_id=i.id WHERE i.product_id=?`).get(row.product_id);
    const currentBalance = Number(finished?.balance || 0);
    products.push({ ...publicReportImpactItem(row), itemCode: finished?.item_code || `PT-${row.km_code}`,
      unit: finished?.unit || "unidad", currentBalance, delta: row.good_quantity, resultingBalance: currentBalance + row.good_quantity });
    const attempted = row.good_quantity + row.rejected_quantity;
    const bom = db.prepare(`SELECT b.component_item_id,b.quantity,i.item_code,i.name,i.unit,COALESCE(ib.quantity,0) AS balance
      FROM product_bom b JOIN inventory_items i ON i.id=b.component_item_id
      LEFT JOIN inventory_balances ib ON ib.item_id=i.id WHERE b.product_id=? AND b.active=1 AND i.tracks_stock=1`).all(row.product_id);
    if (!bom.length) warnings.push(`${row.km_code}: receta pendiente de importar.`);
    for (const component of bom) {
      const existing = componentTotals.get(component.component_item_id) || {
        itemId: component.component_item_id, itemCode: component.item_code, name: component.name,
        unit: component.unit, currentBalance: Number(component.balance || 0), delta: 0
      };
      existing.delta -= Number(component.quantity) * attempted;
      componentTotals.set(component.component_item_id, existing);
    }
  }
  const components = [...componentTotals.values()].map((component) => ({
    ...component, resultingBalance: component.currentBalance + component.delta
  })).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  const negatives = components.filter((component) => component.resultingBalance < 0);
  if (negatives.length && !inventoryInitialized) warnings.unshift("El stock inicial de insumos todavía no fue cargado; los saldos negativos son informativos.");
  if (negatives.length && inventoryInitialized) warnings.unshift(`${negatives.length} insumos quedarían con stock insuficiente.`);
  return { mode: "preview", inventoryInitialized, reportNumber: report.report_number, products, components, outputs: [], warnings };
}

export function getProductionInventory(db, { query = "", type = "" } = {}) {
  const search = String(query || "").trim().slice(0, 80);
  const allowedTypes = new Set(["raw_material", "intermediate", "finished_product"]);
  const itemType = allowedTypes.has(type) ? type : "";
  const clauses = ["i.active=1", "i.tracks_stock=1"];
  const params = [];
  if (itemType) { clauses.push("i.item_type=?"); params.push(itemType); }
  if (search) { clauses.push("(i.item_code LIKE ? OR i.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const items = db.prepare(`SELECT i.id,i.item_code,i.name,i.item_type,i.item_kind,i.unit,i.product_id,i.minimum_stock,
    COALESCE(b.quantity,0) AS quantity,b.updated_at,p.km_code
    FROM inventory_items i LEFT JOIN inventory_balances b ON b.item_id=i.id
    LEFT JOIN products p ON p.id=i.product_id WHERE ${clauses.join(" AND ")}
    ORDER BY i.item_type,i.item_code`).all(...params).map((row) => ({
      id: row.id, itemCode: row.item_code, name: row.name, itemType: row.item_type, itemKind: row.item_kind || row.item_type, unit: row.unit,
      productId: row.product_id, kmCode: row.km_code || "", quantity: Number(row.quantity || 0), minimumStock: Number(row.minimum_stock || 0), updatedAt: row.updated_at || ""
    }));
  const movements = db.prepare(`SELECT m.id,m.quantity_delta,m.movement_type,m.reference_type,m.reference_id,m.supplier_id,
    m.notes,m.balance_after,m.created_at,i.item_code,i.name,i.item_type,i.unit,s.name AS supplier_name,COALESCE(b.quantity,0) AS current_balance
    FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
    LEFT JOIN inventory_balances b ON b.item_id=i.id LEFT JOIN production_suppliers s ON s.id=m.supplier_id
    ORDER BY m.id DESC LIMIT 120`).all().map(publicMovement);
  const inventoryInitialized = db.prepare("SELECT value FROM settings WHERE key='inventory_initial_stock_loaded'").get()?.value === "1";
  return {
    inventoryInitialized,
    summary: {
      totalItems: items.length,
      rawMaterials: items.filter((item) => item.itemType === "raw_material").length,
      intermediates: items.filter((item) => item.itemType === "intermediate").length,
      finishedProducts: items.filter((item) => item.itemType === "finished_product").length,
      negativeBalances: items.filter((item) => item.quantity < 0).length,
      belowMinimum: items.filter((item) => item.itemType !== "finished_product" && item.minimumStock > 0 && item.quantity <= item.minimumStock).length
    },
    items, movements
  };
}

export function getProductionStockParameters(db) {
  const productSafetyDays = settingInteger(db, "production_product_safety_days", 30);
  const materialSafetyDays = settingInteger(db, "production_material_safety_days", 30);
  const items = db.prepare(`SELECT i.id,i.item_code,i.name,i.item_type,i.item_kind,i.unit,i.safety_days,i.minimum_batch,p.km_code,
    COALESCE(b.quantity,0) AS quantity FROM inventory_items i
    LEFT JOIN inventory_balances b ON b.item_id=i.id
    LEFT JOIN products p ON p.id=i.product_id
    WHERE i.active=1 AND i.tracks_stock=1 AND COALESCE(i.item_kind,'')!='service'
    ORDER BY i.item_type='finished_product' DESC,i.item_code COLLATE NOCASE`).all().map((row) => {
      const product = row.item_type === "finished_product";
      const safetyDays = row.safety_days === null ? null : Number(row.safety_days);
      return {
        id: row.id, itemCode: product && row.km_code ? row.km_code : row.item_code, name: row.name, itemType: row.item_type,
        itemKind: row.item_kind || row.item_type, unit: row.unit, quantity: Number(row.quantity || 0),
        safetyDays, effectiveSafetyDays: safetyDays === null ? (product ? productSafetyDays : materialSafetyDays) : safetyDays,
        usesDefault: safetyDays === null, minimumBatch: product ? Math.max(1, Number(row.minimum_batch || 1)) : null
      };
    });
  return { defaults: { productSafetyDays, materialSafetyDays }, items };
}

export function getProductionSuggestions(db) {
  const productSafetyDays = settingInteger(db, "production_product_safety_days", 30);
  const materialSafetyDays = settingInteger(db, "production_material_safety_days", 30);
  const history = db.prepare(`SELECT MIN(COALESCE(o.updated_at,o.created_at)) AS first_sale,COUNT(DISTINCT o.id) AS orders
    FROM orders o WHERE o.fulfillment_status IN ('shipped','delivered')
    AND o.status!='cancelled' AND COALESCE(o.updated_at,o.created_at)>=datetime('now','-90 days')`).get();
  const deliveredOrders = Number(history.orders || 0);
  const rawDays = history.first_sale ? Math.floor(Number(db.prepare("SELECT julianday('now')-julianday(?) AS days").get(history.first_sale).days || 0)) + 1 : 0;
  const observationDays = deliveredOrders ? Math.min(90, Math.max(7, rawDays)) : 0;
  const productRows = db.prepare(`SELECT p.id AS product_id,p.km_code,p.name,i.id AS item_id,i.safety_days,i.minimum_batch,
      COALESCE(b.quantity,0) AS stock,
      COALESCE(SUM(CASE WHEN o.fulfillment_status IN ('shipped','delivered') AND o.status!='cancelled'
        AND COALESCE(o.updated_at,o.created_at)>=datetime('now','-90 days') THEN CASE WHEN oi.confirmed_quantity>0 THEN oi.confirmed_quantity ELSE oi.quantity END ELSE 0 END),0) AS delivered_quantity,
      COALESCE(SUM(CASE WHEN o.status IN ('availability_confirmed','confirmed','in_preparation','ready')
        AND COALESCE(o.fulfillment_status,'pending') IN ('pending','ready') THEN oi.confirmed_quantity ELSE 0 END),0) AS pending_quantity
    FROM products p JOIN inventory_items i ON i.product_id=p.id AND i.active=1 AND i.tracks_stock=1
    LEFT JOIN inventory_balances b ON b.item_id=i.id
    LEFT JOIN order_items oi ON oi.product_id=p.id LEFT JOIN orders o ON o.id=oi.order_id
    WHERE p.active=1 GROUP BY p.id,i.id ORDER BY p.km_code COLLATE NOCASE`).all();
  const products = productRows.map((row) => {
    const deliveredQuantity = Number(row.delivered_quantity || 0);
    const dailyDemand = observationDays ? deliveredQuantity / observationDays : 0;
    const pendingQuantity = Number(row.pending_quantity || 0);
    const safetyDays = row.safety_days === null ? productSafetyDays : Number(row.safety_days);
    const minimumBatch = Math.max(1, Number(row.minimum_batch || 1));
    const stock = Number(row.stock || 0);
    const targetStock = dailyDemand * safetyDays;
    const shortage = Math.max(0, targetStock + pendingQuantity - stock);
    const suggestedQuantity = shortage > 0 ? Math.ceil(shortage / minimumBatch) * minimumBatch : 0;
    return {
      productId: row.product_id, itemId: row.item_id, kmCode: row.km_code, name: row.name, stock,
      deliveredQuantity, pendingQuantity, dailyDemand, observationDays, safetyDays, targetStock,
      minimumBatch, suggestedQuantity,
      reason: suggestedQuantity ? (pendingQuantity > stock ? "pending_orders" : "safety_stock") : (dailyDemand || pendingQuantity ? "covered" : "collecting_data")
    };
  });
  const productById = new Map(products.map((product) => [product.productId, product]));
  const componentDemand = new Map();
  for (const row of db.prepare(`SELECT b.product_id,b.component_item_id,b.quantity FROM product_bom b
    JOIN inventory_items i ON i.id=b.component_item_id WHERE b.active=1 AND i.active=1 AND i.tracks_stock=1`).all()) {
    const product = productById.get(row.product_id);
    if (!product) continue;
    const current = componentDemand.get(row.component_item_id) || { dailyDemand: 0, plannedRequirement: 0 };
    current.dailyDemand += product.dailyDemand * Number(row.quantity);
    current.plannedRequirement += product.suggestedQuantity * Number(row.quantity);
    componentDemand.set(row.component_item_id, current);
  }
  const supplierRows = db.prepare(`SELECT si.item_id,s.id,s.name,si.is_primary FROM production_supplier_items si
    JOIN production_suppliers s ON s.id=si.supplier_id WHERE si.active=1 AND s.active=1
    ORDER BY si.is_primary DESC,s.name COLLATE NOCASE`).all();
  const supplierByItem = new Map();
  for (const supplier of supplierRows) if (!supplierByItem.has(supplier.item_id)) supplierByItem.set(supplier.item_id, supplier);
  const materials = db.prepare(`SELECT i.id,i.item_code,i.name,i.item_kind,i.item_type,i.unit,i.purchase_unit,i.conversion_factor,
      i.minimum_purchase,i.safety_days,COALESCE(b.quantity,0) AS stock FROM inventory_items i
    LEFT JOIN inventory_balances b ON b.item_id=i.id
    WHERE i.active=1 AND i.tracks_stock=1 AND i.product_id IS NULL AND COALESCE(i.item_kind,'raw_material')!='service'
    ORDER BY i.item_type='intermediate',i.item_code COLLATE NOCASE`).all().map((row) => {
      const demand = componentDemand.get(row.id) || { dailyDemand: 0, plannedRequirement: 0 };
      const safetyDays = row.safety_days === null ? materialSafetyDays : Number(row.safety_days);
      const safetyStock = demand.dailyDemand * safetyDays;
      const stock = Number(row.stock || 0);
      const requiredStock = safetyStock + demand.plannedRequirement;
      const shortage = Math.max(0, requiredStock - stock);
      const intermediate = row.item_kind === "intermediate" || row.item_type === "intermediate";
      const factor = Math.max(Number(row.conversion_factor || 1), 0.000001);
      let purchaseQuantity = intermediate ? 0 : shortage / factor;
      if (purchaseQuantity > 0) purchaseQuantity = Math.max(purchaseQuantity, Number(row.minimum_purchase || 0));
      if (purchaseQuantity > 0 && discretePurchaseUnit(row.purchase_unit)) purchaseQuantity = Math.ceil(purchaseQuantity);
      const supplier = supplierByItem.get(row.id);
      return {
        itemId: row.id, itemCode: row.item_code, name: row.name, itemKind: row.item_kind || row.item_type,
        unit: row.unit, purchaseUnit: row.purchase_unit || row.unit, conversionFactor: factor, stock,
        dailyDemand: demand.dailyDemand, plannedRequirement: demand.plannedRequirement, safetyDays, safetyStock,
        requiredStock, shortage, purchaseQuantity, preparationQuantity: intermediate ? shortage : 0,
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        action: shortage <= 0 ? "covered" : intermediate ? "prepare" : "purchase"
      };
    });
  const learningStatus = deliveredOrders === 0 ? "collecting" : (observationDays < 30 || deliveredOrders < 10) ? "learning" : "stable";
  return {
    generatedAt: new Date().toISOString(), history: { windowDays: 90, observationDays, deliveredOrders, status: learningStatus },
    summary: {
      productsToProduce: products.filter((product) => product.suggestedQuantity > 0).length,
      unitsToProduce: products.reduce((total, product) => total + product.suggestedQuantity, 0),
      materialsToPurchase: materials.filter((material) => material.action === "purchase").length,
      intermediatesToPrepare: materials.filter((material) => material.action === "prepare").length
    },
    products, materials
  };
}

export function saveProductionStockParameterDefaults(db, input = {}, adminId) {
  const productSafetyDays = stockSafetyDays(input.productSafetyDays, "días de seguridad para productos");
  const materialSafetyDays = stockSafetyDays(input.materialSafetyDays, "días de seguridad para insumos");
  const statement = db.prepare(`INSERT INTO settings(key,value,updated_by) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`);
  db.exec("BEGIN");
  try {
    statement.run("production_product_safety_days", String(productSafetyDays), adminId || null);
    statement.run("production_material_safety_days", String(materialSafetyDays), adminId || null);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getProductionStockParameters(db);
}

export function saveProductionStockItemParameter(db, input = {}) {
  const itemId = positiveId(input.itemId);
  const item = db.prepare("SELECT id,item_type FROM inventory_items WHERE id=? AND active=1 AND tracks_stock=1").get(itemId);
  if (!item) throw new NotFoundError("Producto o insumo activo no encontrado.");
  const useDefault = input.useDefault === true;
  const safetyDays = useDefault ? null : stockSafetyDays(input.safetyDays, "días de seguridad");
  let minimumBatch = Number(item.item_type === "finished_product" ? input.minimumBatch : 1);
  if (item.item_type === "finished_product") {
    if (!Number.isSafeInteger(minimumBatch) || minimumBatch < 1) throw new ValidationError("El lote mínimo debe ser un número entero mayor que cero.");
  } else minimumBatch = 1;
  db.prepare("UPDATE inventory_items SET safety_days=?,minimum_batch=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(safetyDays, minimumBatch, itemId);
  return getProductionStockParameters(db);
}

export function registerProductionInventoryEntry(db, input = {}, adminId) {
  const itemId = positiveId(input.itemId);
  const item = db.prepare(`SELECT id,item_code,name,item_kind,item_type,unit,purchase_unit,conversion_factor,
    product_id,active,tracks_stock FROM inventory_items WHERE id=?`).get(itemId);
  if (!item || item.product_id || !item.active || !item.tracks_stock) throw new NotFoundError("Insumo activo no encontrado.");
  const mode = ["purchase", "initial", "preparation"].includes(input.mode) ? input.mode : "";
  if (!mode) throw new ValidationError("Seleccioná el tipo de ingreso.");
  const intermediate = item.item_kind === "intermediate" || item.item_type === "intermediate";
  if (mode === "purchase" && intermediate) throw new ValidationError("Los intermedios se ingresan como preparación, no como compra.");
  if (mode === "preparation" && !intermediate) throw new ValidationError("La preparación solo corresponde a insumos intermedios.");
  const enteredQuantity = positiveNumber(input.quantity, mode === "purchase" ? "cantidad comprada" : "cantidad ingresada");
  const conversionFactor = mode === "preparation" ? 1 : positiveNumber(item.conversion_factor, "factor de conversión");
  const stockQuantity = enteredQuantity * conversionFactor;
  const minimumStock = nonNegativeNumber(input.minimumStock || 0, "stock mínimo");
  const notes = optionalText(input.notes, "observaciones", { max: 300 });
  let supplier = null;
  if (input.supplierId) {
    const supplierId = positiveId(input.supplierId);
    supplier = db.prepare(`SELECT s.id,s.name FROM production_supplier_items si JOIN production_suppliers s ON s.id=si.supplier_id
      WHERE si.item_id=? AND si.supplier_id=? AND si.active=1 AND s.active=1`).get(itemId, supplierId);
    if (!supplier) throw new ValidationError("El proveedor seleccionado no abastece este insumo.");
  }
  if (mode === "purchase" && !supplier) {
    supplier = db.prepare(`SELECT s.id,s.name FROM production_supplier_items si JOIN production_suppliers s ON s.id=si.supplier_id
      WHERE si.item_id=? AND si.active=1 AND s.active=1 ORDER BY si.is_primary DESC,s.name LIMIT 1`).get(itemId) || null;
  }
  ensureBalance(db, itemId);
  const current = Number(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(itemId).quantity || 0);
  const newQuantity = mode === "initial" ? stockQuantity : current + stockQuantity;
  const delta = newQuantity - current;
  const movementType = mode === "purchase" ? "stock_receipt" : mode === "preparation" ? "intermediate_preparation" : "initial_stock";
  const automaticNote = mode === "purchase" ? `Ingreso por compra${supplier ? ` a ${supplier.name}` : ""}` : mode === "preparation" ? "Preparación de intermedio" : "Carga inicial de stock";
  const movementNotes = notes ? `${automaticNote} · ${notes}` : automaticNote;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE inventory_items SET minimum_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(minimumStock, itemId);
    db.prepare("UPDATE inventory_balances SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE item_id=?").run(newQuantity, itemId);
    db.prepare(`INSERT INTO inventory_movements(item_id,quantity_delta,movement_type,reference_type,notes,actor_user_id,balance_after,supplier_id)
      VALUES(?,?,?,?,?,?,?,?)`).run(itemId, delta, movementType, mode === "purchase" ? "supplier_receipt" : mode === "preparation" ? "production_preparation" : "initial_stock", movementNotes, adminId, newQuantity, supplier?.id || null);
    db.prepare("INSERT INTO settings(key,value) VALUES('inventory_initial_stock_loaded','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: item.id, itemCode: item.item_code, name: item.name, unit: item.unit, purchaseUnit: item.purchase_unit,
    enteredQuantity, conversionFactor, stockQuantity, previousQuantity: current, quantity: newQuantity, minimumStock,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null, movementType };
}

export function adjustProductionInventory(db, input = {}, adminId) {
  const itemId = positiveId(input.itemId);
  const item = db.prepare("SELECT id,item_code,name,unit,product_id,active,tracks_stock FROM inventory_items WHERE id=?").get(itemId);
  if (!item || item.product_id || !item.active || !item.tracks_stock) throw new NotFoundError("Insumo activo no encontrado.");
  const quantity = nonNegativeNumber(input.quantity, "stock actual");
  const minimumStock = nonNegativeNumber(input.minimumStock || 0, "stock mínimo");
  const reason = requiredText(input.reason, "motivo del ajuste", { min: 3, max: 300 });
  ensureBalance(db, itemId);
  const current = Number(db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(itemId).quantity || 0);
  const delta = quantity - current;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE inventory_items SET minimum_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(minimumStock, itemId);
    db.prepare("UPDATE inventory_balances SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE item_id=?").run(quantity, itemId);
    if (Math.abs(delta) > 0.000000001) {
      db.prepare(`INSERT INTO inventory_movements(item_id,quantity_delta,movement_type,reference_type,notes,actor_user_id,balance_after)
        VALUES(?,?,'stock_adjustment','manual_stock',?,?,?)`).run(itemId, delta, reason, adminId, quantity);
    }
    db.prepare("INSERT INTO settings(key,value) VALUES('inventory_initial_stock_loaded','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: item.id, itemCode: item.item_code, name: item.name, unit: item.unit, previousQuantity: current, quantity, minimumStock, delta };
}

export function listProductionMaterials(db, { query = "", kind = "", status = "" } = {}) {
  const search = String(query || "").trim().slice(0, 100);
  const allowedKinds = new Set(["raw_material", "packaging", "service", "intermediate"]);
  const clauses = ["i.product_id IS NULL"];
  const params = [];
  if (allowedKinds.has(kind)) { clauses.push("i.item_kind=?"); params.push(kind); }
  if (status === "active" || status === "inactive") { clauses.push("i.active=?"); params.push(status === "active" ? 1 : 0); }
  if (search) {
    clauses.push("(i.item_code LIKE ? OR i.name LIKE ? OR i.category LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return db.prepare(`SELECT i.*,COALESCE(b.quantity,0) AS quantity
    FROM inventory_items i LEFT JOIN inventory_balances b ON b.item_id=i.id
    WHERE ${clauses.join(" AND ")} ORDER BY i.active DESC,i.item_code COLLATE NOCASE`)
    .all(...params).map((row) => publicMaterial(row, db));
}

export function listProductionSuppliers(db, { query = "", status = "" } = {}) {
  const search = String(query || "").trim().slice(0, 100);
  const clauses = [];
  const params = [];
  if (status === "active" || status === "inactive") { clauses.push("s.active=?"); params.push(status === "active" ? 1 : 0); }
  if (search) {
    clauses.push("(s.name LIKE ? OR s.legal_name LIKE ? OR s.tax_id LIKE ? OR s.contact_name LIKE ? OR s.email LIKE ? OR s.city LIKE ?)");
    params.push(...Array(6).fill(`%${search}%`));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT s.* FROM production_suppliers s ${where} ORDER BY s.active DESC,s.name COLLATE NOCASE`)
    .all(...params).map((row) => publicSupplier(row, db));
}

export function upsertProductionSupplier(db, input = {}) {
  const id = Number(input.id || 0);
  const existing = id ? db.prepare("SELECT id FROM production_suppliers WHERE id=?").get(id) : null;
  if (id && !existing) throw new NotFoundError("Proveedor no encontrado.");
  const name = requiredText(input.name, "nombre comercial", { min: 2, max: 160 });
  const values = {
    legalName: optionalText(input.legalName, "razón social", { max: 180 }), taxId: optionalText(input.taxId, "CUIT", { max: 30 }),
    contactName: optionalText(input.contactName, "contacto", { max: 160 }), email: optionalText(input.email, "email", { max: 254 }),
    phone: optionalText(input.phone, "teléfono", { max: 60 }), whatsapp: optionalText(input.whatsapp, "WhatsApp", { max: 60 }),
    address: optionalText(input.address, "dirección", { max: 220 }), city: optionalText(input.city, "ciudad", { max: 120 }),
    province: optionalText(input.province, "provincia", { max: 120 }), notes: optionalText(input.notes, "observaciones", { max: 1000 })
  };
  const active = input.active === false ? 0 : 1;
  const materialIds = [...new Set((Array.isArray(input.materialIds) ? input.materialIds : []).map(Number))];
  if (materialIds.some((materialId) => !Number.isSafeInteger(materialId) || materialId <= 0)) throw new ValidationError("La selección de insumos no es válida.");
  if (materialIds.length) {
    const found = db.prepare(`SELECT COUNT(*) AS count FROM inventory_items WHERE product_id IS NULL AND id IN (${materialIds.map(() => "?").join(",")})`).get(...materialIds).count;
    if (found !== materialIds.length) throw new ValidationError("Uno de los insumos seleccionados no existe.");
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    let supplierId = id;
    if (existing) {
      db.prepare(`UPDATE production_suppliers SET name=?,legal_name=?,tax_id=?,contact_name=?,email=?,phone=?,whatsapp=?,address=?,city=?,province=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, values.legalName, values.taxId, values.contactName, values.email, values.phone, values.whatsapp, values.address, values.city, values.province, values.notes, active, id);
    } else {
      supplierId = db.prepare(`INSERT INTO production_suppliers(name,legal_name,tax_id,contact_name,email,phone,whatsapp,address,city,province,notes,active)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(name, values.legalName, values.taxId, values.contactName, values.email, values.phone, values.whatsapp,
        values.address, values.city, values.province, values.notes, active).id;
    }
    const previousPrimary = new Set(db.prepare("SELECT item_id FROM production_supplier_items WHERE supplier_id=? AND is_primary=1").all(supplierId).map((row) => row.item_id));
    db.prepare("DELETE FROM production_supplier_items WHERE supplier_id=?").run(supplierId);
    const insert = db.prepare("INSERT INTO production_supplier_items(supplier_id,item_id,is_primary,active) VALUES(?,?,?,1)");
    for (const materialId of materialIds) insert.run(supplierId, materialId, previousPrimary.has(materialId) ? 1 : 0);
    db.exec("COMMIT");
    return publicSupplier(db.prepare("SELECT * FROM production_suppliers WHERE id=?").get(supplierId), db);
  } catch (error) {
    db.exec("ROLLBACK");
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe un proveedor con ese nombre.");
    throw error;
  }
}

export function upsertProductionMaterial(db, input = {}) {
  const id = Number(input.id || 0);
  const existing = id ? db.prepare("SELECT * FROM inventory_items WHERE id=? AND product_id IS NULL").get(id) : null;
  if (id && !existing) throw new NotFoundError("Insumo no encontrado.");
  const itemCode = requiredText(input.itemCode, "código interno", { min: 2, max: 60 }).toUpperCase();
  const name = requiredText(input.name, "nombre", { min: 2, max: 180 });
  const category = optionalText(input.category, "categoría", { max: 100 });
  const allowedKinds = new Set(["raw_material", "packaging", "service", "intermediate"]);
  const itemKind = allowedKinds.has(input.itemKind) ? input.itemKind : "raw_material";
  const itemType = itemKind === "intermediate" ? "intermediate" : "raw_material";
  const unit = requiredText(input.unit, "unidad de stock", { min: 1, max: 40 });
  const purchaseUnit = requiredText(input.purchaseUnit, "unidad de compra", { min: 1, max: 40 });
  const conversionFactor = positiveNumber(input.conversionFactor, "factor de conversión");
  const currency = input.currency === "ARS" ? "ARS" : "USD";
  const purchaseCost = nonNegativeNumber(input.purchaseCost, "costo de compra");
  const minimumPurchase = nonNegativeNumber(input.minimumPurchase, "compra mínima");
  const leadTimeDays = nonNegativeInteger(input.leadTimeDays || 0, "plazo de entrega");
  const tracksStock = itemKind === "service" ? 0 : input.tracksStock === false ? 0 : 1;
  const active = input.active === false ? 0 : 1;
  const primarySupplierId = Number(input.primarySupplierId || 0);
  if (primarySupplierId && !db.prepare("SELECT id FROM production_suppliers WHERE id=? AND active=1").get(primarySupplierId)) {
    throw new ValidationError("El proveedor principal seleccionado no está activo.");
  }
  try {
    let materialId = id;
    if (existing) {
      db.prepare(`UPDATE inventory_items SET item_code=?,name=?,item_type=?,unit=?,active=?,category=?,item_kind=?,
        purchase_unit=?,conversion_factor=?,currency=?,purchase_cost=?,minimum_purchase=?,lead_time_days=?,tracks_stock=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).run(itemCode, name, itemType, unit, active, category, itemKind, purchaseUnit, conversionFactor,
        currency, purchaseCost, minimumPurchase, leadTimeDays, tracksStock, id);
    } else {
      materialId = db.prepare(`INSERT INTO inventory_items(item_code,name,item_type,unit,active,category,item_kind,purchase_unit,
        conversion_factor,currency,purchase_cost,minimum_purchase,lead_time_days,tracks_stock)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(itemCode, name, itemType, unit, active, category, itemKind,
        purchaseUnit, conversionFactor, currency, purchaseCost, minimumPurchase, leadTimeDays, tracksStock).id;
      ensureBalance(db, materialId);
    }
    db.prepare("UPDATE production_supplier_items SET is_primary=0,updated_at=CURRENT_TIMESTAMP WHERE item_id=?").run(materialId);
    if (primarySupplierId) {
      db.prepare(`INSERT INTO production_supplier_items(supplier_id,item_id,is_primary,active) VALUES(?,?,1,1)
        ON CONFLICT(supplier_id,item_id) DO UPDATE SET is_primary=1,active=1,updated_at=CURRENT_TIMESTAMP`).run(primarySupplierId, materialId);
    }
    return publicMaterial(db.prepare(`SELECT i.*,COALESCE(b.quantity,0) AS quantity FROM inventory_items i
      LEFT JOIN inventory_balances b ON b.item_id=i.id WHERE i.id=?`).get(materialId), db);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE")) throw new ValidationError("Ya existe un insumo con ese código interno.");
    throw error;
  }
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
  const balanceAfter = db.prepare("SELECT quantity FROM inventory_balances WHERE item_id=?").get(itemId).quantity;
  db.prepare(`INSERT INTO inventory_movements(item_id,quantity_delta,movement_type,reference_type,reference_id,notes,actor_user_id,balance_after) VALUES(?,? ,?,'production_report',?,?,?,?)`)
    .run(itemId, delta, movementType, reportId, notes, adminId, balanceAfter);
}
function publicReportImpactItem(row) { return { productId: row.product_id, kmCode: row.km_code, name: row.name,
  goodQuantity: row.good_quantity, rejectedQuantity: row.rejected_quantity, attemptedQuantity: row.good_quantity + row.rejected_quantity }; }
function publicMovement(row) { return { id: row.id, itemCode: row.item_code, name: row.name, itemType: row.item_type,
  unit: row.unit, delta: Number(row.quantity_delta), movementType: row.movement_type, referenceType: row.reference_type,
  referenceId: row.reference_id, notes: row.notes || "", balanceAfter: row.balance_after === null ? null : Number(row.balance_after),
  currentBalance: Number(row.current_balance || 0), supplierId: row.supplier_id || null, supplierName: row.supplier_name || "", createdAt: row.created_at }; }
function publicMaterial(row, db) {
  const suppliers = db ? db.prepare(`SELECT s.id,s.name,si.is_primary FROM production_supplier_items si
    JOIN production_suppliers s ON s.id=si.supplier_id WHERE si.item_id=? AND si.active=1 ORDER BY si.is_primary DESC,s.name COLLATE NOCASE`).all(row.id) : [];
  return {
  id: row.id, itemCode: row.item_code, name: row.name, category: row.category || "", itemKind: row.item_kind || row.item_type,
  itemType: row.item_type, unit: row.unit, purchaseUnit: row.purchase_unit || row.unit,
  conversionFactor: Number(row.conversion_factor || 1), currency: row.currency === "ARS" ? "ARS" : "USD",
  purchaseCost: Number(row.purchase_cost || 0), minimumPurchase: Number(row.minimum_purchase || 0), minimumStock: Number(row.minimum_stock || 0),
  leadTimeDays: Number(row.lead_time_days || 0), tracksStock: Boolean(row.tracks_stock), active: Boolean(row.active),
  quantity: Number(row.quantity || 0), supplierIds: suppliers.map((supplier) => supplier.id),
  primarySupplier: suppliers.find((supplier) => supplier.is_primary) || null
}; }
function publicSupplier(row, db) {
  const materials = db.prepare(`SELECT i.id,i.item_code,i.name,si.is_primary FROM production_supplier_items si
    JOIN inventory_items i ON i.id=si.item_id WHERE si.supplier_id=? AND si.active=1 ORDER BY i.item_code COLLATE NOCASE`).all(row.id);
  return { id: row.id, name: row.name, legalName: row.legal_name || "", taxId: row.tax_id || "", contactName: row.contact_name || "",
    email: row.email || "", phone: row.phone || "", whatsapp: row.whatsapp || "", address: row.address || "", city: row.city || "",
    province: row.province || "", notes: row.notes || "", active: Boolean(row.active),
    materialIds: materials.map((material) => material.id), materials: materials.map((material) => ({ id: material.id,
      itemCode: material.item_code, name: material.name, primary: Boolean(material.is_primary) })) };
}
function publicRecipe(row, db) {
  const components = db.prepare(`SELECT i.id,i.item_code,i.name,i.item_kind,i.item_type,i.unit,b.quantity
    FROM product_bom b JOIN inventory_items i ON i.id=b.component_item_id
    WHERE b.product_id=? AND b.active=1 ORDER BY i.item_code COLLATE NOCASE`).all(row.id).map((component) => ({
      itemId: component.id, itemCode: component.item_code, name: component.name,
      itemKind: component.item_kind || component.item_type, unit: component.unit, quantity: Number(component.quantity)
    }));
  return { productId: row.id, kmCode: row.km_code, ean13: row.ean13 || "", name: row.name,
    complete: components.length > 0, componentCount: components.length, components };
}
function ensureBalance(db, itemId) { db.prepare("INSERT OR IGNORE INTO inventory_balances(item_id,quantity) VALUES(?,0)").run(itemId); }
function publicOperator(row) { return { id: row.id, name: row.name, email: row.email, phone: row.phone || "", status: row.status }; }
function nonNegativeNumber(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new ValidationError(`${label} debe ser un número igual o mayor que cero.`); return number; }
function positiveNumber(value, label) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new ValidationError(`${label} debe ser mayor que cero.`); return number; }
function positiveId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Identificador inválido."); return id; }
function nonNegativeInteger(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new ValidationError(`${label} debe ser un número entero igual o mayor que cero.`); return number; }
function stockSafetyDays(value, label) { const days = nonNegativeInteger(value, label); if (days > 730) throw new ValidationError(`${label} no puede superar 730 días.`); return days; }
function settingInteger(db, key, fallback) { const value = Number(db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value); return Number.isSafeInteger(value) && value >= 0 ? value : fallback; }
function discretePurchaseUnit(unit) { return /^(unidad|rollo|placa|barra|bobina)/i.test(String(unit || "").trim()); }
function validDate(value, label) { if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new ValidationError(`Revisá ${label}.`); return value; }
