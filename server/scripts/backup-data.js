import { createDataBackup } from "../services/backup-service.js";

const manifest = createDataBackup();

console.log(`Backup creado: ${manifest.backupDir}`);
console.log(`Base SQLite: ${formatBytes(manifest.files.database.bytes)}`);
console.log(`Uploads: ${manifest.files.uploads.files} archivos, ${formatBytes(manifest.files.uploads.bytes)}`);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
