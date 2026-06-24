const LIMITS = new Map([
  ["/api/auth/login", { max: 60, windowMs: 15 * 60 * 1000 }],
  ["/api/auth/register", { max: 15, windowMs: 60 * 60 * 1000 }],
  ["/api/auth/forgot-password", { max: 20, windowMs: 60 * 60 * 1000 }],
  ["/api/auth/reset-password", { max: 20, windowMs: 60 * 60 * 1000 }]
]);

export function createRateLimiter() {
  const attempts = new Map();

  return function checkRateLimit(request, pathname) {
    const limit = LIMITS.get(pathname);
    if (!limit || request.method !== "POST") return null;
    const now = Date.now();
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || request.socket.remoteAddress || "unknown";
    const key = `${ip}:${pathname}`;
    const current = attempts.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + limit.windowMs } : current;
    entry.count += 1;
    attempts.set(key, entry);

    if (attempts.size > 10_000) {
      for (const [candidate, value] of attempts) if (value.resetAt <= now) attempts.delete(candidate);
    }
    if (entry.count <= limit.max) return null;
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  };
}
