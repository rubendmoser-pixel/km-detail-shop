function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUrl(value) {
  const text = cleanText(value, 240);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function toDistributor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    province: row.province,
    city: row.city,
    address: row.address,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    website: row.website,
    contactPerson: row.contact_person,
    coverage: row.coverage,
    notes: row.notes,
    isPublished: Boolean(row.is_published),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listOfficialDistributors(db, { publishedOnly = false, search = "", status = "" } = {}) {
  const clauses = ["1 = 1"];
  const params = {};
  if (publishedOnly || status === "published") clauses.push("is_published = 1");
  if (status === "draft") clauses.push("is_published = 0");
  const term = cleanText(search, 120);
  if (term) {
    params.term = `%${term}%`;
    clauses.push(`(
      name LIKE @term OR province LIKE @term OR city LIKE @term OR address LIKE @term OR
      whatsapp LIKE @term OR email LIKE @term OR contact_person LIKE @term OR coverage LIKE @term
    )`);
  }
  return db.prepare(`
    SELECT *
    FROM official_distributors
    WHERE ${clauses.join(" AND ")}
    ORDER BY is_published DESC, sort_order ASC, province COLLATE NOCASE, city COLLATE NOCASE, name COLLATE NOCASE
  `).all(params).map(toDistributor);
}

export function getOfficialDistributor(db, id) {
  return toDistributor(db.prepare("SELECT * FROM official_distributors WHERE id = ?").get(Number(id)));
}

export function upsertOfficialDistributor(db, input = {}) {
  const id = Number(input.id || 0);
  const distributor = {
    name: cleanText(input.name, 160),
    province: cleanText(input.province, 100),
    city: cleanText(input.city, 100),
    address: cleanText(input.address, 180),
    phone: cleanText(input.phone, 60),
    whatsapp: cleanText(input.whatsapp, 60),
    email: cleanText(input.email, 180).toLowerCase(),
    website: cleanUrl(input.website),
    contactPerson: cleanText(input.contactPerson, 120),
    coverage: cleanText(input.coverage, 220),
    notes: cleanText(input.notes, 800),
    isPublished: input.isPublished ? 1 : 0,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0
  };
  if (!distributor.name) throw Object.assign(new Error("El nombre del distribuidor es obligatorio."), { status: 400 });

  if (id > 0) {
    const result = db.prepare(`
      UPDATE official_distributors
      SET name = @name, province = @province, city = @city, address = @address, phone = @phone,
          whatsapp = @whatsapp, email = @email, website = @website, contact_person = @contactPerson,
          coverage = @coverage, notes = @notes, is_published = @isPublished, sort_order = @sortOrder,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...distributor, id });
    if (!result.changes) throw Object.assign(new Error("Distribuidor no encontrado."), { status: 404 });
    return getOfficialDistributor(db, id);
  }

  const result = db.prepare(`
    INSERT INTO official_distributors (
      name, province, city, address, phone, whatsapp, email, website, contact_person,
      coverage, notes, is_published, sort_order
    )
    VALUES (
      @name, @province, @city, @address, @phone, @whatsapp, @email, @website, @contactPerson,
      @coverage, @notes, @isPublished, @sortOrder
    )
  `).run(distributor);
  return getOfficialDistributor(db, result.lastInsertRowid);
}

export function deleteOfficialDistributor(db, id) {
  const result = db.prepare("DELETE FROM official_distributors WHERE id = ?").run(Number(id));
  if (!result.changes) throw Object.assign(new Error("Distribuidor no encontrado."), { status: 404 });
  return { ok: true };
}
