import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

// Usage:
//   node scripts/migrate-saas.js              apply every pending migration
//   node scripts/migrate-saas.js --status     show applied vs pending, do nothing
//   node scripts/migrate-saas.js --dry-run    print what WOULD run, do nothing
//   node scripts/migrate-saas.js --baseline [FILE]
//        Mark migrations as applied WITHOUT running them — for a database
//        imported from a dump whose schema already exists but whose
//        schema_migrations table is empty (otherwise the runner re-runs old
//        migrations and dies on the first "table already exists").
//        With no FILE: baselines EVERY on-disk migration (only safe right
//        after an import, before any new migration files have been added).
//        With FILE (e.g. 20260902_tenant_leads_flag.sql): baselines only up
//        to and including that file; anything newer stays pending so a
//        normal run still applies it.

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const baselineThrough = rawArgs.find((a) => a.endsWith(".sql")) || null;
const MODE = args.has("--baseline")
  ? "baseline"
  : args.has("--status")
    ? "status"
    : args.has("--dry-run")
      ? "dry-run"
      : "apply";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
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

let exitCode = 0;

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [appliedRows] = await connection.query("SELECT migration_name FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => row.migration_name));
  const pending = migrationFiles.filter((file) => !applied.has(file));

  if (MODE === "status") {
    console.log(`Applied (${applied.size}):`);
    for (const file of migrationFiles.filter((f) => applied.has(f))) console.log(`  ✓ ${file}`);
    console.log(`Pending (${pending.length}):`);
    for (const file of pending) console.log(`  • ${file}`);
    process.exit(0);
  }

  if (MODE === "baseline") {
    if (baselineThrough && !migrationFiles.includes(baselineThrough)) {
      console.error(`No such migration file: ${baselineThrough}`);
      process.exit(1);
    }
    const cutoff = baselineThrough || migrationFiles[migrationFiles.length - 1];
    const toRecord = pending.filter((file) => file <= cutoff);
    if (!toRecord.length) {
      console.log("Nothing to baseline in that range.");
      process.exit(0);
    }
    console.log(
      `Baselining ${toRecord.length} migration(s) as applied WITHOUT running them` +
      (baselineThrough ? ` (through ${baselineThrough})` : "") + ":"
    );
    for (const file of toRecord) {
      await connection.execute(
        "INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)",
        [file]
      );
      console.log(`  ✓ recorded ${file}`);
    }
    const stillPending = pending.filter((file) => file > cutoff);
    console.log(
      stillPending.length
        ? `\nStill pending (run \`npm run migrate:saas\` to apply): ${stillPending.join(", ")}`
        : "\nBaseline complete."
    );
    process.exit(0);
  }

  if (MODE === "dry-run") {
    console.log(pending.length ? `Would apply ${pending.length} migration(s):` : "Nothing pending.");
    for (const file of pending) console.log(`  • ${file}`);
    process.exit(0);
  }

  // apply
  if (!pending.length) {
    console.log("No pending migrations.");
    process.exit(0);
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await connection.query(sql);
    } catch (error) {
      exitCode = 1;
      console.error(`\n✗ FAILED at migration: ${file}`);
      console.error(`  ${error.code || ""} ${error.sqlMessage || error.message}`);
      console.error(
        "\n  Nothing after this file was applied. If this database was imported from a\n" +
        "  dump and already has the schema, run:  node scripts/migrate-saas.js --baseline\n"
      );
      break;
    }
    await connection.execute(
      "INSERT IGNORE INTO schema_migrations (migration_name) VALUES (?)",
      [file]
    );
    console.log(`✓ ${file}`);
  }

  if (exitCode === 0) console.log("\nRingnex SaaS migrations completed.");
} finally {
  await connection.end();
}

process.exit(exitCode);
