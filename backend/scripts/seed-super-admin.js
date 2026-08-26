import crypto from "node:crypto";
import { db } from "../src/db.js";
import { hashPassword } from "../src/security.js";

const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
const name = String(process.env.SUPER_ADMIN_NAME || "Ringnex Product Owner").trim();

if (!email || !password || password.startsWith("CHANGE_ME")) {
  throw new Error("Set SUPER_ADMIN_EMAIL and a unique SUPER_ADMIN_PASSWORD in backend/.env first");
}

const [rows] = await db.execute("SELECT id FROM super_admins WHERE email=? LIMIT 1", [email]);
if (rows[0]) {
  console.log(`Super Admin already exists: ${email}`);
} else {
  await db.execute(
    `INSERT INTO super_admins (id,email,name,password_hash,active)
     VALUES (?,?,?,?,1)`,
    [crypto.randomUUID(), email, name, await hashPassword(password)]
  );
  console.log(`Super Admin created: ${email}`);
}

await db.end();
