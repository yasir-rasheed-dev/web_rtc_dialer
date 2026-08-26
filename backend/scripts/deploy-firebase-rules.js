// One-off script: deploys Realtime Database security rules that scope all
// Team Chat data to `tenants/$tenantId`, readable/writable only by users
// whose Firebase custom-token carries a matching `tenantId` claim (minted
// server-side in firebaseAdmin.js — Ringnex has its own JWT auth, not
// Firebase Auth, so this claim is the only thing standing between the
// database and anyone holding the public web API key). Run with:
//   node scripts/deploy-firebase-rules.js
import "dotenv/config";
import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseURL = process.argv[2];

if (!databaseURL) {
  console.error("Usage: node scripts/deploy-firebase-rules.js <databaseURL>");
  process.exit(1);
}
if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env");
  process.exit(1);
}

const rules = {
  rules: {
    tenants: {
      $tenantId: {
        ".read": "auth != null && auth.token.tenantId === $tenantId",
        ".write": "auth != null && auth.token.tenantId === $tenantId"
      }
    },
    ".read": false,
    ".write": false
  }
};

const credential = admin.credential.cert({ projectId, clientEmail, privateKey });
const { access_token: accessToken } = await credential.getAccessToken();

const response = await fetch(`${databaseURL}/.settings/rules.json`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(rules)
});

if (!response.ok) {
  console.error(`Failed (${response.status}):`, await response.text());
  process.exit(1);
}
console.log("Firebase Realtime Database rules deployed:");
console.log(JSON.stringify(rules, null, 2));
