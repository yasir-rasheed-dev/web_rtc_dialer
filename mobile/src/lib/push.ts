import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

// Push only exists on a dev/standalone build (expo-notifications native
// module + FCM via google-services.json). In Expo Go it's a no-op.
export const pushAvailable = Constants.executionEnvironment !== "storeClient";

let registeredToken: string | null = null;

/** Register this device's *FCM* token with the backend. The backend fans
 *  new-message notifications out to every platform (web / electron /
 *  mobile) from one place — see teamChatRoutes.js /notify. */
export async function registerPush(): Promise<string | null> {
  if (!pushAvailable || !Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("messages", {
        name: "Team Chat",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0684BC"
      });
    }
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;

    // native device token = the raw FCM registration token (Android) /
    // APNs token (iOS), which is what Firebase Admin sends to.
    const devToken = await Notifications.getDevicePushTokenAsync();
    const token = String(devToken.data);
    if (!token || token === registeredToken) return token;

    await api("/team-chat/push-token", { method: "POST", body: { token, platform: Platform.OS } });
    registeredToken = token;
    return token;
  } catch (e) {
    console.warn("[push] register failed:", e);
    return null;
  }
}

export async function unregisterPush() {
  if (!registeredToken) return;
  try {
    await api("/team-chat/push-token", { method: "DELETE", body: { token: registeredToken } });
  } catch {
    /* noop */
  }
  registeredToken = null;
}

/** Ask the backend to notify a set of user ids about a new message. */
export async function notifyRecipients(
  recipientIds: string[],
  msg: { title: string; body: string; data?: Record<string, unknown> }
) {
  const ids = [...new Set(recipientIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await api("/team-chat/notify", {
      method: "POST",
      body: { recipientIds: ids, title: msg.title, body: msg.body, data: msg.data ?? {} }
    });
  } catch (e) {
    console.warn("[push] notify failed:", e);
  }
}
