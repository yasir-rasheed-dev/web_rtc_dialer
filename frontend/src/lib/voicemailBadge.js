import { useCallback, useEffect, useState } from "react";

import { getVoicemailCounts } from "./api";
import { hasAny } from "./permissions";

// Sibling of missedCallsBadge.js's useMissedCallsBadge, same app-shell-level
// reasoning (tracks unheard voicemails even while the agent is on a
// different page) — but simpler: heard/unheard is real server state
// (voicemails.heard_at), not a client-side "seen" heuristic, so there's no
// localStorage bookkeeping here. Seed from GET /api/voicemails/counts,
// live-increment via the "voicemail:new" socket event (wired in App.jsx),
// live-decrement whenever the Voicemail tab actually marks one heard.
export function useVoicemailBadge(session) {
  const canView = hasAny(session, ["VIEW_VOICEMAILS"]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id || !canView) {
      setCount(0);
      return;
    }
    getVoicemailCounts()
      .then((result) => setCount(Math.max(0, result.unheard || 0)))
      .catch(() => undefined);
  }, [session?.user?.id, canView]);

  const recordNew = useCallback(() => {
    setCount((current) => current + 1);
  }, []);

  const markHeard = useCallback(() => {
    setCount((current) => Math.max(0, current - 1));
  }, []);

  return { count, recordNew, markHeard };
}
