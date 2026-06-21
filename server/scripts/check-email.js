import { config } from "../config.js";
import { openDatabase } from "../db.js";
import { createEmailService } from "../services/email-service.js";

const db = await openDatabase(config);
try {
  const emailService = createEmailService({ db, config });
  const result = await emailService.verify();
  console.log(JSON.stringify({
    ...result,
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    user: config.smtpUser
  }, null, 2));
} finally {
  db.close();
}
