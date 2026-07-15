import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = path.resolve(import.meta.dirname, "../..");

export function createBackup({ databasePath, uploadsPath, backupPath = "" }) {
  const sourceDbPath = path.resolve(databasePath);
  const sourceUploadsPath = path.resolve(uploadsPath);
  const backupRoot = path.resolve(backupPath || (isInsideDataVolume(sourceDbPath) ? "/data/backups" : path.join(projectRoot, "backups")));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `km-detail-backup-${stamp}`;
  const targetDir = path.join(backupRoot, name);
  const databaseBackup = path.join(targetDir, "km-detail.sqlite");
  const uploadsBackup = path.join(targetDir, "uploads");
  const manifestPath = path.join(targetDir, "manifest.json");

  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`No existe la base de datos: ${sourceDbPath}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  try {
    const db = new DatabaseSync(sourceDbPath);
    try {
      db.exec("PRAGMA wal_checkpoint(FULL);");
      const escapedPath = databaseBackup.replaceAll("'", "''");
      db.exec(`VACUUM INTO '${escapedPath}';`);
    } finally {
      db.close();
    }

    if (fs.existsSync(sourceUploadsPath)) {
      fs.cpSync(sourceUploadsPath, uploadsBackup, { recursive: true });
    } else {
      fs.mkdirSync(uploadsBackup, { recursive: true });
    }

    const manifest = {
      createdAt: new Date().toISOString(),
      databasePath: sourceDbPath,
      uploadsPath: sourceUploadsPath,
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
    return { name, targetDir, manifest };
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}

export function formatBackupSummary(backup) {
  return {
    name: backup.name,
    createdAt: backup.manifest.createdAt,
    databaseBytes: backup.manifest.files.database.bytes,
    uploadFiles: backup.manifest.files.uploads.files,
    uploadBytes: backup.manifest.files.uploads.bytes
  };
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

function isInsideDataVolume(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/").startsWith("/data/");
}
