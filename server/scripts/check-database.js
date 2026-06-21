import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openDatabase } from "../db.js";

const databasePath = path.join(os.tmpdir(), `km-detail-check-${Date.now()}.sqlite`);
const db = await openDatabase({ databasePath });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log(JSON.stringify({ databasePath, tables: tables.map((table) => table.name) }, null, 2));
db.close();
for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
