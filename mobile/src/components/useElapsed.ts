import { useEffect, useState } from "react";

/** Live seconds since `since` (epoch ms). 0 when `since` is null. */
export function useElapsed(since: number | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!since) {
      setN(0);
      return;
    }
    const tick = () => setN(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return n;
}

export function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
