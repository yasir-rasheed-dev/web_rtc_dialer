import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { ref, set } from "firebase/database";

import { rtdb } from "./firebase";
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
// module). In Expo Go it's a no-op.
export const pushAvailable = Constants.executionEnvironment !== "storeClient";

/** Register this device's Expo push token; store it in RTDB (for the
 *  client-side fan-out) and on the backend (for future server pushes). */
export async function registerPush(tenantId: string, uid: string): Promise<string | null> {
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

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;

    await set(ref(rtdb, `tenants/${tenantId}/push/${uid}`), {
      token,
      platform: Platform.OS,
      at: Date.now()
    });
    api("/team-chat/fcm-token", { method: "POST", body: { token } }).catch(() => {});
    return token;
  } catch (e) {
    console.warn("[push] register failed:", e);
    return null;
  }
}

/** Fire a push to a set of Expo push tokens via Expo's push service. */
export async function sendPush(tokens: string[], msg: { title: string; body: string; data?: any }) {
  const uniq = [...new Set(tokens.filter(Boolean))];
  if (!uniq.length) return;
  const messages = uniq.map((to) => ({
    to,
    sound: "default",
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
    channelId: "messages",
    priority: "high"
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages)
    });
  } catch (e) {
    console.warn("[push] send failed:", e);
  }
}
