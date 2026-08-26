import mysql from "mysql2/promise";
import { config } from "./config.js";

export const db = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 50,
  charset: "utf8mb4",
  timezone: "Z",
  namedPlaceholders: true,
  decimalNumbers: true
});

export async function healthcheck() {
  const [rows] = await db.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export async function audit(actorId, action, entityType, entityId, metadata = {}, tenantId = null) {
  await db.execute(
    `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId || null, actorId || null, action, entityType, entityId || null, JSON.stringify(metadata)]
  );
}
