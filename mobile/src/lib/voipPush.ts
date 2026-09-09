import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { CK, callkeepNativeLoaded, initCallKeep, newUuid } from "./callkeep";

export const VOIP_TASK = "ringnex-voip-push";
const PENDING_KEY = "voip.pending.v1";
const VALID_MS = 40_000;

export type PendingVoip = { uuid: string; caller: string; callerName: string; at: number };

let pending: PendingVoip | null = null;

export function getPendingVoip(): PendingVoip | null {
  if (pending && Date.now() - pending.at > VALID_MS) pending = null;
  return pending;
}

/** Forget the pending VoIP call (it connected, or we're handling it now).
 *  Does NOT end the OS call — the caller decides that. */
export function clearPendingVoip() {
  pending = null;
  SecureStore.deleteItemAsync(PENDING_KEY).catch(() => {});
}

/** The user rejected the pushed call before any SIP INVITE arrived. */
export function rejectPendingVoip() {
  const u = pending?.uuid;
  clearPendingVoip();
  if (u) {
    try {
      CK.end(u);
    } catch {
      /* noop */
    }
  }
}

// The FCM data payload can surface at a few different depths depending on
// platform / expo-notifications version — dig it out.
function extractData(taskData: any): any {
  const candidates = [
    taskData?.notification?.data,
    taskData?.notification?.request?.content?.data,
    taskData?.notification?.request?.trigger?.remoteMessage?.data,
    taskData?.body,
    taskData?.data,
    taskData
  ];
  for (const c of candidates) {
    if (c && (c.type === "incoming_call" || typeof c.caller === "string")) return c;
  }
  return null;
}

async function raiseIncoming(data: any) {
  if (!data || data.type !== "incoming_call" || !callkeepNativeLoaded) return;
  const uuid = newUuid();
  const caller = String(data.caller || "Unknown");
  const callerName = String(data.callerName || caller);
  pending = { uuid, caller, callerName, at: Date.now() };
  try {
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* noop */
  }
  await initCallKeep();
  CK.showIncoming(uuid, caller, callerName);

  // If the real SIP INVITE never lands (agent's app couldn't reconnect in
  // time, caller gave up), don't leave a stuck OS call.
  setTimeout(() => {
    if (pending?.uuid === uuid) {
      try {
        CK.end(uuid);
      } catch {
        /* noop */
      }
      pending = null;
      SecureStore.deleteItemAsync(PENDING_KEY).catch(() => {});
    }
  }, 30_000);
}

// Runs in a headless JS context when a data-only push arrives while the app
// is backgrounded or killed.
TaskManager.defineTask(VOIP_TASK, async ({ data, error }: any) => {
  if (error) return;
  await raiseIncoming(extractData(data));
});

export async function registerVoipTask() {
  if (!callkeepNativeLoaded) return;
  try {
    await Notifications.registerTaskAsync(VOIP_TASK);
  } catch (e) {
    console.warn("[voip] registerTaskAsync failed:", e);
  }
  // Cold start from tapping "Answer": the pending call may be on disk.
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PendingVoip;
      if (Date.now() - p.at < VALID_MS) pending = p;
      else SecureStore.deleteItemAsync(PENDING_KEY).catch(() => {});
    }
  } catch {
    /* noop */
  }
}
