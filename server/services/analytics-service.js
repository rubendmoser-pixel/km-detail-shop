import { optionalText } from "../domain/validation.js";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "product_view",
  "product_zoom",
  "search",
  "add_to_cart",
  "cart_open",
  "checkout_start",
  "order_created",
  "price_list_download",
  "account_open",
  "registration_submitted"
]);
const MAX_EVENTS_PER_REQUEST = 20;

export function recordAnalyticsEvents(db, request, currentUser, input) {
  const events = Array.isArray(input?.events) ? input.events : [input];
  const limited = events.slice(0, MAX_EVENTS_PER_REQUEST).map((event) => normalizeEvent(event)).filter(Boolean);
  if (!limited.length) return { recorded: 0 };
  const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress || "";
  const userAgent = request.headers["user-agent"] || "";
  const insert = db.prepare(`
    INSERT INTO analytics_events (
      event_type, session_id, user_id, customer_id, product_id, order_id, path, referrer, ip_address, user_agent, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const event of limited) {
    insert.run(
      event.eventType,
      event.sessionId,
      currentUser?.id || null,
      currentUser?.customerId || null,
      event.productId || null,
      event.orderId || null,
      event.path,
      event.referrer,
      ip,
      userAgent,
      JSON.stringify(event.metadata)
    );
  }
  return { recorded: limited.length };
}

export function recordServerAnalyticsEvent(db, request, currentUser, event) {
  return recordAnalyticsEvents(db, request, currentUser, event);
}

export function getAnalyticsDashboard(db, { days = 30 } = {}) {
  const normalizedDays = Math.min(365, Math.max(1, Number(days) || 30));
  const sinceModifier = `-${normalizedDays} days`;
  const eventCounts = db.prepare(`
    SELECT event_type AS eventType, COUNT(*) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY event_type
  `).all(sinceModifier);
  const count = (type) => eventCounts.find((event) => event.eventType === type)?.count || 0;
  const sessions = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND session_id <> ''
  `).get(sinceModifier)?.count || 0;
  const activeCustomers = db.prepare(`
    SELECT COUNT(DISTINCT customer_id) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND customer_id IS NOT NULL
  `).get(sinceModifier)?.count || 0;
  const ordersCreated = db.prepare(`
    SELECT COUNT(DISTINCT order_id) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND event_type = 'order_created' AND order_id IS NOT NULL
  `).get(sinceModifier)?.count || 0;
  const anonymousSessions = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT session_id,
        MAX(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END) AS hasCustomer
      FROM analytics_events
      WHERE created_at >= datetime('now', ?) AND session_id <> ''
      GROUP BY session_id
      HAVING hasCustomer = 0
    )
  `).get(sinceModifier)?.count || 0;
  const identifiedSessions = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT session_id,
        MAX(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END) AS hasCustomer
      FROM analytics_events
      WHERE created_at >= datetime('now', ?) AND session_id <> ''
      GROUP BY session_id
      HAVING hasCustomer = 1
    )
  `).get(sinceModifier)?.count || 0;
  const visitorSessions = db.prepare(`
    SELECT ae.session_id AS sessionId,
      MIN(ae.created_at) AS firstSeen,
      MAX(ae.created_at) AS lastSeen,
      COUNT(*) AS events,
      MAX(ae.customer_id) AS customerId,
      MAX(c.business_name) AS businessName,
      (
        SELECT x.path
        FROM analytics_events x
        WHERE x.session_id = ae.session_id
        ORDER BY x.created_at ASC, x.id ASC
        LIMIT 1
      ) AS entryPath,
      (
        SELECT x.path
        FROM analytics_events x
        WHERE x.session_id = ae.session_id
        ORDER BY x.created_at DESC, x.id DESC
        LIMIT 1
      ) AS lastPath,
      (
        SELECT x.referrer
        FROM analytics_events x
        WHERE x.session_id = ae.session_id AND x.referrer <> ''
        ORDER BY x.created_at ASC, x.id ASC
        LIMIT 1
      ) AS referrer,
      (
        SELECT x.ip_address
        FROM analytics_events x
        WHERE x.session_id = ae.session_id AND x.ip_address <> ''
        ORDER BY x.created_at DESC, x.id DESC
        LIMIT 1
      ) AS ipAddress,
      (
        SELECT x.user_agent
        FROM analytics_events x
        WHERE x.session_id = ae.session_id AND x.user_agent <> ''
        ORDER BY x.created_at DESC, x.id DESC
        LIMIT 1
      ) AS userAgent,
      SUM(CASE WHEN ae.event_type IN ('product_view', 'product_zoom') THEN 1 ELSE 0 END) AS productViews,
      SUM(CASE WHEN ae.event_type = 'search' THEN 1 ELSE 0 END) AS searches,
      SUM(CASE WHEN ae.event_type = 'add_to_cart' THEN 1 ELSE 0 END) AS cartAdds,
      COUNT(DISTINCT CASE WHEN ae.event_type = 'order_created' THEN ae.order_id END) AS ordersCreated
    FROM analytics_events ae
    LEFT JOIN customers c ON c.id = ae.customer_id
    WHERE ae.created_at >= datetime('now', ?) AND ae.session_id <> ''
    GROUP BY ae.session_id
    ORDER BY lastSeen DESC
    LIMIT 80
  `).all(sinceModifier).map(enrichVisitorSession);
  const sourceRows = db.prepare(`
    SELECT COALESCE(NULLIF(referrer, ''), 'direct') AS referrer,
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(*) AS events
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY COALESCE(NULLIF(referrer, ''), 'direct')
    ORDER BY sessions DESC, events DESC
    LIMIT 40
  `).all(sinceModifier);
  const sources = aggregateSources(sourceRows);
  const deviceRows = db.prepare(`
    SELECT user_agent AS userAgent,
      COUNT(DISTINCT session_id) AS sessions,
      COUNT(*) AS events
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND user_agent <> ''
    GROUP BY user_agent
    ORDER BY sessions DESC, events DESC
    LIMIT 120
  `).all(sinceModifier);
  const devices = aggregateDevices(deviceRows);
  const paths = db.prepare(`
    SELECT COALESCE(NULLIF(path, ''), '/') AS path,
      COUNT(*) AS views,
      COUNT(DISTINCT session_id) AS sessions
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND event_type = 'page_view'
    GROUP BY COALESCE(NULLIF(path, ''), '/')
    ORDER BY views DESC, sessions DESC
    LIMIT 16
  `).all(sinceModifier);
  const productsViewed = db.prepare(`
    SELECT p.id, p.km_code AS kmCode, p.name AS productName, COUNT(*) AS views
    FROM analytics_events ae
    JOIN products p ON p.id = ae.product_id
    WHERE ae.created_at >= datetime('now', ?) AND ae.event_type IN ('product_view', 'product_zoom')
    GROUP BY p.id
    ORDER BY views DESC, p.km_code ASC
    LIMIT 12
  `).all(sinceModifier);
  const productsAdded = db.prepare(`
    SELECT p.id, p.km_code AS kmCode, p.name AS productName, COUNT(*) AS adds,
      COALESCE(SUM(CAST(json_extract(ae.metadata_json, '$.quantity') AS INTEGER)), 0) AS units
    FROM analytics_events ae
    JOIN products p ON p.id = ae.product_id
    WHERE ae.created_at >= datetime('now', ?) AND ae.event_type = 'add_to_cart'
    GROUP BY p.id
    ORDER BY units DESC, adds DESC, p.km_code ASC
    LIMIT 12
  `).all(sinceModifier);
  const searches = db.prepare(`
    SELECT LOWER(TRIM(json_extract(metadata_json, '$.query'))) AS query, COUNT(*) AS count,
      MIN(CAST(json_extract(metadata_json, '$.resultCount') AS INTEGER)) AS minResults
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND event_type = 'search' AND LENGTH(TRIM(json_extract(metadata_json, '$.query'))) >= 2
    GROUP BY query
    ORDER BY count DESC, query ASC
    LIMIT 12
  `).all(sinceModifier);
  const noResultSearches = db.prepare(`
    SELECT LOWER(TRIM(json_extract(metadata_json, '$.query'))) AS query, COUNT(*) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
      AND event_type = 'search'
      AND LENGTH(TRIM(json_extract(metadata_json, '$.query'))) >= 2
      AND CAST(json_extract(metadata_json, '$.resultCount') AS INTEGER) = 0
    GROUP BY query
    ORDER BY count DESC, query ASC
    LIMIT 12
  `).all(sinceModifier);
  const productConversion = db.prepare(`
    WITH product_activity AS (
      SELECT product_id,
        SUM(CASE WHEN event_type IN ('product_view', 'product_zoom') THEN 1 ELSE 0 END) AS views,
        SUM(CASE WHEN event_type = 'add_to_cart' THEN 1 ELSE 0 END) AS adds,
        SUM(CASE WHEN event_type = 'add_to_cart' THEN COALESCE(CAST(json_extract(metadata_json, '$.quantity') AS INTEGER), 0) ELSE 0 END) AS addedUnits,
        COUNT(DISTINCT CASE WHEN event_type = 'order_created' THEN order_id END) AS orders,
        SUM(CASE WHEN event_type = 'order_created' THEN COALESCE(CAST(json_extract(metadata_json, '$.quantity') AS INTEGER), 0) ELSE 0 END) AS orderedUnits
      FROM analytics_events
      WHERE created_at >= datetime('now', ?) AND product_id IS NOT NULL
      GROUP BY product_id
    )
    SELECT p.id, p.km_code AS kmCode, p.name AS productName,
      pa.views, pa.adds, pa.addedUnits, pa.orders, pa.orderedUnits,
      CASE WHEN pa.views > 0 THEN ROUND(pa.adds * 100.0 / pa.views, 1) ELSE 0 END AS cartRate,
      CASE WHEN pa.views > 0 THEN ROUND(pa.orders * 100.0 / pa.views, 1) ELSE 0 END AS orderRate
    FROM product_activity pa
    JOIN products p ON p.id = pa.product_id
    ORDER BY pa.views DESC, pa.adds DESC, p.km_code ASC
    LIMIT 20
  `).all(sinceModifier);
  const interestWithoutOrder = productConversion
    .filter((row) => (row.views || 0) >= 2 && !(row.orders || 0))
    .slice(0, 12);
  const recent = db.prepare(`
    SELECT ae.event_type AS eventType, ae.path, ae.created_at AS createdAt, ae.metadata_json AS metadataJson,
      c.business_name AS businessName, p.km_code AS kmCode
    FROM analytics_events ae
    LEFT JOIN customers c ON c.id = ae.customer_id
    LEFT JOIN products p ON p.id = ae.product_id
    WHERE ae.created_at >= datetime('now', ?)
    ORDER BY ae.created_at DESC
    LIMIT 40
  `).all(sinceModifier).map((row) => ({
    ...row,
    metadata: parseJson(row.metadataJson)
  }));
  return {
    days: normalizedDays,
    summary: {
      sessions,
      anonymousSessions,
      identifiedSessions,
      activeCustomers,
      pageViews: count("page_view"),
      productViews: count("product_view") + count("product_zoom"),
      searches: count("search"),
      cartAdds: count("add_to_cart"),
      checkoutStarts: count("checkout_start"),
      ordersCreated,
      priceListDownloads: count("price_list_download"),
      accountOpens: count("account_open"),
      registrationSubmits: count("registration_submitted")
    },
    visitorSessions,
    sources,
    devices,
    paths,
    productsViewed,
    productsAdded,
    searches,
    noResultSearches,
    productConversion,
    interestWithoutOrder,
    recent
  };
}

function enrichVisitorSession(row) {
  const userAgent = row.userAgent || "";
  return {
    ...row,
    identity: row.businessName || "Visitante anonimo",
    isKnown: Boolean(row.customerId),
    source: sourceLabel(row.referrer),
    device: deviceLabel(userAgent),
    browser: browserLabel(userAgent),
    ipAddress: row.ipAddress || "-"
  };
}

function aggregateSources(rows) {
  const map = new Map();
  for (const row of rows) {
    const label = sourceLabel(row.referrer);
    const current = map.get(label) || { label, sessions: 0, events: 0 };
    current.sessions += Number(row.sessions || 0);
    current.events += Number(row.events || 0);
    map.set(label, current);
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.events - a.events).slice(0, 12);
}

function aggregateDevices(rows) {
  const map = new Map();
  for (const row of rows) {
    const device = deviceLabel(row.userAgent || "");
    const browser = browserLabel(row.userAgent || "");
    const key = `${device}|${browser}`;
    const current = map.get(key) || { device, browser, sessions: 0, events: 0 };
    current.sessions += Number(row.sessions || 0);
    current.events += Number(row.events || 0);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.events - a.events).slice(0, 12);
}

function sourceLabel(referrer = "") {
  const raw = String(referrer || "").trim();
  if (!raw || raw === "direct") return "Directo";
  const ref = raw.toLowerCase();
  if (ref.includes("km-detail.com")) return "Interno";
  if (ref.includes("google.")) return "Google";
  if (ref.includes("bing.")) return "Bing";
  if (ref.includes("yahoo.")) return "Yahoo";
  if (ref.includes("instagram.")) return "Instagram";
  if (ref.includes("facebook.") || ref.includes("fb.")) return "Facebook";
  if (ref.includes("whatsapp") || ref.includes("wa.me")) return "WhatsApp";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "Otro";
  }
}

function deviceLabel(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (!ua) return "Sin dato";
  if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp/.test(ua)) return "Bot / vista previa";
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "Celular";
  return "PC";
}

function browserLabel(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (!ua) return "Sin navegador";
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("chrome/") || ua.includes("crios/")) return "Chrome";
  if (ua.includes("safari/")) return "Safari";
  return "Otro";
}

function normalizeEvent(event = {}) {
  const eventType = optionalText(event.eventType || event.type, "eventType", { max: 60 });
  if (!ALLOWED_EVENTS.has(eventType)) return null;
  return {
    eventType,
    sessionId: optionalText(event.sessionId, "sessionId", { max: 80 }),
    productId: positiveOptional(event.productId),
    orderId: positiveOptional(event.orderId),
    path: optionalText(event.path, "path", { max: 500 }),
    referrer: optionalText(event.referrer, "referrer", { max: 500 }),
    metadata: safeMetadata(event.metadata)
  };
}

function positiveOptional(value) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).slice(0, 12).map(([key, value]) => [
    String(key).slice(0, 60),
    typeof value === "number" || typeof value === "boolean" ? value : String(value ?? "").slice(0, 300)
  ]));
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
