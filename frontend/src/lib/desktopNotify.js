// Native OS notification for an incoming call — plain Web Notification
// API, works both in a browser tab and inside Electron (electron/main.js's
// allowMicAndNotifications() already grants the "notifications" permission
// for this app's origin, so Notification.requestPermission() resolves
// immediately there with no prompt; on the web it behaves like any other
// site asking for notification permission).

let permissionRequested = false;

// Call once, early (Softphone.jsx does this on mount) — best-effort, never
// throws. Browsers that require a user gesture before granting this will
// just leave it "default"/denied until the agent interacts with the page;
// showIncomingCallNotification() below silently no-ops in that case.
export function ensureNotificationPermission() {
  if (permissionRequested || typeof Notification === "undefined") return;
  permissionRequested = true;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => undefined);
  }
}

let activeNotification = null;

export function showIncomingCallNotification({ title, body }) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    activeNotification?.close();
    activeNotification = new Notification(title || "Incoming call", {
      body: body || "",
      tag: "ringnex-incoming-call", // replaces any previous one instead of stacking
      requireInteraction: true // stays on screen until dismissed/clicked, not just a few seconds
    });
    activeNotification.onclick = () => {
      window.focus();
      activeNotification?.close();
    };
  } catch {
    // Some platforms/contexts throw on `new Notification(...)` despite
    // permission being "granted" (e.g. certain Linux notification daemons)
    // — never let a notification failure break the actual call handling.
  }
}

export function closeIncomingCallNotification() {
  activeNotification?.close();
  activeNotification = null;
}
