import http from "node:http";
import fs from "node:fs";
import { config } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import { createEmailService } from "./services/email-service.js";
import { createPushService } from "./services/push-service.js";

fs.mkdirSync(config.uploadsPath, { recursive: true });
const db = await openDatabase(config);
const pushService = createPushService({ db, config });
const emailService = createEmailService({ db, config, pushService });
void emailService.flush();
void pushService.flush();
void emailService.queuePaymentDueReminders();
const paymentReminderInterval = setInterval(() => {
  void emailService.queuePaymentDueReminders();
  void pushService.flush();
}, 60 * 60 * 1000);
const server = http.createServer(createApp({ db, config, emailService, pushService }));

server.listen(config.port, config.host, () => {
  console.log(`KM Detail B2B listening at http://${config.host}:${config.port}`);
});

function shutdown() {
  clearInterval(paymentReminderInterval);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
