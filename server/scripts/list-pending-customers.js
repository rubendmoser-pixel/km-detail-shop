import { config } from "../config.js";
import { openDatabase } from "../db.js";

const db = await openDatabase(config);
try {
  const customers = db.prepare(`
    SELECT c.id, c.business_name AS businessName, u.email, c.approval_status AS status,
           c.city, c.province, c.created_at AS createdAt
    FROM customers c
    JOIN users u ON u.id = c.user_id
    WHERE c.approval_status = 'pending'
    ORDER BY c.created_at DESC
  `).all();
  console.log(JSON.stringify(customers, null, 2));
} finally {
  db.close();
}
