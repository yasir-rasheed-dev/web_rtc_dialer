import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Team Chat (1:1, team groups, custom groups) reads/writes this directly.
export const db = getDatabase(app);
const auth = getAuth(app);

// Ringnex authenticates with its own JWT, not Firebase Auth — this
// exchanges a custom token (minted server-side via POST
// /api/team-chat/firebase-token, carrying the user's tenantId as a custom
// claim) for a real Firebase session, which is what the Realtime Database
// security rules check before allowing any read/write. Must be called
// once before touching `db` for chat data.
export function signInToFirebase(customToken) {
  return signInWithCustomToken(auth, customToken);
}

// FCM push notifications need a VAPID key (Firebase Console > Project
// Settings > Cloud Messaging > Web Push certificates) and a
// firebase-messaging-sw.js service worker in /public — neither is
// configured yet, so both functions below no-op safely until they are,
// rather than throwing and breaking the rest of the chat.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

export async function requestFcmToken() {
  if (!VAPID_KEY) return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    return await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  } catch {
    return null;
  }
}

export function onForegroundMessage(callback) {
  if (!VAPID_KEY) return () => undefined;
  isSupported().then((supported) => {
    if (!supported) return;
    const messaging = getMessaging(app);
    onMessage(messaging, callback);
  });
  return () => undefined;
}

export default app;
