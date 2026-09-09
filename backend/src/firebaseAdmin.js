import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID || "";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
// Stored in .env as a single line with escaped newlines ("-----BEGIN...\n...");
// restore the real newlines the PEM parser needs. Also tolerate a value
// wrapped in surrounding quotes.
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "")
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

// Team Chat's actual messages live in the Realtime Database and are
// written directly from the frontend — this admin app is only for
// server-side FCM push sends (and only once a VAPID key + service worker
// are configured on the frontend). Not required for the chat itself to
// work, so a missing/incomplete service account here must not crash boot.
let app = null;
if (projectId && clientEmail && privateKey) {
  app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}

export function isFirebaseAdminConfigured() {
  return Boolean(app);
}

// Ringnex has its own JWT auth, not Firebase Auth — Team Chat writes
// straight to the Realtime Database from the browser, so without this the
// only way to secure it would be open RTDB rules (readable/writable by
// anyone with the public API key, which is always visible in a web
// bundle). This mints a Firebase ID the client exchanges via
// signInWithCustomToken, carrying tenantId as a custom claim so RTDB rules
// can restrict every path to `tenants/$tenantId` for that tenant's own
// members only — see database.rules.json.
export function mintFirebaseToken(userId, tenantId) {
  if (!app) throw new Error("Firebase Admin is not configured");
  return admin.auth(app).createCustomToken(String(userId), { tenantId: String(tenantId) });
}

export async function sendPushNotification({ token, title, body, data = {} }) {
  if (!app || !token) return null;
  return admin.messaging(app).send({
    token,
    notification: { title, body },
    data
  });
}

// Fan a notification out to many device tokens (web / electron / mobile).
// Returns the number delivered and any tokens the FCM server rejected as
// dead, so the caller can prune them.
export async function sendPushMulticast(tokens, { title, body, data = {} }) {
  const uniq = [...new Set((tokens || []).filter(Boolean))];
  if (!app || !uniq.length) return { successCount: 0, invalidTokens: [] };

  const messaging = admin.messaging(app);
  const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));
  const invalidTokens = [];
  let successCount = 0;

  for (let i = 0; i < uniq.length; i += 500) {
    const batch = uniq.slice(i, i + 500);
    const resp = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: strData,
      android: { priority: "high", notification: { channelId: "messages" } },
      apns: { headers: { "apns-priority": "10" } },
      webpush: { headers: { Urgency: "high" }, fcmOptions: data.url ? { link: String(data.url) } : undefined }
    });
    resp.responses.forEach((r, idx) => {
      if (r.success) {
        successCount += 1;
        return;
      }
      const code = r.error?.code || "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        invalidTokens.push(batch[idx]);
      }
    });
  }
  return { successCount, invalidTokens };
}
