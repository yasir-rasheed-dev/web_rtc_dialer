import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../migrations");
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER,
  password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "ringnex_dialer",
  multipleStatements: true
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [appliedRows] = await connection.query("SELECT migration_name FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.migration_name));

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      console.log(`Skipping applied migration: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await connection.query(sql);
    await connection.execute(
      "INSERT INTO schema_migrations (migration_name) VALUES (?)",
      [file]
    );
    console.log(`Completed migration: ${file}`);
  }

  console.log("Ringnex SaaS migrations completed");
} finally {
  await connection.end();
}
