import { useEffect, useRef, useState } from "react";
import { get, off, onValue, ref } from "firebase/database";

import { db, signInToFirebase } from "./firebase";
import { api } from "./api";
import { loadSeenMap, countUnread } from "./useTeamChatUnread";

// Fired by TeamChat.jsx (openChatWith) the moment a chat is marked read —
// lets the sidebar badge drop immediately instead of waiting for the next
// unrelated Firebase write to happen to refire the onValue listeners below.
export const TEAM_CHAT_READ_EVENT = "ringnex:team-chat-read";

async function computeCounts({ myId, tenantId, agentIds, teamIds }) {
  const seenMap = loadSeenMap(myId);
  let total = 0;

  const [directSnap, teamGroupSnap, customSnap] = await Promise.all([
    get(ref(db, `tenants/${tenantId}/teamChats/`)),
    get(ref(db, `tenants/${tenantId}/teamGroupChats/`)),
    get(ref(db, `tenants/${tenantId}/customGroupChats/`))
  ]);

  directSnap.forEach((child) => {
    const [a, b] = (child.key || "").split("_");
    if (a !== String(myId) && b !== String(myId)) return;
    const partnerId = a === String(myId) ? b : a;
    if (!agentIds.has(partnerId)) return;
    const msgSnap = child.child("messages").val();
    if (!msgSnap) return;
    total += countUnread(msgSnap, myId, seenMap[`individual_${partnerId}`] || 0);
  });

  teamGroupSnap.forEach((child) => {
    if (!teamIds.has(String(child.key))) return;
    const msgSnap = child.child("messages").val();
    if (!msgSnap) return;
    total += countUnread(msgSnap, myId, seenMap[`group_${child.key}`] || 0);
  });

  customSnap.forEach((child) => {
    const group = child.val();
    if (!group || group.deleted || !group.participants?.[myId] || group.hiddenFor?.[myId]) return;
    total += countUnread(group.messages || {}, myId, seenMap[`custom-group_${child.key}`] || 0);
  });

  return total;
}

// Runs at the app shell level (not just inside TeamChat) so the sidebar
// badge stays live even when the user is on a completely different page —
// mirrors the pattern of Softphone.jsx staying mounted in the background
// for calls, just for a lightweight count instead of a whole UI.
export function useTeamChatUnreadCount(session) {
  const myId = session?.user?.id;
  const tenantId = session?.tenant?.id;
  const [count, setCount] = useState(0);
  const dirRef = useRef({ agentIds: new Set(), teamIds: new Set() });

  useEffect(() => {
    if (!myId || !tenantId) return undefined;
    let cancelled = false;
    const unsubs = [];

    api("/team-chat/firebase-token", { method: "POST" })
      .then(({ token }) => signInToFirebase(token))
      .then(() => api("/team-chat/directory"))
      .then((directory) => {
        if (cancelled) return;
        dirRef.current = {
          agentIds: new Set((directory.agents || []).map((a) => String(a.id))),
          teamIds: new Set((directory.teams || []).map((t) => String(t.id)))
        };

        const recompute = () => {
          computeCounts({ myId, tenantId, ...dirRef.current }).then((total) => {
            if (!cancelled) setCount(total);
          }).catch(() => undefined);
        };

        recompute();
        const directRef = ref(db, `tenants/${tenantId}/teamChats/`);
        const teamGroupRef = ref(db, `tenants/${tenantId}/teamGroupChats/`);
        const customRef = ref(db, `tenants/${tenantId}/customGroupChats/`);
        onValue(directRef, recompute);
        onValue(teamGroupRef, recompute);
        onValue(customRef, recompute);
        unsubs.push(
          () => off(directRef, "value", recompute),
          () => off(teamGroupRef, "value", recompute),
          () => off(customRef, "value", recompute)
        );

        const onRead = () => recompute();
        window.addEventListener(TEAM_CHAT_READ_EVENT, onRead);
        unsubs.push(() => window.removeEventListener(TEAM_CHAT_READ_EVENT, onRead));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
    };
  }, [myId, tenantId]);

  return count;
}
