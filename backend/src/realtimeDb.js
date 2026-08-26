import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../.env.realtime", import.meta.url)),
  override: false
});

const requiredEnv = [
  "REALTIME_DB_HOST",
  "REALTIME_DB_PORT",
  "REALTIME_DB_NAME",
  "REALTIME_DB_USER",
  "REALTIME_DB_PASSWORD"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing Realtime DB environment variable: ${key}`);
  }
}

export const realtimeDb = mysql.createPool({
  host: process.env.REALTIME_DB_HOST,
  port: Number(process.env.REALTIME_DB_PORT),
  user: process.env.REALTIME_DB_USER,
  password: process.env.REALTIME_DB_PASSWORD,
  database: process.env.REALTIME_DB_NAME,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

export async function realtimeHealthcheck() {
  const [rows] = await realtimeDb.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}
