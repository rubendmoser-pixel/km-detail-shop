function requestIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

export function recordSecurityEvent(db, request, {
  eventType,
  email = "",
  userId = null,
  role = "",
  statusCode = 0,
  metadata = {}
}) {
  db.prepare(`
    INSERT INTO security_events (
      event_type, email, user_id, role, ip_address, user_agent, method, path, status_code, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType,
    String(email || "").trim().toLowerCase().slice(0, 254),
    userId,
    String(role || "").slice(0, 40),
    requestIp(request).slice(0, 80),
    String(request.headers["user-agent"] || "").slice(0, 500),
    String(request.method || "").slice(0, 12),
    new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname.slice(0, 180),
    Number(statusCode) || 0,
    JSON.stringify(metadata || {}).slice(0, 2000)
  );
}

export function listSecurityEvents(db, { q = "", limit = 150 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 150, 500));
  const search = String(q || "").trim().toLowerCase();
  const params = [];
  let where = "";
  if (search) {
    where = `
      WHERE lower(event_type) LIKE ?
         OR lower(email) LIKE ?
         OR lower(ip_address) LIKE ?
         OR lower(user_agent) LIKE ?
         OR lower(path) LIKE ?
    `;
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  return db.prepare(`
    SELECT id, event_type, email, user_id, role, ip_address, user_agent, method, path,
           status_code, metadata_json, created_at
    FROM security_events
    ${where}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ${safeLimit}
  `).all(...params).map((event) => ({
    ...event,
    metadata: safeJson(event.metadata_json)
  }));
}

export function summarizeSecurityEvents(db) {
  const rows = db.prepare(`
    SELECT event_type, COUNT(*) AS count
    FROM security_events
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY event_type
  `).all();
  return Object.fromEntries(rows.map((row) => [row.event_type, row.count]));
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
