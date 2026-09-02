import mysql from "mysql2/promise";
import { config } from "./config.js";

// connectionLimit was 12 — sized for early single-tenant testing. Bumped
// for real multi-tenant concurrency (dashboards polling + live call-event
// writes across many simultaneous agents/tenants sharing this one pool).
// MySQL's own max_connections here is 151 with only a handful ever in use
// (realtimeDb's separate pool takes 3, everything else is occasional), so
// 30 leaves plenty of headroom for other processes on the same server.
export const db = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 100,
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
