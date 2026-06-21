import http from "node:http";
import fs from "node:fs";
import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { createEmailService } from "./services/email-service.js";

fs.mkdirSync(config.uploadsPath, { recursive: true });
const db = await openDatabase(config);
const emailService = createEmailService({ db, config });
void emailService.flush();
const server = http.createServer(createApp({ db, config, emailService }));

server.listen(config.port, config.host, () => {
  console.log(`KM Detail B2B listening at http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
