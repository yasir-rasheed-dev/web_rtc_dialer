import crypto from "node:crypto";
import { realtimeDb } from "./realtimeDb.js";
import { tenantSipKey } from "./saas.js";

export async function getNextSipIdentity(appDb) {
  // Legacy allocator retained only for backward compatibility / old tests.
  const [localUsers] = await appDb.execute(
    `SELECT sip_username, extension
       FROM users
      WHERE sip_username IS NOT NULL OR extension IS NOT NULL`
  );
  const [realtimeEndpoints] = await realtimeDb.query(
    `SELECT id, callerid FROM ps_endpoints WHERE id LIKE 'webdialer%'`
  );
  const usedSipNumbers = new Set();
  const usedExtensions = new Set();
  for (const user of localUsers) {
    const sipMatch = String(user.sip_username || "").match(/^webdialer(\d+)$/i);
    if (sipMatch) usedSipNumbers.add(Number(sipMatch[1]));
    const extension = Number(user.extension);
    if (Number.isInteger(extension)) usedExtensions.add(extension);
  }
  for (const endpoint of realtimeEndpoints) {
    const sipMatch = String(endpoint.id || "").match(/^webdialer(\d+)$/i);
    if (sipMatch) usedSipNumbers.add(Number(sipMatch[1]));
    const callerIdMatch = String(endpoint.callerid || "").match(/<(\d+)>/);
    if (callerIdMatch) usedExtensions.add(Number(callerIdMatch[1]));
  }
  let agentNumber = 1;
  while (usedSipNumbers.has(agentNumber) || usedExtensions.has(1000 + agentNumber)) agentNumber += 1;
  return {
    sipUsername: `webdialer${String(agentNumber).padStart(2, "0")}`,
    extension: String(1000 + agentNumber)
  };
}

function cleanDisplayName(value) {
  return (
    String(value || "Ringnex Agent")
      .replace(/[<>"\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "Ringnex Agent"
  );
}

async function insertRealtimeEndpoint({ sipUsername, sipPassword, extension, displayName }) {
  const safeDisplayName = cleanDisplayName(displayName);
  const connection = await realtimeDb.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO ps_aors (id, max_contacts, remove_existing, remove_unavailable)
       VALUES (?, 1, 'yes', 'yes')`,
      [sipUsername]
    );
    await connection.execute(
      `INSERT INTO ps_auths (id, auth_type, username, password)
       VALUES (?, 'userpass', ?, ?)`,
      [`${sipUsername}-auth`, sipUsername, sipPassword]
    );
    await connection.execute(
      `INSERT INTO ps_endpoints (
        id, transport, aors, auth, context, callerid, moh_suggest, disallow, allow,
        webrtc, use_avpf, media_encryption, dtls_verify, dtls_fingerprint, dtls_setup,
        dtls_cert_file, dtls_private_key, ice_support, media_use_received_transport,
        rtcp_mux, direct_media, force_rport, rewrite_contact, rtp_symmetric, dtmf_mode,
        allow_subscribe, device_state_busy_at, max_audio_streams, max_video_streams,
        rtp_timeout, rtp_timeout_hold
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      [
        sipUsername,
        "transport-ws",
        sipUsername,
        `${sipUsername}-auth`,
        "from-webrtc-saas",
        `${safeDisplayName} <${extension}>`,
        "ringnex-hold",
        "all",
        "ulaw",
        "yes",
        "yes",
        "dtls",
        "fingerprint",
        "SHA-256",
        "actpass",
        "/opt/ringnex-webrtc/var/lib/asterisk/keys/webrtc.crt",
        "/opt/ringnex-webrtc/var/lib/asterisk/keys/webrtc.key",
        "yes",
        "yes",
        "yes",
        "no",
        "yes",
        "yes",
        "yes",
        "rfc4733",
        "no",
        1,
        1,
        0,
        60,
        300
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function provisionTenantSipAccount({ tenantId, extension, displayName }) {
  if (!tenantId || !extension) throw new Error("Tenant and extension are required for SIP provisioning");
  const base = `tn${tenantSipKey(tenantId)}_${String(extension).replace(/\D/g, "")}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sipUsername = attempt === 0 ? base : `${base}_${attempt + 1}`;
    const sipPassword = crypto.randomBytes(16).toString("hex");
    try {
      await insertRealtimeEndpoint({ sipUsername, sipPassword, extension, displayName });
      return { sipUsername, sipPassword, extension: String(extension) };
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") continue;
      throw error;
    }
  }
  throw new Error("Unable to allocate a unique tenant SIP account");
}

export async function provisionSipAccount(appDb, displayNameOrOptions) {
  // New SaaS signature can be passed as the second argument without breaking legacy callers.
  if (displayNameOrOptions && typeof displayNameOrOptions === "object") {
    return provisionTenantSipAccount(displayNameOrOptions);
  }

  const safeDisplayName = cleanDisplayName(displayNameOrOptions);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { sipUsername, extension } = await getNextSipIdentity(appDb);
    const sipPassword = crypto.randomBytes(16).toString("hex");
    try {
      await insertRealtimeEndpoint({ sipUsername, sipPassword, extension, displayName: safeDisplayName });
      return { sipUsername, sipPassword, extension };
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") continue;
      throw error;
    }
  }
  throw new Error("Unable to allocate a unique SIP account");
}

export async function deprovisionSipAccount(sipUsername) {
  if (!sipUsername) return;
  const connection = await realtimeDb.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM ps_endpoints WHERE id = ?", [sipUsername]);
    await connection.execute("DELETE FROM ps_auths WHERE id = ?", [`${sipUsername}-auth`]);
    await connection.execute("DELETE FROM ps_aors WHERE id = ?", [sipUsername]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
