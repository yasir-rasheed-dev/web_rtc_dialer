export type CallStatus = "idle" | "dialing" | "ringing" | "incoming" | "active" | "held" | "ended";

export type Party = { name: string; number: string };

export type TransferState = { phase: "consulting" | "completing"; target: string } | null;

export type CallSnapshot = {
  status: CallStatus;
  direction: "in" | "out" | null;
  party: Party | null;
  muted: boolean;
  held: boolean;
  speaker: boolean;
  connectedAt: number | null; // epoch ms when the call went active
  endedReason: string | null;
  transfer: TransferState; // warm (attended) transfer in progress
};

export type SipConfig = {
  username: string;
  password: string;
  domain: string;
  wssUrl: string;
  displayName?: string;
};

export type Registration = "offline" | "connecting" | "registered" | "failed";

export interface CallEngine {
  /** true = real WebRTC engine; false = simulated (Expo Go / no native module) */
  readonly isReal: boolean;

  connect(cfg: SipConfig): void;
  disconnect(): void;

  onCall(cb: (s: CallSnapshot) => void): () => void;
  onRegistration(cb: (r: Registration) => void): () => void;
  getSnapshot(): CallSnapshot;
  getRegistration(): Registration;

  startCall(number: string, name?: string): void;
  answer(): void;
  decline(): void;
  hangup(): void;

  setMuted(m: boolean): void;
  setHeld(h: boolean): void;
  setSpeaker(s: boolean): void;
  sendDtmf(digit: string): void;

  // warm (attended) transfer: hold the current call, consult the target,
  // then either complete (bridge them, drop yourself) or cancel.
  startWarmTransfer(target: string): void;
  completeTransfer(): void;
  cancelWarmTransfer(): void;

  /** Arm auto-answer for the next inbound session — used when the user has
   *  already accepted the call on the CallKeep UI raised by a VoIP push,
   *  and the real SIP INVITE is still on its way. */
  armAutoAnswer?(on: boolean): void;

  /** dev helper — only the simulated engine implements this */
  simulateIncoming?(party: Party): void;
}

export const IDLE: CallSnapshot = {
  status: "idle",
  direction: null,
  party: null,
  muted: false,
  held: false,
  speaker: false,
  connectedAt: null,
  endedReason: null,
  transfer: null
};
