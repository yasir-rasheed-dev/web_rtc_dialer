import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID || "";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

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
