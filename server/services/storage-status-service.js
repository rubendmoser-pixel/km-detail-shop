import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");

export function getStorageStatus() {
  const databasePath = path.resolve(config.databasePath);
  const uploadsPath = path.resolve(config.uploadsPath);
  const backupPath = path.resolve(process.env.BACKUP_PATH || path.join(projectRoot, "backups"));
  const backupDirs = listBackupDirs(backupPath);
  const latestBackup = backupDirs[0] || null;
  const warnings = [];

  if (!fs.existsSync(databasePath)) {
    warnings.push("No se encontro la base de datos.");
  }
  if (!fs.existsSync(uploadsPath)) {
    warnings.push("No se encontro la carpeta de archivos subidos.");
  }
  if (process.env.NODE_ENV === "production") {
    if (!isInsideDataVolume(databasePath)) warnings.push("La base de datos no apunta a /data.");
    if (!isInsideDataVolume(uploadsPath)) warnings.push("Los archivos subidos no apuntan a /data.");
    if (!isInsideDataVolume(backupPath)) warnings.push("Los backups no apuntan a /data.");
  }
  if (!latestBackup) {
    warnings.push("No hay backups registrados.");
  }

  return {
    generatedAt: new Date().toISOString(),
    database: {
      path: databasePath,
      exists: fs.existsSync(databasePath),
      bytes: sizeOf(databasePath)
    },
    uploads: {
      path: uploadsPath,
      exists: fs.existsSync(uploadsPath),
      files: fs.existsSync(uploadsPath) ? countFiles(uploadsPath) : 0,
      bytes: fs.existsSync(uploadsPath) ? directorySize(uploadsPath) : 0
    },
    backups: {
      path: backupPath,
      exists: fs.existsSync(backupPath),
      count: backupDirs.length,
      latest: latestBackup
    },
    persistent: {
      databaseInData: isInsideDataVolume(databasePath),
      uploadsInData: isInsideDataVolume(uploadsPath),
      backupsInData: isInsideDataVolume(backupPath)
    },
    health: warnings.length ? "warning" : "ok",
    warnings
  };
}

function listBackupDirs(backupPath) {
  if (!fs.existsSync(backupPath)) return [];
  return fs.readdirSync(backupPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("km-detail-backup-"))
    .map((entry) => {
      const fullPath = path.join(backupPath, entry.name);
      const manifestPath = path.join(fullPath, "manifest.json");
      const stats = fs.statSync(fullPath);
      let manifest = {};
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        } catch {
          manifest = {};
        }
      }
      return {
        name: entry.name,
        path: fullPath,
        createdAt: manifest.createdAt || stats.mtime.toISOString(),
        databaseBytes: Number(manifest.files?.database?.bytes || 0),
        uploadFiles: Number(manifest.files?.uploads?.files || 0),
        uploadBytes: Number(manifest.files?.uploads?.bytes || 0)
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function isInsideDataVolume(filePath) {
  return normalizePath(filePath).startsWith("/data/");
}

function normalizePath(filePath) {
  return path.resolve(filePath).replaceAll("\\", "/");
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
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? fs.statSync(filePath).size : 0;
}
