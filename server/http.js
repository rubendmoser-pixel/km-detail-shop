import fs from "node:fs";
import path from "node:path";
import { renderSeoLandingPage } from "./seo-pages.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

export const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'sha256-PVZHrizMClelU2iyN4TWf3xQbRC26gEboVXyy3/YVIc='; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

export const SEO_SECURITY_HEADERS = {
  ...SECURITY_HEADERS,
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};

const SEO_ROUTES = new Map([
  ["/empresa", {
    title: "Empresa | KM Detail Line",
    description: "KM Detail Line como fabricante de insumos profesionales para pulido automotriz, chapa-pintura y detailing."
  }],
  ["/productos", {
    title: "Productos y pedidos | KM Detail Line",
    description: "Catalogo operativo de productos KM Detail Line fabricados para uso profesional en pulido automotriz, chapa-pintura y detailing."
  }],
  ["/catalogo-2026", {
    title: "Catalogo 2026 | KM Detail Line",
    description: "Catalogo profesional KM Detail Line 2026: insumos fabricados para pulido automotriz, chapa-pintura y detailing."
  }],
  ["/distribuidores", {
    title: "Distribuidores KM Detail Line | Alta de cuentas comerciales",
    description: "Alta comercial para distribuidores, pinturerias y comercios especializados que comercializan productos KM Detail Line para uso profesional."
  }],
  ["/contacto", {
    title: "Contacto | KM Detail Line",
    description: "Oficina comercial KM Detail Line en Rosario. Canal de atencion para distribuidores, pinturerias y comercios especializados."
  }]
]);

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
  const seoLandingPage = renderSeoLandingPage(decoded);
  if (seoLandingPage) {
    const content = Buffer.from(seoLandingPage, "utf8");
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": content.length,
      "cache-control": "no-cache",
      ...SEO_SECURITY_HEADERS
    });
    response.end(content);
    return true;
  }
  const routeMeta = SEO_ROUTES.get(decoded);
  const target = path.resolve(projectRoot, routeMeta ? "./index.html" : `.${decoded}`);
  const denied = ["server", "data", "uploads", ".git", ".env", "package.json"];
  const relative = path.relative(projectRoot, target);
  if (relative.startsWith("..") || denied.some((segment) => relative === segment || relative.startsWith(`${segment}${path.sep}`))) {
    return false;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const rawContent = fs.readFileSync(target);
  const content = routeMeta ? Buffer.from(applyRouteMeta(rawContent.toString("utf8"), decoded, routeMeta), "utf8") : rawContent;
  response.writeHead(200, {
    "content-type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "content-length": content.length,
    "cache-control": requested === "/index.html" || routeMeta ? "no-cache" : "public, max-age=3600",
    ...SECURITY_HEADERS
  });
  response.end(content);
  return true;
}

function applyRouteMeta(html, routePath, routeMeta) {
  const url = `https://www.km-detail.com${routePath}`;
  return html
    .replace(/<title>.*?<\/title>/, `<title>${routeMeta.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]+" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${routeMeta.description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${routeMeta.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${routeMeta.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${routeMeta.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${routeMeta.description}" />`);
}

export function serveProductImage(response, uploadsPath, pathname) {
  const match = pathname.match(/^\/media\/products\/([A-Za-z0-9._-]+)$/);
  if (!match) return false;
  const productsRoot = path.resolve(uploadsPath, "products");
  const target = path.resolve(productsRoot, match[1]);
  if (!target.startsWith(`${productsRoot}${path.sep}`)) return false;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const content = fs.readFileSync(target);
  response.writeHead(200, {
    "content-type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "content-length": content.length,
    "cache-control": "public, max-age=86400",
    ...SECURITY_HEADERS
  });
  response.end(content);
  return true;
}
