import { create } from "zustand";
import { ref, onValue, type Unsubscribe } from "firebase/database";

import { rtdb, signInToFirebase } from "@/lib/firebase";
import { api } from "@/lib/api";
import { countUnread, dmId, type Thread } from "@/lib/chat";

type DirAgent = { id: string; name: string; email: string; extension?: string };
type DirTeam = { id: string; name: string; members: { id: string; name: string; email: string }[] };
type Directory = { agents: DirAgent[]; teams: DirTeam[] };

type ChatState = {
  ready: boolean;
  error: string | null;
  me: { id: string; name: string } | null;
  tenantId: string | null;
  directory: Directory;
  threads: Thread[];
  unreadTotal: number;
  connect: (me: { id: string; name: string }, tenantId: string) => Promise<void>;
  disconnect: () => void;
};

let subs: Unsubscribe[] = [];
let dmRaw: Record<string, any> = {};
let groupRaw: Record<string, any> = {};

const avatar2 = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();

function rebuild(get: () => ChatState, set: (p: Partial<ChatState>) => void) {
  const { me, directory } = get();
  if (!me) return;
  const nameById = new Map<string, string>();
  directory.agents.forEach((a) => nameById.set(a.id, a.name));

  const threads: Thread[] = [];

  // 1:1 threads (only ones I'm part of)
  for (const [id, node] of Object.entries(dmRaw)) {
    if (!id.includes(me.id)) continue;
    const peer = id.split("_").find((x) => x !== me.id) || "";
    const msgs = node?.messages || {};
    const keys = Object.keys(msgs);
    const last = keys.length ? msgs[keys[keys.length - 1]] : null;
    threads.push({
      key: `dm_${id}`,
      kind: "dm",
      id: peer,
      name: nameById.get(peer) || "Direct message",
      avatar: avatar2(nameById.get(peer) || "?"),
      lastText: last?.deleted ? "Message deleted" : last?.text || (last?.attachments?.length ? "Attachment" : ""),
      lastTime: last?.time || node?.createdAt || "",
      unread: countUnread(msgs, me.id, Date.parse(node?.seen?.[me.id] ? String(node.seen[me.id]) : "") || node?.seen?.[me.id] || 0)
    });
  }

  // team group threads (teams I'm in)
  for (const t of directory.teams) {
    const node = groupRaw[t.id] || {};
    const msgs = node.messages || {};
    const keys = Object.keys(msgs);
    const last = keys.length ? msgs[keys[keys.length - 1]] : null;
    threads.push({
      key: `group_${t.id}`,
      kind: "group",
      id: t.id,
      name: t.name,
      avatar: avatar2(t.name),
      lastText: last?.deleted ? "Message deleted" : last?.text || (last?.attachments?.length ? "Attachment" : ""),
      lastTime: last?.time || "",
      unread: countUnread(msgs, me.id, node?.seen?.[me.id] || 0)
    });
  }

  threads.sort((a, b) => (b.lastTime || "").localeCompare(a.lastTime || ""));
  set({ threads, unreadTotal: threads.reduce((n, x) => n + x.unread, 0) });
}

export const useChat = create<ChatState>((set, get) => ({
  ready: false,
  error: null,
  me: null,
  tenantId: null,
  directory: { agents: [], teams: [] },
  threads: [],
  unreadTotal: 0,

  async connect(me, tenantId) {
    if (get().ready && get().me?.id === me.id) return;
    set({ me, tenantId, error: null });
    try {
      const { token } = await api<{ token: string }>("/team-chat/firebase-token", { method: "POST" });
      await signInToFirebase(token);
      const directory = await api<Directory>("/team-chat/directory");
      set({ directory });

      subs.forEach((u) => u());
      subs = [
        onValue(ref(rtdb, `tenants/${tenantId}/teamChats`), (snap) => {
          dmRaw = snap.val() || {};
          rebuild(get, set);
        }),
        onValue(ref(rtdb, `tenants/${tenantId}/teamGroupChats`), (snap) => {
          groupRaw = snap.val() || {};
          rebuild(get, set);
        })
      ];
      set({ ready: true });
    } catch (e: any) {
      console.warn("[chat] connect failed:", e?.message || e);
      set({ error: e?.message || "Team Chat unavailable", ready: false });
    }
  },

  disconnect() {
    subs.forEach((u) => u());
    subs = [];
    dmRaw = {};
    groupRaw = {};
    set({ ready: false, threads: [], unreadTotal: 0, me: null, tenantId: null });
  }
}));

export { dmId };
