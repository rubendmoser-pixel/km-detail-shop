import fs from "node:fs";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

export async function readJson(request, maxBytes = 1_000_000) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const error = new Error("Content-Type must be application/json");
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

export function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...SECURITY_HEADERS,
    ...extraHeaders
  });
  response.end(body);
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, separator).trim()), decodeURIComponent(part.slice(separator + 1))];
  }));
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = 2_592_000 } = {}) {
  return [
    `km_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

export function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie("", { secure, maxAgeSeconds: 0 });
}

export function serveStatic(response, projectRoot, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const target = path.resolve(projectRoot, `.${decoded}`);
  const denied = ["server", "data", "uploads", ".git", ".env", "package.json"];
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || denied.some((segment) => relative === segment || relative.startsWith(`${segment}${path.sep}`))) {
    return false;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const content = fs.readFileSync(target);
  response.writeHead(200, {
    "content-type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "content-length": content.length,
    "cache-control": requested === "/index.html" ? "no-cache" : "public, max-age=3600",
    ...SECURITY_HEADERS
  });
  response.end(content);
  return true;
}
