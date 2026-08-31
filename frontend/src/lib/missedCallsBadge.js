import { useCallback, useEffect, useRef, useState } from "react";

import { getCallCounts } from "./api";
import { hasAny } from "./permissions";

// "Missed" here means the same thing GET /api/calls/counts and the Call
// Logs "Missed" tab both mean: an inbound call that ended without ever
// being answered (MISSED_CALL_SQL in server.js). This module doesn't own
// a socket subscription of its own — App.jsx already owns the one socket
// connection and already handles "call:ended" (to update liveCalls), so
// this just exposes a plain function for that existing handler to call
// into, rather than opening a second competing subscription to the same
// events.

const SEEN_KEY_PREFIX = "ringnex.missedCallsSeen.";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadSeen(userId) {
  try {
    const raw = localStorage.getItem(SEEN_KEY_PREFIX + userId);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.count === "number" ? parsed : { date: "", count: 0 };
  } catch {
    return { date: "", count: 0 };
  }
}

function saveSeen(userId, seen) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + userId, JSON.stringify(seen));
  } catch {
    // Private-mode/quota localStorage failures just mean the badge won't
    // persist across a reload — not worth failing anything over.
  }
}

// Runs at the app-shell level (same reasoning as useTeamChatUnreadCount)
// so the sidebar badge tracks missed inbound calls even while the agent
// is on a different page.
//
// Scope mirrors the backend's own callAccessScope in server.js: a plain
// agent (no VIEW_REPORTS/MONITOR_CALLS/MANAGE_AGENTS) only ever counts
// their own missed calls, everyone else counts tenant-wide. One disclosed
// simplification vs. the backend: a Supervisor's *initial* count below is
// correctly scoped to just their team (the /calls/counts request is
// agent-scoped server-side exactly like the Call Logs list is), but a
// Supervisor's *live* increments while the app is open are NOT re-scoped
// to their team specifically — they count any tenant-wide missed call,
// same as a full tenant-wide viewer. Replicating the supervisor
// team-membership lookup client-side for a live counter wasn't judged
// worth the added complexity; the count self-corrects on next page load.
export function useMissedCallsBadge(session) {
  const myId = session?.user?.id;
  const tenantId = session?.tenant?.id;
  const tenantWide = hasAny(session, ["VIEW_REPORTS", "MONITOR_CALLS", "MANAGE_AGENTS"]);
  const [count, setCount] = useState(0);
  const seenRef = useRef({ date: "", count: 0 });

  useEffect(() => {
    if (!myId || !tenantId) return;
    const seen = loadSeen(myId);
    seenRef.current = seen.date === todayStr() ? seen : { date: todayStr(), count: 0 };

    const params = { from: todayStr(), to: todayStr() };
    if (!tenantWide) params.agentId = myId;
    getCallCounts(params)
      .then((counts) => setCount(Math.max(0, (counts.missed || 0) - seenRef.current.count)))
      .catch(() => undefined);
    // Deliberately re-runs only when identity/scope changes, not on every
    // render — this is a one-time seed, live updates come via
    // recordCallEnded from App.jsx's existing socket handler instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, tenantId, tenantWide]);

  // Call this from the app's existing "call:ended" socket handler — see
  // App.jsx. `call` is the publicCall() payload from callTracker.js.
  // useCallback'd so it's referentially stable across renders (changes
  // only when identity/scope actually change) — that socket effect only
  // re-subscribes when `session` changes, so it needs a stable function
  // to close over rather than a fresh one every render.
  const recordCallEnded = useCallback(
    (call) => {
      if (!call || call.direction !== "INBOUND" || call.answeredAt) return;
      if (!tenantWide && call.agentUserId !== myId) return;
      setCount((current) => current + 1);
    },
    [tenantWide, myId]
  );

  // Call when the agent visits the Call Logs page — marks everything
  // missed *today* as seen, so the badge drops to 0 and only counts new
  // ones from here on (still resets naturally at local midnight via the
  // date check in the seed effect above).
  const markSeen = useCallback(() => {
    setCount((current) => {
      const totalToday = seenRef.current.count + current;
      seenRef.current = { date: todayStr(), count: totalToday };
      if (myId) saveSeen(myId, seenRef.current);
      return 0;
    });
  }, [myId]);

  return { count, recordCallEnded, markSeen };
}
