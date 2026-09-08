import {
  ref,
  get,
  push,
  update,
  onValue,
  query,
  limitToLast,
  serverTimestamp,
  type Unsubscribe
} from "firebase/database";

import { rtdb } from "./firebase";
import { api } from "./api";

// RTDB layout (mirrors the web app):
//   tenants/<t>/teamChats/<dmId>/messages/<key>          1:1
//   tenants/<t>/teamGroupChats/<teamId>/messages/<key>   team group
//   tenants/<t>/customGroupChats/<gid>/{messages,...}     custom group
// dmId is the two user ids sorted + joined.

export type ChatKind = "dm" | "group" | "custom-group";
export type ChatMessage = {
  key: string;
  text: string | null;
  senderId: string;
  senderName: string;
  time: string;
  attachments?: { url: string; fileName: string; mimeType: string; size: number }[];
  deleted?: boolean;
  system?: boolean;
  hiddenFor?: Record<string, boolean>;
};
export type Thread = {
  key: string; // stable client key
  kind: ChatKind;
  id: string; // peer user id (dm) | teamId | groupId
  name: string;
  avatar: string;
  lastText: string;
  lastTime: string;
  unread: number;
};

export const dmId = (a: string, b: string) => [a, b].sort().join("_");

function basePath(tenantId: string, kind: ChatKind, id: string) {
  if (kind === "custom-group") return `tenants/${tenantId}/customGroupChats/${id}`;
  if (kind === "group") return `tenants/${tenantId}/teamGroupChats/${id}`;
  return `tenants/${tenantId}/teamChats/${id}`;
}

export function messagesRef(tenantId: string, kind: ChatKind, id: string) {
  return ref(rtdb, `${basePath(tenantId, kind, id)}/messages`);
}

export function subscribeMessages(
  tenantId: string,
  kind: ChatKind,
  id: string,
  myId: string,
  cb: (msgs: ChatMessage[]) => void
): Unsubscribe {
  const q = query(messagesRef(tenantId, kind, id), limitToLast(200));
  return onValue(q, (snap) => {
    const out: ChatMessage[] = [];
    snap.forEach((c) => {
      const v = c.val() || {};
      if (v.hiddenFor?.[myId]) return;
      out.push({
        key: c.key as string,
        text: v.deleted ? null : v.text ?? null,
        senderId: v.senderId || v.from || "",
        senderName: v.senderName || "",
        time: v.time || new Date().toISOString(),
        attachments: v.deleted ? undefined : v.attachments || undefined,
        deleted: !!v.deleted,
        system: !!v.system,
        hiddenFor: v.hiddenFor
      });
    });
    out.sort((a, b) => a.time.localeCompare(b.time));
    cb(out);
  });
}

export async function sendMessage(
  tenantId: string,
  kind: ChatKind,
  id: string,
  me: { id: string; name: string },
  text: string,
  attachments?: ChatMessage["attachments"]
) {
  const body: Record<string, unknown> = {
    senderId: me.id,
    senderName: me.name,
    time: new Date().toISOString(),
    createdAt: serverTimestamp()
  };
  if (text) body.text = text;
  if (attachments?.length) body.attachments = attachments;
  await push(messagesRef(tenantId, kind, id), body);
}

export async function markThreadSeen(tenantId: string, kind: ChatKind, id: string, myId: string, ts: number) {
  // per-user "last seen" marker under the thread
  await update(ref(rtdb, `${basePath(tenantId, kind, id)}/seen`), { [myId]: ts });
}

export function countUnread(messages: Record<string, any> | null, myId: string, seenTs: number) {
  if (!messages) return 0;
  let n = 0;
  for (const m of Object.values(messages)) {
    if (!m || m.deleted || m.system) continue;
    if ((m.senderId || m.from) === myId) continue;
    if (m.hiddenFor?.[myId]) continue;
    const t = Date.parse(m.time || "") || 0;
    if (t > seenTs) n += 1;
  }
  return n;
}

// Expo push tokens for a set of users (stored at tenants/<t>/push/<uid>).
export async function pushTokensFor(tenantId: string, uids: string[]): Promise<string[]> {
  const out: string[] = [];
  await Promise.all(
    [...new Set(uids)].map(async (uid) => {
      try {
        const snap = await get(ref(rtdb, `tenants/${tenantId}/push/${uid}/token`));
        const t = snap.val();
        if (typeof t === "string" && t) out.push(t);
      } catch {
        /* noop */
      }
    })
  );
  return out;
}

// --- upload a file for an attachment (reuses the backend endpoint) ---
export async function uploadChatFile(uri: string, name: string, type: string) {
  const form = new FormData();
  form.append("file", { uri, name, type } as any);
  return api<{ url: string; fileName: string; mimeType: string; size: number }>("/team-chat/upload", {
    method: "POST",
    body: form as any
  });
}
