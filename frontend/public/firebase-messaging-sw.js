/* Team Chat push — background handler.
 *
 * Service workers can't read Vite env vars, so the Firebase web config is
 * inlined here. These values are public (they ship in the client bundle
 * too) and must match frontend/.env's VITE_FIREBASE_* / the mobile app.
 */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBQsM6E0EVEZMI4G65Qz52BqmfeiVU9vP0",
  authDomain: "tester-d4298.firebaseapp.com",
  projectId: "tester-d4298",
  storageBucket: "tester-d4298.firebasestorage.app",
  messagingSenderId: "612349657363",
  appId: "1:612349657363:web:5c8bf304a8d7bae5479ae6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || "New message", {
    body: n.body || "",
    icon: "/favicon.png",
    tag: data.id || undefined,
    data
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          w.postMessage({ type: "team-chat-open", data: event.notification.data || {} });
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
