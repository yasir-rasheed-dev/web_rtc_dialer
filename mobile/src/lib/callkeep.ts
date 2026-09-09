import { Alert, Linking, NativeModules, Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

// Native OS call UI (CallKit on iOS, ConnectionService on Android). Only
// present on a dev/standalone build — in Expo Go the in-app IncomingCall
// overlay is used instead.
export const callkeepAvailable = Constants.executionEnvironment !== "storeClient";

// react-native-callkeep is NOT compatible with the New Architecture that
// Expo SDK 57 forces on: its native module declares two @ReactMethod
// entries both named "displayIncomingCall", and the TurboModule interop
// parser throws on that — every access to NativeModules.RNCallKeep raises.
// So probing it must be wrapped, and a throw here means "not usable".
let nativeModulePresent = false;
try {
  nativeModulePresent = !!(NativeModules as any).RNCallKeep;
} catch {
  nativeModulePresent = false;
}

let RNCallKeep: any = null;
if (callkeepAvailable && nativeModulePresent) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RNCallKeep = require("react-native-callkeep").default;
  } catch {
    RNCallKeep = null;
  }
}

// True only when react-native-callkeep's native module is in this build.
// If false on a dev build the module didn't link — a rebuild is needed and
// IncomingCall.tsx handles the ring in-app instead.
export const callkeepNativeLoaded = callkeepAvailable && nativeModulePresent && !!RNCallKeep;

const ANDROID_OPTS = {
  alertTitle: "Allow ringNex to show calls",
  alertDescription:
    "Enable ringNex as a calling account so incoming calls appear full-screen like a normal phone call.",
  cancelButton: "Later",
  okButton: "Open settings",
  additionalPermissions: [],
  selfManaged: false,
  foregroundService: {
    channelId: "co.ringnex.mobile.calls",
    channelName: "Ringnex calls",
    notificationTitle: "Ringnex call in progress"
  }
};

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
      android: ANDROID_OPTS
    });
    RNCallKeep.setAvailable(true);
    if (Platform.OS === "android") {
      try {
        RNCallKeep.registerPhoneAccount({ android: ANDROID_OPTS });
        RNCallKeep.registerAndroidEvents();
      } catch {
        /* older RNCallKeep — setup already registered the account */
      }
    }
    didSetup = true;
  } catch (e) {
    console.warn("[callkeep] setup failed:", e);
  }
}

export type CallAccountStatus = {
  supported: boolean; // ConnectionService available on this device
  registered: boolean; // ringNex phone account exists
  enabled: boolean; // user has toggled it on in system settings
};

export async function callAccountStatus(): Promise<CallAccountStatus> {
  if (!RNCallKeep || Platform.OS !== "android") {
    return { supported: !!RNCallKeep, registered: !!RNCallKeep, enabled: !!RNCallKeep };
  }
  try {
    const [supported, registered, enabled] = await Promise.all([
      RNCallKeep.isConnectionServiceAvailable().catch(() => false),
      RNCallKeep.hasPhoneAccount().catch(() => false),
      RNCallKeep.checkPhoneAccountEnabled().catch(() => false)
    ]);
    return { supported: !!supported, registered: !!registered, enabled: !!enabled };
  } catch {
    return { supported: false, registered: false, enabled: false };
  }
}

/** Open the OS screen where the user enables ringNex as a calling account.
 *  Falls back through a few intents that vary by Android OEM. */
export async function openCallAccountSettings() {
  if (!RNCallKeep || Platform.OS !== "android") return;
  try {
    RNCallKeep.registerPhoneAccount({ android: ANDROID_OPTS });
  } catch {
    /* noop */
  }
  try {
    RNCallKeep.openPhoneAccounts();
    return;
  } catch {
    /* try next */
  }
  try {
    RNCallKeep.openPhoneAccountSettings();
    return;
  } catch {
    /* try next */
  }
  Linking.openSettings().catch(() => {});
}

/** One-shot: if calls can't be shown natively yet, explain and offer to
 *  open settings. `onlyIfNeeded` skips the prompt when already enabled. */
export async function promptCallAccount(opts?: { force?: boolean }) {
  if (!RNCallKeep || Platform.OS !== "android") return;
  const st = await callAccountStatus();
  if (st.enabled && !opts?.force) return;
  Alert.alert(
    "Show calls like a phone",
    st.supported
      ? "Turn on ringNex under Calling accounts so incoming calls open full-screen even when the app is in the background."
      : "This device limits third-party calling accounts. Incoming calls will still ring inside the app.",
    st.supported
      ? [
          { text: "Later", style: "cancel" },
          { text: "Open settings", onPress: () => openCallAccountSettings() }
        ]
      : [{ text: "OK" }]
  );
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
  updateDisplay(uuid: string, name: string, handle: string) {
    RNCallKeep?.updateDisplay?.(uuid, name || handle, handle || "unknown");
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
