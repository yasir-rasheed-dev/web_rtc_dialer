import Constants from "expo-constants";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getDatabase } from "firebase/database";

// Same Firebase project the web Team Chat uses. Config comes from
// app.json → expo.extra.firebase. ringNex authenticates with its own JWT;
// this exchanges a server-minted custom token (POST
// /api/team-chat/firebase-token) for a Firebase session so the RTDB
// security rules pass. Auth state is in-memory — we re-mint on each launch
// (the token is short-lived and tied to the ringNex session anyway), so
// no AsyncStorage native dependency is needed.
const cfg = (Constants.expoConfig?.extra as any)?.firebase ?? {};

const app = getApps().length ? getApps()[0] : initializeApp(cfg);

export const rtdb = getDatabase(app);
const auth = getAuth(app);

export function signInToFirebase(customToken: string) {
  return signInWithCustomToken(auth, customToken);
}

export function firebaseUid() {
  return auth.currentUser?.uid ?? null;
}

export default app;
