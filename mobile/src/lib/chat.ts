import {
  ref,
  push,
  update,
  onValue,
  query,
  limitToLast,
  serverTimestamp,
  type Unsubscribe
} from "firebase/database";
import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";

import { rtdb } from "./firebase";
import { CONFIG } from "./config";
import { getAccessToken } from "./auth";

// RTDB layout (mirrors the web app):
//   tenants/<t>/teamChats/<dmId>/messages/<key>          1:1
//   tenants/<t>/teamGroupChats/<teamId>/messages/<key>   team group
//   tenants/<t>/customGroupChats/<gid>/{messages,...}     custom group
// dmId is the two user ids sorted + joined.

export type ChatKind = "dm" | "group" | "custom-group";
export type Attachment = { url: string; fileName: string; mimeType: string; size: number };
export type ChatMessage = {
  key: string;
  text: string | null;
  senderId: string;
  senderName: string;
  time: string;
  attachments?: Attachment[];
  deleted?: boolean;
  system?: boolean;
  editedAt?: string | null;
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
        senderId: String(v.senderId ?? v.from ?? ""),
        senderName: v.senderName || "",
        time: v.time || new Date().toISOString(),
        attachments: v.deleted ? undefined : v.attachments || undefined,
        deleted: !!v.deleted,
        system: v.type === "system" || !!v.system,
        editedAt: v.editedAt || null,
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
  attachments?: Attachment[]
) {
  const body: Record<string, unknown> = {
    senderId: me.id,
    senderName: me.name,
    time: new Date().toISOString(),
    timestamp: serverTimestamp()
  };
  if (text) body.text = text;
  if (attachments?.length) body.attachments = attachments;
  await push(messagesRef(tenantId, kind, id), body);
}

function messagePath(tenantId: string, kind: ChatKind, id: string, key: string) {
  return `${basePath(tenantId, kind, id)}/messages/${key}`;
}

/** Edit the text of a message (own messages only — enforced by the UI). */
export async function editMessageText(tenantId: string, kind: ChatKind, id: string, key: string, text: string) {
  await update(ref(rtdb, messagePath(tenantId, kind, id, key)), {
    text,
    editedAt: new Date().toISOString()
  });
}

/** Delete for everyone — tombstones the message (matches the web app). */
export async function deleteMessageForEveryone(tenantId: string, kind: ChatKind, id: string, key: string) {
  await update(ref(rtdb, messagePath(tenantId, kind, id, key)), {
    deleted: true,
    text: null,
    attachments: null
  });
}

/** Hide a message just for me. */
export async function deleteMessageForMe(tenantId: string, kind: ChatKind, id: string, key: string, myId: string) {
  await update(ref(rtdb, messagePath(tenantId, kind, id, key)), { [`hiddenFor/${myId}`]: true });
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

// --- upload a file for an attachment (same backend endpoint as web) ---
// RN's fetch + FormData multipart is unreliable on the new architecture, so
// use expo-file-system's native multipart uploader instead. `name`/`type`
// come from the picker and are what we record on the message; the server
// only needs the bytes.
export async function uploadChatFile(uri: string, name: string, type: string): Promise<Attachment> {
  const token = getAccessToken();
  const res = await uploadAsync(`${CONFIG.apiBase}/api/team-chat/upload`, uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: type,
    headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" }
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (${res.status})${res.body ? `: ${res.body.slice(0, 160)}` : ""}`);
  }
  let data: any = {};
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error("Upload succeeded but the server response was not readable.");
  }
  if (!data.url) throw new Error("Upload response had no file URL.");
  return { url: data.url, fileName: name || data.fileName || "file", mimeType: type || data.mimeType || "", size: data.size || 0 };
}
