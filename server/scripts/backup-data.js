import { config } from "../config.js";
import { createBackup } from "../services/backup-service.js";

const backup = createBackup({
  databasePath: config.databasePath,
  uploadsPath: config.uploadsPath,
  backupPath: config.backupPath
});

console.log(`Backup creado: ${backup.targetDir}`);
console.log(`Base SQLite: ${formatBytes(backup.manifest.files.database.bytes)}`);
console.log(`Uploads: ${backup.manifest.files.uploads.files} archivos, ${formatBytes(backup.manifest.files.uploads.bytes)}`);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
