import { config } from "../config.js";
import { openDatabase } from "../db.js";
import { createEmailService } from "../services/email-service.js";

const db = await openDatabase(config);
try {
  const emailService = createEmailService({ db, config });
  const result = await emailService.sendTest(config.notificationEmail);
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
}
