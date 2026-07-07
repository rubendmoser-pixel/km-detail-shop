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
  "price_list_download"
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
      activeCustomers,
      pageViews: count("page_view"),
      productViews: count("product_view") + count("product_zoom"),
      searches: count("search"),
      cartAdds: count("add_to_cart"),
      checkoutStarts: count("checkout_start"),
      ordersCreated,
      priceListDownloads: count("price_list_download")
    },
    productsViewed,
    productsAdded,
    searches,
    noResultSearches,
    productConversion,
    interestWithoutOrder,
    recent
  };
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
