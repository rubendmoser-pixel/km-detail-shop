import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { upsertSalesRep } from "../server/services/sales-rep-service.js";
import {
  addSalesProspectActivity,
  canSalesRepAccessProspects,
  listSalesProspects
} from "../server/services/prospect-service.js";

test("la base de prospectos queda unificada y solo Rubén puede operarla", async (t) => {
  const databasePath = path.join(os.tmpdir(), `km-detail-prospects-${Date.now()}.sqlite`);
  const db = await openDatabase({ databasePath });
  t.after(() => {
    db.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  });

  const ruben = await upsertSalesRep(db, {
    name: "Ruben Dario Moser",
    email: "ruben.prospectos@example.com",
    defaultCommissionBps: 0,
    status: "active"
  });
  const other = await upsertSalesRep(db, {
    name: "Otro vendedor",
    email: "otro.prospectos@example.com",
    defaultCommissionBps: 0,
    status: "active"
  });

  assert.equal(canSalesRepAccessProspects(ruben), true);
  assert.equal(canSalesRepAccessProspects(other), false);
  const result = listSalesProspects(db, ruben);
  assert.equal(result.summary.total, 155);
  assert.equal(result.prospects.length, 155);
  assert.throws(() => listSalesProspects(db, other), /únicamente para Rubén/);

  const updated = addSalesProspectActivity(db, ruben, result.prospects[0].id, {
    channel: "whatsapp",
    status: "follow_up",
    notes: "Respondió y pidió que lo contactemos la semana próxima.",
    nextFollowUpDate: "2026-08-03"
  });
  assert.equal(updated.status, "follow_up");
  assert.equal(updated.activities.length, 1);
  assert.equal(updated.nextFollowUpDate, "2026-08-03");
});
