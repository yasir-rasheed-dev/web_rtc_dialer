import { useCallback, useEffect, useRef, useState } from "react";

import { getFollowUpKpis } from "./leadsApi";
import { hasAny } from "./permissions";

// Unlike missed calls or voicemails, a follow-up becomes "missed" purely by
// time passing — there's no discrete server event to increment off of like
// call:ended/voicemail:new. So this polls the same /leads/follow-ups/kpis
// endpoint the Follow-ups dashboard itself uses, seeded on mount and then
// every 2 minutes, plus an exposed `refresh()` for right after a "Mark
// done" action so the sidebar badge doesn't wait for the next poll tick.
const POLL_MS = 120000;

export function useFollowUpsBadge(session) {
  const myId = session?.user?.id;
  const tenantId = session?.tenant?.id;
  const enabled = Boolean(session?.tenant?.canUseLeads) && hasAny(session, ["VIEW_LEADS"]);
  const [count, setCount] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(() => {
    if (!enabled) return;
    getFollowUpKpis()
      .then((kpis) => setCount(Number(kpis?.missed || 0)))
      .catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!myId || !tenantId || !enabled) {
      setCount(0);
      return undefined;
    }
    load();
    timerRef.current = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timerRef.current);
  }, [myId, tenantId, enabled, load]);

  return { count, refresh: load };
}
