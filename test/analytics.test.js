import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { getAnalyticsDashboard, recordAnalyticsEvents } from "../server/services/analytics-service.js";

test("analytics separates human sessions from bots and reports the latest visit", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-analytics-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const request = (userAgent) => ({
    headers: { "user-agent": userAgent, "x-forwarded-for": "127.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" }
  });
  recordAnalyticsEvents(db, request("Mozilla/5.0 Chrome/126"), null, {
    eventType: "page_view",
    sessionId: "human-session-1234567890",
    path: "/productos",
    referrer: "https://www.google.com/"
  });
  recordAnalyticsEvents(db, request("WhatsApp/2.24 Preview"), null, {
    eventType: "page_view",
    sessionId: "preview-session-123456789",
    path: "/producto/pad-lana"
  });

  const dashboard = getAnalyticsDashboard(db, { days: 30 });
  assert.equal(dashboard.summary.sessions, 2);
  assert.equal(dashboard.summary.humanSessions, 1);
  assert.equal(dashboard.summary.botSessions, 1);
  assert.equal(dashboard.summary.anonymousSessions, 1);
  assert.ok(dashboard.summary.latestVisitAt);
  assert.ok(dashboard.summary.latestHumanVisitAt);
  assert.equal(dashboard.visitorSessions.some((row) => row.isBot), true);
});
