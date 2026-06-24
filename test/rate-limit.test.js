import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../server/rate-limit.js";

test("limits repeated authentication attempts by IP and route", () => {
  const check = createRateLimiter();
  const request = {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "127.0.0.1" }
  };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(check(request, "/api/auth/login"), null);
  }
  assert.ok(check(request, "/api/auth/login") > 0);
  assert.equal(check(request, "/api/products"), null);
});
