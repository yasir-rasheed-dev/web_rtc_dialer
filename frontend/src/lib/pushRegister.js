import { useEffect } from "react";

import { requestFcmToken, onForegroundMessage } from "./firebase";
import { api } from "./api";

const PLATFORM = /electron/i.test(navigator.userAgent) ? "electron" : "web";

// Registers this browser / Electron window for Team Chat push and shows a
// notification for messages that arrive while the app is focused (FCM only
// auto-displays background ones). Runs at the app-shell level so it works
// on every page, not just Team Chat. No-op until VITE_FIREBASE_VAPID_KEY
// and /public/firebase-messaging-sw.js are in place.
export function usePushRegistration(session) {
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      const token = await requestFcmToken();
      if (cancelled || !token) return;
      try {
        await api("/team-chat/push-token", { method: "POST", body: { token, platform: PLATFORM } });
      } catch {
        /* best-effort */
      }
    })();

    const unsub = onForegroundMessage((payload) => {
      const n = payload?.notification || {};
      const data = payload?.data || {};
      if (!n.title && !n.body) return;
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const note = new Notification(n.title || "New message", {
            body: n.body || "",
            icon: "/favicon.png",
            tag: data.id || undefined
          });
          note.onclick = () => {
            window.focus();
            window.dispatchEvent(new CustomEvent("ringnex:open-team-chat", { detail: data }));
            note.close();
          };
        }
      } catch {
        /* notifications unavailable */
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId]);
}
