import crypto from "node:crypto";
import { db } from "../src/db.js";
import { hashPassword } from "../src/security.js";

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const name = String(process.env.ADMIN_NAME || "Ringnex Administrator").trim();

if (!email || !password || password.startsWith("CHANGE_ME")) {
  throw new Error("Set ADMIN_EMAIL and a unique ADMIN_PASSWORD in backend/.env first");
}

const [rows] = await db.execute("SELECT id FROM users WHERE email=?", [email]);
if (rows[0]) {
  console.log(`Admin already exists: ${email}`);
} else {
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO users (id,email,name,role,password_hash,team_name,status,active)
     VALUES (?,?,?,?,?,'Administration','OFFLINE',1)`,
    [id, email, name, "ADMIN", await hashPassword(password)]
  );
  console.log(`Admin created: ${email}`);
}

await db.end();
