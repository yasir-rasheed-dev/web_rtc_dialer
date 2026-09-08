// Realign an agent's SIP password across BOTH databases when the softphone
// starts getting "401 Unauthorized" on REGISTER.
//
// The app hands the softphone a password decrypted from
//   users.sip_secret_ciphertext        (main app DB, AES-256-GCM)
// and Asterisk authenticates it against
//   ps_auths.password                  (the realtime / ARA DB, plaintext)
// If those two ever drift (an .env key change, a realtime-DB swap, a
// manual pjsip edit, a half-finished re-provision) every REGISTER is
// rejected 401. This regenerates one password and writes it to both
// sides, and re-creates the ps_aors / ps_auths / ps_endpoints rows if any
// are missing.
//
// Usage:
//   cd backend
//   node scripts/reset-agent-sip.js agent@example.com          # one agent
//   node scripts/reset-agent-sip.js --tenant <tenantId>        # every agent in a tenant
//   node scripts/reset-agent-sip.js --all                      # every agent with a SIP account
//
// After it runs:  asterisk -rx "pjsip reload"   (usually not required for
// realtime auth, but harmless and clears any sorcery cache).

import crypto from "node:crypto";
import { db } from "../src/db.js";
import { realtimeDb } from "../src/realtimeDb.js";
import { encryptSipSecret, decryptSipSecret } from "../src/security.js";

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node scripts/reset-agent-sip.js <email> | --tenant <id> | --all");
  process.exit(1);
}

function pickAgents() {
  if (args[0] === "--all") {
    return db.execute(
      "SELECT id, email, name, sip_username, extension FROM users WHERE sip_username IS NOT NULL AND sip_username<>''"
    );
  }
  if (args[0] === "--tenant") {
    if (!args[1]) throw new Error("--tenant needs a tenant id");
    return db.execute(
      "SELECT id, email, name, sip_username, extension FROM users WHERE tenant_id=? AND sip_username IS NOT NULL AND sip_username<>''",
      [args[1]]
    );
  }
  return db.execute(
    "SELECT id, email, name, sip_username, extension FROM users WHERE email=? AND sip_username IS NOT NULL AND sip_username<>'' LIMIT 1",
    [args[0].trim().toLowerCase()]
  );
}

function safeDisplayName(value) {
  return (
    String(value || "Ringnex Agent")
      .replace(/[<>"\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "Ringnex Agent"
  );
}

async function realignOne(u) {
  const sip = u.sip_username;
  const authId = `${sip}-auth`;
  const newPass = crypto.randomBytes(16).toString("hex");

  // what did the app THINK the password was?
  let oldAppPass = "";
  try {
    const [[row]] = await db.execute("SELECT sip_secret_ciphertext AS c FROM users WHERE id=?", [u.id]);
    oldAppPass = row?.c ? decryptSipSecret(row.c) : "(none stored)";
  } catch (e) {
    oldAppPass = `(undecryptable: ${e.message})`;
  }
  // what does Asterisk currently have?
  const [[authRow]] = await realtimeDb.execute("SELECT password FROM ps_auths WHERE id=?", [authId]);
  const oldAstPass = authRow ? authRow.password : "(no ps_auths row)";

  // --- realtime DB: ensure aor + auth + endpoint, set the password ---
  const conn = await realtimeDb.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO ps_aors (id, max_contacts, remove_existing, remove_unavailable)
       VALUES (?, 1, 'yes', 'yes')
       ON DUPLICATE KEY UPDATE max_contacts=VALUES(max_contacts)`,
      [sip]
    );
    await conn.execute(
      `INSERT INTO ps_auths (id, auth_type, username, password)
       VALUES (?, 'userpass', ?, ?)
       ON DUPLICATE KEY UPDATE auth_type='userpass', username=VALUES(username), password=VALUES(password)`,
      [authId, sip, newPass]
    );
    const [[ep]] = await conn.execute("SELECT id FROM ps_endpoints WHERE id=?", [sip]);
    if (!ep) {
      await conn.execute(
        `INSERT INTO ps_endpoints (
           id, transport, aors, auth, context, callerid, moh_suggest, disallow, allow,
           webrtc, use_avpf, media_encryption, dtls_verify, dtls_fingerprint, dtls_setup,
           dtls_cert_file, dtls_private_key, ice_support, media_use_received_transport,
           rtcp_mux, direct_media, force_rport, rewrite_contact, rtp_symmetric, dtmf_mode,
           allow_subscribe, device_state_busy_at, max_audio_streams, max_video_streams,
           rtp_timeout, rtp_timeout_hold
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          sip, "transport-ws", sip, authId, "from-webrtc-saas",
          `${safeDisplayName(u.name)} <${u.extension}>`, "ringnex-hold", "all", "ulaw",
          "yes", "yes", "dtls", "fingerprint", "SHA-256", "actpass",
          "/opt/ringnex-webrtc/var/lib/asterisk/keys/webrtc.crt",
          "/opt/ringnex-webrtc/var/lib/asterisk/keys/webrtc.key",
          "yes", "yes", "yes", "no", "yes", "yes", "yes", "rfc4733",
          "no", 1, 1, 0, 60, 300
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  // --- main DB: store the same password, encrypted ---
  await db.execute("UPDATE users SET sip_secret_ciphertext=? WHERE id=?", [encryptSipSecret(newPass), u.id]);

  console.log(
    `✓ ${u.email}  (${sip} / ext ${u.extension})\n` +
      `    app had:      ${oldAppPass}\n` +
      `    asterisk had: ${oldAstPass}\n` +
      `    new password: ${newPass}  (written to both)\n`
  );
}

const [agents] = await pickAgents();
if (!agents.length) {
  console.error("No matching agent(s) with a SIP account.");
  process.exit(1);
}
for (const u of agents) {
  // eslint-disable-next-line no-await-in-loop
  await realignOne(u);
}
console.log(`Done — ${agents.length} agent(s) realigned. Now run:  asterisk -rx "pjsip reload"`);
process.exit(0);
