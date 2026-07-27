import { AuthError, NotFoundError, ValidationError, optionalText, positiveInteger } from "../domain/validation.js";

const STATUSES = new Set([
  "uncontacted", "contacted", "interested", "quote_sent",
  "follow_up", "converted", "not_interested", "invalid"
]);
const PRIORITIES = new Set(["high", "medium", "normal"]);

function normalizedName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function canSalesRepAccessProspects(salesRep) {
  return normalizedName(salesRep?.name) === "ruben dario moser";
}

export function requireProspectSalesRep(salesRep) {
  if (!canSalesRepAccessProspects(salesRep)) {
    throw new AuthError("Este módulo comercial está habilitado únicamente para Rubén Darío Moser.", 403);
  }
  return salesRep;
}

export function listSalesProspects(db, salesRep, filters = {}) {
  const rep = requireProspectSalesRep(salesRep);
  db.prepare("UPDATE sales_prospects SET assigned_sales_rep_id = ? WHERE assigned_sales_rep_id IS NULL").run(rep.id);
  return listProspects(db, { ...filters, salesRepId: rep.id });
}

export function listAdminProspects(db, filters = {}) {
  return listProspects(db, filters);
}

function listProspects(db, filters = {}) {
  const search = String(filters.search || "").trim();
  const status = String(filters.status || "").trim();
  const city = String(filters.city || "").trim();
  const salesRepId = Number(filters.salesRepId || 0);
  const where = [];
  const params = [];
  if (salesRepId) {
    where.push("p.assigned_sales_rep_id = ?");
    params.push(salesRepId);
  }
  if (status) {
    if (!STATUSES.has(status)) throw new ValidationError("El estado del prospecto no es válido.");
    where.push("p.status = ?");
    params.push(status);
  }
  if (city) {
    where.push("p.city = ?");
    params.push(city);
  }
  if (search) {
    where.push("(p.business_name LIKE ? OR p.city LIKE ? OR p.phone LIKE ? OR p.address LIKE ?)");
    params.push(...Array(4).fill(`%${search}%`));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const prospects = db.prepare(`
    SELECT p.*, sr.name AS assigned_sales_rep_name,
      (SELECT COUNT(*) FROM sales_prospect_activities a WHERE a.prospect_id = p.id) AS activity_count,
      (SELECT a.notes FROM sales_prospect_activities a WHERE a.prospect_id = p.id ORDER BY a.created_at DESC, a.id DESC LIMIT 1) AS last_activity_note
    FROM sales_prospects p
    LEFT JOIN sales_reps sr ON sr.id = p.assigned_sales_rep_id
    ${whereSql}
    ORDER BY
      CASE p.status WHEN 'follow_up' THEN 0 WHEN 'interested' THEN 1 WHEN 'uncontacted' THEN 2 ELSE 3 END,
      CASE p.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      CASE WHEN p.next_follow_up_date = '' THEN 1 ELSE 0 END,
      p.next_follow_up_date,
      p.business_name COLLATE NOCASE
    LIMIT 500
  `).all(...params).map(mapProspect);
  const summaryWhere = salesRepId ? "WHERE assigned_sales_rep_id = ?" : "";
  const summaryParams = salesRepId ? [salesRepId] : [];
  const summaryRows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM sales_prospects ${summaryWhere} GROUP BY status
  `).all(...summaryParams);
  const summary = Object.fromEntries(summaryRows.map((row) => [row.status, Number(row.count || 0)]));
  summary.total = summaryRows.reduce((total, row) => total + Number(row.count || 0), 0);
  summary.pendingFollowUps = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM sales_prospects
    ${summaryWhere}${summaryWhere ? " AND" : " WHERE"} next_follow_up_date != '' AND next_follow_up_date <= date('now') AND status NOT IN ('converted', 'not_interested', 'invalid')
  `).get(...summaryParams)?.count || 0);
  const cities = db.prepare(`
    SELECT DISTINCT city FROM sales_prospects
    ${summaryWhere}${summaryWhere ? " AND" : " WHERE"} city != ''
    ORDER BY city COLLATE NOCASE
  `).all(...summaryParams).map((row) => row.city);
  return { prospects, summary, cities };
}

export function getSalesProspect(db, salesRep, prospectId) {
  const rep = requireProspectSalesRep(salesRep);
  const id = positiveInteger(Number(prospectId), "prospectId");
  const row = db.prepare("SELECT * FROM sales_prospects WHERE id = ? AND assigned_sales_rep_id = ?").get(id, rep.id);
  if (!row) throw new NotFoundError("Prospecto no encontrado.");
  const activities = db.prepare(`
    SELECT * FROM sales_prospect_activities WHERE prospect_id = ? ORDER BY created_at DESC, id DESC LIMIT 50
  `).all(id).map(mapActivity);
  return { ...mapProspect(row), activities };
}

export function updateSalesProspect(db, actor, prospectId, input = {}, role = "sales_rep") {
  const id = positiveInteger(Number(prospectId), "prospectId");
  if (role === "sales_rep") requireProspectSalesRep(actor);
  const current = role === "sales_rep"
    ? db.prepare("SELECT * FROM sales_prospects WHERE id = ? AND assigned_sales_rep_id = ?").get(id, actor.id)
    : db.prepare("SELECT * FROM sales_prospects WHERE id = ?").get(id);
  if (!current) throw new NotFoundError("Prospecto no encontrado.");
  const status = input.status === undefined ? current.status : String(input.status || "");
  const priority = input.priority === undefined ? current.priority : String(input.priority || "");
  if (!STATUSES.has(status)) throw new ValidationError("El estado del prospecto no es válido.");
  if (!PRIORITIES.has(priority)) throw new ValidationError("La prioridad del prospecto no es válida.");
  const values = {
    businessName: input.businessName === undefined ? current.business_name : optionalText(input.businessName, "businessName", { max: 160 }),
    contactPerson: input.contactPerson === undefined ? current.contact_person : optionalText(input.contactPerson, "contactPerson", { max: 140 }),
    email: input.email === undefined ? current.email : optionalText(input.email, "email", { max: 254 }),
    phone: input.phone === undefined ? current.phone : optionalText(input.phone, "phone", { max: 60 }),
    whatsapp: input.whatsapp === undefined ? current.whatsapp : optionalText(input.whatsapp, "whatsapp", { max: 60 }),
    address: input.address === undefined ? current.address : optionalText(input.address, "address", { max: 180 }),
    city: input.city === undefined ? current.city : optionalText(input.city, "city", { max: 120 }),
    province: input.province === undefined ? current.province : optionalText(input.province, "province", { max: 120 }),
    nextFollowUpDate: input.nextFollowUpDate === undefined ? current.next_follow_up_date : String(input.nextFollowUpDate || "").slice(0, 10),
    notes: input.notes === undefined ? current.notes : optionalText(input.notes, "notes", { max: 3000 })
  };
  db.prepare(`
    UPDATE sales_prospects SET
      business_name=?, contact_person=?, email=?, phone=?, whatsapp=?, address=?, city=?, province=?,
      status=?, priority=?, next_follow_up_date=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    values.businessName, values.contactPerson, values.email, values.phone, values.whatsapp,
    values.address, values.city, values.province, status, priority, values.nextFollowUpDate, values.notes, id
  );
  return role === "sales_rep" ? getSalesProspect(db, actor, id) : mapProspect(db.prepare("SELECT * FROM sales_prospects WHERE id=?").get(id));
}

export function addSalesProspectActivity(db, salesRep, prospectId, input = {}) {
  const prospect = getSalesProspect(db, salesRep, prospectId);
  const notes = optionalText(input.notes, "notes", { max: 2000 });
  if (!notes) throw new ValidationError("Escribí un breve resultado del contacto.");
  const status = String(input.status || prospect.status);
  if (!STATUSES.has(status)) throw new ValidationError("El estado del prospecto no es válido.");
  const nextFollowUpDate = String(input.nextFollowUpDate || "").slice(0, 10);
  db.prepare(`
    INSERT INTO sales_prospect_activities (
      prospect_id, kind, channel, outcome, notes, next_follow_up_date, created_by_role, created_by_id
    ) VALUES (?, 'contact', ?, ?, ?, ?, 'sales_rep', ?)
  `).run(
    prospect.id,
    optionalText(input.channel, "channel", { max: 40 }),
    optionalText(input.outcome, "outcome", { max: 120 }),
    notes,
    nextFollowUpDate,
    salesRep.id
  );
  db.prepare(`
    UPDATE sales_prospects SET status=?, last_contact_at=CURRENT_TIMESTAMP,
      next_follow_up_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(status, nextFollowUpDate, prospect.id);
  return getSalesProspect(db, salesRep, prospect.id);
}

export function markProspectQuoted(db, salesRep, prospectId) {
  if (!prospectId) return;
  const prospect = getSalesProspect(db, salesRep, prospectId);
  db.prepare("UPDATE sales_prospects SET status='quote_sent', last_contact_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(prospect.id);
}

export function markProspectConverted(db, salesRep, prospectId, customerId) {
  if (!prospectId) return;
  const prospect = getSalesProspect(db, salesRep, prospectId);
  db.prepare(`
    UPDATE sales_prospects SET status='converted', converted_customer_id=?,
      last_contact_at=CURRENT_TIMESTAMP, next_follow_up_date='', updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(customerId, prospect.id);
}

function mapProspect(row) {
  return {
    id: Number(row.id),
    sourceId: row.source_id || "",
    businessName: row.business_name,
    contactPerson: row.contact_person || "",
    email: row.email || "",
    phone: row.phone || "",
    whatsapp: row.whatsapp || "",
    address: row.address || "",
    city: row.city || "",
    province: row.province || "",
    postalCode: row.postal_code || "",
    category: row.category || "",
    confidence: row.confidence || "",
    automotiveProfile: row.automotive_profile || "",
    polishingProducts: row.polishing_products || "",
    rating: row.rating,
    reviewCount: Number(row.review_count || 0),
    priority: row.priority,
    status: row.status,
    lastContactAt: row.last_contact_at || "",
    nextFollowUpDate: row.next_follow_up_date || "",
    notes: row.notes || "",
    sourceNotes: row.source_notes || "",
    convertedCustomerId: row.converted_customer_id || null,
    assignedSalesRepId: row.assigned_sales_rep_id || null,
    assignedSalesRepName: row.assigned_sales_rep_name || "",
    activityCount: Number(row.activity_count || 0),
    lastActivityNote: row.last_activity_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapActivity(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    channel: row.channel,
    outcome: row.outcome,
    notes: row.notes,
    nextFollowUpDate: row.next_follow_up_date || "",
    createdAt: row.created_at
  };
}
