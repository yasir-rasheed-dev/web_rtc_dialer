import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

// Native OS call UI (CallKit on iOS, ConnectionService on Android). Only
// present on a dev/standalone build — in Expo Go the in-app IncomingCall
// overlay is used instead.
export const callkeepAvailable = Constants.executionEnvironment !== "storeClient";

let RNCallKeep: any = null;
if (callkeepAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RNCallKeep = require("react-native-callkeep").default;
  } catch {
    RNCallKeep = null;
  }
}

let didSetup = false;
export async function initCallKeep() {
  if (!RNCallKeep || didSetup) return;
  try {
    await RNCallKeep.setup({
      ios: {
        appName: "ringNex",
        supportsVideo: false,
        maximumCallGroups: "1",
        maximumCallsPerCallGroup: "1"
      },
      android: {
        alertTitle: "Phone account permission",
        alertDescription: "ringNex needs a phone account to show calls on your lock screen.",
        cancelButton: "Cancel",
        okButton: "OK",
        additionalPermissions: [],
        selfManaged: false,
        foregroundService: {
          channelId: "co.ringnex.mobile.calls",
          channelName: "Ringnex calls",
          notificationTitle: "Ringnex call in progress"
        }
      }
    });
    RNCallKeep.setAvailable(true);
    didSetup = true;
  } catch (e) {
    console.warn("[callkeep] setup failed:", e);
  }
}

export function newUuid(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export const CK = {
  showIncoming(uuid: string, handle: string, name: string) {
    RNCallKeep?.displayIncomingCall(uuid, handle || "unknown", name || handle || "Incoming call", "generic", false);
  },
  reportOutgoing(uuid: string, handle: string, name: string) {
    RNCallKeep?.startCall(uuid, handle || "unknown", name || handle, "generic", false);
  },
  connecting(uuid: string) {
    RNCallKeep?.reportConnectingOutgoingCallWithUUID?.(uuid);
  },
  connected(uuid: string) {
    RNCallKeep?.reportConnectedOutgoingCallWithUUID?.(uuid);
    RNCallKeep?.setCurrentCallActive?.(uuid);
  },
  end(uuid: string) {
    RNCallKeep?.endCall(uuid);
  },
  setMuted(uuid: string, muted: boolean) {
    RNCallKeep?.setMutedCall?.(uuid, muted);
  },
  setOnHold(uuid: string, held: boolean) {
    RNCallKeep?.setOnHold?.(uuid, held);
  },
  on(event: string, cb: (...a: any[]) => void): () => void {
    if (!RNCallKeep) return () => undefined;
    RNCallKeep.addEventListener(event, cb);
    return () => RNCallKeep.removeEventListener(event);
  }
};
