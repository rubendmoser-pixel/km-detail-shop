import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");

export function defaultBackupRoot() {
  if (process.env.BACKUP_PATH) return path.resolve(process.env.BACKUP_PATH);
  const databasePath = path.resolve(config.databasePath).replaceAll("\\", "/");
  if (databasePath.startsWith("/data/")) return "/data/backups";
  return path.join(projectRoot, "backups");
}

export function createDataBackup() {
  const backupRoot = defaultBackupRoot();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(backupRoot, `km-detail-backup-${stamp}`);
  const databaseBackup = path.join(targetDir, "km-detail.sqlite");
  const uploadsBackup = path.join(targetDir, "uploads");
  const manifestPath = path.join(targetDir, "manifest.json");

  fs.mkdirSync(targetDir, { recursive: true });

  const sourceDbPath = path.resolve(config.databasePath);
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`No existe la base de datos: ${sourceDbPath}`);
  }

  const db = new DatabaseSync(sourceDbPath);
  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
    const escapedPath = databaseBackup.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${escapedPath}';`);
  } finally {
    db.close();
  }

  const uploadsPath = path.resolve(config.uploadsPath);
  if (fs.existsSync(uploadsPath)) {
    fs.cpSync(uploadsPath, uploadsBackup, { recursive: true });
  } else {
    fs.mkdirSync(uploadsBackup, { recursive: true });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    databasePath: sourceDbPath,
    uploadsPath,
    backupDir: targetDir,
    files: {
      database: {
        path: databaseBackup,
        bytes: sizeOf(databaseBackup)
      },
      uploads: {
        path: uploadsBackup,
        files: countFiles(uploadsBackup),
        bytes: directorySize(uploadsBackup)
      }
    }
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(fullPath);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(fullPath);
    else if (entry.isFile()) total += sizeOf(fullPath);
  }
  return total;
}

function sizeOf(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}
